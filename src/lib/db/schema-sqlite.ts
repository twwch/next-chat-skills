import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import type { ActivityItem, SkillInvocation } from '@/types';

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  activities: text('activities', { mode: 'json' }).$type<ActivityItem[]>().default([]),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  timestamp: integer('timestamp').notNull(),
  skillInvocations: text('skill_invocations', { mode: 'json' }).$type<SkillInvocation[] | null>(),
  isAutomatic: integer('is_automatic', { mode: 'boolean' }).default(false),
  sortOrder: integer('sort_order').notNull(),
});

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey().default('default'),
  openaiApiKey: text('openai_api_key').notNull().default(''),
  openaiBaseUrl: text('openai_base_url').notNull().default('https://api.openai.com/v1'),
  model: text('model').notNull().default('gpt-4o'),
  skillsDir: text('skills_dir').notNull().default('~/.claude/skills'),
});
