import React, { useState } from 'react';
import MetricChart from './MetricChart';
import AlertBoard from './AlertBoard';
import { MapPin, Zap, FilePlus, ShieldAlert, Power, Activity, Clock } from 'lucide-react';
import GaugeComponent from 'react-gauge-component';
import { supabase } from '../lib/supabaseClient';

const MachineCard = ({ data, onGenerateReport, isGenerating, handleKillSwitch, handleInitialize }) => {
  const isCritical = data.currentScore >= 80;
  const isAnomaly = !isCritical && data.efficiency < 85;
  const isOffline = data.isOffline || data.status === 'OFFLINE';

  const healthNumber = typeof data.efficiency === 'number' ? data.efficiency : (100 - data.currentScore);
  let schedText = '72 Hours';
  let schedColor = 'text-cyan-400';
  if (healthNumber < 70) {
    schedText = 'IMMEDIATE';
    schedColor = 'text-amber-500 animate-pulse';
  } else if (healthNumber <= 90) {
    schedText = '24 Hours';
    schedColor = 'text-amber-400';
  }
  if (isOffline) {
    schedText = 'OFFLINE';
    schedColor = 'text-gray-500';
  }

  // Malendau mapping: Target is usually a fixed baseline, Actual is from the stream
  const setpointGap = data.targetOutput && data.actualOutput !== undefined ?
    Math.abs(data.targetOutput - data.actualOutput) : 0;

  const alertText = data.alerts && data.alerts.length > 0 ? data.alerts[0].text.toLowerCase() : "";
  const hasAlert = isCritical || isAnomaly;
  
  const alertTemp = alertText.includes('therm') || alertText.includes('temp') || alertText.includes('spike');
  const alertVib = alertText.includes('vib') || alertText.includes('bearing') || alertText.includes('harmonic');
  const alertRPM = alertText.includes('rpm') || alertText.includes('speed') || alertText.includes('torque') || alertText.includes('rotat');

  const fallbackAll = hasAlert && !alertTemp && !alertVib && !alertRPM;
  
  let rootCause = "General Sensor Deviation";
  if (alertTemp) rootCause = "Thermal Runaway";
  else if (alertVib) rootCause = "Bearing Friction / Harmonic Variance";
  else if (alertRPM) rootCause = "Drive Motor Desync";
  
  const showTemp = !hasAlert || alertTemp || fallbackAll;
  const showVib = !hasAlert || alertVib || fallbackAll;
  const showRPM = !hasAlert || alertRPM || fallbackAll;

  let activeChartKey = "temperature_C";
  let activeChartColor = "#00FFFF";
  let activeChartUnit = "°C";
  let activeChartTitle = "Thermal Trend";

  if (hasAlert) {
    activeChartColor = "#FF0000";
    if (alertVib && !alertTemp) {
      activeChartKey = "vibration_mm_s";
      activeChartUnit = "mm/s";
      activeChartTitle = "Vibration Trend";
    } else if (alertRPM && !alertTemp) {
      activeChartKey = "rpm";
      activeChartUnit = "RPM";
      activeChartTitle = "Rotational Trend";
    }
  } else if (isOffline) {
    activeChartColor = "#334155";
  }

  let borderStyle = 'border-white/10';
  if (isOffline) borderStyle = 'border-white/5 grayscale-[0.5]';
  else if (isCritical) borderStyle = 'alert-pulse border-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.2)]';
  else if (isAnomaly) borderStyle = 'border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.2)]';

  return (
    <div className={`relative rounded-xl p-4 border min-h-[540px] flex-1 flex flex-col backdrop-blur-md transition-all duration-500 ${isOffline ? 'bg-black/80' : 'bg-black/40'} ${borderStyle}`}>

      {/* 1. HEADER */}
      <div className="flex justify-between items-start mb-4 shrink-0">
        <div>
          <h2 className="text-sm font-black tracking-widest uppercase font-mono text-white leading-none">
            {data.machineId}
          </h2>
          <div className="flex items-center gap-1 text-gray-500 font-mono text-[8px] uppercase mt-1">
            <MapPin size={8} /> {data.location || 'Sector 7'}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className={`text-[8px] font-black px-2 py-0.5 rounded border transition-colors ${isOffline ? 'bg-gray-800 text-gray-400 border-white/10' :
            isCritical ? 'bg-rose-500 text-white border-rose-400' :
              isAnomaly ? 'bg-amber-500 text-black border-amber-400' :
                'bg-emerald-500/10 text-emerald-500 border-emerald-500/50'
            }`}>
            {isOffline ? 'OFFLINE' : isCritical ? 'CRITICAL' : isAnomaly ? 'ANOMALY' : 'NOMINAL'}
          </div>
          {!isOffline && <div className="text-[8px] font-mono text-emerald-500 animate-pulse">{data.efficiency}% EFF</div>}
        </div>
      </div>

      {/* POWER WARNING OVERLAY */}
      {isOffline && (
        <div className="absolute top-16 left-0 right-0 bottom-16 z-30 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center border-y border-rose-500/10">
          <Power size={32} className="text-gray-500 mb-4 animate-pulse opacity-50" />
          <span className="text-xl font-black uppercase tracking-[0.3em] text-gray-500 opacity-80 text-center">System<br/>Powered Down</span>
          <span className="text-[9px] text-gray-600 font-mono mt-4 tracking-widest uppercase">Awaiting Initialization Sequence</span>
        </div>
      )}

      {/* 2. VISUALS - Monitoring Array */}
      <div className="grid grid-cols-2 gap-3 h-44 shrink-0 mb-4">
        {/* Risk Score Gauge & Health Stats */}
        <div className="bg-white/[0.02] rounded-lg border border-white/5 relative flex flex-col items-center justify-center overflow-hidden w-full h-[190px]">
          <div className="w-[180px] mt-4 z-10 flex-shrink-0">
             <GaugeComponent
                type="semicircle"
                arc={{
                  width: 0.15,
                  padding: 0.02,
                  cornerRadius: 1,
                  subArcs: [
                    { limit: 33, color: '#00FF00' },
                    { limit: 66, color: '#FFFF00' },
                    { limit: 100, color: '#FF0000' }
                  ]
                }}
                pointer={{
                  color: '#ffffff',
                  length: 0.70,
                  width: 12,
                  elastic: true,
                }}
                labels={{
                  valueLabel: { style: { fontSize: '24px', fill: '#fff', textShadow: '0 0 10px rgba(255,255,255,0.3)' } },
                  tickLabels: { type: 'outer', valueConfig: { formatTextValue: value => value, fontSize: 8 }, ticks: [{ value: 33 }, { value: 66 }] }
                }}
                value={Math.min(100, Math.max(0, isOffline ? 0 : data.currentScore))}
                minValue={0}
                maxValue={100}
              />
          </div>
          <div className="mt-1 pb-4 flex flex-col items-center justify-center w-full z-20">
             <span className="text-[7px] text-gray-500 font-bold uppercase tracking-widest leading-none mb-1">Overall Risk</span>
             <div className="flex items-center gap-1.5 px-3 py-1 bg-black/40 border border-white/5 rounded backdrop-blur max-w-max mx-auto shadow-lg">
                <Activity size={10} className={isCritical ? "text-rose-500 animate-pulse" : "text-cyan-400"} />
                <span className="text-[9px] font-black tracking-widest uppercase text-white leading-none">
                  {isOffline ? 0 : data.efficiency || (100 - data.currentScore).toFixed(0)}% HEALTH
                </span>
             </div>
          </div>
        </div>

        {/* The Triple Stack - Telemetry Charts */}
        <div className="flex flex-col gap-1.5 h-full relative overflow-hidden">
          
          <div className="bg-white/[0.02] rounded-lg border border-white/5 overflow-hidden flex-[0.8] p-1 flex flex-col relative relative group">
            <span className={`absolute top-1.5 left-2 text-[6px] font-black uppercase tracking-widest z-10 ${(hasAlert && alertRPM && !isOffline) ? 'text-rose-500' : 'text-gray-500'}`}>RPM</span>
            <MetricChart 
              title="RPM" 
              data={data.history} 
              dataKey="rpm" 
              color={isOffline ? "#334155" : (hasAlert && alertRPM) ? "#FF0000" : "#00FFFF"} 
              unit="RPM" 
              fallbackValue={data.rpm} 
              minimal={true} 
            />
          </div>

          <div className="bg-white/[0.02] rounded-lg border border-white/5 overflow-hidden flex-[1.4] p-2 flex flex-col relative">
            <MetricChart 
              title="Thermal Trend" 
              data={data.history} 
              dataKey="temperature_C" 
              color={isOffline ? "#334155" : (hasAlert && alertTemp) ? "#FF0000" : "#00FFFF"} 
              unit="°C" 
              fallbackValue={data.temperature_C} 
              minimal={false} 
            />
          </div>

          <div className="bg-white/[0.02] rounded-lg border border-white/5 overflow-hidden flex-[0.8] p-1 flex flex-col relative group">
             <span className={`absolute top-1.5 left-2 text-[6px] font-black uppercase tracking-widest z-10 ${(hasAlert && alertVib && !isOffline) ? 'text-rose-500' : 'text-gray-500'}`}>VIB</span>
            <MetricChart 
              title="Vibration" 
              data={data.history} 
              dataKey="vibration_mm_s" 
              color={isOffline ? "#334155" : (hasAlert && alertVib) ? "#FF0000" : "#00FFFF"} 
              unit="mm/s" 
              fallbackValue={data.vibration_mm_s} 
              minimal={true} 
            />
          </div>

        </div>
      </div>

      {/* SCHEDULED MAINTENANCE BAR */}
      <div className="flex justify-between items-center bg-black/40 border border-white/5 p-2 rounded mb-4 shrink-0 mx-4">
         <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
           <Clock size={12} className="text-gray-500" /> Next Scheduled Service
         </span>
         <span className={`text-[10px] font-black tracking-widest uppercase ${schedColor}`}>{schedText}</span>
      </div>

      {/* 3. DIAGNOSTICS & TICKETING */}
      <div className="flex-grow bg-black/40 rounded-lg p-3 border border-white/5 overflow-hidden mb-20 relative flex flex-col">
        <div className="flex justify-between items-center mb-2 border-b border-white/5 pb-1">
          <div className="flex items-center gap-1.5">
            <ShieldAlert size={10} className={isCritical ? 'text-rose-500' : 'text-gray-500'} />
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">AI Audit Log</span>
          </div>
          <button
            onClick={() => onGenerateReport(data.machineId)}
            disabled={isGenerating || isOffline}
            className="text-[8px] bg-cyan-500/10 px-2 py-1 rounded text-cyan-400 font-bold flex items-center gap-1 hover:bg-cyan-500 hover:text-black hover:scale-105 transition-all disabled:opacity-30 disabled:scale-100 disabled:hover:bg-cyan-500/10 disabled:hover:text-cyan-400"
          >
            <FilePlus size={10} /> Generate Ticket
          </button>
        </div>
        <div className="h-full overflow-y-auto custom-scrollbar">
          {isOffline ? (
            <div className="flex flex-col items-center justify-center h-full opacity-30">
              <Power size={24} className="mb-2" />
              <span className="text-[8px] uppercase tracking-tighter">System Powered Down</span>
            </div>
          ) : hasAlert ? (
            <div className="flex flex-col gap-2 p-1 mt-1">
              <div className="text-center pb-3 mb-2 border-b border-white/5 bg-rose-500/5 rounded p-2">
                <span className="text-[8px] text-rose-500/70 font-bold tracking-widest uppercase">Root Cause Identified</span>
                <div className="text-[10px] text-rose-500 font-black tracking-widest uppercase mt-0.5">{rootCause}</div>
              </div>
              <div className="flex flex-col gap-3 relative pl-4 mt-2">
                {/* Connecting Line */}
                <div className="absolute left-[20px] top-3 bottom-4 w-px bg-white/10" />
                
                <div className="flex items-center gap-3 relative">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 border justify-center items-center flex border-emerald-500/50 z-10 shadow-[0_0_10px_rgba(16,185,129,0.3)]"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /></div>
                  <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest">Detection</span>
                </div>
                <div className="flex items-center gap-3 relative">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 border justify-center items-center flex border-emerald-500/50 z-10 shadow-[0_0_10px_rgba(16,185,129,0.3)]"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /></div>
                  <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest">Diagnosis</span>
                </div>
                <div className="flex items-center gap-3 relative">
                  <div className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/50 z-10 flex items-center justify-center animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.4)]"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" /></div>
                  <span className="text-[9px] text-amber-500 font-bold uppercase tracking-widest animate-pulse">Dispatch required</span>
                </div>
                <div className="flex items-center gap-3 relative opacity-40">
                  <div className="w-5 h-5 rounded-full bg-gray-500/20 border border-gray-500/50 z-10 flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-gray-500" /></div>
                  <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Recovery Sequence</span>
                </div>
              </div>
            </div>
          ) : (
            <AlertBoard alerts={data.alerts} isAnomaly={isAnomaly} machineId={data.machineId} />
          )}
        </div>
      </div>

      {/* 4. CONTROL ACTION FOOTER */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-[#0a0c14]/90 backdrop-blur-md border-t border-white/10 rounded-b-xl z-40">
        {isOffline ? (
          <button
            onClick={() => handleInitialize(data.machineId)}
            className="group relative overflow-hidden py-3 w-full border text-[10px] font-black uppercase rounded hover:scale-105 transition-all flex items-center justify-center gap-2 bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500 hover:text-black"
          >
            <Power size={12} />
            Initialize Unit
            <div className="absolute inset-0 w-full h-full transform -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
          </button>
        ) : (
          <button
            onClick={() => handleKillSwitch(data.machineId)}
            className="group relative overflow-hidden py-3 w-full border text-[10px] font-black uppercase rounded hover:scale-105 transition-all flex items-center justify-center gap-2 bg-rose-500/10 border-rose-500/30 text-rose-500 hover:bg-rose-500 hover:text-black hover:border-rose-400 hover:shadow-[0_0_20px_rgba(244,63,94,0.4)]"
          >
            <Power size={12} />
            Emergency Kill Switch
            <div className="absolute inset-0 w-full h-full transform -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
          </button>
        )}
      </div>
    </div>
  );
};

export default MachineCard;