import { 
  JournalEntry, 
  Posting, 
  PostingDirection, 
  Account, 
  AccountBalance, 
  AccountCategory,
  Currency 
} from './types.js';
import { Money } from './money.js';

export interface UnvalidatedPosting {
  accountId: string;
  direction: PostingDirection;
  amount: bigint;
  currency: Currency;
}

export class LedgerEngine {
  /**
   * Validates the core Double-Entry invariant:
   * SUM(Debits) === SUM(Credits) per currency group.
   * 
   * Throws an error if any invariant is broken.
   */
  static validateEntry(postings: UnvalidatedPosting[]): void {
    if (!postings || postings.length < 2) {
      throw new Error('[Ledger Invariant Violation] A valid double-entry transaction must have at least 2 postings.');
    }

    // Group debits and credits by currency
    const currencyTotals = new Map<Currency, { debits: bigint; credits: bigint }>();

    for (const posting of postings) {
      if (posting.amount <= 0n) {
        throw new Error(`[Ledger Invariant Violation] Posting amount must be strictly positive (> 0). Received: ${posting.amount}`);
      }

      let totals = currencyTotals.get(posting.currency);
      if (!totals) {
        totals = { debits: 0n, credits: 0n };
        currencyTotals.set(posting.currency, totals);
      }

      if (posting.direction === 'DEBIT') {
        totals.debits += posting.amount;
      } else if (posting.direction === 'CREDIT') {
        totals.credits += posting.amount;
      } else {
        throw new Error(`[Ledger Invariant Violation] Unknown posting direction: ${posting.direction}`);
      }
    }

    // Every currency involved in the entry must have balanced debits and credits
    for (const [currency, totals] of currencyTotals.entries()) {
      if (totals.debits !== totals.credits) {
        const diff = totals.debits - totals.credits;
        throw new Error(
          `[Ledger Imbalance in ${currency}] Debits (${totals.debits}) do not equal Credits (${totals.credits}). Imbalance: ${diff > 0n ? '+' : ''}${diff} minor units.`
        );
      }
    }
  }

  /**
   * Calculates net balance according to GAAP / IFRS Normal Balance rules:
   * 
   * ASSET & EXPENSE: Normal balance is DEBIT
   * Net Balance = SUM(Debits) - SUM(Credits)
   * 
   * LIABILITY, EQUITY & REVENUE: Normal balance is CREDIT
   * Net Balance = SUM(Credits) - SUM(Debits)
   */
  static calculateAccountBalance(
    account: Account,
    postings: Posting[]
  ): AccountBalance {
    let debitSum = 0n;
    let creditSum = 0n;

    for (const p of postings) {
      if (p.accountId !== account.id) continue;
      if (p.currency !== account.currency) {
        throw new Error(`[Ledger Error] Posting currency ${p.currency} does not match account currency ${account.currency}`);
      }

      if (p.direction === 'DEBIT') {
        debitSum += p.amount;
      } else {
        creditSum += p.amount;
      }
    }

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
   * Creates a compensating Reversal Entry for an existing posted entry.
   * Reverses DEBIT -> CREDIT and CREDIT -> DEBIT with identical amounts.
   */
  static createReversalPostings(originalPostings: Posting[]): UnvalidatedPosting[] {
    return originalPostings.map(p => ({
      accountId: p.accountId,
      direction: p.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
      amount: p.amount,
      currency: p.currency
    }));
  }
}
