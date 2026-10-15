import { getKey, cloudDescriptors, logSend } from "./providers.js";

function extFor(mimeType) {
  if (/ogg/.test(mimeType)) return ".ogg";
  if (/mp4|m4a/.test(mimeType)) return ".m4a";
  if (/mpeg|mp3/.test(mimeType)) return ".mp3";
  if (/wav/.test(mimeType)) return ".wav";
  return ".webm";
}

function describeCapabilities() {
  const editProvider = getKey("gemini") ? "gemini" : getKey("groq") ? "groq" : "";
  const imageProvider = getKey("hf") ? "hf" : "pollinations";
  return {
    transcribe: getKey("groq") ? "groq" : "",
    edit: editProvider,
    image: imageProvider,
  };
}

async function groqTranscribe(blob, options = {}) {
  const key = getKey("groq");
  if (!key) throw new Error("Add a Groq key to transcribe speech.");
  const form = new FormData();
  form.append("model", cloudDescriptors.groq.transcribeModel);
  form.append("file", blob, `dictation${extFor(blob.type)}`);
  form.append("response_format", "json");
  if (options.language) form.append("language", options.language);
  if (options.onStatus) options.onStatus(`Sending ${(blob.size / 1024).toFixed(0)} KB of audio to Groq whisper…`);
  const response = await fetch(`${cloudDescriptors.groq.baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  logSend({ sibling: "cloud", capability: "transcribe", provider: "groq", endpoint: "/audio/transcriptions", bytes: blob.size, note: options.language ? `lang=${options.language}` : "" });
  if (response.status === 413) throw new Error("That recording is too large for the Groq free tier. Try a shorter dictation.");
  if (!response.ok) throw new Error(`Transcription failed (${response.status}). ${await safeError(response)}`);
  const data = await response.json();
  return { text: String(data.text || "").trim(), language: data.language };
}

async function groqEdit(prompt, options = {}) {
  const key = getKey("groq");
  const response = await fetch(`${cloudDescriptors.groq.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: cloudDescriptors.groq.textModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
    }),
  });
  logSend({ sibling: "cloud", capability: "edit", provider: "groq", endpoint: "/chat/completions", bytes: prompt.length, note: "" });
  if (!response.ok) throw new Error(`Editing failed (${response.status}). ${await safeError(response)}`);
  const data = await response.json();
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return String(text || "").trim();
}

async function geminiEdit(prompt, options = {}) {
  const key = getKey("gemini");
  const model = cloudDescriptors.gemini.textModel;
  const response = await fetch(`${cloudDescriptors.gemini.baseUrl}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 4096 },
    }),
  });
  logSend({ sibling: "cloud", capability: "edit", provider: "gemini", endpoint: `/models/${model}:generateContent`, bytes: prompt.length, note: "" });
  if (!response.ok) throw new Error(`Editing failed (${response.status}). ${await safeError(response)}`);
  const data = await response.json();
  const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  return String((parts || []).map((part) => part.text).join("\n") || "").trim();
}

async function hfImage(prompt, options = {}) {
  const key = getKey("hf");
  if (!key) throw new Error("Add a Hugging Face key to generate images.");
  const model = cloudDescriptors.hf.imageModel;
  if (options.onStatus) options.onStatus(`Asking FLUX to render an image for: "${truncate(prompt, 48)}"`);
  const response = await fetch(`${cloudDescriptors.hf.baseUrl}/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "image/png" },
    body: JSON.stringify({ inputs: prompt }),
  });
  logSend({ sibling: "cloud", capability: "image", provider: "hf", endpoint: `/${model}`, bytes: prompt.length, note: "" });
  if (response.status === 503) throw new Error("FLUX is waking up on Hugging Face. Try again in a few seconds.");
  if (!response.ok) throw new Error(`Image generation failed (${response.status}). ${await safeError(response)}`);
  return { blob: await response.blob(), provider: "hf" };
}

async function pollinationsImage(prompt, options = {}) {
  if (options.onStatus) options.onStatus(`Pollinating an image for: "${truncate(prompt, 48)}"`);
  const seed = options.seed || Math.floor(Math.random() * 1_000_000);
  const width = options.width || 1600;
  const height = options.height || 840;
  const url = `${cloudDescriptors.pollinations.baseUrl}/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
  const response = await fetch(url, { headers: { accept: "image/*" } });
  logSend({ sibling: "cloud", capability: "image", provider: "pollinations", endpoint: "/prompt", bytes: prompt.length, note: `seed=${seed}` });
  if (!response.ok) throw new Error(`Image generation failed (${response.status}).`);
  return { blob: await response.blob(), provider: "pollinations" };
}

function truncate(value, length) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

async function safeError(response) {
  try {
    const text = await response.text();
    return text.slice(0, 180);
  } catch {
    return "";
  }
}

export function createCloudSibling() {
  const routed = describeCapabilities;
  const capabilities = () => Object.entries(routed())
    .filter(([, provider]) => Boolean(provider))
    .map(([capability]) => capability);
  return {
    id: "cloud",
    name: "Cloud sibling (your own keys)",
    mode: "cloud",
    get capabilities() { return capabilities(); },
    routed,
    async transcribe(blob, options) {
      return groqTranscribe(blob, options);
    },
    async edit(prompt, options) {
      const route = describeCapabilities().edit;
      if (route === "gemini") return geminiEdit(prompt, options);
      if (route === "groq") return groqEdit(prompt, options);
      throw new Error("Add a Gemini or Groq key to let the sibling help edit.");
    },
    async image(prompt, options) {
      const route = describeCapabilities().image;
      if (route === "hf") return hfImage(prompt, options);
      if (route === "pollinations") return pollinationsImage(prompt, options);
      throw new Error("Add a Hugging Face key, or use the keyless Pollinations image source.");
    },
  };
}
