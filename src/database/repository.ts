import crypto from 'node:crypto';
import { db, runInTransaction } from './db.js';
import { 
  Account, 
  AccountBalance, 
  AccountCategory, 
  Currency, 
  JournalEntry, 
  Posting, 
  User, 
  FraudAlert 
} from '../core/types.js';
import { LedgerEngine, UnvalidatedPosting } from '../core/ledger.js';
import { Money } from '../core/money.js';

export class FintechRepository {
  /**
   * User Management
   */
  static createUser(fullName: string, email: string, tier: 'STANDARD' | 'PREMIUM' | 'ENTERPRISE' = 'STANDARD'): User {
    const id = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO users (id, email, fullName, status, tier, createdAt)
      VALUES (?, ?, ?, 'ACTIVE', ?, ?)
    `);

    stmt.run(id, email, fullName, tier, now);
    return this.getUserById(id)!;
  }

  static getUserById(id: string): User | null {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!row) return null;
    return row as User;
  }

  static getAllUsers(): User[] {
    return db.prepare('SELECT * FROM users ORDER BY createdAt DESC').all() as User[];
  }

  /**
   * Account Management
   */
  static createAccount(
    name: string,
    category: AccountCategory,
    currency: Currency,
    options: { userId?: string; isSystemAccount?: boolean } = {}
  ): Account {
    const id = `acc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    // Generate realistic IBAN / Routing Account Number: e.g. AURA-USD-84920491
    const randDigits = Math.floor(10000000 + Math.random() * 90000000);
    const accountNumber = `AURA-${currency}-${randDigits}`;
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO accounts (id, accountNumber, name, category, currency, isSystemAccount, userId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      accountNumber,
      name,
      category,
      currency,
      options.isSystemAccount ? 1 : 0,
      options.userId || null,
      now
    );

    return this.getAccountById(id)!;
  }

  static getAccountById(id: string): Account | null {
    const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      ...row,
      isSystemAccount: Boolean(row.isSystemAccount)
    };
  }

  static getAccountsByUserId(userId: string): Account[] {
    const rows = db.prepare('SELECT * FROM accounts WHERE userId = ? ORDER BY currency ASC').all(userId) as any[];
    return rows.map(r => ({ ...r, isSystemAccount: Boolean(r.isSystemAccount) }));
  }

  static getAllAccounts(): Account[] {
    const rows = db.prepare('SELECT * FROM accounts ORDER BY isSystemAccount DESC, name ASC').all() as any[];
    return rows.map(r => ({ ...r, isSystemAccount: Boolean(r.isSystemAccount) }));
  }

  static getSystemAccount(name: string, currency: Currency): Account | null {
    const row = db.prepare(`
      SELECT * FROM accounts 
      WHERE isSystemAccount = 1 AND name = ? AND currency = ?
    `).get(name, currency) as any;
    if (!row) return null;
    return { ...row, isSystemAccount: true };
  }

  /**
   * Balance Evaluation using Double-Entry Postings
   */
  static getAccountBalance(accountId: string): AccountBalance {
    const account = this.getAccountById(accountId);
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    const row = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END), 0) as debitSum,
        COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END), 0) as creditSum
      FROM postings
      WHERE accountId = ?
    `).get(accountId) as { debitSum: number; creditSum: number };

    const debitSum = BigInt(row.debitSum);
    const creditSum = BigInt(row.creditSum);

    let netBalance: bigint;
    if (account.category === 'ASSET' || account.category === 'EXPENSE') {
      netBalance = debitSum - creditSum;
    } else {
      // LIABILITY, EQUITY, REVENUE
      netBalance = creditSum - debitSum;
    }

    const money = new Money(netBalance, account.currency);

    return {
      accountId: account.id,
      currency: account.currency,
      debitSum,
      creditSum,
      netBalance,
      formattedBalance: money.format()
    };
  }

  /**
   * Double-Entry Journal Entry Committer (ACID Protected)
   */
  static commitJournalEntry(params: {
    reference: string;
    description: string;
    type: 'DEPOSIT' | 'WITHDRAWAL' | 'P2P_TRANSFER' | 'FX_EXCHANGE' | 'FEE' | 'REVERSAL';
    postings: UnvalidatedPosting[];
    idempotencyKey?: string | null;
    metadata?: Record<string, any>;
  }): JournalEntry {
    // 1. Strict mathematical balance validation
    LedgerEngine.validateEntry(params.postings);

    return runInTransaction(() => {
      // If idempotencyKey is provided, check if already recorded
      if (params.idempotencyKey) {
        const existing = db.prepare('SELECT * FROM journal_entries WHERE idempotencyKey = ?').get(params.idempotencyKey) as any;
        if (existing) {
          return this.getJournalEntryById(existing.id)!;
        }
      }

      const entryId = `entry_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const now = new Date().toISOString();

      // Insert Journal Entry Header
      db.prepare(`
        INSERT INTO journal_entries (id, idempotencyKey, reference, description, type, status, metadata, createdAt)
        VALUES (?, ?, ?, ?, ?, 'POSTED', ?, ?)
      `).run(
        entryId,
        params.idempotencyKey || null,
        params.reference,
        params.description,
        params.type,
        params.metadata ? JSON.stringify(params.metadata) : null,
        now
      );

      // Insert all atomic postings
      const insertPostingStmt = db.prepare(`
        INSERT INTO postings (id, entryId, accountId, direction, amount, currency, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const p of params.postings) {
        const postingId = `post_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        insertPostingStmt.run(
          postingId,
          entryId,
          p.accountId,
          p.direction,
          Number(p.amount), // SQLite stores integer
          p.currency,
          now
        );
      }

      return this.getJournalEntryById(entryId)!;
    });
  }

  static getJournalEntryById(id: string): JournalEntry | null {
    const row = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(id) as any;
    if (!row) return null;

    const postingRows = db.prepare('SELECT * FROM postings WHERE entryId = ?').all(id) as any[];
    const postings: Posting[] = postingRows.map(p => ({
      ...p,
      amount: BigInt(p.amount)
    }));

    return {
      ...row,
      postings,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }

  static getJournalEntries(limit = 50): JournalEntry[] {
    const rows = db.prepare('SELECT * FROM journal_entries ORDER BY createdAt DESC LIMIT ?').all(limit) as any[];
    return rows.map(r => {
      const postingRows = db.prepare('SELECT * FROM postings WHERE entryId = ?').all(r.id) as any[];
      return {
        ...r,
        postings: postingRows.map(p => ({ ...p, amount: BigInt(p.amount) })),
        metadata: r.metadata ? JSON.parse(r.metadata) : undefined
      };
    });
  }

  static getAccountStatement(accountId: string, limit = 50): Posting[] {
    const rows = db.prepare(`
      SELECT p.*, e.reference, e.description, e.type as entryType
      FROM postings p
      JOIN journal_entries e ON p.entryId = e.id
      WHERE p.accountId = ?
      ORDER BY p.createdAt DESC
      LIMIT ?
    `).all(accountId, limit) as any[];

    return rows.map(p => ({
      ...p,
      amount: BigInt(p.amount)
    }));
  }

  /**
   * Fraud Alerts
   */
  static createFraudAlert(alert: Omit<FraudAlert, 'id' | 'createdAt'>): FraudAlert {
    const id = `alert_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO fraud_alerts (id, userId, entryId, ruleCode, severity, reason, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      alert.userId || null,
      alert.entryId || null,
      alert.ruleCode,
      alert.severity,
      alert.reason,
      alert.status,
      now
    );

    return db.prepare('SELECT * FROM fraud_alerts WHERE id = ?').get(id) as FraudAlert;
  }

  static getFraudAlerts(limit = 20): FraudAlert[] {
    return db.prepare('SELECT * FROM fraud_alerts ORDER BY createdAt DESC LIMIT ?').all(limit) as FraudAlert[];
  }
}
