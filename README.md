# Real-Time Warehouse Event Dashboard

This is a runnable MVP for a real-time warehouse dashboard. It matches the project requirements: live forklift tracking, task status monitoring, event streaming through WebSockets, alerts, heatmap visualization, and Docker deployment.

## Tech Stack

- Frontend: Next.js + React + TypeScript
- Backend: Python FastAPI
- Real-time updates: WebSocket
- Deployment: Docker Compose
- Data: Simulated in-memory warehouse events for demo purposes

## Features Implemented

1. Live Forklift Tracking
   - Forklift locations move automatically in real time.
   - Status colors: idle, moving, loading, error.

2. Task Status Monitoring
   - Active warehouse tasks are displayed in a live table.
   - Tasks update status through simulated events.

3. Event Streaming System
   - Backend broadcasts forklift, task, and alert events over WebSocket.
   - Frontend updates without page refresh.

4. Alert Notifications
   - Alerts are generated for low battery, forklift errors, and random warehouse issues.
   - Alert severity is shown in the dashboard.

5. Warehouse Heatmap Visualization
   - Dashboard shows a traffic-density grid based on forklift movement and simulated activity.

## How to Run with Docker

```bash
docker compose up --build
```

Then open:

```text
http://localhost:3000
```

Backend API:

```text
http://localhost:8000
```

## How to Run Locally Without Docker

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Useful API Endpoints

```text
GET /health
GET /api/forklifts
GET /api/tasks
GET /api/alerts
GET /api/heatmap
WS  /ws/events
```

## Suggested Next Improvements

- Replace in-memory data with PostgreSQL tables.
- Add login and role-based dashboards for operator, supervisor, and manager.
- Add Kafka for larger-scale event streaming.
- Add historical analytics and predictive congestion detection.
- Add real warehouse layout image or CAD-based floor plan.
