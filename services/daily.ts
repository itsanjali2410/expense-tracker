import { Category, CurrencyCode, Transaction, TransactionType } from '../types';
import { DAY_MS, FIXED_MONTHLY, MICRO_THRESHOLD, formatDay, toDay } from './analytics';

// Day-level view of the statement. "Spend" here is day-to-day spending; fixed monthly bills
// (rent, EMIs, subscriptions...) are tracked separately so the day you pay rent isn't
// painted as a "bad" day.

export type DayLevel = 'empty' | 'none' | 'under' | 'near' | 'over';

export interface DaySummary {
  key: string;
  day: number;
  // False for calendar days outside the statement's date range.
  inRange: boolean;
  spend: number;
  bills: number;
  income: number;
  level: DayLevel;
  transactions: Transaction[];
  categories: [string, number][];
  insights: string[];
}

export interface Highlight {
  label: string;
  value: string;
  detail: string;
  dayKey?: string;
}

export interface DailyAnalysis {
  days: DaySummary[];
  dailyLimit: number;
  // 'income': income minus bills and 20% savings, spread over the month.
  // 'typical': no usable income, so the limit is the median spending day.
  limitBasis: 'income' | 'typical';
  typicalDay: number;
  daysUnderLimit: number;
  daysTracked: number;
  highlights: Highlight[];
}

const toKey = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const weekday = (day: number) => new Date(day * DAY_MS).getUTCDay();
const isWeekend = (day: number) => weekday(day) === 0 || weekday(day) === 6;
const sum = (items: Transaction[]) => items.reduce((total, t) => total + t.amount, 0);
const isFixed = (t: Transaction) => FIXED_MONTHLY.includes(t.category);

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export const formatDayLong = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const dayInsights = (
  day: Omit<DaySummary, 'insights' | 'level'>,
  limit: number,
  typical: number,
  microThreshold: number,
  format: (value: number) => string,
): string[] => {
  const insights: string[] = [];
  const debits = day.transactions.filter(t => t.type === TransactionType.DEBIT);
  const variable = debits.filter(t => !isFixed(t));

  if (day.spend === 0) {
    insights.push(day.bills ? 'No day-to-day spending, only bills.' : 'No-spend day. Nice!');
  } else {
    const diff = day.spend - limit;
    insights.push(diff > 0
      ? `${format(diff)} over your daily limit of ${format(limit)}.`
      : `${format(-diff)} under your daily limit of ${format(limit)}.`);
    if (typical > 0 && day.spend >= typical * 2) {
      insights.push(`${(day.spend / typical).toFixed(1)}× a typical spending day (${format(typical)}).`);
    }
    const biggest = variable.reduce((max, t) => (t.amount > max.amount ? t : max), variable[0]);
    insights.push(`Biggest purchase: ${biggest.merchant}, ${format(biggest.amount)} (${biggest.category}).`);

    const small = variable.filter(t => t.amount <= microThreshold);
    if (small.length >= 3) insights.push(`${small.length} small payments added up to ${format(sum(small))}.`);

    const counts = new Map<string, number>();
    variable.forEach(t => counts.set(t.merchant, (counts.get(t.merchant) || 0) + 1));
    counts.forEach((count, merchant) => {
      if (count >= 2) insights.push(`${merchant} charged you ${count} times.`);
    });
  }

  const bills = debits.filter(isFixed);
  if (bills.length) insights.push(`Bills paid: ${bills.map(t => `${t.merchant} ${format(t.amount)}`).join(', ')}.`);
  if (day.income > 0) insights.push(`Money in: ${format(day.income)}.`);
  return insights;
};

const longestStreak = (days: DaySummary[], predicate: (day: DaySummary) => boolean) => {
  let best = 0;
  let current = 0;
  days.forEach(day => {
    current = predicate(day) ? current + 1 : 0;
    best = Math.max(best, current);
  });
  return best;
};

export const analyzeDays = (
  allTransactions: Transaction[],
  currencyCode: CurrencyCode,
  format: (value: number) => string,
): DailyAnalysis => {
  const transactions = allTransactions.filter(t => !Number.isNaN(toDay(t.date)));
  const empty: DailyAnalysis = { days: [], dailyLimit: 0, limitBasis: 'typical', typicalDay: 0, daysUnderLimit: 0, daysTracked: 0, highlights: [] };
  if (!transactions.length) return empty;

  const dayNumbers = transactions.map(t => toDay(t.date));
  const first = Math.min(...dayNumbers);
  const last = Math.max(...dayNumbers);
  // Show whole calendar months so the grid always starts on the 1st.
  const firstDate = new Date(first * DAY_MS);
  const lastDate = new Date(last * DAY_MS);
  const start = Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth(), 1) / DAY_MS;
  const end = Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth() + 1, 1) / DAY_MS - 1;

  const byDay = new Map<number, Transaction[]>();
  transactions.forEach(t => byDay.set(toDay(t.date), [...(byDay.get(toDay(t.date)) ?? []), t]));

  const baseDays = [];
  for (let day = start; day <= end; day++) {
    const items = byDay.get(day) ?? [];
    const debits = items.filter(t => t.type === TransactionType.DEBIT);
    const categories = new Map<string, number>();
    debits.forEach(t => categories.set(t.category, (categories.get(t.category) || 0) + t.amount));
    baseDays.push({
      key: toKey(day),
      day,
      inRange: day >= first && day <= last,
      spend: sum(debits.filter(t => !isFixed(t))),
      bills: sum(debits.filter(isFixed)),
      income: sum(items.filter(t => t.type === TransactionType.CREDIT)),
      transactions: items,
      categories: [...categories.entries()].sort((a, b) => b[1] - a[1]),
    });
  }

  const tracked = baseDays.filter(d => d.inRange);
  const typicalDay = median(tracked.filter(d => d.spend > 0).map(d => d.spend));
  const income = sum(transactions.filter(t => t.type === TransactionType.CREDIT && t.category !== 'Transfers'));
  const fixed = sum(transactions.filter(t => t.type === TransactionType.DEBIT && isFixed(t)));
  const incomeLimit = (income - fixed - income * 0.2) / baseDays.length;
  const limitBasis = income > 0 && incomeLimit > 0 ? 'income' : 'typical';
  const dailyLimit = limitBasis === 'income' ? incomeLimit : typicalDay;
  const microThreshold = MICRO_THRESHOLD[currencyCode];

  const days: DaySummary[] = baseDays.map(day => {
    let level: DayLevel = 'empty';
    if (day.inRange) {
      if (day.spend === 0) level = 'none';
      else if (day.spend <= dailyLimit) level = 'under';
      else if (day.spend <= dailyLimit * 1.5) level = 'near';
      else level = 'over';
    }
    return {
      ...day,
      level,
      insights: day.inRange ? dayInsights(day, dailyLimit, typicalDay, microThreshold, format) : [],
    };
  });

  const inRange = days.filter(d => d.inRange);
  const daysUnderLimit = inRange.filter(d => d.level === 'none' || d.level === 'under').length;
  const highlights: Highlight[] = [];

  const priciest = inRange.reduce((max, d) => (d.spend > max.spend ? d : max), inRange[0]);
  if (priciest.spend > 0) {
    highlights.push({
      label: 'Priciest day',
      value: format(priciest.spend),
      detail: `${formatDay(priciest.day)}, mostly ${priciest.categories.find(([c]) => !FIXED_MONTHLY.includes(c as Category))?.[0] ?? priciest.categories[0][0]}`,
      dayKey: priciest.key,
    });
  }

  highlights.push({
    label: 'Under daily limit',
    value: `${daysUnderLimit} of ${inRange.length} days`,
    detail: `Limit ${format(dailyLimit)} a day`,
  });

  const noSpend = inRange.filter(d => d.spend === 0).length;
  const streak = longestStreak(inRange, d => d.spend === 0);
  highlights.push({
    label: 'No-spend days',
    value: String(noSpend),
    detail: noSpend ? `Longest streak: ${streak} day${streak === 1 ? '' : 's'}` : 'Try one this week',
  });

  const weekendDays = inRange.filter(d => isWeekend(d.day));
  const weekdayDays = inRange.filter(d => !isWeekend(d.day));
  const avg = (items: DaySummary[]) => items.reduce((total, d) => total + d.spend, 0) / Math.max(items.length, 1);
  if (weekendDays.length && weekdayDays.length && avg(weekdayDays) > 0) {
    const ratio = avg(weekendDays) / avg(weekdayDays);
    highlights.push({
      label: 'Weekend vs weekday',
      value: `${ratio.toFixed(1)}×`,
      detail: ratio >= 1
        ? `A weekend day costs ${format(avg(weekendDays))} vs ${format(avg(weekdayDays))}`
        : `Weekends are calmer: ${format(avg(weekendDays))} vs ${format(avg(weekdayDays))}`,
    });
  }

  return { days, dailyLimit, limitBasis, typicalDay, daysUnderLimit, daysTracked: inRange.length, highlights };
};
