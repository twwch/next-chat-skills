/**
 * Database migrations - single source of truth for table schemas
 */

// SQLite table creation SQL
export const sqliteMigrations = {
  // Auth tables
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      email_verified INTEGER,
      image TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `,
  accounts: `
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
  `,
  sessions: `
    CREATE TABLE IF NOT EXISTS sessions (
      session_token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `,
  verificationTokens: `
    CREATE TABLE IF NOT EXISTS verification_tokens (
      identifier TEXT NOT NULL,
      token TEXT NOT NULL,
      expires INTEGER NOT NULL,
      PRIMARY KEY (identifier, token)
    )
  `,
  // Application tables
  conversations: `
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      user_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      activities TEXT DEFAULT '[]'
    )
  `,
  messages: `
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      skill_invocations TEXT,
      file_blocks TEXT,
      is_automatic INTEGER DEFAULT 0,
      sort_order INTEGER NOT NULL
    )
  `,
  settings: `
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      user_id TEXT,
      openai_api_key TEXT NOT NULL DEFAULT '',
      openai_base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
      model TEXT NOT NULL DEFAULT 'gpt-4o',
      skills_dir TEXT NOT NULL DEFAULT '~/.claude/skills'
    )
  `,
  // Indexes
  indexes: [
    'CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, sort_order)',
    'CREATE INDEX IF NOT EXISTS idx_settings_user ON settings(user_id)',
  ],
};

// PostgreSQL table creation SQL
export const postgresqlMigrations = {
  // Auth tables
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      email_verified TIMESTAMP,
      image TEXT,
      created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
      updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
    )
  `,
  accounts: `
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
  `,
  sessions: `
    CREATE TABLE IF NOT EXISTS sessions (
      session_token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires TIMESTAMP NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
    )
  `,
  verificationTokens: `
    CREATE TABLE IF NOT EXISTS verification_tokens (
      identifier TEXT NOT NULL,
      token TEXT NOT NULL,
      expires TIMESTAMP NOT NULL,
      PRIMARY KEY (identifier, token)
    )
  `,
  // Application tables
  conversations: `
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      user_id TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      activities JSONB DEFAULT '[]'
    )
  `,
  messages: `
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp BIGINT NOT NULL,
      skill_invocations JSONB,
      file_blocks JSONB,
      is_automatic BOOLEAN DEFAULT false,
      sort_order INTEGER NOT NULL
    )
  `,
  settings: `
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      user_id TEXT,
      openai_api_key TEXT NOT NULL DEFAULT '',
      openai_base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
      model TEXT NOT NULL DEFAULT 'gpt-4o',
      skills_dir TEXT NOT NULL DEFAULT '~/.claude/skills'
    )
  `,
  // Indexes
  indexes: [
    'CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, sort_order)',
    'CREATE INDEX IF NOT EXISTS idx_settings_user ON settings(user_id)',
  ],
};
