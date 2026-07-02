import React, { useState, useEffect } from 'react';
import { Wifi, Battery, ShieldAlert, Cpu } from 'lucide-react';

export default function AndroidHeader() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-between px-6 pt-[calc(8px+env(safe-area-inset-top,0px))] pb-2.5 bg-black/60 backdrop-blur-md border-b border-white/5 select-none text-[11px] font-mono font-medium tracking-tight text-neutral-400">
      <div className="flex items-center gap-1.5">
        <span className="text-white font-semibold">{time}</span>
        <span className="text-[9px] px-1 bg-red-950 text-red-500 rounded border border-red-900/50 flex items-center gap-0.5">
          <Cpu className="w-2.5 h-2.5" />
          NILE
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5">
          <div className="w-1 h-2 bg-red-500 rounded-xs"></div>
          <div className="w-1 h-3 bg-red-500 rounded-xs"></div>
          <div className="w-1 h-4 bg-red-500 rounded-xs"></div>
          <div className="w-1 h-5 bg-red-500 rounded-xs"></div>
        </div>
        <Wifi className="w-3.5 h-3.5 text-neutral-400" />
        <div className="flex items-center gap-1">
          <span className="text-[10px]">98%</span>
          <Battery className="w-4 h-4 text-red-500" />
        </div>
      </div>
    </div>
  );
}
