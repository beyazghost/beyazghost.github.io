import {
  getKey, setKey, cloudDescriptors, registerSibling, setActiveId, getActiveId,
  getSibling, readLedger, clearLedger,
} from "./providers.js";
import {
  supportsRecording, saveAudio, loadAudio, blobToPeaks, Dictaphone,
} from "./capture.js";
import { createLocalSibling, featureDetect } from "./local-sibling.js";
import { createCloudSibling } from "./cloud-sibling.js";
import { attachOwnImage, resolveArt } from "./images.js";
import { Weaver } from "./weave.js";
import {
  renderArticleHtml, extFromMime, assetHref, heroAbsolute, renderBlocksHtml,
} from "./render.js";
import {
  SITE, makeSlug, validSlug, escapeHtml, canonicalUrl, categoryInfo,
  articleCard, insertProjectCard, insertArchiveCard, sitemapWithArticle, sitemapArticleEntry,
} from "./site-map.js";
import { listenPlayerMarkup } from "./media.js";

const $ = (id) => document.getElementById(id);

const els = {};
const local = registerSibling(createLocalSibling());
const cloud = registerSibling(createCloudSibling());

const state = {
  mode: "local",
  folder: null,
  transcript: "",
  weave: null,
  spine: "",
  angles: [],
  blocks: [],
  audioId: "",
  audioBlob: null,
  audioObjectUrl: "",
  audioMeta: null,
  bedBlob: null,
  bedObjectUrl: "",
  recording: false,
  timerId: 0,
  meter: null,
};

function status(el, message, kind = "") {
  el.textContent = message;
  el.className = `status${kind ? ` ${kind}` : ""}`;
}

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDuration(ms) {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function activeSibling() {
  return getSibling(getActiveId());
}

function featureList(mode) {
  const features = [];
  const push = (ok, label, detail) => features.push({ ok, label, detail });
  if (mode === "local") {
    const feat = featureDetect();
    push(true, "Transcribe", "on-device Whisper, offline");
    push(true, "Edit / reflect / polish", "on-device writing model (large one-time download)");
    push(feat.webgpu, "WebGPU", feat.webgpu ? "accelerated local models" : "absent — local models fall back to CPU and will be slower");
  } else if (mode === "cloud") {
    const groq = !!getKey("groq");
    const geminiOrGroq = groq || !!getKey("gemini");
    const hf = !!getKey("hf");
    push(groq, "Transcribe", groq ? "Groq whisper-large-v3" : "add a Groq key to transcribe");
    push(geminiOrGroq, "Edit / reflect / polish", getKey("gemini") ? "Gemini Flash" : groq ? "Groq Llama" : "add a Gemini or Groq key");
    push(hf || true, "Illustrate", hf ? "FLUX.1-schnell on Hugging Face" : "keyless Pollinations (quality varies) — add an HF key for FLUX");
    push(true, "On-device field bed", "always available (synth runs in the browser)");
  } else {
    push(false, "No AI", "you type the transcript and hand-weave it; images & field bed still work");
  }
  return features;
}

function renderFeatures() {
  const list = document.createElement("ul");
  for (const item of featureList(state.mode)) {
    const li = document.createElement("li");
    li.className = item.ok ? "is-ok" : "is-no";
    li.textContent = `${item.label} — ${item.detail}`;
    list.append(li);
  }
  els.features.replaceChildren(list);
  const sibling = activeSibling();
  const weaveEnabled = state.mode !== "none" || state.transcript.trim().length > 0;
  els.weaveRun.disabled = !weaveEnabled;
  els.weaveRun.textContent = state.mode === "none" ? "Hand-weave my transcript" : "Reflect on my dictation";
}

function renderCloudKeys() {
  const wrap = document.createElement("div");
  for (const descriptor of Object.values(cloudDescriptors)) {
    const held = getKey(descriptor.id);
    if (!descriptor.needsKey) {
      const note = document.createElement("p");
      note.className = "hint";
      note.textContent = `${descriptor.label} is keyless and ready to illustrate.`;
      wrap.append(note);
      continue;
    }
    const label = document.createElement("label");
    label.textContent = `${descriptor.label} key ${held ? "(saved)" : ""}`;
    label.htmlFor = `key-${descriptor.id}`;
    const input = document.createElement("input");
    input.id = `key-${descriptor.id}`;
    input.type = "password";
    input.placeholder = descriptor.keyHint || "paste key";
    input.autocomplete = "off";
    input.value = held;
    input.addEventListener("input", () => {
      setKey(descriptor.id, input.value);
      label.textContent = `${descriptor.label} key ${input.value ? "(saved)" : ""}`;
      syncActive();
      renderFeatures();
      renderLedger();
    });
    const docs = document.createElement("p");
    docs.className = "hint";
    const link = document.createElement("a");
    link.href = descriptor.docsUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "get a free key →";
    docs.append(link);
    const box = document.createElement("div");
    box.append(label, input, docs);
    wrap.append(box);
  }
  els.cloudKeys.replaceChildren(wrap);
}

function renderLedger() {
  const ledger = readLedger();
  if (!ledger.length) {
    els.ledger.textContent = "Nothing has left this browser yet.";
    return;
  }
  const counts = {};
  for (const entry of ledger) counts[entry.provider || entry.sibling] = (counts[entry.provider || entry.sibling] || 0) + 1;
  const summary = Object.entries(counts).map(([provider, count]) => `${count} → ${provider}`).join(", ");
  const node = document.createElement("span");
  node.textContent = `Sent ${ledger.length} time${ledger.length === 1 ? "" : "s"} (${summary}). Latest: ${ledger[0].capability} to ${ledger[0].provider || ledger[0].sibling} just now. `;
  const clear = document.createElement("button");
  clear.type = "button";
  clear.textContent = "clear";
  clear.addEventListener("click", () => { clearLedger(); renderLedger(); });
  node.append(clear);
  els.ledger.replaceChildren(node);
}

function syncActive() {
  const id = state.mode === "local" ? "local" : state.mode === "cloud" ? "cloud" : "";
  setActiveId(id);
}

function setMode(mode) {
  state.mode = mode;
  syncActive();
  renderFeatures();
}

async function transcribe(blob) {
  const sibling = activeSibling();
  if (!sibling) {
    status(els.weaveStatus, "Recorded. Type or paste your transcript (no sibling selected).", "");
    return "";
  }
  if (!sibling.capabilities.includes("transcribe")) {
    status(els.weaveStatus, "This sibling can't transcribe. Choose On-device, or add a Groq key for the cloud sibling.", "error");
    return "";
  }
  status(els.weaveStatus, "Transcribing your dictation…", "");
  const result = await sibling.transcribe(blob, {
    language: undefined,
    onStatus: (message) => status(els.weaveStatus, message, ""),
  });
  els.transcript.value = result.text || "";
  state.transcript = result.text || "";
  status(els.weaveStatus, `Transcribed ${result.text ? result.text.split(/\s+/).length : 0} words. Edit freely, then reflect.`, "ok");
  return result.text || "";
}

function drawPeaks(canvas, peaks) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f8c033";
  const gap = 1;
  const barWidth = Math.max(1, Math.floor(width / Math.max(1, peaks.length)) - gap);
  peaks.forEach((peak, index) => {
    const barHeight = Math.max(2, peak * (height - 8));
    const x = index * (barWidth + gap);
    ctx.fillRect(x, (height - barHeight) / 2, barWidth, barHeight);
  });
}

function startMeter() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx || !state.meterStream) return;
  const ctx = new AudioCtx();
  state.meterContext = ctx;
  const source = ctx.createMediaStreamSource(state.meterStream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 64;
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  const canvas = els.wave;
  const dctx = canvas.getContext("2d");
  const loop = () => {
    if (!state.recording) {
      if (state.meterContext) {
        state.meterContext.close();
        state.meterContext = null;
      }
      return;
    }
    analyser.getByteFrequencyData(data);
    const peaks = Array.from(data, (value) => value / 255);
    drawPeaks(canvas, peaks);
    state.meter = requestAnimationFrame(loop);
  };
  loop();
}

async function startRecording() {
  if (!supportsRecording()) {
    status(els.weaveStatus, "This browser can't record. Type your transcript instead.", "error");
    return;
  }
  status(els.weaveStatus, state.mode === "local" ? "Starting the mic… (first on-device transcription downloads a small Whisper model)." : "Starting the mic…", "");
  const d = new Dictaphone();
  try {
    await d.start();
  } catch (error) {
    status(els.weaveStatus, error?.name === "NotAllowedError" ? "Microphone access was denied." : (error?.message || "Could not start recording."), "error");
    return;
  }
  state.recording = true;
  state.recorder = d;
  state.meterStream = d.stream;
  state.recordStart = Date.now();
  els.recStart.disabled = true;
  els.recStop.disabled = false;
  els.recCancel.disabled = false;
  status(els.weaveStatus, "Recording… speak your field report.", "");
  state.timerId = window.setInterval(() => { els.timer.textContent = formatDuration(Date.now() - state.recordStart); }, 250);
  startMeter();
}

async function stopRecording() {
  if (!state.recorder) return;
  state.recording = false;
  window.clearInterval(state.timerId);
  if (state.meter) {
    cancelAnimationFrame(state.meter);
    state.meter = null;
  }
  if (state.meterContext) {
    state.meterContext.close();
    state.meterContext = null;
  }
  els.recStart.disabled = false;
  els.recStop.disabled = true;
  els.recCancel.disabled = true;
  let recording;
  try {
    recording = await state.recorder.stop();
  } catch (error) {
    status(els.weaveStatus, error?.message || "Could not finish recording.", "error");
    return;
  }
  state.audioBlob = recording.blob;
  state.audioId = await saveAudio(recording.blob, { durationMs: recording.durationMs });
  state.audioMeta = { durationMs: recording.durationMs };
  state.audioObjectUrl = URL.createObjectURL(recording.blob);
  els.timer.textContent = formatDuration(recording.durationMs);
  try {
    const { peaks } = await blobToPeaks(recording.blob);
    drawPeaks(els.wave, peaks.length ? peaks : new Array(140).fill(0.02));
  } catch {
    drawPeaks(els.wave, new Array(140).fill(0.02));
  }
  if (state.mode === "none") {
    status(els.weaveStatus, `Saved your voice (${formatDuration(recording.durationMs)}). Type the transcript, then hand-weave.`, "ok");
  } else {
    await transcribe(recording.blob);
  }
}

function cancelRecording() {
  state.recording = false;
  window.clearInterval(state.timerId);
  if (state.meter) {
    cancelAnimationFrame(state.meter);
    state.meter = null;
  }
  if (state.meterContext) {
    state.meterContext.close();
    state.meterContext = null;
  }
  if (state.recorder) state.recorder.cancel();
  els.recStart.disabled = false;
  els.recStop.disabled = true;
  els.recCancel.disabled = true;
  els.timer.textContent = "0:00";
  const ctx = els.wave.getContext("2d");
  ctx.clearRect(0, 0, els.wave.width, els.wave.height);
  status(els.weaveStatus, "Cancelled.", "");
}

function renderAngles() {
  const box = els.angles;
  box.replaceChildren();
  box.hidden = false;
  const spine = document.createElement("p");
  spine.className = "hint";
  spine.innerHTML = `<strong>Spine:</strong> ${escapeHtml(state.spine || "—")}`;
  box.append(spine);
  for (let index = 0; index < state.angles.length; index += 1) {
    const angle = state.angles[index];
    const label = document.createElement("label");
    label.className = "angle";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "angle";
    radio.value = String(index);
    if (index === 0) radio.checked = true;
    const title = document.createElement("span");
    title.innerHTML = `<strong>${escapeHtml(angle.title)}</strong>`;
    const why = document.createElement("small");
    why.textContent = angle.why || "";
    label.append(radio, title, why);
    box.append(label);
  }
  const custom = document.createElement("label");
  custom.className = "angle";
  const customRadio = document.createElement("input");
  customRadio.type = "radio";
  customRadio.name = "angle";
  customRadio.value = "custom";
  const customInput = document.createElement("input");
  customInput.type = "text";
  customInput.placeholder = "or name your own spine…";
  customInput.addEventListener("input", () => { customRadio.checked = true; });
  custom.append(customRadio, customInput);
  box.append(custom);
  const go = document.createElement("button");
  go.type = "button";
  go.className = "primary";
  go.textContent = "Weave it from this spine";
  go.addEventListener("click", weaveFromAngle);
  box.append(go);
}

async function reflect() {
  const text = els.transcript.value.trim();
  if (!text) { status(els.weaveStatus, "Record or type a transcript first.", "error"); return; }
  state.transcript = text;
  const sibling = activeSibling();
  if (!sibling || !sibling.capabilities.includes("edit")) {
    status(els.weaveStatus, "Connect a sibling with editing (On-device model, or a Gemini/Groq key) to reflect.", "error");
    return;
  }
  els.weaveRun.disabled = true;
  try {
    status(els.weaveStatus, "Listening before writing…", "");
    state.weave = new Weaver(sibling, {});
    const { spine, angles } = await state.weave.reflect(text, (m) => status(els.weaveStatus, m, ""));
    state.spine = spine;
    state.angles = angles;
    if (!els.pTitle.value.trim()) {
      els.pTitle.value = angles[0] ? angles[0].title.slice(0, 140) : makeSlug("field-report");
      els.pSlug.value = makeSlug(els.pTitle.value);
    }
    renderAngles();
    status(els.weaveStatus, "Here are faithful angles. Pick the spine you want to weave from.", "ok");
  } catch (error) {
    status(els.weaveStatus, error?.message || "Reflection failed.", "error");
  } finally {
    els.weaveRun.disabled = false;
  }
}

function chosenAngle() {
  const picked = document.querySelector('input[name="angle"]:checked');
  if (!picked) return (state.angles[0] && state.angles[0].title) || "";
  if (picked.value === "custom") return (document.querySelector('.angle input[type="text"]') || {}).value || "the field";
  const angle = state.angles[Number(picked.value)];
  return (angle && angle.title) || "";
}

async function weaveFromAngle() {
  const angle = chosenAngle();
  if (!state.weave) return;
  status(els.weaveStatus, `Structuring the spine “${angle}”…`, "");
  els.weaveRun.disabled = true;
  try {
    await state.weave.structure(angle, (m) => status(els.weaveStatus, m, ""));
    await state.weave.polish((m) => status(els.weaveStatus, m, ""));
    status(els.weaveStatus, "Embellishing with images and your voice…", "");
    const wantVoice = els.optVoice.checked && state.audioBlob;
    const wantBed = els.optBed.checked;
    await state.weave.embellish({
      voice: wantVoice ? { audioId: state.audioId, durationLabel: formatDuration(state.audioMeta ? state.audioMeta.durationMs : 0), caption: "" } : null,
      bed: wantBed ? { vibe: `${state.transcript} ${angle}` } : null,
      onStatus: (m) => { if (m) status(els.weaveStatus, m, ""); },
    }, activeSibling());
    if (wantBed) {
      try { state.bedBlob = await state.weave.renderBed(`${angle} field`, { seconds: 42 }); state.bedObjectUrl = URL.createObjectURL(state.bedBlob); }
      catch (error) { status(els.weaveStatus, `Field bed skipped: ${error.message}`, ""); }
    }
    state.blocks = state.weave.state.blocks;
    renderBeatsPreview();
    if (!els.pSubtitle.value.trim()) els.pSubtitle.value = (state.spine || "").slice(0, 220);
    if (!els.pDescription.value.trim()) els.pDescription.value = (state.spine || "").slice(0, 280);
    status(els.weaveStatus, "Woven. Review the beats, name it below, then write or preview it.", "ok");
  } catch (error) {
    status(els.weaveStatus, error?.message || "Weaving failed.", "error");
  } finally {
    els.weaveRun.disabled = false;
  }
}

function handWeave() {
  const text = els.transcript.value.trim();
  if (!text) { status(els.weaveStatus, "Type a transcript first.", "error"); return; }
  state.transcript = text;
  const paragraphs = text.split(/\n{2,}|\n/).map((line) => line.trim()).filter(Boolean);
  const blocks = [];
  paragraphs.forEach((paragraph, index) => {
    if (index === 0) blocks.push({ type: "heading", text: paragraph.slice(0, 90) });
    else if (index === 3) blocks.push({ type: "divider" });
    else blocks.push({ type: "paragraph", text: paragraph });
  });
  blocks.push({ type: "image", prompt: "your field", caption: "", seed: 0 });
  state.blocks = blocks;
  state.spine = "";
  if (!els.pTitle.value.trim()) { els.pTitle.value = makeSlug("field-report"); els.pSlug.value = makeSlug("field-report"); }
  renderBeatsPreview();
  status(els.weaveStatus, "Hand-weaved a skeleton. Attach your own images to each beat, then publish.", "ok");
}

function renderBeatsPreview() {
  const list = document.createElement("div");
  state.blocks.forEach((block, index) => {
    const row = document.createElement("div");
    row.className = "beat-row";
    if (block.type === "image") {
      row.className = "beat-row is-image";
      const kind = block.art && block.art.provider ? block.art.provider : "pending";
      const label = document.createElement("span");
      label.textContent = `Image · ${kind}: ${block.prompt || block.caption || ""}`.slice(0, 80);
      const own = document.createElement("input");
      own.type = "file";
      own.accept = "image/*";
      own.title = "use one of your own images instead";
      own.addEventListener("change", async () => {
        const file = own.files && own.files[0];
        if (!file) return;
        try {
          const record = await attachOwnImage(file);
          const newArt = await resolveArt({ prompt: block.prompt, ownImageId: record.id }, activeSibling());
          if (block.art && block.art.dataUrl && block.art.dataUrl.startsWith("blob:")) {
            URL.revokeObjectURL(block.art.dataUrl);
          }
          if (block.ownImageId) {
            const { idbDelete } = await import("./idb.js");
            idbDelete(block.ownImageId).catch(() => {});
          }
          block.ownImageId = record.id;
          block.art = newArt;
          block.artProvider = newArt.provider;
          renderBeatsPreview();
        } catch (error) { status(els.weaveStatus, error?.message || "Could not attach that image.", "error"); }
      });
      row.append(label, own);
    } else {
      const label = document.createElement("span");
      label.textContent = `${block.type}: ${(block.text || "").slice(0, 100) || "…"}`;
      row.append(label);
    }
    row.dataset.index = String(index);
    list.append(row);
  });
  els.beatsPreview.replaceChildren(list);
}

function collectMeta() {
  const category = els.pCategory.value;
  const title = els.pTitle.value.trim();
  const slug = els.pSlug.value.trim() || makeSlug(title);
  return {
    category,
    title,
    subtitle: els.pSubtitle.value.trim(),
    slug,
    description: els.pDescription.value.trim(),
    date: localDate(),
    spine: state.spine,
  };
}

async function buildBlocks(kind, meta) {
  const blocks = state.blocks.map((block) => ({ ...block, art: block.art ? { ...block.art } : block.art }));
  const assets = [];
  let imageIndex = 0;
  for (const block of blocks) {
    if (block.type === "image") {
      const art = block.art || {};
      if (kind === "write" && art.blob) {
        const ext = extFromMime(art.blob.type);
        block.finalSrc = assetHref(meta.slug, "image", imageIndex, ext);
        assets.push({ path: `writing/${block.finalSrc}`, blob: art.blob });
      } else {
        block.finalSrc = art.dataUrl || "";
      }
      block.artProvider = art.provider || "placeholder";
      imageIndex += 1;
    }
    if (block.type === "voice") {
      if (kind !== "write") {
        block.narrationSrc = "";
        block.bedSrc = "";
      } else {
        if (els.optVoice.checked && state.audioBlob) {
          const ext = extFromMime(state.audioBlob.type);
          block.narrationSrc = assetHref(meta.slug, "narration", 0, ext);
          assets.push({ path: `writing/${block.narrationSrc}`, blob: state.audioBlob });
        } else block.narrationSrc = "";
      }
    }
    if (block.type === "field") {
      if (kind !== "write") {
        block.bedSrc = "";
      } else {
        if (els.optBed.checked && state.bedBlob) {
          block.bedSrc = assetHref(meta.slug, "field", 0, "wav");
          assets.push({ path: `writing/${block.bedSrc}`, blob: state.bedBlob });
        } else block.bedSrc = "";
      }
    }
  }
  return { blocks, assets };
}

async function previewPiece() {
  if (!state.blocks.length) { status(els.weaveStatus, "Weave a piece first.", "error"); return; }
  const meta = collectMeta();
  if (!meta.title) { status(els.weaveStatus, "Give the piece a title before previewing.", "error"); return; }
  const { blocks } = await buildBlocks("preview", meta);
  const html = renderArticleHtml({ ...meta, blocks });
  const framed = html
    .replace('<link rel="stylesheet" href="../style.css">', `<base href="${SITE}/writing/"><link rel="stylesheet" href="${SITE}/style.css">`);
  els.studioPreviewFrame.srcdoc = framed;
  els.studioPreviewFrame.hidden = false;
  els.studioPreviewEmpty.hidden = true;
  status(els.weaveStatus, "Preview updated (audio plays only on the published page).", "ok");
}

async function readText(dir, name) {
  const handle = await dir.getFileHandle(name);
  return await (await handle.getFile()).text();
}

async function getSubdir(dir, ...names) {
  let current = dir;
  for (const name of names) current = await current.getDirectoryHandle(name, { create: true });
  return current;
}

async function writeBlob(dir, path, blob) {
  const pieces = path.split("/");
  const sub = await getSubdir(dir, ...pieces.slice(0, -1));
  const handle = await sub.getFileHandle(pieces.at(-1), { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function writeText(dir, path, content) {
  await writeBlob(dir, path, new Blob([content], { type: "text/plain;charset=utf-8" }));
}

async function chooseFolder() {
  if (!window.showDirectoryPicker) { status(els.weaveStatus, "This browser can't write to a folder. Use Download snippets.", "error"); return; }
  try {
    const dir = await window.showDirectoryPicker({ mode: "readwrite" });
    await readText(dir, "index.html");
    await readText(dir, "style.css");
    state.folder = dir;
    els.studioNote.textContent = `Ready to write into “${dir.name}”.`;
  } catch (error) {
    if (error && error.name === "AbortError") return;
    status(els.weaveStatus, "Choose the root of the spbzorro site source folder.", "error");
  }
}

async function writePiece() {
  if (!state.blocks.length) { status(els.weaveStatus, "Weave a piece first.", "error"); return; }
  const meta = collectMeta();
  if (!meta.title) { status(els.weaveStatus, "Add a title before writing.", "error"); return; }
  if (!validSlug(meta.slug)) { status(els.weaveStatus, "Page address must be lowercase letters, numbers, and single hyphens.", "error"); return; }
  if (!state.folder) { status(els.weaveStatus, "Choose the site folder first.", "error"); return; }
  els.studioWrite.disabled = true;
  try {
    const { blocks, assets } = await buildBlocks("write", meta);
    const articlePath = `writing/${meta.slug}.html`;
    await (async () => {
      try { const w = await getSubdir(state.folder, "writing"); await w.getFileHandle(`${meta.slug}.html`); throw new Error(`The page “${meta.slug}” already exists.`); }
      catch (error) { if (error && error.name !== "NotFoundError") throw error; }
    })();
    const index = await readText(state.folder, "index.html");
    const archiveName = (categoryInfo[meta.category] || categoryInfo.reflection).archive;
    const archive = await readText(state.folder, archiveName);
    const sitemap = await readText(state.folder, "sitemap.xml");
    const card = articleCard({ ...meta, date: meta.date });
    const articleHtml = renderArticleHtml({ ...meta, blocks });
    await writeText(state.folder, articlePath, articleHtml);
    for (const asset of assets) await writeBlob(state.folder, asset.path, asset.blob);
    const updatedIndex = insertProjectCard(index, (categoryInfo[meta.category] || categoryInfo.reflection).section, card);
    const updatedArchive = insertArchiveCard(archive, card);
    const updatedSitemap = sitemapWithArticle(sitemap, meta.slug, meta.date);
    await writeText(state.folder, "index.html", updatedIndex);
    await writeText(state.folder, archiveName, updatedArchive);
    await writeText(state.folder, "sitemap.xml", updatedSitemap);
    status(els.weaveStatus, `Wrote ${articlePath} + ${assets.length ? assets.length + " asset(s) " : ""}and updated the home, ${archiveName}, and sitemap. Publish when ready.`, "ok");
    renderLedger();
  } catch (error) {
    status(els.weaveStatus, error?.message || "Could not write the piece. Your draft stays in this browser.", "error");
  } finally {
    els.studioWrite.disabled = false;
  }
}

async function downloadFallback() {
  if (!state.blocks.length) { status(els.weaveStatus, "Weave a piece first.", "error"); return; }
  const meta = collectMeta();
  if (!meta.title || !validSlug(meta.slug)) { status(els.weaveStatus, "Add a title and a valid page address before exporting.", "error"); return; }
  const { blocks } = await buildBlocks("inline", meta);
  const html = renderArticleHtml({ ...meta, blocks });
  downloadFile(`${meta.slug}.html`, html);
  downloadFile(`${meta.slug}-sitemap-entry.xml`, sitemapArticleEntry(meta.slug, meta.date), "application/xml");
  status(els.weaveStatus, "Downloaded the article (images inlined). Narration & field bed need the folder-write path.", "ok");
}

function downloadFile(name, content, type = "text/html") {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function cacheElements() {
  Object.assign(els, {
    features: $("sib-features"),
    cloudKeys: $("cloud-keys"),
    ledger: $("send-ledger"),
    recStart: $("rec-start"),
    recStop: $("rec-stop"),
    recCancel: $("rec-cancel"),
    timer: $("rec-timer"),
    wave: $("wave"),
    transcript: $("transcript"),
    weaveRun: $("weave-run"),
    angles: $("angles"),
    weaveStatus: $("weave-status"),
    beatsPreview: $("beats-preview"),
    pCategory: $("p-category"),
    pTitle: $("p-title"),
    pSubtitle: $("p-subtitle"),
    pSlug: $("p-slug"),
    pDescription: $("p-description"),
    optVoice: $("opt-voice"),
    optBed: $("opt-bed"),
    studioFolder: $("studio-folder"),
    studioWrite: $("studio-write"),
    studioDownload: $("studio-download"),
    studioPreview: $("studio-preview"),
    studioNote: $("studio-note"),
    studioResult: $("studio-result"),
    studioPreviewEmpty: $("studio-preview-empty"),
    studioPreviewFrame: $("studio-preview-frame"),
  });
}

function wire() {
  document.querySelectorAll('input[name="sib"]').forEach((radio) => {
    radio.addEventListener("change", () => setMode(radio.value));
  });
  els.recStart.addEventListener("click", startRecording);
  els.recStop.addEventListener("click", stopRecording);
  els.recCancel.addEventListener("click", cancelRecording);
  els.weaveRun.addEventListener("click", () => (state.mode === "none" ? handWeave() : reflect()));
  els.studioFolder.addEventListener("click", chooseFolder);
  els.studioWrite.addEventListener("click", writePiece);
  els.studioDownload.addEventListener("click", downloadFallback);
  els.studioPreview.addEventListener("click", previewPiece);
  els.pTitle.addEventListener("input", () => { els.pSlug.value = makeSlug(els.pTitle.value); });
}

function init() {
  cacheElements();
  if (!supportsRecording()) {
    els.recStart.disabled = true;
    els.recStart.textContent = "● Record (unavailable)";
  }
  setMode("local");
  renderCloudKeys();
  renderLedger();
  wire();
}

init();
