import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, asc, desc } from 'drizzle-orm';
import * as schema from './schema-sqlite';
import type { StorageProvider } from './storage';
import type { Conversation, Message, Settings, ActivityItem } from '@/types';
import path from 'path';
import fs from 'fs';

export async function createSqliteStorage(): Promise<StorageProvider> {
  const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'chat-skills.db');

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      activities TEXT DEFAULT '[]'
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      skill_invocations TEXT,
      is_automatic INTEGER DEFAULT 0,
      sort_order INTEGER NOT NULL
    )
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, sort_order)
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      openai_api_key TEXT NOT NULL DEFAULT '',
      openai_base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
      model TEXT NOT NULL DEFAULT 'gpt-4o',
      skills_dir TEXT NOT NULL DEFAULT '~/.claude/skills'
    )
  `);

  const db = drizzle(sqlite, { schema });

  function rowToMessage(row: typeof schema.messages.$inferSelect): Message {
    return {
      id: row.id,
      role: row.role as Message['role'],
      content: row.content,
      timestamp: row.timestamp,
      skillInvocations: row.skillInvocations ?? undefined,
      isAutomatic: row.isAutomatic ?? undefined,
    };
  }

  async function loadMessages(conversationId: string): Promise<Message[]> {
    const rows = db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy(asc(schema.messages.sortOrder))
      .all();
    return rows.map(rowToMessage);
  }

  const provider: StorageProvider = {
    async listConversations() {
      const rows = db
        .select()
        .from(schema.conversations)
        .orderBy(desc(schema.conversations.updatedAt))
        .all();

      const result: Conversation[] = [];
      for (const row of rows) {
        const msgs = await loadMessages(row.id);
        result.push({
          id: row.id,
          title: row.title,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          messages: msgs,
          activities: (row.activities as ActivityItem[]) ?? [],
        });
      }
      return result;
    },

    async getConversation(id) {
      const row = db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.id, id))
        .get();

      if (!row) return null;

      const msgs = await loadMessages(id);
      return {
        id: row.id,
        title: row.title,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        messages: msgs,
        activities: (row.activities as ActivityItem[]) ?? [],
      };
    },

    async createConversation(conv) {
      db.insert(schema.conversations).values({
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        activities: conv.activities ?? [],
      }).run();

      if (conv.messages?.length) {
        for (let i = 0; i < conv.messages.length; i++) {
          const msg = conv.messages[i];
          db.insert(schema.messages).values({
            id: msg.id,
            conversationId: conv.id,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            skillInvocations: msg.skillInvocations ?? null,
            isAutomatic: msg.isAutomatic ?? false,
            sortOrder: i,
          }).run();
        }
      }

      return conv;
    },

    async updateConversation(conv) {
      db.update(schema.conversations)
        .set({
          title: conv.title,
          updatedAt: conv.updatedAt,
          activities: conv.activities ?? [],
        })
        .where(eq(schema.conversations.id, conv.id))
        .run();

      // Replace all messages: delete existing and re-insert
      db.delete(schema.messages)
        .where(eq(schema.messages.conversationId, conv.id))
        .run();

      if (conv.messages?.length) {
        for (let i = 0; i < conv.messages.length; i++) {
          const msg = conv.messages[i];
          db.insert(schema.messages).values({
            id: msg.id,
            conversationId: conv.id,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            skillInvocations: msg.skillInvocations ?? null,
            isAutomatic: msg.isAutomatic ?? false,
            sortOrder: i,
          }).run();
        }
      }

      return conv;
    },

    async deleteConversation(id) {
      db.delete(schema.conversations)
        .where(eq(schema.conversations.id, id))
        .run();
    },

    async addMessage(conversationId, message) {
      // Get current max sort_order
      const last = db
        .select({ sortOrder: schema.messages.sortOrder })
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, conversationId))
        .orderBy(desc(schema.messages.sortOrder))
        .limit(1)
        .get();

      const nextOrder = (last?.sortOrder ?? -1) + 1;

      db.insert(schema.messages).values({
        id: message.id,
        conversationId,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
        skillInvocations: message.skillInvocations ?? null,
        isAutomatic: message.isAutomatic ?? false,
        sortOrder: nextOrder,
      }).run();

      db.update(schema.conversations)
        .set({ updatedAt: Date.now() })
        .where(eq(schema.conversations.id, conversationId))
        .run();
    },

    async updateMessage(conversationId, message) {
      db.update(schema.messages)
        .set({
          content: message.content,
          skillInvocations: message.skillInvocations ?? null,
          isAutomatic: message.isAutomatic ?? false,
        })
        .where(eq(schema.messages.id, message.id))
        .run();

      db.update(schema.conversations)
        .set({ updatedAt: Date.now() })
        .where(eq(schema.conversations.id, conversationId))
        .run();
    },

    async addActivity(conversationId, activity) {
      const row = db
        .select({ activities: schema.conversations.activities })
        .from(schema.conversations)
        .where(eq(schema.conversations.id, conversationId))
        .get();

      const current = (row?.activities as ActivityItem[]) ?? [];
      current.push(activity);

      db.update(schema.conversations)
        .set({ activities: current })
        .where(eq(schema.conversations.id, conversationId))
        .run();
    },

    async clearActivities(conversationId) {
      db.update(schema.conversations)
        .set({ activities: [] })
        .where(eq(schema.conversations.id, conversationId))
        .run();
    },

    async getSettings() {
      const row = db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.id, 'default'))
        .get();

      if (!row) return null;

      return {
        openaiApiKey: row.openaiApiKey,
        openaiBaseUrl: row.openaiBaseUrl,
        model: row.model,
        skillsDir: row.skillsDir,
      };
    },

    async saveSettings(s) {
      const existing = db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.id, 'default'))
        .get();

      if (existing) {
        db.update(schema.settings)
          .set({
            openaiApiKey: s.openaiApiKey,
            openaiBaseUrl: s.openaiBaseUrl,
            model: s.model,
            skillsDir: s.skillsDir,
          })
          .where(eq(schema.settings.id, 'default'))
          .run();
      } else {
        db.insert(schema.settings).values({
          id: 'default',
          openaiApiKey: s.openaiApiKey,
          openaiBaseUrl: s.openaiBaseUrl,
          model: s.model,
          skillsDir: s.skillsDir,
        }).run();
      }

      return s;
    },
  };

  return provider;
}
