import { db } from '../database/db.js';
import { FintechRepository } from '../database/repository.js';
import { Account, Currency, User } from '../core/types.js';

export interface RiskEvaluationResult {
  allowed: boolean;
  requiresReview: boolean;
  reason?: string;
  ruleCode?: string;
}

export class FraudDetectionService {
  /**
   * Evaluates a transfer before ledger posting.
   */
  static evaluateTransaction(params: {
    sourceAccount: Account;
    destinationAccount: Account;
    amount: bigint;
    currency: Currency;
  }): RiskEvaluationResult {
    const { sourceAccount, destinationAccount, amount, currency } = params;

    // 1. Check if user is frozen
    if (sourceAccount.userId) {
      const user = FintechRepository.getUserById(sourceAccount.userId);
      if (user && user.status === 'FROZEN') {
        return {
          allowed: false,
          requiresReview: false,
          ruleCode: 'RISK_ACC_FROZEN',
          reason: 'Source account owner status is FROZEN. All outgoing transfers are blocked.'
        };
      }
    }

    // 2. Overdraft / Sufficient Balance Check
    // Customer accounts (LIABILITY) should not go negative unless authorized overdraft
    const currentBalance = FintechRepository.getAccountBalance(sourceAccount.id);
    if (!sourceAccount.isSystemAccount && currentBalance.netBalance < amount) {
      return {
        allowed: false,
        requiresReview: false,
        ruleCode: 'INSUFFICIENT_FUNDS',
        reason: `Insufficient funds. Available: ${currentBalance.formattedBalance}, Required: ${amount}`
      };
    }

    // 3. AML High-Value Threshold Rule (e.g., >= $10,000.00 equivalent = 1,000,000 cents)
    const AML_THRESHOLD = 1_000_000n; // $10,000
    if (amount >= AML_THRESHOLD) {
      FintechRepository.createFraudAlert({
        userId: sourceAccount.userId || undefined,
        ruleCode: 'AML_HIGH_VALUE_CTR',
        severity: 'MEDIUM',
        reason: `High value transaction detected (${amount} minor units in ${currency}). Flagged for Currency Transaction Reporting (CTR) compliance review.`,
        status: 'FLAGGED'
      });
      // In production, this can either trigger secondary 2FA approval or proceed with an audit record
    }

    // 4. Velocity Check: More than 4 transfers in the past 60 seconds
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const velocityCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM postings p
      JOIN journal_entries e ON p.entryId = e.id
      WHERE p.accountId = ? AND p.direction = 'DEBIT' AND p.createdAt >= ?
    `).get(sourceAccount.id, oneMinuteAgo) as { count: number };

    if (velocityCount.count >= 4) {
      FintechRepository.createFraudAlert({
        userId: sourceAccount.userId || undefined,
        ruleCode: 'VELOCITY_LIMIT_EXCEEDED',
        severity: 'HIGH',
        reason: `Velocity anomaly: User initiated ${velocityCount.count + 1} transfers within 60 seconds. Suspicious rapid movement of funds.`,
        status: 'FLAGGED'
      });

      return {
        allowed: false,
        requiresReview: true,
        ruleCode: 'VELOCITY_LOCKOUT',
        reason: 'Velocity threshold exceeded: Too many rapid transfers. Account under temporary security hold.'
      };
    }

    return { allowed: true, requiresReview: false };
  }
}
