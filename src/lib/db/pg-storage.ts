import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, asc, desc, count } from 'drizzle-orm';
import * as schema from './schema-pg';
import type { StorageProvider, ConversationMeta, PaginatedMessages } from './storage';
import type { Conversation, Message, Settings, ActivityItem } from '@/types';

export async function createPgStorage(): Promise<StorageProvider> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required for PostgreSQL storage');
  }

  const client = postgres(connectionString);
  const db = drizzle(client, { schema });

  // Check if tables already exist before attempting creation
  const [{ exists }] = await client`
    SELECT EXISTS(
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'conversations'
    )
  `;

  if (!exists) {
    await client`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        activities JSONB DEFAULT '[]'
      )
    `;

    await client`
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp BIGINT NOT NULL,
        skill_invocations JSONB,
        is_automatic BOOLEAN DEFAULT false,
        sort_order INTEGER NOT NULL
      )
    `;

    await client`
      CREATE INDEX idx_messages_conversation
        ON messages(conversation_id, sort_order)
    `;

    await client`
      CREATE TABLE settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        openai_api_key TEXT NOT NULL DEFAULT '',
        openai_base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
        model TEXT NOT NULL DEFAULT 'gpt-4o',
        skills_dir TEXT NOT NULL DEFAULT '~/.claude/skills'
      )
    `;
  }

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
    const rows = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy(asc(schema.messages.sortOrder));
    return rows.map(rowToMessage);
  }

  const provider: StorageProvider = {
    async listConversations() {
      const rows = await db
        .select()
        .from(schema.conversations)
        .orderBy(desc(schema.conversations.updatedAt));

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

    async listConversationsMeta() {
      const rows = await db
        .select()
        .from(schema.conversations)
        .orderBy(desc(schema.conversations.updatedAt));

      const result: ConversationMeta[] = [];
      for (const row of rows) {
        // Get message count for this conversation
        const countResult = await db
          .select({ count: count() })
          .from(schema.messages)
          .where(eq(schema.messages.conversationId, row.id));

        result.push({
          id: row.id,
          title: row.title,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          activities: (row.activities as ActivityItem[]) ?? [],
          messageCount: countResult[0]?.count ?? 0,
        });
      }
      return result;
    },

    async getConversation(id) {
      const rows = await db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.id, id));

      const row = rows[0];
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
      await db.insert(schema.conversations).values({
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        activities: conv.activities ?? [],
      });

      if (conv.messages?.length) {
        for (let i = 0; i < conv.messages.length; i++) {
          const msg = conv.messages[i];
          await db.insert(schema.messages).values({
            id: msg.id,
            conversationId: conv.id,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            skillInvocations: msg.skillInvocations ?? null,
            isAutomatic: msg.isAutomatic ?? false,
            sortOrder: i,
          });
        }
      }

      return conv;
    },

    async updateConversation(conv) {
      await db.update(schema.conversations)
        .set({
          title: conv.title,
          updatedAt: conv.updatedAt,
          activities: conv.activities ?? [],
        })
        .where(eq(schema.conversations.id, conv.id));

      // Replace all messages
      await db.delete(schema.messages)
        .where(eq(schema.messages.conversationId, conv.id));

      if (conv.messages?.length) {
        for (let i = 0; i < conv.messages.length; i++) {
          const msg = conv.messages[i];
          await db.insert(schema.messages).values({
            id: msg.id,
            conversationId: conv.id,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            skillInvocations: msg.skillInvocations ?? null,
            isAutomatic: msg.isAutomatic ?? false,
            sortOrder: i,
          });
        }
      }

      return conv;
    },

    async deleteConversation(id) {
      await db.delete(schema.conversations)
        .where(eq(schema.conversations.id, id));
    },

    async addMessage(conversationId, message) {
      const lastRows = await db
        .select({ sortOrder: schema.messages.sortOrder })
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, conversationId))
        .orderBy(desc(schema.messages.sortOrder))
        .limit(1);

      const nextOrder = (lastRows[0]?.sortOrder ?? -1) + 1;

      await db.insert(schema.messages).values({
        id: message.id,
        conversationId,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
        skillInvocations: message.skillInvocations ?? null,
        isAutomatic: message.isAutomatic ?? false,
        sortOrder: nextOrder,
      });

      await db.update(schema.conversations)
        .set({ updatedAt: Date.now() })
        .where(eq(schema.conversations.id, conversationId));
    },

    async updateMessage(conversationId, message) {
      await db.update(schema.messages)
        .set({
          content: message.content,
          skillInvocations: message.skillInvocations ?? null,
          isAutomatic: message.isAutomatic ?? false,
        })
        .where(eq(schema.messages.id, message.id));

      await db.update(schema.conversations)
        .set({ updatedAt: Date.now() })
        .where(eq(schema.conversations.id, conversationId));
    },

    async getMessages(conversationId, page, limit): Promise<PaginatedMessages> {
      // Get total count
      const countResult = await db
        .select({ count: count() })
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, conversationId));

      const total = countResult[0]?.count ?? 0;

      // Calculate offset
      const offset = (page - 1) * limit;

      // Get messages sorted by sort_order DESC (newest first for pagination)
      const rows = await db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, conversationId))
        .orderBy(desc(schema.messages.sortOrder))
        .limit(limit)
        .offset(offset);

      // Reverse to get chronological order within the page
      const messages = rows.reverse().map(rowToMessage);

      return {
        messages,
        total,
        hasMore: offset + rows.length < total,
      };
    },

    async addActivity(conversationId, activity) {
      const rows = await db
        .select({ activities: schema.conversations.activities })
        .from(schema.conversations)
        .where(eq(schema.conversations.id, conversationId));

      const current = (rows[0]?.activities as ActivityItem[]) ?? [];
      current.push(activity);

      await db.update(schema.conversations)
        .set({ activities: current })
        .where(eq(schema.conversations.id, conversationId));
    },

    async clearActivities(conversationId) {
      await db.update(schema.conversations)
        .set({ activities: [] })
        .where(eq(schema.conversations.id, conversationId));
    },

    async getSettings() {
      const rows = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.id, 'default'));

      const row = rows[0];
      if (!row) return null;

      return {
        openaiApiKey: row.openaiApiKey,
        openaiBaseUrl: row.openaiBaseUrl,
        model: row.model,
        skillsDir: row.skillsDir,
      };
    },

    async saveSettings(s) {
      const rows = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.id, 'default'));

      if (rows.length > 0) {
        await db.update(schema.settings)
          .set({
            openaiApiKey: s.openaiApiKey,
            openaiBaseUrl: s.openaiBaseUrl,
            model: s.model,
            skillsDir: s.skillsDir,
          })
          .where(eq(schema.settings.id, 'default'));
      } else {
        await db.insert(schema.settings).values({
          id: 'default',
          openaiApiKey: s.openaiApiKey,
          openaiBaseUrl: s.openaiBaseUrl,
          model: s.model,
          skillsDir: s.skillsDir,
        });
      }

      return s;
    },
  };

  return provider;
}
