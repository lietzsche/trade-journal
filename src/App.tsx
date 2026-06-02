import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  Trash2,
  Search,
  Filter,
  Moon,
  Sun,
  LogOut,
  User,
  Mail,
  Lock,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Edit3,
  ShieldAlert,
  Coins
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';

// Types Definitions
interface UserData {
  id: number;
  email: string;
  nickname: string;
}

interface PortfolioItem {
  id: number;
  ticker: string;
  buyPrice: number;
  quantity: number;
  currentPrice: number;
  currency: 'KRW' | 'USD';
  memo?: string;
  updatedAt: string;
  pnlPercent: number;
  level: number;
  stopLoss: number;
  nextTarget: number;
  unrealizedPnL: number;
  marketValue: number;
}

interface Transaction {
  id: number;
  ticker: string;
  type: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  fee: number;
  currency: 'KRW' | 'USD';
  tradeDate: string;
  memo?: string;
  createdAt: string;
}

interface DashboardStats {
  totalRealizedPnL: number;
  totalUnrealizedPnL: number;
  winRate: number;
  closedTradesCount: number;
  totalPortfolioValue: number;
}

interface AlertMessage {
  ticker: string;
  message: string;
  type: 'warning' | 'danger';
}

export default function App() {
  // Authentication states
  const [token, setToken] = useState<string | null>(localStorage.getItem('stock_history_token'));
  const [user, setUser] = useState<UserData | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authNickname, setAuthNickname] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  // Application UI states
  const [activeTab, setActiveTab] = useState<'dashboard' | 'portfolio' | 'transactions'>('dashboard');
  const [darkMode, setDarkMode] = useState<boolean>(
    localStorage.getItem('theme') === 'dark' ||
    (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Core Data states
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    totalRealizedPnL: 0,
    totalUnrealizedPnL: 0,
    winRate: 0,
    closedTradesCount: 0,
    totalPortfolioValue: 0
  });
  const [allocationChart, setAllocationChart] = useState<{ name: string; value: number }[]>([]);
  const [historyChart, setHistoryChart] = useState<{ month: string; realized: number; cumulative: number }[]>([]);
  const [alerts, setAlerts] = useState<AlertMessage[]>([]);

  // Inline edit state for current price
  const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
  const [tempPriceValue, setTempPriceValue] = useState<string>('');

  // Transaction Filters state
  const [filterTicker, setFilterTicker] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Add Transaction Form state
  const [txTicker, setTxTicker] = useState('');
  const [txType, setTxType] = useState<'BUY' | 'SELL'>('BUY');
  const [txPrice, setTxPrice] = useState('');
  const [txQuantity, setTxQuantity] = useState('');
  const [txFee, setTxFee] = useState('0');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [txMemo, setTxMemo] = useState('');
  const [txError, setTxError] = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState<string | null>(null);

  // Multi-currency and Exchange Rate settings
  const [preferredCurrency, setPreferredCurrency] = useState<'KRW' | 'USD'>(
    (localStorage.getItem('preferred_currency') as 'KRW' | 'USD') || 'KRW'
  );
  const [exchangeRate, setExchangeRate] = useState<number>(
    Number(localStorage.getItem('exchange_rate') || '1350')
  );

  // Form currency states
  const [txCurrency, setTxCurrency] = useState<'KRW' | 'USD'>('KRW');

  // Edit Transaction Modal states
  const [editingTxId, setEditingTxId] = useState<number | null>(null);
  const [editTxTicker, setEditTxTicker] = useState('');
  const [editTxType, setEditTxType] = useState<'BUY' | 'SELL'>('BUY');
  const [editTxPrice, setEditTxPrice] = useState('');
  const [editTxQuantity, setEditTxQuantity] = useState('');
  const [editTxFee, setEditTxFee] = useState('0');
  const [editTxCurrency, setEditTxCurrency] = useState<'KRW' | 'USD'>('KRW');
  const [editTxDate, setEditTxDate] = useState('');
  const [editTxMemo, setEditTxMemo] = useState('');

  // Sync theme with system and body element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Auth User check on mount
  useEffect(() => {
    if (token) {
      checkAuthSession();
    }
  }, [token]);

  // Fetch all core data when user session is active or currency settings change
  useEffect(() => {
    if (user && token) {
      loadAllData();
    }
  }, [user, token, preferredCurrency, exchangeRate]);

  // Helper fetch function that automatically sets authorization headers
  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    headers.set('Content-Type', 'application/json');

    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      // Automatic session logout on expired tokens
      handleLogout();
      throw new Error('인증 세션이 만료되었습니다. 다시 로그인 해주세요.');
    }
    const data = await res.json() as any;
    if (!res.ok) {
      throw new Error(data.error || 'API 요청 도중 문제가 발생했습니다.');
    }
    return data;
  };

  const checkAuthSession = async () => {
    try {
      setLoading(true);
      const data = await fetchWithAuth('/api/auth/me');
      if (data.success && data.user) {
        setUser(data.user);
      }
    } catch (err) {
      console.error(err);
      handleLogout();
    } finally {
      setLoading(false);
    }
  };

  const loadAllData = async () => {
    try {
      setLoading(true);
      
      // Load Portfolio
      const portRes = await fetchWithAuth('/api/portfolio');
      if (portRes.success) {
        setPortfolio(portRes.portfolio);
      }

      // Load Transactions with active filters
      let txUrl = '/api/transactions';
      const params = new URLSearchParams();
      if (filterTicker) params.append('ticker', filterTicker);
      if (filterType !== 'ALL') params.append('type', filterType);
      if (filterStartDate) params.append('startDate', filterStartDate);
      if (filterEndDate) params.append('endDate', filterEndDate);
      if (params.toString()) {
        txUrl += `?${params.toString()}`;
      }
      
      const txRes = await fetchWithAuth(txUrl);
      if (txRes.success) {
        setTransactions(txRes.transactions);
      }

      // Load Dashboard Stats (with preferredCurrency and exchangeRate query params)
      const dashRes = await fetchWithAuth(`/api/dashboard?preferredCurrency=${preferredCurrency}&exchangeRate=${exchangeRate}`);
      if (dashRes.success) {
        setDashboardStats(dashRes.stats);
        setAllocationChart(dashRes.charts.allocation);
        setHistoryChart(dashRes.charts.history);
        setAlerts(dashRes.alerts);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number, cur: string = 'KRW') => {
    if (cur === 'USD') {
      return '$' + Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return Number(val).toLocaleString('ko-KR') + '원';
  };

  // Auth Action Handlers
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setActionLoading(true);

    try {
      if (authMode === 'signin') {
        const data = await fetch('/api/auth/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: authEmail, password: authPassword }),
        });
        const res = await data.json() as any;
        if (!data.ok) throw new Error(res.error || '로그인 실패');

        localStorage.setItem('stock_history_token', res.token);
        setToken(res.token);
        setUser(res.user);
      } else {
        const data = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: authEmail, password: authPassword, nickname: authNickname }),
        });
        const res = await data.json() as any;
        if (!data.ok) throw new Error(res.error || '회원가입 실패');

        setAuthSuccess('회원가입이 완료되었습니다. 로그인 해주세요.');
        setAuthMode('signin');
        setAuthNickname('');
        setAuthPassword('');
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('stock_history_token');
    setToken(null);
    setUser(null);
    setPortfolio([]);
    setTransactions([]);
    setAlerts([]);
  };

  // Transaction Addition
  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxError(null);
    setTxSuccess(null);
    setActionLoading(true);

    try {
      await fetchWithAuth('/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          ticker: txTicker,
          type: txType,
          price: parseFloat(txPrice),
          quantity: parseFloat(txQuantity),
          fee: parseFloat(txFee || '0'),
          currency: txCurrency,
          tradeDate: txDate,
          memo: txMemo,
        }),
      });

      setTxSuccess('거래 기록이 추가되었으며 포트폴리오가 연동 반영되었습니다!');
      // Reset form (keep date and fee baseline)
      setTxTicker('');
      setTxPrice('');
      setTxQuantity('');
      setTxMemo('');
      
      // Reload
      await loadAllData();
    } catch (err: any) {
      setTxError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Transaction Editing Submission
  const handleEditTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTxId === null) return;
    setActionLoading(true);

    try {
      await fetchWithAuth(`/api/transactions/${editingTxId}`, {
        method: 'PUT',
        body: JSON.stringify({
          ticker: editTxTicker,
          type: editTxType,
          price: parseFloat(editTxPrice),
          quantity: parseFloat(editTxQuantity),
          fee: parseFloat(editTxFee || '0'),
          currency: editTxCurrency,
          tradeDate: editTxDate,
          memo: editTxMemo,
        }),
      });

      setEditingTxId(null); // Close modal
      await loadAllData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Helper to open edit modal
  const startEditTransaction = (tx: any) => {
    setEditingTxId(tx.id);
    setEditTxTicker(tx.ticker);
    setEditTxType(tx.type);
    setEditTxPrice(tx.price.toString());
    setEditTxQuantity(tx.quantity.toString());
    setEditTxFee(tx.fee.toString());
    setEditTxCurrency(tx.currency || 'KRW');
    setEditTxDate(tx.tradeDate);
    setEditTxMemo(tx.memo || '');
  };

  // Transaction Deletion
  const handleDeleteTransaction = async (id: number) => {
    if (!confirm('이 거래 내역을 정말 삭제하시겠습니까? 삭제 시 보유 수량과 평단가가 원상 복구 및 재계산됩니다.')) return;
    setActionLoading(true);

    try {
      await fetchWithAuth(`/api/transactions/${id}`, {
        method: 'DELETE',
      });
      await loadAllData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Manual Current Price Update
  const handleSavePrice = async (portfolioId: number) => {
    const numericPrice = parseFloat(tempPriceValue);
    if (isNaN(numericPrice) || numericPrice < 0) {
      alert('올바른 현재가를 입력해주세요.');
      return;
    }

    try {
      setActionLoading(true);
      await fetchWithAuth(`/api/portfolio/${portfolioId}/price`, {
        method: 'POST',
        body: JSON.stringify({ currentPrice: numericPrice }),
      });
      setEditingPriceId(null);
      await loadAllData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartEditing = (item: PortfolioItem) => {
    setEditingPriceId(item.id);
    setTempPriceValue(item.currentPrice.toString());
  };

  // Render Login & Signup Form (Glassmorphic Interface)
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-950 via-slate-950 to-slate-950 text-slate-100 p-4 relative overflow-hidden">
        {/* Subtle glowing elements */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="w-full max-w-md z-10">
          <div className="text-center mb-8">
            <div className="inline-flex p-3 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl shadow-lg shadow-indigo-500/20 mb-3">
              <Coins className="w-8 h-8 text-white animate-pulse" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-200 via-slate-100 to-amber-200 bg-clip-text text-transparent">
              ANTIGRAVITY STOP
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              트레일링 스톱 자산 관리 & 실시간 거래 일지 플랫폼
            </p>
          </div>

          <div className="glass-panel rounded-3xl p-8 shadow-2xl relative border border-slate-800/80">
            <div className="flex border-b border-slate-800/80 pb-4 mb-6">
              <button
                onClick={() => { setAuthMode('signin'); setAuthError(null); }}
                className={`flex-1 text-center py-2 text-sm font-semibold transition-all ${
                  authMode === 'signin' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                로그인
              </button>
              <button
                onClick={() => { setAuthMode('signup'); setAuthError(null); }}
                className={`flex-1 text-center py-2 text-sm font-semibold transition-all ${
                  authMode === 'signup' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                회원가입
              </button>
            </div>

            {authError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {authSuccess && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{authSuccess}</span>
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'signup' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">닉네임</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      value={authNickname}
                      onChange={(e) => setAuthNickname(e.target.value)}
                      placeholder="홍길동"
                      className="w-full bg-slate-950/60 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">이메일 주소</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="example@email.com"
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">비밀번호</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98] disabled:opacity-50 text-sm flex items-center justify-center gap-2"
              >
                {actionLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
                {authMode === 'signin' ? '로그인 완료' : '계정 생성'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Color arrays for Recharts
  const PIE_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#f43f5e', '#8b5cf6', '#06b6d4', '#ec4899', '#3b82f6'];

  // Main UI Render (Authenticated View)
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100 flex flex-col transition-colors duration-300">
      
      {/* 1. Header Navigation */}
      <header className="sticky top-0 z-40 glass-panel border-b border-slate-200 dark:border-slate-800/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl shadow-md">
              <Coins className="w-5 h-5 text-white" />
            </div>
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-indigo-600 via-indigo-500 to-amber-500 dark:from-indigo-300 dark:to-amber-300 bg-clip-text text-transparent">
              ANTIGRAVITY STOP
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-6">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-200/50 dark:bg-slate-900/60 rounded-full border border-slate-300/40 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
              <User className="w-3.5 h-3.5 text-indigo-400" />
              <span>{user.nickname}님 환영합니다</span>
            </div>

            {/* Dark Mode Toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm"
              title="테마 토글"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
            </button>

            {/* Refresh Button */}
            <button
              onClick={loadAllData}
              disabled={loading}
              className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50"
              title="새로고침"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="p-2.5 bg-rose-500/10 dark:bg-rose-500/10 hover:bg-rose-500/20 dark:hover:bg-rose-500/20 rounded-xl border border-rose-500/20 text-rose-600 dark:text-rose-400 transition-colors shadow-sm flex items-center gap-2 text-xs font-bold"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Secondary Tab Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full mt-6">
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-1 overflow-x-auto pb-px">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`py-3 px-5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'dashboard'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            📊 대시보드 통계
          </button>
          <button
            onClick={() => setActiveTab('portfolio')}
            className={`py-3 px-5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'portfolio'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            🎯 보유 자산 & 트레일링 스톱
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`py-3 px-5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'transactions'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            📝 매매 거래 일지
          </button>
        </div>
      </div>

      {/* 3. Main Content Container */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-6">

        {/* Global Loading Overlay */}
        {loading && portfolio.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
            <p className="text-sm">데이터를 가볍게 불러오는 중입니다...</p>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* Tab 1: DASHBOARD */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            
            {/* Risk Warnings alerts panel */}
            {alerts.length > 0 && (
              <div className="space-y-2">
                {alerts.map((alert, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-2xl border flex items-start gap-3 shadow-sm ${
                      alert.type === 'danger'
                        ? 'bg-rose-500/10 border-rose-500/25 text-rose-800 dark:text-rose-300'
                        : 'bg-amber-500/10 border-amber-500/25 text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    <div className="mt-0.5">
                      {alert.type === 'danger' ? (
                        <ShieldAlert className="w-5 h-5 text-rose-500" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                      )}
                    </div>
                    <div>
                      <span className="font-extrabold text-sm block">[{alert.ticker}] 트레일링 스톱 리스크 경고</span>
                      <p className="text-xs mt-1 leading-relaxed">{alert.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Currency & Exchange Rate settings bar */}
            <div className="glass-panel rounded-2xl p-5 mb-6 shadow-sm border border-slate-200 dark:border-slate-800/80 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">대시보드 통화 및 환율 설정</h3>
                  <p className="text-slate-400 text-xs mt-0.5">대시보드의 합산 통화와 수동 환율 기준을 구성합니다.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 w-full md:w-auto justify-end">
                {/* Preferred Currency Toggle */}
                <div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded-xl p-1 border border-slate-200/50 dark:border-slate-800">
                  <button
                    onClick={() => {
                      setPreferredCurrency('KRW');
                      localStorage.setItem('preferred_currency', 'KRW');
                    }}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                      preferredCurrency === 'KRW'
                        ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    ₩ KRW (원화)
                  </button>
                  <button
                    onClick={() => {
                      setPreferredCurrency('USD');
                      localStorage.setItem('preferred_currency', 'USD');
                    }}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                      preferredCurrency === 'USD'
                        ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    $ USD (달러)
                  </button>
                </div>

                {/* Exchange Rate Input */}
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 rounded-xl px-3 py-1.5 border border-slate-200/50 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-500">수동 환율:</span>
                  <input
                    type="number"
                    value={exchangeRate}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 1;
                      setExchangeRate(val);
                      localStorage.setItem('exchange_rate', val.toString());
                    }}
                    className="w-20 bg-transparent text-xs font-bold font-mono focus:outline-none border-b border-transparent focus:border-emerald-500 text-right pr-1 dark:text-slate-100"
                    min="1"
                    step="0.1"
                  />
                  <span className="text-xs text-slate-400 font-bold">₩/$</span>
                </div>
              </div>
            </div>

            {/* Metrics cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Asset value card */}
              <div className="glass-panel glow-card rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800/80">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">보유 자산 평가총액</span>
                  <div className="p-2 bg-indigo-500/10 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-extrabold">
                  {preferredCurrency === 'USD' ? '$' : ''}
                  {dashboardStats.totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: preferredCurrency === 'USD' ? 2 : 0, maximumFractionDigits: preferredCurrency === 'USD' ? 2 : 0 })}
                  <span className="text-sm font-semibold text-slate-500 ml-1">{preferredCurrency === 'USD' ? 'USD' : '원'}</span>
                </div>
                <p className="text-slate-400 text-xs mt-2">현재 보유 자산의 시장 평가 총 가치</p>
              </div>

              {/* Unrealized P&L card */}
              <div className="glass-panel glow-card rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800/80">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">총 평가 손익 (Unrealized)</span>
                  <div className={`p-2 rounded-lg ${
                    dashboardStats.totalUnrealizedPnL >= 0
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  }`}>
                    {dashboardStats.totalUnrealizedPnL >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  </div>
                </div>
                <div className={`text-2xl font-extrabold ${
                  dashboardStats.totalUnrealizedPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'
                }`}>
                  {dashboardStats.totalUnrealizedPnL >= 0 ? '+' : ''}
                  {preferredCurrency === 'USD' ? '$' : ''}
                  {dashboardStats.totalUnrealizedPnL.toLocaleString(undefined, { minimumFractionDigits: preferredCurrency === 'USD' ? 2 : 0, maximumFractionDigits: preferredCurrency === 'USD' ? 2 : 0 })}
                  <span className="text-sm font-semibold ml-1">{preferredCurrency === 'USD' ? 'USD' : '원'}</span>
                </div>
                <p className="text-slate-400 text-xs mt-2">보유 중 종목들의 현재가 대비 총 이익</p>
              </div>

              {/* Realized P&L card */}
              <div className="glass-panel glow-card rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800/80">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">누적 실현 손익 (Realized)</span>
                  <div className={`p-2 rounded-lg ${
                    dashboardStats.totalRealizedPnL >= 0
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  }`}>
                    <CheckCircle className="w-4 h-4" />
                  </div>
                </div>
                <div className={`text-2xl font-extrabold ${
                  dashboardStats.totalRealizedPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'
                }`}>
                  {dashboardStats.totalRealizedPnL >= 0 ? '+' : ''}
                  {preferredCurrency === 'USD' ? '$' : ''}
                  {dashboardStats.totalRealizedPnL.toLocaleString(undefined, { minimumFractionDigits: preferredCurrency === 'USD' ? 2 : 0, maximumFractionDigits: preferredCurrency === 'USD' ? 2 : 0 })}
                  <span className="text-sm font-semibold ml-1">{preferredCurrency === 'USD' ? 'USD' : '원'}</span>
                </div>
                <p className="text-slate-400 text-xs mt-2">매도로 인해 실제로 확정된 누적 익절손익</p>
              </div>

              {/* Win Rate card */}
              <div className="glass-panel glow-card rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800/80">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">투자 승률 (Win Rate)</span>
                  <div className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg">
                    <Percent className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-extrabold">
                  {dashboardStats.winRate}%
                </div>
                <p className="text-slate-400 text-xs mt-2">
                  총 {dashboardStats.closedTradesCount}회 매도 중 수익 청산 성공 비율
                </p>
              </div>

            </div>

            {/* Graphs Layout Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Cumulative monthly profit chart */}
              <div className="glass-panel rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800/80 lg:col-span-2">
                <h3 className="text-base font-bold mb-6 flex items-center gap-2">
                  📈 월별 누적 실현 손익 곡선
                </h3>
                <div className="h-72 w-full text-xs">
                  {historyChart.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={historyChart}>
                        <defs>
                          <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0.01}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#334155' : '#e2e8f0'} />
                        <XAxis dataKey="month" stroke={darkMode ? '#94a3b8' : '#64748b'} />
                        <YAxis stroke={darkMode ? '#94a3b8' : '#64748b'} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: darkMode ? '#0f172a' : '#ffffff',
                            borderColor: darkMode ? '#334155' : '#cbd5e1',
                            color: darkMode ? '#f8fafc' : '#0f172a',
                          }}
                          formatter={(value) => [formatCurrency(Number(value), preferredCurrency), '누적 손익']}
                        />
                        <Area
                          type="monotone"
                          dataKey="cumulative"
                          stroke="#6366f1"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorCumulative)"
                          name={`누적 손익 (${preferredCurrency === 'USD' ? 'USD' : '원'})`}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400">
                      매매 로그의 매도(SELL) 기록이 쌓이면 실시간 누적 그래프가 그려집니다.
                    </div>
                  )}
                </div>
              </div>

              {/* Asset Allocation Chart */}
              <div className="glass-panel rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800/80">
                <h3 className="text-base font-bold mb-6 flex items-center gap-2">
                  🍰 자산 배분 비중 (Holdings Ratio)
                </h3>
                <div className="h-72 w-full flex flex-col items-center justify-center text-xs">
                  {allocationChart.length > 0 ? (
                    <>
                      <div className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={allocationChart}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {allocationChart.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: darkMode ? '#0f172a' : '#ffffff',
                                borderColor: darkMode ? '#334155' : '#cbd5e1',
                                color: darkMode ? '#f8fafc' : '#0f172a',
                              }}
                              formatter={(value) => formatCurrency(Number(value), preferredCurrency)}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4 px-2">
                        {allocationChart.map((entry, index) => (
                          <div key={entry.name} className="flex items-center gap-1.5">
                            <div
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                            />
                            <span className="font-semibold text-slate-500 dark:text-slate-400">
                              {entry.name} ({((entry.value / dashboardStats.totalPortfolioValue) * 100).toFixed(0)}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-slate-400 text-center">
                      보유 종목이 비어 있어 비중 원형 차트가 존재하지 않습니다.
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* Tab 2: PORTFOLIO & TRAILING STOP */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'portfolio' && (
          <div className="space-y-6">

            {/* Strategy guide banner */}
            <div className="glass-panel rounded-3xl p-6 border border-slate-200 dark:border-slate-800/80 shadow-sm relative overflow-hidden bg-gradient-to-r from-indigo-500/5 via-transparent to-amber-500/5">
              <h3 className="text-base font-extrabold text-indigo-600 dark:text-indigo-400 flex items-center gap-2 mb-2">
                ⚠️ 트레일링 스톱(Trailing Stop) 전략 안내 및 공식
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                시장의 등락 속에서 이미 확보된 이익을 안전하게 실현(익절)하고, 최초의 손실을 방지하기 위한 트레일링 스톱 규칙에 따라 백엔드 연산이 다음과 같이 실시간 적용됩니다.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div className="p-4 bg-white/50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800/60">
                  <span className="font-extrabold text-slate-700 dark:text-slate-200">1. 평가 손익률 (P&L%)</span>
                  <div className="font-mono text-slate-400 mt-1">((현재가 - 평단가) / 평단가) * 100</div>
                </div>
                <div className="p-4 bg-white/50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800/60">
                  <span className="font-extrabold text-slate-700 dark:text-slate-200">2. 익스톱 레벨 (Level)</span>
                  <div className="font-mono text-slate-400 mt-1">10% 상승마다 레벨 1씩 증가 (Lv = Math.floor(손익률/10))</div>
                </div>
                <div className="p-4 bg-white/50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800/60">
                  <span className="font-extrabold text-slate-700 dark:text-slate-200">3. 익절/손절가 (Stop Loss)</span>
                  <div className="font-mono text-slate-400 mt-1">
                    Lv ≤ 0 : 평단가 대비 -5%<br />
                    Lv ≥ 1 : 평단가 * (1 + (Lv - 1) * 0.1)
                  </div>
                </div>
                <div className="p-4 bg-white/50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800/60">
                  <span className="font-extrabold text-slate-700 dark:text-slate-200">4. 차기 목표가 (Target)</span>
                  <div className="font-mono text-slate-400 mt-1">
                    Lv &lt; 0 : 평단가(본전)<br />
                    Lv ≥ 0 : 평단가 * (1 + (Lv + 1) * 0.1)
                  </div>
                </div>
              </div>
            </div>

            {/* Holdings Table */}
            <div className="glass-panel rounded-3xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800/80">
              <div className="p-6 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between flex-wrap gap-4 bg-slate-100/40 dark:bg-slate-900/20">
                <div>
                  <h2 className="text-lg font-bold">🎯 실시간 보유 자산 모니터링</h2>
                  <p className="text-xs text-slate-400 mt-1">현재 주가를 수정하면 손절선과 차기 목표가가 자동 계산됩니다.</p>
                </div>
                <div className="text-xs text-slate-500 font-semibold bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  총 보유 종목: {portfolio.length}개
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-100/50 dark:bg-slate-900/40 text-slate-500 border-b border-slate-200 dark:border-slate-800/80 font-bold">
                      <th className="py-4 px-6">종목 티커</th>
                      <th className="py-4 px-6 text-right">보유 수량</th>
                      <th className="py-4 px-6 text-right">매입 평균 단가</th>
                      <th className="py-4 px-6 text-right">현재가 (수동입력)</th>
                      <th className="py-4 px-6 text-right">평가 금액</th>
                      <th className="py-4 px-6 text-right">평가 손익 (%)</th>
                      <th className="py-4 px-6 text-center">도달 레벨</th>
                      <th className="py-4 px-6 text-right text-rose-500">익절/손절가</th>
                      <th className="py-4 px-6 text-right text-indigo-500">차기 목표가</th>
                      <th className="py-4 px-6">메모</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
                    {portfolio.length > 0 ? (
                      portfolio.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-100/40 dark:hover:bg-slate-900/10 transition-colors">
                          <td className="py-4 px-6 font-extrabold tracking-wider">{item.ticker}</td>
                          <td className="py-4 px-6 text-right font-semibold">{item.quantity.toLocaleString()}개</td>
                          <td className="py-4 px-6 text-right font-mono">{formatCurrency(item.buyPrice, item.currency)}</td>
                          
                          {/* Current price editable cell */}
                          <td className="py-4 px-6 text-right">
                            {editingPriceId === item.id ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <input
                                  type="number"
                                  value={tempPriceValue}
                                  onChange={(e) => setTempPriceValue(e.target.value)}
                                  className="w-24 bg-white dark:bg-slate-900 border border-indigo-500 rounded px-2 py-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSavePrice(item.id);
                                    if (e.key === 'Escape') setEditingPriceId(null);
                                  }}
                                />
                                <button
                                  onClick={() => handleSavePrice(item.id)}
                                  disabled={actionLoading}
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded text-[10px] font-bold"
                                >
                                  저장
                                </button>
                                <button
                                  onClick={() => setEditingPriceId(null)}
                                  className="bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-300 px-2 py-1 rounded text-[10px]"
                                >
                                  취소
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-2 group">
                                <span className="font-mono font-bold">{formatCurrency(item.currentPrice, item.currency)}</span>
                                <button
                                  onClick={() => handleStartEditing(item)}
                                  className="text-slate-400 hover:text-indigo-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="현재가 수정"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>

                          <td className="py-4 px-6 text-right font-mono font-semibold">
                            {formatCurrency(item.marketValue, item.currency)}
                          </td>

                          {/* Realized/Unrealized color badges */}
                          <td className="py-4 px-6 text-right">
                            <div className="flex flex-col items-end">
                              <span className={`font-bold flex items-center gap-1 ${
                                item.unrealizedPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'
                              }`}>
                                {item.unrealizedPnL >= 0 ? '+' : ''}
                                {item.pnlPercent.toFixed(2)}%
                              </span>
                              <span className={`text-[10px] ${item.unrealizedPnL >= 0 ? 'text-emerald-500/80' : 'text-rose-500/80'}`}>
                                ({item.unrealizedPnL >= 0 ? '+' : ''}
                                {formatCurrency(item.unrealizedPnL, item.currency)})
                              </span>
                            </div>
                          </td>

                          {/* Level pill */}
                          <td className="py-4 px-6 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              item.level > 0
                                ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                                : 'bg-slate-200/60 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                            }`}>
                              Lv.{item.level}
                            </span>
                          </td>

                          {/* Stop Loss (If dynamic status warning is below target) */}
                          <td className="py-4 px-6 text-right font-bold font-mono">
                            <span className={item.currentPrice <= item.stopLoss ? 'text-rose-500 animate-pulse' : 'text-rose-500 dark:text-rose-400'}>
                              {formatCurrency(item.stopLoss, item.currency)}
                            </span>
                            {item.currentPrice <= item.stopLoss && (
                              <span className="block text-[9px] text-rose-500 font-extrabold uppercase mt-0.5">이탈 (STOP TRIGGERED)</span>
                            )}
                          </td>

                          {/* Next Target */}
                          <td className="py-4 px-6 text-right font-bold font-mono text-indigo-600 dark:text-indigo-400">
                            {formatCurrency(item.nextTarget, item.currency)}
                          </td>

                          <td className="py-4 px-6 text-slate-400 max-w-xs truncate" title={item.memo || ''}>
                            {item.memo || '-'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={10} className="py-12 px-6 text-center text-slate-400">
                          보유하고 있는 주식 자산이 없습니다. [매매 거래 일지] 탭에서 매수(BUY) 기록을 등록해 주세요.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* Tab 3: TRADE LOGS (Transactions) */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'transactions' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* Left Col: Add Transaction Form */}
            <div className="glass-panel rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800/80">
              <h2 className="text-base font-extrabold mb-4 flex items-center gap-2">
                ✍️ 신규 매매 거래 일지 작성
              </h2>

              {txError && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4.5 h-4.5 shrink-0" />
                  <span>{txError}</span>
                </div>
              )}

              {txSuccess && (
                <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
                  <CheckCircle className="w-4.5 h-4.5 shrink-0" />
                  <span>{txSuccess}</span>
                </div>
              )}

              <form onSubmit={handleAddTransaction} className="space-y-4 text-xs">
                
                {/* Ticker and Currency input */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-400 mb-1">종목 티커 *</label>
                    <input
                      type="text"
                      required
                      value={txTicker}
                      onChange={(e) => setTxTicker(e.target.value)}
                      placeholder="AAPL, TSLA, 005930 등"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 focus:outline-none focus:border-indigo-500 transition-colors dark:text-slate-100 uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">거래 통화 *</label>
                    <select
                      value={txCurrency}
                      onChange={(e) => setTxCurrency(e.target.value as 'KRW' | 'USD')}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 focus:outline-none focus:border-indigo-500 transition-colors font-bold text-slate-700 dark:text-slate-300"
                    >
                      <option value="KRW">₩ KRW</option>
                      <option value="USD">$ USD</option>
                    </select>
                  </div>
                </div>

                {/* Type Selection (BUY/SELL) */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">거래 구분 *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTxType('BUY')}
                      className={`py-2 px-4 rounded-xl font-bold border transition-all text-center ${
                        txType === 'BUY'
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500'
                      }`}
                    >
                      매수 (BUY)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTxType('SELL')}
                      className={`py-2 px-4 rounded-xl font-bold border transition-all text-center ${
                        txType === 'SELL'
                          ? 'bg-rose-500/10 border-rose-500 text-rose-600 dark:text-rose-400'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500'
                      }`}
                    >
                      매도 (SELL)
                    </button>
                  </div>
                </div>

                {/* Price and Quantity rows */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">체결 단가 (원) *</label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="any"
                      value={txPrice}
                      onChange={(e) => setTxPrice(e.target.value)}
                      placeholder="150000"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">체결 수량 (개) *</label>
                    <input
                      type="number"
                      required
                      min="0.0001"
                      step="any"
                      value={txQuantity}
                      onChange={(e) => setTxQuantity(e.target.value)}
                      placeholder="10"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Fee and Date rows */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">거래 수수료 (원)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={txFee}
                      onChange={(e) => setTxFee(e.target.value)}
                      placeholder="0"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">체결 일자 *</label>
                    <div className="relative">
                      <input
                        type="date"
                        required
                        value={txDate}
                        onChange={(e) => setTxDate(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Memo input */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">매매 메모</label>
                  <textarea
                    rows={3}
                    value={txMemo}
                    onChange={(e) => setTxMemo(e.target.value)}
                    placeholder="매수 이유 또는 지지선 저항선 돌파 관련 메모 기록"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl transition-all shadow-md active:scale-[0.98] text-xs flex items-center justify-center gap-2"
                >
                  {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  거래 기록 등록
                </button>

              </form>
            </div>

            {/* Right Col: Filters and Transactions list */}
            <div className="lg:col-span-2 space-y-4">
              
              {/* Advanced Filter Panel */}
              <div className="glass-panel rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800/80">
                <div className="flex items-center gap-2 mb-4">
                  <Filter className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-sm font-bold">🔍 거래 목록 필터 조건</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1">티커 검색</label>
                    <input
                      type="text"
                      placeholder="전체"
                      value={filterTicker}
                      onChange={(e) => setFilterTicker(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 focus:outline-none focus:border-indigo-500 transition-colors uppercase"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1">매매 구분</label>
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 focus:outline-none focus:border-indigo-500 transition-colors"
                    >
                      <option value="ALL">전체</option>
                      <option value="BUY">매수 (BUY)</option>
                      <option value="SELL">매도 (SELL)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1">조회 시작일</label>
                    <input
                      type="date"
                      value={filterStartDate}
                      onChange={(e) => setFilterStartDate(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1">조회 종료일</label>
                    <input
                      type="date"
                      value={filterEndDate}
                      onChange={(e) => setFilterEndDate(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-4 justify-end">
                  <button
                    onClick={() => {
                      setFilterTicker('');
                      setFilterType('ALL');
                      setFilterStartDate('');
                      setFilterEndDate('');
                    }}
                    className="px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-xl transition-colors text-xs font-semibold"
                  >
                    필터 초기화
                  </button>
                  <button
                    onClick={loadAllData}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                  >
                    <Search className="w-3.5 h-3.5" />
                    필터 적용
                  </button>
                </div>
              </div>

              {/* Transactions List Table */}
              <div className="glass-panel rounded-3xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800/80">
                <div className="p-4 bg-slate-100/40 dark:bg-slate-900/20 border-b border-slate-200 dark:border-slate-800/80 flex justify-between items-center text-xs">
                  <span className="font-extrabold text-slate-700 dark:text-slate-300">📋 거래내역 일지 로그</span>
                  <span className="text-slate-400">총 {transactions.length}건</span>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                    <thead>
                      <tr className="bg-slate-100/50 dark:bg-slate-900/40 text-slate-500 border-b border-slate-200 dark:border-slate-800/80 font-bold">
                        <th className="py-3.5 px-5">거래 날짜</th>
                        <th className="py-3.5 px-5">종목</th>
                        <th className="py-3.5 px-5 text-center">구분</th>
                        <th className="py-3.5 px-5 text-right">체결 단가</th>
                        <th className="py-3.5 px-5 text-right">체결 수량</th>
                        <th className="py-3.5 px-5 text-right">합계 금액</th>
                        <th className="py-3.5 px-5 text-right">수수료</th>
                        <th className="py-3.5 px-5">메모</th>
                        <th className="py-3.5 px-5 text-center">동작</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
                      {transactions.length > 0 ? (
                        transactions.map((tx) => (
                          <tr key={tx.id} className="hover:bg-slate-100/40 dark:hover:bg-slate-900/10 transition-colors">
                            <td className="py-3.5 px-5 font-medium">{tx.tradeDate}</td>
                            <td className="py-3.5 px-5 font-bold tracking-wide">{tx.ticker}</td>
                            <td className="py-3.5 px-5 text-center">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                                tx.type === 'BUY'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                              }`}>
                                {tx.type}
                              </span>
                            </td>
                            <td className="py-3.5 px-5 text-right font-mono font-semibold">{formatCurrency(tx.price, tx.currency)}</td>
                            <td className="py-3.5 px-5 text-right font-semibold">{tx.quantity.toLocaleString()}개</td>
                            <td className="py-3.5 px-5 text-right font-mono font-extrabold text-slate-700 dark:text-slate-300">
                              {formatCurrency(tx.price * tx.quantity, tx.currency)}
                            </td>
                            <td className="py-3.5 px-5 text-right font-mono text-slate-400">{formatCurrency(tx.fee, tx.currency)}</td>
                            <td className="py-3.5 px-5 text-slate-400 max-w-xs truncate" title={tx.memo || ''}>
                              {tx.memo || '-'}
                            </td>
                            <td className="py-3.5 px-5 text-center flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => startEditTransaction(tx)}
                                disabled={actionLoading}
                                className="text-indigo-500 hover:bg-indigo-500/10 p-1.5 rounded-lg border border-transparent hover:border-indigo-500/20 transition-all active:scale-95 disabled:opacity-50"
                                title="거래 내역 수정"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteTransaction(tx.id)}
                                disabled={actionLoading}
                                className="text-rose-500 hover:bg-rose-500/10 p-1.5 rounded-lg border border-transparent hover:border-rose-500/20 transition-all active:scale-95 disabled:opacity-50"
                                title="거래 내역 삭제"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={9} className="py-12 px-5 text-center text-slate-400">
                            필터 조건에 부합하는 매매 거래 내역이 존재하지 않습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* 4. Footer */}
      <footer className="mt-auto py-6 border-t border-slate-200 dark:border-slate-800/80 bg-white/40 dark:bg-slate-900/10 text-center text-[10px] text-slate-400">
        <div className="max-w-7xl mx-auto px-4">
          <p>© 2026 Antigravity Stop Strategy Asset Logger. All rights reserved.</p>
          <p className="mt-1">
            Built with Cloudflare Pages + D1 Database + Drizzle ORM + Hono + React TypeScript + Tailwind CSS.
          </p>
        </div>
      </footer>

      {/* Transaction Edit Modal Overlay */}
      {editingTxId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800/80 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-slate-800 dark:text-slate-200">거래 내역 수정</h3>
              <button
                onClick={() => setEditingTxId(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-bold"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleEditTransaction} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-400 mb-1">종목 티커 *</label>
                  <input
                    type="text"
                    required
                    value={editTxTicker}
                    onChange={(e) => setEditTxTicker(e.target.value)}
                    placeholder="AAPL, TSLA 등"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 focus:outline-none focus:border-indigo-500 transition-colors uppercase dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">거래 통화 *</label>
                  <select
                    value={editTxCurrency}
                    onChange={(e) => setEditTxCurrency(e.target.value as 'KRW' | 'USD')}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 focus:outline-none focus:border-indigo-500 transition-colors font-bold text-slate-700 dark:text-slate-300"
                  >
                    <option value="KRW">₩ KRW</option>
                    <option value="USD">$ USD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">거래 구분 *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditTxType('BUY')}
                    className={`py-2 px-4 rounded-xl font-bold border transition-all text-center ${
                      editTxType === 'BUY'
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500'
                    }`}
                  >
                    매수 (BUY)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditTxType('SELL')}
                    className={`py-2 px-4 rounded-xl font-bold border transition-all text-center ${
                      editTxType === 'SELL'
                        ? 'bg-rose-500/10 border-rose-500 text-rose-600 dark:text-rose-400'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500'
                    }`}
                  >
                    매도 (SELL)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">체결 단가 *</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="any"
                    value={editTxPrice}
                    onChange={(e) => setEditTxPrice(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 focus:outline-none dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">체결 수량 *</label>
                  <input
                    type="number"
                    required
                    min="0.0001"
                    step="any"
                    value={editTxQuantity}
                    onChange={(e) => setEditTxQuantity(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 focus:outline-none dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">거래 수수료</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={editTxFee}
                    onChange={(e) => setEditTxFee(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 focus:outline-none dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">체결 일자 *</label>
                  <input
                    type="date"
                    required
                    value={editTxDate}
                    onChange={(e) => setEditTxDate(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 focus:outline-none dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">매매 메모</label>
                <textarea
                  rows={3}
                  value={editTxMemo}
                  onChange={(e) => setEditTxMemo(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 focus:outline-none resize-none dark:text-slate-100"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTxId(null)}
                  className="flex-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold py-2.5 rounded-xl transition-all"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  저장하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
