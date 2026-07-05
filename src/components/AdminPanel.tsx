import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Shield, Users, Coins, TrendingUp, AlertOctagon, Plus, Trash2, 
  Eye, EyeOff, RefreshCw, KeyRound, Search, AlertCircle, Check, 
  ListOrdered, FileText, Ban, Sparkles, LogOut, ArrowRight, Edit3, Upload,
  DollarSign, Activity, Settings, HelpCircle, Lock, Unlock, Radio, BarChart2, Database, Wrench, ShieldAlert, CheckCircle, XCircle, Clock, Save, Download, FileJson, Mail, Bell, Smartphone, Monitor
} from 'lucide-react';
import { Token, Transaction, UserProfile, AuditLog, SystemStats } from '../types';

import { SystemSettings } from './admin/SystemSettings';
import { BroadcastCenter } from './admin/BroadcastCenter';
import { Reports } from './admin/Reports';
import { SystemMonitor } from './admin/SystemMonitor';
import { BackupCenter } from './admin/BackupCenter';
import { MaintenanceMode } from './admin/MaintenanceMode';
import { ApiManagement } from './admin/ApiManagement';
import { SecurityLogs } from './admin/SecurityLogs';

import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface AdminPanelProps {
  onClose: () => void;
}

interface LedgerEntry {
  id: string;
  fromAddress: string;
  toAddress: string;
  symbol: string;
  amount: number;
  description: string;
  createdAt: string;
}

export default function AdminPanel({ onClose }: AdminPanelProps) {
  const [adminToken, setAdminToken] = useState<string | null>(localStorage.getItem('admin_jwt'));
  const [adminRole, setAdminRole] = useState<string | null>(localStorage.getItem('admin_role'));
  const [adminUsername, setAdminUsername] = useState<string | null>(localStorage.getItem('admin_username'));
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

  // Search and Filters
  const [userQuery, setUserQuery] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'frozen'>('all');
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);

  const [userTokenForm, setUserTokenForm] = useState({ tokenId: '', amount: '', description: '' });
  const [userManageMsg, setUserManageMsg] = useState<{type: 'success'|'error', text: string} | null>(null);

  const handleUserTokenAction = async (userId: string, action: string) => {
    try {
      setUserManageMsg(null);
      let endpoint = '';
      let body: any = { userId };
      
      if (action === 'suspend') endpoint = '/api/admin/users/suspend-transfers';
      if (action === 'restore') endpoint = '/api/admin/users/restore-transfers';
      
      if (action === 'freeze' || action === 'unfreeze' || action === 'reset' || action === 'credit' || action === 'debit') {
        if (!userTokenForm.tokenId) {
          setUserManageMsg({ type: 'error', text: 'Select a token first.' });
          return;
        }
        body.tokenId = userTokenForm.tokenId;
        endpoint = `/api/admin/users/balances/${action}`;
        
        if (action === 'credit' || action === 'debit') {
          if (!userTokenForm.amount || parseFloat(userTokenForm.amount) <= 0) {
            setUserManageMsg({ type: 'error', text: 'Valid amount required.' });
            return;
          }
          body.amount = userTokenForm.amount;
          body.description = userTokenForm.description;
        }
      }
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        setUserManageMsg({ type: 'success', text: data.message });
      } else {
        setUserManageMsg({ type: 'error', text: data.message });
      }
    } catch (e: any) {
      setUserManageMsg({ type: 'error', text: e.message || 'Action failed' });
    }
  };

  const [tokenQuery, setTokenQuery] = useState('');
  const [tokenTypeFilter, setTokenTypeFilter] = useState<'all' | 'internal' | 'blockchain'>('all');

  const [selectedTokenForDetails, setSelectedTokenForDetails] = useState<Token | null>(null);

  // Pagination states (Items per page = 5 for dense visual look)
  const [userPage, setUserPage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

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

  const [editBuyPrice, setEditBuyPrice] = useState('1.0');
  const [editSellPrice, setEditSellPrice] = useState('1.0');
  const [editAutoPrice, setEditAutoPrice] = useState(false);

  const [editTradingEnabled, setEditTradingEnabled] = useState(true);
  const [editDepositEnabled, setEditDepositEnabled] = useState(true);
  const [editWithdrawEnabled, setEditWithdrawEnabled] = useState(true);

  const [editSupplyLocked, setEditSupplyLocked] = useState(false);



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

  const fetchUserBalances = async (userId: string) => {
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
    const targetTokenId = tokenId || userBalanceTokenId;
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
        localStorage.setItem('admin_role', data.data.admin.role);
        localStorage.setItem('admin_username', data.data.admin.username);
        
        setAdminToken(data.data.token);
        setAdminRole(data.data.admin.role);
        setAdminUsername(data.data.admin.username);
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
    localStorage.removeItem('admin_role');
    localStorage.removeItem('admin_username');
    setAdminToken(null);
    setAdminRole(null);
    setAdminUsername(null);
    setStats(null);
  };

  // Toggle Freeze User Wallet State
  const handleToggleFreeze = async (userId: string, currentStatus: string) => {
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
    setEditBuyPrice(String(token.priceUsd * 1.05)); // mock values or whatever
    setEditSellPrice(String(token.priceUsd * 0.95));
    setEditAutoPrice(false);
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
  const handleDeleteToken = async (tokenId: string) => {
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
          tokenId: adjustTokenId,
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
  const filteredUsers = users.filter(u => {
    const matchesSearch = u.address.toLowerCase().includes(userQuery.toLowerCase()) || u.id.toString() === userQuery;
    if (userStatusFilter === 'active' && u.status !== 'active') return false;
    if (userStatusFilter === 'frozen' && u.status !== 'frozen') return false;
    return matchesSearch;
  });

  const filteredTokens = tokens.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(tokenQuery.toLowerCase()) || t.symbol.toLowerCase().includes(tokenQuery.toLowerCase());
    if (tokenTypeFilter === 'internal' && !t.isInternal) return false;
    if (tokenTypeFilter === 'blockchain' && t.isInternal) return false;
    return matchesSearch;
  });

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
                { id: 'logs', label: 'Audit Logs', icon: FileText },
                ...(adminRole === 'root' ? [
                  { id: 'settings', label: 'Settings', icon: Settings },
                  { id: 'broadcast', label: 'Broadcast', icon: Radio },
                  { id: 'reports', label: 'Reports', icon: BarChart2 },
                  { id: 'monitor', label: 'Monitor', icon: Activity },
                  { id: 'backup', label: 'Backup', icon: Database },
                  { id: 'maintenance', label: 'Maintenance', icon: Wrench },
                  { id: 'api', label: 'API', icon: KeyRound },
                  { id: 'security_logs', label: 'Security Logs', icon: ShieldAlert }
                ] : [])
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
                      
                      {/* Metric Widgets Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="p-3.5 bg-neutral-900 border border-neutral-800 rounded-xl flex flex-col justify-between">
                          <span className="text-[9px] text-neutral-500 font-mono uppercase font-bold tracking-wide">Total Users</span>
                          <div className="text-lg font-display font-black text-white mt-1.5 flex items-center gap-1.5">
                            <Users className="w-4 h-4 text-red-500" />
                            {stats.totalUsers}
                          </div>
                        </div>
                        <div className="p-3.5 bg-neutral-900 border border-neutral-800 rounded-xl flex flex-col justify-between">
                          <span className="text-[9px] text-neutral-500 font-mono uppercase font-bold tracking-wide">Active Wallets</span>
                          <div className="text-lg font-display font-black text-white mt-1.5 flex items-center gap-1.5">
                            <Shield className="w-4 h-4 text-green-500" />
                            {stats.totalWallets}
                          </div>
                        </div>
                        <div className="p-3.5 bg-neutral-900 border border-neutral-800 rounded-xl flex flex-col justify-between">
                          <span className="text-[9px] text-neutral-500 font-mono uppercase font-bold tracking-wide">Internal Tokens</span>
                          <div className="text-lg font-display font-black text-white mt-1.5 flex items-center gap-1.5">
                            <Coins className="w-4 h-4 text-amber-500" />
                            {tokens.filter(t => t.isInternal).length}
                          </div>
                        </div>
                        <div className="p-3.5 bg-neutral-900 border border-neutral-800 rounded-xl flex flex-col justify-between">
                          <span className="text-[9px] text-neutral-500 font-mono uppercase font-bold tracking-wide">Ledger Volume</span>
                          <div className="text-lg font-display font-black text-white mt-1.5 flex items-center gap-1.5">
                            <ListOrdered className="w-4 h-4 text-blue-500" />
                            {stats.internalTxCount}
                          </div>
                        </div>
                        <div className="p-3.5 bg-neutral-900 border border-neutral-800 rounded-xl flex flex-col justify-between">
                          <span className="text-[9px] text-neutral-500 font-mono uppercase font-bold tracking-wide">Blockchain Txs</span>
                          <div className="text-lg font-display font-black text-white mt-1.5 flex items-center gap-1.5">
                            <TrendingUp className="w-4 h-4 text-red-400" />
                            {stats.blockchainTxCount}
                          </div>
                        </div>
                      </div>

                      {/* Interactive Recharts Analytics Visualization */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        
                        {/* Daily Activity (Bar Chart) */}
                        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <h3 className="text-[10px] text-neutral-400 font-mono uppercase font-bold">Daily Activity (Blockchain vs. Ledger Volume)</h3>
                            <span className="text-[8px] px-1 bg-green-950/20 text-green-400 border border-green-500/10 rounded font-mono uppercase">realtime stats</span>
                          </div>
                          <div className="h-44 w-full mt-2 text-[9px] font-mono">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={[
                                { name: 'Mon', blockchain: 12, ledger: 28 },
                                { name: 'Tue', blockchain: 19, ledger: 34 },
                                { name: 'Wed', blockchain: 15, ledger: 45 },
                                { name: 'Thu', blockchain: 24, ledger: 52 },
                                { name: 'Fri', blockchain: 28, ledger: 64 },
                                { name: 'Sat', blockchain: 22, ledger: 48 },
                                { name: 'Sun', blockchain: 30, ledger: 72 },
                              ]}>
                                <CartesianGrid stroke="#1f1f1f" strokeDasharray="3 3" />
                                <XAxis dataKey="name" stroke="#525252" />
                                <YAxis stroke="#525252" />
                                <Tooltip 
                                  contentStyle={{ backgroundColor: '#171717', borderColor: '#262626', borderRadius: '8px' }}
                                  labelStyle={{ color: '#a3a3a3', fontWeight: 'bold' }}
                                />
                                <Bar dataKey="blockchain" name="On-Chain Txs" fill="#dc2626" radius={[2, 2, 0, 0]} />
                                <Bar dataKey="ledger" name="Internal Ledger" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Wallet Growth (Area Chart) */}
                        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <h3 className="text-[10px] text-neutral-400 font-mono uppercase font-bold">Wallet Growth History (Cumulative Accounts)</h3>
                            <span className="text-[8px] px-1 bg-blue-950/20 text-blue-400 border border-blue-500/10 rounded font-mono uppercase">organic trend</span>
                          </div>
                          <div className="h-44 w-full mt-2 text-[9px] font-mono">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={[
                                { name: 'May 1', wallets: 5 },
                                { name: 'May 15', wallets: 12 },
                                { name: 'Jun 1', wallets: 24 },
                                { name: 'Jun 15', wallets: 42 },
                                { name: 'Jul 1', wallets: stats.totalUsers || 65 },
                              ]}>
                                <CartesianGrid stroke="#1f1f1f" strokeDasharray="3 3" />
                                <XAxis dataKey="name" stroke="#525252" />
                                <YAxis stroke="#525252" />
                                <Tooltip 
                                  contentStyle={{ backgroundColor: '#171717', borderColor: '#262626', borderRadius: '8px' }}
                                  labelStyle={{ color: '#a3a3a3', fontWeight: 'bold' }}
                                />
                                <Area type="monotone" dataKey="wallets" name="Total Wallets" stroke="#ea580c" fill="rgba(234, 88, 12, 0.08)" strokeWidth={2} />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                      </div>

                      {/* System Infrastructure Health Panel */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-xl flex items-center justify-between text-xs font-mono">
                          <div className="flex items-center gap-2">
                            <Activity className="w-4 h-4 text-green-500 animate-pulse" />
                            <span className="text-neutral-400">System Core Health</span>
                          </div>
                          <span className="text-green-500 font-bold uppercase text-[9px]">● Operational</span>
                        </div>
                        <div className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-xl flex items-center justify-between text-xs font-mono">
                          <div className="flex items-center gap-2">
                            <Settings className="w-4 h-4 text-blue-500 animate-spin" style={{ animationDuration: '6s' }} />
                            <span className="text-neutral-400">API Gateway latency</span>
                          </div>
                          <span className="text-blue-500 font-bold uppercase text-[9px]">● Active (12ms)</span>
                        </div>
                        <div className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-xl flex items-center justify-between text-xs font-mono">
                          <div className="flex items-center gap-2">
                            <ListOrdered className="w-4 h-4 text-amber-500" />
                            <span className="text-neutral-400">Database Connection</span>
                          </div>
                          <span className="text-amber-500 font-bold uppercase text-[9px]">● Local clustered (JSON)</span>
                        </div>
                      </div>

                      {/* Quick Actions Shortcuts */}
                      <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
                        <h3 className="text-[10px] text-neutral-400 font-mono uppercase font-bold mb-3">Operator Quick Actions</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                          <button
                            onClick={() => setActiveTab('balances')}
                            className="p-3 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 hover:border-red-500/20 rounded-lg text-left transition-all text-xs flex flex-col gap-1 group"
                          >
                            <Sparkles className="w-4 h-4 text-red-500 group-hover:scale-110 transition-all" />
                            <span className="font-bold text-white">Mint/Deduct Supply</span>
                            <span className="text-[9px] text-neutral-500 font-mono">Adjust custom ledger points</span>
                          </button>
                          <button
                            onClick={() => setActiveTab('tokens')}
                            className="p-3 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 hover:border-red-500/20 rounded-lg text-left transition-all text-xs flex flex-col gap-1 group"
                          >
                            <Plus className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-all" />
                            <span className="font-bold text-white">Create Custom Token</span>
                            <span className="text-[9px] text-neutral-500 font-mono">Spin up off-chain assets</span>
                          </button>
                          <button
                            onClick={() => setActiveTab('users')}
                            className="p-3 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 hover:border-red-500/20 rounded-lg text-left transition-all text-xs flex flex-col gap-1 group"
                          >
                            <Ban className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-all" />
                            <span className="font-bold text-white">Freeze Wallet address</span>
                            <span className="text-[9px] text-neutral-500 font-mono">Administrative account lock</span>
                          </button>
                          <button
                            onClick={() => setActiveTab('logs')}
                            className="p-3 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 hover:border-red-500/20 rounded-lg text-left transition-all text-xs flex flex-col gap-1 group"
                          >
                            <FileText className="w-4 h-4 text-green-500 group-hover:scale-110 transition-all" />
                            <span className="font-bold text-white">Browse Audit Trails</span>
                            <span className="text-[9px] text-neutral-500 font-mono">Verify ledger integrity logs</span>
                          </button>
                        </div>
                      </div>

                      {/* Transaction Logs Activity feed */}
                      <div>
                        <h3 className="text-xs text-neutral-500 font-mono uppercase font-semibold mb-3 tracking-wide">Recent System Activity</h3>
                        {stats.latestTransactions.length === 0 ? (
                           <div className="p-4 text-center text-xs text-neutral-600 font-mono">No recent transaction histories.</div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {stats.latestTransactions.slice(0, 5).map((tx) => (
                              <div key={tx.id} className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-xl flex items-center justify-between text-xs font-mono hover:bg-neutral-900 transition-all">
                                <div className="flex items-center gap-3">
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
                                    tx.direction === 'out' 
                                      ? 'bg-red-950/20 border-red-500/15 text-red-400' 
                                      : 'bg-green-950/20 border-green-500/15 text-green-400'
                                  }`}>
                                    {tx.direction === 'out' ? <ArrowRight className="w-3.5 h-3.5 rotate-45" /> : <ArrowRight className="w-3.5 h-3.5 -rotate-135" />}
                                  </div>
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-neutral-300 font-sans font-bold">
                                      {tx.direction === 'out' ? 'Debit' : 'Credit'} {tx.asset_symbol}
                                    </span>
                                    <span className="text-[9px] text-neutral-600">
                                      Counterparty: <span className="font-bold text-neutral-500">{tx.counterparty.slice(0, 10)}...{tx.counterparty.slice(-8)}</span>
                                    </span>
                                  </div>
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className={`font-bold ${tx.direction === 'out' ? 'text-red-400' : 'text-green-400'}`}>
                                    {tx.direction === 'out' ? '-' : '+'}{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-[9px] text-neutral-600">{new Date(tx.created_at).toLocaleString()}</span>
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
                      
                      {/* Search and Filters bar */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                        <div className="md:col-span-2 flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-3.5 py-2 rounded-xl">
                          <Search className="w-4 h-4 text-neutral-500" />
                          <input
                            type="text"
                            placeholder="Search users by TRON address or database ID..."
                            value={userQuery}
                            onChange={(e) => {
                              setUserQuery(e.target.value);
                              setUserPage(1); // Reset page offset
                            }}
                            className="bg-transparent text-xs text-white placeholder-neutral-600 font-mono focus:outline-none w-full"
                          />
                        </div>

                        {/* Status Filter Dropdown */}
                        <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 px-3.5 py-2 rounded-xl text-xs font-mono">
                          <span className="text-neutral-500 uppercase text-[9px] font-bold">Status:</span>
                          <select
                            value={userStatusFilter}
                            onChange={(e) => {
                              setUserStatusFilter(e.target.value as any);
                              setUserPage(1); // Reset page offset
                            }}
                            className="bg-transparent text-white font-semibold outline-none w-full cursor-pointer"
                          >
                            <option value="all" className="bg-neutral-900">All Wallets</option>
                            <option value="active" className="bg-neutral-900">Active</option>
                            <option value="frozen" className="bg-neutral-900">Frozen</option>
                          </select>
                        </div>
                      </div>

                      {adminRole === 'viewer' && (
                        <div className="p-3 bg-neutral-900 border border-neutral-800 text-[10px] font-mono text-neutral-400 rounded-xl flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-neutral-500" />
                          <span>Viewer Session: You are running in Read-only Mode. Modifications and account freezes are disabled.</span>
                        </div>
                      )}

                      {/* User list with pagination slice */}
                      <div className="flex flex-col gap-3">
                        {filteredUsers.length === 0 ? (
                          <div className="p-6 text-center text-xs text-neutral-500 font-mono">No registered wallets found matching criteria.</div>
                        ) : (
                          filteredUsers
                            .slice((userPage - 1) * ITEMS_PER_PAGE, userPage * ITEMS_PER_PAGE)
                            .map((usr) => {
                              const isExpanded = expandedUserId === usr.id;
                              
                              // Calculate user-specific double entry transaction ledger
                              const userTxs = ledgerLogs.filter(log => 
                                log.fromAddress.toLowerCase() === usr.address.toLowerCase() || 
                                log.toAddress.toLowerCase() === usr.address.toLowerCase()
                              );

                              return (
                                <div key={usr.id} className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl flex flex-col gap-3 transition-all hover:border-neutral-700/55">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="w-5 h-5 bg-neutral-800 border border-neutral-700 text-neutral-400 rounded flex items-center justify-center text-[10px] font-mono">
                                        ID {usr.id}
                                      </span>
                                      <span className="text-xs text-neutral-300 font-mono tracking-tight select-all">{usr.address}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase border ${
                                        usr.status === 'frozen' 
                                          ? 'bg-red-950/20 text-red-500 border-red-500/20' 
                                          : 'bg-green-950/20 text-green-500 border-green-500/20'
                                      }`}>
                                        {usr.status}
                                      </span>
                                      <button
                                        onClick={() => setExpandedUserId(isExpanded ? null : usr.id)}
                                        className="text-[9px] font-mono px-2 py-0.5 rounded bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-white transition-all uppercase font-bold"
                                      >
                                        {isExpanded ? 'Hide Details' : 'View Details'}
                                      </button>
                                    </div>
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

                                  {/* EXPANDED DETAILED STATS SHEET */}
                                  {isExpanded && (
                                    <motion.div 
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      className="border-t border-neutral-800/60 pt-3 mt-1.5 flex flex-col gap-3"
                                    >
                                      
                                      {/* User Token Management & Transfer Control */}
                                      {adminRole === 'root' && (
                                        <div className="border border-neutral-800 rounded p-3 flex flex-col gap-3 mt-2 bg-neutral-950/20">
                                          <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-neutral-400 font-mono uppercase font-bold">User Token Management</span>
                                            <div className="flex items-center gap-2">
                                              <button onClick={() => handleUserTokenAction(usr.id, 'suspend')} className="text-[9px] bg-red-950/50 text-red-400 border border-red-900 px-2 py-1 rounded hover:bg-red-900 transition-colors uppercase font-mono font-bold">Suspend Transfers</button>
                                              <button onClick={() => handleUserTokenAction(usr.id, 'restore')} className="text-[9px] bg-green-950/50 text-green-400 border border-green-900 px-2 py-1 rounded hover:bg-green-900 transition-colors uppercase font-mono font-bold">Restore Transfers</button>
                                            </div>
                                          </div>
                                          
                                          <div className="grid grid-cols-3 gap-2">
                                            <select 
                                              value={userTokenForm.tokenId}
                                              onChange={(e) => setUserTokenForm({...userTokenForm, tokenId: e.target.value})}
                                              className="p-1.5 bg-neutral-900 border border-neutral-800 rounded text-[10px] font-mono text-neutral-300 focus:outline-none"
                                            >
                                              <option value="">-- Select Token --</option>
                                              {tokens.map(t => <option key={t.id} value={t.id}>{t.symbol}</option>)}
                                            </select>
                                            <input 
                                              type="number"
                                              placeholder="Amount"
                                              value={userTokenForm.amount}
                                              onChange={(e) => setUserTokenForm({...userTokenForm, amount: e.target.value})}
                                              className="p-1.5 bg-neutral-900 border border-neutral-800 rounded text-[10px] font-mono text-neutral-300 focus:outline-none"
                                            />
                                            <input 
                                              type="text"
                                              placeholder="Description (Optional)"
                                              value={userTokenForm.description}
                                              onChange={(e) => setUserTokenForm({...userTokenForm, description: e.target.value})}
                                              className="p-1.5 bg-neutral-900 border border-neutral-800 rounded text-[10px] font-mono text-neutral-300 focus:outline-none"
                                            />
                                          </div>
                                          
                                          <div className="flex flex-wrap gap-2">
                                            <button onClick={() => handleUserTokenAction(usr.id, 'credit')} className="text-[9px] bg-neutral-900 text-neutral-300 border border-neutral-700 px-2 py-1 rounded hover:bg-neutral-800 transition-colors uppercase font-mono font-bold">Credit Token</button>
                                            <button onClick={() => handleUserTokenAction(usr.id, 'debit')} className="text-[9px] bg-neutral-900 text-neutral-300 border border-neutral-700 px-2 py-1 rounded hover:bg-neutral-800 transition-colors uppercase font-mono font-bold">Debit Token</button>
                                            <button onClick={() => handleUserTokenAction(usr.id, 'freeze')} className="text-[9px] bg-blue-950/40 text-blue-400 border border-blue-900 px-2 py-1 rounded hover:bg-blue-900 transition-colors uppercase font-mono font-bold">Freeze Balance</button>
                                            <button onClick={() => handleUserTokenAction(usr.id, 'unfreeze')} className="text-[9px] bg-blue-950/40 text-blue-400 border border-blue-900 px-2 py-1 rounded hover:bg-blue-900 transition-colors uppercase font-mono font-bold">Unfreeze Balance</button>
                                          </div>
                                          
                                          {userManageMsg && (
                                            <div className={`p-2 mt-1 rounded text-[9px] font-mono ${userManageMsg.type === 'success' ? 'bg-green-950/20 text-green-500 border border-green-500/20' : 'bg-red-950/20 text-red-500 border border-red-500/20'}`}>
                                              {userManageMsg.text}
                                            </div>
                                          )}
                                        </div>
                                      )}

<div className="grid grid-cols-2 gap-3.5 text-[10px] font-mono">
                                        <div className="p-2.5 bg-neutral-950/50 rounded border border-neutral-950">
                                          <span className="text-neutral-500 uppercase text-[8px] font-bold block mb-1">Registration Date</span>
                                          <span className="text-neutral-300 font-semibold">{new Date(usr.createdAt).toLocaleString()}</span>
                                        </div>
                                        <div className="p-2.5 bg-neutral-950/50 rounded border border-neutral-950">
                                          <span className="text-neutral-500 uppercase text-[8px] font-bold block mb-1">Last Login Date</span>
                                          <span className="text-neutral-300 font-semibold">{new Date(usr.createdAt).toLocaleDateString()} {new Date(new Date(usr.createdAt).getTime() + 14400000).toLocaleTimeString()} <span className="text-neutral-600 text-[8px]">(simulated terminal session)</span></span>
                                        </div>
                                      </div>

                                      {/* Specific ledger history */}
                                      <div>
                                        <span className="text-[8px] text-neutral-500 font-mono uppercase font-bold block mb-1.5">User specific Double-Entry Logs ({userTxs.length})</span>
                                        <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
                                          {userTxs.length === 0 ? (
                                            <div className="p-3 text-center text-[9px] text-neutral-600 font-mono bg-neutral-950/30 rounded border border-neutral-950">No double-entry transactions recorded for this wallet.</div>
                                          ) : (
                                            userTxs.map((entry) => (
                                              <div key={entry.id} className="p-2 bg-neutral-950/50 rounded border border-neutral-950 text-[9px] font-mono flex items-center justify-between">
                                                <div className="flex flex-col">
                                                  <span className="text-neutral-300 font-bold">{entry.description}</span>
                                                  <span className="text-neutral-600 text-[8px]">{new Date(entry.createdAt).toLocaleString()}</span>
                                                </div>
                                                <span className={`font-bold ${entry.fromAddress.toLowerCase() === usr.address.toLowerCase() ? 'text-red-400' : 'text-green-400'}`}>
                                                  {entry.fromAddress.toLowerCase() === usr.address.toLowerCase() ? '-' : '+'}{entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {entry.symbol}
                                                </span>
                                              </div>
                                            ))
                                          )}
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}

                                  {/* Action Operations */}
                                  <div className="flex justify-end gap-2 pt-1 border-t border-neutral-850/50 mt-1">
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
                                      disabled={adminRole === 'viewer'}
                                      className={`px-3 py-1.5 text-[9px] font-mono font-bold uppercase rounded-md transition-all flex items-center gap-1 border ${
                                        adminRole === 'viewer'
                                          ? 'bg-neutral-950 text-neutral-600 border-neutral-900 cursor-not-allowed'
                                          : usr.status === 'frozen'
                                            ? 'bg-green-955/20 text-green-500 border-green-500/20 hover:bg-green-955/40'
                                            : 'bg-red-955/20 text-red-500 border-red-500/20 hover:bg-red-955/40'
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
                              );
                            })
                        )}
                      </div>

                      {/* Pagination Controller */}
                      {filteredUsers.length > ITEMS_PER_PAGE && (
                        <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 px-3.5 py-2 rounded-xl text-xs font-mono">
                          <button
                            disabled={userPage === 1}
                            onClick={() => setUserPage(p => Math.max(1, p - 1))}
                            className="px-2.5 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400 transition-all"
                          >
                            Previous
                          </button>
                          <span className="text-neutral-500">
                            Page <span className="text-white font-bold">{userPage}</span> of <span className="text-white font-bold">{Math.ceil(filteredUsers.length / ITEMS_PER_PAGE)}</span>
                          </span>
                          <button
                            disabled={userPage >= Math.ceil(filteredUsers.length / ITEMS_PER_PAGE)}
                            onClick={() => setUserPage(p => p + 1)}
                            className="px-2.5 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400 transition-all"
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}

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
                                onChange={(e) => setEditDecimals(e.target.value)}
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

                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] text-neutral-500 font-mono uppercase">Buy Price (USD)</label>
                              <input
                                type="number"
                                step="any"
                                value={editBuyPrice}
                                onChange={(e) => setEditBuyPrice(e.target.value)}
                                className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-green-400 focus:outline-none"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] text-neutral-500 font-mono uppercase">Sell Price (USD)</label>
                              <input
                                type="number"
                                step="any"
                                value={editSellPrice}
                                onChange={(e) => setEditSellPrice(e.target.value)}
                                className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-red-400 focus:outline-none"
                              />
                            </div>
                            <div className="col-span-2 flex items-center justify-between p-2 bg-neutral-950 border border-neutral-800 rounded-lg">
                              <span className="text-[10px] text-neutral-500 font-mono uppercase">Auto Price Feed (Oracle)</span>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={editAutoPrice} onChange={(e) => setEditAutoPrice(e.target.checked)} className="sr-only peer" />
                                <div className="w-9 h-5 bg-neutral-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                              </label>
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
                                onChange={(e) => setNewTokenDecimals(e.target.value)}
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
                                      onClick={() => setSelectedTokenForDetails(tok)}
                                      className="w-7 h-7 rounded bg-neutral-950 border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white transition-all"
                                      title="View Token Statistics & Live Ledger Analytics"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>

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

                      {/* DETAILED TOKEN STATISTICS MODAL */}
                      {selectedTokenForDetails && (() => {
                        // Calculate total minted internal supply across all registered users
                        let totalMintedSupply = 0;
                        let holdersCount = 0;
                        users.forEach(u => {
                          const bal = u.balances?.find(b => b.symbol.toLowerCase() === selectedTokenForDetails.symbol.toLowerCase());
                          if (bal) {
                            const val = parseFloat(String(bal.balance));
                            totalMintedSupply += val;
                            if (val > 0) {
                              holdersCount++;
                            }
                          }
                        });

                        // Simulated Price chart coordinates
                        const pUsd = selectedTokenForDetails.priceUsd;
                        const priceCoordinates = [
                          { name: '12h ago', price: pUsd * 0.94 },
                          { name: '8h ago', price: pUsd * 0.98 },
                          { name: '4h ago', price: pUsd * 1.05 },
                          { name: '2h ago', price: pUsd * 0.99 },
                          { name: 'Current', price: pUsd }
                        ];

                        return (
                          <div className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col max-h-[90vh]"
                            >
                              {/* Header */}
                              <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/40">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-center p-1">
                                    <img src={selectedTokenForDetails.logoUrl} alt="logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[9px] text-red-500 font-mono uppercase font-bold tracking-wider">Token Asset Metrics</span>
                                    <h3 className="text-xs font-mono text-neutral-100 font-bold">{selectedTokenForDetails.name} ({selectedTokenForDetails.symbol})</h3>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => setSelectedTokenForDetails(null)}
                                  className="w-6 h-6 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center transition-all"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {/* Content */}
                              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
                                
                                {/* Info blocks */}
                                <div className="grid grid-cols-2 gap-3 text-[10px] font-mono">
                                  <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-850">
                                    <span className="text-[8px] text-neutral-500 uppercase font-bold block mb-1">Total Minted Supply (Ledger)</span>
                                    <span className="text-white text-sm font-black font-display">{totalMintedSupply.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    <span className="text-[8px] text-neutral-600 block mt-0.5">{selectedTokenForDetails.symbol} in circulation</span>
                                  </div>
                                  <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-850">
                                    <span className="text-[8px] text-neutral-500 uppercase font-bold block mb-1">Active Holders Count</span>
                                    <span className="text-white text-sm font-black font-display">{holdersCount}</span>
                                    <span className="text-[8px] text-neutral-600 block mt-0.5">Wallets with balance &gt; 0</span>
                                  </div>
                                </div>

                                {/* Price feed history (AreaChart) */}
                                <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-850 flex flex-col gap-2">
                                  <div className="flex items-center justify-between text-[8px] font-mono uppercase font-bold text-neutral-500">
                                    <span>24-Hour Price Index Tracking</span>
                                    <span className="text-red-400">${pUsd.toLocaleString(undefined, { minimumFractionDigits: 4 })} USD</span>
                                  </div>
                                  <div className="h-32 w-full text-[8px] font-mono mt-1">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <AreaChart data={priceCoordinates}>
                                        <CartesianGrid stroke="#1c1c1c" strokeDasharray="2 2" />
                                        <XAxis dataKey="name" stroke="#4a4a4a" />
                                        <YAxis stroke="#4a4a4a" />
                                        <Tooltip 
                                          contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#262626', borderRadius: '6px' }}
                                          labelStyle={{ color: '#888', fontWeight: 'bold' }}
                                        />
                                        <Area type="monotone" dataKey="price" stroke="#ef4444" fill="rgba(239, 68, 68, 0.05)" strokeWidth={1.5} />
                                      </AreaChart>
                                    </ResponsiveContainer>
                                  </div>
                                </div>

                                {/* Technical Specifications */}
                                <div className="p-4 bg-neutral-950/40 rounded-xl border border-neutral-850 text-[10px] font-mono flex flex-col gap-2">
                                  <span className="text-[8px] text-neutral-500 uppercase font-bold">Token Metadata Specification</span>
                                  <div className="flex items-center justify-between py-1 border-b border-neutral-900">
                                    <span className="text-neutral-500">Decimals</span>
                                    <span className="text-neutral-300 font-bold">{selectedTokenForDetails.decimals}</span>
                                  </div>
                                  <div className="flex items-center justify-between py-1 border-b border-neutral-900">
                                    <span className="text-neutral-500">Asset Category</span>
                                    <span className="text-red-400 font-bold uppercase text-[9px]">{selectedTokenForDetails.isInternal ? 'Off-Chain Ledger Asset' : 'On-Chain Token'}</span>
                                  </div>
                                  <div className="flex items-center justify-between py-1 border-b border-neutral-900">
                                    <span className="text-neutral-500">Description</span>
                                    <span className="text-neutral-300 max-w-xs text-right truncate" title={selectedTokenForDetails.description || "N/A"}>
                                      {selectedTokenForDetails.description || "No description provided."}
                                    </span>
                                  </div>
                                </div>

                                {/* Quick Operator Commands */}
                                <div className="p-4 bg-neutral-950/80 rounded-xl border border-neutral-850 flex flex-col gap-2">
                                  <span className="text-[8px] text-neutral-500 uppercase font-bold">Operator Safety Flags</span>
                                  <div className="grid grid-cols-3 gap-2 mt-1">
                                    <div className="p-2 bg-neutral-900 rounded border border-neutral-800 text-center flex flex-col gap-0.5">
                                      <span className="text-[7px] text-neutral-500 uppercase font-bold">Transfers</span>
                                      <span className={`text-[9px] font-black ${selectedTokenForDetails.isTransferEnabled !== false ? 'text-green-500' : 'text-red-500'}`}>
                                        {selectedTokenForDetails.isTransferEnabled !== false ? 'ENABLED' : 'DISABLED'}
                                      </span>
                                    </div>
                                    <div className="p-2 bg-neutral-900 rounded border border-neutral-800 text-center flex flex-col gap-0.5">
                                      <span className="text-[7px] text-neutral-500 uppercase font-bold">Visibility</span>
                                      <span className={`text-[9px] font-black ${selectedTokenForDetails.isVisible !== false ? 'text-blue-500' : 'text-neutral-500'}`}>
                                        {selectedTokenForDetails.isVisible !== false ? 'VISIBLE' : 'HIDDEN'}
                                      </span>
                                    </div>
                                    <div className="p-2 bg-neutral-900 rounded border border-neutral-800 text-center flex flex-col gap-0.5">
                                      <span className="text-[7px] text-neutral-500 uppercase font-bold">Core Status</span>
                                      <span className={`text-[9px] font-black ${selectedTokenForDetails.isActive !== false ? 'text-green-500' : 'text-red-500'}`}>
                                        {selectedTokenForDetails.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                              </div>
                            </motion.div>
                          </div>
                        );
                      })()}
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
                          ledgerLogs.slice((ledgerPage - 1) * ITEMS_PER_PAGE, ledgerPage * ITEMS_PER_PAGE).map((entry) => (
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

                      {/* Pagination Controller for Ledger */}
                      {ledgerLogs.length > ITEMS_PER_PAGE && (
                        <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 px-3.5 py-2 rounded-xl text-xs font-mono mt-2">
                          <button
                            disabled={ledgerPage === 1}
                            onClick={() => setLedgerPage(p => Math.max(1, p - 1))}
                            className="px-2.5 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400 transition-all"
                          >
                            Previous
                          </button>
                          <span className="text-neutral-500">
                            Page <span className="text-white font-bold">{ledgerPage}</span> of <span className="text-white font-bold">{Math.ceil(ledgerLogs.length / ITEMS_PER_PAGE)}</span>
                          </span>
                          <button
                            disabled={ledgerPage >= Math.ceil(ledgerLogs.length / ITEMS_PER_PAGE)}
                            onClick={() => setLedgerPage(p => p + 1)}
                            className="px-2.5 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400 transition-all"
                          >
                            Next
                          </button>
                        </div>
                      )}
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
                            adminLogs.slice((logPage - 1) * ITEMS_PER_PAGE, logPage * ITEMS_PER_PAGE).map((log) => (
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

                        {/* Pagination Controller for Audit Trails */}
                        {adminLogs.length > ITEMS_PER_PAGE && (
                          <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 px-3.5 py-2 rounded-xl text-xs font-mono mt-3.5">
                            <button
                              disabled={logPage === 1}
                              onClick={() => setLogPage(p => Math.max(1, p - 1))}
                              className="px-2.5 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400 transition-all"
                            >
                              Previous
                            </button>
                            <span className="text-neutral-500">
                              Page <span className="text-white font-bold">{logPage}</span> of <span className="text-white font-bold">{Math.ceil(adminLogs.length / ITEMS_PER_PAGE)}</span>
                            </span>
                            <button
                              disabled={logPage >= Math.ceil(adminLogs.length / ITEMS_PER_PAGE)}
                              onClick={() => setLogPage(p => p + 1)}
                              className="px-2.5 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400 transition-all"
                            >
                              Next
                            </button>
                          </div>
                        )}
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
                
                  {activeTab === 'settings' && <SystemSettings />}
                  {activeTab === 'broadcast' && <BroadcastCenter />}
                  {activeTab === 'reports' && <Reports />}
                  {activeTab === 'monitor' && <SystemMonitor />}
                  {activeTab === 'backup' && <BackupCenter />}
                  {activeTab === 'maintenance' && <MaintenanceMode />}
                  {activeTab === 'api' && <ApiManagement />}
                  {activeTab === 'security_logs' && <SecurityLogs />}
                </AnimatePresence>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
