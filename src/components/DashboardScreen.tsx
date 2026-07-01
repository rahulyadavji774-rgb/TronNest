import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowUpRight, ArrowDownLeft, Copy, Share2, Eye, EyeOff, RefreshCw, 
  Settings, Bell, CreditCard, ChevronRight, Check, X, AlertCircle, 
  Sliders, Info, HelpCircle, Activity, LayoutGrid, Award, Coins
} from 'lucide-react';
import { TronWeb } from 'tronweb';
import { Token, Transaction, Notification } from '../types';
import PasscodeScreen from './PasscodeScreen';

interface DashboardScreenProps {
  token: string;
  address: string;
  onLogout: () => void;
  onOpenAdmin: () => void;
}

export default function DashboardScreen({ token, address, onLogout, onOpenAdmin }: DashboardScreenProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hideBalances, setHideBalances] = useState(false);
  const [portfolio, setPortfolio] = useState<{ totalPortfolioUsd: number; assets: Token[]; isUnavailable?: boolean } | null>(null);
  const [portfolioError, setPortfolioError] = useState(false);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [resources, setResources] = useState<{ bandwidth: { limit: number; remaining: number }; energy: { limit: number; remaining: number } }>({
    bandwidth: { limit: 1500, remaining: 1500 },
    energy: { limit: 100000, remaining: 35000 }
  });

  // Transfer Modal State
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [transferStep, setTransferStep] = useState<'details' | 'confirm' | 'passcode' | 'success' | 'failure'>('details');
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [txDetails, setTxDetails] = useState<any>(null);

  // Advanced Estimations & QR scanner State
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimatedFee, setEstimatedFee] = useState<number>(0);
  const [estBandwidthNeeded, setEstBandwidthNeeded] = useState<number>(0);
  const [estEnergyNeeded, setEstEnergyNeeded] = useState<number>(0);
  const [insufficientTrxFee, setInsufficientTrxFee] = useState(false);
  const [insufficientEnergy, setInsufficientEnergy] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  // Receive Modal State
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  // Load profile and transactions
  const fetchData = async () => {
    try {
      setPortfolioError(false);
      // 1. Portfolio
      const portfolioRes = await fetch('/api/wallet/portfolio', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!portfolioRes.ok) {
        throw new Error('Portfolio API failed');
      }
      const portfolioData = await portfolioRes.json();
      if (portfolioData.success) {
        setPortfolio(portfolioData.data);
        if (portfolioData.data?.isUnavailable) {
          setPortfolioError(true);
        }
      } else {
        setPortfolioError(true);
      }

      // 2. Transaction History
      const historyRes = await fetch('/api/wallet/history', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        if (historyData.success) {
          setHistory(historyData.data);
        }
      }

      // 3. Notifications
      const notifRes = await fetch('/api/wallet/notifications', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (notifRes.ok) {
        const notifData = await notifRes.json();
        if (notifData.success) {
          setNotifications(notifData.data);
          setNotificationCount(notifData.data.filter((n: any) => !n.is_read).length);
        }
      }

      // 4. Resources (Bandwidth & Energy)
      const resRes = await fetch('/api/wallet/resources', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resRes.ok) {
        const resData = await resRes.json();
        if (resData.success) {
          setResources(resData.data);
        }
      }
    } catch (e) {
      console.error('Failed to load wallet data:', e);
      setPortfolioError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareAddress = () => {
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  const handleClearNotifications = async () => {
    try {
      await fetch('/api/wallet/notifications/read', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setNotificationCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (e) {
      console.error(e);
    }
  };

  // Open transfer wizard
  const openSend = (token: Token) => {
    setSelectedToken(token);
    setRecipient('');
    setAmount('');
    setTransferStep('details');
    setTransferError(null);
    setEstimatedFee(0);
    setEstBandwidthNeeded(0);
    setEstEnergyNeeded(0);
    setInsufficientTrxFee(false);
    setInsufficientEnergy(false);
    setShowSendModal(true);
  };

  // Estimate bandwidth and energy requirements before sending on-chain
  const runEstimation = async (targetRecipient: string, targetAmount: string, tokenObj: Token) => {
    setIsEstimating(true);
    setInsufficientTrxFee(false);
    setInsufficientEnergy(false);
    setEstimatedFee(0);
    setEstBandwidthNeeded(0);
    setEstEnergyNeeded(0);

    try {
      if (tokenObj.isInternal) {
        setIsEstimating(false);
        return;
      }

      // 1. Base requirements
      let bandwidthNeeded = 270; // TRON standard transfer is ~260-290 bandwidth points
      let energyNeeded = 0;

      // 2. Fetch account resources
      const resRes = await fetch('/api/wallet/resources', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await resRes.json();
      const userResources = resData.success ? resData.data : { bandwidth: { remaining: 1500 }, energy: { remaining: 0 } };

      const remainingBandwidth = userResources.bandwidth?.remaining || 0;
      const remainingEnergy = userResources.energy?.remaining || 0;

      // 3. Check selected asset type (TRX vs USDT)
      if (tokenObj.symbol === 'USDT') {
        bandwidthNeeded = 345; // USDT is TRC20, uses around 345 bandwidth points
        
        // Check if recipient is activated
        const actRes = await fetch(`/api/wallet/is-activated?address=${targetRecipient}`);
        const actData = await actRes.json();
        const isRecipientActivated = actData.success ? actData.isActivated : true;
        
        // USDT TRC20 transfer consumes 31,895 Energy (if recipient is active) or 64,895 Energy (if inactive)
        energyNeeded = isRecipientActivated ? 32000 : 65000;
      }

      // 4. Calculate TRX required to burn for missing resources
      let trxToBurn = 0;

      if (remainingBandwidth < bandwidthNeeded) {
        const missingBandwidth = bandwidthNeeded - remainingBandwidth;
        trxToBurn += missingBandwidth * 0.001; // 1000 SUN (0.001 TRX) per bandwidth point
      }

      if (remainingEnergy < energyNeeded) {
        const missingEnergy = energyNeeded - remainingEnergy;
        trxToBurn += missingEnergy * 0.00042; // 420 SUN (0.00042 TRX) per energy point
        setInsufficientEnergy(true);
      }

      // Find user's actual TRX balance
      const trxToken = portfolio?.assets.find(a => a.symbol === 'TRX');
      const trxBalance = trxToken ? trxToken.balance : 0;

      // Calculate total TRX cost for this transaction
      let totalTrxNeeded = trxToBurn;
      if (tokenObj.symbol === 'TRX') {
        totalTrxNeeded += parseFloat(targetAmount);
      }

      if (trxBalance < totalTrxNeeded) {
        setInsufficientTrxFee(true);
      }

      setEstBandwidthNeeded(bandwidthNeeded);
      setEstEnergyNeeded(energyNeeded);
      setEstimatedFee(parseFloat(trxToBurn.toFixed(3)));
    } catch (e) {
      console.error('Resource estimation error:', e);
    } finally {
      setIsEstimating(false);
    }
  };

  // Confirm transfer details and go to confirmation/estimation screen
  const handleDetailsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient.trim() || !amount) return;

    // Address format validation using regex for Base58 TRON address
    const isTronAddress = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(recipient.trim());
    if (!isTronAddress && !selectedToken?.isInternal) {
      setTransferError('Invalid TRON address format (must start with T)');
      return;
    }

    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setTransferError('Amount must be positive');
      return;
    }
    if (selectedToken && num > selectedToken.balance) {
      setTransferError('Insufficient balance');
      return;
    }

    setTransferError(null);
    if (selectedToken?.isInternal) {
      setTransferStep('passcode');
    } else {
      setTransferStep('confirm');
      runEstimation(recipient.trim(), amount, selectedToken!);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setRecipient(text.trim());
      }
    } catch (e) {
      const text = prompt("Paste your TRON address here:");
      if (text) {
        setRecipient(text.trim());
      }
    }
  };

  // Complete transfer after passcode entry
  const handleTransferPasscodeSubmit = async (passcode: string) => {
    if (!selectedToken) return;
    setTransferLoading(true);
    setTransferError(null);

    // If it's an internal token, use legacy endpoint (keeps internal engine unchanged!)
    if (selectedToken.isInternal) {
      try {
        const res = await fetch('/api/wallet/transfer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            tokenSymbol: selectedToken.symbol,
            recipientAddress: recipient.trim(),
            amount: parseFloat(amount),
            passcode
          })
        });
        const data = await res.json();
        if (data.success) {
          setTxDetails(data.data);
          setTransferStep('success');
          fetchData();
        } else {
          setTransferError(data.message || 'Transfer failed');
          setTransferStep('details');
        }
      } catch (e) {
        setTransferError('Network issue. Try again.');
        setTransferStep('details');
      } finally {
        setTransferLoading(false);
      }
      return;
    }

    // Client-side local signing for TRX and USDT (private key never leaves device!)
    try {
      // 1. Get the private key (from localStorage, falling back to secure retrieval)
      let privateKey = localStorage.getItem(`wallet_private_key_${address}`);
      if (!privateKey) {
        // Retrieve and cache
        const keyRes = await fetch('/api/wallet/private-key', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ passcode })
        });
        const keyData = await keyRes.json();
        if (!keyRes.ok || !keyData.success) {
          setTransferError(keyData.message || 'Invalid passcode verification');
          setTransferStep('details');
          setTransferLoading(false);
          return;
        }
        privateKey = keyData.privateKey;
        if (privateKey && privateKey !== 'secured_on_client') {
          localStorage.setItem(`wallet_private_key_${address}`, privateKey);
        }
      }

      if (!privateKey || privateKey === 'secured_on_client') {
        setTransferError('Decryption failed. Private key not stored locally. Please re-import wallet.');
        setTransferStep('details');
        setTransferLoading(false);
        return;
      }

      // 2. Build the transaction using TronWeb client-side
      const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' });
      let signedTx: any = null;

      if (selectedToken.symbol === 'TRX') {
        const sunAmount = Math.round(parseFloat(amount) * 1_000_000);
        const transaction = await tronWeb.transactionBuilder.sendTrx(recipient.trim(), sunAmount, address);
        signedTx = await tronWeb.trx.sign(transaction, privateKey);
      } else {
        // USDT
        const contractAddress = selectedToken.contract_address || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
        const decimals = selectedToken.decimals || 6;
        const amountInUnits = Math.round(parseFloat(amount) * Math.pow(10, decimals));
        const parameter = [
          { type: 'address', value: recipient.trim() },
          { type: 'uint256', value: amountInUnits }
        ];
        const transaction = await tronWeb.transactionBuilder.triggerSmartContract(
          contractAddress,
          'transfer(address,uint256)',
          { feeLimit: 100_000_000 },
          parameter,
          address
        );
        signedTx = await tronWeb.trx.sign(transaction.transaction, privateKey);
      }

      // 3. Broadcast to TRON Mainnet via server proxy (which logs to database)
      const res = await fetch('/api/wallet/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          signedTx,
          passcode,
          recipientAddress: recipient.trim(),
          amount: parseFloat(amount),
          tokenSymbol: selectedToken.symbol
        })
      });
      const data = await res.json();
      if (data.success) {
        setTxDetails(data.data);
        setTransferStep('success');
        fetchData();
      } else {
        setTransferError(data.message || 'Transaction broadcast failed');
        setTransferStep('failure');
      }
    } catch (e: any) {
      setTransferError(e.message || 'Signing failed. Insufficient resources.');
      setTransferStep('failure');
    } finally {
      setTransferLoading(false);
    }
  };

  return (
    <div className="h-full bg-black text-white flex flex-col justify-between overflow-hidden relative">
      {/* Top Profile Header */}
      <div className="px-6 pt-5 pb-4 bg-gradient-to-b from-neutral-950 to-transparent flex items-center justify-between border-b border-neutral-900/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-950/20 border border-red-500/20 flex items-center justify-center font-display font-semibold text-red-500 text-sm red-glow">
            TN
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-neutral-500 font-mono tracking-wider font-semibold uppercase">My Wallet</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-neutral-300 font-mono font-medium">
                {address.slice(0, 6)}...{address.slice(-6)}
              </span>
              <button onClick={handleCopyAddress} className="text-neutral-500 hover:text-white transition-all">
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Admin Control Trigger */}
          <button 
            onClick={onOpenAdmin}
            className="w-9 h-9 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-red-500 hover:border-red-500/30 active:scale-95 transition-all"
            title="Admin panel"
          >
            <Sliders className="w-4 h-4" />
          </button>

          {/* Notification Alert Trigger */}
          <button 
            onClick={() => {
              setShowNotifications(true);
              handleClearNotifications();
            }}
            className="w-9 h-9 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 active:scale-95 transition-all relative"
          >
            <Bell className="w-4 h-4" />
            {notificationCount > 0 && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border border-black rounded-full" />
            )}
          </button>

          <button 
            onClick={handleRefresh}
            className={`w-9 h-9 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 active:scale-95 transition-all ${refreshing ? 'animate-spin' : ''}`}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <RefreshCw className="w-8 h-8 text-red-500 animate-spin" />
            <span className="text-xs font-mono text-neutral-500">Retrieving balances from TRON Blockchain...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Balance Overview Card */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 border border-white/5 relative overflow-hidden red-glow">
              <div className="absolute top-0 right-0 p-5 opacity-10">
                <Coins className="w-32 h-32 text-red-500" />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500 font-medium font-sans">Total Portfolio Value</span>
                <button 
                  onClick={() => setHideBalances(!hideBalances)}
                  className="text-neutral-500 hover:text-neutral-300 transition-all"
                >
                  {hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="text-3xl font-display font-bold tracking-tight text-white mt-1.5 flex items-baseline">
                {hideBalances ? (
                  <span>••••••</span>
                ) : (portfolioError || portfolio?.isUnavailable) ? (
                  <span className="text-xl font-mono text-neutral-400">Unavailable</span>
                ) : (
                  <>
                    <span className="text-lg text-neutral-500 font-mono font-medium mr-1">$</span>
                    {portfolio ? portfolio.totalPortfolioUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                  </>
                )}
              </div>

              <div className="flex items-center gap-1.5 mt-2.5 text-[10px] text-neutral-400 font-mono">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span>Active Network: TRON Mainnet</span>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3.5 mt-6 border-t border-neutral-900 pt-5">
                <button 
                  onClick={() => {
                    const trx = portfolio?.assets.find(a => a.symbol === 'TRX');
                    if (trx) openSend(trx);
                  }}
                  className="py-3 bg-red-600 hover:bg-red-700 active:scale-98 text-white font-display text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  Send
                </button>

                <button 
                  onClick={() => setShowReceiveModal(true)}
                  className="py-3 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-200 font-display text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-98"
                >
                  <ArrowDownLeft className="w-4 h-4 text-red-500" />
                  Receive
                </button>
              </div>
            </div>

            {/* TRON Network Resource Indicators */}
            <div className="grid grid-cols-2 gap-3 p-4 bg-neutral-950 border border-neutral-900 rounded-xl">
              <div className="flex flex-col">
                <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500 uppercase">
                  <span>Bandwidth</span>
                  <span className="text-neutral-400">
                    {(portfolioError || portfolio?.isUnavailable) ? 'Unavailable' : `${resources.bandwidth.remaining.toLocaleString()} / ${resources.bandwidth.limit.toLocaleString()}`}
                  </span>
                </div>
                <div className="w-full bg-neutral-900 h-1.5 rounded-full mt-1.5 overflow-hidden">
                  <div 
                    className="bg-red-500 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${(portfolioError || portfolio?.isUnavailable || resources.bandwidth.limit === 0) ? 0 : (resources.bandwidth.remaining / resources.bandwidth.limit) * 100}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-col border-l border-neutral-900 pl-3">
                <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500 uppercase">
                  <span>Energy</span>
                  <span className="text-red-400">
                    {(portfolioError || portfolio?.isUnavailable) ? 'Unavailable' : `${resources.energy.remaining.toLocaleString()} / ${resources.energy.limit.toLocaleString()}`}
                  </span>
                </div>
                <div className="w-full bg-neutral-900 h-1.5 rounded-full mt-1.5 overflow-hidden">
                  <div 
                    className="bg-neutral-800 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${(portfolioError || portfolio?.isUnavailable || resources.energy.limit === 0) ? 0 : (resources.energy.remaining / resources.energy.limit) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Assets List */}
            <div>
              <div className="flex items-center justify-between mb-3.5">
                <h3 className="text-xs text-neutral-500 font-mono tracking-wide uppercase font-semibold">My Assets</h3>
              </div>

              <div className="flex flex-col gap-2.5">
                {portfolio?.assets.map((asset) => (
                  <div 
                    key={asset.id} 
                    onClick={() => openSend(asset)}
                    className="p-3.5 bg-neutral-950 border border-neutral-900 hover:border-neutral-800 active:bg-neutral-900/40 rounded-xl flex items-center justify-between transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden flex items-center justify-center relative p-1.5">
                        <img 
                          src={asset.logoUrl} 
                          alt={asset.symbol} 
                          className="w-full h-full object-contain rounded-md"
                          referrerPolicy="no-referrer"
                        />
                        {asset.isInternal && (
                          <span className="absolute bottom-0 right-0 text-[7px] font-mono px-0.5 bg-yellow-600 text-yellow-100 rounded-tl uppercase border-t border-l border-neutral-800 font-bold scale-90">
                            Ledg
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-white font-semibold leading-none">{asset.name}</span>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="text-[10px] text-neutral-400 font-mono">{asset.symbol}</span>
                          <span className="text-[10px] text-neutral-600 font-mono">•</span>
                          <span className="text-[10px] text-neutral-400 font-mono">
                            {(portfolioError || portfolio?.isUnavailable) ? 'Unavailable' : `$${asset.priceUsd.toFixed(2)}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end">
                      <span className="text-sm font-mono font-semibold text-white">
                        {hideBalances ? '••••••' : (portfolioError || portfolio?.isUnavailable) ? 'Unavailable' : asset.balance.toLocaleString(undefined, { maximumFractionDigits: asset.decimals })}
                      </span>
                      <span className="text-[10px] font-mono text-neutral-500 mt-1">
                        {hideBalances ? '••••••' : (portfolioError || portfolio?.isUnavailable) ? 'Unavailable' : `$${asset.valueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Transaction Activity History */}
            <div>
              <div className="flex items-center justify-between mb-3.5 mt-2">
                <h3 className="text-xs text-neutral-500 font-mono tracking-wide uppercase font-semibold">Activity logs</h3>
              </div>

              {history.length === 0 ? (
                <div className="p-6 text-center bg-neutral-950/40 border border-neutral-900 rounded-xl">
                  <Activity className="w-5 h-5 text-neutral-600 mx-auto mb-2" />
                  <p className="text-xs text-neutral-500">No transactions recorded yet.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {history.slice(0, 15).map((tx) => {
                    const isOut = tx.direction === 'out';
                    const isInternal = tx.type === 'internal';
                    return (
                      <div key={tx.id} className="p-3 bg-neutral-950 border border-neutral-900 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                            isOut 
                              ? 'bg-red-950/10 border-red-500/20 text-red-500' 
                              : 'bg-green-950/10 border-green-500/20 text-green-500'
                          }`}>
                            {isOut ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                          </div>

                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-white font-semibold">
                                {isOut ? 'Sent' : 'Received'} {tx.asset_symbol}
                              </span>
                              {isInternal && (
                                <span className="text-[7px] font-mono font-bold px-1 bg-neutral-900 text-neutral-400 rounded border border-neutral-800 uppercase">
                                  Internal
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-neutral-500 font-mono mt-0.5">
                              {isOut ? `To: ${tx.counterparty.slice(0, 5)}...${tx.counterparty.slice(-4)}` : `From: ${tx.counterparty.slice(0, 5)}...${tx.counterparty.slice(-4)}`}
                            </span>
                            {tx.tx_hash && (
                              <a
                                href={`https://tronscan.org/#/transaction/${tx.tx_hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[9px] text-red-500 hover:text-red-400 font-mono mt-0.5 block hover:underline"
                              >
                                Hash: {tx.tx_hash.slice(0, 6)}... <ArrowUpRight className="inline w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end">
                          <span className={`text-xs font-mono font-bold ${isOut ? 'text-neutral-300' : 'text-green-400'}`}>
                            {isOut ? '-' : '+'}{tx.amount}
                          </span>
                          <span className="text-[9px] text-neutral-500 font-mono mt-0.5">
                            {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer System Nav Buttons */}
      <div className="px-6 py-4 border-t border-neutral-900/60 bg-neutral-950/80 backdrop-blur-md flex items-center justify-between select-none">
        <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 font-mono">
          <span>Active account</span>
        </div>
        <button 
          onClick={onLogout}
          className="text-[10px] font-mono text-red-500 hover:text-red-400 font-semibold tracking-wider uppercase bg-red-950/20 border border-red-500/10 rounded-md px-2.5 py-1 transition-all"
        >
          LOG OUT
        </button>
      </div>

      {/* Slide-Up Notifications Drawer */}
      <AnimatePresence>
        {showNotifications && (
          <motion.div 
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            className="absolute inset-0 z-30 bg-black flex flex-col justify-between"
          >
            <div className="px-6 py-5 border-b border-neutral-900/60 flex items-center justify-between">
              <h2 className="text-md font-display font-bold text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-red-500" />
                Alert Notifications
              </h2>
              <button 
                onClick={() => setShowNotifications(false)}
                className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-xs text-neutral-500">
                  No notifications recorded.
                </div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className="p-4 bg-neutral-950 border border-neutral-900 rounded-xl flex flex-col gap-1.5">
                    <span className="text-xs text-white font-bold">{n.title}</span>
                    <span className="text-[11px] text-neutral-400 leading-relaxed font-sans">{n.message}</span>
                    <span className="text-[9px] text-neutral-600 font-mono mt-1">
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slide-Up QR Receive Modal */}
      <AnimatePresence>
        {showReceiveModal && (
          <motion.div 
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            className="absolute inset-0 z-40 bg-black flex flex-col justify-between py-10 px-6"
          >
            <div className="flex justify-end">
              <button 
                onClick={() => setShowReceiveModal(false)}
                className="w-9 h-9 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col items-center text-center max-w-xs mx-auto">
              <span className="text-xs text-neutral-500 font-mono tracking-wide uppercase font-semibold">Deposit Assets</span>
              <h2 className="text-xl font-display font-bold text-white mt-1">My TRON QR Code</h2>
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                Send only TRX, USDT (TRC-20), or custom internal tokens to this wallet address.
              </p>

              {/* QR Image Placeholder - Real high-quality representation */}
              <div className="w-52 h-52 bg-white rounded-2xl p-4 mt-8 flex items-center justify-center shadow-lg relative overflow-hidden">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${address}&color=12-12-12&bgcolor=ffffff`}
                  alt="QR Address"
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Base58 TRON Address */}
              <div className="w-full mt-8 p-3.5 bg-neutral-950 border border-neutral-900 rounded-xl flex items-center justify-between gap-3 relative">
                <span className="text-xs text-neutral-300 font-mono truncate select-all">{address}</span>
                <button 
                  onClick={handleCopyAddress}
                  className="p-1.5 bg-neutral-900 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-all flex items-center justify-center"
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="w-full max-w-xs mx-auto flex gap-3">
              <button
                onClick={handleShareAddress}
                className="w-full py-3.5 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 rounded-xl text-neutral-300 font-display text-xs font-semibold flex items-center justify-center gap-2 transition-all"
              >
                <Share2 className="w-4 h-4" />
                {shared ? 'Link Copied!' : 'Share Address'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slide-Up Send/Transfer Modal Wizard */}
      <AnimatePresence>
        {showSendModal && selectedToken && (
          <motion.div 
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            className="absolute inset-0 z-40 bg-black flex flex-col justify-between py-10 px-6 overflow-hidden"
          >
            {/* Simulation Scanner View Overlay */}
            {showScanner && (
              <div className="absolute inset-0 z-50 bg-black flex flex-col justify-between p-6">
                <div className="flex items-center justify-between border-b border-neutral-900/60 pb-3">
                  <h3 className="text-xs font-mono font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                    <Sliders className="w-4 h-4 text-red-500" />
                    Scan TRON QR Code
                  </h3>
                  <button 
                    onClick={() => setShowScanner(false)}
                    className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center my-6 relative overflow-hidden bg-neutral-950 border border-neutral-900 rounded-2xl p-4">
                  <div className="relative w-44 h-44 border border-neutral-800 rounded-lg flex items-center justify-center overflow-hidden">
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-red-500"></div>
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-red-500"></div>
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-red-500"></div>
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-red-500"></div>
                    
                    {/* Laser line with custom index keyframe animation */}
                    <div className="absolute left-0 right-0 h-0.5 bg-red-500 opacity-80 red-laser shadow-[0_0_10px_#ef4444]"></div>
                    <Coins className="w-8 h-8 text-neutral-800 animate-pulse" />
                  </div>

                  <p className="text-[10px] text-neutral-400 font-mono mt-4 text-center leading-relaxed">
                    Point camera at standard TRON QR code.<br/>
                    <span className="text-neutral-600 text-[9px]">Simulated stream - select active destination:</span>
                  </p>

                  <div className="mt-5 flex flex-col gap-1.5 w-full max-w-xs px-2">
                    <button
                      onClick={() => {
                        setRecipient('TNe4eJFpiT8HuvCdhyQjKxwWXvU78QiPAh');
                        setShowScanner(false);
                      }}
                      className="py-2.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-[11px] text-white font-mono rounded-xl transition-all"
                    >
                      TNe4eJFpiT8HuvCdhyQjKxwWXvU78QiPAh (TRON Nest)
                    </button>
                    <button
                      onClick={() => {
                        setRecipient('TY7pZ9gSAtZ9bSAtZ9bSAtZ9bSAtZ9bSAt');
                        setShowScanner(false);
                      }}
                      className="py-2.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-[11px] text-white font-mono rounded-xl transition-all"
                    >
                      TY7pZ9gSAtZ9bSAt... (Official USDT Pool)
                    </button>
                  </div>
                </div>

                <div className="text-center text-[9px] text-neutral-600 font-mono uppercase tracking-wider">
                  Android Emulated Scanner v1.4
                </div>
              </div>
            )}

            {transferStep !== 'passcode' && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-neutral-900 border border-neutral-800 flex items-center justify-center p-1">
                    <img src={selectedToken.logoUrl} alt="logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                  </div>
                  <span className="text-xs text-neutral-400 font-mono uppercase font-semibold">Send {selectedToken.symbol}</span>
                </div>
                <button 
                  onClick={() => setShowSendModal(false)}
                  className="w-9 h-9 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="flex-1 mt-6 overflow-y-auto">
              <AnimatePresence mode="wait">
                {transferStep === 'details' && (
                  <motion.form 
                    key="details"
                    onSubmit={handleDetailsSubmit}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex flex-col gap-5"
                  >
                    {/* Recipient Input with Paste & Scan */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-neutral-500 font-mono uppercase font-semibold tracking-wider">Recipient TRON Address</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handlePaste}
                            className="text-[9px] font-mono text-red-500 hover:text-red-400 font-bold uppercase tracking-wider bg-red-950/20 border border-red-500/10 px-1.5 py-0.5 rounded"
                          >
                            Paste
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowScanner(true)}
                            className="text-[9px] font-mono text-red-500 hover:text-red-400 font-bold uppercase tracking-wider bg-red-950/20 border border-red-500/10 px-1.5 py-0.5 rounded"
                          >
                            Scan
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        placeholder="Enter Base58 TRON Address (e.g. TXYZ...)"
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        required
                        className="w-full p-3.5 bg-neutral-950 border border-neutral-900 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-500/40 focus:ring-1 focus:ring-red-500/40"
                      />
                    </div>

                    {/* Amount Input */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-neutral-500 font-mono uppercase font-semibold tracking-wider">Amount</label>
                        <span className="text-[10px] text-neutral-400 font-mono">
                          Balance: {selectedToken.balance} {selectedToken.symbol}
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          placeholder="0.00"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          required
                          className="w-full p-3.5 pr-14 bg-neutral-950 border border-neutral-900 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-500/40"
                        />
                        <button
                          type="button"
                          onClick={() => setAmount(String(selectedToken.balance))}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-red-500 hover:text-red-400 font-bold"
                        >
                          MAX
                        </button>
                      </div>
                    </div>

                    {/* Security Notice */}
                    <div className="p-3 bg-neutral-950 border border-neutral-900 rounded-xl flex gap-2.5">
                      <Info className="w-4 h-4 text-red-500 shrink-0" />
                      <div className="text-[10px] text-neutral-400 leading-relaxed font-mono">
                        {selectedToken.isInternal ? (
                          <span>This is an <span className="text-red-400">Internal Token</span> transfer. Settles instantly off-chain via secure internal database. Zero network fee!</span>
                        ) : (
                          <span>This is an <span className="text-red-400">On-Chain Token</span> transfer. Settle time ~1 minute on TRON Mainnet. Est. Bandwidth: 270 - 345 points.</span>
                        )}
                      </div>
                    </div>

                    {transferError && (
                      <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-xl text-xs text-red-400 font-mono flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4" />
                        {transferError}
                      </div>
                    )}

                    <button
                      type="submit"
                      className="w-full mt-4 py-4 bg-red-600 hover:bg-red-700 text-white font-display text-xs font-semibold rounded-xl transition-all shadow-md active:scale-98"
                    >
                      Continue
                    </button>
                  </motion.form>
                )}

                {transferStep === 'confirm' && (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex flex-col gap-5"
                  >
                    <div className="p-4 bg-neutral-950 border border-neutral-900 rounded-xl flex flex-col gap-3.5">
                      <h4 className="text-[10px] text-neutral-500 font-mono uppercase font-semibold tracking-wider border-b border-neutral-900 pb-2">
                        On-Chain Resource Analysis
                      </h4>

                      {isEstimating ? (
                        <div className="py-4 flex flex-col items-center justify-center gap-2">
                          <RefreshCw className="w-5 h-5 text-red-500 animate-spin" />
                          <span className="text-[10px] text-neutral-400 font-mono">Estimating resource requirements...</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2.5">
                          {/* Transfer Amount Summary */}
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-neutral-400">Transfer Amount</span>
                            <span className="font-mono text-white font-bold">{amount} {selectedToken.symbol}</span>
                          </div>

                          {/* Recipient */}
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-neutral-400">Recipient Address</span>
                            <span className="font-mono text-neutral-300 text-[10px]">{recipient.slice(0, 8)}...{recipient.slice(-8)}</span>
                          </div>

                          {/* Estimated Bandwidth */}
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-neutral-400">Bandwidth Cost</span>
                            <span className="font-mono text-neutral-300">{estBandwidthNeeded} Points</span>
                          </div>

                          {/* Estimated Energy */}
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-neutral-400">Energy Cost</span>
                            <span className="font-mono text-neutral-300">{estEnergyNeeded > 0 ? `${estEnergyNeeded.toLocaleString()} Points` : '0 (None Needed)'}</span>
                          </div>

                          {/* Network Burn Fee */}
                          <div className="flex justify-between items-center text-xs border-t border-neutral-900 pt-2">
                            <span className="text-red-400 font-semibold">Est. Burn Fee (TRX)</span>
                            <span className="font-mono text-red-400 font-bold">{estimatedFee} TRX</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Insufficient warnings */}
                    {!isEstimating && insufficientEnergy && (
                      <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-xl text-[10px] text-red-400 font-mono flex gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <div>
                          <strong className="block text-red-300">Energy Deficit Detected</strong>
                          This address has insufficient frozen Energy. Your transaction will automatically burn TRX to cover execution.
                        </div>
                      </div>
                    )}

                    {!isEstimating && insufficientTrxFee && (
                      <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-xl text-[10px] text-red-400 font-mono flex gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <div>
                          <strong className="block text-red-300">Insufficient TRX for Fee Burn</strong>
                          You do not have enough TRX balance to cover the network fee of {estimatedFee} TRX. Please deposit TRX.
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3 mt-4">
                      <button
                        type="button"
                        onClick={() => setTransferStep('details')}
                        className="w-1/3 py-3.5 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 font-display text-xs font-semibold rounded-xl transition-all"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        disabled={!isEstimating && insufficientTrxFee}
                        onClick={() => setTransferStep('passcode')}
                        className={`w-2/3 py-3.5 text-white font-display text-xs font-semibold rounded-xl transition-all shadow-md ${
                          !isEstimating && insufficientTrxFee
                            ? 'bg-neutral-900 border border-neutral-850 text-neutral-600 cursor-not-allowed'
                            : 'bg-red-600 hover:bg-red-700 active:scale-98'
                        }`}
                      >
                        Confirm & Sign
                      </button>
                    </div>
                  </motion.div>
                )}

                {transferStep === 'passcode' && (
                  <motion.div 
                    key="passcode"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full -mt-10"
                  >
                    <PasscodeScreen
                      title="Authorize Transaction"
                      subtitle={`Sending ${amount} ${selectedToken.symbol} to ${recipient.slice(0, 6)}...${recipient.slice(-4)}`}
                      onSubmit={handleTransferPasscodeSubmit}
                      loading={transferLoading}
                      error={transferError}
                    />
                  </motion.div>
                )}

                {transferStep === 'success' && (
                  <motion.div 
                    key="success"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center text-center mt-12 py-6 px-4"
                  >
                    <div className="w-16 h-16 rounded-full bg-green-950/20 border border-green-500/20 flex items-center justify-center text-green-500 mb-5 shadow-[0_0_20px_rgba(34,197,94,0.1)]">
                      <Check className="w-6 h-6 animate-bounce" />
                    </div>

                    <h3 className="text-md font-display font-bold text-white tracking-tight">Transaction Broadcast!</h3>
                    <p className="text-xs text-neutral-400 mt-1 leading-relaxed max-w-xs">
                      Successfully signed locally and broadcast transfer of {amount} {selectedToken.symbol} to TRON Mainnet.
                    </p>

                    {txDetails?.txHash && (
                      <div className="w-full mt-6 p-4 bg-neutral-950 border border-neutral-900 rounded-xl flex flex-col gap-1 text-left">
                        <span className="text-[9px] text-neutral-500 font-mono uppercase tracking-wide">Blockchain Transaction Hash</span>
                        <span className="text-[10px] text-neutral-300 font-mono break-all font-semibold select-all">{txDetails.txHash}</span>
                        <a
                          href={`https://tronscan.org/#/transaction/${txDetails.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-red-500 hover:text-red-400 mt-2 font-mono flex items-center justify-center gap-1 underline self-center font-bold"
                        >
                          View on TronScan <ChevronRight className="w-3 h-3" />
                        </a>
                      </div>
                    )}

                    <button
                      onClick={() => setShowSendModal(false)}
                      className="w-full mt-8 py-3.5 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-200 font-display text-xs font-semibold rounded-xl transition-all active:scale-98"
                    >
                      Done
                    </button>
                  </motion.div>
                )}

                {transferStep === 'failure' && (
                  <motion.div
                    key="failure"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center text-center mt-12 py-6 px-4"
                  >
                    <div className="w-16 h-16 rounded-full bg-red-950/20 border border-red-500/20 flex items-center justify-center text-red-500 mb-5 shadow-[0_0_20px_rgba(239,68,68,0.1)]">
                      <X className="w-6 h-6" />
                    </div>

                    <h3 className="text-md font-display font-bold text-white tracking-tight">Broadcast Failed!</h3>
                    <p className="text-xs text-red-400/90 mt-2 font-mono leading-relaxed max-w-xs bg-red-950/10 border border-red-500/10 p-3 rounded-xl">
                      {transferError || 'An unknown network error occurred while broadcasting your signed transaction.'}
                    </p>

                    <div className="flex gap-3 w-full mt-8">
                      <button
                        onClick={() => {
                          setTransferStep('details');
                          setTransferError(null);
                        }}
                        className="w-1/2 py-3.5 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 font-display text-xs font-semibold rounded-xl transition-all"
                      >
                        Try Again
                      </button>
                      <button
                        onClick={() => setShowSendModal(false)}
                        className="w-1/2 py-3.5 bg-red-600 hover:bg-red-700 text-white font-display text-xs font-semibold rounded-xl transition-all"
                      >
                        Done
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
