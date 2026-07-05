import React from 'react';
import { Activity, Server, Database, Zap, Cpu, HardDrive } from 'lucide-react';
import { motion } from 'framer-motion';

export function SystemMonitor() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'CPU Usage', value: '12.4%', icon: Cpu, color: 'text-blue-500' },
          { label: 'RAM Usage', value: '4.2 GB / 8 GB', icon: Server, color: 'text-green-500' },
          { label: 'Storage Usage', value: '45.1%', icon: HardDrive, color: 'text-yellow-500' }
        ].map((stat, i) => (
          <div key={i} className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col gap-3">
            <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-mono uppercase font-bold">
              <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} /> {stat.label}
            </div>
            <div className="text-xl font-display font-black text-white">{stat.value}</div>
            <div className="w-full bg-neutral-950 rounded-full h-1.5 overflow-hidden">
              <div className="bg-neutral-700 h-full" style={{ width: stat.value.includes('%') ? stat.value : '50%' }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-display font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-red-500" />
            Service Status
          </h3>
          <div className="flex flex-col gap-2.5">
            {[
              { name: 'API Gateway', status: 'Operational' },
              { name: 'Database (Cloud SQL)', status: 'Operational' },
              { name: 'Wallet Service Engine', status: 'Operational' },
              { name: 'Token Minting Queue', status: 'Idle' },
              { name: 'Background Jobs', status: 'Running (3)' }
            ].map((svc, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-[10px] font-mono">
                <span className="text-neutral-400 font-bold">{svc.name}</span>
                <span className={`uppercase font-black ${svc.status.includes('Operational') ? 'text-green-500' : 'text-blue-500'}`}>
                  {svc.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-display font-bold text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-500" />
            Live Error Logs
          </h3>
          <div className="flex flex-col gap-2 overflow-y-auto max-h-[250px] pr-1">
            <div className="p-2 bg-neutral-950 border border-neutral-800 rounded text-[9px] font-mono text-neutral-500 text-center">
              No critical errors reported in the last 24 hours.
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
