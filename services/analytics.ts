import { Category, CurrencyCode, Transaction, TransactionType } from '../types';

// All weekly analytics are computed locally and deterministically; the AI only narrates them.

export type WeekMode = 'calendar' | 'payday';
export type SpendBucket = 'need' | 'want' | 'savings' | 'other';

export const BUCKETS: Record<Category, SpendBucket> = {
  'Groceries': 'need',
  'Rent': 'need',
  'Utilities & Bills': 'need',
  'Healthcare': 'need',
  'Education': 'need',
  'Debt & EMI': 'need',
  'Transport': 'need',
  'Bank Fees': 'need',
  'Dining Out': 'want',
  'Food Delivery': 'want',
  'Electronics': 'want',
  'Clothing': 'want',
  'Travel': 'want',
  'Entertainment': 'want',
  'Subscriptions': 'want',
  'Home Improvement': 'want',
  'Misc': 'want',
  'Investments': 'savings',
  'Salary': 'other',
  'Transfers': 'other',
};

// "Micro" transactions for the money-sink finder, in the statement's currency.
const MICRO_THRESHOLD: Record<CurrencyCode, number> = { INR: 300, USD: 10, EUR: 10, GBP: 10 };
// Categories that are naturally frequent, so repeated same-day charges are not "split".
const FREQUENT: Category[] = ['Groceries', 'Dining Out', 'Food Delivery', 'Transport', 'Transfers'];
const NOT_SPENDING: Category[] = ['Salary', 'Transfers', 'Investments'];
// Paid once a month, so they are counted once rather than extrapolated from the daily pace.
const FIXED_MONTHLY: Category[] = ['Rent', 'Debt & EMI', 'Utilities & Bills', 'Subscriptions', 'Investments'];

export interface WeekSlice {
  key: string;
  label: string;
  range: string;
  start: number;
  end: number;
  days: number;
  spend: number;
  income: number;
  perDay: number;
  // Change in daily burn rate vs the previous week, in percent.
  changePct: number | null;
  categories: Record<string, number>;
  buckets: Record<SpendBucket, number>;
}

export interface MoneySink {
  category: string;
  count: number;
  total: number;
  merchants: string[];
}

export interface Spike {
  category: string;
  week: string;
  prevWeek: string;
  changePct: number;
  amount: number;
}

export interface RecurringCharge {
  merchant: string;
  kind: 'fee' | 'subscription' | 'auto-debit' | 'split';
  count: number;
  total: number;
}

export interface Runway {
  periodLabel: string;
  // Day-to-day (non-fixed) spending per day during Week 1–2.
  pacePerDay: number;
  fixed: number;
  projectedSpend: number;
  income: number;
  projectedLeft: number;
  actualSpend: number | null;
}

export interface Analysis {
  mode: WeekMode;
  hasPayday: boolean;
  weeks: WeekSlice[];
  heatmapCategories: string[];
  microThreshold: number;
  moneySinks: MoneySink[];
  spikes: Spike[];
  recurring: RecurringCharge[];
  runway: Runway | null;
  split: { needs: number; wants: number; savings: number; income: number };
  suggestions: string[];
}

const DAY_MS = 86_400_000;

const toDay = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

const formatDay = (day: number) =>
  new Date(day * DAY_MS).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export const weekOf = (date: string, weeks: WeekSlice[]): WeekSlice | undefined => {
  const day = toDay(date);
  return weeks.find(w => day >= w.start && day <= w.end);
};

const sum = (items: Transaction[]) => items.reduce((total, t) => total + t.amount, 0);
const isSpend = (t: Transaction) => t.type === TransactionType.DEBIT;
const merchantKey = (t: Transaction) => (t.merchant || t.description).trim().toLowerCase();

interface Period {
  start: number;
  end: number;
  label: string;
}

const calendarPeriods = (days: number[]): Period[] => {
  const starts = new Set(days.map(day => {
    const date = new Date(day * DAY_MS);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / DAY_MS;
  }));
  return [...starts].sort((a, b) => a - b).map(start => {
    const date = new Date(start * DAY_MS);
    return {
      start,
      end: Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / DAY_MS - 1,
      label: date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
    };
  });
};

// Salary credits, ignoring a second credit within 5 days of the previous one.
const findPaydays = (transactions: Transaction[]): number[] =>
  transactions
    .filter(t => t.type === TransactionType.CREDIT && t.category === 'Salary')
    .map(t => toDay(t.date))
    .sort((a, b) => a - b)
    .reduce<number[]>((paydays, day) => (paydays.length && day - paydays[paydays.length - 1] < 5 ? paydays : [...paydays, day]), []);

const paydayPeriods = (paydays: number[], firstDay: number, lastDay: number): Period[] => {
  const starts = [...paydays];
  // Spending before the first salary belongs to the previous (assumed ~30 day) cycle.
  while (starts[0] > firstDay) starts.unshift(starts[0] - 30);
  return starts.map((start, i) => ({
    start,
    end: (starts[i + 1] ?? Math.max(start + 30, lastDay + 1)) - 1,
    label: `Pay ${formatDay(start)}`,
  }));
};

// Splits each period into Week 1–4; week 4 absorbs the remaining days (e.g. 22nd–31st).
const sliceWeeks = (transactions: Transaction[], periods: Period[], firstDay: number, lastDay: number): WeekSlice[] => {
  const slices: (WeekSlice & { periodIndex: number })[] = [];
  periods.forEach((period, periodIndex) => {
    for (let week = 1; week <= 4; week++) {
      const start = period.start + (week - 1) * 7;
      const end = week === 4 ? period.end : Math.min(start + 6, period.end);
      if (start > period.end || end < firstDay || start > lastDay) continue;

      const inWeek = transactions.filter(t => {
        const day = toDay(t.date);
        return day >= start && day <= end;
      });
      const spending = inWeek.filter(isSpend);
      const days = Math.min(end, lastDay) - Math.max(start, firstDay) + 1;
      const spend = sum(spending);

      const categories: Record<string, number> = {};
      const buckets: Record<SpendBucket, number> = { need: 0, want: 0, savings: 0, other: 0 };
      spending.forEach(t => {
        categories[t.category] = (categories[t.category] || 0) + t.amount;
        buckets[BUCKETS[t.category] ?? 'want'] += t.amount;
      });

      slices.push({
        periodIndex,
        key: `${period.start}-${week}`,
        label: `Week ${week}`,
        range: `${formatDay(start)} – ${formatDay(end)}`,
        start,
        end,
        days,
        spend,
        income: sum(inWeek.filter(t => t.type === TransactionType.CREDIT)),
        perDay: spend / days,
        changePct: null,
        categories,
        buckets,
      });
    }
  });

  const multiplePeriods = new Set(slices.map(s => s.periodIndex)).size > 1;
  return slices.map(({ periodIndex, ...slice }, i) => {
    const prev = slices[i - 1];
    return {
      ...slice,
      label: multiplePeriods ? `${periods[periodIndex].label} · ${slice.label}` : slice.label,
      changePct: prev && prev.perDay > 0 ? ((slice.perDay - prev.perDay) / prev.perDay) * 100 : null,
    };
  });
};

const findMoneySinks = (spending: Transaction[], threshold: number): MoneySink[] => {
  const groups = new Map<string, Transaction[]>();
  spending
    // Discretionary spends plus cabs, the classic "quietly adds up" categories.
    .filter(t => t.amount <= threshold && (BUCKETS[t.category] === 'want' || t.category === 'Transport'))
    .forEach(t => groups.set(t.category, [...(groups.get(t.category) ?? []), t]));

  return [...groups.entries()]
    .filter(([, items]) => items.length >= 5)
    .map(([category, items]) => {
      const merchantCounts = new Map<string, number>();
      items.forEach(t => merchantCounts.set(t.merchant || t.description, (merchantCounts.get(t.merchant || t.description) || 0) + 1));
      return {
        category,
        count: items.length,
        total: sum(items),
        merchants: [...merchantCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name),
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);
};

const findSpikes = (weeks: WeekSlice[], minAmount: number): Spike[] => {
  const spikes: Spike[] = [];
  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1];
    const week = weeks[i];
    Object.entries(week.categories).forEach(([category, amount]) => {
      const prevAmount = prev.categories[category] || 0;
      if (NOT_SPENDING.includes(category as Category) || prevAmount <= 0 || amount < minAmount) return;
      // Compare daily rates so the longer week 4 isn't flagged just for having more days.
      const changePct = ((amount / week.days - prevAmount / prev.days) / (prevAmount / prev.days)) * 100;
      if (changePct >= 75) spikes.push({ category, week: week.label, prevWeek: prev.label, changePct, amount });
    });
  }
  return spikes.sort((a, b) => b.amount * b.changePct - a.amount * a.changePct).slice(0, 5);
};

const findRecurring = (spending: Transaction[]): RecurringCharge[] => {
  const groups = new Map<string, Transaction[]>();
  spending.forEach(t => groups.set(merchantKey(t), [...(groups.get(merchantKey(t)) ?? []), t]));

  const charges: RecurringCharge[] = [];
  groups.forEach(items => {
    const sorted = [...items].sort((a, b) => toDay(a.date) - toDay(b.date));
    const merchant = sorted[0].merchant || sorted[0].description;
    const base = { merchant, count: items.length, total: sum(items) };

    if (items.some(t => t.category === 'Bank Fees')) {
      charges.push({ ...base, kind: 'fee' });
    } else if (items.some(t => t.category === 'Subscriptions')) {
      charges.push({ ...base, kind: 'subscription' });
    } else if (
      items.length >= 2 &&
      !FREQUENT.includes(sorted[0].category) &&
      sorted.every((t, i) => i === 0 || toDay(t.date) - toDay(sorted[i - 1].date) >= 20) &&
      items.every(t => Math.abs(t.amount - sorted[0].amount) <= sorted[0].amount * 0.05)
    ) {
      charges.push({ ...base, kind: 'auto-debit' });
    } else if (
      !FREQUENT.includes(sorted[0].category) &&
      sorted.some((t, i) => i > 0 && t.date === sorted[i - 1].date)
    ) {
      charges.push({ ...base, kind: 'split' });
    }
  });

  const order: RecurringCharge['kind'][] = ['fee', 'subscription', 'auto-debit', 'split'];
  return charges.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.total - a.total);
};

// Projects the period's spend from the Week 1–2 pace of day-to-day spending, plus fixed
// monthly costs counted once (needs at least 7 days of data).
const projectRunway = (transactions: Transaction[], periods: Period[], firstDay: number, lastDay: number): Runway | null => {
  for (const period of [...periods].reverse()) {
    const windowStart = Math.max(period.start, firstDay);
    const windowEnd = Math.min(period.start + 13, lastDay);
    const daysTracked = windowEnd - windowStart + 1;
    if (daysTracked < 7) continue;

    const inPeriod = transactions.filter(t => toDay(t.date) >= period.start && toDay(t.date) <= period.end);
    const spending = inPeriod.filter(isSpend);
    const fixed = sum(spending.filter(t => FIXED_MONTHLY.includes(t.category)));
    const earlyVariable = sum(spending.filter(t =>
      !FIXED_MONTHLY.includes(t.category) && toDay(t.date) >= windowStart && toDay(t.date) <= windowEnd));
    const pacePerDay = earlyVariable / daysTracked;
    const projectedSpend = fixed + pacePerDay * 30;
    const income = sum(inPeriod.filter(t => t.type === TransactionType.CREDIT && t.category !== 'Transfers'));
    return {
      periodLabel: period.label,
      pacePerDay,
      fixed,
      projectedSpend,
      income,
      projectedLeft: income - projectedSpend,
      actualSpend: lastDay >= period.end && firstDay <= period.start ? sum(spending) : null,
    };
  }
  return null;
};

const buildSuggestions = (
  weeks: WeekSlice[],
  spikes: Spike[],
  sinks: MoneySink[],
  recurring: RecurringCharge[],
  split: Analysis['split'],
  format: (value: number) => string,
): string[] => {
  const suggestions: string[] = [];
  const avgWeek = weeks.reduce((total, w) => total + w.spend, 0) / Math.max(weeks.length, 1);

  const wantSpike = spikes.find(s => BUCKETS[s.category as Category] === 'want');
  if (wantSpike) {
    const saving = wantSpike.amount * 0.3;
    const week = weeks.find(w => w.label === wantSpike.week);
    const overspend = week ? week.spend - avgWeek : 0;
    suggestions.push(overspend > 0
      ? `Reducing ${wantSpike.category} by 30% next week saves about ${format(saving)}, covering ${Math.min(100, Math.round((saving / overspend) * 100))}% of the ${wantSpike.week} overspend (${format(overspend)}).`
      : `Reducing ${wantSpike.category} by 30% next week saves about ${format(saving)}.`);
  }

  if (sinks[0]) {
    suggestions.push(`Halving small ${sinks[0].category} payments (${sinks[0].count} this period) would save about ${format(sinks[0].total / 2)}.`);
  }

  if (split.income > 0 && split.wants / split.income > 0.3) {
    const excess = split.wants - split.income * 0.3;
    suggestions.push(`Wants are ${Math.round((split.wants / split.income) * 100)}% of income vs the 30% target. Trimming ${format(excess)} gets you back on track.`);
  }

  const subscriptions = recurring.filter(r => r.kind === 'subscription');
  if (subscriptions.length >= 2) {
    suggestions.push(`You pay for ${subscriptions.length} subscriptions (${format(subscriptions.reduce((t, s) => t + s.total, 0))}). Cancel any you no longer use.`);
  }

  return suggestions;
};

export const analyze = (
  allTransactions: Transaction[],
  requestedMode: WeekMode,
  currencyCode: CurrencyCode,
  format: (value: number) => string,
): Analysis => {
  const transactions = allTransactions.filter(t => !Number.isNaN(toDay(t.date)));
  const spending = transactions.filter(isSpend);
  const days = transactions.map(t => toDay(t.date));
  const paydays = findPaydays(transactions);
  const mode: WeekMode = requestedMode === 'payday' && paydays.length ? 'payday' : 'calendar';
  const microThreshold = MICRO_THRESHOLD[currencyCode];
  const split = { needs: 0, wants: 0, savings: 0, income: 0 };

  if (!days.length) {
    return { mode, hasPayday: false, weeks: [], heatmapCategories: [], microThreshold, moneySinks: [], spikes: [], recurring: [], runway: null, split, suggestions: [] };
  }

  const firstDay = Math.min(...days);
  const lastDay = Math.max(...days);
  const periods = mode === 'payday' ? paydayPeriods(paydays, firstDay, lastDay) : calendarPeriods(days);
  const weeks = sliceWeeks(transactions, periods, firstDay, lastDay);

  const categoryTotals = new Map<string, number>();
  spending.forEach(t => {
    if (BUCKETS[t.category] !== 'other') categoryTotals.set(t.category, (categoryTotals.get(t.category) || 0) + t.amount);
    if (BUCKETS[t.category] === 'need') split.needs += t.amount;
    if (BUCKETS[t.category] === 'want') split.wants += t.amount;
    if (BUCKETS[t.category] === 'savings') split.savings += t.amount;
  });
  split.income = sum(transactions.filter(t => t.type === TransactionType.CREDIT && t.category !== 'Transfers'));

  const totalSpend = sum(spending);
  const moneySinks = findMoneySinks(spending, microThreshold);
  const spikes = findSpikes(weeks, Math.max(microThreshold * 3, totalSpend * 0.03));
  const recurring = findRecurring(spending);

  return {
    mode,
    hasPayday: paydays.length > 0,
    weeks,
    heatmapCategories: [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([category]) => category),
    microThreshold,
    moneySinks,
    spikes,
    recurring,
    runway: projectRunway(transactions, periods, firstDay, lastDay),
    split,
    suggestions: buildSuggestions(weeks, spikes, moneySinks, recurring, split, format),
  };
};
