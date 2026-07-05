import React, { useState } from 'react';
import { BarChart2, Download, Calendar, Users, Coins, Activity, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

export function Reports() {
  const [reportType, setReportType] = useState('daily');

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 p-1 rounded-lg">
          {['daily', 'weekly', 'monthly'].map(t => (
            <button
              key={t}
              onClick={() => setReportType(t)}
              className={`px-3 py-1.5 text-xs font-mono capitalize rounded-md transition-all ${reportType === t ? 'bg-neutral-800 text-white font-bold' : 'text-neutral-500 hover:text-white'}`}
            >
              {t}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-neutral-300 text-[10px] font-mono font-bold rounded-lg transition-all">
            <Download className="w-3.5 h-3.5" /> PDF
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-neutral-300 text-[10px] font-mono font-bold rounded-lg transition-all">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-neutral-300 text-[10px] font-mono font-bold rounded-lg transition-all">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'User Growth', value: '+142', icon: Users, color: 'text-blue-500' },
          { label: 'Token Growth', value: '+3', icon: Coins, color: 'text-yellow-500' },
          { label: 'Wallet Growth', value: '+156', icon: Activity, color: 'text-green-500' },
          { label: 'Admin Activity', value: '89 actions', icon: TrendingUp, color: 'text-purple-500' }
        ].map((stat, i) => (
          <div key={i} className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-mono uppercase font-bold">
              <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} /> {stat.label}
            </div>
            <div className="text-xl font-display font-black text-white">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 min-h-[300px] flex items-center justify-center">
        <div className="text-center flex flex-col items-center gap-2 text-neutral-500">
          <BarChart2 className="w-8 h-8 opacity-50" />
          <span className="text-xs font-mono">Detailed chart visualization would render here</span>
          <span className="text-[10px]">Showing {reportType} aggregated statistics</span>
        </div>
      </div>
    </motion.div>
  );
}
