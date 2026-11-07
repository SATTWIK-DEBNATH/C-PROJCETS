import { Currency, CurrencyConfig } from './types.js';

export const CURRENCY_CONFIGS: Record<Currency, CurrencyConfig> = {
  USD: { code: 'USD', minorUnit: 2, symbol: '$', name: 'US Dollar' },
  EUR: { code: 'EUR', minorUnit: 2, symbol: '€', name: 'Euro' },
  GBP: { code: 'GBP', minorUnit: 2, symbol: '£', name: 'British Pound' },
  INR: { code: 'INR', minorUnit: 2, symbol: '₹', name: 'Indian Rupee' },
  JPY: { code: 'JPY', minorUnit: 0, symbol: '¥', name: 'Japanese Yen' }
};

/**
 * Money representation in integer minor units (e.g. cents).
 * 
 * NEVER use IEEE 754 floating point numbers for financial calculations!
 * e.g., 0.1 + 0.2 = 0.30000000000000004 in standard JavaScript.
 */
export class Money {
  readonly amount: bigint;
  readonly currency: Currency;

  constructor(amountInMinorUnits: bigint | number | string, currency: Currency) {
    if (typeof amountInMinorUnits === 'number') {
      if (!Number.isInteger(amountInMinorUnits)) {
        throw new Error(`[Fintech Safety] Float detected: ${amountInMinorUnits}. Financial amounts must be exact minor units.`);
      }
      this.amount = BigInt(amountInMinorUnits);
    } else if (typeof amountInMinorUnits === 'string') {
      this.amount = BigInt(amountInMinorUnits);
    } else {
      this.amount = amountInMinorUnits;
    }
    this.currency = currency;
  }

  /**
   * Factory: Parse decimal string into Money (e.g. "125.50", "USD" -> 12550n)
   */
  static fromDecimal(decimalStr: string | number, currency: Currency): Money {
    const config = CURRENCY_CONFIGS[currency];
    const str = typeof decimalStr === 'number' ? decimalStr.toFixed(config.minorUnit) : decimalStr.trim();
    
    // Validate format
    const regex = new RegExp(`^-?\\d+(\\.\\d{1,${config.minorUnit}})?$`);
    if (!regex.test(str)) {
      throw new Error(`Invalid monetary decimal format for ${currency}: "${str}"`);
    }

    const [integerPart, fractionalPart = ''] = str.split('.');
    const paddedFraction = fractionalPart.padEnd(config.minorUnit, '0').slice(0, config.minorUnit);
    const combinedStr = `${integerPart}${paddedFraction}`;
    return new Money(BigInt(combinedStr), currency);
  }

  /**
   * Zero amount factory
   */
  static zero(currency: Currency): Money {
    return new Money(0n, currency);
  }

  /**
   * Add another Money instance (same currency required)
   */
  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  /**
   * Subtract another Money instance
   */
  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount - other.amount, this.currency);
  }

  /**
   * Calculate basis points fee (1 bps = 0.01% = 1/10000)
   * Example: 50 bps on $1000.00 = 100000 * 50 / 10000 = 500 cents ($5.00)
   */
  applyBps(basisPoints: bigint | number): Money {
    const bps = BigInt(basisPoints);
    const feeAmount = (this.amount * bps) / 10_000n;
    return new Money(feeAmount, this.currency);
  }

  /**
   * Format as human-readable string (e.g. "$1,250.50")
   */
  format(): string {
    const config = CURRENCY_CONFIGS[this.currency];
    const isNegative = this.amount < 0n;
    const absVal = isNegative ? -this.amount : this.amount;

    let formattedNumber: string;
    if (config.minorUnit === 0) {
      formattedNumber = absVal.toString();
    } else {
      const divisor = 10n ** BigInt(config.minorUnit);
      const integerPart = (absVal / divisor).toString();
      const remainder = (absVal % divisor).toString().padStart(config.minorUnit, '0');
      formattedNumber = `${integerPart}.${remainder}`;
    }

    // Add thousand commas
    const parts = formattedNumber.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const formattedWithCommas = parts.join('.');

    return `${isNegative ? '-' : ''}${config.symbol}${formattedWithCommas}`;
  }

  toDecimalString(): string {
    const config = CURRENCY_CONFIGS[this.currency];
    if (config.minorUnit === 0) return this.amount.toString();
    const divisor = 10n ** BigInt(config.minorUnit);
    const isNegative = this.amount < 0n;
    const absVal = isNegative ? -this.amount : this.amount;
    const integerPart = (absVal / divisor).toString();
    const remainder = (absVal % divisor).toString().padStart(config.minorUnit, '0');
    return `${isNegative ? '-' : ''}${integerPart}.${remainder}`;
  }

  isZero(): boolean {
    return this.amount === 0n;
  }

  isPositive(): boolean {
    return this.amount > 0n;
  }

  isNegative(): boolean {
    return this.amount < 0n;
  }

  private assertSameCurrency(other: Money) {
    if (this.currency !== other.currency) {
      throw new Error(`[Currency Mismatch] Cannot perform arithmetic between ${this.currency} and ${other.currency}. Multi-currency operations require FX conversion.`);
    }
  }
}
