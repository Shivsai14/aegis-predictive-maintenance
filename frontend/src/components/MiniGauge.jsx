import React from 'react';
import GaugeComponent from 'react-gauge-component';

const MiniGauge = ({ title, value, min, max, isAlert }) => {
  if (value === undefined || value === null) return null;
  const safeVal = Math.min(max, Math.max(min, value));

  return (
    <div className={`flex flex-col items-center justify-center p-1.5 rounded-lg bg-black/40 border transition-all ${isAlert ? 'border-rose-500 shadow-[0_0_15px_rgba(255,0,0,0.3)] bg-rose-950/20' : 'border-white/5'}`}>
      <span className={`text-[7px] font-black uppercase tracking-widest mb-1 ${isAlert ? 'text-rose-500 animate-pulse' : 'text-cyan-400'}`}>{title}</span>
      <div className="w-16">
        <GaugeComponent
          type="semicircle"
          arc={{
            width: 0.15,
            padding: 0.02,
            cornerRadius: 1,
            subArcs: [
              { limit: max * 0.33, color: isAlert ? '#FF0000' : '#00FF00' },
              { limit: max * 0.66, color: isAlert ? '#FF0000' : '#FFFF00' },
              { limit: max, color: '#FF0000' }
            ]
          }}
          pointer={{
            color: '#ffffff',
            length: 0.8,
            width: 10,
            elastic: true,
          }}
          labels={{
            valueLabel: { style: { fontSize: '24px', fill: '#fff' } },
            tickLabels: { type: 'outer', ticks: [] } // Hide ticks for tiny size
          }}
          value={safeVal}
          minValue={min}
          maxValue={max}
        />
      </div>
    </div>
  );
};

export default MiniGauge;
