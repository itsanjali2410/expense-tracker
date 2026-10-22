
export enum TransactionType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT'
}

export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP';

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  locale: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  INR: { code: 'INR', symbol: '₹', locale: 'en-IN' },
  USD: { code: 'USD', symbol: '$', locale: 'en-US' },
  EUR: { code: 'EUR', symbol: '€', locale: 'de-DE' },
  GBP: { code: 'GBP', symbol: '£', locale: 'en-GB' },
};

// Single source of truth for categories (Gemini schema, budgets, analytics).
export const CATEGORIES = [
  'Groceries',
  'Dining Out',
  'Food Delivery',
  'Transport',
  'Rent',
  'Debt & EMI',
  'Electronics',
  'Clothing',
  'Travel',
  'Healthcare',
  'Education',
  'Entertainment',
  'Home Improvement',
  'Utilities & Bills',
  'Subscriptions',
  'Salary',
  'Investments',
  'Bank Fees',
  'Transfers',
  'Misc',
] as const;

export type Category = typeof CATEGORIES[number];

export interface Transaction {
  id: string;
  date: string;
  // Raw statement text, e.g. "POS-98421-SWIGGY-BLR".
  description: string;
  // Cleaned merchant name, e.g. "Swiggy".
  merchant: string;
  amount: number;
  type: TransactionType;
  category: Category;
}

export interface SummaryStats {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  transactionCount: number;
  averageDailyExpense: number;
  highestSpendingDay: {
    date: string;
    amount: number;
  };
  categoryTotals: Record<string, number>;
}

export interface CategoryBudget {
  category: Category;
  limit: number;
}
