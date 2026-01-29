PRAGMA foreign_keys = ON;

-- Threads: top-level organizing concept for units of work
CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    current_plan_id TEXT,  -- Set after plans table exists
    git_branches TEXT,  -- comma-separated branch names
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed', 'archived'))
);

CREATE TABLE IF NOT EXISTS thread_sessions (
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (thread_id, session_id)
);

CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    created_at TEXT DEFAULT (datetime('now')),
    status TEXT DEFAULT 'accepted' CHECK(status IN ('accepted', 'in_progress', 'completed', 'abandoned')),
    description TEXT,
    plan_markdown TEXT NOT NULL,
    session_id TEXT,
    thread_id TEXT REFERENCES threads(id)
);

CREATE TABLE IF NOT EXISTS plan_steps (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'failed', 'skipped')),
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS breadcrumbs (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    step_id TEXT REFERENCES plan_steps(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now')),
    agent_type TEXT,
    summary TEXT NOT NULL,
    files_touched TEXT,
    issues TEXT,
    next_context TEXT
);

CREATE TABLE IF NOT EXISTS reflections (
    id TEXT PRIMARY KEY,
    plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now')),
    trigger TEXT CHECK(trigger IN ('manual', 'compact', 'completion', 'stop')),
    content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS corrections (
    id TEXT PRIMARY KEY,
    plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now')),
    mistake TEXT NOT NULL,
    symptoms TEXT,
    resolution TEXT,
    tags TEXT
);

CREATE TABLE IF NOT EXISTS bug_reports (
    id TEXT PRIMARY KEY,
    plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now')),
    title TEXT NOT NULL,
    repro_steps TEXT NOT NULL,
    evidence TEXT,
    status TEXT DEFAULT 'open' CHECK(status IN ('open', 'resolved', 'wontfix'))
);

CREATE TABLE IF NOT EXISTS next_ups (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_template INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived', 'launched')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_launched_at TEXT,
    launch_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS workers (
    id TEXT PRIMARY KEY,
    container_id TEXT NOT NULL,
    thread_id TEXT NOT NULL REFERENCES threads(id),
    status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'killed')),
    last_heartbeat TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    auth_mode TEXT CHECK(auth_mode IN ('env', 'config', 'oauth')),
    iteration INTEGER DEFAULT 0,
    max_iterations INTEGER DEFAULT 50
);

CREATE TABLE IF NOT EXISTS worker_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    stream TEXT NOT NULL CHECK(stream IN ('stdout', 'stderr', 'system')),
    line TEXT NOT NULL,
    iteration INTEGER
);

CREATE TABLE IF NOT EXISTS session_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_breadcrumbs_plan ON breadcrumbs(plan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_steps_plan ON plan_steps(plan_id, step_order);
CREATE INDEX IF NOT EXISTS idx_steps_status ON plan_steps(status);
CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status);
CREATE INDEX IF NOT EXISTS idx_threads_name ON threads(name);
CREATE INDEX IF NOT EXISTS idx_plans_thread ON plans(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_next_ups_status ON next_ups(status);
CREATE INDEX IF NOT EXISTS idx_next_ups_updated ON next_ups(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
CREATE INDEX IF NOT EXISTS idx_workers_thread ON workers(thread_id);
CREATE INDEX IF NOT EXISTS idx_worker_logs_worker ON worker_logs(worker_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_worker_logs_timestamp ON worker_logs(timestamp DESC);

CREATE VIEW IF NOT EXISTS active_plan AS
SELECT * FROM plans 
WHERE status IN ('accepted', 'in_progress') 
ORDER BY created_at DESC 
LIMIT 1;

CREATE VIEW IF NOT EXISTS pending_steps AS
SELECT s.*, p.description as plan_description
FROM plan_steps s
JOIN plans p ON s.plan_id = p.id
WHERE s.status = 'pending'
ORDER BY s.step_order;

CREATE VIEW IF NOT EXISTS recent_crumbs AS
SELECT
    b.*,
    p.description as plan_description,
    s.description as step_description
FROM breadcrumbs b
LEFT JOIN plans p ON b.plan_id = p.id
LEFT JOIN plan_steps s ON b.step_id = s.id
ORDER BY b.created_at DESC
LIMIT 10;

CREATE VIEW IF NOT EXISTS current_thread AS
SELECT * FROM threads
WHERE status = 'active'
ORDER BY updated_at DESC
LIMIT 1;
