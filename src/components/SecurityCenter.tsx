import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Shield, Lock, Fingerprint, Eye, EyeOff, Clipboard, Key, Activity, 
  Smartphone, Download, Upload, Check, AlertTriangle, ChevronRight, Clock,
  RefreshCw, Copy, CheckCircle2, ShieldAlert
} from 'lucide-react';

interface SecuritySettings {
  biometricsEnabled: boolean;
  autoLockDuration: string;
  privacyModeEnabled: boolean;
  screenshotProtectionEnabled: boolean;
  clipboardAutoclearSeconds: number;
}

interface LoginLog {
  id: number;
  actor_id: number;
  action: string;
  status: string;
  device: string;
  ip: string;
  created_at: string;
}

interface TrustDevice {
  id: number;
  device_name: string;
  user_agent: string;
  ip_address: string;
  is_trusted: boolean;
  last_active_at: string;
}

interface SecurityCenterProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  address: string;
  onPinChangeTriggered: () => void;
  onBackupTriggered: () => void;
  isWalletBackupConfirmed: boolean;
  hideBalances: boolean;
  setHideBalances: (val: boolean) => void;
}

export function SecurityCenter({
  isOpen,
  onClose,
  token,
  address,
  onPinChangeTriggered,
  onBackupTriggered,
  isWalletBackupConfirmed,
  hideBalances,
  setHideBalances
}: SecurityCenterProps) {
  // Security settings state
  const [settings, setSettings] = useState<SecuritySettings>({
    biometricsEnabled: false,
    autoLockDuration: '5',
    privacyModeEnabled: false,
    screenshotProtectionEnabled: false,
    clipboardAutoclearSeconds: 30
  });

  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [devices, setDevices] = useState<TrustDevice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Advanced Screens
  const [activeTab, setActiveTab] = useState<'settings' | 'logs' | 'backup'>('settings');

  // Export State
  const [exportPass, setExportPass] = useState('');
  const [exportResult, setExportResult] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportCopied, setExportCopied] = useState(false);

  // Import State
  const [importString, setImportString] = useState('');
  const [importPass, setImportPass] = useState('');
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Load overall settings
  const fetchSecurityData = async () => {
    try {
      setLoading(true);
      const sRes = await fetch('/api/wallet/security/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (sRes.ok) {
        const payload = await sRes.json();
        if (payload.success) setSettings(payload.data);
      }

      const lRes = await fetch('/api/wallet/security/login-history', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (lRes.ok) {
        const payload = await lRes.json();
        if (payload.success) setLogs(payload.data);
      }

      const dRes = await fetch('/api/wallet/security/trusted-devices', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (dRes.ok) {
        const payload = await dRes.json();
        if (payload.success) setDevices(payload.data);
      }
    } catch (_) {
      // offline support defaults
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSecurityData();
      setExportResult(null);
      setExportPass('');
      setImportString('');
      setImportPass('');
      setImportError(null);
      setImportResult(null);
    }
  }, [isOpen]);

  // Update Settings handler
  const handleUpdateSetting = async (updates: Partial<SecuritySettings>) => {
    const nextSettings = { ...settings, ...updates };
    setSettings(nextSettings); // optimistic update

    // Also update global settings in localStorage for immediate client-side logic
    if (updates.autoLockDuration !== undefined) {
      localStorage.setItem(`nest_security_autolock_${address}`, updates.autoLockDuration);
    }
    if (updates.privacyModeEnabled !== undefined) {
      localStorage.setItem(`nest_security_privacymode_${address}`, String(updates.privacyModeEnabled));
    }
    if (updates.screenshotProtectionEnabled !== undefined) {
      localStorage.setItem(`nest_security_screenshot_${address}`, String(updates.screenshotProtectionEnabled));
    }
    if (updates.clipboardAutoclearSeconds !== undefined) {
      localStorage.setItem(`nest_security_clipclear_${address}`, String(updates.clipboardAutoclearSeconds));
    }

    try {
      await fetch('/api/wallet/security/settings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
    } catch (_) {}
  };

  const handleDeleteDevice = async (id: number) => {
    try {
      setDevices(prev => prev.filter(d => d.id !== id));
      await fetch(`/api/wallet/security/trusted-device/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (_) {}
  };

  const handleExport = async () => {
    try {
      setExportError(null);
      setExportResult(null);
      if (!exportPass.trim()) {
        setExportError('Encryption password is required.');
        return;
      }
      const res = await fetch('/api/wallet/security/export-backup', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: exportPass })
      });
      const data = await res.json();
      if (data.success) {
        setExportResult(data.data.backupString);
      } else {
        setExportError(data.message || 'Export failed');
      }
    } catch (_) {
      setExportError('Connection failed');
    }
  };

  const handleImport = async () => {
    try {
      setImportError(null);
      setImportResult(null);
      if (!importString.trim() || !importPass.trim()) {
        setImportError('Decryption password and backup string are required.');
        return;
      }
      const res = await fetch('/api/wallet/security/import-backup', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          backupString: importString.trim(),
          password: importPass
        })
      });
      const data = await res.json();
      if (data.success) {
        setImportResult(data.message);
        setImportString('');
        setImportPass('');
      } else {
        setImportError(data.message || 'Incorrect password or corrupted backup string');
      }
    } catch (_) {
      setImportError('Connection failed');
    }
  };

  // Dynamic Security Score Calculation
  const calculateSecurityScore = () => {
    let score = 20; // baseline for account registration
    if (settings.biometricsEnabled) score += 20;
    if (settings.autoLockDuration !== 'off') score += 15;
    if (settings.privacyModeEnabled) score += 15;
    if (settings.screenshotProtectionEnabled) score += 15;
    if (isWalletBackupConfirmed) score += 15;
    return Math.min(score, 100);
  };

  const score = calculateSecurityScore();

  // Recommendations logic
  const getRecommendations = () => {
    const list = [];
    if (!isWalletBackupConfirmed) {
      list.push({
        id: 'backup',
        title: 'Perform Seed Backup Verification',
        desc: 'Export and write down your 12-word seed phrase to secure offline access.',
        action: onBackupTriggered,
        severity: 'high'
      });
    }
    if (!settings.biometricsEnabled) {
      list.push({
        id: 'biometrics',
        title: 'Configure Biometric Unlock',
        desc: 'Enroll fingerprint scanner or Face unlock for accelerated local login protection.',
        action: () => handleUpdateSetting({ biometricsEnabled: true }),
        severity: 'medium'
      });
    }
    if (settings.autoLockDuration === 'off') {
      list.push({
        id: 'autolock',
        title: 'Enable Auto Lock Timeout',
        desc: 'Set inactivity timeout to trigger automatic local lockdown after minutes.',
        action: () => handleUpdateSetting({ autoLockDuration: '5' }),
        severity: 'medium'
      });
    }
    if (!settings.privacyModeEnabled) {
      list.push({
        id: 'privacy',
        title: 'Activate Screen Privacy Mask',
        desc: 'Obscure app content when browser tab loses focus or runs in background.',
        action: () => handleUpdateSetting({ privacyModeEnabled: true }),
        severity: 'low'
      });
    }
    if (!settings.screenshotProtectionEnabled) {
      list.push({
        id: 'screenshot',
        title: 'Activate Copy & Capture Block',
        desc: 'Deter screenshot interception by blocking cut/copy events on credentials.',
        action: () => handleUpdateSetting({ screenshotProtectionEnabled: true }),
        severity: 'low'
      });
    }
    return list;
  };

  const recommendations = getRecommendations();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0, x: '100%' }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 180 }}
          className="absolute inset-0 z-40 bg-[#090909] flex flex-col justify-between"
          id="advanced-security-center"
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-neutral-900 flex items-center justify-between bg-neutral-950/50">
            <div className="flex items-center gap-2.5">
              <Shield className="w-5 h-5 text-red-500 animate-pulse" />
              <div>
                <h2 className="text-sm font-display font-bold text-white">Advanced Security Hub</h2>
                <p className="text-[10px] text-neutral-500 font-mono uppercase mt-0.5">Enterprise Vault Protocol</p>
              </div>
            </div>

            <button 
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white active:scale-95 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="px-6 py-2 border-b border-neutral-900 bg-neutral-950/20 flex gap-2">
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-2 rounded-xl text-[10px] font-display font-bold uppercase tracking-wider transition-all border ${
                activeTab === 'settings' 
                  ? 'bg-neutral-900 border-neutral-800 text-white' 
                  : 'border-transparent text-neutral-500 hover:text-neutral-300'
              }`}
            >
              Settings
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-3 py-2 rounded-xl text-[10px] font-display font-bold uppercase tracking-wider transition-all border ${
                activeTab === 'logs' 
                  ? 'bg-neutral-900 border-neutral-800 text-white' 
                  : 'border-transparent text-neutral-500 hover:text-neutral-300'
              }`}
            >
              Unlocks & Devices
            </button>
            <button
              onClick={() => setActiveTab('backup')}
              className={`px-3 py-2 rounded-xl text-[10px] font-display font-bold uppercase tracking-wider transition-all border ${
                activeTab === 'backup' 
                  ? 'bg-neutral-900 border-neutral-800 text-white' 
                  : 'border-transparent text-neutral-500 hover:text-neutral-300'
              }`}
            >
              Backup File
            </button>
          </div>

          {/* Scrollable Container */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">

            {/* -------------------- SECURITY TAB -------------------- */}
            {activeTab === 'settings' && (
              <>
                {/* 1. Dynamic Score Meter */}
                <div className="p-5 rounded-2xl bg-neutral-950 border border-neutral-900 flex flex-col gap-4 shadow-lg relative overflow-hidden">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-[10px] text-neutral-500 font-mono uppercase">Vulnerability Rating</span>
                      <h3 className="text-sm font-display font-bold text-white uppercase mt-0.5 tracking-wider flex items-center gap-1.5">
                        {score >= 85 && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        {score < 85 && score >= 50 && <ShieldAlert className="w-4 h-4 text-amber-500" />}
                        {score < 50 && <AlertTriangle className="w-4 h-4 text-red-500" />}
                        {score >= 85 ? 'Vault Secure' : score >= 50 ? 'Medium Vulnerability' : 'High Threat Level'}
                      </h3>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-display font-bold text-white tracking-tight">{score}</span>
                      <span className="text-xs text-neutral-500 font-mono">/100</span>
                    </div>
                  </div>

                  {/* Visual Bar */}
                  <div className="w-full h-2 rounded-full bg-neutral-900 overflow-hidden border border-neutral-900">
                    <div 
                      className={`h-full transition-all duration-1000 ${
                        score >= 85 ? 'bg-green-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>

                {/* 2. Personalized Suggestions */}
                {recommendations.length > 0 && (
                  <div className="flex flex-col gap-2.5">
                    <label className="text-[10px] text-neutral-400 font-mono uppercase tracking-wide">Threat Diagnostics ({recommendations.length})</label>
                    <div className="flex flex-col gap-2">
                      {recommendations.map(r => (
                        <button
                          key={r.id}
                          onClick={r.action}
                          className="w-full text-left p-3.5 bg-neutral-950 hover:bg-neutral-900 border border-neutral-900 rounded-xl transition-all flex gap-3 items-start"
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                            r.severity === 'high' 
                              ? 'bg-red-950/20 border-red-900/30 text-red-500' 
                              : r.severity === 'medium' 
                                ? 'bg-amber-950/20 border-amber-900/30 text-amber-500' 
                                : 'bg-neutral-900 border-neutral-850 text-neutral-400'
                          }`}>
                            <AlertTriangle className="w-4 h-4" />
                          </div>

                          <div className="flex-1 min-w-0 pr-4">
                            <span className="text-[11px] font-bold text-white block truncate">{r.title}</span>
                            <p className="text-[10px] text-neutral-500 mt-0.5 leading-relaxed font-sans">{r.desc}</p>
                          </div>

                          <ChevronRight className="w-4 h-4 text-neutral-600 self-center shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Toggle Control Panels */}
                <div className="flex flex-col gap-4">
                  <label className="text-[10px] text-neutral-400 font-mono uppercase tracking-wide">Access & Mask Toggles</label>

                  <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-900 flex flex-col gap-4">
                    {/* Hide Balances Setting */}
                    <div className="flex items-center justify-between">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-850 flex items-center justify-center text-neutral-400">
                          {hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white">Conceal Vault Balances</h4>
                          <p className="text-[10px] text-neutral-500 mt-1">Conceal total dollar values dynamically</p>
                        </div>
                      </div>

                      <button
                        onClick={() => setHideBalances(!hideBalances)}
                        className={`w-10 h-5.5 rounded-full transition-colors relative ${
                          hideBalances ? 'bg-red-600' : 'bg-neutral-800'
                        }`}
                      >
                        <motion.span
                          animate={{ x: hideBalances ? 20 : 4 }}
                          className="absolute top-1 left-0 w-3.5 h-3.5 rounded-full bg-white shadow-sm"
                        />
                      </button>
                    </div>

                    {/* Biometric Toggle */}
                    <div className="flex items-center justify-between pt-3 border-t border-neutral-900/60">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-850 flex items-center justify-center text-neutral-400">
                          <Fingerprint className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white">Biometric Unlock</h4>
                          <p className="text-[10px] text-neutral-500 mt-1">Enroll fingerprint scanner / Face ID</p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleUpdateSetting({ biometricsEnabled: !settings.biometricsEnabled })}
                        className={`w-10 h-5.5 rounded-full transition-colors relative ${
                          settings.biometricsEnabled ? 'bg-red-600' : 'bg-neutral-800'
                        }`}
                      >
                        <motion.span
                          animate={{ x: settings.biometricsEnabled ? 20 : 4 }}
                          className="absolute top-1 left-0 w-3.5 h-3.5 rounded-full bg-white shadow-sm"
                        />
                      </button>
                    </div>

                    {/* Privacy Mode Setting */}
                    <div className="flex items-center justify-between pt-3 border-t border-neutral-900/60">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-850 flex items-center justify-center text-neutral-400">
                          <EyeOff className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white">Privacy Screen Cover</h4>
                          <p className="text-[10px] text-neutral-500 mt-1">Obscures app instantly on window blur</p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleUpdateSetting({ privacyModeEnabled: !settings.privacyModeEnabled })}
                        className={`w-10 h-5.5 rounded-full transition-colors relative ${
                          settings.privacyModeEnabled ? 'bg-red-600' : 'bg-neutral-800'
                        }`}
                      >
                        <motion.span
                          animate={{ x: settings.privacyModeEnabled ? 20 : 4 }}
                          className="absolute top-1 left-0 w-3.5 h-3.5 rounded-full bg-white shadow-sm"
                        />
                      </button>
                    </div>

                    {/* Screenshot Protection Toggle */}
                    <div className="flex items-center justify-between pt-3 border-t border-neutral-900/60">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-850 flex items-center justify-center text-neutral-400">
                          <Lock className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white">Screenshot Deterrent</h4>
                          <p className="text-[10px] text-neutral-500 mt-1">Deter image/cut interception on credentials</p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleUpdateSetting({ screenshotProtectionEnabled: !settings.screenshotProtectionEnabled })}
                        className={`w-10 h-5.5 rounded-full transition-colors relative ${
                          settings.screenshotProtectionEnabled ? 'bg-red-600' : 'bg-neutral-800'
                        }`}
                      >
                        <motion.span
                          animate={{ x: settings.screenshotProtectionEnabled ? 20 : 4 }}
                          className="absolute top-1 left-0 w-3.5 h-3.5 rounded-full bg-white shadow-sm"
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 4. Credentials / Timer Settings */}
                <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-900 flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] text-neutral-400 font-mono uppercase">Clipboard Auto-Clear Timeout</label>
                    <select
                      value={settings.clipboardAutoclearSeconds}
                      onChange={(e) => handleUpdateSetting({ clipboardAutoclearSeconds: parseInt(e.target.value) })}
                      className="w-full bg-neutral-900 border border-neutral-850 p-3 rounded-xl text-xs text-neutral-200 outline-none focus:border-red-500/50 transition-all font-mono"
                    >
                      <option value="15">Clear clipboard after 15 seconds</option>
                      <option value="30">Clear clipboard after 30 seconds</option>
                      <option value="60">Clear clipboard after 1 minute</option>
                      <option value="0">Never clear clipboard</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] text-neutral-400 font-mono uppercase">Inactivity Lock duration</label>
                    <select
                      value={settings.autoLockDuration}
                      onChange={(e) => handleUpdateSetting({ autoLockDuration: e.target.value })}
                      className="w-full bg-neutral-900 border border-neutral-850 p-3 rounded-xl text-xs text-neutral-200 outline-none focus:border-red-500/50 transition-all font-mono"
                    >
                      <option value="1">Automatically lock after 1 minute</option>
                      <option value="5">Automatically lock after 5 minutes</option>
                      <option value="15">Automatically lock after 15 minutes</option>
                      <option value="off">Never lock on inactivity</option>
                    </select>
                  </div>

                  <button
                    onClick={onPinChangeTriggered}
                    className="w-full p-3 bg-neutral-900 hover:bg-neutral-850 border border-neutral-850 text-neutral-300 hover:text-white rounded-xl text-left text-xs font-semibold flex items-center justify-between transition-all"
                  >
                    <span className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-neutral-500" />
                      Modify 6-digit Wallet PIN
                    </span>
                    <ChevronRight className="w-4 h-4 text-neutral-500" />
                  </button>
                </div>
              </>
            )}

            {/* -------------------- UNLOCKS & TRUSTED DEVICES TAB -------------------- */}
            {activeTab === 'logs' && (
              <div className="flex flex-col gap-6">
                
                {/* Trusted Devices Section */}
                <div className="flex flex-col gap-2.5">
                  <label className="text-[10px] text-neutral-400 font-mono uppercase tracking-wide">Trusted Device Sessions ({devices.length})</label>
                  <div className="flex flex-col gap-2">
                    {devices.map(d => (
                      <div 
                        key={d.id}
                        className="p-3.5 bg-neutral-950 border border-neutral-900 rounded-xl flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-850 flex items-center justify-center text-green-500">
                            <Smartphone className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-[11px] font-bold text-white block truncate">{d.device_name}</span>
                            <span className="text-[9px] text-neutral-500 font-mono block mt-0.5">{d.ip_address} • Last active {new Date(d.last_active_at).toLocaleDateString()}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleDeleteDevice(d.id)}
                          className="p-2 hover:bg-neutral-900 text-neutral-500 hover:text-red-500 rounded-lg transition-colors font-mono text-[9px] uppercase font-bold"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Login History Logs */}
                <div className="flex flex-col gap-2.5">
                  <label className="text-[10px] text-neutral-400 font-mono uppercase tracking-wide">Recent Security Log Events ({logs.length})</label>
                  <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                    {logs.map(l => (
                      <div 
                        key={l.id}
                        className="p-3 bg-neutral-950/40 border border-neutral-900 rounded-xl flex justify-between items-center text-[10px] font-mono"
                      >
                        <div className="flex flex-col">
                          <span className="text-white font-bold uppercase">{l.action.replace('_', ' ')}</span>
                          <span className="text-neutral-500 mt-0.5">{new Date(l.created_at).toLocaleString()}</span>
                        </div>
                        <div className="text-right">
                          <span className={`px-2 py-0.5 rounded-md font-bold uppercase ${
                            l.status === 'success' ? 'bg-green-950/20 text-green-500' : 'bg-red-950/20 text-red-500'
                          }`}>
                            {l.status}
                          </span>
                          <span className="text-neutral-600 block mt-1 text-[9px]">{l.device}</span>
                        </div>
                      </div>
                    ))}
                    {logs.length === 0 && (
                      <span className="text-center text-xs text-neutral-500 font-mono p-4">No security logs recorded.</span>
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* -------------------- BACKUP & RESTORE TAB -------------------- */}
            {activeTab === 'backup' && (
              <div className="flex flex-col gap-6">

                {/* Secure File Export */}
                <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-900 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-850 flex items-center justify-center text-neutral-400">
                      <Download className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Export Vault Backup</h4>
                      <p className="text-[10px] text-neutral-500 mt-1">Saves all associated wallets into an encrypted file</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 mt-2">
                    <label className="text-[10px] text-neutral-400 font-mono uppercase">Setup File Password</label>
                    <input 
                      type="password"
                      placeholder="Enter robust key-phrase..."
                      value={exportPass}
                      onChange={(e) => setExportPass(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-850 p-3 rounded-xl text-xs text-white outline-none focus:border-red-500/50 transition-all font-mono"
                    />
                  </div>

                  {exportError && (
                    <span className="text-[9px] font-mono text-red-500">{exportError}</span>
                  )}

                  {exportResult ? (
                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] text-neutral-500 font-mono uppercase">Secure Encrypted Hash String</span>
                      <div className="p-3 bg-neutral-900 rounded-xl text-[9px] font-mono text-neutral-300 border border-neutral-850 select-all break-all flex items-center justify-between">
                        <span className="truncate pr-4">{exportResult}</span>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(exportResult);
                            setExportCopied(true);
                            setTimeout(() => setExportCopied(false), 2000);
                          }}
                          className="text-neutral-400 hover:text-white"
                        >
                          {exportCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      
                      <button
                        onClick={() => {
                          const blob = new Blob([exportResult], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `tron_nest_vault_backup_${new Date().toISOString().slice(0, 10)}.txt`;
                          a.click();
                        }}
                        className="w-full mt-1.5 py-3 bg-green-600 hover:bg-green-700 text-white font-display text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Backup File
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleExport}
                      className="w-full mt-1.5 py-3 bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 text-white font-display text-xs font-bold rounded-xl transition-all"
                    >
                      Generate Encrypted File
                    </button>
                  )}
                </div>

                {/* Secure File Import */}
                <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-900 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-850 flex items-center justify-center text-neutral-400">
                      <Upload className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Restore Vault Backup</h4>
                      <p className="text-[10px] text-neutral-500 mt-1">Decrypt and import wallets from file string</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 mt-2">
                    <label className="text-[10px] text-neutral-400 font-mono uppercase">Paste Encrypted Backup String</label>
                    <textarea
                      placeholder="Paste text contents from txt backup file..."
                      value={importString}
                      onChange={(e) => setImportString(e.target.value)}
                      rows={3}
                      className="w-full bg-neutral-900 border border-neutral-850 p-3 rounded-xl text-[10px] text-white outline-none focus:border-red-500/50 transition-all font-mono resize-none"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] text-neutral-400 font-mono uppercase">Decryption File Password</label>
                    <input 
                      type="password"
                      placeholder="Enter exact key password..."
                      value={importPass}
                      onChange={(e) => setImportPass(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-850 p-3 rounded-xl text-xs text-white outline-none focus:border-red-500/50 transition-all font-mono"
                    />
                  </div>

                  {importError && (
                    <span className="text-[9px] font-mono text-red-500">{importError}</span>
                  )}

                  {importResult && (
                    <div className="p-3 bg-green-950/20 border border-green-500/20 text-green-400 font-mono text-[10px] rounded-xl flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                      <span>{importResult}</span>
                    </div>
                  )}

                  <button
                    onClick={handleImport}
                    className="w-full mt-1.5 py-3 bg-red-600 hover:bg-red-700 text-white font-display text-xs font-bold rounded-xl transition-all"
                  >
                    Verify & Restore Wallets
                  </button>
                </div>

              </div>
            )}

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
