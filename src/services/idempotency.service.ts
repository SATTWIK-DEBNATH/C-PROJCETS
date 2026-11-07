import crypto from 'node:crypto';
import { db } from '../database/db.js';

export interface IdempotencyRecord {
  key: string;
  requestHash: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  responseStatus?: number;
  responseBody?: string;
  createdAt: string;
  updatedAt: string;
}

export class IdempotencyService {
  /**
   * Hashes request payload to detect tampering with same key
   */
  static hashPayload(payload: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');
  }

  /**
   * Check or lock an idempotency key
   */
  static lock(key: string, payload: any): { isExisting: boolean; record?: IdempotencyRecord } {
    const hash = this.hashPayload(payload);
    const existing = db.prepare('SELECT * FROM idempotency_records WHERE key = ?').get(key) as IdempotencyRecord | undefined;

    if (existing) {
      if (existing.requestHash !== hash) {
        throw new Error('[Idempotency Conflict] Idempotency key reused with different request payload.');
      }
      return { isExisting: true, record: existing };
    }

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO idempotency_records (key, requestHash, status, createdAt, updatedAt)
      VALUES (?, ?, 'IN_PROGRESS', ?, ?)
    `).run(key, hash, now, now);

    return { isExisting: false };
  }

  /**
   * Complete an idempotency transaction with its cached response
   */
  static complete(key: string, statusCode: number, responseBody: any): void {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE idempotency_records
      SET status = 'COMPLETED', responseStatus = ?, responseBody = ?, updatedAt = ?
      WHERE key = ?
    `).run(statusCode, JSON.stringify(responseBody), now, key);
  }

  /**
   * Mark as failed
   */
  static fail(key: string, errorMsg: string): void {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE idempotency_records
      SET status = 'FAILED', responseStatus = 400, responseBody = ?, updatedAt = ?
      WHERE key = ?
    `).run(JSON.stringify({ error: errorMsg }), now, key);
  }
}
