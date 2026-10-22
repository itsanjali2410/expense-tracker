import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Upload, FileText, AlertCircle, Loader2, Sparkles, ChevronDown, Globe, Target, Settings2 } from 'lucide-react';
import { Transaction, TransactionType, SummaryStats, CurrencyCode, CURRENCIES } from '../types';
import { processStatement, API_VERSION, BUILD_TIME } from '../services/api';
import { SummaryCards } from './components/SummaryCards';
import { SpendingCharts } from './components/SpendingCharts';
import { TransactionTable } from './components/TransactionTable';
import { AnalysisPanel } from './components/AnalysisPanel';
import { BudgetModal } from './components/BudgetModal';

const LOADING_STEPS = [
  "Decrypting PDF layers...",
  "Running deep OCR scans...",
  "Semantic transaction matching...",
  "Sub-categorizing Shopping & Travel...",
  "Detecting recurring patterns...",
  "Finalizing financial dashboard..."
];

const App: React.FC = () => {
  const [isMounted, setIsMounted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>('INR');
  const [budgets, setBudgets] = useState<Record<string, number>>({});

  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem('user_budgets');
    if (saved) setBudgets(JSON.parse(saved));
  }, []);

  const saveBudgets = useCallback((newBudgets: Record<string, number>) => {
    setBudgets(newBudgets);
    localStorage.setItem('user_budgets', JSON.stringify(newBudgets));
  }, []);

  useEffect(() => {
    let interval: any;
    if (isProcessing) {
      interval = setInterval(() => {
        setLoadingStep(prev => (prev + 1) % LOADING_STEPS.length);
      }, 2000);
    } else {
      setLoadingStep(0);
    }
    return () => clearInterval(interval);
  }, [isProcessing]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Please upload a valid PDF bank statement.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const extracted = await processStatement(file);
      setTransactions(extracted);
    } catch (err: any) {
      setError(err.message || 'Analysis failed. Try a clearer PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const stats: SummaryStats = useMemo(() => {
    if (transactions.length === 0) {
      return {
        totalIncome: 0,
        totalExpenses: 0,
        netBalance: 0,
        transactionCount: 0,
        averageDailyExpense: 0,
        highestSpendingDay: { date: 'N/A', amount: 0 },
        categoryTotals: {}
      };
    }

    const income = transactions.filter(t => t.type === TransactionType.CREDIT).reduce((sum, t) => sum + t.amount, 0);
    const expenses = transactions.filter(t => t.type === TransactionType.DEBIT).reduce((sum, t) => sum + t.amount, 0);
    const dailyExpensesMap = transactions.filter(t => t.type === TransactionType.DEBIT).reduce((acc, t) => {
      acc[t.date] = (acc[t.date] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

    const categoryTotals = transactions.filter(t => t.type === TransactionType.DEBIT).reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

    const uniqueDays = Object.keys(dailyExpensesMap).length;
    const avgDaily = uniqueDays > 0 ? expenses / uniqueDays : 0;
    let highestDay = { date: 'N/A', amount: 0 };
    Object.entries(dailyExpensesMap).forEach(([date, amount]: [string, number]) => {
      if (amount > highestDay.amount) highestDay = { date, amount };
    });

    return { totalIncome: income, totalExpenses: expenses, netBalance: income - expenses, transactionCount: transactions.length, averageDailyExpense: avgDaily, highestSpendingDay: highestDay, categoryTotals };
  }, [transactions]);

  if (!isMounted) return null;

  return (
    <div className="min-h-screen pb-10 sm:pb-20 bg-[#f8fafc]">
      {/* Navbar - Sticky and Blurred */}
      <nav className="bg-white/80 backdrop-blur-xl border-b border-slate-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 sm:h-20 items-center">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="bg-linear-to-br from-indigo-600 to-indigo-700 p-2 rounded-xl sm:rounded-2xl shadow-lg shadow-indigo-100">
                <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight leading-none">Smart Spend</h1>
                <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Cognitive Layer 1</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3">
              <button 
                onClick={() => setShowBudgetModal(true)}
                className="hidden sm:flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-white hover:border-indigo-500 hover:text-indigo-600 transition-all"
              >
                <Target className="w-4 h-4" />
                Budgets
              </button>
              
              <div className="relative group">
                <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 sm:px-4 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black text-white cursor-pointer hover:bg-indigo-600 transition-all shadow-md">
                  <Globe className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  {selectedCurrency}
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </div>
                <div className="absolute right-0 mt-3 w-40 sm:w-48 bg-white border border-slate-100 rounded-2xl shadow-2xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  {(Object.keys(CURRENCIES) as CurrencyCode[]).map(code => (
                    <button
                      key={code}
                      onClick={() => setSelectedCurrency(code)}
                      className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors ${selectedCurrency === code ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                      {CURRENCIES[code].symbol} {code}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10">
        {/* Empty State / Upload Hero */}
        {!transactions.length && !isProcessing && (
          <div className="max-w-2xl mx-auto mt-10 sm:mt-20 text-center animate-in fade-in slide-in-from-bottom-6 duration-700">
            <h2 className="text-3xl sm:text-5xl font-black text-slate-900 mb-4 sm:mb-6 tracking-tighter">
              Your financial data, <br/>
              <span className="text-transparent bg-clip-text bg-linear-to-r from-indigo-600 to-indigo-400">completely decoded.</span>
            </h2>
            <p className="text-slate-500 text-base sm:text-xl mb-8 sm:mb-12 leading-relaxed px-4">
              Upload bank PDFs to see granular categories like Electronics vs Clothing and set monthly budget targets.
            </p>

            <div className="relative group max-w-md mx-auto px-4 sm:px-0">
              <input type="file" accept="application/pdf" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
              <div className="border-2 border-dashed border-slate-200 group-hover:border-indigo-600 group-hover:bg-indigo-50/20 bg-white p-10 sm:p-20 rounded-4xl sm:rounded-[3rem] transition-all flex flex-col items-center gap-6 sm:gap-8 shadow-sm">
                <div className="p-4 sm:p-6 bg-indigo-50 rounded-3xl sm:rounded-4xl group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500 shadow-sm">
                  <Upload className="w-8 h-8 sm:w-12 sm:h-12 text-indigo-600" />
                </div>
                <div className="space-y-1 sm:space-y-2">
                  <p className="text-xl sm:text-2xl font-black text-slate-900">Scan Statement</p>
                  <p className="text-[9px] sm:text-xs text-slate-400 font-black uppercase tracking-widest opacity-80">Support All Major Global Banks</p>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-8 mx-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-700 shadow-sm animate-in zoom-in-95">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="text-[10px] sm:text-xs font-bold uppercase tracking-tight text-left">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Processing State */}
        {isProcessing && (
          <div className="max-w-md mx-auto mt-20 sm:mt-40 text-center px-6 animate-in fade-in duration-500">
            <div className="flex flex-col items-center gap-8 sm:gap-10">
              <div className="relative">
                <div className="w-20 h-20 sm:w-32 sm:h-32 border-4 sm:border-[6px] border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-3 h-3 bg-indigo-600 rounded-full animate-ping"></div>
                </div>
              </div>
              <div className="space-y-4 sm:space-y-5 w-full">
                <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tighter">Analyzing Finance</h3>
                <div className="h-6 sm:h-8 overflow-hidden">
                   <p className="text-indigo-600 font-black uppercase tracking-widest text-[10px] sm:text-xs animate-in slide-in-from-bottom-2 duration-300">
                    {LOADING_STEPS[loadingStep]}
                  </p>
                </div>
                <div className="w-full bg-slate-200 h-1.5 sm:h-2 rounded-full mt-4 overflow-hidden">
                  <div 
                    className="bg-indigo-600 h-full transition-all duration-1000 ease-out" 
                    style={{ width: `${((loadingStep + 1) / LOADING_STEPS.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dashboard Content */}
        {transactions.length > 0 && !isProcessing && (
          <div className="space-y-8 sm:space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            {/* Dashboard Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tighter">Insights Dashboard</h2>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[8px] sm:text-[10px] mt-1 sm:mt-2">Analysis generated via Cognitive Engine</p>
              </div>
              <div className="flex flex-wrap gap-2 sm:gap-3">
                <button 
                  onClick={() => setShowBudgetModal(true)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl sm:rounded-2xl text-[10px] sm:text-xs font-black text-slate-600 hover:border-indigo-500 shadow-sm transition-all"
                >
                  <Settings2 className="w-4 h-4" />
                  Budgets
                </button>
                <button 
                  onClick={() => { setTransactions([]); setError(null); }}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 rounded-xl sm:rounded-2xl text-[10px] sm:text-xs font-black text-white hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all"
                >
                  <FileText className="w-4 h-4" />
                  New Upload
                </button>
              </div>
            </div>

            <SummaryCards stats={stats} currency={CURRENCIES[selectedCurrency]} />

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 sm:gap-10">
              <div className="xl:col-span-8 space-y-8 sm:space-y-10 order-2 xl:order-1">
                <SpendingCharts transactions={transactions} currency={CURRENCIES[selectedCurrency]} />
                {/* Horizontal scroll container for table on small screens */}
                <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                  <TransactionTable transactions={transactions} currency={CURRENCIES[selectedCurrency]} />
                </div>
              </div>
              <div className="xl:col-span-4 order-1 xl:order-2">
                <div className="xl:sticky xl:top-28 space-y-8 sm:space-y-10">
                  <AnalysisPanel stats={stats} currency={CURRENCIES[selectedCurrency]} budgets={budgets} />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {showBudgetModal && (
        <BudgetModal 
          budgets={budgets} 
          onSave={saveBudgets} 
          onClose={() => setShowBudgetModal(false)}
          currencyCode={selectedCurrency}
        />
      )}

      <footer className="mt-20 sm:mt-32 py-8 sm:py-12 border-t border-slate-100 text-center px-4">
        <p className="text-[8px] sm:text-xs font-black text-slate-300 uppercase tracking-[0.2em] leading-relaxed">
          Gemini Secure • Privacy First • Local Session Only
        </p>
        <p className="mt-2 text-[8px] sm:text-[10px] font-mono text-slate-300">
          API {API_VERSION} • Built {BUILD_TIME}
        </p>
      </footer>
    </div>
  );
};

export default App;