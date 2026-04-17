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
from google import genai
from pydantic import BaseModel

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Project Aegis Backend")

# Allow requests from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active WebSocket connections
connected_clients: List[WebSocket] = []

# Global Fleet State
machines = [
    {"id": "AEGIS-01", "location": "Sector 7"},
    {"id": "AEGIS-02", "location": "Sector 3"},
    {"id": "AEGIS-03", "location": "Lab B"},
    {"id": "AEGIS-04", "location": "Loading Dock"}
]

fleet_state = {}
for m in machines:
    fleet_state[m["id"]] = {
        "status": "ACTIVE",
        "temp": 65.0, "vib": 2.5, "rpm": 3200, "cur": 12.0,
        "dt_ema": 0.0, "dv_ema": 0.0,
        "prev_temp": 65.0, "prev_vib": 2.5,
        "last_alert_time": 0, "last_alert_text": None
    }

# Initialize Gemini Client
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
gemini_client = None
if GEMINI_KEY and GEMINI_KEY != "YOUR_GEMINI_API_KEY_HERE":
    try:
        gemini_client = genai.Client(api_key=GEMINI_KEY)
    except Exception as e:
        logger.error(f"Failed to initialize Gemini Client: {e}")

class SensorData(BaseModel):
    timestamp: str
    machine_id: str
    location: str
    temperature: float # C
    vibration: float   # mm/s
    rpm: int           # revs/min
    current: float     # Amps
    risk_score: float  # 0 to 100
    rul: str           # Remaining Useful Life
    status: str = "ACTIVE"

class ReportRequest(BaseModel):
    alert_text: str
    sensor_data: dict

def check_anomaly(data: SensorData) -> bool:
    """Simple heuristic to detect anomalies."""
    if data.temperature > 85.0: return True
    if data.vibration > 6.0: return True
    if data.rpm < 2800 or data.rpm > 3600: return True
    if data.current > 18.0: return True
    return False

def calculate_risk_score(temp: float, vib: float, rpm: int, cur: float) -> float:
    risk = 0.0
    if temp > 80: risk += (temp - 80) * 2
    if vib > 5: risk += (vib - 5) * 10
    if abs(rpm - 3200) > 200: risk += abs(rpm - 3200) * 0.05
    if cur > 15: risk += (cur - 15) * 5
    return min(100.0, max(0.0, risk))

async def generate_alert_with_gemini(data: SensorData) -> str:
    """Use Gemini API to generate an English alert based on the sensor anomaly."""
    if not gemini_client:
        return "CRITICAL ALERT: System parameters exceeded normal operating bounds. (Gemini API not configured)"
    
    prompt = f"""
    You are an AI diagnostic agent in an industrial control room. A system anomaly has just been detected.
    Here is the live sensor data:
    - Temperature: {data.temperature:.1f} °C (Normal: < 80 °C)
    - Vibration: {data.vibration:.2f} mm/s (Normal: < 5 mm/s)
    - RPM: {data.rpm} (Normal: 3000-3400)
    - Current: {data.current:.1f} A (Normal: < 15 A)
    - Calculated Risk Score: {data.risk_score:.0f}/100

    Write a single, concise professional alert message (maximum 2 sentences) describing what looks broken or dangerous.
    Do not use introductory filler. Keep it urgent but professional.
    """
    try:
        # Run synchronous generate_content in a thread to wait without blocking loop if needed
        # Or just use the native interface
        response = await asyncio.to_thread(
            gemini_client.models.generate_content,
            model='gemini-2.5-flash',
            contents=prompt
        )
        return response.text.strip()
    except Exception as e:
        logger.error(f"Gemini API Error: {e}")
        return "CRITICAL ALERT: Unknown anomaly detected and failed to generate analysis."

async def sensor_data_loop():
    """Background task to simulate data and broadcast it."""
    while True:
        try:
            payload_array = []
            current_time = asyncio.get_event_loop().time()
            
            for m in machines:
                mid = m["id"]
                s = fleet_state[mid]
                
                if s["status"] == "OFFLINE":
                    # Data is frozen at 0
                    risk = 0.0
                    rul_str = "OFFLINE"
                elif s["status"] == "THROTTLED":
                    # Cap RPM, decay temp and vib
                    s["rpm"] = min(s["rpm"], 1500)
                    if s["temp"] > 40: s["temp"] -= 0.5
                    if s["vib"] > 1: s["vib"] -= 0.1
                    if s["cur"] > 5: s["cur"] -= 0.2
                    
                    s["temp"] += random.uniform(-0.2, 0.2)
                    s["vib"] += random.uniform(-0.05, 0.05)
                    s["rpm"] += random.randint(-10, 10)
                    s["rpm"] = min(s["rpm"], 1500)
                    
                    s["temp"] = max(20.0, s["temp"])
                    s["vib"] = max(0.1, s["vib"])
                    s["rpm"] = max(0, s["rpm"])
                    s["cur"] = max(0.1, s["cur"])
                    
                    risk = calculate_risk_score(s["temp"], s["vib"], s["rpm"], s["cur"])
                    rul_str = ">99h 59m"
                else: # ACTIVE
                    # Simulate normal fluctuations
                    s["temp"] += random.uniform(-1, 1)
                    s["vib"] += random.uniform(-0.2, 0.2)
                    s["rpm"] += random.randint(-50, 50)
                    s["cur"] += random.uniform(-0.5, 0.5)
                    
                    # Occasionally cause a spike
                    if random.random() < 0.02:  # 2% chance for each machine
                        s["temp"] += random.uniform(5, 20)
                        s["vib"] += random.uniform(2, 5)
                        s["cur"] += random.uniform(2, 6)

                    s["temp"] = max(20.0, s["temp"])
                    s["vib"] = max(0.1, s["vib"])
                    s["rpm"] = max(0, s["rpm"])
                    s["cur"] = max(0.1, s["cur"])
                    
                    # Decay towards normal
                    if s["temp"] > 80: s["temp"] -= 1
                    if s["vib"] > 5: s["vib"] -= 0.5
                    if s["cur"] > 15: s["cur"] -= 0.5
                    if s["rpm"] < 3000: s["rpm"] += 50
                    if s["rpm"] > 3400: s["rpm"] -= 50

                    risk = calculate_risk_score(s["temp"], s["vib"], s["rpm"], s["cur"])
                
                if s["status"] == "ACTIVE":
                    dt = s["temp"] - s["prev_temp"]
                    dv = s["vib"] - s["prev_vib"]
                    s["prev_temp"] = s["temp"]
                    s["prev_vib"] = s["vib"]
                    
                    alpha = 0.2
                    s["dt_ema"] = alpha * dt + (1 - alpha) * s["dt_ema"]
                    s["dv_ema"] = alpha * dv + (1 - alpha) * s["dv_ema"]
                    
                    rul_seconds = 9999999
                    if s["dt_ema"] > 0.05:
                        rul_seconds = min(rul_seconds, (100 - s["temp"]) / s["dt_ema"])
                    if s["dv_ema"] > 0.05:
                        rul_seconds = min(rul_seconds, (10 - s["vib"]) / s["dv_ema"])
                        
                    if rul_seconds == 9999999 or rul_seconds < 0:
                        rul_str = ">99h 59m"
                    else:
                        total_minutes = int(rul_seconds)
                        hours = total_minutes // 60
                        mins = total_minutes % 60
                        rul_str = ">99h 59m" if hours > 99 else f"{hours}h {mins:02d}m"
                
                data = SensorData(
                    timestamp=datetime.utcnow().isoformat() + "Z",
                    machine_id=mid,
                    location=m["location"],
                    temperature=s["temp"],
                    vibration=s["vib"],
                    rpm=s["rpm"],
                    current=s["cur"],
                    risk_score=risk,
                    rul=rul_str,
                    status=s["status"]
                )
                
                item_payload = data.model_dump()
                
                if s["status"] == "ACTIVE" and check_anomaly(data):
                    if current_time - s["last_alert_time"] > 60:
                        alert_text = await generate_alert_with_gemini(data)
                        s["last_alert_text"] = alert_text
                        s["last_alert_time"] = current_time
                    else:
                        alert_text = s["last_alert_text"] or "CRITICAL ALERT: System parameters exceeded normal operating bounds (rate limited)."
                    item_payload['alert'] = alert_text
                else:
                    item_payload['alert'] = None
                    s["last_alert_text"] = None
                    
                payload_array.append(item_payload)
                
            # Broadcast to all connected clients
            disconnected_clients = []
            for client in connected_clients:
                try:
                    await client.send_text(json.dumps(payload_array))
                except WebSocketDisconnect:
                    disconnected_clients.append(client)
                except Exception as e:
                    logger.error(f"Could not send data to client: {e}")
                    disconnected_clients.append(client)
                    
            for client in disconnected_clients:
                connected_clients.remove(client)
                
            await asyncio.sleep(1) # Broadcast every second
        except Exception as e:
            logger.error(f"Error in sensor loop: {e}")
            await asyncio.sleep(1)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(sensor_data_loop())

@app.websocket("/ws/sensors")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.append(websocket)
    try:
        while True:
            # Listen for incoming commands
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "COMMAND":
                    mid = msg.get("machine_id")
                    action = msg.get("action")
                    if mid in fleet_state:
                        if action == "KILL":
                            fleet_state[mid]["status"] = "OFFLINE"
                            fleet_state[mid]["rpm"] = 0
                            fleet_state[mid]["temp"] = 0
                            fleet_state[mid]["vib"] = 0
                            fleet_state[mid]["cur"] = 0
                            logger.info(f"KILL command executed on {mid}")
                        elif action == "LIMIT_RPM":
                            fleet_state[mid]["status"] = "THROTTLED"
                            logger.info(f"LIMIT_RPM command executed on {mid}")
            except Exception as e:
                logger.error(f"Error parsing command: {e}")
    except WebSocketDisconnect:
        logger.info("Client disconnected")
    finally:
        if websocket in connected_clients:
            connected_clients.remove(websocket)

@app.post("/generate-report")
async def generate_report(req: ReportRequest):
    if not gemini_client:
        return {"error": "Gemini API not configured"}

    machine_id = req.sensor_data.get("machine_id", "AEGIS-UNIT-01")
    location = req.sensor_data.get("location", "Sector 7")

    prompt = f"""
    You are generating a maintenance ticket for Machine ID: {machine_id} located in {location}.
    Based on the following AI diagnosis and sensor data, generate a structured maintenance ticket in JSON format unique to this unit.
    Include a 'Financial Impact' analysis. Estimate the cost of the parts saved (e.g., Bearings: $2k, Motor: $8k) and the value of the downtime prevented based on a $5,000/hour factory operating cost.
    
    Diagnosis: {req.alert_text}
    Data: {json.dumps(req.sensor_data)}
    
    Return EXACTLY a JSON object with NO markdown formatting, with the following keys:
    "ticket_id" (e.g. "TKT-{random.randint(1000, 9999)}"),
    "equipment_id" (use "{machine_id}"),
    "location" (use "{location}"),
    "priority" ("High", "MEDIUM", "Low"),
    "diagnosis_summary" (string),
    "recommended_actions" (list of strings),
    "financial_impact_analysis" (string, explaining the cost savings),
    "estimated_financial_recovery" (string, formatted as currency e.g. "$12,400.00").
    """
    try:
        response = await asyncio.to_thread(
            gemini_client.models.generate_content,
            model='gemini-2.5-flash',
            contents=prompt
        )
        text = response.text.strip()
        if text.startswith("```json"): text = text[7:]
        if text.startswith("```"): text = text[3:]
        if text.endswith("```"): text = text[:-3]
        return json.loads(text.strip())
    except Exception as e:
        logger.error(f"Generate Report Error: {e}")
        
        temp = req.sensor_data.get("temperature", 0)
        vib = req.sensor_data.get("vibration", 0)
        rpm = req.sensor_data.get("rpm", 0)

        fallback_diagnosis = "Unknown anomaly detected."
        if temp > 80:
            fallback_diagnosis = "Thermal stress detected."
        elif vib > 5:
            fallback_diagnosis = "Mechanical imbalance detected."
        elif rpm > 3400:
            fallback_diagnosis = "Over-speed condition detected."

        ticket_id = f"TIC-{machine_id}-{random.randint(1000, 9999)}"

        return {
            "ticket_id": ticket_id,
            "equipment_id": machine_id,
            "location": location,
            "priority": "CRITICAL",
            "diagnosis_summary": fallback_diagnosis,
            "recommended_actions": [
                "1. Immediate Emergency Stop.",
                "2. Perform manual inspection.",
                "3. Refer to standard operating procedures."
            ],
            "financial_impact_analysis": "Fallback: Estimated $2,000 parts replaced and $5,000 downtime prevented.",
            "estimated_financial_recovery": "$7,000.00"
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
