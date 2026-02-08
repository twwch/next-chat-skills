import NextAuth from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import postgres from 'postgres';
import Database from 'better-sqlite3';
import * as schemaPg from './db/schema-pg';
import * as schemaSqlite from './db/schema-sqlite';
import { postgresqlMigrations, sqliteMigrations } from './db/migrations';
import type { Adapter } from 'next-auth/adapters';
import { authConfig } from './auth.config';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

// Ensure all tables exist in PostgreSQL (using centralized migrations)
async function ensurePgTables(client: ReturnType<typeof postgres>) {
  // Create all tables using centralized migrations
  await client.unsafe(postgresqlMigrations.users);
  await client.unsafe(postgresqlMigrations.accounts);
  await client.unsafe(postgresqlMigrations.sessions);
  await client.unsafe(postgresqlMigrations.verificationTokens);
  await client.unsafe(postgresqlMigrations.conversations);
  await client.unsafe(postgresqlMigrations.messages);
  await client.unsafe(postgresqlMigrations.settings);

  // Create indexes
  for (const indexSql of postgresqlMigrations.indexes) {
    await client.unsafe(indexSql);
  }
}

// Ensure all tables exist in SQLite (using centralized migrations)
function ensureSqliteTables(sqlite: InstanceType<typeof Database>) {
  sqlite.exec(sqliteMigrations.users);
  sqlite.exec(sqliteMigrations.accounts);
  sqlite.exec(sqliteMigrations.sessions);
  sqlite.exec(sqliteMigrations.verificationTokens);
  sqlite.exec(sqliteMigrations.conversations);
  sqlite.exec(sqliteMigrations.messages);
  sqlite.exec(sqliteMigrations.settings);

  // Create indexes
  for (const indexSql of sqliteMigrations.indexes) {
    sqlite.exec(indexSql);
  }
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
    ensurePgTables(client).catch(console.error);

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
    ensureSqliteTables(sqlite);

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
