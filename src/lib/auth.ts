import NextAuth from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import postgres from 'postgres';
import Database from 'better-sqlite3';
import * as schemaPg from './db/schema-pg';
import * as schemaSqlite from './db/schema-sqlite';
import type { Adapter } from 'next-auth/adapters';
import { authConfig } from './auth.config';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

// Ensure auth tables exist in PostgreSQL
async function ensurePgAuthTables(client: ReturnType<typeof postgres>) {
  // Check if users table exists
  const [{ exists }] = await client`
    SELECT EXISTS(
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    )
  `;

  if (!exists) {
    await client`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        email_verified TIMESTAMP,
        image TEXT,
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
        updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
      )
    `;

    await client`
      CREATE TABLE accounts (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_account_id TEXT NOT NULL,
        refresh_token TEXT,
        access_token TEXT,
        expires_at INTEGER,
        token_type TEXT,
        scope TEXT,
        id_token TEXT,
        session_state TEXT,
        PRIMARY KEY (provider, provider_account_id)
      )
    `;

    await client`
      CREATE TABLE sessions (
        session_token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires TIMESTAMP NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
      )
    `;

    await client`
      CREATE TABLE verification_tokens (
        identifier TEXT NOT NULL,
        token TEXT NOT NULL,
        expires TIMESTAMP NOT NULL,
        PRIMARY KEY (identifier, token)
      )
    `;
  }
}

// Ensure auth tables exist in SQLite
function ensureSqliteAuthTables(sqlite: InstanceType<typeof Database>) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      email_verified INTEGER,
      image TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      refresh_token TEXT,
      access_token TEXT,
      expires_at INTEGER,
      token_type TEXT,
      scope TEXT,
      id_token TEXT,
      session_state TEXT,
      PRIMARY KEY (provider, provider_account_id)
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS verification_tokens (
      identifier TEXT NOT NULL,
      token TEXT NOT NULL,
      expires INTEGER NOT NULL,
      PRIMARY KEY (identifier, token)
    )
  `);
}

// Synchronous adapter initialization for NextAuth config
function getAdapter(): Adapter {
  const storageType = (process.env.STORAGE_TYPE || 'sqlite').toLowerCase();

  if (storageType === 'postgresql' || storageType === 'postgres') {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required for PostgreSQL storage');
    }
    const client = postgres(connectionString);

    // Schedule table creation (non-blocking)
    ensurePgAuthTables(client).catch(console.error);

    const db = drizzlePg(client, { schema: schemaPg });

    return DrizzleAdapter(db, {
      usersTable: schemaPg.users,
      accountsTable: schemaPg.accounts,
      sessionsTable: schemaPg.sessions,
      verificationTokensTable: schemaPg.verificationTokens,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
  } else {
    const dbPath = process.env.SQLITE_PATH || './data/chat-skills.db';

    // Ensure directory exists before creating database
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    const sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    // Ensure tables exist (synchronous for SQLite)
    ensureSqliteAuthTables(sqlite);

    const db = drizzleSqlite(sqlite, { schema: schemaSqlite });

    return DrizzleAdapter(db, {
      usersTable: schemaSqlite.users,
      accountsTable: schemaSqlite.accounts,
      sessionsTable: schemaSqlite.sessions,
      verificationTokensTable: schemaSqlite.verificationTokens,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: getAdapter(),
});
