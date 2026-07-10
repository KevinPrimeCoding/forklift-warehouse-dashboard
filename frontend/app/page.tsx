'use client';

import { useEffect, useMemo, useState } from 'react';
import { Joyride } from 'react-joyride';

type Forklift = {
  id: string;
  operator: string;
  x: number;
  y: number;
  status: 'idle' | 'moving' | 'loading' | 'error';
  battery: number;
  last_seen: string;
};

type Task = {
  id: string;
  type: string;
  forklift_id: string;
  zone: string;
  status: string;
  priority: string;
  updated_at: string;
};

type Alert = {
  id: string;
  severity: string;
  type: string;
  message: string;
  forklift_id?: string | null;
  operator?: string | null;
  task_id?: string | null;
  zone?: string | null;
  battery?: number | null;
  status?: string | null;
  recommendation?: string | null;
  created_at: string;
};

type HeatCell = { x: number; y: number; density: number };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE || 'ws://localhost:8000/ws/events';

export default function Page() {
    const [tourRun, setTourRun] = useState(false);

  const tourSteps = [
    {
      target: '.dashboard-header',
      content:
        'Welcome to the warehouse dashboard. This page provides real-time forklift tracking, task monitoring, alerts, and analytics.',
    },
    {
      target: '.live-status',
      content:
        'This indicator shows whether the dashboard is connected to live WebSocket updates.',
    },
    {
      target: '.metric-cards',
      content:
        'These cards summarize forklift count, active tasks, delayed tasks, and critical alerts.',
    },
    {
      target: '.tracking-map',
      content:
        'This map displays the current locations and status of forklifts.',
    },
    {
      target: '.alerts-section',
      content:
        'This section shows safety issues, errors, and recommended actions.',
    },
    {
      target: '.heatmap-section',
      content:
        'The heatmap shows warehouse traffic density.',
    },
  ];


  useEffect(() => {
    const completed = localStorage.getItem(
      'forklift-dashboard-tour'
    );

    if (!completed) {
      setTourRun(true);
    }
  }, []);


  /*function handleTour(data: any) {
    if (
      data.status === STATUS.FINISHED ||
      data.status === STATUS.SKIPPED
    ) {
      localStorage.setItem(
        'forklift-dashboard-tour',
        'true'
      );

      setTourRun(false);
    }
  }*/
  const [forklifts, setForklifts] = useState<Forklift[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [heatmap, setHeatmap] = useState<HeatCell[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    async function loadInitialData() {
      const [forkliftRes, taskRes, alertRes, heatRes] = await Promise.all([
        fetch(`${API_BASE}/api/forklifts`),
        fetch(`${API_BASE}/api/tasks`),
        fetch(`${API_BASE}/api/alerts`),
        fetch(`${API_BASE}/api/heatmap`),
      ]);
      setForklifts(await forkliftRes.json());
      setTasks(await taskRes.json());
      setAlerts(await alertRes.json());
      const heatData = await heatRes.json();
      setHeatmap(heatData.cells);
    }
    loadInitialData().catch(console.error);

    const heatTimer = setInterval(async () => {
      const heatRes = await fetch(`${API_BASE}/api/heatmap`);
      const heatData = await heatRes.json();
      setHeatmap(heatData.cells);
    }, 4000);

    const ws = new WebSocket(WS_BASE);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (message) => {
      const event = JSON.parse(message.data);
      if (event.event_type === 'snapshot') {
        setForklifts(event.payload.forklifts);
        setTasks(event.payload.tasks);
        setAlerts(event.payload.alerts);
      }
      if (event.event_type === 'forklift.updated') {
        setForklifts((current) => upsert(current, event.payload));
      }
      if (event.event_type === 'task.updated') {
        setTasks((current) => upsert(current, event.payload));
      }
      if (event.event_type === 'alert.created') {
        setAlerts((current) => [event.payload, ...current].slice(0, 8));
      }
    };

    return () => {
      clearInterval(heatTimer);
      ws.close();
    };
  }, []);

  const metrics = useMemo(() => {
    const criticalForkliftIds = new Set(
      forklifts
        .filter((f) => f.status === 'error' || f.battery <= 10)
        .map((f) => f.id)
    );

    return {
      forklifts: forklifts.length,
      activeTasks: tasks.filter((task) => task.status === 'in-progress').length,
      delayed: tasks.filter((task) => task.status === 'delayed').length,
      criticalAlerts: criticalForkliftIds.size,
    };
  }, [forklifts, tasks]);

  return (
    <>
      <Joyride
        steps={tourSteps}
        run={tourRun}
        continuous
      />
    <main className="dashboard">
      <section className="header dashboard-header">
        <div>
          <h1>Real-Time Warehouse Event Dashboard</h1>
          <p>Live forklift tracking, task monitoring, alerting, and traffic heatmap analytics.</p>
        </div>
        <span className="badge live-status">{connected ? 'Live WebSocket Connected' : 'Connecting...'}</span>
      </section>

      <section className="grid metric-cards">
        <Metric title="Forklifts" value={metrics.forklifts} />
        <Metric title="Active Tasks" value={metrics.activeTasks} />
        <Metric title="Delayed Tasks" value={metrics.delayed} />
        <Metric title="Critical Alerts" value={metrics.criticalAlerts} />

        <div className="card map tracking-map">
          <h2>Live Forklift Tracking</h2>
          <div className="warehouse-map">
            {forklifts.map((forklift) => (
              <div
                key={forklift.id}
                className={`forklift ${forklift.status}`}
                title={`${forklift.id} - ${forklift.status} - ${forklift.battery}%`}
                style={{ left: `${forklift.x}%`, top: `${forklift.y / 60 * 100}%` }}
              >
                {forklift.id.replace('FL-', '')}
              </div>
            ))}
          </div>
        </div>

        <div className="card side alerts-section">
          <h2>Alerts</h2>
          <div className="alerts-list">
            {alerts.length === 0 && <p>No alerts yet.</p>}
            {alerts.slice(0, 8).map((alert) => (
              <div className="alert" key={alert.id}>
                <div className="alert-top">
                  <span className={`severity ${alert.severity}`}>{alert.severity}</span>
                  <span className="alert-time">
                    {new Date(alert.created_at).toLocaleTimeString()}
                  </span>
                </div>

                <p><strong>{alert.message}</strong></p>
                <p>Forklift: {alert.forklift_id ?? '-'}</p>
                <p>Operator: {alert.operator ?? '-'}</p>
                <p>Status: {alert.status ?? '-'}</p>
                <p>Battery: {alert.battery ?? '-'}%</p>
                <p>Task: {alert.task_id ?? '-'}</p>
                <p>Zone: {alert.zone ?? '-'}</p>
                <p>Action: {alert.recommendation ?? '-'}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card full heatmap-section">
          <h2>Task Status Monitoring</h2>
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Type</th>
                <th>Forklift</th>
                <th>Zone</th>
                <th>Status</th>
                <th>Priority</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.id}</td>
                  <td>{task.type}</td>
                  <td>{task.forklift_id}</td>
                  <td>{task.zone}</td>
                  <td><span className="status">{task.status}</span></td>
                  <td><span className={`priority ${task.priority}`}>{task.priority}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card full">
          <h2>Warehouse Heatmap Visualization</h2>
          <div className="heatmap">
            {heatmap.map((cell) => (
              <div className={`heat-cell density-${Math.min(5, cell.density)}`} key={`${cell.x}-${cell.y}`}>
                {cell.density}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
    </>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <div className="card metric">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

function upsert<T extends { id: string }>(items: T[], item: T): T[] {
  const exists = items.some((existing) => existing.id === item.id);
  if (!exists) return [item, ...items];
  return items.map((existing) => existing.id === item.id ? item : existing);
}
