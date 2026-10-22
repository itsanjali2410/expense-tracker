
import React, { useMemo, useState } from 'react';
import { Transaction, TransactionType, CurrencyConfig } from '../../types';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';

interface TransactionTableProps {
  transactions: Transaction[];
  currency: CurrencyConfig;
}

export const TransactionTable: React.FC<TransactionTableProps> = ({ transactions, currency }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filteredAndSorted = useMemo(() => {
    return [...transactions]
      .filter(t => 
        t.merchant.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
        t.category.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return sortDir === 'asc' ? dateA - dateB : dateB - dateA;
      });
  }, [transactions, searchTerm, sortDir]);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat(currency.locale, { style: 'currency', currency: currency.code }).format(val);

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'Groceries': return 'bg-emerald-100 text-emerald-700';
      case 'Dining Out': return 'bg-orange-100 text-orange-700';
      case 'Food Delivery': return 'bg-orange-100 text-orange-800';
      case 'Transport': return 'bg-teal-100 text-teal-700';
      case 'Rent': return 'bg-stone-200 text-stone-700';
      case 'Debt & EMI': return 'bg-red-100 text-red-800';
      case 'Electronics': return 'bg-blue-100 text-blue-700';
      case 'Clothing': return 'bg-purple-100 text-purple-700';
      case 'Travel': return 'bg-sky-100 text-sky-700';
      case 'Healthcare': return 'bg-rose-100 text-rose-700';
      case 'Education': return 'bg-indigo-100 text-indigo-700';
      case 'Entertainment': return 'bg-pink-100 text-pink-700';
      case 'Home Improvement': return 'bg-amber-100 text-amber-700';
      case 'Utilities & Bills': return 'bg-slate-200 text-slate-700';
      case 'Subscriptions': return 'bg-violet-100 text-violet-700';
      case 'Salary': return 'bg-green-100 text-green-700';
      case 'Investments': return 'bg-cyan-100 text-cyan-700';
      case 'Bank Fees': return 'bg-red-100 text-red-700';
      case 'Transfers': return 'bg-zinc-100 text-zinc-700';
      default: return 'bg-slate-100 text-slate-500';
    }
  };

  return (
    <div className="bg-white rounded-4xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-xl font-bold text-slate-900">Transactions</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search merchant or category..."
            className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full sm:w-64"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 text-slate-500 text-xs font-bold uppercase tracking-widest">
              <th className="px-8 py-5 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')}>
                <div className="flex items-center gap-1">Date {sortDir === 'asc' ? <ChevronUp className="w-3" /> : <ChevronDown className="w-3" />}</div>
              </th>
              <th className="px-8 py-5">Merchant / Description</th>
              <th className="px-8 py-5">Category</th>
              <th className="px-8 py-5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredAndSorted.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50/80 transition-all duration-200 group">
                <td className="px-8 py-5 text-sm text-slate-500 whitespace-nowrap">{new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                <td className="px-8 py-5">
                  <p className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{t.merchant}</p>
                  {t.description !== t.merchant && <p className="text-xs text-slate-400 mt-0.5 break-all">{t.description}</p>}
                </td>
                <td className="px-8 py-5">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${getCategoryColor(t.category)}`}>
                    {t.category}
                  </span>
                </td>
                <td className={`px-8 py-5 text-sm font-black text-right ${t.type === TransactionType.CREDIT ? 'text-emerald-600' : 'text-slate-900'}`}>
                  {t.type === TransactionType.DEBIT ? '-' : '+'} {formatCurrency(t.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
