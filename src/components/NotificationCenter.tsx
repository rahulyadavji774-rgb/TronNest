import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, X, Trash2, CheckCircle2, Volume2, VolumeX, RefreshCw, 
  ArrowDownLeft, ArrowUpRight, AlertCircle, Sparkles, Check
} from 'lucide-react';

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  refreshData: () => Promise<void>;
  refreshing: boolean;
}

export function NotificationCenter({
  isOpen,
  onClose,
  token,
  notifications,
  setNotifications,
  refreshData,
  refreshing
}: NotificationCenterProps) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [silentMode, setSilentMode] = useState<boolean>(false);
  const [pullY, setPullY] = useState(0);

  // Load silent mode and offline cache on mount
  useEffect(() => {
    const isSilent = localStorage.getItem('nest_silent_mode') === 'true';
    setSilentMode(isSilent);

    // Initial cache check
    const cachedNotifs = localStorage.getItem('nest_notifications_cache');
    if (cachedNotifs && notifications.length === 0) {
      try {
        setNotifications(JSON.parse(cachedNotifs));
      } catch (_) {}
    }
  }, []);

  // Sync cache with current state
  useEffect(() => {
    if (notifications.length > 0) {
      localStorage.setItem('nest_notifications_cache', JSON.stringify(notifications));
    }
  }, [notifications]);

  const handleToggleSilent = () => {
    const nextVal = !silentMode;
    setSilentMode(nextVal);
    localStorage.setItem('nest_silent_mode', String(nextVal));
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      // Optimistic update
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));

      const res = await fetch(`/api/wallet/notifications/${id}/read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error('API failed');
    } catch (err) {
      // Revert on failure
      refreshData();
    }
  };

  const handleDeleteNotification = async (id: string) => {
    try {
      // Optimistic update
      setNotifications(prev => prev.filter(n => n.id !== id));

      const res = await fetch(`/api/wallet/notifications/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('API failed');
    } catch (err) {
      refreshData();
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      const res = await fetch('/api/wallet/notifications/read', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error('API failed');
    } catch (err) {
      refreshData();
    }
  };

  const getIcon = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes('receive') || t.includes('incoming')) {
      return <ArrowDownLeft className="w-4 h-4 text-green-500" />;
    }
    if (t.includes('sent') || t.includes('outgoing') || t.includes('transfer')) {
      return <ArrowUpRight className="w-4 h-4 text-blue-500" />;
    }
    if (t.includes('fail') || t.includes('revert') || t.includes('error')) {
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
    if (t.includes('announce') || t.includes('welcome') || t.includes('nest')) {
      return <Sparkles className="w-4 h-4 text-yellow-500" />;
    }
    return <Bell className="w-4 h-4 text-red-500" />;
  };

  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.is_read;
    return true;
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 180 }}
          className="absolute inset-0 z-40 bg-[#090909] flex flex-col justify-between"
          id="notification-center-drawer"
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-neutral-900 flex items-center justify-between bg-neutral-950/50">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Bell className="w-5 h-5 text-red-500" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-600 rounded-full border border-black flex items-center justify-center text-[7px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div>
                <h2 className="text-sm font-display font-bold text-white tracking-tight">Notification Center</h2>
                <p className="text-[10px] text-neutral-500 font-mono uppercase mt-0.5">Secure Alerts & Announcements</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Silent Mode Switch */}
              <button
                onClick={handleToggleSilent}
                className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
                  silentMode 
                    ? 'bg-amber-950/10 border-amber-900/30 text-amber-500' 
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                }`}
                title={silentMode ? 'Silent Mode On' : 'Silent Mode Off'}
              >
                {silentMode ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <button 
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white active:scale-95 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Drag to Pull to Refresh Area */}
          <div className="flex-1 overflow-hidden flex flex-col relative">
            
            {/* Filter Selector & Mark All Read */}
            <div className="px-6 py-3 border-b border-neutral-900 bg-neutral-950/20 flex items-center justify-between">
              <div className="flex gap-1.5 bg-neutral-950 border border-neutral-900 p-0.5 rounded-xl">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-display font-semibold uppercase tracking-wider transition-all ${
                    filter === 'all'
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter('unread')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-display font-semibold uppercase tracking-wider transition-all ${
                    filter === 'unread'
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  Unread ({unreadCount})
                </button>
              </div>

              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-[10px] font-mono text-red-500 hover:text-red-400 font-bold uppercase flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Mark All Read
                </button>
              )}
            </div>

            {/* Pull to Refresh Indicator */}
            {refreshing && (
              <div className="absolute top-2 left-0 right-0 flex justify-center z-10">
                <div className="flex items-center gap-1.5 bg-neutral-950 border border-neutral-900 py-1.5 px-3 rounded-full text-[10px] text-neutral-400 font-mono shadow-md">
                  <RefreshCw className="w-3.5 h-3.5 text-red-500 animate-spin" />
                  Refreshing logs...
                </div>
              </div>
            )}

            {/* List container supporting Motion drag-pull */}
            <motion.div 
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.5}
              onDrag={(e, info) => {
                setPullY(info.offset.y);
              }}
              onDragEnd={(e, info) => {
                if (info.offset.y > 60) {
                  refreshData();
                }
                setPullY(0);
              }}
              className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3"
            >
              {/* Dynamic visual hint when pulling */}
              {pullY > 15 && (
                <div 
                  className="flex justify-center items-center gap-1.5 text-neutral-500 text-[10px] font-mono py-2 transition-all"
                  style={{ opacity: Math.min(pullY / 60, 1) }}
                >
                  <ArrowDownLeft className="w-3.5 h-3.5 text-red-500" />
                  {pullY > 55 ? 'Release to Sync Blockchain' : 'Pull to Refresh'}
                </div>
              )}

              {filtered.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 px-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-neutral-950 border border-neutral-900 flex items-center justify-center text-neutral-600 mb-4 shadow-inner">
                    <Bell className="w-5 h-5 text-neutral-600" />
                  </div>
                  <h3 className="text-xs font-display font-bold text-white uppercase tracking-wider">No alerts found</h3>
                  <p className="text-[10px] text-neutral-500 max-w-xs mt-1.5 leading-relaxed font-sans">
                    You do not have any {filter === 'unread' ? 'unread' : ''} messages or transaction notifications. Pull down to query live status.
                  </p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {filtered.map(n => (
                    <motion.div 
                      key={n.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, x: -50 }}
                      className={`p-4 rounded-2xl border transition-all relative flex gap-4 ${
                        n.is_read 
                          ? 'bg-neutral-950/40 border-neutral-900/60 text-neutral-400' 
                          : 'bg-neutral-950 border-neutral-850 text-white shadow-[0_4px_12px_rgba(239,68,68,0.02)]'
                      }`}
                    >
                      {/* Left icon wrapper */}
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        n.is_read 
                          ? 'bg-neutral-900 border-neutral-850/40 text-neutral-500' 
                          : 'bg-neutral-900 border-neutral-800 text-white'
                      }`}>
                        {getIcon(n.title)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-display font-bold truncate block ${
                            n.is_read ? 'text-neutral-400' : 'text-white'
                          }`}>
                            {n.title}
                          </span>
                          {!n.is_read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                          )}
                        </div>
                        <p className={`text-[11px] leading-relaxed font-sans mt-1 pr-1 break-words ${
                          n.is_read ? 'text-neutral-500' : 'text-neutral-300'
                        }`}>
                          {n.message}
                        </p>
                        
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[9px] text-neutral-600 font-mono">
                            {new Date(n.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="absolute top-3 right-3 flex items-center gap-1">
                        {!n.is_read && (
                          <button
                            onClick={() => handleMarkAsRead(n.id)}
                            className="w-7 h-7 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-green-500 transition-all hover:scale-105"
                            title="Mark as read"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteNotification(n.id)}
                          className="w-7 h-7 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-red-500 transition-all hover:scale-105"
                          title="Delete notification"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
