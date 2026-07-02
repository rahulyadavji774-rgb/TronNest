import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, Copy, Key, ArrowRight, Wallet, Check, EyeOff, Lock, RefreshCw, Smartphone } from 'lucide-react';
import { TronWeb } from 'tronweb';
import PasscodeScreen from './PasscodeScreen';
import { secureStorePrivateData } from '../utils/secureStorage';

interface WelcomeScreenProps {
  onSuccess: (token: string, address: string) => void;
}

export default function WelcomeScreen({ onSuccess }: WelcomeScreenProps) {
  const [step, setStep] = useState<'landing' | 'generate_reveal' | 'import_input' | 'set_passcode'>('landing');
  const [generatedCreds, setGeneratedCreds] = useState<{ address: string; seedPhrase: string; privateKey: string } | null>(null);
  const [seedInput, setSeedInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Trigger wallet generation entirely client-side
  const handleGenerateClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const wallet = await TronWeb.createRandom();
      setGeneratedCreds({
        address: wallet.address,
        seedPhrase: wallet.mnemonic.phrase,
        privateKey: wallet.privateKey,
      });
      setStep('generate_reveal');
    } catch (e: any) {
      setError('Local generation failed: ' + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  // Trigger wallet import verification entirely client-side
  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedSeed = seedInput.trim().toLowerCase();
    if (!normalizedSeed) return;

    const words = normalizedSeed.split(/\s+/);
    if (words.length !== 12) {
      setError('Mnemonic seed phrase must be exactly 12 words');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Derive address and private key client-side
      const wallet = TronWeb.fromMnemonic(normalizedSeed);
      
      // Check if address is already registered in DB
      const res = await fetch(`/api/auth/check-address?address=${wallet.address}`);
      const data = await res.json();
      
      if (data.success) {
        // Cache the derived credentials locally
        localStorage.setItem(`wallet_private_key_${wallet.address}`, wallet.privateKey);
        localStorage.setItem(`wallet_seed_phrase_${wallet.address}`, normalizedSeed);

        if (data.isExistingUser) {
          // System already has this address registered! Verify passcode
          setStep('landing');
          onSuccess('TRIGGER_PASSCODE_VERIFICATION', wallet.address);
        } else {
          // New wallet import, set passcode
          setGeneratedCreds({
            address: wallet.address,
            seedPhrase: normalizedSeed,
            privateKey: wallet.privateKey,
          });
          setStep('set_passcode');
        }
      } else {
        setError(data.message || 'Verification of seed phrase failed');
      }
    } catch (e: any) {
      setError('Failed to import and derive TRON wallet: ' + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  // Register user after passcode selection
  const handlePasscodeSubmit = async (passcode: string) => {
    if (!generatedCreds) return;
    setLoading(true);
    setError(null);
    try {
      // Save credentials locally with enterprise grade passcode encryption
      await secureStorePrivateData(generatedCreds.address, generatedCreds.privateKey, generatedCreds.seedPhrase, passcode);

      // Finalize setup with placeholders so actual secrets never touch the server!
      const res = await fetch('/api/auth/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: generatedCreds.address,
          seedPhrase: 'secured_on_client',
          privateKey: 'secured_on_client',
          passcode
        })
      });
      const data = await res.json();
      if (data.success) {
        onSuccess(data.data.token, data.data.user.address);
      } else {
        setError(data.message || 'Failed to complete wallet setup');
      }
    } catch (e) {
      setError('Setup failed. Network connection timed out.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full bg-black text-white flex flex-col justify-between">
      <AnimatePresence mode="wait">
        {step === 'landing' && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex-1 flex flex-col justify-between px-6 py-12"
          >
            <div className="flex flex-col items-center text-center mt-12">
              <div className="relative mb-6">
                <div className="w-24 h-24 rounded-full bg-red-950/20 border border-red-500/10 flex items-center justify-center red-glow">
                  <Wallet className="w-10 h-10 text-red-500 animate-pulse" />
                </div>
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 border border-black"></span>
                </span>
              </div>
              
              <h1 className="text-3xl font-display font-bold tracking-tight text-white">
                Tron<span className="text-red-500">Nest</span>
              </h1>
              <p className="text-sm text-neutral-400 mt-2 max-w-xs font-sans">
                Next-generation TRON wallet. Secure storage for TRX, USDT and private high-yield internal ledger tokens.
              </p>
            </div>

            <div className="flex flex-col gap-4 mt-8">
              <button
                onClick={handleGenerateClick}
                disabled={loading}
                className="w-full py-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-display font-medium rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_4px_20px_rgba(239,68,68,0.2)]"
              >
                {loading ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Create New Wallet
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                onClick={() => setStep('import_input')}
                disabled={loading}
                className="w-full py-4 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800/80 active:bg-neutral-900 text-neutral-300 font-display font-medium rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                Import Existing Wallet
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[10px] text-neutral-500 font-mono mt-4">
                <Smartphone className="w-3.5 h-3.5 text-neutral-600" />
                <span>100% Android Native Cryptography</span>
              </div>
            </div>
          </motion.div>
        )}

        {step === 'generate_reveal' && generatedCreds && (
          <motion.div 
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="flex-1 flex flex-col justify-between px-6 py-8"
          >
            <div className="flex-1 overflow-y-auto pr-1">
              <h2 className="text-xl font-display font-bold text-white tracking-tight flex items-center gap-2">
                <Key className="w-5 h-5 text-red-500" />
                Backup Seed Phrase
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Your seed phrase controls access to your TRON and custom ledger tokens.
              </p>

              {/* Warning Card */}
              <div className="mt-4 p-4 bg-red-950/20 border border-red-500/30 rounded-xl flex gap-3">
                <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div className="text-[11px] text-red-200/90 leading-relaxed font-sans">
                  <span className="font-bold text-red-400">CRITICAL:</span> Write these 12 words down on physical paper. Keep it in a secure location. This phrase is shown <span className="font-bold underline text-red-400">ONLY ONCE</span>. Never share it with anyone.
                </div>
              </div>

              {/* 12 Words Grid */}
              <div className="grid grid-cols-3 gap-2.5 mt-5">
                {generatedCreds.seedPhrase.split(' ').map((word, index) => (
                  <div key={index} className="flex items-center gap-1.5 p-2 bg-neutral-950/60 border border-neutral-900 rounded-lg">
                    <span className="text-[10px] text-neutral-600 font-mono w-4">{index + 1}</span>
                    <span className="text-xs text-white font-mono font-medium">{word}</span>
                  </div>
                ))}
              </div>

              {/* Copy Phrase Button */}
              <button
                onClick={() => handleCopy(generatedCreds.seedPhrase, 'seed')}
                className="mt-4 w-full py-2.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-xl flex items-center justify-center gap-2 text-xs text-neutral-300 font-medium transition-all"
              >
                {copied === 'seed' ? (
                  <>
                    <Check className="w-4 h-4 text-green-500" />
                    Copied to Clipboard!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy Seed Phrase
                  </>
                )}
              </button>

              {/* Wallet Address Preview */}
              <div className="mt-5 p-3.5 bg-neutral-950/40 border border-neutral-900 rounded-xl flex flex-col gap-1">
                <span className="text-[10px] text-neutral-500 font-mono font-semibold tracking-wide uppercase">TRON Address</span>
                <span className="text-[11px] text-neutral-300 font-mono break-all">{generatedCreds.address}</span>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={() => setStep('set_passcode')}
                className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-display font-medium rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg"
              >
                I Have Saved the Phrase
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {step === 'import_input' && (
          <motion.div 
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="flex-1 flex flex-col justify-between px-6 py-8"
          >
            <div>
              <h2 className="text-xl font-display font-bold text-white tracking-tight flex items-center gap-2">
                <Wallet className="w-5 h-5 text-red-500" />
                Import Mnemonic
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Enter your 12-word seed phrase in lower case, separated by spaces.
              </p>

              <form onSubmit={handleImportSubmit} className="mt-6 flex flex-col gap-4">
                <textarea
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value)}
                  placeholder="e.g. nest tron crypto secure node energy premium slate gold quantum cyber matrix"
                  required
                  rows={4}
                  className="w-full p-4 bg-neutral-950 border border-neutral-900 rounded-xl font-mono text-xs leading-relaxed text-white focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 resize-none"
                />

                {error && (
                  <div className="p-3 bg-red-950/20 border border-red-500/30 rounded-lg text-xs text-red-400 font-mono flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !seedInput.trim()}
                  className="w-full mt-2 py-4 bg-red-600 hover:bg-red-700 disabled:bg-neutral-900 disabled:text-neutral-600 disabled:border-neutral-950 text-white font-display font-medium rounded-xl flex items-center justify-center gap-2 transition-all"
                >
                  {loading ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Verify and Import
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>

            <div>
              <button
                onClick={() => setStep('landing')}
                className="w-full py-3 text-xs text-neutral-500 font-medium tracking-wide hover:text-white transition-all font-mono"
              >
                GO BACK
              </button>
            </div>
          </motion.div>
        )}

        {step === 'set_passcode' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1"
          >
            <PasscodeScreen
              title="Set Security Passcode"
              subtitle="Create a 6-digit passcode to sign transfers and transactions"
              onSubmit={handlePasscodeSubmit}
              loading={loading}
              error={error}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
