import React from 'react';
import { Phone, Users } from 'lucide-react';

const SafetyLeadWidget = ({ activeTechnicians }) => {
  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-4 pb-2 border-b border-white/10">
        <div className="p-1.5 bg-cyan-500/10 rounded-lg">
          <Users className="text-cyan-400" size={18} />
        </div>
        <h3 className="text-xs font-black uppercase text-cyan-400 tracking-widest">Safety Personnel On-Call</h3>
      </div>

      <div className="flex flex-col gap-2 max-h-48 overflow-y-auto custom-scrollbar">
        {activeTechnicians.length === 0 ? (
          <div className="text-[10px] text-gray-500 font-mono italic p-2 text-center">
            No active technicians detected.
          </div>
        ) : (
          activeTechnicians.map((tech) => (
            <div key={tech.id} className="flex flex-col bg-white/5 border border-white/5 p-2.5 rounded-lg gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-200">{tech.name}</span>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-[8px] text-emerald-400 font-bold tracking-widest uppercase">Active</span>
                </div>
              </div>
              <button 
                onClick={() => alert(`Calling ${tech.name} at ${tech.phone_number}...`)}
                className="w-full flex items-center justify-center gap-2 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded text-cyan-400 text-[10px] font-bold uppercase transition-all"
              >
                <Phone size={12} /> Call {tech.phone_number}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SafetyLeadWidget;
