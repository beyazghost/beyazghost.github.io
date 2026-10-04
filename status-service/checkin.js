#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';

const CHECKIN_INTERVAL_MS = 17 * 60 * 60 * 1000;
const STATE_FILE = path.join(os.homedir(), '.journo-checkin-state.json');
const ENV_FILE = path.join(process.cwd(), '.env');

function loadDotEnv() {
  try {
    const raw = fs.readFileSync(ENV_FILE, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...rest] = trimmed.split('=');
      const value = rest.join('=').trim();
      if (!process.env[key]) {
        process.env[key] = value.replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {
    // no .env file, ignore it
  }
}

loadDotEnv();

const API = process.env.JOURNO_STATUS_API || 'https://journo-status-service.journo-sentinel.workers.dev';
const SAFE_WORD = process.env.JOURNO_SAFE_WORD || process.env.JOURNO_SAFEWORD || 'bubbaissafe';
const DURESS_WORD = process.env.JOURNO_DURESS_WORD || 'bubba';

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.lastCheckinMs === 'number') {
      return { lastCheckinMs: parsed.lastCheckinMs };
    }
  } catch {
    // ignore and continue with defaults
  }

  return { lastCheckinMs: 0 };
}

function saveState(lastCheckinMs) {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ lastCheckinMs }, null, 2));
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function pushCheckin(safeWord) {
  if (!API || API.includes('your-worker.example.workers.dev')) {
    throw new Error('Missing JOURNO_STATUS_API. Set it to your Cloudflare Worker URL before posting a check-in.');
  }

  const body = {
    status: safeWord === DURESS_WORD ? 'overdue' : 'ok',
    window_hours: 17,
    note: safeWord === DURESS_WORD ? 'Duress trigger confirmed' : `Safe word: ${safeWord}`,
    source: 'manual',
    safe_word: safeWord,
    duress_word: DURESS_WORD,
  };

  const headers = { 'Content-Type': 'application/json' };

  const response = await fetch(`${API.replace(/\/$/, '')}/checkin`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({ error: 'Unknown error' }));
  if (!response.ok) {
    throw new Error(data.error || `Check-in failed with ${response.status}`);
  }

  return data;
}

async function doManualCheckin() {
  const raw = SAFE_WORD || await askQuestion('Enter today\'s safe word: ');
  const safeWord = String(raw).trim();
  if (!safeWord) {
    console.log('No safe word provided. Check-in cancelled.');
    return;
  }

  if (safeWord !== SAFE_WORD && safeWord !== DURESS_WORD) {
    console.log('Safe word rejected.');
    return;
  }

  try {
    const result = await pushCheckin(safeWord);
    const now = Date.now();
    saveState(now);
    console.log('Check-in pushed successfully.');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Check-in failed:', error.message);
    console.log('The local prompt will retry on the next cycle.');
  }
}

async function runLoop() {
  const state = loadState();
  const now = Date.now();
  const elapsed = now - state.lastCheckinMs;

  if (!state.lastCheckinMs || elapsed >= CHECKIN_INTERVAL_MS) {
    await doManualCheckin();
  } else {
    const waitMs = CHECKIN_INTERVAL_MS - elapsed;
    console.log(`Last safe-word check-in was ${formatDuration(elapsed)} ago.`);
    console.log(`Next prompt in ${formatDuration(waitMs)}.`);
  }

  setInterval(async () => {
    console.log('\n17-hour check-in reminder triggered.');
    await doManualCheckin();
  }, CHECKIN_INTERVAL_MS);

  // Keep the process alive.
  setInterval(() => {}, 60 * 1000);
}

if (process.argv.includes('--once')) {
  doManualCheckin();
} else {
  runLoop();
}
