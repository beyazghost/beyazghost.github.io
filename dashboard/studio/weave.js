import { resolveArt } from "./images.js";
import { renderAmbientBed } from "./media.js";

export function parseJsonLoose(text) {
  const raw = String(text || "").trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const cleaned = fenced ? fenced[1].trim() : raw;
  const firstBrace = cleaned.search(/[[{]/);
  if (firstBrace < 0) return null;
  const slice = cleaned.slice(firstBrace);
  const opener = slice[0];
  const closer = opener === "{" ? "}" : "]";
  try {
    return JSON.parse(slice);
  } catch { /* fall through to balanced-slice scan below */ }
  let depth = 0;
  for (let i = 0; i < slice.length; i += 1) {
    const char = slice[i];
    if (char === opener || ((opener === "{") ? char === "{" : char === "[")) depth += 1;
    else if (char === closer || ((opener === "{") ? char === "}" : char === "]")) {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(slice.slice(0, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function voiceSample(transcript, words = 90) {
  return String(transcript || "").trim().split(/\s+/).slice(0, words).join(" ");
}

export function reflectPrompt(transcript) {
  return `You are the sibling editor to a journalist who just spoke a raw dictation. Do NOT write yet. Listen, then reflect so he can choose the angle.
From ONLY what is in the transcript, propose 3 faithful editorial angles (title + one-line why it matters), and a single-sentence spine the whole piece hangs on. Do not invent facts. Never correct his facts. If it rambles, find the center anyway.
Return STRICT JSON only: {"spine":"...","angles":[{"title":"...","why":"..."},{"title":"...","why":"..."},{"title":"...","why":"..."}]}

TRANSCRIPT:
"""${transcript}"""`;
}

export function structurePrompt(transcript, angle, spine) {
  return `Sibling, shape this dictated transcript into a long-form field report the way Radiolab or a New York Times documentary feature is shaped.
- Open in a specific scene/moment from the transcript, not a summary.
- Move in short beats. Where an image would breathe, insert {"type":"image","prompt":"<evocative visual, no text in image>","caption":"<photo caption>"}.
- Lift one or two of HIS strongest lines to a pull-quote: {"type":"quote","text":"<his words, verbatim>"}.
- Use headings {"type":"heading","text":"..."} and paragraphs {"type":"paragraph","text":"..."}. Optional {"type":"divider"}.
- Keep his diction, cadence, aphorisms. NEVER invent facts, names, or events beyond the transcript. Tighten, don't impose.
Return STRICT JSON only: {"beats":[...]} with 8-14 beats total and 1-3 image beats.

SPINE: "${spine}"
ANGLE: "${angle}"

TRANSCRIPT:
"""${transcript}"""`;
}

export function polishBeatsPrompt(sample, texts) {
  return `Line-edit a journalist's dictated prose. Preserve HIS VOICE exactly: cadence, aphorisms, nicknames, warmth. Fix only spacing, run-ons, and grammar that harm clarity. Tighten. Do NOT corporate-ify, add facts, moralize, or change meaning.
Here is how he talks (sample): """${sample}"""
Edit each of the ${texts.length} segments below. Return them in the SAME order, the SAME count, separated by the exact sentinel line <<<SPLIT>>> with nothing else.
${texts.map((text, index) => `[[${index}]] ${text}`).join("\n<<<SPLIT>>>\n")}`;
}

export function polishOnePrompt(sample, text) {
  return `Line-edit this dictated prose. Keep HIS voice: cadence, aphorisms, warmth. Fix only spacing/run-ons/grammar that harm clarity. Do NOT corporate-ify, add facts, or change meaning. Return ONLY the edited prose.
How he talks (sample): """${sample}"""
PROSE: """${text}"""`;
}

export class Weaver {
  constructor(sibling, options = {}) {
    this.sibling = sibling;
    this.options = options;
    this.state = { transcript: "", spine: "", angles: [], chosenAngle: "", blocks: [] };
  }

  async reflect(transcript, onStatus = () => {}) {
    this.state.transcript = String(transcript || "");
    onStatus("Listening to your dictation before writing…");
    const reply = await this.sibling.edit(reflectPrompt(this.state.transcript));
    const parsed = parseJsonLoose(reply);
    if (!parsed) throw new Error("The sibling couldn't parse an angle. Try again or re-dictate.");
    this.state.spine = String(parsed.spine || "").trim();
    this.state.angles = Array.isArray(parsed.angles) ? parsed.angles.slice(0, 3) : [];
    if (!this.state.angles.length) this.state.angles = [{ title: "The single strongest thread", why: "Chosen from your transcript." }];
    return { spine: this.state.spine, angles: this.state.angles };
  }

  async structure(angle, onStatus = () => {}) {
    const chosen = angle || (this.state.angles[0] && this.state.angles[0].title) || "";
    this.state.chosenAngle = chosen;
    onStatus(`Shaping the spine: “${chosen}”`);
    const reply = await this.sibling.edit(structurePrompt(this.state.transcript, chosen, this.state.spine));
    const parsed = parseJsonLoose(reply);
    if (!parsed || !Array.isArray(parsed.beats) || !parsed.beats.length) throw new Error("The sibling couldn't shape this piece. Try again.");
    this.state.blocks = parsed.beats.map(normalizeBlock);
    return this.state.blocks;
  }

  async polish(onStatus = () => {}) {
    const sample = voiceSample(this.state.transcript);
    const textIndexes = this.state.blocks
      .map((block, index) => (block.type === "paragraph" || block.type === "heading" || block.type === "quote" ? index : -1))
      .filter((index) => index >= 0);
    if (!textIndexes.length) return this.state.blocks;
    onStatus("Line-editing in your voice…");
    const texts = textIndexes.map((index) => this.state.blocks[index].text);
    let edited = null;
    try {
      const reply = await this.sibling.edit(polishBeatsPrompt(sample, texts));
      const parts = reply.split("<<<SPLIT>>>").map((part) => part.replace(/^\s*\[\[\d+\]\]\s*/, "").trim()).filter((part) => part.length > 0);
      if (parts.length === texts.length) edited = parts;
    } catch { edited = null; }
    if (!edited) {
      edited = await Promise.all(texts.map((text) => this.sibling.edit(polishOnePrompt(sample, text))));
    }
    textIndexes.forEach((blockIndex, i) => { this.state.blocks[blockIndex].text = edited[i] || this.state.blocks[blockIndex].text; });
    return this.state.blocks;
  }

  async embellish({ voice, bed, onStatus = () => {}, imageOptions = {} } = {}) {
    const blocks = this.state.blocks;
    if (voice) this.placeBlockOnce(blocks, { type: "voice", audioId: voice.audioId, durationLabel: voice.durationLabel, caption: voice.caption || "" });
    for (let i = 0; i < blocks.length; i += 1) {
      if (blocks[i].type !== "image") continue;
      const block = blocks[i];
      onStatus(block.art ? null : `Illustrating beat ${i + 1} from your sources…`);
      const art = await resolveArt({ prompt: block.prompt || block.caption, ownImageId: block.ownImageId, seed: block.seed, onStatus }, this.sibling);
      if (block.art && block.art.dataUrl && block.art.dataUrl.startsWith("blob:")) {
        URL.revokeObjectURL(block.art.dataUrl);
      }
      block.art = art;
    }
    if (bed && !blocks.some((block) => block.type === "field")) {
      this.placeBlockOnce(blocks, { type: "field", vibe: bed.vibe || "the field" });
    }
    return blocks;
  }

  async renderBed(vibe, options = {}) {
    return renderAmbientBed(vibe || "the field", options);
  }

  placeBlockOnce(blocks, block) {
    const existing = blocks.findIndex((item) => item.type === block.type);
    if (existing >= 0) { blocks[existing] = { ...blocks[existing], ...block }; return; }
    const anchor = blocks.findIndex((item, index) => item.type === "heading" && index > 0);
    const at = anchor >= 0 ? anchor + 1 : Math.min(1, blocks.length);
    blocks.splice(at, 0, block);
  }
}

function normalizeBlock(beat, index) {
  const type = ["heading", "paragraph", "quote", "divider", "image"].includes(beat && beat.type) ? beat.type : beat && beat.type === "pullquote" ? "quote" : "paragraph";
  if (type === "divider") return { type: "divider" };
  if (type === "image") {
    return {
      type: "image",
      prompt: String(beat.prompt || "").trim(),
      caption: String(beat.caption || "").trim(),
      seed: index,
    };
  }
  return { type, text: String(beat.text || "").trim() };
}
