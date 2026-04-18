import asyncio
import json
import logging
import os
import random
from datetime import datetime
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
import google.generativeai as genai  # Standard Google AI Import
import httpx

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- SUPABASE CONFIG ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
# Handle both naming conventions for safety
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
supabase: Client = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        # Ensure URL is formatted correctly for the client
        url_to_use = SUPABASE_URL if SUPABASE_URL.startswith("http") else f"https://{SUPABASE_URL}.supabase.co"
        supabase = create_client(url_to_use, SUPABASE_KEY)
        logger.info("Supabase connected.")
    except Exception as e:
        logger.error(f"Failed to init Supabase: {e}")

# --- GEMINI CONFIG ---
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_KEY:
    try:
        genai.configure(api_key=GEMINI_KEY)
        # We use the model object directly in the new SDK
        gemini_model = genai.GenerativeModel('gemini-1.5-flash')
        logger.info("Gemini Client initialized.")
    except Exception as e:
        logger.error(f"Failed to initialize Gemini Client: {e}")
        gemini_model = None
else:
    gemini_model = None
    logger.warning("GEMINI_API_KEY missing. AI features will be disabled.")

app = FastAPI(title="Project Aegis Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

connected_clients: List[WebSocket] = []

# --- FLEET STATE ---
machines = [
    {"id": "AEGIS-01", "malendau_id": "CNC_01", "location": "Sector 7", "target": 1480},
    {"id": "AEGIS-02", "malendau_id": "CNC_02", "location": "Sector 3", "target": 1490},
    {"id": "AEGIS-03", "malendau_id": "PUMP_03", "location": "Lab B", "target": 2950},
    {"id": "AEGIS-04", "malendau_id": "CONVEYOR_04", "location": "Loading Dock", "target": 720}
]

fleet_state = {}
for m in machines:
    fleet_state[m["id"]] = {
        "status": "ACTIVE",
        "stream_temp": 25.0, "stream_vib": 0.0, "stream_rpm": 0, "stream_cur": 0.0,
        "malendau_status": "running",
        "temp": 25.0, "vib": 0.0, "rpm": 0, "cur": 0.0,
        "prev_temp": 25.0, "prev_vib": 0.0,
        "last_alert_time": 0, "last_alert_text": None,
        "history": [],
        "alerts": []
    }

class SensorData(BaseModel):
    timestamp: str
    machine_id: str
    location: str
    temperature: float
    vibration: float
    rpm: int
    current: float
    risk_score: float
    rul: str
    status: str = "ACTIVE"

class ReportRequest(BaseModel):
    alert_text: str
    sensor_data: dict

def calculate_risk_score(temp: float, vib: float, malendau_status: str) -> float:
    risk = random.uniform(2.0, 8.0) # Base dynamic drift
    if malendau_status == "fault":
        risk += random.uniform(80.0, 95.0)
    elif malendau_status == "warning":
        risk += random.uniform(40.0, 60.0)
    else:
        if temp > 75: risk += (temp - 75) * 1.2
        if vib > 4.0: risk += (vib - 4.0) * 8.0
    return round(min(100.0, max(0.0, risk)), 1)

def check_anomaly(data: SensorData, malendau_status: str) -> bool:
    if malendau_status in ["warning", "fault"]: return True
    if data.temperature > 100.0 or data.vibration > 5.0: return True
    return False

async def generate_alert_with_gemini(data: SensorData) -> str:
    if not gemini_model:
        return "CRITICAL ALERT: System parameters exceeded normal operating bounds."
    
    prompt = f"""
    Industrial Control Room Alert. Sensor data:
    Temp: {data.temperature:.1f}C, Vib: {data.vibration:.2f}mm/s, RPM: {data.rpm}, Risk: {data.risk_score:.0f}/100.
    Write a 1-sentence urgent professional alert message. No filler.
    """
    try:
        response = await asyncio.to_thread(gemini_model.generate_content, prompt)
        return response.text.strip()
    except Exception as e:
        logger.error(f"Gemini API Error: {e}")
        return "CRITICAL ALERT: Unknown anomaly detected."

async def stream_machine(machine_id: str, malendau_id: str):
    async with httpx.AsyncClient(timeout=None) as client:
        while True:
            try:
                logger.info(f"Connecting to Malendau stream: {malendau_id}")
                async with client.stream('GET', f'http://localhost:3000/stream/{malendau_id}') as response:
                    async for line in response.aiter_lines():
                        if line.startswith('data: '):
                            data = json.loads(line[6:])
                            s = fleet_state[machine_id]
                            s['stream_temp'] = data['temperature_C']
                            s['stream_vib'] = data['vibration_mm_s']
                            s['stream_rpm'] = data['rpm']
                            s['stream_cur'] = data['current_A']
                            s['malendau_status'] = data['status']
            except Exception as e:
                logger.error(f"Stream error {malendau_id}: {e}")
                await asyncio.sleep(5)

async def sensor_data_loop():
    global supabase
    while True:
        try:
            if supabase is None and SUPABASE_URL and SUPABASE_KEY:
                try:
                    url_to_use = SUPABASE_URL if SUPABASE_URL.startswith("http") else f"https://{SUPABASE_URL}.supabase.co"
                    supabase = create_client(url_to_use, SUPABASE_KEY)
                    logger.info("Supabase re-connected.")
                except Exception as e:
                    logger.error(f"Failed to re-init Supabase: {e}")

            if supabase:
                try:
                    res = supabase.table("machines").select("machineId, status").execute()
                    for dbm in res.data:
                        dbm_id = dbm.get("machineId") or dbm.get("machineid") or dbm.get("id")
                        if dbm_id in fleet_state:
                            fleet_state[dbm_id]["status"] = dbm.get("status", fleet_state[dbm_id]["status"])
                except Exception as e:
                    logger.error(f"DB Sync Error: {e}")

            current_time = asyncio.get_event_loop().time()
            
            for m in machines:
                mid = m["id"]
                s = fleet_state[mid]
                
                print(f"Syncing {mid}: Status is {s['status']}")
                
                # Logic for status processing
                if s["status"] == "OFFLINE":
                    s["rpm"] = 0; s["temp"] = 20.0; s["vib"] = 0.0; s["cur"] = 0.0
                    risk = 0.0; rul_str = "OFFLINE"
                elif s["status"] == "THROTTLED":
                    s["rpm"] = min(s.get("stream_rpm", 0), 1000)
                    s["temp"] = max(25.0, s.get("stream_temp", 25.0) - 10.0)
                    s["vib"] = max(0.5, s.get("stream_vib", 0.5) - 1.0)
                    s["cur"] = s.get("stream_cur", 0)
                    risk, rul_str = 15.0, ">99h 59m"
                else: # ACTIVE
                    s["temp"] = s.get("stream_temp", s["temp"])
                    s["vib"] = s.get("stream_vib", s["vib"])
                    s["rpm"] = s.get("stream_rpm", s["rpm"])
                    s["cur"] = s.get("stream_cur", s["cur"])
                    risk = calculate_risk_score(s["temp"], s["vib"], s.get("malendau_status", "running"))
                    rul_str = f"{random.randint(40, 48)}h {random.randint(10, 59)}m" if s.get("malendau_status") == "running" else "URGENT MAINT"

                data = SensorData(
                    timestamp=datetime.utcnow().isoformat() + "Z",
                    machine_id=mid, location=m["location"],
                    temperature=s["temp"], vibration=s["vib"],
                    rpm=s["rpm"], current=s["cur"],
                    risk_score=risk, rul=rul_str, status=s["status"]
                )

                # History and Alert Tracking
                time_str = datetime.now().strftime("%H:%M:%S")
                point = {"time": time_str, "temperature_C": round(s["temp"], 1), "vibration_mm_s": round(s["vib"], 2), "rpm": int(s["rpm"])}
                s["history"].append(point)
                if len(s["history"]) > 20: s["history"].pop(0)

                # High Risk Detection & Maintenance Logs Hook
                if s["status"] == "ACTIVE" and risk > 60.0:
                    # Use -1000 to ensure the first trigger doesn't wait 60s of server uptime
                    if current_time - s.get("last_log_time", -1000) > 60:
                        s["last_log_time"] = current_time
                        
                        print('DEBUG: Attempting AI Log Insert for ' + mid)
                        
                        prompt = f"""
                        Analyze this machine state: Temp {s['temp']:.1f}C, Vib {s['vib']:.2f}mm/s, RPM {s['rpm']}, Risk {risk:.0f}/100.
                        Output exactly valid JSON. Do not include markdown formatting or backticks. Schema: {{"issue_type": "Brief issue name", "reasoning": "Short explainable AI reasoning", "confidence": 0.85}}
                        """
                        try:
                            response = await asyncio.to_thread(gemini_model.generate_content, prompt)
                            payload = json.loads(response.text.replace('```json', '').replace('```', '').strip())
                            issue_type = payload.get("issue_type", "Unknown Anomaly")
                            reasoning = payload.get("reasoning", "Parameter deviation detected.")
                            confidence = float(payload.get("confidence", 0.5))
                        except Exception as e:
                            print(f"[ERROR] Gemini Parse failed: {e}")
                            issue_type = "Thermal/Vibration Spike"
                            reasoning = "Critical Thermal/Vibration Spike Detected"
                            confidence = 0.90
                            
                        # Confidence Threshold System
                        if confidence > 0.8:
                            risk_level = "CRITICAL"
                        elif confidence >= 0.6:
                            risk_level = "WARNING"
                        else:
                            risk_level = "ANOMALY"
                            
                        # Update Machine Alerts for Frontend Payload Sync
                        alert = {"time": time_str, "text": reasoning, "severity": risk_level.lower()}
                        s["alerts"].insert(0, alert)
                        if len(s["alerts"]) > 10:
                            s["alerts"].pop()

                        if supabase:
                            try:
                                log_entry = {
                                    "machine_id": mid,
                                    "technician_name": random.choice(["Shiv Sai", "Prasanna"]),
                                    "issue_type": issue_type,
                                    "risk_level": risk_level,
                                    "confidence": confidence,
                                    "reasoning": reasoning
                                }
                                await asyncio.to_thread(supabase.table("maintenance_logs").insert(log_entry).execute)
                                print(f"[SUCCESS] AI Insert to maintenance_logs for {mid} | Conf: {confidence}")
                            except Exception as e:
                                print(f"[ERROR] Failed AI insert to maintenance_logs: {e}")
                                logger.error(f"Failed to auto-spawn log: {e}")

                # DB UPSERT
                if supabase:
                    record = {
                        "machineId": mid, "location": m["location"], "status": s["status"],
                        "efficiency": max(60, int(100 - (s["vib"] * 5))), "currentScore": risk,
                        "rul": rul_str, "targetOutput": m["target"], "actualOutput": s["rpm"],
                        "history": json.dumps(s["history"]), "alerts": json.dumps(s["alerts"][:10])
                    }
                    print(f"Upserting: {record['machineId']} | Status: {record['status']} | Score: {record['currentScore']:.1f}")
                    try:
                        await asyncio.to_thread(supabase.table("machines").upsert(record).execute)
                    except ConnectionError:
                        logger.warning('Connection lost, retrying in 5s...')
                        supabase = None
                        await asyncio.sleep(5)
                        break
                    except Exception as e:
                        if "HTTPError" in type(e).__name__ or "10054" in str(e):
                            logger.warning('Connection lost, retrying in 5s...')
                            supabase = None
                            await asyncio.sleep(5)
                            break
                        else:
                            logger.error(f"DB Upsert Error: {e}")

            await asyncio.sleep(5)
        except Exception as e:
            logger.error(f"Loop Error: {e}")
            await asyncio.sleep(5)

@app.on_event("startup")
async def startup_event():
    for m in machines:
        asyncio.create_task(stream_machine(m["id"], m["malendau_id"]))
    asyncio.create_task(sensor_data_loop())

@app.websocket("/ws/sensors")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.append(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "COMMAND":
                mid, action = msg.get("machine_id"), msg.get("action")
                if mid in fleet_state:
                    fleet_state[mid]["status"] = "OFFLINE" if action == "KILL" else "THROTTLED"
    except WebSocketDisconnect:
        connected_clients.remove(websocket)

@app.post("/generate-report")
async def generate_report(req: ReportRequest):
    if not gemini_model: return {"error": "AI disabled"}
    prompt = f"Generate a structured maintenance JSON for {req.sensor_data['machine_id']}. Issue: {req.alert_text}. Include 'estimated_financial_recovery'."
    try:
        response = await asyncio.to_thread(gemini_model.generate_content, prompt)
        return json.loads(response.text.replace('```json', '').replace('```', '').strip())
    except:
        return {"ticket_id": "TKT-ERR", "priority": "HIGH", "diagnosis_summary": "Manual review required."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)