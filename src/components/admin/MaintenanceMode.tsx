import React, { useState } from 'react';
import { Wrench, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

export function MaintenanceMode() {
  const [isEnabled, setIsEnabled] = useState(false);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col gap-6 text-center items-center">
        <div className={`p-4 rounded-full ${isEnabled ? 'bg-red-950/50 text-red-500' : 'bg-neutral-950 text-neutral-500'}`}>
          <Wrench className="w-12 h-12" />
        </div>
        
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-display font-bold text-white">Maintenance Mode</h3>
          <p className="text-xs text-neutral-400 font-mono max-w-sm">
            When enabled, all user access will be suspended. Only Super Admins can log in and interact with the platform.
          </p>
        </div>
        
        <div className="w-full flex flex-col gap-2 text-left mt-2">
          <label className="text-[10px] text-neutral-400 font-mono uppercase font-bold">Maintenance Message</label>
          <textarea 
            rows={3} 
            defaultValue="We are currently undergoing scheduled maintenance. Please check back later."
            className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs font-mono text-white focus:outline-none"
          />
        </div>

        <div className="w-full flex items-center justify-between p-4 bg-neutral-950 border border-neutral-800 rounded-lg mt-2">
          <div className="flex flex-col gap-1 text-left">
            <span className="text-xs font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
              Allow Admin Login
            </span>
            <span className="text-[9px] text-neutral-500 font-mono">Super Admins can bypass maintenance mode lock.</span>
          </div>
          <input type="checkbox" defaultChecked className="accent-red-500 scale-125" />
        </div>
        
        <button 
          onClick={() => setIsEnabled(!isEnabled)}
          className={`w-full mt-4 p-3 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all ${
            isEnabled 
              ? 'bg-neutral-800 hover:bg-neutral-700 text-white' 
              : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
        >
          {isEnabled ? 'Disable Maintenance Mode' : 'Enable Maintenance Mode'}
        </button>
      </div>
    </motion.div>
  );
}
