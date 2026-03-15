import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// ─── Simulation Engine ──────────────────────────────────────────────────────
// Simulates the Jacbot runtime so the dashboard has live data to display.

const AGENT_CONFIGS = [
  { id: "lead", name: "Lead Agent", role: "lead", runtime: "claude-code", budget: 60, capabilities: ["typescript", "api-design", "architecture"], color: "#6366f1" },
  { id: "worker-1", name: "Worker Alpha", role: "worker", runtime: "claude-code", budget: 40, capabilities: ["typescript", "testing"], color: "#06b6d4" },
  { id: "scout", name: "Scout Agent", role: "scout", runtime: "opencode", budget: 20, capabilities: ["research", "analysis"], color: "#f59e0b" },
];

const TASK_TEMPLATES = [
  { title: "Project setup", desc: "Initialize project with TypeScript and ESLint", priority: "high", tags: ["setup"], wave: 0 },
  { title: "Database schema", desc: "Create PostgreSQL schema with Drizzle ORM", priority: "high", tags: ["database"], wave: 1 },
  { title: "Auth middleware", desc: "JWT-based auth with bcrypt password hashing", priority: "high", tags: ["auth"], wave: 2 },
  { title: "CRUD endpoints", desc: "RESTful CRUD with pagination and validation", priority: "normal", tags: ["api"], wave: 3 },
  { title: "WebSocket layer", desc: "Real-time events via WebSocket connections", priority: "normal", tags: ["websocket"], wave: 3 },
  { title: "Integration tests", desc: "Test suite with Vitest and Supertest", priority: "normal", tags: ["testing"], wave: 4 },
  { title: "Rate limiting", desc: "Token bucket rate limiter middleware", priority: "low", tags: ["security"], wave: 4 },
  { title: "API documentation", desc: "OpenAPI spec generation with Swagger UI", priority: "low", tags: ["docs"], wave: 5 },
];

const MEMORY_SAMPLES = [
  { content: "Auth module uses bcrypt with 12 salt rounds for password hashing", scope: "project", tags: ["auth", "security"] },
  { content: "Database connections pooled via pg-pool with max 20 connections", scope: "project", tags: ["database"] },
  { content: "Task setup completed: Express server bootstrapped with TS 5.4", scope: "session", tags: ["setup"] },
  { content: "Decided to use Drizzle ORM over Prisma for lighter bundle size", scope: "project", tags: ["decision", "database"] },
  { content: "JWT tokens expire after 15 minutes, refresh tokens after 7 days", scope: "project", tags: ["auth"] },
  { content: "Task schema completed: 4 tables created with proper indexes", scope: "session", tags: ["database"] },
  { content: "Validation layer uses Zod schemas shared between client and server", scope: "project", tags: ["validation"] },
  { content: "WebSocket auth uses same JWT middleware as REST endpoints", scope: "project", tags: ["websocket", "auth"] },
  { content: "Test database uses Docker testcontainers for isolation", scope: "project", tags: ["testing"] },
  { content: "Rate limiter allows 100 requests per minute per IP by default", scope: "project", tags: ["security"] },
];

const DECISIONS = [
  "Chose Express over Fastify for wider middleware ecosystem",
  "Using Drizzle ORM — lighter than Prisma, better SQL control",
  "bcrypt with 12 rounds balances security and performance",
  "Zod for runtime validation — shares types with frontend",
  "Token bucket over sliding window for rate limiting simplicity",
  "WebSocket auth reuses JWT middleware — single auth path",
];

function createInitialState() {
  const tasks = TASK_TEMPLATES.map((t, i) => ({
    id: `task_${i + 1}`,
    ...t,
    status: "pending",
    assigneeId: null,
    cost: 0,
    progress: 0,
  }));
  const agents = AGENT_CONFIGS.map(a => ({
    ...a,
    status: "idle",
    currentTaskId: null,
    cost: 0,
    tokensUsed: 0,
    tasksCompleted: 0,
  }));
  return { tasks, agents, memories: [], events: [], decisions: [], currentWave: 0, totalCost: 0, startTime: Date.now() };
}

// ─── UI Components ──────────────────────────────────────────────────────────

const STATUS_COLORS = {
  pending: "#64748b",
  queued: "#a78bfa",
  in_progress: "#3b82f6",
  review: "#f59e0b",
  completed: "#22c55e",
  failed: "#ef4444",
  idle: "#64748b",
  working: "#3b82f6",
  budget_exceeded: "#ef4444",
};

const SCOPE_COLORS = {
  task: "#60a5fa",
  session: "#a78bfa",
  project: "#34d399",
};

function StatusBadge({ status }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 9999,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      background: `${STATUS_COLORS[status] || "#64748b"}22`,
      color: STATUS_COLORS[status] || "#64748b",
      border: `1px solid ${STATUS_COLORS[status] || "#64748b"}44`,
    }}>
      {status.replace("_", " ")}
    </span>
  );
}

function ScopeBadge({ scope }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 9999,
      fontSize: 10,
      fontWeight: 600,
      textTransform: "uppercase",
      background: `${SCOPE_COLORS[scope] || "#64748b"}22`,
      color: SCOPE_COLORS[scope] || "#64748b",
    }}>
      {scope}
    </span>
  );
}

function Card({ title, children, style, headerRight }) {
  return (
    <div style={{
      background: "#0f172a",
      borderRadius: 12,
      border: "1px solid #1e293b",
      overflow: "hidden",
      ...style,
    }}>
      <div style={{
        padding: "14px 18px",
        borderBottom: "1px solid #1e293b",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1 }}>
          {title}
        </h3>
        {headerRight}
      </div>
      <div style={{ padding: "14px 18px" }}>
        {children}
      </div>
    </div>
  );
}

function ProgressBar({ value, max, color = "#6366f1", height = 6 }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ width: "100%", background: "#1e293b", borderRadius: height, height, overflow: "hidden" }}>
      <div style={{
        width: `${pct}%`,
        height: "100%",
        background: pct > 80 ? "#ef4444" : color,
        borderRadius: height,
        transition: "width 0.5s ease",
      }} />
    </div>
  );
}

function Pulse({ color = "#22c55e", active = true }) {
  if (!active) return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#475569" }} />;
  return (
    <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}>
      <span style={{
        position: "absolute",
        inset: 0,
        borderRadius: "50%",
        background: color,
        opacity: 0.4,
        animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite",
      }} />
      <span style={{ position: "relative", display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color }} />
    </span>
  );
}

function AgentPanel({ agents }) {
  return (
    <Card title="Agents">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {agents.map(agent => (
          <div key={agent.id} style={{
            padding: 12,
            borderRadius: 8,
            background: "#1e293b",
            border: `1px solid ${agent.status === "working" ? agent.color + "66" : "#334155"}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Pulse color={agent.color} active={agent.status === "working"} />
                <span style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 13 }}>{agent.name}</span>
                <span style={{ color: "#64748b", fontSize: 11 }}>{agent.runtime}</span>
              </div>
              <StatusBadge status={agent.status} />
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>
              <span>Role: <span style={{ color: "#cbd5e1" }}>{agent.role}</span></span>
              <span>Tasks done: <span style={{ color: "#cbd5e1" }}>{agent.tasksCompleted}</span></span>
              <span>Tokens: <span style={{ color: "#cbd5e1" }}>{(agent.tokensUsed / 1000).toFixed(1)}k</span></span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
              <span style={{ color: "#64748b", whiteSpace: "nowrap" }}>${agent.cost.toFixed(2)} / ${agent.budget}</span>
              <ProgressBar value={agent.cost} max={agent.budget} color={agent.color} />
            </div>
            {agent.currentTaskId && (
              <div style={{ marginTop: 6, fontSize: 11, color: agent.color }}>
                Working on: {agent.currentTaskId}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function WaveTimeline({ tasks, currentWave }) {
  const waves = {};
  tasks.forEach(t => {
    if (!waves[t.wave]) waves[t.wave] = [];
    waves[t.wave].push(t);
  });

  return (
    <Card title="Execution Waves" headerRight={
      <span style={{ fontSize: 11, color: "#94a3b8" }}>Current: Wave {currentWave}</span>
    }>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {Object.entries(waves).map(([wave, waveTasks]) => (
          <div key={wave} style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            opacity: Number(wave) < currentWave ? 0.5 : 1,
          }}>
            <div style={{
              minWidth: 50,
              padding: "4px 0",
              fontSize: 11,
              fontWeight: 700,
              color: Number(wave) === currentWave ? "#6366f1" : "#64748b",
              textAlign: "right",
            }}>
              Wave {wave}
            </div>
            <div style={{
              width: 2,
              background: Number(wave) <= currentWave ? "#6366f1" : "#334155",
              minHeight: 40,
              borderRadius: 1,
              position: "relative",
              flexShrink: 0,
            }}>
              <div style={{
                position: "absolute",
                top: 6,
                left: -4,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: Number(wave) === currentWave ? "#6366f1" : Number(wave) < currentWave ? "#22c55e" : "#334155",
                border: "2px solid #0f172a",
              }} />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, flex: 1 }}>
              {waveTasks.map(task => (
                <div key={task.id} style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: `${STATUS_COLORS[task.status]}15`,
                  border: `1px solid ${STATUS_COLORS[task.status]}33`,
                  fontSize: 12,
                  color: "#e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: STATUS_COLORS[task.status],
                    flexShrink: 0,
                  }} />
                  {task.title}
                  {task.assigneeId && <span style={{ fontSize: 10, color: "#64748b" }}>({task.assigneeId})</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MemoryPanel({ memories }) {
  const containerRef = useRef(null);
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [memories.length]);

  return (
    <Card title="Memory Store" headerRight={
      <div style={{ display: "flex", gap: 8 }}>
        {["task", "session", "project"].map(scope => {
          const count = memories.filter(m => m.scope === scope).length;
          return (
            <span key={scope} style={{ fontSize: 10, color: SCOPE_COLORS[scope] }}>
              {scope}: {count}
            </span>
          );
        })}
      </div>
    }>
      <div ref={containerRef} style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {memories.length === 0 && (
          <div style={{ color: "#475569", fontSize: 12, textAlign: "center", padding: 20 }}>
            No memories stored yet...
          </div>
        )}
        {memories.map((mem, i) => (
          <div key={i} style={{
            padding: "8px 10px",
            borderRadius: 6,
            background: "#1e293b",
            borderLeft: `3px solid ${SCOPE_COLORS[mem.scope]}`,
            animation: i === memories.length - 1 ? "fadeIn 0.4s ease" : "none",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <ScopeBadge scope={mem.scope} />
              <span style={{ fontSize: 10, color: "#475569" }}>{mem.time}</span>
            </div>
            <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.4 }}>{mem.content}</div>
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              {mem.tags.map(tag => (
                <span key={tag} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "#334155", color: "#94a3b8" }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function EventFeed({ events }) {
  const containerRef = useRef(null);
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events.length]);

  const iconMap = {
    dispatch: "\u25B6",
    complete: "\u2713",
    memory: "\u2B50",
    decision: "\u26A1",
    budget: "\u26A0",
    wave: "\u279C",
  };

  return (
    <Card title="Live Event Feed">
      <div ref={containerRef} style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {events.length === 0 && (
          <div style={{ color: "#475569", fontSize: 12, textAlign: "center", padding: 20 }}>
            Waiting for events...
          </div>
        )}
        {events.map((ev, i) => (
          <div key={i} style={{
            display: "flex", gap: 8, fontSize: 12, padding: "4px 0",
            borderBottom: "1px solid #1e293b",
            animation: i === events.length - 1 ? "fadeIn 0.3s ease" : "none",
          }}>
            <span style={{ color: "#475569", fontSize: 10, minWidth: 48, fontFamily: "monospace" }}>{ev.time}</span>
            <span style={{ width: 16, textAlign: "center" }}>{iconMap[ev.type] || "\u2022"}</span>
            <span style={{ color: "#cbd5e1" }}>{ev.message}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CostChart({ agents }) {
  const data = agents.map(a => ({ name: a.name.split(" ")[0], cost: Number(a.cost.toFixed(2)), budget: a.budget }));
  return (
    <Card title="Budget Usage">
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 0, bottom: 0 }}>
          <XAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} domain={[0, "dataMax"]} />
          <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} width={55} />
          <Tooltip
            contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12, color: "#e2e8f0" }}
            formatter={(val) => [`$${val}`, "Spent"]}
          />
          <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => <Cell key={i} fill={AGENT_CONFIGS[i]?.color || "#6366f1"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function DecisionsPanel({ decisions }) {
  return (
    <Card title="Decision Log">
      <div style={{ maxHeight: 140, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {decisions.length === 0 && (
          <div style={{ color: "#475569", fontSize: 12, textAlign: "center", padding: 16 }}>
            No decisions recorded yet...
          </div>
        )}
        {decisions.map((d, i) => (
          <div key={i} style={{
            display: "flex", gap: 8, fontSize: 12, color: "#cbd5e1",
            padding: "6px 8px", background: "#1e293b", borderRadius: 6,
            animation: i === decisions.length - 1 ? "fadeIn 0.3s ease" : "none",
          }}>
            <span style={{ color: "#f59e0b", flexShrink: 0 }}>{"\u26A1"}</span>
            {d}
          </div>
        ))}
      </div>
    </Card>
  );
}

function StatsBar({ state }) {
  const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const completed = state.tasks.filter(t => t.status === "completed").length;
  const total = state.tasks.length;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(5, 1fr)",
      gap: 12,
      marginBottom: 16,
    }}>
      {[
        { label: "Tasks", value: `${completed}/${total}`, sub: "completed" },
        { label: "Agents", value: state.agents.filter(a => a.status === "working").length, sub: "active" },
        { label: "Memories", value: state.memories.length, sub: "stored" },
        { label: "Cost", value: `$${state.totalCost.toFixed(2)}`, sub: "total spend" },
        { label: "Elapsed", value: `${mins}:${secs.toString().padStart(2, "0")}`, sub: "minutes" },
      ].map((s, i) => (
        <div key={i} style={{
          padding: "14px 16px",
          background: "#0f172a",
          borderRadius: 10,
          border: "1px solid #1e293b",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9" }}>{s.value}</div>
          <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>
            {s.label} <span style={{ color: "#475569" }}>{s.sub}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────

export default function JacbotDashboard() {
  const [state, setState] = useState(createInitialState);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const tickRef = useRef(null);
  const stepRef = useRef(0);

  const getTimeStr = useCallback(() => {
    const elapsed = Date.now() - state.startTime;
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, [state.startTime]);

  const tick = useCallback(() => {
    setState(prev => {
      const s = { ...prev, agents: prev.agents.map(a => ({ ...a })), tasks: prev.tasks.map(t => ({ ...t })), memories: [...prev.memories], events: [...prev.events], decisions: [...prev.decisions] };
      const step = stepRef.current++;
      const time = getTimeStr();

      // Find tasks that can be dispatched
      const pendingInWave = s.tasks.filter(t => t.status === "pending" && t.wave === s.currentWave);
      const idleAgents = s.agents.filter(a => a.status === "idle");

      // Dispatch tasks to idle agents
      for (const task of pendingInWave) {
        if (idleAgents.length === 0) break;
        const agent = idleAgents.shift();
        task.status = "in_progress";
        task.assigneeId = agent.id;
        agent.status = "working";
        agent.currentTaskId = task.id;
        s.events.push({ time, type: "dispatch", message: `${agent.name} started "${task.title}"` });
      }

      // Progress working agents
      for (const agent of s.agents) {
        if (agent.status !== "working") continue;
        const task = s.tasks.find(t => t.id === agent.currentTaskId);
        if (!task) continue;

        // Simulate progress
        const increment = (8 + Math.random() * 12);
        task.progress = Math.min(task.progress + increment, 100);
        const tokenBatch = Math.floor(800 + Math.random() * 1200);
        const costBatch = tokenBatch * 0.000015;
        agent.tokensUsed += tokenBatch;
        agent.cost += costBatch;
        s.totalCost += costBatch;

        // Random memory generation while working
        if (Math.random() < 0.25 && MEMORY_SAMPLES.length > 0) {
          const memIdx = step % MEMORY_SAMPLES.length;
          const sample = MEMORY_SAMPLES[memIdx];
          if (!s.memories.find(m => m.content === sample.content)) {
            s.memories.push({ ...sample, time, source: agent.name });
            s.events.push({ time, type: "memory", message: `Memory stored: "${sample.content.slice(0, 50)}..."` });
          }
        }

        // Task completion
        if (task.progress >= 100) {
          task.status = "completed";
          agent.status = "idle";
          agent.currentTaskId = null;
          agent.tasksCompleted++;
          s.events.push({ time, type: "complete", message: `"${task.title}" completed by ${agent.name}` });

          // Maybe log a decision
          if (Math.random() < 0.6 && DECISIONS.length > s.decisions.length) {
            const dec = DECISIONS[s.decisions.length];
            s.decisions.push(dec);
            s.events.push({ time, type: "decision", message: `Decision: ${dec}` });
          }

          // Check if wave is done
          const waveComplete = s.tasks.filter(t => t.wave === s.currentWave).every(t => t.status === "completed");
          if (waveComplete) {
            const maxWave = Math.max(...s.tasks.map(t => t.wave));
            if (s.currentWave < maxWave) {
              s.currentWave++;
              s.events.push({ time, type: "wave", message: `Wave ${s.currentWave} started` });
            }
          }
        }
      }

      // Check if all done
      if (s.tasks.every(t => t.status === "completed")) {
        s.events.push({ time, type: "complete", message: "All tasks completed!" });
        setRunning(false);
      }

      return s;
    });
  }, [getTimeStr]);

  useEffect(() => {
    if (running) {
      tickRef.current = setInterval(tick, 1200 / speed);
    }
    return () => clearInterval(tickRef.current);
  }, [running, speed, tick]);

  // Update elapsed time display
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleStart = () => {
    if (state.tasks.every(t => t.status === "completed")) {
      setState(createInitialState());
      stepRef.current = 0;
    }
    setRunning(true);
  };

  const allDone = state.tasks.every(t => t.status === "completed");

  return (
    <div style={{
      minHeight: "100vh",
      background: "#020617",
      color: "#e2e8f0",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      padding: "20px 24px",
    }}>
      <style>{`
        @keyframes ping { 0% { transform: scale(1); opacity: 0.4; } 75%, 100% { transform: scale(2.5); opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 800, color: "white",
          }}>J</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>Jacbot Dashboard</h1>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Agent Orchestration Monitor</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#94a3b8" }}>
            Speed:
            {[1, 2, 4].map(s => (
              <button key={s} onClick={() => setSpeed(s)} style={{
                padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                background: speed === s ? "#6366f1" : "#1e293b", color: speed === s ? "white" : "#94a3b8",
                fontSize: 11, fontWeight: 600,
              }}>{s}x</button>
            ))}
          </div>
          <button onClick={running ? () => setRunning(false) : handleStart} style={{
            padding: "8px 20px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            background: running ? "#dc2626" : allDone ? "#6366f1" : "#22c55e",
            color: "white",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}>
            {running ? "\u23F8 Pause" : allDone ? "\u21BB Reset & Run" : "\u25B6 Start Simulation"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <StatsBar state={state} />

      {/* Main Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr 340px", gap: 16 }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <AgentPanel agents={state.agents} />
          <CostChart agents={state.agents} />
        </div>

        {/* Center column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <WaveTimeline tasks={state.tasks} currentWave={state.currentWave} />
          <EventFeed events={state.events} />
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <MemoryPanel memories={state.memories} />
          <DecisionsPanel decisions={state.decisions} />
        </div>
      </div>
    </div>
  );
}
