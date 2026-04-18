import React from 'react';
import { AlertCircle } from 'lucide-react';

const AlertBoard = ({ alerts, isAnomaly, machineId }) => {
  const displayAlerts = isAnomaly ? [
    { id: 'anomaly-mock', time: 'SYS', text: 'ANOMALY DETECTED: Significant setpoint gap identified. Operational efficiency dropping below threshold. Recommend early inspection.', isAnomalyWarning: true },
    ...alerts
  ] : alerts;

  return (
    <div className="flex flex-col gap-2 w-full">
      {displayAlerts.length === 0 ? (
        <div className="text-gray-600 font-mono text-[9px] uppercase tracking-widest text-center mt-4">
          No Active Anomaly Detected
        </div>
      ) : (
        displayAlerts.map((alert, i) => (
          <div key={alert.id || `${machineId}-alert-${i}`} className={`p-2 rounded border ${i === 0 && !alert.isAnomalyWarning ? 'border-rose-500/30 bg-rose-500/5' : alert.isAnomalyWarning ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/5 bg-white/5'} transition-all`}>
            <div className="flex items-start gap-2">
              <AlertCircle className={i === 0 && !alert.isAnomalyWarning ? 'text-rose-500' : alert.isAnomalyWarning ? 'text-amber-500' : 'text-gray-500'} size={12} />
              <p className="text-[10px] text-gray-300 leading-tight">
                <span className="text-[8px] text-gray-600 mr-2">{alert.time}</span>
                {alert.text}
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  );
};
export default AlertBoard;