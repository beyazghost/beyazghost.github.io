const TRANSFORMERS_URL = "https://esm.sh/@huggingface/transformers@3";
const WEBLLM_URL = "https://esm.sh/@mlc-ai/web-llm";

export function featureDetect() {
  const gpu = typeof navigator !== "undefined" && !!navigator.gpu;
  const isolated = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
  return { webgpu: gpu, crossOriginIsolated: isolated };
}

export function createLocalSibling() {
  let transcriber = null;
  let transcriberModel = "";
  let engine = null;
  let engineModel = "";
  let statusSink = null;

  const models = {
    transcribe: {
      options: [
        { id: "onnx-community/whisper-tiny.en", label: "Whisper tiny (English, ~40 MB)" },
        { id: "onnx-community/whisper-base", label: "Whisper base (~75 MB)" },
      ],
      default: "onnx-community/whisper-base",
    },
    edit: {
      options: [
        { id: "Llama-3.2-3B-Instruct-q4f32_1-MLC", label: "Llama 3.2 3B (~2 GB, best local writing)" },
        { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen 1.5B (~1 GB, lighter)" },
      ],
      default: "Llama-3.2-3B-Instruct-q4f32_1-MLC",
    },
  };

  const emit = (message) => { if (statusSink) statusSink(message); };

  async function ensureTranscriber(modelId, options = {}) {
    if (transcriber && transcriberModel === modelId) return transcriber;
    if (options.onStatus) statusSink = options.onStatus;
    const { pipeline, env } = await import(TRANSFORMERS_URL);
    if (typeof env.useBrowserCache === "boolean") env.useBrowserCache = true;
    const wantsGpu = options.device === "webgpu" || (featureDetect().webgpu && options.device !== "wasm");
    env.device = wantsGpu ? "webgpu" : "wasm";
    emit(`Downloading/loading on-device Whisper (${modelId})…`);
    transcriber = await pipeline("automatic-speech-recognition", modelId, {
      dtype: "q8",
      progress_callback: (progress) => {
        if (progress && progress.status === "progress" && typeof progress.progress === "number") {
          emit(`Loading Whisper model… ${Math.round(progress.progress * 100)}%`);
        }
      },
    });
    transcriberModel = modelId;
    emit("On-device Whisper is ready. Nothing has left this device.");
    return transcriber;
  }

  async function ensureEngine(modelId, options = {}) {
    if (engine && engineModel === modelId) return engine;
    if (options.onStatus) statusSink = options.onStatus;
    const webllm = await import(WEBLLM_URL);
    emit(`Downloading/loading the local writing model (${modelId})… this is a large, one-time download.`);
    engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (progress) => {
        if (progress && typeof progress.progress === "number") {
          emit(`Loading local writing model… ${Math.round(progress.progress * 100)}%`);
        }
      },
    });
    engineModel = modelId;
    emit("Local writing model is ready. Editing stays on this device.");
    return engine;
  }

  return {
    id: "local",
    name: "On-device sibling",
    mode: "local",
    capabilities: ["transcribe", "edit"],
    models,
    feature: featureDetect(),

    async transcribe(blob, options = {}) {
      const modelId = options.model || models.transcribe.default;
      const pipe = await ensureTranscriber(modelId, options);
      const objectUrl = URL.createObjectURL(blob);
      try {
        const output = await pipe(objectUrl, {
          chunk_length_s: 30,
          stride_length_s: 5,
          return_timestamps: options.timestamps ? true : undefined,
          language: options.language || undefined,
          task: "transcribe",
        });
        return { text: String(output.text || "").trim(), model: modelId };
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    },

    async edit(prompt, options = {}) {
      const modelId = options.model || models.edit.default;
      const mlc = await ensureEngine(modelId, options);
      const reply = await mlc.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6,
      });
      const content = reply.choices && reply.choices[0] && reply.choices[0].message && reply.choices[0].message.content;
      return String(content || "").trim();
    },

    dispose() {
      try {
        if (engine && engine.unload) engine.unload();
      } catch { /* ignore */ }
      engine = null;
      engineModel = "";
      transcriber = null;
      transcriberModel = "";
    },
  };
}
