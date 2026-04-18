import React, { useState, useEffect } from 'react';
import { ShieldAlert, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const SystemAuditTrail = () => {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const fetchLogs = async () => {
      const { data, error } = await supabase
        .from('maintenance_logs')
        .select('*')
        .order('id', { ascending: false })
        .limit(10);
      
      if (data && !error) {
        setLogs(data);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  if (logs.length === 0) return null;

  return (
    <div className="relative">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-cyan-500/10 rounded-lg">
          <ShieldAlert size={20} className="text-cyan-400" />
        </div>
        <h2 className="text-sm font-black uppercase text-gray-500 tracking-widest text-[10px]">Audit Stream</h2>
        <div className="flex-grow border-b border-dashed border-white/10 ml-4"></div>
        <div className="flex items-center gap-2 text-[10px] text-cyan-500/70 font-mono font-bold">
          <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse"></span>
          LIVE SYNC
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {logs.map((log) => (
          <div key={log.id} className="bg-slate-900/60 border border-white/5 rounded-lg p-4 hover:border-cyan-500/30 transition-colors group">
            <div className="flex justify-between items-start mb-3">
              <span className="text-[10px] font-black tracking-widest uppercase text-gray-400 group-hover:text-cyan-400 transition-colors">
                {log.machine_id}
              </span>
              <span className={`text-[8px] px-2 py-0.5 rounded font-bold tracking-wider ${log.risk_level === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                {log.risk_level}
              </span>
            </div>
            
            <div className="mb-4">
              <div className="text-white font-mono text-xs font-bold leading-relaxed mb-1 items-start flex justify-between gap-2">
                <div className="flex gap-2 items-start">
                  <AlertCircle size={14} className={log.risk_level === 'CRITICAL' ? 'text-rose-500 shrink-0 mt-0.5' : 'text-amber-500 shrink-0 mt-0.5'} />
                  {log.issue_type}
                </div>
                {log.confidence !== undefined && (
                  <span className="text-[9px] text-cyan-400 bg-cyan-900/40 px-1.5 py-0.5 rounded border border-cyan-500/20 whitespace-nowrap hidden sm:inline-block">
                    {Math.round(log.confidence * 100)}% CONF
                  </span>
                )}
              </div>
              {log.reasoning && (
                <div className="text-[9px] text-gray-500 italic mt-1.5 mb-2 ml-[22px]">
                  "{log.reasoning}"
                </div>
              )}
            </div>

            <div className="flex justify-between items-center border-t border-white/5 pt-3 mt-2">
              <div className="flex items-center gap-1.5 text-[9px] text-gray-500 uppercase tracking-wider font-bold">
                <span className="text-cyan-600">TECH:</span> {log.technician_name}
              </div>
              <div className="flex items-center gap-1 text-[8px] text-gray-600 font-mono">
                <Clock size={10} /> {new Date(log.created_at || Date.now()).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SystemAuditTrail;
