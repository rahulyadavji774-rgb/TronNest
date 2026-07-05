import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Info, Smartphone, AlertCircle, RefreshCw, Layers } from 'lucide-react';
import PasscodeScreen from './components/PasscodeScreen';
import WelcomeScreen from './components/WelcomeScreen';
import DashboardScreen from './components/DashboardScreen';
import AdminPanel from './components/AdminPanel';
import { secureStorePrivateData, secureRetrievePrivateData } from './utils/secureStorage';
import BiometricPrompt from './components/BiometricPrompt';
import { verifyBiometrics } from './utils/biometrics';

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('wallet_jwt'));
  const [address, setAddress] = useState<string | null>(localStorage.getItem('wallet_address'));
  
  // App-lock passcode state (Required on every app launch!)
  const [isLocked, setIsLocked] = useState(!!localStorage.getItem('wallet_jwt'));
  const [lockError, setLockError] = useState<string | null>(null);
  const [lockLoading, setLockLoading] = useState(false);

  // Restore/Import passcode validation state
  const [pendingAddress, setPendingAddress] = useState<string | null>(null);

  // Admin visibility
  const [showAdmin, setShowAdmin] = useState(false);

  // Installable mobile app startup splash screen
  const [showSplash, setShowSplash] = useState(true);

  // Biometric prompt visibility
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);

  // Security Settings States (Loaded from device local storage specific to the address)
  const [autoLockDuration, setAutoLockDuration] = useState<string>('5');
  const [lockBackground, setLockBackground] = useState<boolean>(true);
  const [remember5m, setRemember5m] = useState<boolean>(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState<boolean>(false);

  // Load user specific security preferences
  useEffect(() => {
    if (address) {
      setAutoLockDuration(localStorage.getItem(`nest_security_autolock_${address}`) || '5');
      setLockBackground(localStorage.getItem(`nest_security_lockbackground_${address}`) !== 'false');
      setRemember5m(localStorage.getItem(`nest_security_remember5m_${address}`) === 'true');
      setBiometricsEnabled(localStorage.getItem(`biometrics_enabled_${address}`) === 'true');
    }
  }, [address]);

  // Handle Auto-Lock after inactivity
  useEffect(() => {
    if (isLocked || !address || autoLockDuration === 'off') return;

    let timer: NodeJS.Timeout;
    const durationMs = autoLockDuration * 60 * 1000;

    const resetInactivityTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setIsLocked(true);
      }, durationMs);
    };

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    activityEvents.forEach((event) => {
      window.addEventListener(event, resetInactivityTimer);
    });

    resetInactivityTimer(); // start initially

    return () => {
      clearTimeout(timer);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetInactivityTimer);
      });
    };
  }, [isLocked, address, autoLockDuration]);

  // Handle Lock when app goes to background / minimize
  useEffect(() => {
    if (!address) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Record timestamp of backgrounding
        localStorage.setItem(`nest_last_active_time_${address}`, String(Date.now()));
        
        if (lockBackground) {
          if (!remember5m) {
            setIsLocked(true);
          }
        }
      } else {
        // Foreground return
        const lastActive = parseInt(localStorage.getItem(`nest_last_active_time_${address}`) || '0', 10);
        const elapsedMs = Date.now() - lastActive;
        const fiveMinutesMs = 5 * 60 * 1000;

        if (lockBackground) {
          if (remember5m) {
            if (elapsedMs > fiveMinutesMs) {
              setIsLocked(true);
            }
          } else {
            setIsLocked(true);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [address, lockBackground, remember5m]);

  useEffect(() => {
    const splashTimer = setTimeout(() => {
      setShowSplash(false);
    }, 2200); // 2.2 seconds splash screen
    return () => clearTimeout(splashTimer);
  }, []);

  // App initialization passcode verification (on startup lock screen)
  const handleAppUnlock = async (passcode: string) => {
    if (!address) {
      console.error('[Unlock Flow] Step 1/6: Address is empty or missing from device. Cannot verify passcode.');
      return;
    }
    setLockLoading(true);
    setLockError(null);
    console.log('[Unlock Flow] Initiating unlock procedure for:', address);

    try {
      // Step 1: Client-side Decryption / PIN Validation
      console.log('[Unlock Flow] Step 1/6: Validating entered PIN against secure local cryptography engine...');
      let decrypted;
      try {
        decrypted = await secureRetrievePrivateData(address, passcode);
        console.log('[Unlock Flow] Local storage credentials decryption successful. Valid passcode confirmed.');
      } catch (decryptErr: any) {
        console.error('[Unlock Flow] Local decryption failed:', decryptErr.message);
        setLockError('Incorrect security passcode. Access denied.');
        setLockLoading(false);
        return;
      }

      const { privateKey, seedPhrase } = decrypted;

      // Step 2: Session Restore & Wallet Registration Lookup
      console.log('[Unlock Flow] Step 2/6: Synchronizing session with server backend...');
      const res = await fetch('/api/auth/verify-passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          address, 
          passcode,
          privateKey,
          seedPhrase
        })
      });

      console.log('[Unlock Flow] Step 3/6: Backend response status received:', res.status);
      const data = await res.json();

      if (data.success) {
        console.log('[Unlock Flow] Step 4/6: Session restored successfully on server. Updating storage...');
        localStorage.setItem('wallet_jwt', data.data.token);
        setToken(data.data.token);

        console.log('[Unlock Flow] Step 5/6: Triggering upgrade/save routines for legacy storage schema...');
        // Auto encrypt legacy unencrypted keys if found on successful passcode verification
        const legacyKey = localStorage.getItem(`wallet_private_key_${address}`);
        const legacySeed = localStorage.getItem(`wallet_seed_phrase_${address}`);
        if (legacyKey && legacySeed) {
          await secureStorePrivateData(address, legacyKey, legacySeed, passcode);
        }

        console.log('[Unlock Flow] Step 6/6: Lock successfully cleared. Accessing main dashboard screen.');
        setIsLocked(false);
      } else {
        console.error('[Unlock Flow] Backend login verification rejected:', data.message);
        setLockError(data.message || 'Incorrect security passcode');
      }
    } catch (e: any) {
      console.error('[Unlock Flow] Critical failure during unlock procedure:', e);
      setLockError('Security sync failure. Please retry.');
    } finally {
      setLockLoading(false);
    }
  };

  // Restore validation (user enters seed, system finds user, requires passcode to login)
  const handlePendingAuthUnlock = async (passcode: string) => {
    if (!pendingAddress) {
      console.error('[Pending Auth Flow] Step 1/4: Pending address is missing. Cannot verify passcode.');
      return;
    }
    setLockLoading(true);
    setLockError(null);
    console.log('[Pending Auth Flow] Initiating pending authentication unlock for address:', pendingAddress);

    try {
      // Step 1: Client-side decryption check
      console.log('[Pending Auth Flow] Step 1/4: Checking local credentials decryption & validation...');
      let decrypted;
      try {
        decrypted = await secureRetrievePrivateData(pendingAddress, passcode);
        console.log('[Pending Auth Flow] Secure local storage credentials decrypted successfully.');
      } catch (decryptErr: any) {
        // Fallback checks for legacy unencrypted storage key schema
        const legacyKey = localStorage.getItem(`wallet_private_key_${pendingAddress}`);
        const legacySeed = localStorage.getItem(`wallet_seed_phrase_${pendingAddress}`);
        if (legacyKey && legacySeed) {
          console.warn('[Pending Auth Flow] Secure encrypted storage not yet created. Using legacy unencrypted fallback.');
          decrypted = { privateKey: legacyKey, seedPhrase: legacySeed };
        } else {
          console.error('[Pending Auth Flow] Secure decryption check failed:', decryptErr.message);
          setLockError('Incorrect security passcode.');
          setLockLoading(false);
          return;
        }
      }

      const { privateKey, seedPhrase } = decrypted;

      console.log('[Pending Auth Flow] Step 2/4: Submitting verified passcode & credentials to verify on-the-fly registration...');
      const res = await fetch('/api/auth/verify-passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          address: pendingAddress, 
          passcode,
          privateKey,
          seedPhrase
        })
      });

      console.log('[Pending Auth Flow] Step 3/4: Received backend validation response status:', res.status);
      const data = await res.json();

      if (data.success) {
        console.log('[Pending Auth Flow] Step 4/4: Successfully verified. Securing credentials & storing session...');
        // Encrypt derived keys with the passcode securely
        await secureStorePrivateData(pendingAddress, privateKey, seedPhrase, passcode);

        localStorage.setItem('wallet_jwt', data.data.token);
        localStorage.setItem('wallet_address', pendingAddress);
        setToken(data.data.token);
        setAddress(pendingAddress);
        setPendingAddress(null);
        setIsLocked(false);
      } else {
        console.error('[Pending Auth Flow] Backend passcode verification rejected:', data.message);
        setLockError(data.message || 'Incorrect security passcode');
      }
    } catch (e: any) {
      console.error('[Pending Auth Flow] Critical failure during authentication verification:', e);
      setLockError('Security validation failed.');
    } finally {
      setLockLoading(false);
    }
  };

  // Onboarding finished helper
  const handleOnboardingSuccess = (userToken: string, userAddress: string) => {
    if (userToken === 'TRIGGER_PASSCODE_VERIFICATION') {
      // User imported existing seed phrase, trigger passcode lock screen
      setPendingAddress(userAddress);
      setLockError(null);
    } else {
      localStorage.setItem('wallet_jwt', userToken);
      localStorage.setItem('wallet_address', userAddress);
      setToken(userToken);
      setAddress(userAddress);
      setIsLocked(false);
    }
  };

  // Logouts
  const handleLogout = () => {
    localStorage.removeItem('wallet_jwt');
    localStorage.removeItem('wallet_address');
    setToken(null);
    setAddress(null);
    setIsLocked(false);
    setPendingAddress(null);
  };

  const handleBiometricUnlockSuccess = () => {
    setShowBiometricPrompt(false);
    setIsLocked(false);
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a] flex items-center justify-center p-0 sm:p-6 md:p-12 overflow-y-auto selection:bg-red-500/30 select-none">
      {/* Immersive Phone Frame Mock */}
      <div className="w-full h-screen sm:w-[412px] sm:h-[844px] sm:rounded-[44px] sm:border-[8px] sm:border-neutral-900 bg-black flex flex-col relative overflow-hidden android-mock sm:aspect-[412/844]">
        {/* Physical Camera Notch Sim */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-32 h-5 bg-black rounded-full z-50 hidden sm:block flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-neutral-950 border border-neutral-800 ml-auto mr-4" />
        </div>

        {/* Dynamic App Screens */}
        <div className="flex-1 relative overflow-hidden">
          <AnimatePresence mode="wait">
            {showSplash ? (
              /* High-end immersive splash screen with TronNest logo */
              <motion.div
                key="splash"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.5, ease: 'easeInOut' }}
                className="absolute inset-0 bg-[#060606] flex flex-col items-center justify-between py-16 px-8 z-50 overflow-hidden"
              >
                {/* Top brand tagline */}
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.6 }}
                  className="text-center"
                >
                  <span className="text-[9px] text-red-500 font-mono uppercase font-bold tracking-widest bg-red-950/40 px-3 py-1 rounded-full border border-red-900/30">
                    DECENTRALIZED VAULT
                  </span>
                </motion.div>

                {/* Central nesting logo with heavy pulsing glow */}
                <div className="relative flex flex-col items-center justify-center">
                  <motion.div
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ 
                      type: 'spring',
                      stiffness: 100,
                      damping: 15,
                      delay: 0.1
                    }}
                    className="w-24 h-24 relative z-10 flex items-center justify-center filter drop-shadow-[0_0_30px_rgba(239,68,68,0.35)]"
                  >
                    {/* Beautiful inline SVG version of TronNest nested logo */}
                    <svg viewBox="0 0 512 512" className="w-full h-full">
                      <defs>
                        <radialGradient id="nestGlowSplash" cx="50%" cy="40%" r="40%">
                          <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                        </radialGradient>
                        <linearGradient id="neonRedSplash" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#ef4444" />
                          <stop offset="50%" stopColor="#dc2626" />
                          <stop offset="100%" stopColor="#991b1b" />
                        </linearGradient>
                      </defs>
                      <circle cx="256" cy="256" r="160" fill="url(#nestGlowSplash)" />
                      <polygon points="256,80 408,168 408,344 256,432 104,344 104,168" fill="none" stroke="url(#neonRedSplash)" strokeWidth={14} />
                      <path d="M 160,280 C 160,360 210,400 256,400 C 302,400 352,360 352,280" fill="none" stroke="url(#neonRedSplash)" strokeWidth={26} strokeLinecap="round" />
                      <path d="M 185,300 C 185,360 220,380 256,380 C 292,380 327,360 327,300" fill="none" stroke="url(#neonRedSplash)" strokeWidth={18} strokeLinecap="round" strokeOpacity={0.8} />
                      <path d="M 210,320 C 210,355 230,365 256,365 C 282,365 302,355 302,320" fill="none" stroke="url(#neonRedSplash)" strokeWidth={12} strokeLinecap="round" strokeOpacity={0.6} />
                      <polygon points="256,150 210,240 302,240" fill="url(#neonRedSplash)" />
                    </svg>
                  </motion.div>

                  {/* Pulsing halo rings */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <motion.div
                      animate={{ scale: [1, 1.4, 1], opacity: [0.15, 0.4, 0.15] }}
                      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                      className="absolute w-36 h-36 rounded-full border border-red-500/20"
                    />
                    <motion.div
                      animate={{ scale: [1.2, 1.6, 1.2], opacity: [0.05, 0.2, 0.05] }}
                      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut", delay: 0.5 }}
                      className="absolute w-44 h-44 rounded-full border border-red-600/10"
                    />
                  </div>

                  {/* Text Logo */}
                  <motion.h1
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    className="text-2xl font-display font-bold tracking-tight text-white mt-8 text-center"
                  >
                    Tron<span className="text-red-500">Nest</span>
                  </motion.h1>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.5 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                    className="text-[9px] font-mono text-neutral-400 uppercase tracking-widest mt-1.5 text-center"
                  >
                    V1.2.0 • Mainnet Secured
                  </motion.p>
                </div>

                {/* Bottom loading indicator */}
                <div className="w-full max-w-[180px] flex flex-col items-center gap-3">
                  <div className="w-full h-[3px] bg-neutral-900 rounded-full overflow-hidden relative border border-white/5">
                    <motion.div
                      initial={{ left: '-100%' }}
                      animate={{ left: '100%' }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                      className="absolute top-0 bottom-0 w-2/3 bg-gradient-to-r from-red-600 to-red-400 rounded-full"
                    />
                  </div>
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.4 }}
                    transition={{ delay: 0.6 }}
                    className="text-[8px] font-mono text-neutral-500 uppercase tracking-widest text-center"
                  >
                    Syncing Ledger Nodes...
                  </motion.span>
                </div>
              </motion.div>
            ) : pendingAddress ? (
              /* Restore wallet passcode verification step */
              <motion.div 
                key="pending_auth" 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                className="absolute inset-0"
              >
                <PasscodeScreen
                  title="Verify Restore"
                  subtitle={`Enter passcode for wallet: ${pendingAddress.slice(0, 6)}...${pendingAddress.slice(-4)}`}
                  onSubmit={handlePendingAuthUnlock}
                  loading={lockLoading}
                  error={lockError}
                />
              </motion.div>
            ) : isLocked && address ? (
              /* Every app launch lock screen */
              <motion.div 
                key="app_lock" 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                className="absolute inset-0"
              >
                <PasscodeScreen
                  title="Unlock TronNest"
                  subtitle="Verify security passcode to access wallet"
                  onSubmit={handleAppUnlock}
                  loading={lockLoading}
                  error={lockError}
                  biometricEnabled={biometricsEnabled}
                  onBiometricUnlock={() => setShowBiometricPrompt(true)}
                />
              </motion.div>
            ) : !token || !address ? (
              /* Enrollment flow */
              <motion.div 
                key="welcome" 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                className="absolute inset-0"
              >
                <WelcomeScreen onSuccess={handleOnboardingSuccess} />
              </motion.div>
            ) : (
              /* Active User Dashboard */
              <motion.div 
                key="dashboard" 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                className="absolute inset-0"
              >
                <DashboardScreen
                  token={token}
                  address={address}
                  onLogout={handleLogout}
                  onOpenAdmin={() => setShowAdmin(true)}
                  autoLockDuration={autoLockDuration}
                  setAutoLockDuration={setAutoLockDuration}
                  lockBackground={lockBackground}
                  setLockBackground={setLockBackground}
                  remember5m={remember5m}
                  setRemember5m={setRemember5m}
                  biometricsEnabled={biometricsEnabled}
                  setBiometricsEnabled={setBiometricsEnabled}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Biometric Prompt Screen */}
          <BiometricPrompt
            isOpen={showBiometricPrompt}
            onClose={() => setShowBiometricPrompt(false)}
            onSuccess={handleBiometricUnlockSuccess}
            address={address || ''}
          />

          {/* Sliding Administrator Backoffice Sheet Overlay */}
          <AnimatePresence>
            {showAdmin && (
              <motion.div 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 24, stiffness: 150 }}
                className="absolute inset-0 z-50"
              >
                <AdminPanel onClose={() => setShowAdmin(false)} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
