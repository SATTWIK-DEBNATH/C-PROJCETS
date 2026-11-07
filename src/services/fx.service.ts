import { Currency } from '../core/types.js';

/**
 * Foreign Exchange (FX) Service
 * Simulates real-time market rates and spread calculations.
 */
export class FXService {
  // Base rates pegged against 1 USD
  private static ratesToUSD: Record<Currency, number> = {
    USD: 1.0,
    EUR: 0.92,   // 1 USD = 0.92 EUR
    GBP: 0.78,   // 1 USD = 0.78 GBP
    INR: 83.50,  // 1 USD = 83.50 INR
    JPY: 155.0   // 1 USD = 155 JPY
  };

  /**
   * Get direct exchange rate between two currencies
   */
  static getRate(from: Currency, to: Currency): number {
    if (from === to) return 1.0;
    const fromToUsd = 1.0 / this.ratesToUSD[from];
    const usdToTarget = this.ratesToUSD[to];
    return fromToUsd * usdToTarget;
  }

  /**
   * Calculate conversion with minor unit scale factors
   */
  static convertAmount(amountMinor: bigint, from: Currency, to: Currency): {
    convertedMinor: bigint;
    rate: number;
  } {
    if (from === to) {
      return { convertedMinor: amountMinor, rate: 1.0 };
    }

    const rate = this.getRate(from, to);
    
    // Scale according to currency minor units
    // USD(2) -> JPY(0): multiply by 155 / 100
    // JPY(0) -> USD(2): divide by 155 * 100
    const fromScale = from === 'JPY' ? 1 : 100;
    const toScale = to === 'JPY' ? 1 : 100;

    const baseDecimal = Number(amountMinor) / fromScale;
    const convertedDecimal = baseDecimal * rate;
    const convertedMinor = BigInt(Math.round(convertedDecimal * toScale));

    return { convertedMinor, rate };
  }
}
