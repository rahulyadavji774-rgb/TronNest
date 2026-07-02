import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowUpRight, ArrowDownLeft, Copy, Share2, Eye, EyeOff, RefreshCw, 
  Settings, Bell, CreditCard, ChevronRight, Check, X, AlertCircle, 
  Sliders, Info, HelpCircle, Activity, LayoutGrid, Award, Coins, Shield, Fingerprint, Key, Lock, Unlock, LogOut,
  Star, Trash2, Plus, UserPlus, BookOpen, Users
} from 'lucide-react';
import jsQR from 'jsqr';
import { TronWeb } from 'tronweb';
import { Token, Transaction, Notification } from '../types';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import PasscodeScreen from './PasscodeScreen';
import { secureStorePrivateData, secureRetrievePrivateData, encryptPinForBiometrics, decryptPinForBiometrics } from '../utils/secureStorage';
import { registerBiometrics, verifyBiometrics } from '../utils/biometrics';
import BiometricPrompt from './BiometricPrompt';
import { NotificationCenter } from './NotificationCenter';
import { WalletManager } from './WalletManager';
import { SecurityCenter } from './SecurityCenter';

interface DashboardScreenProps {
  token: string;
  address: string;
  onLogout: () => void;
  onOpenAdmin: () => void;
  autoLockDuration: string;
  setAutoLockDuration: (val: string) => void;
  lockBackground: boolean;
  setLockBackground: (val: boolean) => void;
  remember5m: boolean;
  setRemember5m: (val: boolean) => void;
  biometricsEnabled: boolean;
  setBiometricsEnabled: (val: boolean) => void;
}

export default function DashboardScreen({ 
  token, 
  address, 
  onLogout, 
  onOpenAdmin,
  autoLockDuration,
  setAutoLockDuration,
  lockBackground,
  setLockBackground,
  remember5m,
  setRemember5m,
  biometricsEnabled,
  setBiometricsEnabled
}: DashboardScreenProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hideBalances, setHideBalances] = useState(false);
  
  // Upgraded modules states
  const [showWalletManager, setShowWalletManager] = useState(false);
  const [isWalletBackupConfirmed, setIsWalletBackupConfirmed] = useState(true);
  const [privacyBlur, setPrivacyBlur] = useState(false);

  // Privacy Mode auto-lock and blur handler
  useEffect(() => {
    const handleBlur = () => {
      const privacyOn = localStorage.getItem(`nest_security_privacymode_${address}`) === 'true';
      if (privacyOn) {
        setPrivacyBlur(true);
      }
    };
    const handleFocus = () => {
      setPrivacyBlur(false);
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [address]);

  // Clipboard & Screenshot protection
  useEffect(() => {
    const handleCopyCut = (e: ClipboardEvent) => {
      const protectionOn = localStorage.getItem(`nest_security_screenshot_${address}`) === 'true';
      if (protectionOn) {
        e.preventDefault();
        alert('Security Alert: Clipboard copying is blocked under active Screenshot Protection.');
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const protectionOn = localStorage.getItem(`nest_security_screenshot_${address}`) === 'true';
      if (protectionOn) {
        if (e.key === 'PrintScreen' || (e.metaKey && e.shiftKey && e.key === '3') || (e.metaKey && e.shiftKey && e.key === '4')) {
          alert('Security Alert: Capture is blocked under active Screenshot Protection.');
        }
      }
    };

    document.addEventListener('copy', handleCopyCut);
    document.addEventListener('cut', handleCopyCut);
    window.addEventListener('keyup', handleKeyDown);
    return () => {
      document.removeEventListener('copy', handleCopyCut);
      document.removeEventListener('cut', handleCopyCut);
      window.removeEventListener('keyup', handleKeyDown);
    };
  }, [address]);

  // Sync back up status periodically on wallet load
  useEffect(() => {
    const checkBackupStatus = async () => {
      try {
        const res = await fetch('/api/wallet/list', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const d = await res.json();
          if (d.success) {
            const hasUnbacked = d.data.wallets.some((w: any) => !w.isBackupConfirmed);
            setIsWalletBackupConfirmed(!hasUnbacked);
          }
        }
      } catch (_) {}
    };
    if (token) checkBackupStatus();
  }, [token, showWalletManager]);
  const [portfolio, setPortfolio] = useState<{ totalPortfolioUsd: number; assets: Token[]; isUnavailable?: boolean } | null>(null);
  const [portfolioError, setPortfolioError] = useState(false);
  const [marketData, setMarketData] = useState<any[]>([]);
  const [marketLastUpdated, setMarketLastUpdated] = useState<string>('');
  const [marketError, setMarketError] = useState<string | null>(null);
  const [selectedMarketToken, setSelectedMarketToken] = useState<any | null>(null);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [resources, setResources] = useState<{ 
    bandwidth: { limit: number; remaining: number }; 
    energy: { limit: number; remaining: number };
    freeBandwidthLimit?: number;
    freeBandwidthUsed?: number;
    bandwidthRemaining?: number;
    energyLimit?: number;
    energyUsed?: number;
    energyRemaining?: number;
  }>({
    bandwidth: { limit: 0, remaining: 0 },
    energy: { limit: 0, remaining: 0 }
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
  const [txStatus, setTxStatus] = useState<'pending' | 'confirmed' | 'failed'>('pending');
  const [txStatusError, setTxStatusError] = useState<string | null>(null);

  // Advanced Estimations & QR scanner State
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimatedFee, setEstimatedFee] = useState<number>(0);
  const [estBandwidthNeeded, setEstBandwidthNeeded] = useState<number>(0);
  const [estEnergyNeeded, setEstEnergyNeeded] = useState<number>(0);
  const [insufficientTrxFee, setInsufficientTrxFee] = useState(false);
  const [insufficientEnergy, setInsufficientEnergy] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  // Usability state variables
  const [contacts, setContacts] = useState<{ name: string; address: string; isFavorite: boolean }[]>(() => {
    const saved = localStorage.getItem('tron_wallet_contacts');
    return saved ? JSON.parse(saved) : [
      { name: 'TRON Nest', address: 'TNe4eJFpiT8HuvCdhyQjKxwWXvU78QiPAh', isFavorite: true },
      { name: 'Official USDT Pool', address: 'TY7pZ9gSAtZ9bSAtZ9bSAtZ9bSAtZ9bSAt', isFavorite: false }
    ];
  });

  const [recentAddresses, setRecentAddresses] = useState<string[]>(() => {
    const saved = localStorage.getItem('tron_wallet_recents');
    return saved ? JSON.parse(saved) : [];
  });

  const [showAddressBook, setShowAddressBook] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactAddress, setNewContactAddress] = useState('');
  const [inlineSaveName, setInlineSaveName] = useState('');
  const [showInlineSave, setShowInlineSave] = useState(false);
  
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!showScanner) {
      setCameraActive(false);
      setCameraError(null);
      return;
    }

    let stream: MediaStream | null = null;
    let animationFrameId: number;

    const startCamera = async () => {
      try {
        setCameraError(null);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play().catch(() => {});
          setCameraActive(true);
          scanFrame();
        }
      } catch (err: any) {
        console.error('Camera access error:', err);
        setCameraError(err.message || 'Could not access camera. Please upload an image or select a quick option.');
      }
    };

    const scanFrame = () => {
      if (videoRef.current && canvasRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert'
          });
          if (code) {
            let scannedText = code.data.trim();
            if (scannedText.toLowerCase().startsWith('tron:')) {
              scannedText = scannedText.slice(5).split('?')[0];
            }
            if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(scannedText)) {
              setRecipient(scannedText);
              setShowScanner(false);
              if (navigator.vibrate) {
                navigator.vibrate(100);
              }
              return;
            }
          }
        }
      }
      animationFrameId = requestAnimationFrame(scanFrame);
    };

    const timer = setTimeout(() => {
      startCamera();
    }, 100);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(animationFrameId);
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [showScanner]);

  // Receive Modal State
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  // Security center and key export state
  const [showSecuritySettings, setShowSecuritySettings] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupType, setBackupType] = useState<'key' | 'seed' | null>(null);
  const [backupPasscode, setBackupPasscode] = useState('');
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupContent, setBackupContent] = useState<string | null>(null);

  // Change PIN state
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);

  // Biometric scanner trigger state
  const [showDashboardBiometricPrompt, setShowDashboardBiometricPrompt] = useState(false);
  const [biometricAction, setBiometricAction] = useState<'sign_tx' | 'toggle_biometrics' | null>(null);

  // Load profile and transactions with optional background sync to prevent layout/visual jumping
  // Load profile and transactions with optional background sync to prevent layout/visual jumping
  const syncData = async (isBackground = false, forceRefresh = false) => {
    console.log(`[Balance Sync - Client] Initiating synchronization. IsBackground: ${isBackground}, ForceRefresh: ${forceRefresh}`);
    console.log(`[Balance Sync - Client] UI Display Address: "${address}"`);
    try {
      if (!isBackground) {
        setPortfolioError(false);
      }

      const queryParam = forceRefresh ? '?refresh=true' : '';

      // 1. Portfolio
      try {
        const portfolioRes = await fetch(`/api/wallet/portfolio${queryParam}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!portfolioRes.ok) {
          console.error(`[Balance Sync - Client] Portfolio API HTTP error: ${portfolioRes.status}`);
          throw new Error('Portfolio API failed');
        }
        const portfolioData = await portfolioRes.json();
        if (portfolioData.success) {
          console.log(`[Balance Sync - Client] Portfolio fetch successful. Data:`, portfolioData.data);
          
          // Verify that the wallet address displayed in the UI is exactly the same address used for balance queries
          if (portfolioData.data?.address) {
            const apiAddress = portfolioData.data.address;
            if (apiAddress !== address) {
              console.error(`[Balance Sync - Client] CRITICAL ADDRESS MISMATCH! UI address is "${address}" but balance queries address is "${apiAddress}"`);
            } else {
              console.log(`[Balance Sync - Client] Verification SUCCESS: UI address "${address}" matches balance query address "${apiAddress}" exactly.`);
            }
          }

          setPortfolio(portfolioData.data);
          if (portfolioData.data?.isUnavailable && !isBackground) {
            console.warn('[Balance Sync - Client] Portfolio marked as unavailable by backend server.');
            setPortfolioError(true);
          }
        } else {
          console.error('[Balance Sync - Client] Portfolio API succeeded with success=false');
          if (!isBackground) {
            setPortfolioError(true);
          }
        }
      } catch (portErr) {
        console.error('[Balance Sync - Client] Failed to fetch portfolio:', portErr);
        if (!isBackground) {
          setPortfolioError(true);
        }
      }

      // 2. Transaction History
      try {
        const historyRes = await fetch(`/api/wallet/history${queryParam}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          if (historyData.success) {
            setHistory(historyData.data);
          }
        }
      } catch (histErr) {
        console.error('[Balance Sync - Client] Failed to fetch transaction history:', histErr);
      }

      // 3. Notifications
      try {
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
      } catch (notifErr) {
        console.error('[Balance Sync - Client] Failed to fetch notifications:', notifErr);
      }

      // 4. Resources (Bandwidth & Energy)
      try {
        const resRes = await fetch(`/api/wallet/resources${queryParam}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resRes.ok) {
          const resData = await resRes.json();
          if (resData.success) {
            setResources(resData.data);
          }
        }
      } catch (resErr) {
        console.error('[Balance Sync - Client] Failed to fetch wallet resources:', resErr);
      }

      // 5. Market Pricing & Statistics
      try {
        setMarketError(null);
        const marketRes = await fetch(`/api/wallet/market${queryParam}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (marketRes.ok) {
          const marketJson = await marketRes.json();
          if (marketJson.success) {
            setMarketData(marketJson.data);
            setMarketLastUpdated(marketJson.lastUpdated || new Date().toISOString());
          } else {
            setMarketError(marketJson.message || 'Failed to aggregate live pricing');
          }
        } else {
          setMarketError('Pricing feed currently offline');
        }
      } catch (marketErr) {
        console.error('[Balance Sync - Client] Failed to fetch market data:', marketErr);
        setMarketError('Could not contact pricing node');
      }

    } catch (e) {
      console.error('Failed in major synchronization block:', e);
    } finally {
      if (!isBackground) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const triggerFastPolling = () => {
    let count = 0;
    const interval = setInterval(() => {
      count++;
      if (count > 8) {
        clearInterval(interval);
      } else {
        syncData(true);
      }
    }, 2000);
  };

  // Strict 4-address identity verification logger on dashboard load
  useEffect(() => {
    if (!token || !address) {
      return;
    }

    const controller = new AbortController();
    const signal = controller.signal;

    const runVerificationLogs = async () => {
      try {
        // 1. Registered Wallet (from DB)
        const detailsRes = await fetch('/api/wallet/details', {
          headers: { 'Authorization': `Bearer ${token}` },
          signal
        });
        let registeredWallet = 'Unknown';
        if (detailsRes.ok) {
          const detailsData = await detailsRes.json();
          if (detailsData.success) {
            registeredWallet = detailsData.data.address;
          }
        }

        // 2. Displayed Wallet (from frontend state)
        const displayedWallet = address || 'Unknown';

        // 3. Balance Query Wallet (from live portfolio API response)
        const portfolioRes = await fetch('/api/wallet/portfolio', {
          headers: { 'Authorization': `Bearer ${token}` },
          signal
        });
        let balanceQueryWallet = 'Unknown';
        if (portfolioRes.ok) {
          const portfolioData = await portfolioRes.json();
          if (portfolioData.success) {
            balanceQueryWallet = portfolioData.data.address;
          }
        }

        // 4. History Query Wallet (from live history API response)
        const historyRes = await fetch('/api/wallet/history', {
          headers: { 'Authorization': `Bearer ${token}` },
          signal
        });
        let historyQueryWallet = 'Unknown';
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          if (historyData.success) {
            historyQueryWallet = historyData.address || 'Unknown';
          }
        }

        // EXACT PRINT LOG OUTS IN REQUIRED FORMAT
        console.log(`Registered wallet: ${registeredWallet}`);
        console.log(`Displayed wallet: ${displayedWallet}`);
        console.log(`Balance query wallet: ${balanceQueryWallet}`);
        console.log(`History query wallet: ${historyQueryWallet}`);

        // If any mismatch exists, fix it!
        if (registeredWallet !== 'Unknown') {
          if (registeredWallet !== displayedWallet) {
            console.warn(`[Balance Sync - Client] Address mismatch detected! Displayed wallet: "${displayedWallet}" does not match registered wallet: "${registeredWallet}". Fixing now...`);
            localStorage.setItem('wallet_address', registeredWallet);
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return;
        }
        console.error('[Balance Sync - Client] Failed to perform 4-address identity check:', err);
      }
    };

    runVerificationLogs();

    return () => {
      controller.abort();
    };
  }, [token, address]);

  useEffect(() => {
    // Initial fetch on mount
    syncData(false);

    // Sync on app resume and window focus to guarantee live state
    const handleResume = () => {
      if (document.visibilityState === 'visible') {
        syncData(true);
      }
    };

    const handleFocus = () => {
      syncData(true);
    };

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleFocus);

    // Continuous block confirmation monitoring every 10 seconds (matches blocks average production time)
    const intervalId = setInterval(() => {
      syncData(true);
    }, 10000);

    return () => {
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleFocus);
      clearInterval(intervalId);
    };
  }, [token]);

  useEffect(() => {
    if (transferStep !== 'success' || !txDetails?.txHash || selectedToken?.isInternal) {
      return;
    }

    setTxStatus('pending');
    setTxStatusError(null);

    let attempts = 0;
    const maxAttempts = 30; // 30 attempts, 3s interval = 90s total
    let timerId: any = null;

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/wallet/tx-status?txId=${txDetails.txHash}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          if (data.status === 'confirmed') {
            setTxStatus('confirmed');
            clearInterval(timerId);
            // Automatically refresh balance and history after success!
            syncData(true); 
          } else if (data.status === 'failed') {
            setTxStatus('failed');
            setTxStatusError(data.error || 'Transaction failed on-chain');
            clearInterval(timerId);
            syncData(true);
          }
        }
      } catch (err) {
        console.warn('Error fetching tx status:', err);
      }

      attempts++;
      if (attempts >= maxAttempts) {
        clearInterval(timerId);
      }
    };

    // Run first check immediately
    checkStatus();

    timerId = setInterval(checkStatus, 3000);

    return () => {
      if (timerId) {
        clearInterval(timerId);
      }
    };
  }, [transferStep, txDetails?.txHash, token, selectedToken]);

  const handleRefresh = () => {
    setRefreshing(true);
    syncData(false, true);
  };

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    const secondsStr = localStorage.getItem(`nest_security_clipclear_${address}`);
    const seconds = secondsStr ? parseInt(secondsStr) : 30;
    if (seconds > 0) {
      setTimeout(() => {
        navigator.clipboard.writeText('');
        console.log('[Security Center] Clipboard auto-cleared after security period.');
      }, seconds * 1000);
    }
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

  // Live address validator
  const validateAddress = (addr: string) => {
    const clean = addr.trim();
    if (!clean) return { isValid: false, error: 'Empty address' };
    if (!clean.startsWith('T')) return { isValid: false, error: 'Must start with capital T' };
    if (clean.length !== 34) return { isValid: false, error: `Must be exactly 34 characters (current: ${clean.length})` };
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(clean)) {
      return { isValid: false, error: 'Contains invalid Base58 characters (no 0, O, I, or l)' };
    }
    return { isValid: true };
  };

  const handleAddContact = (name: string, address: string) => {
    const validation = validateAddress(address);
    if (!validation.isValid) {
      alert('Invalid TRON Address: ' + validation.error);
      return false;
    }
    if (!name.trim()) {
      alert('Contact name cannot be empty');
      return false;
    }
    // Check if duplicate address
    if (contacts.some(c => c.address === address.trim())) {
      alert('A contact with this address already exists.');
      return false;
    }
    const newContact = { name: name.trim(), address: address.trim(), isFavorite: false };
    const updated = [...contacts, newContact];
    setContacts(updated);
    localStorage.setItem('tron_wallet_contacts', JSON.stringify(updated));
    return true;
  };

  const handleToggleFavorite = (addressToToggle: string) => {
    const updated = contacts.map(c => {
      if (c.address === addressToToggle) {
         return { ...c, isFavorite: !c.isFavorite };
      }
      return c;
    });
    setContacts(updated);
    localStorage.setItem('tron_wallet_contacts', JSON.stringify(updated));
  };

  const handleDeleteContact = (addressToDelete: string) => {
    if (confirm('Are you sure you want to delete this contact?')) {
      const updated = contacts.filter(c => c.address !== addressToDelete);
      setContacts(updated);
      localStorage.setItem('tron_wallet_contacts', JSON.stringify(updated));
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
          syncData(false);
          triggerFastPolling();
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
    if (transferLoading) return;
    setTransferLoading(true);
    setTransferError(null);

    // Validate balance and fee again before signing
    const numAmount = parseFloat(amount);
    if (numAmount > selectedToken.balance) {
      setTransferError('Insufficient balance for this transfer.');
      setTransferStep('details');
      setTransferLoading(false);
      return;
    }
    
    const trxToken = portfolio?.assets.find(a => a.symbol === 'TRX');
    const trxBalance = trxToken ? trxToken.balance : 0;
    let requiredTrx = estimatedFee;
    if (selectedToken.symbol === 'TRX') {
      requiredTrx += numAmount;
    }
    if (trxBalance < requiredTrx) {
      setTransferError(`Insufficient TRX balance to cover both transfer and estimated network fee of ${estimatedFee} TRX.`);
      setTransferStep('details');
      setTransferLoading(false);
      return;
    }

    try {
      // 1. Get the private key securely using client-side decryption
      let privateKey = '';
      try {
        const credentials = await secureRetrievePrivateData(address, passcode);
        privateKey = credentials.privateKey;
      } catch (err) {
        // If decryption fails, fall back to backend retrieval
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
        if (privateKey) {
          // Encrypt and save securely for future client-side decryption
          const seedPhrase = keyData.seedPhrase || 'imported_ledger_seed';
          await secureStorePrivateData(address, privateKey, seedPhrase, passcode);
        }
      }

      if (!privateKey) {
        setTransferError('Decryption failed. Private key not stored locally. Please re-import wallet.');
        setTransferStep('details');
        setTransferLoading(false);
        return;
      }

      // 2. Build and sign transaction client-side
      const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' });
      let signedTx: any = null;

      try {
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
          syncData(false);
          triggerFastPolling();

          // Save recipient to recent addresses
          const savedAddr = recipient.trim();
          setRecentAddresses(prev => {
            const filtered = prev.filter(a => a !== savedAddr);
            const updated = [savedAddr, ...filtered].slice(0, 5);
            localStorage.setItem('tron_wallet_recents', JSON.stringify(updated));
            return updated;
          });
        } else {
          throw new Error(data.message || 'Transaction broadcast failed');
        }
      } catch (localSignError: any) {
        console.warn('Local signing or broadcast failed, falling back to secure server-side execution:', localSignError);
        
        // Fallback to secure server-side execution (immune to CORS/429 blocks)
        const endpoint = selectedToken.symbol === 'TRX' ? '/api/wallet/send-trx' : '/api/wallet/send-usdt';
        const fallbackRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            recipientAddress: recipient.trim(),
            amount: parseFloat(amount),
            passcode
          })
        });
        
        const fallbackData = await fallbackRes.json();
        if (fallbackRes.ok && fallbackData.success) {
          setTxDetails(fallbackData.data);
          setTransferStep('success');
          syncData(false);
          triggerFastPolling();

          // Save recipient to recent addresses
          const savedAddr = recipient.trim();
          setRecentAddresses(prev => {
            const filtered = prev.filter(a => a !== savedAddr);
            const updated = [savedAddr, ...filtered].slice(0, 5);
            localStorage.setItem('tron_wallet_recents', JSON.stringify(updated));
            return updated;
          });
        } else {
          throw new Error(fallbackData.message || localSignError.message || 'Transaction failed');
        }
      }
    } catch (e: any) {
      setTransferError(e.message || 'Signing failed. Insufficient resources.');
      setTransferStep('failure');
    } finally {
      setTransferLoading(false);
    }
  };

  const [onBiometricsEnrolledSuccess, setOnBiometricsEnrolledSuccess] = useState<(() => void) | null>(null);

  const handleDashboardBiometricSuccess = async () => {
    setShowDashboardBiometricPrompt(false);
    if (biometricAction === 'sign_tx') {
      try {
        const decryptedPin = await decryptPinForBiometrics(address);
        handleTransferPasscodeSubmit(decryptedPin);
      } catch (err: any) {
        setTransferError('Biometric verification succeeded, but PIN retrieval failed. Use manual PIN.');
      }
    } else if (biometricAction === 'toggle_biometrics') {
      if (onBiometricsEnrolledSuccess) {
        onBiometricsEnrolledSuccess();
      }
    }
  };

  return (
    <div className="h-full bg-black text-white flex flex-col justify-between overflow-hidden relative">
      {/* Top Profile Header */}
      <div className="px-6 pt-5 pb-4 bg-gradient-to-b from-neutral-950 to-transparent flex items-center justify-between border-b border-neutral-900/40">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowWalletManager(true)}
            className="w-10 h-10 rounded-full bg-red-950/20 border border-red-500/20 flex items-center justify-center font-display font-semibold text-red-500 text-sm red-glow hover:bg-red-950/45 hover:border-red-500/40 transition-all cursor-pointer active:scale-95"
            title="Multi-Wallet Hub"
          >
            TN
          </button>
          <div className="flex flex-col">
            <button 
              onClick={() => setShowWalletManager(true)}
              className="text-[10px] text-neutral-500 hover:text-red-400 font-mono tracking-wider font-semibold uppercase flex items-center gap-1 transition-all"
            >
              Multi-Wallet Hub
              <ChevronRight className="w-3 h-3 text-red-500 animate-pulse" />
            </button>
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
          {/* Security Shield Trigger */}
          <button 
            onClick={() => setShowSecuritySettings(true)}
            className="w-9 h-9 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-red-500 hover:text-red-400 hover:border-red-500/30 active:scale-95 transition-all shadow-[0_0_10px_rgba(239,68,68,0.1)]"
            title="Security Center"
          >
            <Shield className="w-4 h-4 text-red-500" />
          </button>

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
                    {(portfolioError || portfolio?.isUnavailable) ? 'Unavailable' : `${(resources.bandwidthRemaining ?? resources.bandwidth.remaining).toLocaleString()} / ${(resources.freeBandwidthLimit ?? resources.bandwidth.limit).toLocaleString()}`}
                  </span>
                </div>
                <div className="w-full bg-neutral-900 h-1.5 rounded-full mt-1.5 overflow-hidden">
                  <div 
                    className="bg-red-500 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${(portfolioError || portfolio?.isUnavailable || (resources.freeBandwidthLimit ?? resources.bandwidth.limit) === 0) ? 0 : ((resources.bandwidthRemaining ?? resources.bandwidth.remaining) / (resources.freeBandwidthLimit ?? resources.bandwidth.limit)) * 100}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[9px] font-mono text-neutral-500 uppercase">
                  <span>Used: {(resources.freeBandwidthUsed ?? 0).toLocaleString()}</span>
                  <span>Limit: {(resources.freeBandwidthLimit ?? resources.bandwidth.limit).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex flex-col border-l border-neutral-900 pl-3">
                <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500 uppercase">
                  <span>Energy</span>
                  <span className="text-red-400">
                    {(portfolioError || portfolio?.isUnavailable) ? 'Unavailable' : `${(resources.energyRemaining ?? resources.energy.remaining).toLocaleString()} / ${(resources.energyLimit ?? resources.energy.limit).toLocaleString()}`}
                  </span>
                </div>
                <div className="w-full bg-neutral-900 h-1.5 rounded-full mt-1.5 overflow-hidden">
                  <div 
                    className="bg-neutral-800 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${(portfolioError || portfolio?.isUnavailable || (resources.energyLimit ?? resources.energy.limit) === 0) ? 0 : ((resources.energyRemaining ?? resources.energy.remaining) / (resources.energyLimit ?? resources.energy.limit)) * 100}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[9px] font-mono text-neutral-500 uppercase">
                  <span>Used: {(resources.energyUsed ?? 0).toLocaleString()}</span>
                  <span>Limit: {(resources.energyLimit ?? resources.energy.limit).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Portfolio Allocation Chart */}
            {portfolio && portfolio.totalPortfolioUsd > 0 && !portfolioError && !portfolio.isUnavailable && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs text-neutral-500 font-mono tracking-wide uppercase font-semibold">Portfolio Allocation</h3>
                </div>
                <div className="p-4 bg-neutral-950 border border-neutral-900 rounded-xl flex flex-col sm:flex-row items-center gap-5">
                  <div className="w-24 h-24 relative flex items-center justify-center shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={portfolio.assets.map(asset => ({
                            name: asset.symbol,
                            value: asset.valueUsd,
                            color: asset.symbol === 'TRX' ? '#dc2626' : asset.symbol === 'USDT' ? '#10b981' : asset.symbol === 'mUSD' ? '#3b82f6' : '#f59e0b'
                          })).filter(d => d.value > 0)}
                          cx="50%"
                          cy="50%"
                          innerRadius={30}
                          outerRadius={44}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {portfolio.assets.map((asset, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={asset.symbol === 'TRX' ? '#dc2626' : asset.symbol === 'USDT' ? '#10b981' : asset.symbol === 'mUSD' ? '#3b82f6' : '#f59e0b'} 
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute flex flex-col items-center">
                      <span className="text-[8px] text-neutral-500 font-mono uppercase font-semibold leading-none">Total</span>
                      <span className="text-[11px] font-mono font-bold text-white mt-0.5">${portfolio.totalPortfolioUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                  
                  <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2.5 w-full">
                    {portfolio.assets.map((asset) => {
                      const pct = portfolio.totalPortfolioUsd > 0 ? (asset.valueUsd / portfolio.totalPortfolioUsd) * 100 : 0;
                      const color = asset.symbol === 'TRX' ? '#dc2626' : asset.symbol === 'USDT' ? '#10b981' : asset.symbol === 'mUSD' ? '#3b82f6' : '#f59e0b';
                      return (
                        <div key={asset.id} className="flex flex-col gap-0.5 border-l border-neutral-900 pl-2">
                          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-neutral-400">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: color }} />
                            <span>{asset.symbol}</span>
                          </div>
                          <div className="text-xs font-mono font-bold text-white pl-3">
                            {pct.toFixed(1)}% <span className="text-[10px] text-neutral-500 font-normal">(${asset.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })})</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Assets List */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs text-neutral-500 font-mono tracking-wide uppercase font-semibold">My Assets</h3>
                {marketLastUpdated && (
                  <span className="text-[9px] font-mono text-neutral-600 uppercase">
                    Refreshed: {new Date(marketLastUpdated).toLocaleTimeString()}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2.5">
                {portfolio?.assets.map((asset) => {
                  const marketToken = marketData.find(m => m.symbol === asset.symbol);
                  const isChangePositive = marketToken ? marketToken.change24h >= 0 : true;
                  const priceToDisplay = marketToken ? marketToken.priceUsd : asset.priceUsd;
                  return (
                    <div 
                      key={asset.id} 
                      onClick={() => {
                        if (portfolioError || portfolio?.isUnavailable) return;
                        if (marketToken) {
                          setSelectedMarketToken({ ...marketToken, balance: asset.balance, valueUsd: asset.valueUsd });
                        } else {
                          setSelectedMarketToken({
                            id: asset.id,
                            name: asset.name,
                            symbol: asset.symbol,
                            logoUrl: asset.logoUrl,
                            priceUsd: asset.priceUsd,
                            balance: asset.balance,
                            valueUsd: asset.valueUsd,
                            change24h: 0.0,
                            marketCap: asset.priceUsd * 10000000,
                            volume24h: 250000,
                            circulatingSupply: 5000000,
                            totalSupply: 10000000,
                            ath: asset.priceUsd * 1.5,
                            atl: asset.priceUsd * 0.5,
                            sparkline: [asset.priceUsd, asset.priceUsd, asset.priceUsd, asset.priceUsd, asset.priceUsd],
                            history30d: new Array(30).fill(asset.priceUsd).map((p, i) => ({ date: `Day ${i + 1}`, price: p })),
                            isInternal: asset.isInternal
                          });
                        }
                      }}
                      className="p-3 bg-neutral-950 border border-neutral-900 hover:border-neutral-800 hover:bg-neutral-950/80 active:bg-neutral-900/40 rounded-xl flex items-center justify-between transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden flex items-center justify-center relative p-1.5 shrink-0">
                          <img 
                            src={asset.logoUrl} 
                            alt={asset.symbol} 
                            className="w-full h-full object-contain rounded-md"
                            referrerPolicy="no-referrer"
                          />
                          {asset.isInternal && (
                            <span className="absolute bottom-0 right-0 text-[6px] font-mono px-0.5 bg-yellow-600 text-yellow-100 rounded-tl uppercase border-t border-l border-neutral-800 font-bold scale-90">
                              Ledg
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs text-white font-semibold leading-none group-hover:text-red-400 transition-colors">{asset.name}</span>
                          <div className="flex items-center gap-1 mt-1 font-mono text-[10px]">
                            <span className="text-neutral-400">{asset.symbol}</span>
                            <span className="text-neutral-600">•</span>
                            <span className="text-neutral-300 font-semibold">
                              {(portfolioError || portfolio?.isUnavailable) ? 'Unavailable' : `$${priceToDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`}
                            </span>
                            {marketToken && !portfolioError && !portfolio?.isUnavailable && (
                              <>
                                <span className="text-neutral-600">•</span>
                                <span className={`font-bold ${isChangePositive ? 'text-green-500' : 'text-red-500'}`}>
                                  {isChangePositive ? '+' : ''}{marketToken.change24h.toFixed(2)}%
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Mini 7-day sparkline */}
                      {marketToken && marketToken.sparkline && !portfolioError && !portfolio?.isUnavailable && (
                        <div className="w-14 h-6 hidden xs:block shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={marketToken.sparkline.map((val: number, idx: number) => ({ id: idx, val }))}>
                              <defs>
                                <linearGradient id={`grad-${asset.symbol}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor={isChangePositive ? "#10b981" : "#ef4444"} stopOpacity={0.25}/>
                                  <stop offset="95%" stopColor={isChangePositive ? "#10b981" : "#ef4444"} stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <Area 
                                type="monotone" 
                                dataKey="val" 
                                stroke={isChangePositive ? "#10b981" : "#ef4444"} 
                                strokeWidth={1.5} 
                                fillOpacity={1} 
                                fill={`url(#grad-${asset.symbol})`} 
                                dot={false} 
                                isAnimationActive={false} 
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      <div className="flex flex-col items-end shrink-0">
                        <span className="text-xs font-mono font-bold text-white">
                          {hideBalances ? '••••••' : (portfolioError || portfolio?.isUnavailable) ? 'Unavailable' : asset.balance.toLocaleString(undefined, { maximumFractionDigits: asset.decimals })}
                        </span>
                        <span className="text-[10px] font-mono text-neutral-500 mt-0.5">
                          {hideBalances ? '••••••' : (portfolioError || portfolio?.isUnavailable) ? 'Unavailable' : `$${asset.valueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
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

      {/* -------------------- UPGRADED NOTIFICATION CENTER MODULE -------------------- */}
      <NotificationCenter
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        token={token}
        notifications={notifications}
        setNotifications={setNotifications}
        refreshData={async () => { await syncData(false, true); }}
        refreshing={refreshing}
      />

      {/* Slide-Up Address Book Modal */}
      <AnimatePresence>
        {showAddressBook && (
          <motion.div 
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            className="absolute inset-0 z-50 bg-black flex flex-col justify-between p-6"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-900/60 pb-4">
              <h2 className="text-sm font-display font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                <BookOpen className="w-4 h-4 text-red-500" />
                Address Book
              </h2>
              <button 
                onClick={() => setShowAddressBook(false)}
                className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto my-4 flex flex-col gap-4">
              
              {/* Add New Contact Form */}
              <div className="p-3.5 bg-neutral-950 border border-neutral-900 rounded-xl flex flex-col gap-3">
                <span className="text-[10px] text-neutral-500 font-mono uppercase font-bold tracking-wider">Add New Contact</span>
                
                <div className="flex flex-col gap-1.5">
                  <input
                    type="text"
                    placeholder="Contact Name (e.g. Alice)"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    className="w-full p-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-red-500/40"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <input
                    type="text"
                    placeholder="Base58 TRON Address (e.g. TXYZ...)"
                    value={newContactAddress}
                    onChange={(e) => setNewContactAddress(e.target.value)}
                    className="w-full p-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-red-500/40"
                  />
                  {newContactAddress.trim() && (
                    <div className="text-[9px] font-mono">
                      {validateAddress(newContactAddress).isValid ? (
                        <span className="text-green-500">✓ Address format valid</span>
                      ) : (
                        <span className="text-red-400">✗ {validateAddress(newContactAddress).error}</span>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!newContactName.trim()) {
                      alert('Please enter a name.');
                      return;
                    }
                    const val = validateAddress(newContactAddress);
                    if (!val.isValid) {
                      alert('Invalid address: ' + val.error);
                      return;
                    }
                    handleAddContact(newContactName, newContactAddress);
                    setNewContactName('');
                    setNewContactAddress('');
                  }}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-display text-xs font-semibold rounded-lg transition-all"
                >
                  Save Contact
                </button>
              </div>

              {/* Contacts List */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] text-neutral-500 font-mono uppercase font-bold tracking-wider">Saved Contacts ({contacts.length})</span>
                
                {contacts.length === 0 ? (
                  <div className="text-center p-6 text-xs text-neutral-600 font-mono">
                    No contacts saved yet.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {contacts.map((c) => (
                      <div 
                        key={c.address}
                        className="p-3 bg-neutral-950 border border-neutral-900 rounded-xl flex items-center justify-between gap-3 hover:border-neutral-800 transition-all"
                      >
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => {
                          setRecipient(c.address);
                          setShowAddressBook(false);
                        }}>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white truncate">{c.name}</span>
                            {c.isFavorite && (
                              <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 shrink-0" />
                            )}
                          </div>
                          <span className="text-[10px] text-neutral-400 font-mono block truncate mt-0.5">{c.address}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* Star favorite toggle */}
                          <button
                            type="button"
                            onClick={() => handleToggleFavorite(c.address)}
                            className="p-1.5 bg-neutral-900 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-all"
                          >
                            <Star className={`w-3.5 h-3.5 ${c.isFavorite ? 'text-yellow-500 fill-yellow-500' : ''}`} />
                          </button>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteContact(c.address)}
                            className="p-1.5 bg-neutral-900 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-red-400 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="text-center text-[9px] text-neutral-600 font-mono uppercase tracking-wider">
              Secure Address Book Storage
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

      {/* Detailed Token Information Page Overlay */}
      <AnimatePresence>
        {selectedMarketToken && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 180 }}
            className="absolute inset-0 z-40 bg-black flex flex-col overflow-y-auto"
          >
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-b from-neutral-950 to-transparent flex items-center justify-between border-b border-neutral-900/60 shrink-0">
              <button
                onClick={() => setSelectedMarketToken(null)}
                className="flex items-center gap-1.5 text-xs font-mono text-neutral-400 hover:text-white transition-colors"
              >
                <ArrowDownLeft className="w-4 h-4 rotate-45" />
                <span>Back</span>
              </button>
              <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-400">
                Token Intelligence
              </h2>
              <div className="w-12 h-4" /> {/* spacer */}
            </div>

            {/* Content Container */}
            <div className="p-6 flex flex-col gap-6 flex-1 pb-12">
              {/* Token Main Hero Card */}
              <div className="flex items-center justify-between p-4 bg-neutral-950 border border-neutral-900 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl border border-neutral-800 bg-neutral-900 flex items-center justify-center p-2 relative">
                    <img 
                      src={selectedMarketToken.logoUrl} 
                      alt={selectedMarketToken.name} 
                      className="w-full h-full object-contain rounded-md"
                      referrerPolicy="no-referrer"
                    />
                    {selectedMarketToken.isInternal && (
                      <span className="absolute bottom-0 right-0 text-[6px] font-mono px-0.5 bg-yellow-600 text-yellow-100 rounded-tl uppercase border-t border-l border-neutral-800 font-bold scale-95">
                        Ledg
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm text-neutral-400 font-mono uppercase">{selectedMarketToken.symbol}</span>
                    <h1 className="text-lg font-bold text-white tracking-tight leading-snug mt-0.5">{selectedMarketToken.name}</h1>
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <div className="text-xl font-mono font-bold text-white">
                    ${selectedMarketToken.priceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${selectedMarketToken.change24h >= 0 ? 'bg-green-950/20 text-green-400 border border-green-500/15' : 'bg-red-950/20 text-red-400 border border-red-500/15'}`}>
                      {selectedMarketToken.change24h >= 0 ? '▲ +' : '▼ '}{selectedMarketToken.change24h.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* 30-Day Full Historical Price Chart */}
              <div className="p-4 bg-neutral-950 border border-neutral-900 rounded-xl flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-400 font-mono uppercase">30-Day Historical Trend</span>
                  <span className="text-[10px] text-neutral-500 font-mono uppercase">Interval: Daily</span>
                </div>
                
                <div className="h-44 w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={selectedMarketToken.history30d || []}>
                      <defs>
                        <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={selectedMarketToken.change24h >= 0 ? "#10b981" : "#ef4444"} stopOpacity={0.25}/>
                          <stop offset="95%" stopColor={selectedMarketToken.change24h >= 0 ? "#10b981" : "#ef4444"} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis 
                        dataKey="date" 
                        stroke="#525252" 
                        fontSize={8} 
                        tickLine={false} 
                        axisLine={false}
                        dy={8}
                      />
                      <YAxis 
                        stroke="#525252" 
                        fontSize={8} 
                        tickLine={false} 
                        axisLine={false} 
                        domain={['auto', 'auto']}
                        tickFormatter={(v) => `$${v >= 1 ? v.toFixed(1) : v.toFixed(3)}`}
                        dx={-8}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #1f1f1f', borderRadius: '8px' }}
                        labelStyle={{ color: '#737373', fontFamily: 'monospace', fontSize: '10px' }}
                        itemStyle={{ color: '#ffffff', fontFamily: 'monospace', fontSize: '11px', fontWeight: 'bold' }}
                        formatter={(value: any) => [`$${parseFloat(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`, 'Price']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="price" 
                        stroke={selectedMarketToken.change24h >= 0 ? "#10b981" : "#ef4444"} 
                        strokeWidth={2} 
                        fillOpacity={1} 
                        fill="url(#colorPrice)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Individual Asset Performance & Holdings */}
              <div className="p-4 bg-neutral-950 border border-neutral-900 rounded-xl flex flex-col gap-3.5">
                <h3 className="text-xs text-neutral-400 font-mono uppercase">My Asset Performance</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1 border-l border-neutral-900 pl-3">
                    <span className="text-[10px] text-neutral-500 font-mono uppercase">Token Balance</span>
                    <span className="text-base font-mono font-bold text-white">
                      {hideBalances ? '••••••' : `${selectedMarketToken.balance.toLocaleString()} ${selectedMarketToken.symbol}`}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 border-l border-neutral-900 pl-3">
                    <span className="text-[10px] text-neutral-500 font-mono uppercase">Holding Value</span>
                    <span className="text-base font-mono font-bold text-white">
                      {hideBalances ? '••••••' : `$${selectedMarketToken.valueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 border-l border-neutral-900 pl-3">
                    <span className="text-[10px] text-neutral-500 font-mono uppercase">Portfolio Allocation</span>
                    <span className="text-base font-mono font-bold text-white">
                      {portfolio && portfolio.totalPortfolioUsd > 0 
                        ? `${((selectedMarketToken.valueUsd / portfolio.totalPortfolioUsd) * 100).toFixed(1)}%` 
                        : '0.0%'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 border-l border-neutral-900 pl-3">
                    <span className="text-[10px] text-neutral-500 font-mono uppercase">24h Holdings Gain/Loss</span>
                    <span className={`text-base font-mono font-bold ${selectedMarketToken.change24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {hideBalances ? '••••••' : (
                        <>
                          {selectedMarketToken.change24h >= 0 ? '+$' : '-$'}
                          {Math.abs(selectedMarketToken.valueUsd * (selectedMarketToken.change24h / 100)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Detailed Market Statistics */}
              <div className="p-4 bg-neutral-950 border border-neutral-900 rounded-xl flex flex-col gap-3.5">
                <h3 className="text-xs text-neutral-400 font-mono uppercase">Market Statistics</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                  <div className="flex flex-col gap-0.5 border-l border-neutral-900 pl-3">
                    <span className="text-[10px] text-neutral-500 font-mono uppercase">Market Capitalization</span>
                    <span className="text-xs font-mono font-bold text-white">
                      ${selectedMarketToken.marketCap.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 border-l border-neutral-900 pl-3">
                    <span className="text-[10px] text-neutral-500 font-mono uppercase">24h Trading Volume</span>
                    <span className="text-xs font-mono font-bold text-white">
                      ${selectedMarketToken.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 border-l border-neutral-900 pl-3">
                    <span className="text-[10px] text-neutral-500 font-mono uppercase">Circulating Supply</span>
                    <span className="text-xs font-mono font-bold text-white">
                      {selectedMarketToken.circulatingSupply.toLocaleString(undefined, { maximumFractionDigits: 0 })} {selectedMarketToken.symbol}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 border-l border-neutral-900 pl-3">
                    <span className="text-[10px] text-neutral-500 font-mono uppercase">Total Supply</span>
                    <span className="text-xs font-mono font-bold text-white">
                      {selectedMarketToken.totalSupply.toLocaleString(undefined, { maximumFractionDigits: 0 })} {selectedMarketToken.symbol}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 border-l border-neutral-900 pl-3">
                    <span className="text-[10px] text-neutral-500 font-mono uppercase">All-Time High (ATH)</span>
                    <span className="text-xs font-mono font-bold text-white text-green-400">
                      ${selectedMarketToken.ath.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 border-l border-neutral-900 pl-3">
                    <span className="text-[10px] text-neutral-500 font-mono uppercase">All-Time Low (ATL)</span>
                    <span className="text-xs font-mono font-bold text-white text-red-400">
                      ${selectedMarketToken.atl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-4 mt-2 shrink-0">
                <button
                  onClick={() => {
                    const matchingAsset = portfolio?.assets.find(a => a.symbol === selectedMarketToken.symbol);
                    if (matchingAsset) {
                      openSend(matchingAsset);
                    }
                    setSelectedMarketToken(null);
                  }}
                  className="py-4 bg-red-600 hover:bg-red-500 hover:shadow-[0_0_15px_rgba(220,38,38,0.4)] active:scale-95 text-white rounded-xl text-xs font-semibold uppercase tracking-wider font-mono transition-all flex items-center justify-center gap-2"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>Transfer Asset</span>
                </button>
                <button
                  onClick={() => {
                    const matchingAsset = portfolio?.assets.find(a => a.symbol === selectedMarketToken.symbol);
                    setSelectedToken(matchingAsset || null);
                    setShowReceiveModal(true);
                    setSelectedMarketToken(null);
                  }}
                  className="py-4 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 active:scale-95 text-neutral-200 rounded-xl text-xs font-semibold uppercase tracking-wider font-mono transition-all flex items-center justify-center gap-2"
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  <span>Receive Address</span>
                </button>
              </div>
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
            {/* Live QR Scanner View Overlay */}
            {showScanner && (
              <div className="absolute inset-0 z-50 bg-black flex flex-col justify-between p-6">
                <div className="flex items-center justify-between border-b border-neutral-900/60 pb-3">
                  <h3 className="text-xs font-mono font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                    <Sliders className="w-4 h-4 text-red-500" />
                    Live TRON QR Scanner
                  </h3>
                  <button 
                    onClick={() => setShowScanner(false)}
                    className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center my-6 relative overflow-hidden bg-neutral-950 border border-neutral-900 rounded-2xl p-4">
                  
                  {/* Camera Video Viewport */}
                  <div className="relative w-56 h-56 border border-neutral-800 rounded-xl flex items-center justify-center overflow-hidden bg-black">
                    <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-red-500 z-10"></div>
                    <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-red-500 z-10"></div>
                    <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-red-500 z-10"></div>
                    <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-red-500 z-10"></div>
                    
                    {cameraActive ? (
                      <>
                        <video 
                          ref={videoRef}
                          className="w-full h-full object-cover"
                          playsInline
                          muted
                        />
                        {/* Scanning Laser Line */}
                        <div className="absolute left-0 right-0 h-0.5 bg-red-500 opacity-80 red-laser shadow-[0_0_10px_#ef4444] z-10"></div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-center p-4">
                        <Coins className="w-8 h-8 text-neutral-850 animate-bounce mb-2" />
                        <span className="text-[10px] text-neutral-500 font-mono">Camera initializing...</span>
                      </div>
                    )}
                    
                    {/* Hidden canvas used to analyze the video frames */}
                    <canvas ref={canvasRef} className="hidden" />
                  </div>

                  {cameraError && (
                    <p className="text-[10px] text-red-400/90 font-mono mt-3 text-center px-4">
                      {cameraError}
                    </p>
                  )}

                  <p className="text-[10px] text-neutral-400 font-mono mt-3 text-center leading-relaxed">
                    Point camera at standard TRON QR code.<br/>
                    <span className="text-neutral-500 text-[9px]">Or select an alternative method below:</span>
                  </p>

                  {/* File Upload Scanner Fallback */}
                  <div className="mt-4 w-full max-w-xs">
                    <label className="block w-full py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-[10px] text-center text-neutral-300 font-mono rounded-xl cursor-pointer transition-all">
                      📁 Upload & Scan QR Image
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const img = new Image();
                            img.onload = () => {
                              const canvas = document.createElement('canvas');
                              canvas.width = img.width;
                              canvas.height = img.height;
                              const ctx = canvas.getContext('2d');
                              if (ctx) {
                                ctx.drawImage(img, 0, 0);
                                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                                const code = jsQR(imgData.data, imgData.width, imgData.height);
                                if (code) {
                                  let text = code.data.trim();
                                  if (text.toLowerCase().startsWith('tron:')) {
                                    text = text.slice(5).split('?')[0];
                                  }
                                  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(text)) {
                                    setRecipient(text);
                                    setShowScanner(false);
                                  } else {
                                    alert('Found QR code but it is not a valid TRON address: ' + text);
                                  }
                                } else {
                                  alert('Could not find a valid QR code in this image.');
                                }
                              }
                            };
                            img.src = event.target?.result as string;
                          };
                          reader.readAsDataURL(file);
                        }} 
                        className="hidden" 
                      />
                    </label>
                  </div>

                  {/* Simulation Shortcuts */}
                  <div className="mt-4 flex flex-col gap-1.5 w-full max-w-xs px-2">
                    <span className="text-[9px] text-neutral-600 font-mono uppercase tracking-wider block text-center">Quick Simulators:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setRecipient('TNe4eJFpiT8HuvCdhyQjKxwWXvU78QiPAh');
                        setShowScanner(false);
                      }}
                      className="py-1.5 bg-neutral-900/40 hover:bg-neutral-800 border border-neutral-900 text-[10px] text-white font-mono rounded-lg transition-all"
                    >
                      TNe4eJFpiT8HuvCdhyQjKxwWXvU78QiPAh (TRON Nest)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRecipient('TY7pZ9gSAtZ9bSAtZ9bSAtZ9bSAtZ9bSAt');
                        setShowScanner(false);
                      }}
                      className="py-1.5 bg-neutral-900/40 hover:bg-neutral-800 border border-neutral-900 text-[10px] text-white font-mono rounded-lg transition-all"
                    >
                      TY7pZ9gSAtZ9bSAt... (Official USDT Pool)
                    </button>
                  </div>
                </div>

                <div className="text-center text-[9px] text-neutral-600 font-mono uppercase tracking-wider">
                  Android Live QR Scanner v2.0
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
                            onClick={() => setShowAddressBook(true)}
                            className="text-[9px] font-mono text-neutral-400 hover:text-white font-bold uppercase tracking-wider bg-neutral-900 border border-neutral-805 px-1.5 py-0.5 rounded flex items-center gap-1"
                          >
                            <BookOpen className="w-2.5 h-2.5" />
                            Book
                          </button>
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

                      {/* Real-time Address Validation Feedback */}
                      {recipient.trim() && !selectedToken.isInternal && (
                        <div className="mt-1 text-[10px] font-mono">
                          {validateAddress(recipient).isValid ? (
                            <div className="text-green-400 flex items-center gap-1.5">
                              <Check className="w-3.5 h-3.5 text-green-500" />
                              Valid TRON address format
                              
                              {/* Inline Quick Save Button */}
                              {!contacts.some(c => c.address === recipient.trim()) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const name = prompt("Enter contact name to save this address:");
                                    if (name && name.trim()) {
                                      handleAddContact(name, recipient);
                                    }
                                  }}
                                  className="ml-auto text-[9px] text-red-500 hover:text-red-400 font-bold underline cursor-pointer"
                                >
                                  + Save to Book
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="text-red-400 flex items-center gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                              {validateAddress(recipient).error}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Quick Select Chips */}
                      {(contacts.some(c => c.isFavorite) || recentAddresses.length > 0) && (
                        <div className="flex flex-col gap-1 mt-1 p-2.5 bg-neutral-950/60 border border-neutral-900 rounded-xl">
                          {contacts.some(c => c.isFavorite) && (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-[9px] text-neutral-500 font-mono uppercase font-semibold">Favorites:</span>
                              {contacts.filter(c => c.isFavorite).map(c => (
                                <button
                                  key={c.address}
                                  type="button"
                                  onClick={() => setRecipient(c.address)}
                                  className="text-[10px] font-mono text-neutral-300 hover:text-white bg-neutral-900 hover:bg-neutral-850 px-2 py-0.5 rounded-lg border border-neutral-800 transition-all flex items-center gap-1 cursor-pointer"
                                  title={c.address}
                                >
                                  <Star className="w-2.5 h-2.5 text-yellow-500 fill-yellow-500" />
                                  {c.name}
                                </button>
                              ))}
                            </div>
                          )}
                          {recentAddresses.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap mt-1">
                              <span className="text-[9px] text-neutral-500 font-mono uppercase font-semibold">Recents:</span>
                              {recentAddresses.map(addr => {
                                const matchingContact = contacts.find(c => c.address === addr);
                                const label = matchingContact ? matchingContact.name : `${addr.slice(0, 4)}...${addr.slice(-4)}`;
                                return (
                                  <button
                                    key={addr}
                                    type="button"
                                    onClick={() => setRecipient(addr)}
                                    className="text-[10px] font-mono text-neutral-300 hover:text-white bg-neutral-900 hover:bg-neutral-850 px-2 py-0.5 rounded-lg border border-neutral-800 transition-all cursor-pointer"
                                    title={addr}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
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

                    {/* Compact Resources Display */}
                    {!selectedToken.isInternal && (
                      <div className="grid grid-cols-2 gap-2.5 p-3 bg-neutral-950 border border-neutral-900 rounded-xl font-mono text-[10px]">
                        <div>
                          <span className="text-neutral-500 uppercase tracking-wider block font-semibold mb-0.5">Available Bandwidth</span>
                          <span className="text-white font-bold">{(resources.bandwidthRemaining ?? resources.bandwidth.remaining).toLocaleString()} / {(resources.freeBandwidthLimit ?? resources.bandwidth.limit).toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500 uppercase tracking-wider block font-semibold mb-0.5">Available Energy</span>
                          <span className="text-white font-bold">{(resources.energyRemaining ?? resources.energy.remaining).toLocaleString()} / {(resources.energyLimit ?? resources.energy.limit).toLocaleString()}</span>
                        </div>
                      </div>
                    )}

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
                      disabled={!recipient.trim() || (!selectedToken.isInternal && !validateAddress(recipient).isValid)}
                      className={`w-full mt-4 py-4 text-white font-display text-xs font-semibold rounded-xl transition-all shadow-md active:scale-98 ${
                        (!recipient.trim() || (!selectedToken.isInternal && !validateAddress(recipient).isValid))
                          ? 'bg-neutral-900 text-neutral-500 cursor-not-allowed border border-neutral-800'
                          : 'bg-red-600 hover:bg-red-700'
                      }`}
                    >
                      {(!recipient.trim()) ? 'Enter Recipient' : (!selectedToken.isInternal && !validateAddress(recipient).isValid) ? 'Invalid TRON Address' : 'Continue'}
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
                      biometricEnabled={biometricsEnabled}
                      onBiometricUnlock={() => {
                        setBiometricAction('sign_tx');
                        setShowDashboardBiometricPrompt(true);
                      }}
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

                    {/* Live Blockchain Status Indicator */}
                    {!selectedToken?.isInternal && txDetails?.txHash && (
                      <div className="w-full mt-3 p-3 bg-neutral-950 border border-neutral-900 rounded-xl flex items-center justify-between font-mono text-xs">
                        <span className="text-neutral-500 uppercase text-[9px] tracking-wide">On-Chain Status</span>
                        {txStatus === 'pending' && (
                          <span className="text-yellow-500 font-bold flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            PENDING
                          </span>
                        )}
                        {txStatus === 'confirmed' && (
                          <span className="text-green-500 font-bold flex items-center gap-1 animate-pulse">
                            <Check className="w-3.5 h-3.5 text-green-500" />
                            CONFIRMED
                          </span>
                        )}
                        {txStatus === 'failed' && (
                          <span className="text-red-500 font-bold flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                            FAILED
                          </span>
                        )}
                      </div>
                    )}

                    {txStatus === 'failed' && txStatusError && (
                      <div className="w-full mt-3 p-3 bg-red-950/20 border border-red-500/20 rounded-xl text-[10px] text-red-400 font-mono text-left">
                        <strong className="block text-red-300 font-semibold mb-0.5">Execution Reverted</strong>
                        {txStatusError}
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

      {/* -------------------- SECURITY CENTER UPGRADED MODULE -------------------- */}
      <SecurityCenter
        isOpen={showSecuritySettings}
        onClose={() => setShowSecuritySettings(false)}
        token={token}
        address={address}
        onPinChangeTriggered={() => {
          setPinError(null);
          setPinSuccess(null);
          setOldPin('');
          setNewPin('');
          setShowChangePinModal(true);
        }}
        onBackupTriggered={() => {
          setBackupType('seed');
          setBackupPasscode('');
          setBackupError(null);
          setBackupContent(null);
          setShowBackupModal(true);
        }}
        isWalletBackupConfirmed={isWalletBackupConfirmed}
        hideBalances={hideBalances}
        setHideBalances={setHideBalances}
      />

      {/* -------------------- SECURE BACKUP EXPORT MODAL -------------------- */}
      <AnimatePresence>
        {showBackupModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm p-6 rounded-3xl bg-neutral-950 border border-neutral-900 flex flex-col shadow-2xl relative"
            >
              <button
                onClick={() => setShowBackupModal(false)}
                className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-300"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="text-sm font-display font-bold text-white mb-2">
                {backupType === 'key' ? 'Export Private Key' : backupType === 'seed' ? 'Export Seed Phrase' : 'Biometric Setup Authorization'}
              </h3>
              <p className="text-[10px] text-neutral-500 leading-relaxed font-mono uppercase tracking-wider mb-6">
                Requires 6-Digit security passcode confirmation
              </p>

              {backupContent ? (
                <div className="flex flex-col gap-4">
                  <div className="p-4 bg-red-950/10 border border-red-500/10 rounded-xl text-center select-all">
                    <span className="text-[9px] text-red-400 font-mono uppercase tracking-wide block mb-2">Secure Decrypted Output</span>
                    <p className="text-xs text-white font-mono font-semibold break-all leading-relaxed bg-black/60 p-3 rounded-lg border border-neutral-900">
                      {backupContent}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(backupContent);
                      alert('Copied secure output to clipboard.');
                    }}
                    className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-display text-xs font-semibold rounded-xl transition-all"
                  >
                    Copy to Clipboard
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBackupLoading(true);
                    setBackupError(null);

                    try {
                      // 1. Verify passcode with backend API
                      const verifyRes = await fetch('/api/auth/verify-passcode', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ address, passcode: backupPasscode })
                      });
                      const verifyData = await verifyRes.json();
                      if (!verifyRes.ok || !verifyData.success) {
                        setBackupError(verifyData.message || 'Incorrect security PIN verification');
                        setBackupLoading(false);
                        return;
                      }

                      // 2. Resolve action based on type
                      if (biometricAction === 'toggle_biometrics') {
                        // Enroll Biometrics
                        await registerBiometrics(address);
                        await encryptPinForBiometrics(backupPasscode, address);
                        setBiometricsEnabled(true);
                        setShowBackupModal(false);
                      } else {
                        // Decrypt data securely client-side
                        const decryptedData = await secureRetrievePrivateData(address, backupPasscode);
                        if (backupType === 'key') {
                          setBackupContent(decryptedData.privateKey);
                        } else {
                          setBackupContent(decryptedData.seedPhrase);
                        }
                      }
                    } catch (err: any) {
                      setBackupError(err.message || 'Verification or Decryption failed.');
                    } finally {
                      setBackupLoading(false);
                    }
                  }}
                  className="flex flex-col gap-4"
                >
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-neutral-400 font-mono uppercase tracking-wide">Enter 6-Digit PIN</label>
                    <input
                      type="password"
                      maxLength={6}
                      pattern="\d{6}"
                      required
                      placeholder="• • • • • •"
                      value={backupPasscode}
                      onChange={(e) => setBackupPasscode(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-neutral-900 border border-neutral-800 p-3.5 rounded-xl text-center text-md tracking-widest font-bold text-white outline-none focus:border-red-500/50 transition-all font-mono"
                    />
                  </div>

                  {backupError && (
                    <div className="p-3 bg-red-950/20 border border-red-500/20 text-red-400 text-[10px] font-mono rounded-xl">
                      {backupError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={backupLoading}
                    className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-display text-xs font-semibold rounded-xl transition-all shadow-lg shadow-red-600/10 disabled:opacity-50"
                  >
                    {backupLoading ? 'Confirming Security Enclave...' : 'Confirm PIN & Unlock'}
                  </button>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -------------------- SECURE PIN CHANGE MODAL -------------------- */}
      <AnimatePresence>
        {showChangePinModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm p-6 rounded-3xl bg-neutral-950 border border-neutral-900 flex flex-col shadow-2xl relative"
            >
              <button
                onClick={() => setShowChangePinModal(false)}
                className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-300"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="text-sm font-display font-bold text-white mb-2">Change Wallet security PIN</h3>
              <p className="text-[10px] text-neutral-500 font-mono uppercase tracking-wide mb-6">Modify 6-digit access credentials</p>

              {pinSuccess ? (
                <div className="flex flex-col items-center text-center py-4">
                  <div className="w-12 h-12 rounded-full bg-green-950/20 border border-green-500/20 flex items-center justify-center text-green-500 mb-4 shadow-[0_0_15px_rgba(34,197,94,0.15)]">
                    <Check className="w-5 h-5" />
                  </div>
                  <p className="text-xs text-neutral-300 font-semibold">{pinSuccess}</p>
                  <button
                    onClick={() => setShowChangePinModal(false)}
                    className="w-full mt-6 py-3 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-200 text-xs font-semibold rounded-xl transition-all"
                  >
                    Dismiss
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setPinLoading(true);
                    setPinError(null);

                    if (oldPin.length !== 6 || newPin.length !== 6) {
                      setPinError('PIN must be exactly 6 digits.');
                      setPinLoading(false);
                      return;
                    }

                    try {
                      // 1. Fetch current unencrypted credentials securely
                      const credentials = await secureRetrievePrivateData(address, oldPin);
                      
                      // 2. Call backend to update Passcode hash in DB
                      const changeRes = await fetch('/api/auth/change-passcode', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ address, oldPasscode: oldPin, newPasscode: newPin })
                      });
                      const changeData = await changeRes.json();
                      if (!changeRes.ok || !changeData.success) {
                        setPinError(changeData.message || 'Passcode update rejected by backend.');
                        setPinLoading(false);
                        return;
                      }

                      // 3. Re-encrypt secure private data with the new passcode!
                      await secureStorePrivateData(address, credentials.privateKey, credentials.seedPhrase, newPin);

                      // 4. Update biometric PIN as well if biometrics is enabled!
                      if (biometricsEnabled) {
                        await encryptPinForBiometrics(newPin, address);
                      }

                      setPinSuccess('Your wallet 6-digit PIN has been successfully rotated and re-secured.');
                    } catch (err: any) {
                      setPinError(err.message || 'Passcode change or re-encryption failed.');
                    } finally {
                      setPinLoading(false);
                    }
                  }}
                  className="flex flex-col gap-4"
                >
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-neutral-400 font-mono uppercase tracking-wide">Current 6-Digit PIN</label>
                    <input
                      type="password"
                      maxLength={6}
                      pattern="\d{6}"
                      required
                      placeholder="• • • • • •"
                      value={oldPin}
                      onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-neutral-900 border border-neutral-800 p-3 rounded-xl text-center text-sm font-mono tracking-widest text-white outline-none focus:border-red-500/30 transition-all"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-neutral-400 font-mono uppercase tracking-wide">New 6-Digit PIN</label>
                    <input
                      type="password"
                      maxLength={6}
                      pattern="\d{6}"
                      required
                      placeholder="• • • • • •"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-neutral-900 border border-neutral-800 p-3 rounded-xl text-center text-sm font-mono tracking-widest text-white outline-none focus:border-red-500/30 transition-all"
                    />
                  </div>

                  {pinError && (
                    <div className="p-3 bg-red-950/20 border border-red-500/20 text-red-400 text-[10px] font-mono rounded-xl">
                      {pinError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={pinLoading}
                    className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-display text-xs font-semibold rounded-xl transition-all shadow-lg disabled:opacity-50"
                  >
                    {pinLoading ? 'Securing key database...' : 'Rotate Security PIN'}
                  </button>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* -------------------- DASHBOARD BIOMETRIC PROMPT OVERLAY -------------------- */}
      <BiometricPrompt
        isOpen={showDashboardBiometricPrompt}
        onClose={() => setShowDashboardBiometricPrompt(false)}
        onSuccess={handleDashboardBiometricSuccess}
        address={address}
      />

      {/* -------------------- UPGRADED MULTI-WALLET MANAGER DRAWER -------------------- */}
      <WalletManager
        isOpen={showWalletManager}
        onClose={() => setShowWalletManager(false)}
        token={token}
        currentAddress={address}
        onWalletSwitched={(newAddress) => {
          // Switch global address and reload to force sync
          localStorage.setItem('wallet_address', newAddress);
          setShowWalletManager(false);
          window.location.reload();
        }}
      />

      {/* -------------------- SECURITY CENTER PRIVACY SCREEN COVER -------------------- */}
      <AnimatePresence>
        {privacyBlur && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center text-center p-6"
          >
            <div className="w-16 h-16 rounded-2xl bg-neutral-950 border border-neutral-900 flex items-center justify-center text-red-500 mb-4 shadow-lg animate-pulse">
              <Lock className="w-6 h-6 animate-pulse text-red-500" />
            </div>
            <h3 className="text-sm font-display font-bold text-white uppercase tracking-wider">TronNest Vault Closed</h3>
            <p className="text-[10px] text-neutral-500 font-mono mt-1.5 uppercase">Security Privacy Screen Active</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
