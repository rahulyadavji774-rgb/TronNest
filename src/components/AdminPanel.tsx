import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Shield, Users, Coins, TrendingUp, AlertOctagon, Plus, Trash2, 
  Eye, EyeOff, RefreshCw, KeyRound, Search, AlertCircle, Check, 
  ListOrdered, FileText, Ban, Sparkles, LogOut, ArrowRight, Edit3, Upload,
  DollarSign, Activity, Settings, HelpCircle, Lock, Unlock
} from 'lucide-react';
import { Token, Transaction, UserProfile, AuditLog, SystemStats } from '../types';

interface AdminPanelProps {
  onClose: () => void;
}

interface LedgerEntry {
  id: number;
  fromAddress: string;
  toAddress: string;
  symbol: string;
  amount: number;
  description: string;
  createdAt: string;
}

export default function AdminPanel({ onClose }: AdminPanelProps) {
  const [adminToken, setAdminToken] = useState<string | null>(localStorage.getItem('admin_jwt'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Dashboard Stats & Data
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [adminLogs, setAdminLogs] = useState<AuditLog[]>([]);
  const [systemAudit, setSystemAudit] = useState<any[]>([]);
  const [ledgerLogs, setLedgerLogs] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'tokens' | 'balances' | 'ledger' | 'logs'>('dashboard');

  // Search filter
  const [userQuery, setUserQuery] = useState('');
  const [tokenQuery, setTokenQuery] = useState('');

  // Token Creation State
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenSymbol, setNewTokenSymbol] = useState('');
  const [newTokenDecimals, setNewTokenDecimals] = useState(6);
  const [newTokenLogoUrl, setNewTokenLogoUrl] = useState('');
  const [newTokenPrice, setNewTokenPrice] = useState('1.0');
  const [newTokenDesc, setNewTokenDesc] = useState('');
  const [tokenMsg, setTokenMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Token Editing State
  const [editingToken, setEditingToken] = useState<Token | null>(null);
  const [editName, setEditName] = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [editDecimals, setEditDecimals] = useState(6);
  const [editPrice, setEditPrice] = useState('1.0');
  const [editDesc, setEditDesc] = useState('');
  const [editTransferEnabled, setEditTransferEnabled] = useState(true);
  const [editVisible, setEditVisible] = useState(true);
  const [editActive, setEditActive] = useState(true);
  const [editMsg, setEditMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Mint / Deduct State
  const [adjustAddress, setAdjustAddress] = useState('');
  const [adjustTokenId, setAdjustTokenId] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustDesc, setAdjustDesc] = useState('');
  const [adjustAction, setAdjustAction] = useState<'mint' | 'deduct'>('mint');
  const [adjustMsg, setAdjustMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [adjustLoading, setAdjustLoading] = useState(false);

  // User-specific Balance Management State
  const [selectedUserForBalances, setSelectedUserForBalances] = useState<UserProfile | null>(null);
  const [selectedUserBalances, setSelectedUserBalances] = useState<any[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [userBalanceTokenId, setUserBalanceTokenId] = useState('');
  const [userBalanceAmount, setUserBalanceAmount] = useState('');
  const [userBalanceDesc, setUserBalanceDesc] = useState('');
  const [userBalanceMsg, setUserBalanceMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userBalanceLoading, setUserBalanceLoading] = useState(false);

  const fetchUserBalances = async (userId: number) => {
    if (!adminToken) return;
    setBalancesLoading(true);
    setUserBalanceMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/balances`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (data.success && data.data) {
        setSelectedUserBalances(data.data.balances || []);
      }
    } catch (e) {
      console.error('Failed to fetch user balances:', e);
    } finally {
      setBalancesLoading(false);
    }
  };

  const handleUserBalanceAction = async (action: 'credit' | 'debit' | 'freeze' | 'unfreeze' | 'reset', tokenId?: number, customAmount?: string, customDesc?: string) => {
    if (!adminToken || !selectedUserForBalances) return;
    
    setUserBalanceLoading(true);
    setUserBalanceMsg(null);
    const targetTokenId = tokenId || parseInt(userBalanceTokenId);
    const targetAmount = customAmount || userBalanceAmount;
    const targetDesc = customDesc || userBalanceDesc;

    let endpoint = `/api/admin/users/balances/${action}`;
    const payload: any = {
      userId: selectedUserForBalances.id,
      tokenId: targetTokenId,
    };

    if (action === 'credit' || action === 'debit') {
      payload.amount = parseFloat(targetAmount);
      payload.description = targetDesc;
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setUserBalanceMsg({ type: 'success', text: data.message || `Successfully executed ${action}!` });
        setUserBalanceAmount('');
        setUserBalanceDesc('');
        // Reload balances and admin data
        fetchUserBalances(selectedUserForBalances.id);
        fetchAdminData();
      } else {
        setUserBalanceMsg({ type: 'error', text: data.message || `Failed to execute ${action}` });
      }
    } catch (e) {
      setUserBalanceMsg({ type: 'error', text: 'Operation failed due to database network error.' });
    } finally {
      setUserBalanceLoading(false);
    }
  };

  const fetchAdminData = async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      // 1. Dashboard Stats
      const statsRes = await fetch('/api/admin/dashboard-stats', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const statsData = await statsRes.json();
      if (statsData.success) setStats(statsData.data);

      // 2. Users
      const usersRes = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const usersData = await usersRes.json();
      if (usersData.success) setUsers(usersData.data);

      // 3. Tokens Catalog
      const tokensRes = await fetch('/api/admin/tokens', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const tokensData = await tokensRes.json();
      if (tokensData.success) {
        // Map backend properties to frontend
        const mappedTokens = tokensData.data.map((t: any) => ({
          id: t.id,
          name: t.name,
          symbol: t.symbol,
          decimals: t.decimals,
          logoUrl: t.logo_url,
          isInternal: t.is_internal,
          balance: 0,
          priceUsd: t.priceUsd || 0,
          valueUsd: 0,
          isTransferEnabled: t.is_transfer_enabled,
          isVisible: t.is_visible,
          isActive: t.is_active,
          description: t.description || '',
          createdAt: t.created_at,
          updatedAt: t.updated_at
        }));
        setTokens(mappedTokens);
      }

      // 4. Ledger logs
      const ledgerRes = await fetch('/api/admin/ledger', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const ledgerData = await ledgerRes.json();
      if (ledgerData.success) setLedgerLogs(ledgerData.data);

      // 5. Audit Logs
      const logsRes = await fetch('/api/admin/audit-logs', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const logsData = await logsRes.json();
      if (logsData.success) {
        setAdminLogs(logsData.data.adminLogs);
        setSystemAudit(logsData.data.systemAuditLogs);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminToken) {
      fetchAdminData();
    }
  }, [adminToken]);

  // Admin Auth handler
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('admin_jwt', data.data.token);
        setAdminToken(data.data.token);
      } else {
        setAuthError(data.message || 'Invalid administrator password');
      }
    } catch (e) {
      setAuthError('Connection failed. Database unavailable.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAdminLogout = () => {
    localStorage.removeItem('admin_jwt');
    setAdminToken(null);
    setStats(null);
  };

  // Toggle Freeze User Wallet State
  const handleToggleFreeze = async (userId: number, currentStatus: string) => {
    const endpoint = currentStatus === 'frozen' ? '/api/admin/users/unfreeze' : '/api/admin/users/freeze';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (data.success) {
        fetchAdminData(); // reload
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Logo Upload parser via FileReader
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('File size exceeds 2MB limit.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        if (isEdit) {
          setEditLogoUrl(reader.result as string);
        } else {
          setNewTokenLogoUrl(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Create new Token
  const handleCreateTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenName || !newTokenSymbol) return;

    setTokenMsg(null);
    try {
      const res = await fetch('/api/admin/tokens/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          name: newTokenName,
          symbol: newTokenSymbol,
          decimals: newTokenDecimals,
          logoUrl: newTokenLogoUrl,
          priceUsd: parseFloat(newTokenPrice),
          description: newTokenDesc,
          isInternal: true
        })
      });
      const data = await res.json();
      if (data.success) {
        setTokenMsg({ type: 'success', text: `Successfully created custom asset ${newTokenSymbol.toUpperCase()}!` });
        setNewTokenName('');
        setNewTokenSymbol('');
        setNewTokenLogoUrl('');
        setNewTokenDesc('');
        setNewTokenPrice('1.0');
        fetchAdminData();
      } else {
        setTokenMsg({ type: 'error', text: `Error: ${data.message}` });
      }
    } catch (e) {
      setTokenMsg({ type: 'error', text: 'Operation failed' });
    }
  };

  // Edit Token selection
  const handleSelectEditToken = (token: Token) => {
    setEditingToken(token);
    setEditName(token.name);
    setEditLogoUrl(token.logoUrl);
    setEditDecimals(token.decimals);
    setEditPrice(String(token.priceUsd));
    setEditDesc((token as any).description || '');
    setEditTransferEnabled((token as any).isTransferEnabled !== false);
    setEditVisible((token as any).isVisible !== false);
    setEditActive((token as any).isActive !== false);
    setEditMsg(null);
  };

  // Save Token Updates
  const handleSaveTokenUpdates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingToken) return;

    setEditMsg(null);
    try {
      const res = await fetch('/api/admin/tokens/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          tokenId: editingToken.id,
          name: editName,
          logoUrl: editLogoUrl,
          decimals: editDecimals,
          priceUsd: parseFloat(editPrice),
          description: editDesc,
          isTransferEnabled: editTransferEnabled,
          isVisible: editVisible,
          isActive: editActive
        })
      });
      const data = await res.json();
      if (data.success) {
        setEditMsg({ type: 'success', text: 'Asset profile updated successfully!' });
        fetchAdminData();
        setTimeout(() => setEditingToken(null), 1200);
      } else {
        setEditMsg({ type: 'error', text: data.message || 'Failed to update token' });
      }
    } catch (e) {
      setEditMsg({ type: 'error', text: 'Database response timeout.' });
    }
  };

  // Delete Custom Token
  const handleDeleteToken = async (tokenId: number) => {
    if (!window.confirm('Are you absolutely sure you want to permanently delete this custom asset? This action will destroy all associated balance ledger nodes.')) return;
    try {
      const res = await fetch(`/api/admin/tokens/${tokenId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (data.success) {
        fetchAdminData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Adjust Supply: Mint or Deduct internal tokens
  const handleAdjustSupplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustAddress || !adjustTokenId || !adjustAmount) return;

    setAdjustMsg(null);
    setAdjustLoading(true);
    const endpoint = adjustAction === 'mint' ? '/api/admin/tokens/mint' : '/api/admin/tokens/deduct';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          walletAddress: adjustAddress.trim(),
          tokenId: parseInt(adjustTokenId),
          amount: parseFloat(adjustAmount),
          description: adjustDesc
        })
      });
      const data = await res.json();
      if (data.success) {
        setAdjustMsg({ type: 'success', text: `Successfully completed ${adjustAction.toUpperCase()} operation of ${adjustAmount} tokens!` });
        setAdjustAddress('');
        setAdjustAmount('');
        setAdjustDesc('');
        fetchAdminData();
      } else {
        setAdjustMsg({ type: 'error', text: data.message || 'Operation failed' });
      }
    } catch (e) {
      setAdjustMsg({ type: 'error', text: 'Communication timeout with database cluster.' });
    } finally {
      setAdjustLoading(false);
    }
  };

  // Filters
  const filteredUsers = users.filter(u => 
    u.address.toLowerCase().includes(userQuery.toLowerCase()) || 
    u.id.toString() === userQuery
  );

  const filteredTokens = tokens.filter(t => 
    t.name.toLowerCase().includes(tokenQuery.toLowerCase()) || 
    t.symbol.toLowerCase().includes(tokenQuery.toLowerCase())
  );

  return (
    <div className="absolute inset-0 z-50 bg-neutral-950 text-white flex flex-col justify-between overflow-hidden">
      {/* Top Header Panel */}
      <div className="px-6 py-5 border-b border-neutral-900 bg-neutral-950 flex items-center justify-between select-none">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-red-950/20 border border-red-500/20 flex items-center justify-center">
            <Shield className="w-4 h-4 text-red-500 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-display font-bold text-white tracking-tight leading-none">TronNest Backoffice</h1>
            <span className="text-[9px] text-neutral-500 font-mono tracking-wider font-semibold uppercase mt-1">Enterprise Admin Terminal</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {adminToken && (
            <button 
              onClick={handleAdminLogout}
              className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-red-500 transition-all flex items-center justify-center"
              title="Logout from admin panel"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}

          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-all flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Panel Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {!adminToken ? (
          /* Admin Login Screen */
          <div className="flex-1 flex items-center justify-center px-6 bg-neutral-950">
            <form onSubmit={handleAdminLogin} className="w-full max-w-sm p-6 rounded-2xl bg-neutral-900 border border-neutral-800 flex flex-col gap-4">
              <div className="text-center mb-2">
                <div className="w-12 h-12 rounded-full bg-red-950/20 border border-red-500/20 flex items-center justify-center mx-auto mb-3">
                  <KeyRound className="w-5 h-5 text-red-500" />
                </div>
                <h2 className="text-md font-display font-bold text-white">Administrative Access Gate</h2>
                <p className="text-[11px] text-neutral-500 mt-1">Unlock with root/administrator credentials to edit internal ledger parameters.</p>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-neutral-500 font-mono uppercase font-semibold">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin_root"
                  required
                  className="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-xs font-mono focus:outline-none focus:border-red-500/40"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-neutral-500 font-mono uppercase font-semibold">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••••"
                  required
                  className="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-xs font-mono focus:outline-none focus:border-red-500/40"
                />
              </div>

              {authError && (
                <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-xl text-xs text-red-400 font-mono flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-display text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-98 mt-2"
              >
                {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <>Unlock Terminal <ArrowRight className="w-3.5 h-3.5" /></>}
              </button>
            </form>
          </div>
        ) : (
          /* Authenticated Workspace Content */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Nav Tabs */}
            <div className="flex items-center gap-1.5 px-6 border-b border-neutral-900 bg-neutral-950/40 py-2 overflow-x-auto scrollbar-none">
              {[
                { id: 'dashboard', label: 'Dashboard', icon: TrendingUp },
                { id: 'users', label: 'Users', icon: Users },
                { id: 'tokens', label: 'Custom Tokens', icon: Coins },
                { id: 'balances', label: 'Mint/Deduct', icon: Sparkles },
                { id: 'ledger', label: 'Transaction History', icon: ListOrdered },
                { id: 'logs', label: 'Audit Logs', icon: FileText }
              ].map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id as any);
                      setEditingToken(null);
                    }}
                    className={`px-3 py-2 rounded-lg text-xs font-display font-medium flex items-center gap-1.5 transition-all outline-none border shrink-0 ${
                      active 
                        ? 'bg-red-950/20 text-red-500 border-red-500/20' 
                        : 'bg-transparent text-neutral-400 border-transparent hover:text-neutral-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Scrollable Sub-Panels */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <RefreshCw className="w-6 h-6 text-red-500 animate-spin" />
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  {/* TAB 1: DASHBOARD OVERVIEW */}
                  {activeTab === 'dashboard' && stats && (
                    <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6">
                      <div className="grid grid-cols-2 gap-3.5">
                        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
                          <span className="text-[10px] text-neutral-500 font-mono uppercase font-semibold">Total Users</span>
                          <div className="text-xl font-display font-bold text-white mt-1">{stats.totalUsers}</div>
                        </div>
                        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
                          <span className="text-[10px] text-neutral-500 font-mono uppercase font-semibold">Custom Assets</span>
                          <div className="text-xl font-display font-bold text-white mt-1">{stats.totalTokens}</div>
                        </div>
                        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
                          <span className="text-[10px] text-neutral-500 font-mono uppercase font-semibold">On-Chain Transactions</span>
                          <div className="text-xl font-display font-bold text-white mt-1">{stats.blockchainTxCount}</div>
                        </div>
                        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
                          <span className="text-[10px] text-neutral-500 font-mono uppercase font-semibold">Double-Entry Ledger entries</span>
                          <div className="text-xl font-display font-bold text-white mt-1">{stats.internalTxCount}</div>
                        </div>
                      </div>

                      {/* Summary Metrics */}
                      <div className="p-4 bg-neutral-900/40 border border-neutral-800 rounded-xl flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-2">
                          <Activity className="w-4 h-4 text-green-500" />
                          <span className="text-neutral-400">Ledger Database State</span>
                        </div>
                        <span className="text-green-500 font-bold uppercase text-[10px]">● synchronized (mysql offline simulation)</span>
                      </div>

                      {/* Transaction Logs Activity feed */}
                      <div>
                        <h3 className="text-xs text-neutral-500 font-mono uppercase font-semibold mb-3 tracking-wide">Recent System Activity</h3>
                        {stats.latestTransactions.length === 0 ? (
                          <div className="p-4 text-center text-xs text-neutral-600 font-mono">No recent transaction histories.</div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {stats.latestTransactions.slice(0, 5).map((tx) => (
                              <div key={tx.id} className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-xl flex items-center justify-between text-xs font-mono">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-neutral-300 font-sans font-bold">
                                    {tx.direction === 'out' ? 'Debit' : 'Credit'} {tx.asset_symbol}
                                  </span>
                                  <span className="text-[9px] text-neutral-600">
                                    {tx.counterparty.slice(0, 10)}...{tx.counterparty.slice(-8)}
                                  </span>
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className="text-white font-bold">{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                  <span className="text-[9px] text-neutral-600">{new Date(tx.created_at).toLocaleDateString()} {new Date(tx.created_at).toLocaleTimeString()}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 2: USERS & WALLETS */}
                  {activeTab === 'users' && (
                    <motion.div key="users" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
                      <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-3.5 py-2 rounded-xl">
                        <Search className="w-4 h-4 text-neutral-500" />
                        <input
                          type="text"
                          placeholder="Search users by TRON address or database ID..."
                          value={userQuery}
                          onChange={(e) => setUserQuery(e.target.value)}
                          className="bg-transparent text-xs text-white placeholder-neutral-600 font-mono focus:outline-none w-full"
                        />
                      </div>

                      <div className="flex flex-col gap-3">
                        {filteredUsers.length === 0 ? (
                          <div className="p-6 text-center text-xs text-neutral-500 font-mono">No registered wallets found matching search.</div>
                        ) : (
                          filteredUsers.map((usr) => (
                            <div key={usr.id} className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl flex flex-col gap-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="w-5 h-5 bg-neutral-800 border border-neutral-700 text-neutral-400 rounded flex items-center justify-center text-[10px] font-mono">
                                    ID {usr.id}
                                  </span>
                                  <span className="text-xs text-neutral-300 font-mono tracking-tight">{usr.address}</span>
                                </div>
                                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase border ${
                                  usr.status === 'frozen' 
                                    ? 'bg-red-950/20 text-red-500 border-red-500/20' 
                                    : 'bg-green-950/20 text-green-500 border-green-500/20'
                                }`}>
                                  {usr.status}
                                </span>
                              </div>

                              {/* User asset balances */}
                              <div className="p-2.5 bg-neutral-950/40 rounded-lg flex flex-wrap gap-x-4 gap-y-1.5 border border-neutral-950">
                                {usr.balances && usr.balances.length > 0 ? (
                                  usr.balances.map((b, i) => (
                                    <div key={i} className="flex items-center gap-1 font-mono text-[10px]">
                                      <span className="text-neutral-500">{b.symbol}:</span>
                                      <span className="text-neutral-300 font-bold">{parseFloat(String(b.balance)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-[10px] text-neutral-600 font-mono">No active balances seeded.</span>
                                )}
                              </div>

                              {/* Action Operations */}
                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  onClick={() => {
                                    setSelectedUserForBalances(usr);
                                    fetchUserBalances(usr.id);
                                  }}
                                  className="px-3 py-1.5 text-[9px] font-mono font-bold uppercase rounded-md bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700 hover:bg-neutral-700 transition-all flex items-center gap-1"
                                >
                                  <Coins className="w-3 h-3 text-red-400" />
                                  Manage Balances
                                </button>
                                <button
                                  onClick={() => handleToggleFreeze(usr.id, usr.status)}
                                  className={`px-3 py-1.5 text-[9px] font-mono font-bold uppercase rounded-md transition-all flex items-center gap-1 border ${
                                    usr.status === 'frozen'
                                      ? 'bg-green-950/20 text-green-500 border-green-500/20 hover:bg-green-950/40'
                                      : 'bg-red-950/20 text-red-500 border-red-500/20 hover:bg-red-950/40'
                                  }`}
                                >
                                  {usr.status === 'frozen' ? (
                                    <>
                                      <Unlock className="w-3 h-3" />
                                      Unfreeze Wallet
                                    </>
                                  ) : (
                                    <>
                                      <Lock className="w-3 h-3" />
                                      Freeze Wallet
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* BALANCE MANAGEMENT DIALOG MODAL */}
                      {selectedUserForBalances && (
                        <div className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col max-h-[90vh]"
                          >
                            {/* Header */}
                            <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/40">
                              <div className="flex flex-col">
                                <span className="text-[9px] text-red-500 font-mono uppercase font-bold tracking-wider">Independent User Balances</span>
                                <h3 className="text-xs font-mono text-neutral-300 truncate max-w-xs">{selectedUserForBalances.address}</h3>
                              </div>
                              <button 
                                onClick={() => setSelectedUserForBalances(null)}
                                className="w-6 h-6 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center transition-all"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Content Scroll */}
                            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
                              {balancesLoading ? (
                                <div className="flex items-center justify-center py-10">
                                  <RefreshCw className="w-5 h-5 text-red-500 animate-spin" />
                                </div>
                              ) : (
                                <>
                                  {/* List of current balances */}
                                  <div>
                                    <span className="text-[9px] text-neutral-500 font-mono uppercase font-semibold block mb-2.5">Current Wallet Assets</span>
                                    <div className="grid grid-cols-2 gap-2">
                                      {selectedUserBalances.map((bal) => (
                                        <div key={bal.id} className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl flex items-center justify-between text-xs font-mono relative overflow-hidden">
                                          {bal.isFrozen && (
                                            <div className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-red-950 border border-red-500/30 flex items-center justify-center" title="Balance is frozen">
                                              <Lock className="w-2 h-2 text-red-400" />
                                            </div>
                                          )}
                                          <div className="flex items-center gap-2">
                                            {bal.logoUrl ? (
                                              <img src={bal.logoUrl} alt="logo" className="w-5 h-5 object-contain" referrerPolicy="no-referrer" />
                                            ) : (
                                              <div className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center text-[8px] font-bold text-neutral-400">
                                                {bal.symbol[0]}
                                              </div>
                                            )}
                                            <div className="flex flex-col">
                                              <span className="text-white font-bold">{bal.symbol}</span>
                                              <span className="text-[8px] text-neutral-500 font-sans">{bal.name}</span>
                                            </div>
                                          </div>
                                          <div className="flex flex-col items-end gap-1 select-none">
                                            <span className="font-bold text-neutral-200">
                                              {parseFloat(String(bal.balance)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                            <div className="flex items-center gap-1">
                                              {bal.isInternal && (
                                                <>
                                                  <button
                                                    onClick={() => handleUserBalanceAction(bal.isFrozen ? 'unfreeze' : 'freeze', bal.id)}
                                                    className={`px-1.5 py-0.5 rounded text-[8px] font-bold transition-all uppercase ${bal.isFrozen ? 'bg-green-955 text-green-400 border border-green-500/20' : 'bg-red-955 text-red-400 border border-red-500/20'}`}
                                                    title={bal.isFrozen ? "Unfreeze Balance" : "Freeze Balance"}
                                                  >
                                                    {bal.isFrozen ? 'Unfreeze' : 'Freeze'}
                                                  </button>
                                                  <button
                                                    onClick={() => {
                                                      if (window.confirm(`Are you sure you want to reset this ${bal.symbol} balance to 0.00?`)) {
                                                        handleUserBalanceAction('reset', bal.id);
                                                      }
                                                    }}
                                                    className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-red-400 hover:border-red-500/20 transition-all uppercase"
                                                    title="Reset to 0"
                                                  >
                                                    Reset
                                                  </button>
                                                </>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Quick Credit / Debit Form */}
                                  <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl flex flex-col gap-3.5">
                                    <span className="text-[9px] text-neutral-500 font-mono uppercase font-semibold">Credit or Debit Balance</span>
                                    
                                    <div className="grid grid-cols-2 gap-2.5">
                                      <div className="flex flex-col gap-1">
                                        <label className="text-[8px] text-neutral-500 font-mono uppercase">Token Asset</label>
                                        <select
                                          value={userBalanceTokenId}
                                          onChange={(e) => setUserBalanceTokenId(e.target.value)}
                                          className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs font-mono text-neutral-300 focus:outline-none"
                                        >
                                          <option value="">-- Choose Token --</option>
                                          {selectedUserBalances.filter(b => b.isInternal).map(b => (
                                            <option key={b.id} value={b.id}>{b.symbol} ({b.name})</option>
                                          ))}
                                        </select>
                                      </div>

                                      <div className="flex flex-col gap-1">
                                        <label className="text-[8px] text-neutral-500 font-mono uppercase">Amount</label>
                                        <input
                                          type="number"
                                          step="any"
                                          placeholder="0.00"
                                          value={userBalanceAmount}
                                          onChange={(e) => setUserBalanceAmount(e.target.value)}
                                          className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs font-mono text-neutral-300 focus:outline-none focus:border-red-500/20"
                                        />
                                      </div>
                                    </div>

                                    <div className="flex flex-col gap-1">
                                      <label className="text-[8px] text-neutral-500 font-mono uppercase">Audit Reason / Description</label>
                                      <input
                                        type="text"
                                        placeholder="e.g. Compensation credit / ledger reconciliation"
                                        value={userBalanceDesc}
                                        onChange={(e) => setUserBalanceDesc(e.target.value)}
                                        className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs text-neutral-300 focus:outline-none"
                                      />
                                    </div>

                                    {userBalanceMsg && (
                                      <div className={`p-2 rounded text-[9px] font-mono border ${userBalanceMsg.type === 'success' ? 'bg-green-950/20 text-green-400 border-green-500/20' : 'bg-red-950/20 text-red-400 border-red-500/20'}`}>
                                        {userBalanceMsg.text}
                                      </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-2 mt-1">
                                      <button
                                        onClick={() => handleUserBalanceAction('credit')}
                                        disabled={userBalanceLoading || !userBalanceTokenId || !userBalanceAmount}
                                        className="py-2 bg-green-700 hover:bg-green-600 text-white font-display text-xs font-semibold rounded-lg transition-all active:scale-98 disabled:opacity-40"
                                      >
                                        {userBalanceLoading ? 'Crediting...' : 'Credit (+ Deposit)'}
                                      </button>
                                      <button
                                        onClick={() => handleUserBalanceAction('debit')}
                                        disabled={userBalanceLoading || !userBalanceTokenId || !userBalanceAmount}
                                        className="py-2 bg-red-700 hover:bg-red-600 text-white font-display text-xs font-semibold rounded-lg transition-all active:scale-98 disabled:opacity-40"
                                      >
                                        {userBalanceLoading ? 'Debiting...' : 'Debit (- Deduct)'}
                                      </button>
                                    </div>
                                  </div>

                                  {/* Historical records for this user */}
                                  <div>
                                    <span className="text-[9px] text-neutral-500 font-mono uppercase font-semibold block mb-2">Immutable Balance History</span>
                                    <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                                      {ledgerLogs.filter(log => log.fromAddress === selectedUserForBalances.address || log.toAddress === selectedUserForBalances.address).length === 0 ? (
                                        <div className="p-3 text-center text-[9px] text-neutral-600 font-mono border border-neutral-800 rounded-xl">No ledger activities recorded for this user.</div>
                                      ) : (
                                        ledgerLogs
                                          .filter(log => log.fromAddress === selectedUserForBalances.address || log.toAddress === selectedUserForBalances.address)
                                          .map((log) => {
                                            const isOut = log.fromAddress === selectedUserForBalances.address;
                                            return (
                                              <div key={log.id} className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg flex items-center justify-between text-[10px] font-mono">
                                                <div className="flex flex-col gap-0.5">
                                                  <span className={`font-bold uppercase text-[8px] ${isOut ? 'text-red-400' : 'text-green-400'}`}>
                                                    {isOut ? 'DEBIT (SENT)' : 'CREDIT (RECEIVED)'}
                                                  </span>
                                                  <span className="text-[9px] text-neutral-500 truncate max-w-[200px]" title={log.description}>{log.description}</span>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                  <span className="font-bold text-neutral-200">
                                                    {isOut ? '-' : '+'}{log.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {log.symbol}
                                                  </span>
                                                  <span className="text-[7px] text-neutral-600">{new Date(log.createdAt).toLocaleDateString()}</span>
                                                </div>
                                              </div>
                                            );
                                          })
                                      )}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </motion.div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* TAB 3: CUSTOM TOKENS */}
                  {activeTab === 'tokens' && (
                    <motion.div key="tokens" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6">
                      
                      {editingToken ? (
                        /* UPDATE TOKEN SUB-FORM */
                        <form onSubmit={handleSaveTokenUpdates} className="p-4 bg-neutral-900 border border-red-500/20 rounded-xl flex flex-col gap-4">
                          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                            <h4 className="text-xs text-red-500 font-display font-bold flex items-center gap-1.5 uppercase">
                              <Edit3 className="w-4 h-4 text-red-500" />
                              Update Token: {editingToken.symbol}
                            </h4>
                            <button 
                              type="button" 
                              onClick={() => setEditingToken(null)}
                              className="text-xs text-neutral-500 hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-3.5">
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] text-neutral-500 font-mono uppercase">Token Name</label>
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                required
                                className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] text-neutral-500 font-mono uppercase">Symbol (ReadOnly)</label>
                              <input
                                type="text"
                                value={editingToken.symbol}
                                disabled
                                className="p-2.5 bg-neutral-950/50 border border-neutral-800 text-neutral-500 rounded-lg text-xs font-mono uppercase cursor-not-allowed"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] text-neutral-500 font-mono uppercase">Decimals</label>
                              <input
                                type="number"
                                value={editDecimals}
                                onChange={(e) => setEditDecimals(parseInt(e.target.value))}
                                min={0}
                                max={18}
                                required
                                className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] text-neutral-500 font-mono uppercase">Manual Price (USD)</label>
                              <input
                                type="number"
                                step="any"
                                value={editPrice}
                                onChange={(e) => setEditPrice(e.target.value)}
                                required
                                className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-red-400"
                              />
                            </div>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] text-neutral-500 font-mono uppercase">Token Description</label>
                            <input
                              type="text"
                              value={editDesc}
                              onChange={(e) => setEditDesc(e.target.value)}
                              placeholder="Describe this off-chain custom token asset..."
                              className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs"
                            />
                          </div>

                          {/* Logo Upload with Base64 */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] text-neutral-500 font-mono uppercase">Token Logo Upload / Link</label>
                            <div className="grid grid-cols-5 gap-2 items-center">
                              <input
                                type="text"
                                value={editLogoUrl}
                                onChange={(e) => setEditLogoUrl(e.target.value)}
                                placeholder="https://url-to-logo.png"
                                className="col-span-3 p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-[10px] font-mono focus:outline-none"
                              />
                              <label className="col-span-2 flex items-center justify-center gap-1 p-2 bg-neutral-900 border border-neutral-800 rounded-lg cursor-pointer hover:bg-neutral-800 transition-all text-[10px]">
                                <Upload className="w-3.5 h-3.5 text-neutral-400" />
                                <span>Upload</span>
                                <input 
                                  type="file" 
                                  accept="image/*"
                                  onChange={(e) => handleLogoUpload(e, true)}
                                  className="hidden" 
                                />
                              </label>
                            </div>
                            {editLogoUrl && (
                              <div className="flex items-center gap-2 mt-1">
                                <img src={editLogoUrl} alt="Preview" className="w-6 h-6 object-contain rounded bg-neutral-950 border border-neutral-800 p-0.5" referrerPolicy="no-referrer" />
                                <span className="text-[9px] text-neutral-500 font-mono">Logo Loaded Successfully</span>
                              </div>
                            )}
                          </div>

                          {/* Flags and Visibility Toggles */}
                          <div className="grid grid-cols-3 gap-2 py-1">
                            <button
                              type="button"
                              onClick={() => setEditTransferEnabled(!editTransferEnabled)}
                              className={`p-2 rounded-lg border text-[10px] font-mono font-bold uppercase ${
                                editTransferEnabled 
                                  ? 'bg-green-950/20 text-green-500 border-green-500/20' 
                                  : 'bg-red-950/20 text-red-500 border-red-500/20'
                              }`}
                            >
                              Transfer: {editTransferEnabled ? 'Enabled' : 'Disabled'}
                            </button>

                            <button
                              type="button"
                              onClick={() => setEditVisible(!editVisible)}
                              className={`p-2 rounded-lg border text-[10px] font-mono font-bold uppercase ${
                                editVisible 
                                  ? 'bg-blue-950/20 text-blue-500 border-blue-500/20' 
                                  : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                              }`}
                            >
                              Visible: {editVisible ? 'Yes' : 'Hidden'}
                            </button>

                            <button
                              type="button"
                              onClick={() => setEditActive(!editActive)}
                              className={`p-2 rounded-lg border text-[10px] font-mono font-bold uppercase ${
                                editActive 
                                  ? 'bg-green-950/20 text-green-500 border-green-500/20' 
                                  : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                              }`}
                            >
                              Status: {editActive ? 'Active' : 'Inactive'}
                            </button>
                          </div>

                          {editMsg && (
                            <div className={`p-3 border rounded-lg text-[10px] font-mono ${
                              editMsg.type === 'success' 
                                ? 'bg-green-950/20 text-green-500 border-green-500/20' 
                                : 'bg-red-950/20 text-red-500 border-red-500/20'
                            }`}>
                              {editMsg.text}
                            </div>
                          )}

                          <button
                            type="submit"
                            className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-display text-xs font-semibold rounded-lg transition-all"
                          >
                            Save Token Configuration
                          </button>
                        </form>
                      ) : (
                        /* CREATE CUSTOM TOKEN PANEL */
                        <form onSubmit={handleCreateTokenSubmit} className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl flex flex-col gap-4">
                          <h4 className="text-xs text-white font-display font-semibold flex items-center gap-1.5">
                            <Plus className="w-4 h-4 text-red-500" />
                            Create Custom Internal Token
                          </h4>

                          <div className="grid grid-cols-2 gap-3.5">
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] text-neutral-500 font-mono uppercase">Token Name</label>
                              <input
                                type="text"
                                value={newTokenName}
                                onChange={(e) => setNewTokenName(e.target.value)}
                                placeholder="e.g. Nest Token"
                                required
                                className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs focus:outline-none focus:border-red-500/20"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] text-neutral-500 font-mono uppercase">Symbol</label>
                              <input
                                type="text"
                                value={newTokenSymbol}
                                onChange={(e) => setNewTokenSymbol(e.target.value)}
                                placeholder="e.g. NEST"
                                required
                                className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono uppercase focus:outline-none focus:border-red-500/20"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] text-neutral-500 font-mono uppercase">Decimals</label>
                              <input
                                type="number"
                                value={newTokenDecimals}
                                onChange={(e) => setNewTokenDecimals(parseInt(e.target.value))}
                                min={0}
                                max={18}
                                required
                                className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs focus:outline-none focus:border-red-500/20"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] text-neutral-500 font-mono uppercase">Price (USD)</label>
                              <input
                                type="number"
                                step="any"
                                value={newTokenPrice}
                                onChange={(e) => setNewTokenPrice(e.target.value)}
                                placeholder="1.0"
                                required
                                className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs focus:outline-none focus:border-red-500/20"
                              />
                            </div>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] text-neutral-500 font-mono uppercase">Token Description</label>
                            <input
                              type="text"
                              value={newTokenDesc}
                              onChange={(e) => setNewTokenDesc(e.target.value)}
                              placeholder="Token utility description..."
                              className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs focus:outline-none focus:border-red-500/20"
                            />
                          </div>

                          {/* Logo upload with FileReader */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] text-neutral-500 font-mono uppercase">Logo Asset Upload / Link</label>
                            <div className="grid grid-cols-5 gap-2 items-center">
                              <input
                                type="text"
                                value={newTokenLogoUrl}
                                onChange={(e) => setNewTokenLogoUrl(e.target.value)}
                                placeholder="https://example.com/logo.png"
                                className="col-span-3 p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-[10px] font-mono focus:outline-none"
                              />
                              <label className="col-span-2 flex items-center justify-center gap-1 p-2 bg-neutral-900 border border-neutral-800 rounded-lg cursor-pointer hover:bg-neutral-800 transition-all text-[10px]">
                                <Upload className="w-3.5 h-3.5 text-neutral-400" />
                                <span>Upload</span>
                                <input 
                                  type="file" 
                                  accept="image/*"
                                  onChange={(e) => handleLogoUpload(e, false)}
                                  className="hidden" 
                                />
                              </label>
                            </div>
                            {newTokenLogoUrl && (
                              <div className="flex items-center gap-2 mt-1">
                                <img src={newTokenLogoUrl} alt="Preview" className="w-6 h-6 object-contain rounded bg-neutral-950 border border-neutral-800 p-0.5" referrerPolicy="no-referrer" />
                                <span className="text-[9px] text-neutral-500 font-mono">Logo Loaded Successfully</span>
                              </div>
                            )}
                          </div>

                          {tokenMsg && (
                            <div className={`p-3 border rounded-lg text-[10px] font-mono ${
                              tokenMsg.type === 'success' 
                                ? 'bg-green-950/20 text-green-500 border-green-500/20' 
                                : 'bg-red-950/20 text-red-500 border-red-500/20'
                            }`}>
                              {tokenMsg.text}
                            </div>
                          )}

                          <button
                            type="submit"
                            className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-display text-xs font-semibold rounded-lg transition-all"
                          >
                            Create Custom Token
                          </button>
                        </form>
                      )}

                      {/* Token Catalog Listing */}
                      <div>
                        <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-3.5 py-2 rounded-xl mb-3.5">
                          <Search className="w-4 h-4 text-neutral-500" />
                          <input
                            type="text"
                            placeholder="Filter tokens catalog by name or symbol..."
                            value={tokenQuery}
                            onChange={(e) => setTokenQuery(e.target.value)}
                            className="bg-transparent text-xs text-white placeholder-neutral-600 font-mono focus:outline-none w-full"
                          />
                        </div>

                        <div className="flex flex-col gap-3">
                          {filteredTokens.length === 0 ? (
                            <div className="p-6 text-center text-xs text-neutral-500 font-mono">No custom token matches found.</div>
                          ) : (
                            filteredTokens.map((tok) => (
                              <div key={tok.id} className="p-3.5 bg-neutral-900 border border-neutral-800 rounded-xl flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-center p-1">
                                      <img src={tok.logoUrl} alt="logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                                    </div>
                                    <div className="flex flex-col">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-semibold text-white">{tok.name}</span>
                                        <span className="text-[8px] font-mono font-bold px-1 rounded bg-neutral-950 text-neutral-400 border border-neutral-800">
                                          {tok.symbol}
                                        </span>
                                        {tok.isInternal ? (
                                          <span className="text-[7px] font-mono font-bold px-1 rounded bg-red-950/20 text-red-500 border border-red-500/20 uppercase">
                                            ledger only
                                          </span>
                                        ) : (
                                          <span className="text-[7px] font-mono font-bold px-1 rounded bg-blue-950/20 text-blue-500 border border-blue-500/20 uppercase">
                                            on-chain
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-[9px] text-neutral-500 font-mono mt-0.5">
                                        Price: <span className="text-red-400 font-bold">${tok.priceUsd.toLocaleString(undefined, { minimumFractionDigits: 4 })}</span> | Decimals: {tok.decimals}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => handleSelectEditToken(tok)}
                                      className="w-7 h-7 rounded bg-neutral-950 border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white transition-all"
                                      title="Update Token Details"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>

                                    {tok.symbol !== 'TRX' && tok.symbol !== 'USDT' && (
                                      <button
                                        onClick={() => handleDeleteToken(tok.id)}
                                        className="w-7 h-7 rounded bg-neutral-950 border border-neutral-800 flex items-center justify-center text-neutral-500 hover:text-red-500 transition-all"
                                        title="Delete custom token"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Detailed status indicators */}
                                <div className="p-2 bg-neutral-950/50 border border-neutral-950 rounded-lg flex items-center justify-between text-[9px] font-mono text-neutral-500">
                                  <span>Transferable: <span className={tok.isTransferEnabled !== false ? 'text-green-500' : 'text-red-500'}>{tok.isTransferEnabled !== false ? 'ENABLED' : 'DISABLED'}</span></span>
                                  <span>Visibility: <span className={tok.isVisible !== false ? 'text-green-500' : 'text-neutral-500'}>{tok.isVisible !== false ? 'VISIBLE' : 'HIDDEN'}</span></span>
                                  <span>Status: <span className={tok.isActive !== false ? 'text-green-500' : 'text-red-500'}>{tok.isActive !== false ? 'ACTIVE' : 'INACTIVE'}</span></span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 4: MINT & DEDUCT INTERNAL BALANCE */}
                  {activeTab === 'balances' && (
                    <motion.div key="balances" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
                      <form onSubmit={handleAdjustSupplySubmit} className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs text-white font-display font-semibold flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-red-500 animate-pulse" />
                            Internal Asset Balance Adjustments
                          </h4>
                          <div className="flex items-center gap-1 bg-neutral-950 border border-neutral-800 rounded-lg p-0.5">
                            <button
                              type="button"
                              onClick={() => setAdjustAction('mint')}
                              className={`px-2.5 py-1 text-[9px] font-mono font-bold rounded ${adjustAction === 'mint' ? 'bg-red-950/20 text-red-500' : 'text-neutral-500'}`}
                            >
                              MINT (CREDIT)
                            </button>
                            <button
                              type="button"
                              onClick={() => setAdjustAction('deduct')}
                              className={`px-2.5 py-1 text-[9px] font-mono font-bold rounded ${adjustAction === 'deduct' ? 'bg-red-950/20 text-red-500' : 'text-neutral-500'}`}
                            >
                              DEDUCT (DEBIT)
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] text-neutral-500 font-mono uppercase">Target Wallet Address</label>
                          <input
                            type="text"
                            placeholder="Base58 TRON Address (e.g. TXYZ...)"
                            value={adjustAddress}
                            onChange={(e) => setAdjustAddress(e.target.value)}
                            required
                            className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono focus:outline-none"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3.5">
                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] text-neutral-500 font-mono uppercase">Select Custom Token</label>
                            <select
                              value={adjustTokenId}
                              onChange={(e) => setAdjustTokenId(e.target.value)}
                              required
                              className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono focus:outline-none"
                            >
                              <option value="">-- Choose --</option>
                              {tokens.filter(t => t.isInternal).map(t => (
                                <option key={t.id} value={t.id}>{t.symbol} ({t.name})</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] text-neutral-500 font-mono uppercase">Adjustment Amount</label>
                            <input
                              type="number"
                              step="any"
                              placeholder="0.00"
                              value={adjustAmount}
                              onChange={(e) => setAdjustAmount(e.target.value)}
                              required
                              className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] text-neutral-500 font-mono uppercase">Audit Log Description</label>
                          <input
                            type="text"
                            placeholder="e.g. Operational mint/debit for user account settlement"
                            value={adjustDesc}
                            onChange={(e) => setAdjustDesc(e.target.value)}
                            className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs focus:outline-none"
                          />
                        </div>

                        {adjustMsg && (
                          <div className={`p-3 border rounded-lg text-[10px] font-mono ${
                            adjustMsg.type === 'success' 
                              ? 'bg-green-950/20 text-green-500 border-green-500/20' 
                              : 'bg-red-950/20 text-red-500 border-red-500/20'
                          }`}>
                            {adjustMsg.text}
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={adjustLoading}
                          className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-display text-xs font-semibold rounded-lg transition-all"
                        >
                          {adjustLoading ? 'Writing Ledger Nodes...' : `Confirm ${adjustAction === 'mint' ? 'Token Mint' : 'Balance Deduction'}`}
                        </button>
                      </form>
                    </motion.div>
                  )}

                  {/* TAB 5: DOUBLE-ENTRY TRANSACTION HISTORY */}
                  {activeTab === 'ledger' && (
                    <motion.div key="ledger" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs text-neutral-500 font-mono uppercase font-semibold tracking-wide">Double-Entry Transaction Ledger</h4>
                        <span className="text-[9px] text-neutral-500 font-mono">Total Logs: {ledgerLogs.length}</span>
                      </div>

                      <div className="flex flex-col gap-2 max-h-[480px] overflow-y-auto pr-1">
                        {ledgerLogs.length === 0 ? (
                          <div className="p-4 text-center text-xs text-neutral-600 font-mono">No double-entry transactions recorded.</div>
                        ) : (
                          ledgerLogs.map((entry) => (
                            <div key={entry.id} className="p-3.5 bg-neutral-900 border border-neutral-800 rounded-xl flex flex-col gap-2 text-[10px] font-mono leading-relaxed">
                              <div className="flex items-center justify-between text-[9px] border-b border-neutral-950 pb-1.5 mb-1 text-neutral-500">
                                <span>ID: <span className="text-neutral-400">#{entry.id}</span></span>
                                <span>{new Date(entry.createdAt).toLocaleString()}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-x-4 text-neutral-400">
                                <div>
                                  <span className="text-[8px] text-red-500 font-bold block uppercase">Debit From (Sender)</span>
                                  <span className="truncate block mt-0.5">{entry.fromAddress}</span>
                                </div>
                                <div>
                                  <span className="text-[8px] text-green-500 font-bold block uppercase">Credit To (Receiver)</span>
                                  <span className="truncate block mt-0.5">{entry.toAddress}</span>
                                </div>
                              </div>
                              <div className="flex items-center justify-between bg-neutral-950/50 p-2 rounded border border-neutral-950 mt-1">
                                <span className="text-neutral-500">Amount:</span>
                                <span className="text-white font-bold text-xs">{entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {entry.symbol}</span>
                              </div>
                              <div className="text-[9px] text-neutral-500 mt-1">
                                <span className="font-semibold text-neutral-400">Reason:</span> {entry.description}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 6: AUDIT LOGS */}
                  {activeTab === 'logs' && (
                    <motion.div key="logs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6">
                      <div>
                        <h4 className="text-xs text-neutral-500 font-mono uppercase font-semibold mb-3">Admin audit Trails</h4>
                        <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                          {adminLogs.length === 0 ? (
                            <div className="p-4 text-center text-xs text-neutral-600 font-mono">No administrative logs recorded.</div>
                          ) : (
                            adminLogs.map((log) => (
                              <div key={log.id} className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg flex flex-col gap-1 text-[10px] font-mono leading-relaxed">
                                <div className="flex items-center justify-between text-[8px] text-neutral-500">
                                  <span>Admin: <span className="text-red-400 font-bold">{log.username || 'SYSTEM'}</span></span>
                                  <span>{new Date(log.createdAt).toLocaleString()}</span>
                                </div>
                                <span className="text-neutral-300 font-semibold">{log.action}</span>
                                <span className="text-[9px] text-neutral-600">IP address: {log.ipAddress}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* System Security Auditing */}
                      <div>
                        <h4 className="text-xs text-neutral-500 font-mono uppercase font-semibold mb-3">System Security & Actor logs</h4>
                        <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                          {systemAudit.length === 0 ? (
                            <div className="p-4 text-center text-xs text-neutral-600 font-mono">No security actor logs recorded.</div>
                          ) : (
                            systemAudit.map((log) => (
                              <div key={log.id} className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg flex flex-col gap-1 text-[10px] font-mono leading-relaxed">
                                <div className="flex items-center justify-between text-[8px] text-neutral-500">
                                  <span>Actor: <span className="text-blue-400 font-bold">{log.actor_type.toUpperCase()} ({log.actor_id})</span></span>
                                  <span>{new Date(log.created_at).toLocaleString()}</span>
                                </div>
                                <span className="text-neutral-300 font-semibold">Action: {log.action.toUpperCase()}</span>
                                <span className="text-[9px] text-neutral-600">Details: {JSON.stringify(log.details)}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
