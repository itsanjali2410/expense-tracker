
import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Transaction, TransactionType, CurrencyConfig } from '../../types';

interface SpendingChartsProps {
  transactions: Transaction[];
  currency: CurrencyConfig;
  onCategorySelect: (category: string) => void;
  onDaySelect: (date: string) => void;
}

export const SpendingCharts: React.FC<SpendingChartsProps> = ({ transactions, currency, onCategorySelect, onDaySelect }) => {
  const categoryData = useMemo(() => {
    const summary = transactions
      .filter(t => t.type === TransactionType.DEBIT)
      .reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>);

    return (Object.entries(summary) as [string, number][])
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  const barData = useMemo(() => {
    const dailyExpenses = transactions
      .filter(t => t.type === TransactionType.DEBIT)
      .reduce((acc, t) => {
        acc[t.date] = (acc[t.date] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>);

    return (Object.entries(dailyExpenses) as [string, number][])
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-7); 
  }, [transactions]);

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#ef4444', '#8b5cf6', '#06b6d4', '#64748b', '#fb7185', '#2dd4bf'];

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat(currency.locale, { style: 'currency', currency: currency.code, maximumFractionDigits: 0 }).format(val);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-semibold text-slate-900">Expense Distribution</h3>
        <p className="text-xs text-slate-400 mb-4">Tap a slice to see its transactions.</p>
        <div className="h-75 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={90}
                paddingAngle={4}
                dataKey="value"
                className="cursor-pointer"
                onClick={(entry: any) => onCategorySelect(entry.name ?? entry.payload?.name)}
              >
                {categoryData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '11px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-semibold text-slate-900">Recent Daily Trend</h3>
        <p className="text-xs text-slate-400 mb-4">Tap a bar to open that day.</p>
        <div className="h-75 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{fontSize: 11}} tickFormatter={(str) => new Date(str).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})} axisLine={false} tickLine={false} />
              <YAxis tick={{fontSize: 11}} axisLine={false} tickLine={false} tickFormatter={(val) => `${currency.symbol}${val}`} />
              <Tooltip cursor={{fill: '#f8fafc'}} formatter={(value: number) => [formatCurrency(value), 'Spent']} />
              <Bar
                dataKey="amount"
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
                className="cursor-pointer"
                onClick={(entry: any) => onDaySelect(entry.payload?.date ?? entry.date)}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
