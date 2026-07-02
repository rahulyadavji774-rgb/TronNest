import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Delete, Lock, ShieldCheck, AlertCircle, Fingerprint, RefreshCw } from 'lucide-react';

interface PasscodeScreenProps {
  title?: string;
  subtitle?: string;
  error?: string | null;
  onSubmit: (passcode: string) => void;
  loading?: boolean;
  biometricEnabled?: boolean;
  onBiometricUnlock?: () => void;
}

export default function PasscodeScreen({
  title = "Unlock Wallet",
  subtitle = "Enter 6-digit passcode to proceed",
  error: externalError = null,
  onSubmit,
  loading = false,
  biometricEnabled = false,
  onBiometricUnlock
}: PasscodeScreenProps) {
  const [passcode, setPasscode] = useState('');
  const [shake, setShake] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState<number>(0); // remaining lockout seconds

  // Check if there is an active lockout on mount or whenever lockoutTime changes
  useEffect(() => {
    const lockoutUntilStr = localStorage.getItem('nest_wallet_lockout_until');
    if (lockoutUntilStr) {
      const lockoutUntil = parseInt(lockoutUntilStr);
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (remaining > 0) {
        setLockoutTime(remaining);
      } else {
        localStorage.removeItem('nest_wallet_lockout_until');
        setLockoutTime(0);
      }
    }
  }, []);

  // Set up timer for active lockout countdown
  useEffect(() => {
    if (lockoutTime <= 0) return;
    const interval = setInterval(() => {
      setLockoutTime((prev) => {
        if (prev <= 1) {
          localStorage.removeItem('nest_wallet_lockout_until');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutTime]);

  // Shake dots when an external error occurs
  useEffect(() => {
    if (externalError) {
      setShake(true);
      const timer = setTimeout(() => setShake(false), 500);
      
      // Increment failed attempts on error
      setFailedAttempts((prev) => {
        const next = prev + 1;
        if (next >= 5) {
          // Lock out for 30 seconds
          const unlockTime = Date.now() + 30 * 1000;
          localStorage.setItem('nest_wallet_lockout_until', String(unlockTime));
          setLockoutTime(30);
          return 0; // reset attempts after lockout trigger
        }
        return next;
      });

      return () => clearTimeout(timer);
    }
  }, [externalError]);

  const handleNumberClick = (num: number) => {
    if (lockoutTime > 0) return;
    if (passcode.length >= 6 || loading) return;
    const nextVal = passcode + num;
    setPasscode(nextVal);
    
    if (nextVal.length === 6) {
      onSubmit(nextVal);
      // Wait slightly and clear
      setTimeout(() => setPasscode(''), 1000);
    }
  };

  const handleDelete = () => {
    if (lockoutTime > 0) return;
    if (passcode.length === 0 || loading) return;
    setPasscode(passcode.slice(0, -1));
  };

  const handleClear = () => {
    if (lockoutTime > 0) return;
    if (loading) return;
    setPasscode('');
  };

  return (
    <div className="flex flex-col h-full justify-between py-10 px-6 select-none bg-black">
      {/* Upper lock visual status */}
      <div className="flex flex-col items-center text-center mt-6">
        <div className="w-16 h-16 rounded-full bg-red-950/40 border border-red-500/30 flex items-center justify-center mb-5 red-glow">
          <Lock className="w-6 h-6 text-red-500 animate-pulse" />
        </div>
        <h2 className="text-xl font-display font-semibold text-white tracking-tight">{title}</h2>
        <p className="text-sm text-neutral-400 mt-1">{subtitle}</p>

        {/* Password indicators (6 dots) */}
        <motion.div 
          animate={shake ? { x: [-10, 10, -10, 10, 0] } : {}}
          className="flex items-center gap-4 mt-8"
        >
          {[...Array(6)].map((_, i) => {
            const active = i < passcode.length;
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

        {/* Action feedback / error lines */}
        <div className="h-6 mt-6 flex items-center">
          {lockoutTime > 0 ? (
            <span className="text-red-500 text-xs flex items-center gap-1.5 font-mono">
              <AlertCircle className="w-3.5 h-3.5" />
              Locked due to failed attempts. Try in {lockoutTime}s
            </span>
          ) : externalError ? (
            <span className="text-red-500 text-xs flex items-center gap-1 font-mono">
              <AlertCircle className="w-3.5 h-3.5" />
              {externalError} {failedAttempts > 0 && `(${failedAttempts}/5 attempts)`}
            </span>
          ) : loading ? (
            <span className="text-red-400 text-xs font-mono flex items-center gap-1.5 animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Broadcasting transaction to TRON Mainnet...
            </span>
          ) : null}
        </div>
      </div>

      {/* Grid Keyboard Layout */}
      <div className="w-full max-w-xs mx-auto mb-4">
        <div className="grid grid-cols-3 gap-y-4 gap-x-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              type="button"
              disabled={loading || lockoutTime > 0}
              onClick={() => handleNumberClick(num)}
              className="w-18 h-18 rounded-full border border-neutral-900 bg-neutral-950/60 active:bg-red-950/30 active:border-red-500/30 disabled:opacity-20 text-white font-display text-2xl flex items-center justify-center transition-all duration-200 outline-none select-none hover:border-neutral-800"
            >
              {num}
            </button>
          ))}
          
          {biometricEnabled && onBiometricUnlock ? (
            <button
              type="button"
              disabled={loading || lockoutTime > 0}
              onClick={onBiometricUnlock}
              className="w-18 h-18 rounded-full border border-red-500/10 bg-red-950/20 active:bg-red-900/30 active:border-red-500/50 disabled:opacity-20 text-red-500 flex items-center justify-center outline-none select-none hover:border-red-500/30"
              title="Biometric unlock"
            >
              <Fingerprint className="w-8 h-8" />
            </button>
          ) : (
            <button
              type="button"
              disabled={loading || lockoutTime > 0}
              onClick={handleClear}
              className="w-18 h-18 text-neutral-500 text-xs font-mono flex items-center justify-center outline-none disabled:opacity-20"
            >
              CLEAR
            </button>
          )}

          <button
            type="button"
            disabled={loading || lockoutTime > 0}
            onClick={() => handleNumberClick(0)}
            className="w-18 h-18 rounded-full border border-neutral-900 bg-neutral-950/60 active:bg-red-950/30 active:border-red-500/30 disabled:opacity-20 text-white font-display text-2xl flex items-center justify-center transition-all duration-200 outline-none hover:border-neutral-800"
          >
            0
          </button>

          <button
            type="button"
            disabled={loading || lockoutTime > 0}
            onClick={handleDelete}
            className="w-18 h-18 text-neutral-400 flex items-center justify-center outline-none active:text-red-500 disabled:opacity-20"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
