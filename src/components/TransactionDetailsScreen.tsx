import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Copy, Check, ExternalLink, Shield, Activity, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { Transaction, Token } from '../types';

interface TransactionDetailsScreenProps {
  transaction: Transaction;
  tokenInfo: { name: string; symbol: string; logoUrl: string };
  onClose: () => void;
}

export default function TransactionDetailsScreen({ transaction, tokenInfo, onClose }: TransactionDetailsScreenProps) {
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const formatDate = (dateString: string) => {
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) {
        return { date: 'Unknown Date', time: 'Unknown Time' };
      }
      return {
        date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
        time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };
    } catch (e) {
      return { date: 'Unknown Date', time: 'Unknown Time' };
    }
  };

  const { date, time } = formatDate(transaction.created_at);
  const isOut = transaction.direction === 'out';
  const isInternal = transaction.type === 'internal';

  // Determine sender and receiver
  let senderWallet = isOut ? 'My Wallet' : transaction.counterparty;
  let receiverWallet = isOut ? transaction.counterparty : 'My Wallet';

  if (!transaction.counterparty) {
     senderWallet = 'My Wallet';
     receiverWallet = 'My Wallet';
  }

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-[60] bg-black flex flex-col"
    >
      {/* Header */}
      <div className="pt-5 pb-4 px-6 border-b border-neutral-900 flex items-center justify-between bg-black z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center text-neutral-400 active:scale-95 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-display font-bold text-white tracking-wide">Transaction Details</h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 bg-neutral-950 pb-20">
        
        {/* Top Status & Amount */}
        <div className="flex flex-col items-center justify-center py-6 border-b border-neutral-900 mb-6">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center border-4 mb-4 ${
            isOut ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-green-500/10 border-green-500/20 text-green-500'
          }`}>
            {isOut ? <ArrowUpRight className="w-8 h-8" /> : <ArrowDownLeft className="w-8 h-8" />}
          </div>
          
          <h3 className={`text-3xl font-mono font-bold tracking-tight mb-2 ${isOut ? 'text-white' : 'text-green-400'}`}>
            {isOut ? '-' : '+'}{transaction.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} {tokenInfo.symbol}
          </h3>
          
          <span className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold uppercase ${
            transaction.status === 'completed' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
            transaction.status === 'failed' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
            'bg-orange-500/20 text-orange-400 border border-orange-500/30'
          }`}>
            {transaction.status}
          </span>
        </div>

        {/* Details List */}
        <div className="flex flex-col gap-4">
          
          <DetailRow label="Token">
            <div className="flex items-center gap-2">
              <img src={tokenInfo.logoUrl} alt={tokenInfo.name} className="w-5 h-5 rounded-full" />
              <span className="text-sm font-semibold text-white">{tokenInfo.name}</span>
            </div>
          </DetailRow>

          <DetailRow label="Date & Time">
            <span className="text-sm font-mono text-neutral-300">{date} at {time}</span>
          </DetailRow>

          <DetailRow label="Network">
            {isInternal ? (
              <span className="text-sm text-purple-400 flex items-center gap-1.5 font-mono">
                <Shield className="w-4 h-4" /> TronNest Internal
              </span>
            ) : (
              <span className="text-sm text-blue-400 flex items-center gap-1.5 font-mono">
                <Activity className="w-4 h-4" /> TRON Blockchain
              </span>
            )}
          </DetailRow>

          <DetailRow label="Sender Wallet">
            <div className="flex items-center justify-between w-full">
              <span className="text-sm font-mono text-neutral-300 break-all pr-4">{senderWallet}</span>
              <CopyButton text={senderWallet} field="sender" copiedField={copiedField} onCopy={copyToClipboard} />
            </div>
          </DetailRow>

          <DetailRow label="Receiver Wallet">
            <div className="flex items-center justify-between w-full">
              <span className="text-sm font-mono text-neutral-300 break-all pr-4">{receiverWallet}</span>
              <CopyButton text={receiverWallet} field="receiver" copiedField={copiedField} onCopy={copyToClipboard} />
            </div>
          </DetailRow>

          <DetailRow label="Network Fee">
            <span className="text-sm font-mono text-neutral-300">
              {transaction.fee > 0 ? `${transaction.fee} TRX` : '0 TRX (Free)'}
            </span>
          </DetailRow>

          <DetailRow label="Confirmation Status">
            <span className="text-sm font-mono text-neutral-300 capitalize">{transaction.status}</span>
          </DetailRow>

          {isInternal ? (
             <DetailRow label="Internal Block Number">
               <div className="flex items-center justify-between w-full">
                 <span className="text-sm font-mono text-neutral-300 break-all pr-4">
                   {transaction.internal_ledger_id || transaction.id}
                 </span>
                 <CopyButton text={transaction.internal_ledger_id || transaction.id} field="ledger" copiedField={copiedField} onCopy={copyToClipboard} />
               </div>
             </DetailRow>
          ) : (
             <DetailRow label="Blockchain TXID">
               <div className="flex items-center justify-between w-full">
                 <span className="text-sm font-mono text-neutral-300 break-all pr-4">
                   {transaction.tx_hash || transaction.blockchain_tx_id || 'N/A'}
                 </span>
                 {(transaction.tx_hash || transaction.blockchain_tx_id) && (
                   <CopyButton text={transaction.tx_hash || transaction.blockchain_tx_id || ''} field="txid" copiedField={copiedField} onCopy={copyToClipboard} />
                 )}
               </div>
             </DetailRow>
          )}

        </div>
        
        {/* External Link (if blockchain) */}
        {!isInternal && (transaction.tx_hash || transaction.blockchain_tx_id) && (
          <div className="mt-8 flex justify-center">
            <a 
              href={`https://tronscan.org/#/transaction/${transaction.tx_hash || transaction.blockchain_tx_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs font-mono text-red-500 hover:text-red-400 transition-colors bg-red-500/10 px-4 py-2 rounded-lg border border-red-500/20"
            >
              View on TronScan <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

      </div>
    </motion.div>
  );
}

function DetailRow({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-neutral-900/50 border border-neutral-800/50">
      <span className="text-[10px] text-neutral-500 font-mono uppercase tracking-wider font-semibold">{label}</span>
      <div className="flex items-center text-left">
        {children}
      </div>
    </div>
  );
}

function CopyButton({ text, field, copiedField, onCopy }: { text: string, field: string, copiedField: string | null, onCopy: (t: string, f: string) => void }) {
  const isCopied = copiedField === field;
  return (
    <button 
      onClick={() => onCopy(text, field)}
      className="shrink-0 w-7 h-7 rounded bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
    >
      {isCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}
