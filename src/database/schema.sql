-- Fintech Core Banking & Double-Entry Ledger Schema

-- 1. Users table (Bank Customers & Business Entities)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  fullName TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'FLAGGED', 'FROZEN'
  tier TEXT NOT NULL DEFAULT 'STANDARD', -- 'STANDARD', 'PREMIUM', 'ENTERPRISE'
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Chart of Accounts
-- Normal Balances:
-- ASSET: DEBIT
-- LIABILITY: CREDIT (e.g. customer deposit accounts)
-- EQUITY: CREDIT
-- REVENUE: CREDIT (e.g. interchange and wire fee accounts)
-- EXPENSE: DEBIT (e.g. cloud costs, processing fees)
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  accountNumber TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
  currency TEXT NOT NULL CHECK(currency IN ('USD', 'EUR', 'GBP', 'INR', 'JPY')),
  isSystemAccount INTEGER NOT NULL DEFAULT 0,
  userId TEXT REFERENCES users(id) ON DELETE CASCADE,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_accounts_userId ON accounts(userId);
CREATE INDEX IF NOT EXISTS idx_accounts_currency ON accounts(currency);

-- 3. Journal Entries (The transaction headers)
CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  idempotencyKey TEXT UNIQUE,
  reference TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('DEPOSIT', 'WITHDRAWAL', 'P2P_TRANSFER', 'FX_EXCHANGE', 'FEE', 'REVERSAL')),
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK(status IN ('PENDING', 'POSTED', 'REVERSED')),
  metadata TEXT, -- JSON blob
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_idempotency ON journal_entries(idempotencyKey);
CREATE INDEX IF NOT EXISTS idx_journal_entries_createdAt ON journal_entries(createdAt);

-- 4. Postings (The atomic debit and credit lines)
-- RULE: Every entry must have SUM(debit) == SUM(credit)
-- Amounts are stored as integer minor units (e.g., $100.00 = 10000)
CREATE TABLE IF NOT EXISTS postings (
  id TEXT PRIMARY KEY,
  entryId TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  accountId TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK(direction IN ('DEBIT', 'CREDIT')),
  amount INTEGER NOT NULL CHECK(amount > 0),
  currency TEXT NOT NULL CHECK(currency IN ('USD', 'EUR', 'GBP', 'INR', 'JPY')),
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_postings_entryId ON postings(entryId);
CREATE INDEX IF NOT EXISTS idx_postings_accountId ON postings(accountId);
CREATE INDEX IF NOT EXISTS idx_postings_accountId_direction ON postings(accountId, direction);

-- 5. Idempotency Records (Guaranteeing Exactly-Once Execution)
CREATE TABLE IF NOT EXISTS idempotency_records (
  key TEXT PRIMARY KEY,
  requestHash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  responseStatus INTEGER,
  responseBody TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 6. Fraud & Risk Alerts
CREATE TABLE IF NOT EXISTS fraud_alerts (
  id TEXT PRIMARY KEY,
  userId TEXT REFERENCES users(id),
  entryId TEXT REFERENCES journal_entries(id),
  ruleCode TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'FLAGGED' CHECK(status IN ('FLAGGED', 'INVESTIGATING', 'DISMISSED', 'CONFIRMED')),
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fraud_alerts_userId ON fraud_alerts(userId);
