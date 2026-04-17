import React from 'react';
import MetricChart from './MetricChart';
import RiskDial from './RiskDial';
import AlertBoard from './AlertBoard';
import { MapPin, Zap, FilePlus } from 'lucide-react';

const MachineCard = ({ data, onGenerateReport, isGenerating, onRemoteCommand }) => {
  const isCritical = data.currentScore >= 80;

  return (
    <div className={`relative rounded-xl p-4 border-2 h-[520px] flex flex-col bg-[#0a0c14] transition-all ${isCritical ? 'border-rose-500/50 shadow-[0_0_30px_rgba(244,63,94,0.2)]' : 'border-white/5'
      }`}>

      {/* 1. HEADER */}
      <div className="flex justify-between items-start mb-4 shrink-0">
        <div>
          <h2 className="text-sm font-black tracking-widest uppercase font-mono text-white leading-none">{data.machineId}</h2>
          <div className="flex items-center gap-1 text-gray-500 font-mono text-[8px] uppercase mt-1">
            <MapPin size={8} /> {data.location}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className={`text-[8px] font-black px-2 py-0.5 rounded border ${isCritical ? 'bg-rose-500 text-white' : 'text-emerald-500 border-emerald-500/50'}`}>
            {isCritical ? 'CRITICAL' : 'NOMINAL'}
          </div>
          <div className="text-[8px] font-mono text-emerald-500">{data.efficiency}% EFF</div>
        </div>
      </div>

      {/* 2. VISUALS - Shifted Left and Up to show all labels (0, 80, 100) */}
      <div className="grid grid-cols-2 gap-3 h-40 shrink-0 mb-6">
        <div className="bg-white/[0.02] rounded-lg border border-white/5 relative overflow-hidden flex items-center justify-center">
          {/* -mt-10 pulls it UP, -ml-5 pulls it LEFT, scale-110 keeps it clear */}
          <div className="transform scale-110 -mt-10 -ml-5">
            <RiskDial score={data.currentScore} rul={data.rul} />
          </div>
        </div>
        <div className="bg-white/[0.02] rounded-lg border border-white/5 relative overflow-hidden">
          <MetricChart
            title=""
            data={data.history}
            dataKey="temperature"
            color={isCritical ? "#f43f5e" : "#22d3ee"}
            unit="°C"
            isMini={true}
          />
        </div>
      </div>

      {/* 3. DIAGNOSTICS */}
      <div className="flex-grow bg-black/40 rounded-lg p-3 border border-white/5 overflow-hidden mb-20">
        <div className="flex justify-between items-center mb-2 border-b border-white/5 pb-1">
          <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Diagnostics Feed</span>
          <button
            onClick={() => onGenerateReport(data.machineId)}
            disabled={isGenerating}
            className="text-[8px] text-cyan-400 font-bold flex items-center gap-1 hover:text-cyan-300 transition-colors"
          >
            <FilePlus size={10} /> Ticket
          </button>
        </div>
        <div className="h-full overflow-y-auto custom-scrollbar pb-8">
          <AlertBoard alerts={data.alerts} />
        </div>
      </div>

      {/* 4. FOOTER */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-[#0a0c14] border-t border-white/10 rounded-b-xl">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onRemoteCommand(data.machineId, 'KILL')}
            className="py-2.5 bg-rose-500/10 hover:bg-rose-600 border border-rose-500/20 text-rose-500 hover:text-white text-[9px] font-black uppercase rounded transition-all shadow-lg"
          >
            Kill Switch
          </button>
          <button
            onClick={() => onRemoteCommand(data.machineId, 'LIMIT_RPM')}
            className="py-2.5 bg-amber-500/10 hover:bg-amber-600 border border-amber-500/20 text-amber-500 hover:text-white text-[9px] font-black uppercase rounded transition-all shadow-lg"
          >
            AI Throttle
          </button>
        </div>
      </div>
    </div>
  );
};

export default MachineCard;