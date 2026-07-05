import React from 'react';
import { KeyRound, RefreshCw, Trash2, Plus, Globe, Shield } from 'lucide-react';
import { motion } from 'framer-motion';

export function ApiManagement() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-display font-bold text-white">API Keys</h3>
        <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-xs font-mono font-bold flex items-center gap-2 transition-all">
          <Plus className="w-4 h-4" /> Generate New Key
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {[
          { name: 'Production App', keyStr: 'tn_live_9a8b7c6d5e4f3g2h1i0j...', lastUsed: '2 mins ago', permissions: 'Full Access' },
          { name: 'Testing Env', keyStr: 'tn_test_1a2b3c4d5e6f7g8h9i0j...', lastUsed: '5 days ago', permissions: 'Read Only' }
        ].map((apiKey, i) => (
          <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex items-center justify-between">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">{apiKey.name}</span>
                <span className="bg-red-950/30 text-red-400 border border-red-900/50 px-2 py-0.5 rounded text-[9px] font-mono uppercase">{apiKey.permissions}</span>
              </div>
              <div className="flex items-center gap-2 text-neutral-400 font-mono text-[10px]">
                <KeyRound className="w-3 h-3" />
                {apiKey.keyStr}
              </div>
              <span className="text-[9px] text-neutral-500 font-mono mt-1">Last used: {apiKey.lastUsed}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <button className="p-2 bg-neutral-950 border border-neutral-800 hover:bg-neutral-800 rounded-lg text-blue-400 transition-colors" title="Regenerate">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button className="p-2 bg-neutral-950 border border-neutral-800 hover:bg-neutral-800 rounded-lg text-red-500 transition-colors" title="Revoke">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-display font-bold text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-500" />
            Webhook Endpoints
          </h3>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between p-3 bg-neutral-950 border border-neutral-800 rounded-lg">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono text-white truncate max-w-[200px]">https://api.example.com/webhook</span>
                <span className="text-[8px] font-mono text-green-500 uppercase">Active</span>
              </div>
              <button className="text-neutral-500 hover:text-red-500 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <button className="w-full mt-2 p-2 rounded border border-neutral-800 border-dashed text-neutral-400 text-xs font-mono hover:bg-neutral-800 transition-colors flex items-center justify-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add Endpoint
            </button>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-display font-bold text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-yellow-500" />
            Rate Limits
          </h3>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[10px] font-mono font-bold text-neutral-400 uppercase">
                <span>Requests per minute</span>
                <span className="text-white">1000</span>
              </div>
              <input type="range" min="100" max="5000" defaultValue="1000" className="w-full accent-red-500" />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[10px] font-mono font-bold text-neutral-400 uppercase">
                <span>Burst Allowance</span>
                <span className="text-white">500</span>
              </div>
              <input type="range" min="50" max="1000" defaultValue="500" className="w-full accent-red-500" />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
