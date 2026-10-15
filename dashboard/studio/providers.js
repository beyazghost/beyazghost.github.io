const KEYS_KEY = "zorro-studio-keys-v1";
const LEDGER_KEY = "zorro-studio-ledger-v1";
const ACTIVE_KEY = "zorro-studio-active-v1";
const LEDGER_CAP = 200;

export const cloudDescriptors = {
  groq: {
    id: "groq", label: "Groq", mode: "cloud", needsKey: true,
    capabilities: ["transcribe", "edit"],
    baseUrl: "https://api.groq.com/openai/v1",
    transcribeModel: "whisper-large-v3",
    textModel: "llama-3.3-70b-versatile",
    keyHint: "gsk_…", docsUrl: "https://console.groq.com/keys",
  },
  gemini: {
    id: "gemini", label: "Google Gemini", mode: "cloud", needsKey: true,
    capabilities: ["edit"],
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    textModel: "gemini-1.5-flash",
    keyHint: "AIza…", docsUrl: "https://aistudio.google.com/apikey",
  },
  hf: {
    id: "hf", label: "Hugging Face", mode: "cloud", needsKey: true,
    capabilities: ["image"],
    baseUrl: "https://api-inference.huggingface.co/models",
    imageModel: "black-forest-labs/FLUX.1-schnell",
    keyHint: "hf_…", docsUrl: "https://huggingface.co/settings/tokens",
  },
  pollinations: {
    id: "pollinations", label: "Pollinations", mode: "cloud", needsKey: false,
    capabilities: ["image"],
    baseUrl: "https://image.pollinations.ai/prompt",
    docsUrl: "https://pollinations.ai",
  },
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function allKeys() {
  return readJson(KEYS_KEY, {}) || {};
}

export function getKey(providerId) {
  const entry = allKeys()[providerId];
  return entry && typeof entry === "string" ? entry : "";
}

export function setKey(providerId, value) {
  const keys = allKeys();
  const trimmed = String(value || "").trim();
  if (trimmed) keys[providerId] = trimmed;
  else delete keys[providerId];
  return writeJson(KEYS_KEY, keys);
}

export function clearKey(providerId) {
  const keys = allKeys();
  delete keys[providerId];
  return writeJson(KEYS_KEY, keys);
}

export function readLedger() {
  const ledger = readJson(LEDGER_KEY, []);
  return Array.isArray(ledger) ? ledger : [];
}

export function logSend(entry) {
  const record = {
    time: new Date().toISOString(),
    sibling: entry.sibling || "cloud",
    capability: entry.capability || "?",
    provider: entry.provider || "",
    endpoint: entry.endpoint || "",
    bytes: Number.isFinite(entry.bytes) ? entry.bytes : null,
    note: entry.note || "",
  };
  const ledger = [record, ...readLedger()].slice(0, LEDGER_CAP);
  writeJson(LEDGER_KEY, ledger);
  return record;
}

export function clearLedger() {
  return writeJson(LEDGER_KEY, []);
}

const siblings = new Map();
const activeListeners = new Set();

export function registerSibling(sibling) {
  siblings.set(sibling.id, sibling);
  return sibling;
}

export function listSiblings() {
  return [...siblings.values()];
}

export function getSibling(id) {
  return siblings.get(id) || null;
}

export function getActiveId() {
  const id = readJson(ACTIVE_KEY, "");
  return typeof id === "string" ? id : "";
}

export function setActiveId(id) {
  writeJson(ACTIVE_KEY, id);
  for (const listener of activeListeners) {
    try { listener(id, siblings.get(id) || null); } catch { /* listener failures must not break others */ }
  }
}

export function onActiveChange(listener) {
  activeListeners.add(listener);
  return () => activeListeners.delete(listener);
}

export function requireSibling(id) {
  const sibling = getSibling(id);
  if (!sibling) throw new Error(`No sibling named "${id}" is registered.`);
  return sibling;
}

export function describe(entry) {
  const meta = cloudDescriptors[entry.id] || {};
  const caps = entry.capabilities || meta.capabilities || [];
  return {
    id: entry.id,
    label: entry.name || meta.label || entry.id,
    mode: entry.mode || meta.mode || "cloud",
    capabilities: caps,
    needsKey: meta.needsKey ?? false,
    description: entry.description || "",
  };
}
