// Runs the Python scripts as background jobs and parses their one-JSON-per-line
// protocol (PROGRESS / QUALITY / RESULT_JSON / ERROR_JSON).
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PY_DIR = path.join(ROOT, "python");
const JOB_TTL_MS = 60 * 60 * 1000;

function pythonBin() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const venv = process.platform === "win32"
    ? path.join(ROOT, ".venv", "Scripts", "python.exe")
    : path.join(ROOT, ".venv", "bin", "python");
  return fs.existsSync(venv) ? venv : "python";
}

const jobs = new Map();
let serialJobId = null;

function httpError(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}

function view(job) {
  if (!job) return null;
  const { child, stderr, timer, ...rest } = job;
  return rest;
}

function prune() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) if (job.status !== "running" && job.startedAt < cutoff) jobs.delete(id);
}

function handleLine(job, line) {
  const space = line.indexOf(" ");
  const kind = space > 0 ? line.slice(0, space) : "";
  if (!["PROGRESS", "QUALITY", "RESULT_JSON", "ERROR_JSON"].includes(kind)) return;
  let payload;
  try {
    payload = JSON.parse(line.slice(space + 1));
  } catch {
    return;
  }
  if (kind === "PROGRESS") job.progress = payload;
  else if (kind === "QUALITY") job.quality = payload;
  else if (kind === "RESULT_JSON") job.result = payload;
  else job.error = payload;
}

function startJob({ type, script, args = [], usesSerial = false, timeoutMs = 10 * 60 * 1000, onDone }) {
  prune();
  if (usesSerial && serialJobId && jobs.get(serialJobId)?.status === "running") {
    throw httpError(409, "The earbud is busy with another recording. Stop it first.");
  }
  const job = {
    id: crypto.randomUUID(), type, status: "running", startedAt: Date.now(),
    progress: null, quality: null, result: null, error: null, stderr: [], markers: [],
  };
  const child = spawn(pythonBin(), ["-u", path.join(PY_DIR, script), ...args], {
    cwd: ROOT,
    env: { ...process.env, PYTHONIOENCODING: "utf-8", TF_CPP_MIN_LOG_LEVEL: "2", TF_ENABLE_ONEDNN_OPTS: "0" },
    windowsHide: true,
  });
  job.child = child;
  if (usesSerial) serialJobId = job.id;

  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) handleLine(job, line.trim());
  });
  child.stderr.on("data", (chunk) => {
    job.stderr.push(chunk.toString("utf8"));
    if (job.stderr.length > 40) job.stderr.shift();
  });

  const finish = (status) => {
    if (job.status !== "running") return;
    clearTimeout(job.timer);
    if (buffer.trim()) handleLine(job, buffer.trim());
    job.status = status === "stopped" ? "stopped" : job.result ? "done" : "error";
    if (job.status === "error" && !job.error) {
      const tail = job.stderr.join("").trim().split(/\r?\n/).slice(-6).join("\n");
      job.error = { code: "FAILED", message: tail || "The analysis stopped unexpectedly." };
    }
    job.finishedAt = Date.now();
    if (serialJobId === job.id) serialJobId = null;
    if (onDone) {
      try {
        onDone(job);
      } catch (err) {
        console.error(`Job ${job.id} completion handler failed:`, err);
      }
    }
  };

  child.on("close", () => finish(job.stopRequested ? "stopped" : undefined));
  child.on("error", (err) => {
    job.error = { code: "PYTHON_MISSING", message: `Could not start Python (${pythonBin()}): ${err.message}` };
    finish();
  });
  job.timer = setTimeout(() => {
    job.error = { code: "TIMEOUT", message: "The analysis took too long and was stopped." };
    child.kill();
  }, timeoutMs);

  jobs.set(job.id, job);
  return view(job);
}

function stopJob(id) {
  const job = jobs.get(id);
  if (!job) return null;
  if (job.status === "running") {
    job.stopRequested = true;
    job.child.kill();
  }
  return view(job);
}

const getJob = (id) => view(jobs.get(id));

// Task recordings: the browser marks when each game starts/ends (server clock, seconds),
// and the recording is ended gracefully so Python can still analyse it.
function addMarker(id, label, phase) {
  const job = jobs.get(id);
  if (!job || job.status !== "running") return null;
  job.markers.push({ label, phase, t: Date.now() / 1000 });
  return view(job);
}

function finishTask(id) {
  const job = jobs.get(id);
  if (!job || job.status !== "running") return view(job);
  job.child.stdin.write(`STOP ${JSON.stringify({ markers: job.markers })}
`);
  return view(job);
}

// One-shot helper for quick scripts such as listing serial ports.
function runOnce(script, args = [], timeoutMs = 15000) {
  return new Promise((resolve) => {
    const job = startJob({ type: "once", script, args, timeoutMs, onDone: (j) => resolve(view(j)) });
    if (job.status !== "running") resolve(job);
  });
}

module.exports = { startJob, stopJob, getJob, runOnce, pythonBin, addMarker, finishTask };
