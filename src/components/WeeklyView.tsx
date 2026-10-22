import React, { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarDays, ChevronDown, X } from 'lucide-react';
import { CurrencyConfig, Transaction, TransactionType } from '../../types';
import { Analysis, WeekMode, toDay } from '../../services/analytics';
import { DailyAnalysis } from '../../services/daily';

interface WeeklyViewProps {
  analysis: Analysis;
  daily: DailyAnalysis;
  transactions: Transaction[];
  currency: CurrencyConfig;
  onModeChange: (mode: WeekMode) => void;
  onDaySelect: (key: string) => void;
}

const BUCKET_STYLES = [
  { key: 'need', label: 'Needs', className: 'bg-indigo-500' },
  { key: 'want', label: 'Wants', className: 'bg-amber-400' },
  { key: 'savings', label: 'Invested', className: 'bg-emerald-500' },
  { key: 'other', label: 'Transfers', className: 'bg-slate-300' },
] as const;

export const WeeklyView: React.FC<WeeklyViewProps> = ({ analysis, daily, transactions, currency, onModeChange, onDaySelect }) => {
  const [openWeek, setOpenWeek] = useState<string | null>(null);
  const [openCell, setOpenCell] = useState<{ category: string; weekKey: string } | null>(null);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat(currency.locale, { style: 'currency', currency: currency.code, maximumFractionDigits: 0 }).format(val);

  const { weeks, heatmapCategories } = analysis;
  const maxSpend = Math.max(...weeks.map(w => w.spend), 1);
  const maxCell = Math.max(...weeks.flatMap(w => heatmapCategories.map(c => w.categories[c] || 0)), 1);

  const cellWeek = weeks.find(w => w.key === openCell?.weekKey);
  const cellTransactions = openCell && cellWeek
    ? transactions.filter(t => {
      const day = toDay(t.date);
      return t.type === TransactionType.DEBIT && t.category === openCell.category && day >= cellWeek.start && day <= cellWeek.end;
    })
    : [];

  return (
    <div className="space-y-8">
      {/* Weekly burn */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-indigo-600" />
            Week by week
          </h3>
          <div className="flex bg-slate-100 rounded-xl p-1 text-xs font-bold">
            <button
              onClick={() => onModeChange('calendar')}
              className={`px-3 py-1.5 rounded-lg transition-all ${analysis.mode === 'calendar' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
            >
              Calendar weeks
            </button>
            <button
              onClick={() => onModeChange('payday')}
              disabled={!analysis.hasPayday}
              title={analysis.hasPayday ? undefined : 'No salary credit found in this statement'}
              className={`px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 ${analysis.mode === 'payday' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
            >
              From payday
            </button>
          </div>
        </div>

        <div className="space-y-5">
          {weeks.map(week => {
            const isOpen = openWeek === week.key;
            const weekDays = daily.days.filter(d => d.inRange && d.day >= week.start && d.day <= week.end);
            const maxDay = Math.max(...weekDays.map(d => d.spend + d.bills), 1);
            return (
              <div key={week.key}>
                <button onClick={() => setOpenWeek(isOpen ? null : week.key)} className="w-full text-left group">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-2">
                    <div className="flex items-center">
                      <ChevronDown className={`w-4 h-4 mr-1 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      <span className="font-bold text-slate-900 group-hover:text-indigo-600">{week.label}</span>
                      <span className="text-xs text-slate-400 ml-2">{week.range}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-black text-slate-900">{formatCurrency(week.spend)}</span>
                      <span className="text-xs text-slate-400">{formatCurrency(week.perDay)}/day</span>
                      {week.changePct !== null && (
                        <span className={`flex items-center text-xs font-bold ${week.changePct > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {week.changePct > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          {Math.abs(Math.round(week.changePct))}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex h-3 rounded-full overflow-hidden bg-slate-100" style={{ width: `${Math.max((week.spend / maxSpend) * 100, 2)}%` }}>
                    {BUCKET_STYLES.map(bucket => week.buckets[bucket.key] > 0 && (
                      <div
                        key={bucket.key}
                        className={bucket.className}
                        style={{ width: `${(week.buckets[bucket.key] / week.spend) * 100}%` }}
                        title={`${bucket.label}: ${formatCurrency(week.buckets[bucket.key])}`}
                      />
                    ))}
                  </div>
                </button>

                {isOpen && (
                  <div className="mt-4 p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-end gap-2 h-32">
                      {weekDays.map(day => (
                        <button
                          key={day.key}
                          onClick={() => onDaySelect(day.key)}
                          title="Open this day"
                          className="flex-1 h-full flex flex-col items-center justify-end gap-1 group/day"
                        >
                          <span className="text-[10px] font-bold text-slate-500">{day.spend + day.bills > 0 ? formatCurrency(day.spend + day.bills) : '–'}</span>
                          <div className="w-full flex flex-col justify-end rounded-md overflow-hidden group-hover/day:opacity-80" style={{ height: `${((day.spend + day.bills) / maxDay) * 70}%` }}>
                            {day.bills > 0 && <div className="bg-indigo-300" style={{ height: `${(day.bills / (day.spend + day.bills)) * 100}%` }} />}
                            {day.spend > 0 && <div className="bg-indigo-600 flex-1" />}
                          </div>
                          <span className="text-[10px] text-slate-500 whitespace-nowrap">
                            {new Date(`${day.key}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-3">Light part = bills. Tap a day for its full story.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-4 mt-6 text-xs text-slate-500">
          {BUCKET_STYLES.map(bucket => (
            <span key={bucket.key} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${bucket.className}`} />
              {bucket.label}
            </span>
          ))}
          <span className="text-slate-400">Arrows compare daily spending with the previous week. Tap a week to see its days.</span>
        </div>
      </div>

      {/* Category heatmap */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-xl font-bold text-slate-900 mb-1">What dominated each week</h3>
        <p className="text-xs text-slate-400 mb-6">Darker means more money spent. Tap a box to see the payments behind it.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-1">
            <thead>
              <tr>
                <th />
                {weeks.map(week => (
                  <th key={week.key} className="font-bold text-slate-500 px-2 pb-1 whitespace-nowrap">{week.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmapCategories.map(category => (
                <tr key={category}>
                  <td className="font-bold text-slate-700 pr-3 whitespace-nowrap">{category}</td>
                  {weeks.map(week => {
                    const value = week.categories[category] || 0;
                    const intensity = value / maxCell;
                    const isOpen = openCell?.category === category && openCell.weekKey === week.key;
                    return (
                      <td
                        key={week.key}
                        onClick={() => value && setOpenCell(isOpen ? null : { category, weekKey: week.key })}
                        className={`rounded-lg px-2 py-2 text-center whitespace-nowrap font-semibold ${value ? 'cursor-pointer hover:ring-2 hover:ring-indigo-300' : ''} ${isOpen ? 'ring-2 ring-indigo-600' : ''}`}
                        style={{
                          backgroundColor: value ? `rgba(79, 70, 229, ${0.08 + intensity * 0.85})` : '#f8fafc',
                          color: intensity > 0.45 ? 'white' : '#334155',
                        }}
                      >
                        {value ? formatCurrency(value) : '–'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {openCell && cellWeek && (
          <div className="mt-4 p-4 bg-slate-50 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <p className="font-bold text-slate-900 text-sm">{openCell.category} in {cellWeek.label} ({cellWeek.range})</p>
              <button onClick={() => setOpenCell(null)} className="p-1 rounded-lg hover:bg-slate-200" aria-label="Close">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <ul className="divide-y divide-slate-200">
              {cellTransactions.map(t => (
                <li key={t.id}>
                  <button onClick={() => onDaySelect(t.date)} className="w-full flex justify-between gap-3 py-2 text-sm text-left hover:text-indigo-600">
                    <span>
                      <span className="font-bold">{t.merchant}</span>
                      <span className="text-slate-400 ml-2">{new Date(`${t.date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>
                    </span>
                    <span className="font-black">{formatCurrency(t.amount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
