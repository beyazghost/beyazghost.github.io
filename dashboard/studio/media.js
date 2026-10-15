function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < String(value).length; i += 1) {
    hash ^= String(value).charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function encodeWav(audioBuffer) {
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const frames = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeText = (offset, text) => { for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i)); };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeText(36, "data");
  view.setUint32(40, dataSize, true);
  const channelData = [];
  for (let c = 0; c < channels; c += 1) channelData.push(audioBuffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < channels; c += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

const PENTATONIC = [0, 2, 4, 7, 9];

export async function renderAmbientBed(vibe, options = {}) {
  const seconds = options.seconds || 42;
  const sampleRate = 44100;
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctx) throw new Error("This browser cannot synthesize the field bed.");
  const ctx = new Ctx(1, Math.ceil(sampleRate * seconds), sampleRate);
  const seed = hashString(vibe || "field");
  const root = 110 * Math.pow(2, ((seed % 5) - 2) / 12);
  const master = ctx.createGain();
  master.gain.value = 0.0;
  master.connect(ctx.destination);
  const air = ctx.createBiquadFilter();
  air.type = "highpass";
  air.frequency.value = 180;
  air.connect(master);
  const voices = [0, 1, 2, 3, 4].map((index) => {
    const step = PENTATONIC[(seed >> (index * 3)) % PENTATONIC.length];
    const octave = index === 0 ? 1 : index < 3 ? 2 : 1;
    const osc = ctx.createOscillator();
    osc.type = index % 2 === 0 ? "sine" : "triangle";
    osc.frequency.value = root * octave * Math.pow(2, step / 12) * (1 + ((seed % 7) - 3) * 0.0009);
    const gain = ctx.createGain();
    gain.gain.value = 0.12 / (index + 1);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05 + ((seed >> (index + 2)) % 5) * 0.017;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    osc.connect(gain);
    gain.connect(air);
    return { osc, lfo };
  });
  master.gain.setValueAtTime(0.0, 0);
  master.gain.linearRampToValueAtTime(0.5, Math.min(4, seconds / 4));
  master.gain.setValueAtTime(0.5, Math.max(0, seconds - 4));
  master.gain.linearRampToValueAtTime(0.0, seconds);
  for (const { osc, lfo } of voices) {
    osc.start(0);
    lfo.start(0);
    osc.stop(seconds);
    lfo.stop(seconds);
  }
  const rendered = await ctx.startRendering();
  return encodeWav(rendered);
}

export function kenburnsFigure(assetPath, alt, caption, index = 0) {
  const variant = `kb-${String.fromCharCode(97 + (index % 3))}`;
  const safeAlt = String(alt || "").replace(/"/g, "");
  return `  <figure class="kenburns ${variant}">
    <img src="${assetPath}" alt="${safeAlt}" loading="lazy">
    ${caption ? `<figcaption>${caption}</figcaption>` : ""}
  </figure>`;
}

export function voiceoverFigure(audioPath, caption, durationLabel = "") {
  const label = durationLabel ? ` Narration, ${durationLabel}.` : "";
  return `  <figure class="voice">
    <audio controls preload="none" src="${audioPath}"></audio>
    ${caption || label ? `<figcaption>${caption || `My own voice, answering the page.${label}`}</figcaption>` : ""}
  </figure>`;
}

export function fieldBedFigure(bedPath, caption) {
  return `  <figure class="field-bed" data-bed-src="${bedPath}">
    <button class="field-play" type="button" aria-pressed="false">▶ Play the field</button>
    <audio class="field-audio" preload="none" src="${bedPath}"></audio>
    ${caption ? `<figcaption>${caption}</figcaption>` : ""}
  </figure>`;
}

export function listenPlayerScript() {
  return `(function(){document.querySelectorAll('[data-listen]').forEach(function(p){var n=p.querySelector('[data-role=narration]');var bed=p.querySelector('[data-role=bed]');if(!n)return;var ctx=null,bg=null;function ensure(){if(ctx||!bed)return;try{ctx=new (window.AudioContext||window.webkitAudioContext)();var s=ctx.createMediaElementSource(bed);bg=ctx.createGain();bg.gain.value=0.0;s.connect(bg);bg.connect(ctx.destination);}catch(e){ctx=null;bg=null;}}n.addEventListener('play',function(){ensure();if(bed){try{bed.currentTime=0;}catch(e){} try{bed.play();}catch(e){}}if(bg&&ctx)bg.gain.setTargetAtTime(0.5,ctx.currentTime,0.6);});function rest(){if(bed)bed.pause();if(bg&&ctx)bg.gain.setTargetAtTime(0.0,ctx.currentTime,0.3);}n.addEventListener('pause',rest);n.addEventListener('ended',rest);});})();`;
}

export function listenPlayerMarkup(narrationPath, bedPath, label = "my voice, with the field beneath it") {
  const narration = narrationPath ? `<audio data-role="narration" controls preload="none" src="${narrationPath}"></audio>` : "";
  const bed = bedPath ? `<audio data-role="bed" preload="none" src="${bedPath}" loop></audio>` : "";
  return `  <div class="listen" data-listen>
    ${narration}
    <span class="listen-label">${label}</span>
    ${bed}
  </div>`;
}
