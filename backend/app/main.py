import asyncio
import random
from datetime import datetime, timezone
from typing import Dict, List, Set, Optional
from uuid import uuid4

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Real-Time Warehouse Event Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WAREHOUSE_WIDTH = 100
WAREHOUSE_HEIGHT = 60

class Forklift(BaseModel):
    id: str
    operator: str
    x: float
    y: float
    status: str
    battery: int
    last_seen: str

class Task(BaseModel):
    id: str
    type: str
    forklift_id: str
    zone: str
    status: str
    priority: str
    updated_at: str

class Alert(BaseModel):
    id: str
    severity: str
    type: str
    message: str
    forklift_id: Optional[str] = None
    operator: Optional[str] = None
    task_id: Optional[str] = None
    zone: Optional[str] = None
    battery: Optional[int] = None
    status: Optional[str] = None
    recommendation: Optional[str] = None
    created_at: str

class WarehouseEvent(BaseModel):
    event_id: str
    event_type: str
    timestamp: str
    payload: dict

forklifts: Dict[str, Forklift] = {}
tasks: Dict[str, Task] = {}
alerts: List[Alert] = []
clients: Set[WebSocket] = set()

statuses = ["idle", "moving", "loading", "error"]
task_statuses = ["pending", "in-progress", "completed", "delayed"]
zones = ["A1", "A2", "B1", "B2", "C1", "C2", "Dock", "Storage"]
task_types = ["pickup", "delivery", "inventory-move", "assignment"]


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def seed_data() -> None:
    if forklifts:
        return
    for i in range(1, 7):
        fid = f"FL-{i:02d}"
        forklifts[fid] = Forklift(
            id=fid,
            operator=f"Operator {i}",
            x=random.uniform(5, WAREHOUSE_WIDTH - 5),
            y=random.uniform(5, WAREHOUSE_HEIGHT - 5),
            status=random.choice(statuses[:-1]),
            battery=random.randint(45, 98),
            last_seen=now(),
        )
    for i in range(1, 11):
        tid = f"TASK-{i:03d}"
        tasks[tid] = Task(
            id=tid,
            type=random.choice(task_types),
            forklift_id=random.choice(list(forklifts.keys())),
            zone=random.choice(zones),
            status=random.choice(task_statuses),
            priority=random.choice(["low", "medium", "high"]),
            updated_at=now(),
        )


@app.on_event("startup")
async def startup() -> None:
    seed_data()
    asyncio.create_task(simulate_events())


@app.get("/health")
def health():
    return {"ok": True, "service": "warehouse-dashboard-api"}


@app.get("/api/forklifts", response_model=List[Forklift])
def get_forklifts():
    return list(forklifts.values())


@app.get("/api/tasks", response_model=List[Task])
def get_tasks():
    return list(tasks.values())


@app.get("/api/alerts", response_model=List[Alert])
def get_alerts():
    return alerts[-20:]


@app.get("/api/heatmap")
def get_heatmap():
    grid = []
    for x in range(0, WAREHOUSE_WIDTH, 10):
        for y in range(0, WAREHOUSE_HEIGHT, 10):
            nearby = sum(1 for f in forklifts.values() if x <= f.x < x + 10 and y <= f.y < y + 10)
            grid.append({"x": x, "y": y, "density": nearby + random.randint(0, 4)})
    return {"width": WAREHOUSE_WIDTH, "height": WAREHOUSE_HEIGHT, "cells": grid}


async def broadcast(event: WarehouseEvent) -> None:
    disconnected = []
    for client in clients:
        try:
            await client.send_json(event.model_dump())
        except Exception:
            disconnected.append(client)
    for client in disconnected:
        clients.discard(client)


@app.websocket("/ws/events")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    clients.add(websocket)
    await websocket.send_json({
        "event_id": str(uuid4()),
        "event_type": "snapshot",
        "timestamp": now(),
        "payload": {
            "forklifts": [f.model_dump() for f in forklifts.values()],
            "tasks": [t.model_dump() for t in tasks.values()],
            "alerts": [a.model_dump() for a in alerts[-20:]],
        },
    })
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        clients.discard(websocket)


async def simulate_events() -> None:
    while True:
        await asyncio.sleep(1.2)
        forklift = random.choice(list(forklifts.values()))
        forklift.x = max(0, min(WAREHOUSE_WIDTH, forklift.x + random.uniform(-6, 6)))
        forklift.y = max(0, min(WAREHOUSE_HEIGHT, forklift.y + random.uniform(-4, 4)))
        forklift.status = random.choices(statuses, weights=[20, 55, 20, 5])[0]
        forklift.battery = max(5, forklift.battery - random.choice([0, 0, 1]))
        forklift.last_seen = now()
        forklifts[forklift.id] = forklift

        await broadcast(WarehouseEvent(
            event_id=str(uuid4()),
            event_type="forklift.updated",
            timestamp=now(),
            payload=forklift.model_dump(),
        ))

        if random.random() < 0.45:
            task = random.choice(list(tasks.values()))
            task.status = random.choices(task_statuses, weights=[15, 45, 30, 10])[0]
            task.updated_at = now()
            tasks[task.id] = task
            await broadcast(WarehouseEvent(
                event_id=str(uuid4()),
                event_type="task.updated",
                timestamp=now(),
                payload=task.model_dump(),
            ))

        if forklift.status == "error" or forklift.battery <= 15 or random.random() < 0.08:
            related_task = next(
                (t for t in tasks.values() if t.forklift_id == forklift.id and t.status in ["pending", "in-progress", "delayed"]),
                None
            )

            if forklift.status == "error":
                alert_type = "forklift_error"
                severity = "critical"
                recommendation = "Stop vehicle and inspect immediately."
            elif forklift.battery <= 10:
                alert_type = "low_battery"
                severity = "critical"
                recommendation = "Send forklift to charging station now."
            elif forklift.battery <= 15:
                alert_type = "low_battery"
                severity = "warning"
                recommendation = "Schedule charging soon."
            else:
                alert_type = "attention_needed"
                severity = "warning"
                recommendation = "Check vehicle condition."

            message = f"{forklift.id} requires attention."

            alert = Alert(
                id=str(uuid4())[:8],
                severity=severity,
                type=alert_type,
                message=message,
                forklift_id=forklift.id,
                operator=forklift.operator,
                task_id=related_task.id if related_task else None,
                zone=related_task.zone if related_task else None,
                battery=forklift.battery,
                status=forklift.status,
                recommendation=recommendation,
                created_at=now(),
            )

            alerts.append(alert)

            await broadcast(WarehouseEvent(
                event_id=str(uuid4()),
                event_type="alert.created",
                timestamp=now(),
                payload=alert.model_dump(),
            ))
