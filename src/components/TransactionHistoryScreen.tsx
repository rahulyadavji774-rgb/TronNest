import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Search, Filter, RefreshCw, Copy, Check, 
  ArrowUpRight, ArrowDownLeft, RefreshCcw, Activity, Shield, Hash
} from 'lucide-react';
import { Transaction, Token } from '../types';
import TransactionDetailsScreen from './TransactionDetailsScreen';

interface TransactionHistoryScreenProps {
  history: Transaction[];
  portfolio: { assets: Token[] } | null;
  marketData: any[];
  token: string;
  onClose: () => void;
}

export default function TransactionHistoryScreen({ 
  history, 
  portfolio, 
  marketData,
  token,
  onClose 
}: TransactionHistoryScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'in' | 'out'>('all');
  const [filterNetwork, setFilterNetwork] = useState<'all' | 'blockchain' | 'internal'>('all');
  const [showFilters, setShowFilters] = useState(false);
  
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedTokenInfo, setSelectedTokenInfo] = useState<{name: string; symbol: string; logoUrl: string} | null>(null);

  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [displayCount, setDisplayCount] = useState(20);

  const listRef = useRef<HTMLDivElement>(null);

  // Sorting
  const sortedHistory = [...history].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Filtering
  const filteredHistory = sortedHistory.filter((tx) => {
    // 1. Search
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      const matchHash = tx.tx_hash?.toLowerCase().includes(q) || tx.blockchain_tx_id?.toLowerCase().includes(q);
      const matchAddress = tx.counterparty?.toLowerCase().includes(q);
      const matchSymbol = tx.asset_symbol?.toLowerCase().includes(q);
      if (!matchHash && !matchAddress && !matchSymbol) return false;
    }

    // 2. Type Filter
    if (filterType !== 'all') {
      if (tx.direction !== filterType) return false;
    }

    // 3. Network Filter
    if (filterNetwork !== 'all') {
      if (tx.type !== filterNetwork) return false;
    }

    return true;
  });

  // Infinite Scroll
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      if (displayCount < filteredHistory.length) {
        setDisplayCount(prev => prev + 20);
      }
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    // Simulate refresh delay since we rely on Dashboard's history state
    // To do a real refresh, we'd need a callback to Dashboard, but 
    // the user wants this to be independent or we just simulate.
    // We'll simulate for 1s.
    await new Promise(r => setTimeout(r, 1000));
    setRefreshing(false);
  };

  const copyToClipboard = (text: string, type: 'hash' | 'address') => {
    navigator.clipboard.writeText(text);
    if (type === 'hash') {
      setCopiedHash(text);
      setTimeout(() => setCopiedHash(null), 2000);
    } else {
      setCopiedAddress(text);
      setTimeout(() => setCopiedAddress(null), 2000);
    }
  };

  const getTokenInfo = (symbol: string, tokenId?: string) => {
    // Attempt to match from portfolio first
    let asset = portfolio?.assets.find(a => (tokenId && a.id === tokenId) || (!tokenId && a.symbol === symbol));
    if (asset) return asset;
    
    // Then market data
    const mkt = marketData.find(m => (tokenId && m.id === tokenId) || (!tokenId && m.symbol === symbol));
    if (mkt) {
      return { logoUrl: mkt.logoUrl, name: mkt.name, symbol: mkt.symbol };
    }
    
    // Fallback
    return {
      logoUrl: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?q=80&w=200&auto=format&fit=crop',
      name: symbol,
      symbol: symbol
    };
  };

  const formatDate = (dateString: string) => {
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) {
        return { date: 'Unknown Date', time: 'Unknown Time' };
      }
      return {
        date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
        time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      };
    } catch(e) {
      return { date: 'Unknown Date', time: 'Unknown Time' };
    }
  };

  const truncateAddress = (addr: string) => {
    if (!addr) return '';
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-50 bg-black flex flex-col"
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
          <div>
            <h2 className="text-lg font-display font-bold text-white tracking-wide">Transaction History</h2>
            <p className="text-xs text-neutral-500 font-mono">
              {filteredHistory.length} {filteredHistory.length === 1 ? 'record' : 'records'}
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className={`w-10 h-10 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 active:scale-95 transition-all ${refreshing ? 'animate-spin' : ''}`}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Search & Filters */}
      <div className="px-6 py-4 border-b border-neutral-900 bg-black z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search hash, address, or symbol..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-xs font-mono text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-700 transition-all"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              showFilters || filterType !== 'all' || filterNetwork !== 'all' 
                ? 'bg-neutral-800 text-white' 
                : 'bg-neutral-900 text-neutral-400'
            }`}
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: 'auto', opacity: 1, marginTop: 16 }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-4">
                {/* Type Filter */}
                <div>
                  <label className="text-[10px] text-neutral-500 font-mono uppercase font-semibold mb-2 block">Direction</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFilterType('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${filterType === 'all' ? 'bg-white text-black' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'}`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setFilterType('in')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${filterType === 'in' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'}`}
                    >
                      Received
                    </button>
                    <button
                      onClick={() => setFilterType('out')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${filterType === 'out' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'}`}
                    >
                      Sent
                    </button>
                  </div>
                </div>

                {/* Network Filter */}
                <div>
                  <label className="text-[10px] text-neutral-500 font-mono uppercase font-semibold mb-2 block">Network</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFilterNetwork('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${filterNetwork === 'all' ? 'bg-white text-black' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'}`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setFilterNetwork('blockchain')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1 transition-all ${filterNetwork === 'blockchain' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'}`}
                    >
                      <Activity className="w-3 h-3" /> Blockchain
                    </button>
                    <button
                      onClick={() => setFilterNetwork('internal')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1 transition-all ${filterNetwork === 'internal' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'}`}
                    >
                      <Shield className="w-3 h-3" /> TronNest
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* List Container */}
      <div 
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-4 bg-neutral-950 pb-20"
      >
        {filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center mt-10">
            <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-700 mb-4">
              <Search className="w-6 h-6" />
            </div>
            <p className="text-sm font-display text-neutral-300">No transactions found</p>
            <p className="text-xs font-mono text-neutral-500 mt-1">Try adjusting your filters or search query.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredHistory.slice(0, displayCount).map((tx) => {
              const info = getTokenInfo(tx.asset_symbol, (tx as any).token_id);
              const { date, time } = formatDate(tx.created_at);
              const isOut = tx.direction === 'out';
              
              // Resolve counterparty if it's SYSTEM
              let cpDisplay = truncateAddress(tx.counterparty);
              if (tx.counterparty?.includes('SYSTEM')) {
                cpDisplay = tx.counterparty;
              }

              return (
                <div 
                  key={tx.id} 
                  onClick={() => {
                    setSelectedTransaction(tx);
                    setSelectedTokenInfo(info);
                  }}
                  className="p-4 rounded-xl bg-neutral-900/50 hover:bg-neutral-900 border border-neutral-800/50 hover:border-neutral-700/50 flex flex-col gap-3 cursor-pointer transition-all"
                >
                  {/* Top Row: Logo, Name, Amount */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-neutral-950 border border-neutral-800 flex items-center justify-center p-1 relative">
                        <img src={info.logoUrl} alt={info.name} className="w-full h-full object-contain rounded-full" referrerPolicy="no-referrer" />
                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center border-2 border-neutral-900 ${isOut ? 'bg-red-500' : 'bg-green-500'}`}>
                          {isOut ? <ArrowUpRight className="w-2.5 h-2.5 text-white" /> : <ArrowDownLeft className="w-2.5 h-2.5 text-white" />}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-display font-semibold text-white">{info.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-neutral-800 text-neutral-400 font-mono font-semibold">
                            {info.symbol}
                          </span>
                        </div>
                        <div className="text-[10px] text-neutral-500 font-mono mt-0.5 flex items-center gap-1">
                          {date} • {time}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-mono font-bold ${isOut ? 'text-white' : 'text-green-400'}`}>
                        {isOut ? '-' : '+'}{tx.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                      </span>
                      <div className="mt-0.5">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md uppercase font-mono font-semibold ${
                          tx.status === 'completed' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                          tx.status === 'failed' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                          'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                        }`}>
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="h-px w-full bg-neutral-800/50" />

                  {/* Bottom Row: Metadata & Actions */}
                  <div className="flex flex-col gap-2">
                    {/* Counterparty & Network */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-neutral-500 font-mono uppercase">
                          {isOut ? 'To:' : 'From:'}
                        </span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(tx.counterparty, 'address');
                          }}
                          className="flex items-center gap-1 text-[11px] font-mono text-neutral-300 hover:text-white transition-colors"
                        >
                          {cpDisplay}
                          {copiedAddress === tx.counterparty ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-neutral-600" />}
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        {tx.type === 'blockchain' ? (
                          <span className="text-[9px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded flex items-center gap-1 font-mono uppercase border border-blue-500/20">
                            <Activity className="w-2.5 h-2.5" /> Blockchain
                          </span>
                        ) : (
                          <span className="text-[9px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded flex items-center gap-1 font-mono uppercase border border-purple-500/20">
                            <Shield className="w-2.5 h-2.5" /> TronNest
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Hash if available */}
                    {(tx.tx_hash || tx.blockchain_tx_id) && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-neutral-500 font-mono uppercase">
                          Hash:
                        </span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(tx.tx_hash || tx.blockchain_tx_id || '', 'hash');
                          }}
                          className="flex items-center gap-1 text-[11px] font-mono text-neutral-400 hover:text-white transition-colors"
                        >
                          <Hash className="w-3 h-3 text-neutral-600" />
                          {truncateAddress(tx.tx_hash || tx.blockchain_tx_id || '')}
                          {copiedHash === (tx.tx_hash || tx.blockchain_tx_id) ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-neutral-600" />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            
            {displayCount < filteredHistory.length && (
              <div className="py-4 flex justify-center">
                <div className="w-6 h-6 border-2 border-neutral-800 border-t-neutral-400 rounded-full animate-spin" />
              </div>
            )}
            
            {displayCount >= filteredHistory.length && filteredHistory.length > 0 && (
              <div className="py-6 text-center">
                <span className="text-[10px] text-neutral-600 font-mono uppercase tracking-widest">End of History</span>
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedTransaction && selectedTokenInfo && (
          <TransactionDetailsScreen 
            transaction={selectedTransaction} 
            tokenInfo={selectedTokenInfo} 
            onClose={() => {
              setSelectedTransaction(null);
              setSelectedTokenInfo(null);
            }} 
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
