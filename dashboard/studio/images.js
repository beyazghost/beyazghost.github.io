import { idbPut, idbGet, idbDelete, newAssetId } from "./idb.js";

const ownImages = new Map();

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < String(value).length; i += 1) {
    hash ^= String(value).charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export async function attachOwnImage(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error("That file is not an image.");
  const id = newAssetId("img");
  await idbPut(id, { blob: file, meta: { name: file.name } });
  const record = { id, name: file.name, blob: file, objectUrl: URL.createObjectURL(file), provider: "own" };
  ownImages.set(id, record);
  return record;
}

export async function restoreOwnImages() {
  for (const [id] of [...ownImages.entries()]) {
    const stored = await idbGet(id);
    if (stored && stored.blob) stored.objectUrl = URL.createObjectURL(stored.blob);
  }
}

export function listOwnImages() {
  return [...ownImages.values()].map(({ id, name, objectUrl, provider }) => ({ id, name, objectUrl, provider }));
}

export function getOwnImage(id) {
  return ownImages.get(id) || null;
}

export function removeOwnImage(id) {
  const record = ownImages.get(id);
  if (record && record.objectUrl) URL.revokeObjectURL(record.objectUrl);
  ownImages.delete(id);
  idbDelete(id).catch(() => {});
  return !!record;
}

export function placeholderSvg(prompt, width = 1600, height = 840) {
  const seed = hashString(prompt);
  const hue = seed % 40;
  const from = `hsl(${hue + 20}deg 28% 92%)`;
  const to = `hsl(${hue + 45}deg 22% 78%)`;
  const accent = "#8f6212";
  const label = String(prompt || "").replace(/[<&>]/g, "").slice(0, 90);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
<rect width="${width}" height="${height}" fill="url(#g)"/>
<circle cx="${(seed % 60) + 12}%" cy="${(seed % 40) + 20}%" r="${(seed % 7) + 6}%" fill="${accent}" opacity="0.14"/>
<text x="50%" y="50%" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="${Math.round(width / 42)}" fill="#3a352c" opacity="0.8">${label}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function resolveArt(request, sibling) {
  const { prompt = "", width = 1600, height = 840, seed, onStatus, ownImageId, slug = "" } = request;
  if (ownImageId) {
    const own = getOwnImage(ownImageId);
    if (own) return { blob: own.blob, dataUrl: own.objectUrl, provider: "own", label: own.name };
  }
  if (sibling && Array.isArray(sibling.capabilities) && sibling.capabilities.includes("image")) {
    try {
      const result = await sibling.image(prompt, { width, height, seed, onStatus });
      return { blob: result.blob, dataUrl: URL.createObjectURL(result.blob), provider: result.provider || "cloud", label: result.provider || "cloud" };
    } catch (error) {
      if (onStatus) onStatus(`Cloud image skipped: ${error.message}`);
    }
  }
  return { blob: null, dataUrl: placeholderSvg(prompt || slug || "untitled", width, height), provider: "placeholder", label: "placeholder" };
}
