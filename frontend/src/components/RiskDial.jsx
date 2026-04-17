import React from 'react';
import GaugeComponent from 'react-gauge-component';

const RiskDial = ({ score, rul }) => {
  return (
    <div className="w-full h-full bg-transparent flex flex-col items-center justify-center">
      <div className="w-full flex justify-between items-start mb-6">
        <div>
          <h2 className="text-gray-400 text-sm font-semibold tracking-wider uppercase">System Risk Score</h2>
        </div>
        <div className="text-right">
          <div className="text-gray-400 text-xs font-semibold tracking-wider uppercase mb-1">Time to Failure</div>
          <div className={`font-mono text-sm font-bold tracking-widest transition-all duration-300 ease-in-out ${score >= 80 ? 'text-aegis-magenta neon-text-magenta animate-pulse' : score >= 60 ? 'text-aegis-yellow animate-breathe' : 'text-aegis-cyan'}`}>
            {rul}
          </div>
        </div>
      </div>

      <div className="w-full max-w-[250px] mt-6">
        <GaugeComponent
          type="semicircle"
          arc={{
            width: 0.2,
            padding: 0.01,
            cornerRadius: 1,
            subArcs: [
              { limit: 20, color: '#00ff66', showTick: true },
              { limit: 50, color: '#00f3ff', showTick: true },
              { limit: 80, color: '#ffbb00', showTick: true },
              { limit: 100, color: '#ff003c', showTick: true },
            ]
          }}
          pointer={{
            color: '#ffffff',
            length: 0.80,
            width: 15,
            elastic: true,
          }}
          labels={{
            valueLabel: { formatTextValue: value => value.toFixed(0) + '/100', style: { fill: '#fff', textShadow: '0 0 10px rgba(255,255,255,0.3)' } },
            tickLabels: {
              type: 'outer',
              valueConfig: { formatTextValue: value => value + '%', fontSize: 10 },
              ticks: [
                { value: 20 },
                { value: 50 },
                { value: 80 }
              ],
            }
          }}
          value={score}
          minValue={0}
          maxValue={100}
        />
      </div>

      <div className="mt-4 text-center">
        <div className={`text-xl font-black tracking-widest uppercase transition-all duration-300 ease-in-out ${score >= 80 ? 'text-aegis-magenta neon-text-magenta' : score >= 60 ? 'text-aegis-yellow animate-breathe' : 'text-aegis-cyan'}`}>
          {score < 20 ? 'Nominal' : score < 60 ? 'Elevated' : score < 80 ? 'Warning' : 'Critical'}
        </div>
      </div>
    </div>
  );
};

export default RiskDial;
