import React from 'react';
import { AlertTriangle, Coins, Lightbulb, Loader2, PieChart, Repeat, Sparkles, TrendingUp } from 'lucide-react';
import { CurrencyConfig } from '../../types';
import { Analysis, RecurringCharge } from '../../services/analytics';
import { WeeklyInsights } from '../../services/api';

interface InsightsViewProps {
  analysis: Analysis;
  currency: CurrencyConfig;
  aiInsights: WeeklyInsights | null;
  aiLoading: boolean;
  aiError: string | null;
  onRetryAi: () => void;
}

const KIND_LABELS: Record<RecurringCharge['kind'], { label: string; className: string }> = {
  'fee': { label: 'Bank fee', className: 'bg-rose-100 text-rose-700' },
  'subscription': { label: 'Subscription', className: 'bg-violet-100 text-violet-700' },
  'auto-debit': { label: 'Auto-debit', className: 'bg-amber-100 text-amber-700' },
  'split': { label: 'Split charge', className: 'bg-sky-100 text-sky-700' },
};

const Card: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-100">
    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-5">
      {icon}
      {title}
    </h3>
    {children}
  </div>
);

const Empty: React.FC<{ text: string }> = ({ text }) => <p className="text-sm text-slate-400">{text}</p>;

export const InsightsView: React.FC<InsightsViewProps> = ({ analysis, currency, aiInsights, aiLoading, aiError, onRetryAi }) => {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat(currency.locale, { style: 'currency', currency: currency.code, maximumFractionDigits: 0 }).format(val);

  const { runway, split, moneySinks, spikes, recurring } = analysis;
  const splitRows = [
    { label: 'Needs', value: split.needs, target: 50, className: 'bg-indigo-500' },
    { label: 'Wants', value: split.wants, target: 30, className: 'bg-amber-400' },
    { label: 'Saved', value: Math.max(split.income - split.needs - split.wants, 0), target: 20, className: 'bg-emerald-500' },
  ];
  const suggestions = aiInsights?.suggestions.length ? aiInsights.suggestions : analysis.suggestions;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
      <Card title="Month-end projection" icon={<TrendingUp className="w-5 h-5 text-indigo-600" />}>
        {runway ? (
          <div className="space-y-3">
            {runway.income > 0 ? (
              <p className={`text-3xl font-black ${runway.projectedLeft >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {runway.projectedLeft >= 0
                  ? `${formatCurrency(runway.projectedLeft)} left`
                  : `${formatCurrency(-runway.projectedLeft)} short`}
              </p>
            ) : (
              <p className="text-3xl font-black text-slate-900">{formatCurrency(runway.projectedSpend)} spend</p>
            )}
            <p className="text-sm text-slate-500 leading-relaxed">
              At your Week 1–2 pace of <strong>{formatCurrency(runway.pacePerDay)}/day</strong> plus{' '}
              <strong>{formatCurrency(runway.fixed)}</strong> in fixed bills, {runway.periodLabel} spending will reach about{' '}
              <strong>{formatCurrency(runway.projectedSpend)}</strong> by day 30
              {runway.income > 0 && <> against <strong>{formatCurrency(runway.income)}</strong> income</>}.
            </p>
            {runway.actualSpend !== null && (
              <p className="text-xs text-slate-400">Actual spend for the full period: {formatCurrency(runway.actualSpend)}</p>
            )}
          </div>
        ) : (
          <Empty text="Needs at least a week of transactions to project." />
        )}
      </Card>

      <Card title="Needs vs wants (50/30/20)" icon={<PieChart className="w-5 h-5 text-indigo-600" />}>
        {split.income > 0 ? (
          <div className="space-y-4">
            {splitRows.map(row => {
              const pct = (row.value / split.income) * 100;
              return (
                <div key={row.label}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-bold text-slate-700">{row.label}</span>
                    <span className="text-slate-500">
                      <strong className="text-slate-900">{Math.round(pct)}%</strong> · target {row.target}%
                    </span>
                  </div>
                  <div className="relative h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${row.className}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    <div className="absolute top-0 h-full w-0.5 bg-slate-900/40" style={{ left: `${row.target}%` }} />
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-slate-400">Shares of income ({formatCurrency(split.income)}). The line marks the target.</p>
          </div>
        ) : (
          <Empty text="No income found in this statement, so the 50/30/20 split can't be calculated." />
        )}
      </Card>

      <Card title="Where did the money go?" icon={<Coins className="w-5 h-5 text-indigo-600" />}>
        {moneySinks.length || spikes.length ? (
          <ul className="space-y-3 text-sm text-slate-700">
            {moneySinks.map(sink => (
              <li key={sink.category} className="flex gap-3 p-3 bg-amber-50 rounded-xl">
                <Coins className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>{sink.count} small payments</strong> under {formatCurrency(analysis.microThreshold)} on {sink.category} added
                  up to <strong>{formatCurrency(sink.total)}</strong> ({sink.merchants.join(', ')}).
                </span>
              </li>
            ))}
            {spikes.map(spike => (
              <li key={`${spike.category}-${spike.week}`} className="flex gap-3 p-3 bg-rose-50 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>
                  <strong>{spike.category}</strong> jumped <strong>{Math.round(spike.changePct)}%</strong> in {spike.week} compared
                  to {spike.prevWeek} ({formatCurrency(spike.amount)}).
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="No money sinks or sudden spikes found. Nice!" />
        )}
      </Card>

      <Card title="Subscriptions & fees" icon={<Repeat className="w-5 h-5 text-indigo-600" />}>
        {recurring.length ? (
          <ul className="divide-y divide-slate-100">
            {recurring.map(charge => (
              <li key={`${charge.kind}-${charge.merchant}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 truncate">{charge.merchant}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${KIND_LABELS[charge.kind].className}`}>
                    {KIND_LABELS[charge.kind].label}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-slate-900">{formatCurrency(charge.total)}</p>
                  <p className="text-xs text-slate-400">{charge.count}×</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="No subscriptions, auto-debits or bank fees found." />
        )}
      </Card>

      <div className="lg:col-span-2">
        <Card title="Weekly debrief" icon={<Sparkles className="w-5 h-5 text-indigo-600" />}>
          {aiLoading && (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Writing your weekly summaries…
            </p>
          )}
          {aiError && !aiLoading && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-rose-600">
              <span>{aiError}</span>
              <button onClick={onRetryAi} className="px-3 py-1.5 rounded-lg border border-rose-200 font-bold hover:bg-rose-50">Try again</button>
            </div>
          )}
          {aiInsights && !aiLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {aiInsights.debriefs.map(debrief => (
                <div key={debrief.week} className="p-4 bg-slate-50 rounded-xl">
                  <p className="font-bold text-slate-900 mb-2">{debrief.week}</p>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
                    {debrief.bullets.slice(0, 3).map((bullet, i) => <li key={i}>{bullet}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card title="How to save next week" icon={<Lightbulb className="w-5 h-5 text-indigo-600" />}>
          {suggestions.length ? (
            <ul className="space-y-2 text-sm text-slate-700">
              {suggestions.map((suggestion, i) => (
                <li key={i} className="flex gap-3">
                  <span className="text-indigo-600 font-black">{i + 1}.</span>
                  {suggestion}
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="Your spending looks balanced. No quick wins to suggest." />
          )}
        </Card>
      </div>
    </div>
  );
};
