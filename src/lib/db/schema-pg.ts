import { pgTable, text, bigint, integer, boolean, jsonb, primaryKey, timestamp } from 'drizzle-orm/pg-core';
import type { ActivityItem, SkillInvocation, FileBlockData } from '@/types';
import type { AdapterAccountType } from 'next-auth/adapters';

// Auth.js tables (follow drizzle-adapter expected schema)
export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  createdAt: bigint('created_at', { mode: 'number' }).$defaultFn(() => Date.now()),
  updatedAt: bigint('updated_at', { mode: 'number' }).$defaultFn(() => Date.now()),
});

export const accounts = pgTable('accounts', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').$type<AdapterAccountType>().notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, (account) => [
  primaryKey({ columns: [account.provider, account.providerAccountId] }),
]);

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: bigint('created_at', { mode: 'number' }).$defaultFn(() => Date.now()),
});

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
}, (verificationToken) => [
  primaryKey({ columns: [verificationToken.identifier, verificationToken.token] }),
]);

// Application tables
export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
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
  fileBlocks: jsonb('file_blocks').$type<FileBlockData[] | null>(),
  isAutomatic: boolean('is_automatic').default(false),
  sortOrder: integer('sort_order').notNull(),
});

export const settings = pgTable('settings', {
  id: text('id').primaryKey().default('default'),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  openaiApiKey: text('openai_api_key').notNull().default(''),
  openaiBaseUrl: text('openai_base_url').notNull().default('https://api.openai.com/v1'),
  model: text('model').notNull().default('gpt-4o'),
  skillsDir: text('skills_dir').notNull().default('~/.claude/skills'),
});
