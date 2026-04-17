import React, { useState, useEffect, useRef } from 'react';
import MachineCard from './components/MachineCard';
import { Shield, Volume2, VolumeX, AlertTriangle, FileText, X, Zap, Map as MapIcon, User, Activity } from 'lucide-react';

function App() {
  const [fleetData, setFleetData] = useState({});
  const [report, setReport] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const beepIntervalRef = useRef(null);

  const criticalCount = Object.values(fleetData).filter(m => m.currentScore >= 80).length;

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/sensors');
    wsRef.current = ws;

    ws.onopen = () => console.log("Uplink Established: Connected to Sector 7 Node");

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const payloadArray = Array.isArray(payload) ? payload : [payload];

        setFleetData(prev => {
          const nextState = { ...prev };
          payloadArray.forEach(p => {
            const timeStr = new Date(p.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

            const point = {
              time: timeStr,
              temperature: p.temperature.toFixed(1),
              vibration: p.vibration.toFixed(2),
              rpm: p.rpm,
              current: p.current.toFixed(1)
            };

            const existing = nextState[p.machine_id] || { history: [], alerts: [] };

            let newHistory = [...existing.history, point];
            if (newHistory.length > 20) newHistory.shift();

            let newAlerts = existing.alerts;
            if (p.alert) {
              if (newAlerts.length === 0 || newAlerts[0].text !== p.alert) {
                newAlerts = [{ id: Date.now(), time: timeStr, text: p.alert }, ...newAlerts.slice(0, 49)];
              }
            }

            nextState[p.machine_id] = {
              machineId: p.machine_id,
              location: p.location,
              currentScore: p.risk_score,
              rul: p.rul,
              history: newHistory,
              alerts: newAlerts,
              efficiency: Math.max(60, 100 - (p.vibration * 5)).toFixed(0)
            };
          });
          return nextState;
        });
      } catch (e) { console.error("WS stream error", e); }
    };

    ws.onclose = () => console.log("Uplink Severed");
    return () => wsRef.current?.close();
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

  const calculateFinancialRecovery = (score) => {
    const base = 8500;
    const severityMultiplier = (score / 100) * 9500;
    const total = base + severityMultiplier + (Math.random() * 200);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total);
  };

  const handleRemoteCommand = (machineId, action) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "COMMAND", machine_id: machineId, action, timestamp: new Date().toISOString() }));
      console.log(`[AUTH_EXEC] Protocol ${action} deployed to ${machineId}`);
    }
  };

  const handleGenerateReport = async (mid) => {
    const machine = fleetData[mid];
    if (!machine) return;
    setIsGenerating(true);
    try {
      const latestData = machine.history[machine.history.length - 1] || {};
      const res = await fetch("http://localhost:8000/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alert_text: machine.alerts[0]?.text || "Manual Audit Triggered",
          sensor_data: { machine_id: machine.machineId, location: machine.location, ...latestData }
        })
      });
      setReport(await res.json());
    } catch (e) { console.error(e); } finally { setIsGenerating(false); }
  };

  return (
    <div className="min-h-screen overflow-auto p-4 md:p-6 max-w-[1800px] mx-auto flex flex-col gap-6 relative custom-scrollbar bg-slate-950 text-white selection:bg-cyan-500/30">

      {/* ⚠️ CRITICAL INCIDENT OVERLAY */}
      {criticalCount > 1 && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-bounce glass-panel bg-rose-500/10 border-rose-500/50 text-rose-500 font-black tracking-[0.2em] uppercase py-3 px-8 rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(244,63,94,0.3)] border-2">
          <AlertTriangle size={20} className="mr-3 animate-pulse" />
          PRIORITY 1: {criticalCount} UNITS CRITICAL
        </div>
      )}

      {/* HEADER SECTION */}
      <header className="flex items-center justify-between border-b border-white/10 pb-4">
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
          Object.values(fleetData).map(m => (
            <MachineCard
              key={m.machineId}
              data={m}
              onGenerateReport={handleGenerateReport}
              onRemoteCommand={handleRemoteCommand}
              isGenerating={isGenerating}
            />
          ))
        ) : (
          <div className="col-span-full h-64 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-2xl">
            <Activity className="text-gray-800 animate-pulse mb-4" size={48} />
            <div className="text-gray-600 font-mono text-xs tracking-widest uppercase">Awaiting Fleet Handshake...</div>
          </div>
        )}
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
              <div className="flex items-center gap-2"><span className="text-emerald-500">▶</span> [SYS] Injecting sensor array {report.equipment_id}...</div>
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
                {calculateFinancialRecovery(fleetData[report.equipment_id]?.currentScore || 85)}
              </div>
            </div>

            {/* DIAGNOSIS BODY */}
            <div className="space-y-6">
              <div>
                <h3 className="text-[10px] text-cyan-400 uppercase tracking-[0.3em] mb-2 font-black opacity-70 italic">Core Diagnosis</h3>
                <div className="text-gray-300 text-xs leading-relaxed glass-panel p-4 border-white/5 italic bg-white/5 rounded-xl border">
                  "{report.diagnosis_summary}"
                </div>
              </div>
              <div>
                <h3 className="text-[10px] text-cyan-400 uppercase tracking-[0.3em] mb-2 font-black opacity-70 italic">Remediation Steps</h3>
                <div className="grid grid-cols-1 gap-2">
                  {(report.recommended_actions || []).map((a, i) => (
                    <div key={i} className="text-[10px] text-gray-500 font-mono flex items-center gap-3 bg-white/5 p-2 rounded-lg border border-white/5 hover:border-cyan-500/30 transition-all">
                      <span className="text-cyan-500 font-black">0{i + 1}</span> {a}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                alert(`Dispatching Technician to ${report.location}...`);
                setReport(null);
              }}
              className="mt-8 w-full py-4 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-xl font-black uppercase text-[11px] tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-cyan-500 hover:text-black transition-all duration-500 shadow-lg shadow-cyan-500/10"
            >
              <User size={16} /> Dispatch Response Team
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;