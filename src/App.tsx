import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Info, Smartphone, AlertCircle, RefreshCw, Layers } from 'lucide-react';
import AndroidHeader from './components/AndroidHeader';
import PasscodeScreen from './components/PasscodeScreen';
import WelcomeScreen from './components/WelcomeScreen';
import DashboardScreen from './components/DashboardScreen';
import AdminPanel from './components/AdminPanel';

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

  // App initialization passcode verification (on startup lock screen)
  const handleAppUnlock = async (passcode: string) => {
    if (!address) return;
    setLockLoading(true);
    setLockError(null);
    try {
      const res = await fetch('/api/auth/verify-passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, passcode })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('wallet_jwt', data.data.token);
        setToken(data.data.token);
        setIsLocked(false);
      } else {
        setLockError(data.message || 'Incorrect security passcode');
      }
    } catch (e) {
      setLockError('Security sync failure. Please retry.');
    } finally {
      setLockLoading(false);
    }
  };

  // Restore validation (user enters seed, system finds user, requires passcode to login)
  const handlePendingAuthUnlock = async (passcode: string) => {
    if (!pendingAddress) return;
    setLockLoading(true);
    setLockError(null);
    try {
      const res = await fetch('/api/auth/verify-passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: pendingAddress, passcode })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('wallet_jwt', data.data.token);
        localStorage.setItem('wallet_address', pendingAddress);
        setToken(data.data.token);
        setAddress(pendingAddress);
        setPendingAddress(null);
      } else {
        setLockError(data.message || 'Incorrect security passcode');
      }
    } catch (e) {
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

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a] flex items-center justify-center p-0 sm:p-6 md:p-12 overflow-y-auto selection:bg-red-500/30 select-none">
      {/* Immersive Phone Frame Mock */}
      <div className="w-full h-screen sm:w-[412px] sm:h-[844px] sm:rounded-[44px] sm:border-[8px] sm:border-neutral-900 bg-black flex flex-col relative overflow-hidden android-mock sm:aspect-[412/844]">
        {/* Physical Camera Notch Sim */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-32 h-5 bg-black rounded-full z-50 hidden sm:block flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-neutral-950 border border-neutral-800 ml-auto mr-4" />
        </div>

        {/* Android Status Bar */}
        <AndroidHeader />

        {/* Dynamic App Screens */}
        <div className="flex-1 relative overflow-hidden">
          <AnimatePresence mode="wait">
            {pendingAddress ? (
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
                />
              </motion.div>
            )}
          </AnimatePresence>

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
