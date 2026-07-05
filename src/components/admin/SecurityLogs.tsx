import React, { useState } from 'react';
import { ShieldAlert, LogIn, Monitor, ListOrdered, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

export function SecurityLogs() {
  const [activeTab, setActiveTab] = useState('alerts');

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6">
      <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 p-1 rounded-lg w-max">
        {[
          { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
          { id: 'logins', label: 'Failed Logins', icon: LogIn },
          { id: 'devices', label: 'Devices', icon: Monitor },
          { id: 'audit', label: 'Audit Timeline', icon: ListOrdered }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-md transition-all ${activeTab === t.id ? 'bg-neutral-800 text-white font-bold' : 'text-neutral-500 hover:text-white'}`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col gap-4 min-h-[400px]">
        {activeTab === 'alerts' && (
          <div className="flex flex-col gap-2">
            {[
              { title: 'Multiple failed login attempts', ip: '192.168.1.45', time: '10 mins ago', severity: 'high' },
              { title: 'Unusual token minting volume', ip: '10.0.0.12', time: '1 hour ago', severity: 'medium' }
            ].map((alert, i) => (
              <div key={i} className="flex items-start justify-between p-3 bg-neutral-950 border border-neutral-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 p-1.5 rounded-md ${alert.severity === 'high' ? 'bg-red-950 text-red-500' : 'bg-yellow-950 text-yellow-500'}`}>
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-white">{alert.title}</span>
                    <span className="text-[10px] text-neutral-500 font-mono">IP: {alert.ip}</span>
                  </div>
                </div>
                <span className="text-[9px] text-neutral-600 font-mono">{alert.time}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab !== 'alerts' && (
           <div className="flex-1 flex items-center justify-center text-center flex-col gap-2 text-neutral-500">
             <ShieldAlert className="w-8 h-8 opacity-30" />
             <span className="text-xs font-mono uppercase">Log View</span>
             <span className="text-[10px]">Showing mock data for {activeTab} view.</span>
           </div>
        )}
      </div>
    </motion.div>
  );
}
