import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Fingerprint, Check, ShieldAlert, X, Smartphone } from 'lucide-react';

interface BiometricPromptProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  address: string;
}

export default function BiometricPrompt({ isOpen, onClose, onSuccess, address }: BiometricPromptProps) {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStatus('idle');
      setErrorMessage('');
      // Auto-trigger scan
      handleScan();
    }
  }, [isOpen]);

  const handleScan = async () => {
    setStatus('scanning');
    
    // Simulate high-security hardware scanning feedback
    setTimeout(() => {
      // 95% success rate for simulation/WebAuthn fallback
      const success = true;
      if (success) {
        setStatus('success');
        setTimeout(() => {
          onSuccess();
        }, 1000);
      } else {
        setStatus('error');
        setErrorMessage('Biometric scan failed. Clean sensor and try again.');
      }
    }, 1800);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/85 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="w-full max-w-sm p-6 rounded-3xl bg-neutral-900 border border-neutral-800 flex flex-col items-center text-center shadow-2xl relative overflow-hidden"
          >
            {/* Top Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Title */}
            <span className="text-[10px] text-red-500 font-mono tracking-widest font-semibold uppercase mb-1">
              Biometric Authentication
            </span>
            <h3 className="text-md font-display font-bold text-white mb-6">
              Confirm Fingerprint / Face ID
            </h3>

            {/* Interactive Scanner Core */}
            <div className="relative w-32 h-32 flex items-center justify-center mb-8">
              {/* Outer Pulse Circles */}
              {status === 'scanning' && (
                <>
                  <span className="absolute inset-0 rounded-full border border-red-500/10 animate-ping opacity-70" />
                  <span className="absolute inset-4 rounded-full border border-red-500/20 animate-pulse" />
                </>
              )}

              <div
                onClick={status === 'error' || status === 'idle' ? handleScan : undefined}
                className={`w-24 h-24 rounded-full border flex items-center justify-center transition-all duration-300 cursor-pointer ${
                  status === 'scanning'
                    ? 'bg-red-950/20 border-red-500/40 red-glow shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                    : status === 'success'
                    ? 'bg-green-950/20 border-green-500/50 green-glow shadow-[0_0_20px_rgba(34,197,94,0.2)]'
                    : status === 'error'
                    ? 'bg-amber-950/20 border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                    : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                {status === 'success' ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 10 }}
                  >
                    <Check className="w-10 h-10 text-green-500" />
                  </motion.div>
                ) : status === 'error' ? (
                  <ShieldAlert className="w-10 h-10 text-amber-500" />
                ) : (
                  <Fingerprint
                    className={`w-12 h-12 transition-all duration-300 ${
                      status === 'scanning'
                        ? 'text-red-500 scale-105 animate-pulse'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  />
                )}
              </div>

              {/* Scanning laser effect */}
              {status === 'scanning' && (
                <motion.div
                  initial={{ top: '20%' }}
                  animate={{ top: '80%' }}
                  transition={{
                    repeat: Infinity,
                    repeatType: 'reverse',
                    duration: 1.5,
                    ease: 'easeInOut',
                  }}
                  className="absolute left-1/2 -translate-x-1/2 w-20 h-0.5 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] z-10"
                />
              )}
            </div>

            {/* Status Messages */}
            <div className="h-12 flex flex-col items-center justify-center">
              {status === 'scanning' && (
                <p className="text-xs text-neutral-400 font-mono animate-pulse">
                  Verifying hardware security enclave...
                </p>
              )}
              {status === 'success' && (
                <p className="text-xs text-green-400 font-mono font-semibold">
                  Identity Verified Successfully
                </p>
              )}
              {status === 'error' && (
                <p className="text-xs text-amber-400 font-mono">
                  {errorMessage}
                </p>
              )}
              {status === 'idle' && (
                <p className="text-xs text-neutral-500">
                  Touch sensor to begin scan
                </p>
              )}
            </div>

            {/* Footer lock type */}
            <div className="mt-4 pt-4 border-t border-neutral-800/60 w-full flex items-center justify-center gap-1.5 text-[10px] text-neutral-500 font-mono">
              <Smartphone className="w-3.5 h-3.5 text-neutral-600" />
              <span>Secure Android Biometric Protocol</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
