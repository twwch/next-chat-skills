import { pgTable, text, bigint, integer, boolean, jsonb } from 'drizzle-orm/pg-core';
import type { ActivityItem, SkillInvocation } from '@/types';

export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  activities: jsonb('activities').$type<ActivityItem[]>().default([]),
});

export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
  skillInvocations: jsonb('skill_invocations').$type<SkillInvocation[] | null>(),
  isAutomatic: boolean('is_automatic').default(false),
  sortOrder: integer('sort_order').notNull(),
});

export const settings = pgTable('settings', {
  id: text('id').primaryKey().default('default'),
  openaiApiKey: text('openai_api_key').notNull().default(''),
  openaiBaseUrl: text('openai_base_url').notNull().default('https://api.openai.com/v1'),
  model: text('model').notNull().default('gpt-4o'),
  skillsDir: text('skills_dir').notNull().default('~/.claude/skills'),
});
