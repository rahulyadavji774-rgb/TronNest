import React, { useState } from 'react';
import { Settings, Save, Shield, Smartphone, Globe, Bell, Wallet, Coins, Activity, Lock } from 'lucide-react';
import { motion } from 'framer-motion';

export function SystemSettings() {
  const [activeSubTab, setActiveSubTab] = useState('general');

  const tabs = [
    { id: 'general', label: 'General', icon: Globe },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'token', label: 'Token', icon: Coins },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'transaction', label: 'Transaction', icon: Activity },
    { id: 'notification', label: 'Notification', icon: Bell },
    { id: 'appearance', label: 'Appearance', icon: Smartphone }
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-6 h-full">
      <div className="w-48 flex flex-col gap-1 border-r border-neutral-800 pr-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex items-center gap-2 p-2 rounded-lg text-xs font-mono transition-all ${activeSubTab === tab.id ? 'bg-red-950/30 text-red-400 border border-red-900/50' : 'text-neutral-400 hover:bg-neutral-900 hover:text-white'}`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>
      
      <div className="flex-1 bg-neutral-900/50 border border-neutral-800 rounded-xl p-6 overflow-y-auto">
        <h3 className="text-lg font-display font-bold text-white mb-6 capitalize flex items-center gap-2">
          {tabs.find(t => t.id === activeSubTab)?.icon({ className: 'w-5 h-5 text-red-500' })}
          {activeSubTab} Settings
        </h3>
        
        {/* Placeholder settings form based on selected tab */}
        <div className="flex flex-col gap-4 max-w-xl">
          {activeSubTab === 'general' && (
             <>
               <div className="flex flex-col gap-1.5">
                 <label className="text-[10px] text-neutral-400 font-mono uppercase font-bold">Platform Name</label>
                 <input type="text" defaultValue="TronNest" className="bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-xs font-mono text-white focus:outline-none focus:border-red-500/50" />
               </div>
               <div className="flex flex-col gap-1.5">
                 <label className="text-[10px] text-neutral-400 font-mono uppercase font-bold">Support Email</label>
                 <input type="email" defaultValue="support@tronnest.com" className="bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-xs font-mono text-white focus:outline-none focus:border-red-500/50" />
               </div>
             </>
          )}
          {activeSubTab === 'wallet' && (
             <>
               <div className="flex flex-col gap-1.5">
                 <label className="text-[10px] text-neutral-400 font-mono uppercase font-bold">Default Network</label>
                 <select className="bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-xs font-mono text-white focus:outline-none focus:border-red-500/50">
                   <option>TRON Mainnet</option>
                   <option>Nile Testnet</option>
                   <option>Shasta Testnet</option>
                 </select>
               </div>
               <div className="flex items-center justify-between p-3 bg-neutral-950 border border-neutral-800 rounded-lg">
                  <span className="text-[10px] text-neutral-400 font-mono uppercase font-bold">Allow Multi-Wallet Creation</span>
                  <input type="checkbox" defaultChecked className="accent-red-500" />
               </div>
             </>
          )}
          {activeSubTab === 'token' && (
             <>
               <div className="flex items-center justify-between p-3 bg-neutral-950 border border-neutral-800 rounded-lg">
                  <span className="text-[10px] text-neutral-400 font-mono uppercase font-bold">Enable Custom Token Creation</span>
                  <input type="checkbox" defaultChecked className="accent-red-500" />
               </div>
             </>
          )}
          {activeSubTab === 'security' && (
             <>
               <div className="flex items-center justify-between p-3 bg-neutral-950 border border-neutral-800 rounded-lg">
                  <span className="text-[10px] text-neutral-400 font-mono uppercase font-bold">Require 2FA for Admin Actions</span>
                  <input type="checkbox" defaultChecked className="accent-red-500" />
               </div>
               <div className="flex flex-col gap-1.5">
                 <label className="text-[10px] text-neutral-400 font-mono uppercase font-bold">Session Timeout (Minutes)</label>
                 <input type="number" defaultValue="30" className="bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-xs font-mono text-white focus:outline-none focus:border-red-500/50" />
               </div>
             </>
          )}
          
          <button className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-mono text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-colors">
            <Save className="w-4 h-4" /> Save {activeSubTab} Settings
          </button>
        </div>
      </div>
    </motion.div>
  );
}
