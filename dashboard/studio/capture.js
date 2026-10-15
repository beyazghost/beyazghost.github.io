import { idbPut, idbGet, newAssetId } from "./idb.js";

export const supportsRecording = () =>
  typeof MediaRecorder !== "undefined" && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

export async function saveAudio(blob, meta = {}) {
  const id = newAssetId("voice");
  await idbPut(id, { blob, meta: { mimeType: blob.type, createdAt: Date.now(), ...meta } });
  return id;
}

export async function loadAudio(id) {
  const record = await idbGet(id);
  return record && record.blob ? record.blob : null;
}

export async function getAudioMeta(id) {
  const record = await idbGet(id);
  return record && record.meta ? record.meta : null;
}

export async function blobToPeaks(blob, buckets = 140) {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const data = audioBuffer.getChannelData(0);
    const block = Math.max(1, Math.floor(data.length / buckets));
    const peaks = [];
    for (let i = 0; i < buckets; i += 1) {
      let sum = 0;
      const start = i * block;
      for (let j = 0; j < block; j += 1) sum += Math.abs(data[start + j] || 0);
      peaks.push(Math.min(1, sum / block));
    }
    return { peaks, durationMs: Math.round(audioBuffer.duration * 1000), sampleRate: audioBuffer.sampleRate };
  } finally {
    if (ctx.close) ctx.close();
  }
}

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) return type;
    } catch { /* keep trying the next candidate */ }
  }
  return "";
}

export class Dictaphone {
  constructor() {
    this.recorder = null;
    this.chunks = [];
    this.stream = null;
    this.startedAt = 0;
    this.mimeType = "";
  }

  isRecording() {
    return !!(this.recorder && this.recorder.state === "recording");
  }

  async start() {
    if (!supportsRecording()) throw new Error("This browser cannot record audio.");
    if (this.isRecording()) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.mimeType = pickMimeType();
    this.recorder = new MediaRecorder(this.stream, this.mimeType ? { mimeType: this.mimeType } : undefined);
    this.recorder.ondataavailable = (event) => { if (event.data && event.data.size) this.chunks.push(event.data); };
    this.startedAt = Date.now();
    this.recorder.start();
  }

  async stop() {
    if (!this.recorder) throw new Error("Not recording.");
    const recorder = this.recorder;
    const type = recorder.mimeType || this.mimeType || "audio/webm";
    const blob = await new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(this.chunks, { type }));
      recorder.stop();
    });
    this.releaseStream();
    this.recorder = null;
    return { blob, durationMs: Date.now() - this.startedAt, mimeType: blob.type };
  }

  cancel() {
    try { if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop(); } catch { /* ignore */ }
    this.releaseStream();
    this.recorder = null;
    this.chunks = [];
  }

  releaseStream() {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
  }
}
