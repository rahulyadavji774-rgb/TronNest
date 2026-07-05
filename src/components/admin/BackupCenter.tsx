import React from 'react';
import { Database, Download, RefreshCw, Trash2, Clock, Save } from 'lucide-react';
import { motion } from 'framer-motion';

export function BackupCenter() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6">
      <div className="flex gap-4">
        <button className="flex-1 bg-red-600 hover:bg-red-700 text-white p-3 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all">
          <Save className="w-4 h-4" /> Create Manual Backup
        </button>
        <button className="flex-1 bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-neutral-300 p-3 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all">
          <Clock className="w-4 h-4" /> Schedule Automated Backups
        </button>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col gap-4">
        <h3 className="text-sm font-display font-bold text-white flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-500" />
          Backup History
        </h3>
        
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center justify-between p-3 bg-neutral-950 border border-neutral-800 rounded-lg">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-white">System Backup v{i}.0</span>
                <span className="text-[10px] text-neutral-500 font-mono">Size: {(12.4 + i).toFixed(1)} MB • {new Date(Date.now() - i * 86400000).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-2 bg-neutral-900 hover:bg-neutral-800 rounded text-blue-400 transition-colors" title="Restore">
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button className="p-2 bg-neutral-900 hover:bg-neutral-800 rounded text-green-400 transition-colors" title="Download">
                  <Download className="w-4 h-4" />
                </button>
                <button className="p-2 bg-neutral-900 hover:bg-neutral-800 rounded text-red-500 transition-colors" title="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
