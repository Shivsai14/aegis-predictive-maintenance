import React from 'react';
import { Clock, CheckCircle2, AlertTriangle, AlertOctagon, Power } from 'lucide-react';

const MaintenanceScheduleWidget = ({ fleetData }) => {
  return (
    <div className="flex flex-col gap-3">
      {Object.values(fleetData).map(machine => {
        const healthNumber = typeof machine.efficiency === 'number' ? machine.efficiency : (100 - machine.currentScore);
        const isOffline = machine.isOffline || machine.status === 'OFFLINE';

        let schedText = '72 Hours';
        let schedColor = 'text-cyan-400';
        let Icon = CheckCircle2;

        if (healthNumber < 70) {
          schedText = 'IMMEDIATE';
          schedColor = 'text-amber-500 animate-pulse';
          Icon = AlertOctagon;
        } else if (healthNumber <= 90) {
          schedText = '24 Hours';
          schedColor = 'text-amber-400';
          Icon = AlertTriangle;
        }
        if (isOffline) {
          schedText = 'OFFLINE';
          schedColor = 'text-gray-500';
          Icon = Power;
        }

        return (
          <div key={machine.machineId} className="flex justify-between items-center p-3 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 transition-colors">
             <div className="flex items-center gap-3">
                <Icon size={16} className={schedColor} />
                <div className="flex flex-col">
                  <span className="text-white font-mono font-bold tracking-widest uppercase">{machine.machineId}</span>
                  <span className="text-[9px] text-gray-500 uppercase tracking-widest">{machine.location || 'Sector 7'}</span>
                </div>
             </div>
             <div className="flex items-center gap-1.5 px-3 py-1 bg-black/40 rounded-full border border-white/10">
               <Clock size={12} className={schedColor} />
               <span className={`text-[10px] font-black uppercase tracking-widest ${schedColor}`}>{schedText}</span>
             </div>
          </div>
        )
      })}
    </div>
  )
}
export default MaintenanceScheduleWidget;
