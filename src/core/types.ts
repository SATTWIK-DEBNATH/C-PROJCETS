/**
 * Fintech Core Type Definitions
 * 
 * In financial software, clarity of types and strict constraints
 * prevent multi-million-dollar accounting discrepancies.
 */

export type Currency = 'USD' | 'EUR' | 'GBP' | 'INR' | 'JPY';

/**
 * The 5 Fundamental Chart of Accounts (COA) Categories:
 * 
 * - ASSET: What the institution owns (Normal Balance: DEBIT)
 * - LIABILITY: What the institution owes (e.g. Customer Deposits) (Normal Balance: CREDIT)
 * - EQUITY: Net worth / Capital reserves (Normal Balance: CREDIT)
 * - REVENUE: Income earned (fees, interest spread) (Normal Balance: CREDIT)
 * - EXPENSE: Costs incurred (fees paid, infra, losses) (Normal Balance: DEBIT)
 */
export type AccountCategory = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export type PostingDirection = 'DEBIT' | 'CREDIT';

export interface CurrencyConfig {
  code: Currency;
  minorUnit: number; // Decimal places (USD = 2, JPY = 0, BHD = 3)
  symbol: string;
  name: string;
}

export interface Account {
  id: string;
  accountNumber: string;
  name: string;
  category: AccountCategory;
  currency: Currency;
  isSystemAccount: boolean; // e.g., Cash Vault, Revenue, Clearing
  userId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Posting {
  id: string;
  entryId: string;
  accountId: string;
  direction: PostingDirection;
  amount: bigint; // Stored in minor units (e.g., $10.50 -> 1050n cents)
  currency: Currency;
  createdAt: string;
}

export type EntryStatus = 'PENDING' | 'POSTED' | 'REVERSED';

export interface JournalEntry {
  id: string;
  idempotencyKey?: string | null;
  reference: string;
  description: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'P2P_TRANSFER' | 'FX_EXCHANGE' | 'FEE' | 'REVERSAL';
  status: EntryStatus;
  postings: Posting[];
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface AccountBalance {
  accountId: string;
  currency: Currency;
  debitSum: bigint;
  creditSum: bigint;
  netBalance: bigint; // Evaluated according to Normal Balance convention
  formattedBalance: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  status: 'ACTIVE' | 'FLAGGED' | 'FROZEN';
  tier: 'STANDARD' | 'PREMIUM' | 'ENTERPRISE';
  createdAt: string;
}

export interface FraudAlert {
  id: string;
  userId?: string;
  entryId?: string;
  ruleCode: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
  status: 'FLAGGED' | 'INVESTIGATING' | 'DISMISSED' | 'CONFIRMED';
  createdAt: string;
}
