import React, { useRef } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import { CurrencyConfig, TransactionType } from '../../types';
import { DailyAnalysis, DayLevel, DaySummary, formatDayLong } from '../../services/daily';

interface DailyViewProps {
  daily: DailyAnalysis;
  currency: CurrencyConfig;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onAsk: (question: string) => void;
}

const LEVELS: Record<DayLevel, { label: string; cell: string; chip: string; bar: string }> = {
  empty: { label: 'No data', cell: 'bg-slate-50 text-slate-300 cursor-default', chip: 'bg-slate-100 text-slate-500', bar: 'bg-slate-300' },
  none: { label: 'No spend', cell: 'bg-white border-2 border-dashed border-emerald-300 text-emerald-700', chip: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
  under: { label: 'Under limit', cell: 'bg-emerald-100 text-emerald-900', chip: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
  near: { label: 'A bit over', cell: 'bg-amber-100 text-amber-900', chip: 'bg-amber-100 text-amber-700', bar: 'bg-amber-400' },
  over: { label: 'Over limit', cell: 'bg-rose-200 text-rose-900', chip: 'bg-rose-100 text-rose-700', bar: 'bg-rose-500' },
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const DailyView: React.FC<DailyViewProps> = ({ daily, currency, selectedKey, onSelect, onAsk }) => {
  const detailRef = useRef<HTMLDivElement>(null);

  // On phones the day details sit below the calendar, so bring them into view.
  const pickDay = (key: string) => {
    onSelect(key);
    if (window.innerWidth < 1024) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat(currency.locale, { style: 'currency', currency: currency.code, maximumFractionDigits: 0 }).format(val);
  const formatCompact = (val: number) =>
    new Intl.NumberFormat(currency.locale, { style: 'currency', currency: currency.code, notation: 'compact', maximumFractionDigits: 1 }).format(val);

  const tracked = daily.days.filter(d => d.inRange);
  const selected = tracked.find(d => d.key === selectedKey) ?? tracked[tracked.length - 1];
  const position = tracked.indexOf(selected);

  // Group calendar days by month.
  const months: { title: string; days: DaySummary[] }[] = [];
  daily.days.forEach(day => {
    const title = new Date(`${day.key}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    if (months[months.length - 1]?.title !== title) months.push({ title, days: [] });
    months[months.length - 1].days.push(day);
  });

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Highlights */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {daily.highlights.map(highlight => (
          <button
            key={highlight.label}
            onClick={() => highlight.dayKey && onSelect(highlight.dayKey)}
            disabled={!highlight.dayKey}
            className="text-left bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-100 enabled:hover:border-indigo-400 enabled:cursor-pointer transition-all"
          >
            <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">{highlight.label}</p>
            <p className="text-lg sm:text-2xl font-black text-slate-900 mt-1">{highlight.value}</p>
            <p className="text-xs text-slate-500 mt-1">{highlight.detail}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 sm:gap-8">
        {/* Calendar */}
        <div className="lg:col-span-3 bg-white p-4 sm:p-8 rounded-2xl shadow-sm border border-slate-100 space-y-6">
          <div>
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-indigo-600" />
              Your days
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Daily limit: <strong>{formatCurrency(daily.dailyLimit)}</strong>{' '}
              {daily.limitBasis === 'income'
                ? '(income left after bills and 20% savings, spread across the month)'
                : '(your typical spending day, since no income was found)'}
              . Tap a day to see what happened.
            </p>
          </div>

          {months.map(month => (
            <div key={month.title}>
              <p className="font-bold text-slate-700 mb-3">{month.title}</p>
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {WEEKDAYS.map(name => (
                  <div key={name} className="text-center text-[10px] sm:text-xs font-bold text-slate-400 pb-1">{name}</div>
                ))}
                {/* Empty cells so the 1st lands on the right weekday (weeks start Monday). */}
                {Array.from({ length: (new Date(`${month.days[0].key}T00:00:00Z`).getUTCDay() + 6) % 7 }, (_, i) => <div key={`pad-${i}`} />)}
                {month.days.map(day => (
                  <button
                    key={day.key}
                    disabled={!day.inRange}
                    onClick={() => pickDay(day.key)}
                    title={day.inRange ? `${formatDayLong(day.key)}: ${formatCurrency(day.spend)} · ${LEVELS[day.level].label}` : undefined}
                    className={`relative h-12 sm:h-16 rounded-lg sm:rounded-xl p-1 sm:p-2 flex flex-col justify-between text-left transition-all enabled:hover:scale-105 ${LEVELS[day.level].cell} ${
                      day.key === selected?.key ? 'ring-2 ring-indigo-600 ring-offset-1' : ''
                    }`}
                  >
                    <span className="text-[10px] sm:text-xs font-bold">{Number(day.key.slice(8))}</span>
                    {day.inRange && day.spend > 0 && (
                      <span className="text-[9px] sm:text-[11px] font-black leading-none truncate">{formatCompact(day.spend)}</span>
                    )}
                    {day.bills > 0 && <span className="absolute top-1 right-1 w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-indigo-600" />}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
            {(['under', 'near', 'over', 'none'] as DayLevel[]).map(level => (
              <span key={level} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded ${LEVELS[level].cell}`} />
                {LEVELS[level].label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-600" />
              Bill paid
            </span>
          </div>
        </div>

        {/* Selected day */}
        {selected && (
          <div ref={detailRef} className="scroll-mt-24 lg:col-span-2 bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-100 lg:sticky lg:top-28 self-start space-y-5">
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => onSelect(tracked[position - 1].key)}
                disabled={position <= 0}
                className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30"
                aria-label="Previous day"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="text-center">
                <p className="text-lg font-black text-slate-900">{formatDayLong(selected.key)}</p>
                <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${LEVELS[selected.level].chip}`}>
                  {LEVELS[selected.level].label}
                </span>
              </div>
              <button
                onClick={() => onSelect(tracked[position + 1].key)}
                disabled={position >= tracked.length - 1}
                className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30"
                aria-label="Next day"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <p className="text-3xl font-black text-slate-900">{formatCurrency(selected.spend)}</p>
                {selected.bills > 0 && <p className="text-sm text-slate-500">+ {formatCurrency(selected.bills)} bills</p>}
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mt-3">
                <div
                  className={`h-full ${LEVELS[selected.level].bar}`}
                  style={{ width: `${Math.min((selected.spend / Math.max(daily.dailyLimit, 1)) * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1.5">of your {formatCurrency(daily.dailyLimit)} daily limit</p>
            </div>

            <ul className="space-y-2 text-sm text-slate-700">
              {selected.insights.map((insight, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-indigo-600">•</span>
                  {insight}
                </li>
              ))}
            </ul>

            {selected.transactions.length > 0 && (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {selected.transactions.map(t => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{t.merchant}</p>
                      <p className="text-xs text-slate-400">{t.category}</p>
                    </div>
                    <span className={`font-black shrink-0 ${t.type === TransactionType.CREDIT ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {t.type === TransactionType.CREDIT ? '+' : '-'}{formatCurrency(t.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={() => onAsk(`What happened on ${formatDayLong(selected.key)}? Was it a normal day for me?`)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-bold hover:bg-indigo-100 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Ask about this day
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
