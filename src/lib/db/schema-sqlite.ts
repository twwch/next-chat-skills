import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import type { ActivityItem, SkillInvocation, FileBlockData } from '@/types';
import type { AdapterAccountType } from 'next-auth/adapters';

// Auth.js tables (follow drizzle-adapter expected schema)
// SQLite uses integer for timestamps, with mode: 'timestamp' for Date conversion
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: integer('email_verified', { mode: 'timestamp' }),
  image: text('image'),
  createdAt: integer('created_at').$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').$defaultFn(() => Date.now()),
});

export const accounts = sqliteTable('accounts', {
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

export const sessions = sqliteTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: integer('expires', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at').$defaultFn(() => Date.now()),
});

export const verificationTokens = sqliteTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: integer('expires', { mode: 'timestamp' }).notNull(),
}, (verificationToken) => [
  primaryKey({ columns: [verificationToken.identifier, verificationToken.token] }),
]);

// Application tables
// Note: user_id has no foreign key to allow fingerprint-based anonymous users
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  userId: text('user_id'),
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
  fileBlocks: text('file_blocks', { mode: 'json' }).$type<FileBlockData[] | null>(),
  isAutomatic: integer('is_automatic', { mode: 'boolean' }).default(false),
  sortOrder: integer('sort_order').notNull(),
});

// Note: user_id has no foreign key to allow fingerprint-based anonymous users
export const settings = sqliteTable('settings', {
  id: text('id').primaryKey().default('default'),
  userId: text('user_id'),
  openaiApiKey: text('openai_api_key').notNull().default(''),
  openaiBaseUrl: text('openai_base_url').notNull().default('https://api.openai.com/v1'),
  model: text('model').notNull().default('gpt-4o'),
  skillsDir: text('skills_dir').notNull().default('~/.claude/skills'),
});
