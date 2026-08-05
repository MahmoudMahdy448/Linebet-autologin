import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const COOLDOWN_MINUTES = parseInt(process.env.COOLDOWN_MINUTES, 10) || 10;
const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000;
const START_INDEX = process.env.START_INDEX || '1';
const HEADLESS = 'true';
const ALLOW_LIVE_RUN = 'true';
const STATUS_FILE = path.resolve(process.cwd(), process.env.STATUS_FILE || 'loop-status.json');
const GROUP = process.env.RUN_GROUP || 'A';
const LEASE_FILE = process.env.LEASE_FILE || null;
const LEASE_MS = 2 * 60 * 60 * 1000;
const HEARTBEAT_MS = 2 * 60 * 1000;
const RELEASE_BUFFER_MS = 5 * 60 * 1000;

process.env.START_INDEX = START_INDEX;
process.env.HEADLESS = HEADLESS;
process.env.ALLOW_LIVE_RUN = ALLOW_LIVE_RUN;

function writeStatus(state, nextRunAt) {
  const status = {
    state,
    startIndex: parseInt(START_INDEX, 10) || 1,
    cooldownMinutes: COOLDOWN_MINUTES,
    group: GROUP,
    run: 0,
    updatedAt: new Date().toISOString(),
    nextRunAt
  };

  try {
    if (existsSync(STATUS_FILE)) {
      const existing = JSON.parse(readFileSync(STATUS_FILE, 'utf8'));
      if (existing && typeof existing.run === 'number') {
        status.run = existing.run;
      }
    }
  } catch {
    // no previous status
  }

  writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
}

function readLease() {
  if (!existsSync(LEASE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(LEASE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeLease(owner, until) {
  writeFileSync(LEASE_FILE, JSON.stringify({ owner, until }));
}

// Group lease: alternating groups (A = 1xbet, B = linebet/melbet) each acquire
// a shared lease so only one group's browsers run at a time. While a run is
// active the owner heartbeats the lease, so the other group only takes over
// after the running group finishes and releases (or genuinely hangs past the
// heartbeat window). A release leaves owner=null with a short buffer so all
// sibling shards of the finishing group are done before the other group starts.
async function acquireGroupTurn() {
  while (true) {
    try {
      const lease = readLease();
      const now = Date.now();

      if (!lease || lease.until <= now) {
        // Free (no lease, or lease fully expired): take it.
        writeLease(GROUP, now + LEASE_MS);
        return;
      }

      if (lease.owner === GROUP) {
        // Already ours (sibling shard running). Proceed.
        return;
      }

      // Other group (or released buffer) holds it — wait until it expires.
      const waitMs = Math.max(1000, lease.until - now + 1000);
      console.log(`Group ${GROUP} waiting for group ${lease.owner ?? 'release'} lease (${Math.round(waitMs / 1000)}s)...`);
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 30_000)));
    } catch {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

function releaseGroupTurn() {
  try {
    const lease = readLease();
    if (lease && lease.owner === GROUP) {
      // Let the other group start shortly after all sibling shards finish.
      writeLease(null, Date.now() + RELEASE_BUFFER_MS);
    }
  } catch {
    // ignore
  }
}

async function runScheduled() {
  return new Promise((resolve) => {
    const child = spawn('node', ['scripts/scheduled-run.mjs'], {
      stdio: 'inherit',
      env: process.env
    });

    const heartbeat = LEASE_FILE
      ? setInterval(() => {
          try {
            const lease = readLease();
            if (!lease || lease.until <= Date.now() || lease.owner === null || lease.owner === GROUP) {
              // Still ours (sibling finished and released, or lease expired) — keep it.
              writeLease(GROUP, Date.now() + LEASE_MS);
            }
          } catch {
            // ignore
          }
        }, HEARTBEAT_MS)
      : null;

    child.on('exit', (code) => {
      clearInterval(heartbeat);
      resolve(code === 0);
    });
    child.on('error', (error) => {
      clearInterval(heartbeat);
      console.error(`Failed to start scheduled-run.mjs: ${error.message}`);
      resolve(false);
    });
  });
}

let run = 0;

writeStatus('starting', null);

while (true) {
  run += 1;
  if (LEASE_FILE) {
    console.log(`[Run #${run}] Waiting for group turn...`);
    await acquireGroupTurn();
  }
  console.log(`[Run #${run}] Starting from index ${START_INDEX}...`);

  try {
    const existing = JSON.parse(readFileSync(STATUS_FILE, 'utf8'));
    existing.run = run;
    existing.state = 'running';
    existing.updatedAt = new Date().toISOString();
    existing.nextRunAt = null;
    writeFileSync(STATUS_FILE, JSON.stringify(existing, null, 2));
  } catch {
    writeStatus('running', null);
  }

  const ok = await runScheduled();
  console.log(ok ? `[Run #${run}] Done` : `[Run #${run}] Finished with errors`);

  if (LEASE_FILE) {
    releaseGroupTurn();
  }

  const nextRunAt = new Date(Date.now() + COOLDOWN_MS).toISOString();
  writeStatus('cooldown', nextRunAt);
  console.log(`Cooling down ${COOLDOWN_MINUTES}min... (next run ${nextRunAt})`);
  await new Promise((r) => setTimeout(r, COOLDOWN_MS));
}
