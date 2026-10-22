
import React, { useState } from 'react';
import { Category, CATEGORIES, CURRENCIES, CurrencyCode } from '../../types';
import { X, Save, Target } from 'lucide-react';

interface BudgetModalProps {
  budgets: Record<string, number>;
  onSave: (budgets: Record<string, number>) => void;
  onClose: () => void;
  currencyCode: CurrencyCode;
}

const BUDGET_CATEGORIES = CATEGORIES.filter(cat => cat !== 'Salary' && cat !== 'Transfers');

export const BudgetModal: React.FC<BudgetModalProps> = ({ budgets, onSave, onClose, currencyCode }) => {
  const [localBudgets, setLocalBudgets] = useState<Record<string, number>>(budgets);
  const currency = CURRENCIES[currencyCode];

  const handleInputChange = (cat: Category, value: string) => {
    const num = parseFloat(value) || 0;
    setLocalBudgets(prev => ({ ...prev, [cat]: num }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <Target className="w-5 h-5 text-indigo-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Set Monthly Budgets</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <p className="text-sm text-slate-500 mb-6 italic">
            Define your spending limits for each category to track progress in the Analysis Panel.
          </p>
          {BUDGET_CATEGORIES.map(cat => (
            <div key={cat} className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 transition-all focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500">
              <label className="text-sm font-semibold text-slate-700 w-1/2">{cat}</label>
              <div className="relative w-1/2">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">{currency.symbol}</span>
                <input
                  type="number"
                  value={localBudgets[cat] || ''}
                  onChange={(e) => handleInputChange(cat, e.target.value)}
                  placeholder="0"
                  className="w-full pl-8 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onSave(localBudgets);
              onClose();
            }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
          >
            <Save className="w-4 h-4" />
            Save Budgets
          </button>
        </div>
      </div>
    </div>
  );
};
