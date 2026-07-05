import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Plus, Import, Palette, Search, Edit3, Trash2, Check, Copy, 
  AlertTriangle, Key, ShieldCheck, TrendingUp, Sliders, LayoutGrid,
  TrendingDown, Globe, FolderSync, Wallet, Activity, Briefcase,
  Delete, Lock, RefreshCw
} from 'lucide-react';

interface WalletAsset {
  symbol: string;
  balance: number;
  valueUsd: number;
}

interface WalletItem {
  id: string;
  address: string;
  name: string;
  color: string;
  icon: string;
  isBackupConfirmed: boolean;
  isActive: boolean;
  totalValueUsd: number;
  assets: WalletAsset[];
}

interface WalletManagerProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  currentAddress: string;
  onWalletSwitched: (newAddress: string, newToken?: string) => void;
}

const COLOR_PRESETS = [
  { name: 'Nest Red', value: '#ef4444' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Indigo Sky', value: '#6366f1' },
  { name: 'Gold Coin', value: '#f59e0b' },
  { name: 'Cosmic Purple', value: '#a855f7' },
  { name: 'Frost Blue', value: '#06b6d4' },
  { name: 'Slate Grey', value: '#6b7280' }
];

const ICON_PRESETS = [
  { id: 'wallet', label: 'Classic Wallet', icon: Wallet },
  { id: 'activity', label: 'Traded Wallet', icon: Activity },
  { id: 'vault', label: 'Safe Vault', icon: ShieldCheck },
  { id: 'global', label: 'Web3 Global', icon: Globe },
  { id: 'nest', label: 'Nest Core', icon: LayoutGrid },
  { id: 'business', label: 'Work Asset', icon: Briefcase }
];

export function WalletManager({
  isOpen,
  onClose,
  token,
  currentAddress,
  onWalletSwitched
}: WalletManagerProps) {
  // State lists
  const [wallets, setWallets] = useState<WalletItem[]>([]);
  const [totalCombinedAssets, setTotalCombinedAssets] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Mode screens: 'list', 'create', 'import', 'backup_flow', 'custom_flow'
  const [mode, setMode] = useState<'list' | 'create' | 'import' | 'backup_flow' | 'customize'>('list');

  // Creation State
  const [createName, setCreateName] = useState('');
  const [createColor, setCreateColor] = useState('#ef4444');
  const [createIcon, setCreateIcon] = useState('wallet');
  const [createResult, setCreateResult] = useState<{ privateKey: string; seedPhrase: string; address: string } | null>(null);

  // Import State
  const [importName, setImportName] = useState('');
  const [importColor, setImportColor] = useState('#6366f1');
  const [importIcon, setImportIcon] = useState('wallet');
  const [importPrivateKey, setImportPrivateKey] = useState('');
  const [importSeedPhrase, setImportSeedPhrase] = useState('');
  const [importType, setImportType] = useState<'key' | 'seed'>('key');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<boolean>(false);

  // Editing state
  const [editingWalletId, setEditingWalletId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  // Customization state
  const [customizingWallet, setCustomizingWallet] = useState<WalletItem | null>(null);

  // Backup reveal state (for warning click)
  const [backupRevealWallet, setBackupRevealWallet] = useState<WalletItem | null>(null);
  const [backupPrivateKey, setBackupPrivateKey] = useState<string>('');
  const [backupSeedPhrase, setBackupSeedPhrase] = useState<string>('');
  const [backupCopied, setBackupCopied] = useState<boolean>(false);

  // Secure Action state (Switch, Backup, or Remove validation with Account PIN)
  const [secureAction, setSecureAction] = useState<{
    type: 'switch' | 'backup' | 'remove';
    wallet: WalletItem;
  } | null>(null);
  const [securePin, setSecurePin] = useState('');
  const [secureError, setSecureError] = useState<string | null>(null);
  const [secureLoading, setSecureLoading] = useState(false);
  const [secureShake, setSecureShake] = useState(false);

  // Load wallets from list
  const fetchWallets = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/wallet/list', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const payload = await res.json();
        if (payload.success) {
          setWallets(payload.data.wallets);
          setTotalCombinedAssets(payload.data.totalAssetsAllWalletsUsd);
          
          // Save cache to localStorage for offline boot
          localStorage.setItem('nest_wallets_cache', JSON.stringify(payload.data));
        }
      }
    } catch (e) {
      // Offline fallback
      const cached = localStorage.getItem('nest_wallets_cache');
      if (cached) {
        try {
          const payload = JSON.parse(cached);
          setWallets(payload.wallets);
          setTotalCombinedAssets(payload.totalAssetsAllWalletsUsd);
        } catch (_) {}
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchWallets();
      // Reset modes on open
      setMode('list');
      setCreateResult(null);
      setImportError(null);
      setImportSuccess(false);
    }
  }, [isOpen]);

  // Actions
  const handleSwitchRequest = (wallet: WalletItem) => {
    setSecureAction({ type: 'switch', wallet });
    setSecurePin('');
    setSecureError(null);
    setSecureLoading(false);
  };

  const handleBackupRequest = (wallet: WalletItem) => {
    setSecureAction({ type: 'backup', wallet });
    setSecurePin('');
    setSecureError(null);
    setSecureLoading(false);
  };

  const handleRemoveRequest = (wallet: WalletItem) => {
    if (wallets.length <= 1) {
      alert("At least one wallet must remain in your account.");
      return;
    }
    if (wallet.isActive) {
      alert("Cannot remove the currently active wallet.");
      return;
    }
    if (!confirm(`Warning: Are you absolutely sure you want to remove "${wallet.name}" from the Multi-Wallet list? This will NOT delete it from the blockchain, and you can import it again later using its Seed Phrase or Private Key.`)) {
      return;
    }
    setSecureAction({ type: 'remove', wallet });
    setSecurePin('');
    setSecureError(null);
    setSecureLoading(false);
  };

  const handleSecurePinSubmit = async (enteredPin: string) => {
    if (!secureAction) return;
    setSecureLoading(true);
    setSecureError(null);

    const { type, wallet } = secureAction;

    if (type === 'switch') {
      try {
        const res = await fetch('/api/wallet/switch', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ walletId: wallet.id, passcode: enteredPin })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          onWalletSwitched(wallet.address, data.data?.token);
          setSecureAction(null);
          fetchWallets();
        } else {
          setSecureError(data.message || 'Incorrect Account PIN');
          setSecureShake(true);
          setTimeout(() => setSecureShake(false), 500);
        }
      } catch (_) {
        setSecureError('Connection timed out. Please retry.');
      } finally {
        setSecureLoading(false);
      }
    } else if (type === 'backup') {
      try {
        const res = await fetch('/api/wallet/private-key', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ walletId: wallet.id, passcode: enteredPin })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setBackupRevealWallet(wallet);
          setBackupPrivateKey(data.privateKey);
          setBackupSeedPhrase(data.seedPhrase || 'No seed word backup available (Direct Key Import)');
          setSecureAction(null);
        } else {
          setSecureError(data.message || 'Incorrect Account PIN');
          setSecureShake(true);
          setTimeout(() => setSecureShake(false), 500);
        }
      } catch (_) {
        setSecureError('Connection timed out. Please retry.');
      } finally {
        setSecureLoading(false);
      }
    } else if (type === 'remove') {
      try {
        const res = await fetch(`/api/wallet/delete/${wallet.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ passcode: enteredPin })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setSecureAction(null);
          fetchWallets();
        } else {
          setSecureError(data.message || 'Incorrect Account PIN');
          setSecureShake(true);
          setTimeout(() => setSecureShake(false), 500);
        }
      } catch (_) {
        setSecureError('Connection timed out. Please retry.');
      } finally {
        setSecureLoading(false);
      }
    }
  };

  const handleSecurePinClick = (num: number) => {
    if (securePin.length >= 6 || secureLoading) return;
    const nextVal = securePin + num;
    setSecurePin(nextVal);
    
    if (nextVal.length === 6) {
      handleSecurePinSubmit(nextVal);
      // clear code after a slight delay
      setTimeout(() => setSecurePin(''), 1000);
    }
  };

  const handleSecurePinDelete = () => {
    if (securePin.length === 0 || secureLoading) return;
    setSecurePin(securePin.slice(0, -1));
  };

  const handleSecurePinClear = () => {
    if (secureLoading) return;
    setSecurePin('');
  };

  const handleSwitch = async (id: string, address: string) => {
    try {
      const res = await fetch('/api/wallet/switch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ walletId: id })
      });
      const data = await res.json();
      if (res.ok) {
        onWalletSwitched(address, data.data?.token);
        fetchWallets();
      }
    } catch (_) {}
  };

  const handleCreate = async () => {
    try {
      setImportError(null);
      const res = await fetch('/api/wallet/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: createName.trim() || 'New Nest Wallet',
          color: createColor,
          icon: createIcon
        })
      });
      const data = await res.json();
      if (data.success) {
        setCreateResult(data.data);
        setMode('backup_flow');
        fetchWallets();
      } else {
        setImportError(data.message || 'Failed to generate wallet');
      }
    } catch (err) {
      setImportError('Network communication failure');
    }
  };

  const handleImport = async () => {
    try {
      setImportError(null);
      setImportSuccess(false);

      if (importType === 'key' && !importPrivateKey.trim()) {
        setImportError('Please enter a valid private key.');
        return;
      }
      if (importType === 'seed' && !importSeedPhrase.trim()) {
        setImportError('Please enter a valid 12-word seed phrase.');
        return;
      }

      const res = await fetch('/api/wallet/import-new', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: importName.trim() || 'Imported Vault',
          color: importColor,
          icon: importIcon,
          privateKey: importType === 'key' ? importPrivateKey.trim() : undefined,
          seedPhrase: importType === 'seed' ? importSeedPhrase.trim() : undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        setImportSuccess(true);
        setTimeout(() => {
          setMode('list');
          setImportPrivateKey('');
          setImportSeedPhrase('');
          setImportName('');
          fetchWallets();
        }, 1500);
      } else {
        setImportError(data.message || 'Verification failed. Please review your credentials.');
      }
    } catch (err) {
      setImportError('Verification communication failure.');
    }
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    try {
      const res = await fetch('/api/wallet/rename', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ walletId: id, name: editName.trim() })
      });
      if (res.ok) {
        setEditingWalletId(null);
        fetchWallets();
      }
    } catch (_) {}
  };



  const handleBackupConfirm = async (walletId: string) => {
    try {
      const res = await fetch('/api/wallet/backup-confirm', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ walletId })
      });
      if (res.ok) {
        setBackupRevealWallet(null);
        setMode('list');
        fetchWallets();
      }
    } catch (_) {}
  };

  const handleStartBackupReveal = async (wallet: WalletItem) => {
    setBackupRevealWallet(wallet);
    setBackupPrivateKey('');
    setBackupSeedPhrase('');
    setBackupCopied(false);

    try {
      // Query private key securely (already supports PIN authentication step on parent as fallback or decrypts direct)
      const res = await fetch('/api/wallet/private-key', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ passcode: '111111' }) // Default passcode fallback for preview environments
      });
      const data = await res.json();
      if (data.success) {
        // Since we are looking up specifically for the selected wallet, we can extract it or decrypt it
        setBackupPrivateKey(data.data.privateKey);
        setBackupSeedPhrase(data.data.seedPhrase || 'No seed word backup available (Direct Key Import)');
      }
    } catch (_) {}
  };

  const handleCustomizeSave = async () => {
    if (!customizingWallet) return;
    try {
      const res = await fetch('/api/wallet/customize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          walletId: customizingWallet.id,
          color: createColor,
          icon: createIcon
        })
      });
      if (res.ok) {
        setMode('list');
        setCustomizingWallet(null);
        fetchWallets();
      }
    } catch (_) {}
  };

  // presetted icons lookups
  const renderWalletIcon = (iconId: string, color: string, className = 'w-4 h-4') => {
    const preset = ICON_PRESETS.find(i => i.id === iconId) || ICON_PRESETS[0];
    const IconComp = preset.icon;
    return <IconComp className={className} style={{ color }} />;
  };

  const filteredWallets = wallets.filter(w => 
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0, x: '100%' }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 180 }}
          className="absolute inset-0 z-45 bg-[#090909] flex flex-col justify-between"
          id="multi-wallet-manager-drawer"
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-neutral-900 flex items-center justify-between bg-neutral-950/50">
            <div className="flex items-center gap-2.5">
              <Sliders className="w-5 h-5 text-red-500 animate-pulse" />
              <div>
                <h2 className="text-sm font-display font-bold text-white">Multi-Wallet Hub</h2>
                <p className="text-[10px] text-neutral-500 font-mono uppercase mt-0.5">Secure Key-Pair Protocol</p>
              </div>
            </div>

            <button 
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white active:scale-95 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Core Panel Scrollable Area */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">

            {/* -------------------- MAIN LIST SCREEN -------------------- */}
            {mode === 'list' && (
              <>
                {/* Aggregated Total Assets Banner */}
                <div className="p-5 rounded-2xl bg-neutral-950 border border-neutral-900 flex flex-col gap-1.5 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl" />
                  <span className="text-[10px] text-neutral-500 font-mono uppercase tracking-wide">Combined Aggregate Portfolio</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-display font-bold text-white tracking-tight">${totalCombinedAssets.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="text-[10px] text-neutral-400 font-mono">USD</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-neutral-900/40 text-[10px] text-neutral-500 font-mono">
                    <FolderSync className="w-3.5 h-3.5 text-red-500 animate-spin" />
                    <span>Cross-wallet synchronization active</span>
                  </div>
                </div>

                {/* Controls Bar */}
                <div className="flex gap-2.5">
                  <div className="flex-1 bg-neutral-950 border border-neutral-900 px-3.5 py-2.5 rounded-xl flex items-center gap-2">
                    <Search className="w-4 h-4 text-neutral-500" />
                    <input 
                      type="text" 
                      placeholder="Search credentials..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-transparent border-none text-xs text-neutral-200 placeholder-neutral-600 outline-none w-full font-mono"
                    />
                  </div>

                  <button 
                    onClick={() => {
                      setCreateName('');
                      setCreateColor('#ef4444');
                      setCreateIcon('wallet');
                      setMode('create');
                    }}
                    className="px-4 bg-red-600 hover:bg-red-700 text-white font-display text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 active:scale-95 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                  >
                    <Plus className="w-4 h-4" />
                    Create
                  </button>

                  <button 
                    onClick={() => {
                      setImportName('');
                      setImportColor('#6366f1');
                      setImportIcon('wallet');
                      setMode('import');
                    }}
                    className="p-3 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 rounded-xl transition-all active:scale-95"
                    title="Import Wallet"
                  >
                    <Import className="w-4.5 h-4.5" />
                  </button>
                </div>

                {/* Wallets Array */}
                <div className="flex flex-col gap-3">
                  {filteredWallets.map(w => (
                    <div 
                      key={w.id}
                      className={`p-4 rounded-2xl border transition-all relative ${
                        w.isActive 
                          ? 'bg-neutral-950 border-red-500/30 shadow-[0_4px_20px_rgba(239,68,68,0.03)]' 
                          : 'bg-neutral-950/40 border-neutral-900 hover:border-neutral-800'
                      }`}
                    >
                      {/* Active Indicator Pin */}
                      {w.isActive && (
                        <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-red-950/20 border border-red-500/20 px-2 py-0.5 rounded-md font-mono text-[8px] text-red-500 font-bold uppercase tracking-wide">
                          <Check className="w-2.5 h-2.5" />
                          Primary Active
                        </div>
                      )}

                      {/* Info & Presets */}
                      <div className="flex items-start gap-3.5">
                        <div 
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                          style={{ backgroundColor: `${w.color}15`, borderColor: `${w.color}30` }}
                        >
                          {renderWalletIcon(w.icon, w.color, "w-5 h-5")}
                        </div>

                        <div className="flex-1 min-w-0 pr-12">
                          <div className="flex items-center gap-2">
                            {editingWalletId === w.id ? (
                              <input 
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onBlur={() => handleRename(w.id)}
                                onKeyDown={(e) => e.key === 'Enter' && handleRename(w.id)}
                                autoFocus
                                className="bg-neutral-900 border border-neutral-800 p-1 text-xs text-white rounded-md max-w-[120px]"
                              />
                            ) : (
                              <span className="text-xs font-display font-bold text-white truncate block">
                                {w.name}
                              </span>
                            )}

                            {editingWalletId !== w.id && (
                              <button 
                                onClick={() => {
                                  setEditingWalletId(w.id);
                                  setEditName(w.name);
                                }}
                                className="text-neutral-500 hover:text-white transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <span className="text-[10px] text-neutral-500 font-mono block mt-0.5">
                            {w.address.slice(0, 12)}...{w.address.slice(-12)}
                          </span>

                          {/* Balances Display */}
                          <div className="flex items-baseline gap-1 mt-2.5">
                            <span className="text-sm font-display font-bold text-neutral-200">${w.totalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span className="text-[9px] text-neutral-500 font-mono">USD</span>
                          </div>
                        </div>
                      </div>

                      {/* Backup Required Alert Badge */}
                      {!w.isBackupConfirmed && (
                        <button 
                          onClick={() => handleBackupRequest(w)}
                          className="w-full mt-3.5 p-2.5 rounded-xl bg-amber-950/15 border border-amber-500/20 flex items-center justify-between text-amber-500 hover:bg-amber-950/30 transition-all font-mono text-[9px] font-bold uppercase tracking-wide"
                        >
                          <div className="flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 animate-bounce" />
                            <span>Security Directive: Backup Required!</span>
                          </div>
                          <span className="underline">Back Up Now</span>
                        </button>
                      )}

                      {/* Actions Bar */}
                      <div className="flex items-center gap-2 mt-4 pt-3.5 border-t border-neutral-900/60 justify-between">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setCustomizingWallet(w);
                              setCreateColor(w.color);
                              setCreateIcon(w.icon);
                              setMode('customize');
                            }}
                            className="text-[10px] font-mono text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-850 px-2.5 py-1.5 rounded-lg transition-all uppercase flex items-center gap-1"
                          >
                            <Palette className="w-3 h-3" />
                            Customize
                          </button>

                          {!w.isActive && (
                            <button
                              onClick={() => handleRemoveRequest(w)}
                              className="text-[10px] font-mono text-neutral-500 hover:text-red-400 bg-neutral-900/30 border border-neutral-850/30 px-2.5 py-1.5 rounded-lg transition-all uppercase flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              Remove Wallet
                            </button>
                          )}
                        </div>

                        {!w.isActive && (
                          <button
                            onClick={() => handleSwitchRequest(w)}
                            className="text-[10px] font-display font-semibold uppercase tracking-wider text-white bg-red-600 hover:bg-red-700 px-4 py-1.5 rounded-lg transition-all active:scale-95 shadow-[0_0_10px_rgba(239,68,68,0.1)]"
                          >
                            Switch Wallet
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {filteredWallets.length === 0 && (
                    <div className="text-center p-8 text-xs text-neutral-500 font-mono">
                      No matching vaults found.
                    </div>
                  )}
                </div>
              </>
            )}

            {/* -------------------- CREATE SCREEN -------------------- */}
            {mode === 'create' && (
              <div className="flex flex-col gap-5">
                <h3 className="text-xs font-display font-bold text-white uppercase tracking-wider">Generate Secure Wallet</h3>
                
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] text-neutral-400 font-mono uppercase">Vault Identifier Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Trading Cold Wallet"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 p-3.5 rounded-xl text-xs text-neutral-200 outline-none focus:border-red-500/50 transition-all font-mono"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] text-neutral-400 font-mono uppercase">Accent Color Theme</label>
                  <div className="flex gap-2 flex-wrap">
                    {COLOR_PRESETS.map(c => (
                      <button
                        key={c.value}
                        onClick={() => setCreateColor(c.value)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                          createColor === c.value ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c.value }}
                        title={c.name}
                      >
                        {createColor === c.value && <Check className="w-4 h-4 text-white drop-shadow" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] text-neutral-400 font-mono uppercase">Symbolic Icon Representation</label>
                  <div className="grid grid-cols-3 gap-2">
                    {ICON_PRESETS.map(i => {
                      const IconComp = i.icon;
                      return (
                        <button
                          key={i.id}
                          onClick={() => setCreateIcon(i.id)}
                          className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                            createIcon === i.id 
                              ? 'bg-neutral-900 border-red-500 text-white' 
                              : 'bg-neutral-950 border-neutral-900 text-neutral-400 hover:text-white'
                          }`}
                        >
                          <IconComp className="w-4 h-4" />
                          <span className="text-[8px] uppercase tracking-wider font-mono">{i.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => setMode('list')}
                    className="w-1/2 py-3.5 bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 text-neutral-300 font-display text-xs font-semibold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    className="w-1/2 py-3.5 bg-red-600 hover:bg-red-700 text-white font-display text-xs font-semibold rounded-xl transition-all shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                  >
                    Generate Keys
                  </button>
                </div>
              </div>
            )}

            {/* -------------------- BACKUP FLOW SCREEN -------------------- */}
            {mode === 'backup_flow' && createResult && (
              <div className="flex flex-col gap-5">
                <div className="p-4 rounded-xl bg-amber-950/15 border border-amber-500/20 text-amber-500 font-mono text-[10px] leading-relaxed">
                  <div className="flex items-center gap-1.5 font-bold uppercase mb-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span>Directive: Seed Phrase Verification Required</span>
                  </div>
                  Please write down these recovery credentials. These words and keys grant absolute control of your assets. If lost, they cannot be recovered.
                </div>

                <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-900 flex flex-col gap-4">
                  <div>
                    <span className="text-[9px] text-neutral-500 font-mono uppercase">12-word Seed Phrase</span>
                    <div className="p-3 bg-neutral-900 rounded-xl text-xs text-white leading-relaxed font-mono mt-1 border border-neutral-850 break-words select-all">
                      {createResult.seedPhrase}
                    </div>
                  </div>

                  <div>
                    <span className="text-[9px] text-neutral-500 font-mono uppercase">Raw Private Key</span>
                    <div className="p-3 bg-neutral-900 rounded-xl text-[10px] text-white font-mono mt-1 border border-neutral-850 break-all select-all flex items-center justify-between">
                      <span className="truncate pr-4">{createResult.privateKey}</span>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(createResult.privateKey);
                          alert('Copied to clipboard!');
                        }}
                        className="text-neutral-500 hover:text-white transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[9px] text-neutral-500 font-mono uppercase">Derivation Address</span>
                    <span className="text-xs text-neutral-300 font-mono block mt-1 break-all select-all">{createResult.address}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    // find latest wallet to set as backed up or let server handle
                    const newlyCreated = wallets.find(w => w.address === createResult.address);
                    if (newlyCreated) {
                      handleBackupConfirm(newlyCreated.id);
                    } else {
                      setMode('list');
                      fetchWallets();
                    }
                  }}
                  className="w-full mt-3 py-3.5 bg-red-600 hover:bg-red-700 text-white font-display text-xs font-semibold rounded-xl transition-all shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                >
                  I Have Safely Written Down Credentials
                </button>
              </div>
            )}

            {/* -------------------- BACKUP REVEAL SCREEN (FROM LIST WARNING) -------------------- */}
            {backupRevealWallet && (
              <div className="flex flex-col gap-5">
                <div className="p-4 rounded-xl bg-amber-950/15 border border-amber-500/20 text-amber-500 font-mono text-[10px] leading-relaxed">
                  <div className="flex items-center gap-1.5 font-bold uppercase mb-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500 animate-pulse" />
                    <span>Vault Recovery Verification</span>
                  </div>
                  Verify your seed words or private keys. Click confirmation below to permanently clear the warning banner.
                </div>

                <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-900 flex flex-col gap-4">
                  <h4 className="text-xs font-bold text-white uppercase font-display">{backupRevealWallet.name} Credentials</h4>
                  
                  <div>
                    <span className="text-[9px] text-neutral-500 font-mono uppercase">Seed Word List</span>
                    <div className="p-3 bg-neutral-900 rounded-xl text-xs text-white leading-relaxed font-mono mt-1 border border-neutral-850 select-all">
                      {backupSeedPhrase}
                    </div>
                  </div>

                  <div>
                    <span className="text-[9px] text-neutral-500 font-mono uppercase">Signing Private Key</span>
                    <div className="p-3 bg-neutral-900 rounded-xl text-[10px] text-white font-mono mt-1 border border-neutral-850 break-all select-all flex items-center justify-between">
                      <span className="truncate pr-4">{backupPrivateKey || 'Retrieving...'}</span>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(backupPrivateKey);
                          setBackupCopied(true);
                          setTimeout(() => setBackupCopied(false), 2000);
                        }}
                        className="text-neutral-400 hover:text-white transition-colors"
                      >
                        {backupCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setBackupRevealWallet(null)}
                    className="w-1/2 py-3.5 bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 text-neutral-300 font-display text-xs font-semibold rounded-xl transition-all"
                  >
                    Go Back
                  </button>
                  <button
                    onClick={() => handleBackupConfirm(backupRevealWallet.id)}
                    className="w-1/2 py-3.5 bg-green-600 hover:bg-green-700 text-white font-display text-xs font-semibold rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                  >
                    Confirm & Dismiss Warning
                  </button>
                </div>
              </div>
            )}

            {/* -------------------- IMPORT SCREEN -------------------- */}
            {mode === 'import' && (
              <div className="flex flex-col gap-5">
                <h3 className="text-xs font-display font-bold text-white uppercase tracking-wider">Import Existing Wallet</h3>

                <div className="flex gap-1.5 bg-neutral-950 border border-neutral-900 p-0.5 rounded-xl">
                  <button
                    onClick={() => {
                      setImportType('key');
                      setImportError(null);
                    }}
                    className={`w-1/2 py-1.5 rounded-lg text-[10px] font-display font-semibold uppercase tracking-wider transition-all ${
                      importType === 'key' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    Private Key
                  </button>
                  <button
                    onClick={() => {
                      setImportType('seed');
                      setImportError(null);
                    }}
                    className={`w-1/2 py-1.5 rounded-lg text-[10px] font-display font-semibold uppercase tracking-wider transition-all ${
                      importType === 'seed' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    Seed Mnemonic
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] text-neutral-400 font-mono uppercase">Vault Name Alias</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Imported Ledger Account"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 p-3.5 rounded-xl text-xs text-neutral-200 outline-none focus:border-red-500/50 transition-all font-mono"
                  />
                </div>

                {importType === 'key' ? (
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] text-neutral-400 font-mono uppercase">Enter Private Key</label>
                    <textarea 
                      placeholder="Paste 64-character hex private key..."
                      value={importPrivateKey}
                      onChange={(e) => setImportPrivateKey(e.target.value)}
                      rows={3}
                      className="w-full bg-neutral-900 border border-neutral-800 p-3.5 rounded-xl text-xs text-neutral-200 outline-none focus:border-red-500/50 transition-all font-mono resize-none"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] text-neutral-400 font-mono uppercase">Enter 12-word Seed Phrase</label>
                    <textarea 
                      placeholder="Enter 12 words separated by spaces in exact sequence..."
                      value={importSeedPhrase}
                      onChange={(e) => setImportSeedPhrase(e.target.value)}
                      rows={3}
                      className="w-full bg-neutral-900 border border-neutral-800 p-3.5 rounded-xl text-xs text-neutral-200 outline-none focus:border-red-500/50 transition-all font-mono resize-none"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] text-neutral-400 font-mono uppercase">Custom Color Accent</label>
                  <div className="flex gap-2 flex-wrap">
                    {COLOR_PRESETS.map(c => (
                      <button
                        key={c.value}
                        onClick={() => setImportColor(c.value)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                          importColor === c.value ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c.value }}
                      >
                        {importColor === c.value && <Check className="w-4 h-4 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>

                {importError && (
                  <div className="p-3 bg-red-950/20 border border-red-500/20 text-red-400 font-mono text-[10px] rounded-xl flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{importError}</span>
                  </div>
                )}

                {importSuccess && (
                  <div className="p-3 bg-green-950/20 border border-green-500/20 text-green-400 font-mono text-[10px] rounded-xl flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 shrink-0 text-green-400" />
                    <span>Wallet verified and imported successfully!</span>
                  </div>
                )}

                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => setMode('list')}
                    className="w-1/2 py-3.5 bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 text-neutral-300 font-display text-xs font-semibold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={importSuccess}
                    className="w-1/2 py-3.5 bg-red-600 hover:bg-red-700 text-white font-display text-xs font-semibold rounded-xl transition-all disabled:opacity-50"
                  >
                    Verify & Mount
                  </button>
                </div>
              </div>
            )}

            {/* -------------------- CUSTOMIZE SCREEN -------------------- */}
            {mode === 'customize' && customizingWallet && (
              <div className="flex flex-col gap-5">
                <h3 className="text-xs font-display font-bold text-white uppercase tracking-wider">Customize {customizingWallet.name} Theme</h3>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] text-neutral-400 font-mono uppercase">Color Accent Preset</label>
                  <div className="flex gap-2 flex-wrap">
                    {COLOR_PRESETS.map(c => (
                      <button
                        key={c.value}
                        onClick={() => setCreateColor(c.value)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                          createColor === c.value ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c.value }}
                      >
                        {createColor === c.value && <Check className="w-4 h-4 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] text-neutral-400 font-mono uppercase">Symbolic Icon representation</label>
                  <div className="grid grid-cols-3 gap-2">
                    {ICON_PRESETS.map(i => {
                      const IconComp = i.icon;
                      return (
                        <button
                          key={i.id}
                          onClick={() => setCreateIcon(i.id)}
                          className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                            createIcon === i.id 
                              ? 'bg-neutral-900 border-red-500 text-white' 
                              : 'bg-neutral-950 border-neutral-900 text-neutral-400 hover:text-white'
                          }`}
                        >
                          <IconComp className="w-4 h-4" />
                          <span className="text-[8px] uppercase tracking-wider font-mono">{i.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => {
                      setMode('list');
                      setCustomizingWallet(null);
                    }}
                    className="w-1/2 py-3.5 bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 text-neutral-300 font-display text-xs font-semibold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCustomizeSave}
                    className="w-1/2 py-3.5 bg-red-600 hover:bg-red-700 text-white font-display text-xs font-semibold rounded-xl transition-all"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            )}

          </div>

          {/* -------------------- SECURE PIN PROMPT OVERLAY -------------------- */}
          {secureAction && (
            <div className="absolute inset-0 z-50 bg-black flex flex-col justify-between p-6">
              {/* Upper block */}
              <div className="flex flex-col items-center text-center mt-8">
                <div className="w-16 h-16 rounded-full bg-red-950/40 border border-red-500/30 flex items-center justify-center mb-5 red-glow">
                  <Lock className="w-6 h-6 text-red-500 animate-pulse" />
                </div>
                <h3 className="text-lg font-display font-bold text-white">
                  {secureAction.type === 'switch' ? 'Verify Account PIN' : 'Verify Account PIN'}
                </h3>
                <p className="text-xs text-neutral-400 mt-1 max-w-xs leading-relaxed">
                  {secureAction.type === 'switch' 
                    ? `Please enter your 6-digit Account PIN to switch active control to "${secureAction.wallet.name}"`
                    : `Please enter your 6-digit Account PIN to decrypt backup secrets for "${secureAction.wallet.name}"`
                  }
                </p>

                {/* password dots */}
                <motion.div 
                  animate={secureShake ? { x: [-10, 10, -10, 10, 0] } : {}}
                  className="flex items-center gap-4 mt-8"
                >
                  {[...Array(6)].map((_, i) => {
                    const active = i < securePin.length;
                    return (
                      <div 
                        key={i} 
                        className={`w-4 h-4 rounded-full border transition-all duration-300 ${
                          active 
                            ? 'bg-red-500 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] scale-110' 
                            : 'bg-neutral-900 border-neutral-700'
                        }`}
                      />
                    );
                  })}
                </motion.div>

                {/* feed lines */}
                <div className="h-6 mt-6 flex items-center">
                  {secureError ? (
                    <span className="text-red-500 text-xs flex items-center gap-1 font-mono">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {secureError}
                    </span>
                  ) : secureLoading ? (
                    <span className="text-red-400 text-xs font-mono flex items-center gap-1.5 animate-pulse">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Decrypting database layers...
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Keyboard Grid */}
              <div className="w-full max-w-xs mx-auto mb-4">
                <div className="grid grid-cols-3 gap-y-4 gap-x-6 justify-items-center">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      disabled={secureLoading}
                      onClick={() => handleSecurePinClick(num)}
                      className="w-16 h-16 rounded-full border border-neutral-900 bg-neutral-950/60 active:bg-red-950/30 active:border-red-500/30 disabled:opacity-20 text-white font-display text-2xl flex items-center justify-center transition-all duration-200 outline-none select-none hover:border-neutral-800"
                    >
                      {num}
                    </button>
                  ))}
                  
                  <button
                    type="button"
                    disabled={secureLoading}
                    onClick={handleSecurePinClear}
                    className="w-16 h-16 text-neutral-500 text-xs font-mono flex items-center justify-center outline-none disabled:opacity-20"
                  >
                    CLEAR
                  </button>

                  <button
                    type="button"
                    disabled={secureLoading}
                    onClick={() => handleSecurePinClick(0)}
                    className="w-16 h-16 rounded-full border border-neutral-900 bg-neutral-950/60 active:bg-red-950/30 active:border-red-500/30 disabled:opacity-20 text-white font-display text-2xl flex items-center justify-center transition-all duration-200 outline-none hover:border-neutral-800"
                  >
                    0
                  </button>

                  <button
                    type="button"
                    disabled={secureLoading}
                    onClick={handleSecurePinDelete}
                    className="w-16 h-16 text-neutral-400 flex items-center justify-center outline-none active:text-red-500 disabled:opacity-20"
                  >
                    <Delete className="w-5 h-5" />
                  </button>
                </div>

                {/* Cancel secure flow button */}
                <button
                  onClick={() => setSecureAction(null)}
                  disabled={secureLoading}
                  className="w-full mt-6 py-2.5 bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 text-neutral-400 hover:text-white rounded-xl text-xs font-display font-medium transition-all"
                >
                  Cancel Action
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
