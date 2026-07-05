import React, { useState } from 'react';
import { Send, Clock, Trash2, Edit, Users, Radio, History } from 'lucide-react';
import { motion } from 'framer-motion';

export function BroadcastCenter() {
  const [targetType, setTargetType] = useState('all');

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-display font-bold text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-red-500" />
            New Broadcast
          </h3>
          
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-neutral-400 font-mono uppercase font-bold">Target Audience</label>
            <select 
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-xs font-mono text-white focus:outline-none"
            >
              <option value="all">All Users</option>
              <option value="active">Active Users Only</option>
              <option value="specific">Specific Wallets</option>
            </select>
          </div>
          
          {targetType === 'specific' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-neutral-400 font-mono uppercase font-bold">Wallet Addresses (comma separated)</label>
              <textarea rows={2} className="bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-xs font-mono text-white focus:outline-none" />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-neutral-400 font-mono uppercase font-bold">Message Title</label>
            <input type="text" placeholder="System Update" className="bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-xs font-mono text-white focus:outline-none" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-neutral-400 font-mono uppercase font-bold">Message Body</label>
            <textarea rows={4} placeholder="Type your broadcast message here..." className="bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-xs font-mono text-white focus:outline-none" />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button className="flex-1 bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all">
              <Send className="w-4 h-4" /> Send Now
            </button>
            <button className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 p-2 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all">
              <Clock className="w-4 h-4" /> Schedule
            </button>
            <button className="px-3 bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-neutral-400 p-2 rounded-lg text-xs font-mono font-bold flex items-center justify-center transition-all">
              Draft
            </button>
          </div>
        </div>
        
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-display font-bold text-white flex items-center gap-2">
            <History className="w-4 h-4 text-neutral-500" />
            Broadcast History
          </h3>
          
          <div className="flex flex-col gap-2 overflow-y-auto max-h-[400px] pr-1">
            {[1, 2, 3].map(i => (
              <div key={i} className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">System Maintenance v{i}.0</span>
                  <span className="text-[9px] text-neutral-500 font-mono uppercase bg-neutral-900 px-1.5 py-0.5 rounded">Sent</span>
                </div>
                <p className="text-[10px] text-neutral-400 truncate">Scheduled maintenance will occur on...</p>
                <div className="flex items-center justify-between mt-1 text-[9px] text-neutral-500 font-mono">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> All Users</span>
                  <span>{new Date().toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
