import React, { useState, useEffect, useRef } from 'react';
import MachineCard from './components/MachineCard';
import SafetyLeadWidget from './components/SafetyLeadWidget';
import SystemAuditTrail from './components/SystemAuditTrail';
import MaintenanceScheduleWidget from './components/MaintenanceScheduleWidget';
import { Shield, Volume2, VolumeX, AlertTriangle, FileText, X, Zap, Map as MapIcon, User, Users, Activity, Lock, Clock } from 'lucide-react';
import { supabase } from './lib/supabaseClient';

function App() {
  const [fleetData, setFleetData] = useState({});
  const [report, setReport] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [techIdInput, setTechIdInput] = useState('');
  const [activeTechnicians, setActiveTechnicians] = useState([]);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const beepIntervalRef = useRef(null);

  const criticalCount = Object.values(fleetData).filter(m => m.currentScore >= 80).length;

  const handleKillSwitch = async (id) => {
    console.log('KILL SWITCH ENGAGED - ID:', id);
    setFleetData(prev => ({ ...prev, [id]: { ...prev[id], isOffline: true } }));
    await supabase.from('machines').update({ status: 'OFFLINE', currentScore: 0 }).eq('machineId', id);
    await supabase.from('maintenance_logs').insert([{ machine_id: id, technician_name: "Command Authority", issue_type: 'MANUAL OVERRIDE', risk_level: 'CRITICAL', confidence: 1.0, reasoning: 'EMERGENCY STOP TRIGGERED BY OPERATOR.' }]);
  };

  const handleInitialize = async (id) => {
    setFleetData(prev => ({ ...prev, [id]: { ...prev[id], isOffline: false } }));
    await supabase.from('machines').update({ status: 'ACTIVE' }).eq('machineId', id);
    await supabase.from('maintenance_logs').insert([{ machine_id: id, technician_name: "Command Authority", issue_type: 'INITIALIZATION SEQUENCE', risk_level: 'WARNING', confidence: 1.0, reasoning: 'SYSTEM INITIALIZED: BEGINNING TELEMETRY UPLINK.' }]);
  };

  useEffect(() => {
    // Initial fetch
    const fetchMachines = async () => {
      const { data, error } = await supabase.from('machines').select('*');
      if (data) {
        const nextState = {};
        data.forEach(rawP => {
          // Normalize column casing in case Supabase UI lowercased them
          const id = rawP.machineId || rawP.machineid || rawP.id;
          nextState[id] = {
            machineId: id,
            location: rawP.location,
            currentScore: rawP.currentScore !== undefined ? rawP.currentScore : rawP.currentscore,
            rul: rawP.rul,
            history: typeof rawP.history === 'string' ? JSON.parse(rawP.history) : (rawP.history || []),
            alerts: typeof rawP.alerts === 'string' ? JSON.parse(rawP.alerts) : (rawP.alerts || []),
            efficiency: rawP.efficiency,
            status: rawP.status,
            targetOutput: rawP.targetOutput !== undefined ? rawP.targetOutput : rawP.targetoutput,
            actualOutput: rawP.actualOutput !== undefined ? rawP.actualOutput : rawP.actualoutput
          };
        });
        setFleetData(nextState);
      }
    };
    fetchMachines();

    const fetchTechnicians = async () => {
      const { data, error } = await supabase.from('technicians').select('*').eq('is_active', true);
      if (data) {
        setActiveTechnicians(data);
      }
    };
    fetchTechnicians();

    console.log("Uplink Established: Connected to Supabase Node");

    // Set up Realtime listener
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'machines',
        },
        (payload) => {
          setFleetData(prev => {
            if (payload.eventType === 'DELETE') {
              const nextState = { ...prev };
              const oldId = payload.old.machineId || payload.old.machineid || payload.old.id;
              delete nextState[oldId];
              return nextState;
            }
            
            const rawP = payload.new;
            const newId = rawP.machineId || rawP.machineid || rawP.id;
            const existing = prev[newId] || {};
            
            if (existing.isOffline) return prev;

            return {
              ...prev,
              [newId]: {
                machineId: newId !== undefined ? newId : existing.machineId,
                location: rawP.location !== undefined ? rawP.location : existing.location,
                currentScore: rawP.currentScore !== undefined ? rawP.currentScore : (rawP.currentscore !== undefined ? rawP.currentscore : existing.currentScore),
                rul: rawP.rul !== undefined ? rawP.rul : existing.rul,
                history: rawP.history ? (typeof rawP.history === 'string' ? JSON.parse(rawP.history) : rawP.history) : (existing.history || []),
                alerts: rawP.alerts ? (typeof rawP.alerts === 'string' ? JSON.parse(rawP.alerts) : rawP.alerts) : (existing.alerts || []),
                efficiency: rawP.efficiency !== undefined ? rawP.efficiency : existing.efficiency,
                status: rawP.status !== undefined ? rawP.status : existing.status,
                targetOutput: rawP.targetOutput !== undefined ? rawP.targetOutput : (rawP.targetoutput !== undefined ? rawP.targetoutput : existing.targetOutput),
                actualOutput: rawP.actualOutput !== undefined ? rawP.actualOutput : (rawP.actualoutput !== undefined ? rawP.actualoutput : existing.actualOutput)
              }
            };
          });
        }
      )
      .subscribe();

    const techChannel = supabase
      .channel('schema-db-changes-techs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'technicians' },
        (payload) => {
          fetchTechnicians(); // Simplest approach to keep active list synced
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(techChannel);
      console.log("Uplink Severed");
    };
  }, []);

  // Professional Audio Alert Logic
  useEffect(() => {
    const playBuzzer = () => {
      if (isMuted || criticalCount === 0) return;
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';

      const freq = criticalCount > 1 ? 900 : 600;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.1);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    };

    if (beepIntervalRef.current) clearInterval(beepIntervalRef.current);
    if (criticalCount > 0 && !isMuted) {
      playBuzzer();
      beepIntervalRef.current = setInterval(playBuzzer, criticalCount > 1 ? 800 : 2500);
    }
    return () => clearInterval(beepIntervalRef.current);
  }, [criticalCount, isMuted]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const handleRemoteCommand = async (machineId, action) => {
    let newStatus = 'ACTIVE';
    if (action === 'KILL') newStatus = 'OFFLINE';
    if (action === 'LIMIT_RPM') newStatus = 'THROTTLED';

    const { error } = await supabase
      .from('machines')
      .update({ status: newStatus })
      .eq('machineId', machineId);

    if (!error) {
       console.log(`[AUTH_EXEC] Protocol ${action} deployed to ${machineId}. Status updated to ${newStatus}.`);
    } else {
       console.error("Failed to update remote command:", error);
    }
  };

  const handleGenerateReport = (mid) => {
    const machine = fleetData[mid];
    if (!machine) return;
    setIsGenerating(true);
    
    setTimeout(() => {
      const dynamicCost = Math.floor(Math.random() * 5000 + 2000);
      const isCritical = machine.currentScore > 80;
      const descText = machine.alerts && machine.alerts.length > 0 ? machine.alerts[0].text.toLowerCase() : "";
      
      let actionPlan = ["Step 1: Isolate Power & Lockout", "Step 2: Component Diagnostic Check", "Step 3: Reset & Calibrate"];
      let rootCause = "General Sensor Deviation";
      
      if (descText.includes('therm') || descText.includes('temp') || descText.includes('spike')) {
        rootCause = "Thermal Runaway";
        actionPlan = ["Step 1: Coolant Flush & Purge", "Step 2: Inspect Thermal Insulation", "Step 3: Thermostat Recalibration"];
      } else if (descText.includes('vib') || descText.includes('bearing') || descText.includes('harmonic')) {
        rootCause = "Bearing Friction / Harmonic Variance";
        actionPlan = ["Step 1: Disengage Motor Assembly", "Step 2: Replace Spindle Bearings", "Step 3: Laser Alignment"];
      } else if (descText.includes('rpm') || descText.includes('speed') || descText.includes('torque') || descText.includes('rotat')) {
        rootCause = "Drive Motor Desync";
        actionPlan = ["Step 1: Inverter Reset", "Step 2: Inspect Drive Belts", "Step 3: VFD Parameter Validation"];
      }

      setReport({
        id: machine.machineId,
        desc: machine.alerts && machine.alerts.length > 0 
          ? machine.alerts[0].text 
          : `Sensor deviation anomaly detected. Score: ${machine.currentScore?.toFixed(1)}.`,
        prio: isCritical ? 'CRITICAL' : 'ANOMALY',
        score: machine.currentScore ? (machine.currentScore / 100).toFixed(2) : 0.85,
        cost: dynamicCost,
        location: machine.location || 'Sector 7',
        ettr: isCritical ? '4-6 Hours' : '1-2 Hours',
        actionPlan: actionPlan,
        rootCause: rootCause
      });
      setIsGenerating(false);
    }, 1200);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!techIdInput.trim()) return;
    setIsLoggingIn(true);
    setLoginError('');

    const { data, error } = await supabase
      .from('technicians')
      .select('*')
      .eq('id', techIdInput.trim())
      .single();

    if (error || !data) {
      setLoginError('Invalid Technician ID.');
      setIsLoggingIn(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('technicians')
      .update({ is_active: true })
      .eq('id', data.id);

    if (updateError) {
      setLoginError('Failed to activate status.');
      setIsLoggingIn(false);
      return;
    }

    setIsAuthorized(true);
    setIsLoggingIn(false);
  };

  return (
    <>
      <div className="mesh-bg flex h-screen overflow-hidden text-white selection:bg-cyan-500/30">

      {/* 🔐 NAV SIDEBAR */}
      {isAuthorized && (
        <nav className="w-20 shrink-0 bg-black/60 backdrop-blur-xl border-r border-white/10 flex flex-col items-center py-8 gap-8 z-50">
          <div className="p-2 bg-cyan-500/20 rounded-xl border border-cyan-500/50 mb-4 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
            <Shield className="text-cyan-400" size={24} />
          </div>
          <button onClick={() => setActiveTab('dashboard')} className={`p-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 shadow-[0_0_15px_rgba(34,211,238,0.3)]' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>
            <Activity size={24} />
          </button>
          <button onClick={() => setActiveTab('audit')} className={`p-3 rounded-xl transition-all ${activeTab === 'audit' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 shadow-[0_0_15px_rgba(34,211,238,0.3)]' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>
            <FileText size={24} />
          </button>
          <button onClick={() => setActiveTab('schedule')} className={`p-3 rounded-xl transition-all ${activeTab === 'schedule' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 shadow-[0_0_15px_rgba(34,211,238,0.3)]' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>
            <Clock size={24} />
          </button>
          <button onClick={() => setActiveTab('staff')} className={`p-3 rounded-xl transition-all ${activeTab === 'staff' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 shadow-[0_0_15px_rgba(34,211,238,0.3)]' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>
            <Users size={24} />
          </button>
        </nav>
      )}

      {/* 📂 SLIDING DRAWER */}
      <div className={`absolute top-0 bottom-0 left-20 w-[450px] bg-black/80 backdrop-blur-xl border-r border-cyan-500/30 shadow-[0_0_50px_rgba(34,211,238,0.1)] z-40 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-y-auto custom-scrollbar p-6 ${activeTab === 'dashboard' || !isAuthorized ? '-translate-x-full' : 'translate-x-0'}`}>
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10">
          <h2 className="font-black tracking-widest uppercase text-cyan-400">
            {activeTab === 'audit' ? 'System Audit Logs' : activeTab === 'schedule' ? 'Maintenance Schedule' : 'Safety Personnel'}
          </h2>
          <button onClick={() => setActiveTab('dashboard')} className="text-gray-500 hover:text-white transition-colors hover:rotate-90 transform duration-300">
            <X size={20} />
          </button>
        </div>
        {activeTab === 'audit' && <SystemAuditTrail />}
        {activeTab === 'schedule' && <MaintenanceScheduleWidget fleetData={fleetData} />}
        {activeTab === 'staff' && <SafetyLeadWidget activeTechnicians={activeTechnicians} />}
      </div>

      {/* 🔐 OVERLAYS & MAIN CONTENT */}
      <div className="flex-1 relative h-full overflow-auto custom-scrollbar p-4 md:p-8">
      
      {!isAuthorized && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-xl">
          <div className="glass-panel w-full max-w-md bg-slate-900/90 p-8 rounded-2xl border border-cyan-500/30 shadow-[0_0_50px_rgba(34,211,238,0.2)] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent"></div>
            
            <div className="flex flex-col items-center mb-8 text-center">
              <div className="p-4 bg-cyan-500/10 rounded-full mb-4 border border-cyan-500/20">
                <Lock className="text-cyan-400" size={32} />
              </div>
              <h2 className="text-2xl font-black uppercase text-cyan-400 tracking-widest mb-1">Restricted Access</h2>
              <p className="text-xs text-gray-400 font-mono">Technician ID required to authorize session.</p>
            </div>

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div>
                <label className="block text-[10px] text-cyan-400 font-bold uppercase tracking-widest mb-2 ml-1">Technician Identification</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                  <input
                    type="text"
                    value={techIdInput}
                    onChange={(e) => setTechIdInput(e.target.value)}
                    placeholder="Enter ID (e.g. 1001)"
                    className="w-full bg-black/50 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-white font-mono text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder:text-gray-600"
                    disabled={isLoggingIn}
                    autoFocus
                  />
                </div>
                {loginError && <p className="text-rose-500 text-xs mt-2 ml-1 font-mono">{loginError}</p>}
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full mt-4 py-3 bg-cyan-500 hover:bg-cyan-400 text-black font-black uppercase text-xs tracking-widest rounded-lg transition-all shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:shadow-[0_0_30px_rgba(34,211,238,0.5)] disabled:opacity-50 flex items-center justify-center"
              >
                {isLoggingIn ? 'Authenticating...' : 'Authorize Context'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ⚠️ CRITICAL INCIDENT OVERLAY */}
      {criticalCount > 1 && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-bounce glass-panel bg-rose-500/10 border-rose-500/50 text-rose-500 font-black tracking-[0.2em] uppercase py-3 px-8 rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(244,63,94,0.3)] border-2">
          <AlertTriangle size={20} className="mr-3 animate-pulse" />
          PRIORITY 1: {criticalCount} UNITS CRITICAL
        </div>
      )}

      {/* HEADER SECTION */}
      <header className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-cyan-500/10 border border-cyan-500/50 rounded-lg shadow-[0_0_15px_rgba(34,211,238,0.2)]">
            <Shield className="text-cyan-400" size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-widest uppercase text-cyan-400 italic">Project Aegis</h1>
            <div className="flex items-center gap-2">
              <Activity size={12} className="text-emerald-500" />
              <p className="text-gray-500 text-[10px] tracking-[0.3em] uppercase font-mono">Fleet Orchestration AI // v2.4.0</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button onClick={() => setIsMuted(!isMuted)} className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all">
            {isMuted ? <VolumeX className="text-rose-500" /> : <Volume2 className="text-cyan-400" />}
          </button>
          <div className="text-right border-l border-white/10 pl-6 font-mono">
            <div className="text-emerald-500 text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-2 justify-end">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
              Live Sync
            </div>
            <div className="text-[10px] text-gray-600 uppercase">Sector 07 Uplink</div>
          </div>
        </div>
      </header>

      {/* 🗺️ SPATIAL DIGITAL TWIN MAP */}
      <section className="glass-panel p-5 rounded-xl border border-white/5 bg-slate-900/40 relative overflow-hidden group">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">
            <MapIcon size={14} className="text-cyan-400" /> Sector 7 Asset Topography
          </div>
          <span className="text-[8px] font-mono text-gray-700">SCALE: 1:500</span>
        </div>
        <div className="h-20 w-full rounded-lg border border-dashed border-white/10 relative flex items-center justify-around px-10 transition-colors group-hover:border-white/20">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
          
          {/* Glowing Network Line connecting nodes */}
          <div className="absolute top-[40%] left-[10%] right-[10%] h-[1px] bg-cyan-500/30 shadow-[0_0_15px_#22d3ee]"></div>
          
          {Object.values(fleetData).map(m => (
            <div key={m.machineId} className="relative z-10 flex flex-col items-center gap-1">
              <div className={`w-3 h-3 rounded-full transition-all duration-700 ${m.currentScore >= 80 ? 'bg-rose-500 shadow-[0_0_20px_#f43f5e] scale-125' : 'bg-cyan-500 shadow-[0_0_10px_#22d3ee]'}`}></div>
              <span className="text-[7px] font-mono text-gray-600 font-bold uppercase">{m.machineId}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 📊 CORE FLEET GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start flex-grow pb-24">
        {Object.values(fleetData).length > 0 ? (
          Object.values(fleetData)
            .sort((a, b) => a.machineId.localeCompare(b.machineId))
            .map(m => (
              <MachineCard
                key={m.machineId}
                data={m}
                onGenerateReport={handleGenerateReport}
                isGenerating={isGenerating}
                handleKillSwitch={handleKillSwitch}
                handleInitialize={handleInitialize}
              />
            ))
        ) : (
          <div className="col-span-full h-64 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-2xl">
            <Activity className="text-gray-800 animate-pulse mb-4" size={48} />
            <div className="text-gray-600 font-mono text-xs tracking-widest uppercase">Awaiting Fleet Handshake...</div>
          </div>
        )}
      </div>

      </div>

      {/* 📄 AI DIAGNOSTIC MODAL */}
      {report && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md animate-fadeIn">
          <div className="glass-panel w-full max-w-2xl bg-slate-950 p-8 border-cyan-500/20 shadow-[0_0_100px_rgba(34,211,238,0.1)] relative">

            <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10 rounded-lg">
                  <FileText className="text-cyan-400" size={24} />
                </div>
                <h2 className="text-2xl font-black uppercase text-cyan-400 tracking-tighter">AI Diagnostic Protocol</h2>
              </div>
              <button onClick={() => setReport(null)} className="text-gray-500 hover:text-white transition-colors">
                <X size={28} />
              </button>
            </div>

            {/* NEURAL LOG TERMINAL */}
            <div className="mb-6 bg-black/80 rounded-lg p-4 font-mono text-[9px] h-24 overflow-hidden text-cyan-600/60 flex flex-col gap-1.5 border border-white/5 shadow-inner">
              <div className="flex items-center gap-2"><span className="text-emerald-500">▶</span> [SYS] Injecting sensor array {report.id}...</div>
              <div className="flex items-center gap-2"><span className="text-cyan-500">▶</span> [AI] Running predictive harmonic failure regression...</div>
              <div className="flex items-center gap-2"><span className="text-cyan-500">▶</span> [AI] Correlating thermal spikes with vibration variance...</div>
              <div className="text-emerald-400 font-bold mt-1">✓ DIAGNOSTIC CONFIRMED: Gemini Pro 1.5 Inference Ready.</div>
            </div>

            {/* ROI IMPACT BADGE */}
            <div className="mb-6 bg-emerald-500/5 border border-emerald-500/20 p-5 rounded-2xl flex items-center justify-between shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-full"><Zap size={20} className="text-emerald-500" /></div>
                <div>
                  <span className="text-[10px] font-black text-emerald-500/80 uppercase tracking-widest block mb-0.5">Asset Recovery Value</span>
                  <div className="text-[8px] text-gray-600 font-mono">PREVENTATIVE SAVINGS CALCULATED</div>
                </div>
              </div>
              <div className="font-mono text-2xl text-emerald-400 font-black tracking-tighter">
                {formatCurrency(report.cost)}
              </div>
            </div>

            {/* DIAGNOSIS BODY */}
            <div className="space-y-6">
              <div>
                <h3 className="text-[10px] text-cyan-400 uppercase tracking-[0.3em] mb-2 font-black opacity-70 italic">Core Diagnosis</h3>
                <div className="text-gray-300 text-xs leading-relaxed glass-panel p-4 border-white/5 italic bg-white/5 rounded-xl border">
                  "{report.desc}"
                </div>
              </div>
              <div>
                <h3 className="text-[10px] text-cyan-400 uppercase tracking-[0.3em] mb-2 font-black opacity-70 italic">Remediation Flags</h3>
                <div className="text-[10px] text-gray-500 font-mono flex flex-col gap-2 bg-white/5 p-3 rounded-lg border border-white/5">
                  <div className="flex justify-between items-center border-b border-white/10 pb-2">
                    <span>PRIORITY LEVEL:</span>
                    <span className={report.prio === 'CRITICAL' ? 'text-rose-500 font-bold' : 'text-amber-500 font-bold'}>{report.prio}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-white/10 pb-2 pt-1">
                    <span>RECOVERY TIME (ETTR):</span>
                    <span className="text-cyan-400 font-bold">{report.ettr}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <span>AI CONFIDENCE:</span>
                    <span className="text-cyan-400 font-bold">{Math.round(report.score * 100)}%</span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-[10px] text-cyan-400 uppercase tracking-[0.3em] mb-2 font-black opacity-70 italic">AI Action Plan</h3>
                <div className="text-[10px] text-gray-300 font-mono flex flex-col gap-1.5 bg-cyan-950/20 p-3 rounded-lg border border-cyan-500/20">
                  {report.actionPlan.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-cyan-500">➜</span> {step}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={async () => {
                setIsDispatching(true);
                const { id, desc, prio, score, cost } = report;
                
                try {
                  await supabase.from('maintenance_tickets').insert([{ 
                    machine_id: id, 
                    issue_description: desc, 
                    priority: prio, 
                    confidence_score: score, 
                    estimated_cost: cost 
                  }]);
                  console.log('Ticket Sent!');
                } catch (e) {
                  console.error('Failed to dispatch ticket:', e);
                }

                setIsDispatching(false);
                setReport(null);
              }}
              disabled={isDispatching}
              className={`mt-8 w-full py-4 border rounded-xl font-black uppercase text-[11px] tracking-[0.2em] flex items-center justify-center gap-2 transition-all duration-500 shadow-lg ${
                isDispatching 
                  ? 'bg-cyan-500 text-black border-cyan-500 opacity-80 cursor-wait' 
                  : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500 hover:text-black shadow-cyan-500/10'
              }`}
            >
              {isDispatching ? (
                <>
                  <Activity size={16} className="animate-spin" /> Syncing to Cloud...
                </>
              ) : (
                <>
                  <User size={16} /> Dispatch Response Team
                </>
              )}
            </button>
          </div>
        </div>
      )}

      </div>
    </>
  );
}

export default App;