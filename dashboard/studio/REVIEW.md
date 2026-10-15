# Review — "Now weave" studio subsystem (uncommitted changes only)

Scope: `dashboard/writer.html`, `dashboard/writer-sw.js`, `style.css`, `README.md` (modified) and
`dashboard/studio/*.js` (new, 11 modules / 1,949 lines). `dashboard/writer.js` is **not** in scope;
it is referenced only where the studio forks it or depends on it.

Method: static reading of the working tree, no browser/Node execution. All `file:line` references are
against the current working tree. Advisory pass — **no code was changed**.

Aggregation: Performance (this pass, §1) + Security, Business logic, Deploy safety, Duplication/dead
code (tracks 1–4, verified against source at the cited lines).

---

## 1. Performance

### P1 — Preview and download inline every image as base64 — `dashboard/studio/studio.js:506`, `dashboard/studio/studio.js:541`
For any `kind !== "write"`, each image blob is read fully into memory and base64-encoded
(`blobToDataURL`, studio.js:61). A 1600×840 PNG from FLUX/Pollinations is typically 1–3 MB, so base64
inflates it ~1.33×; a 3-image piece yields a 5–10 MB HTML string that is rebuilt on **every** Preview
or Download click and then handed to `iframe.srcdoc` (541), forcing a full document parse plus a
base64 decode per image. `FileReader` holds a second copy of every blob meanwhile. The object URL
`resolveArt` already minted for these images (images.js:70) is ignored by the preview path.
**Fix:** in the preview path use `block.art.dataUrl` (the `blob:` URL) directly; for the download
fallback, downscale via an offscreen canvas to ≤1600 px JPEG q≈0.8 before inlining.

### P2 — WAV encode is a per-sample `DataView` loop on the main thread — `dashboard/studio/media.js:36-42`
`renderAmbientBed` renders 42 s @ 44.1 kHz = **1,852,200 samples**, then `encodeWav` writes them one
at a time with `view.setInt16()` (two float→int conversions and a branch per sample) into a 3.7 MB
`ArrayBuffer`. The `OfflineAudioContext` render itself is off-thread, but this encode loop is
synchronous, yields zero times, and lands at the end of a weave (studio.js:407) — a visible freeze on
a 2020 i5 MBP and worse on mobile. The buffer is mono, so the whole thing is one channel of work.
**Fix:** `const out = new Int16Array(buffer, 44)` and fill it with a typed-array clamp loop; render
the bed at 22.05 kHz mono to halve both stages (it is a quiet ambient pad).

### P3 — Peak scan walks every decoded sample — `dashboard/studio/capture.js:31-35`
`blobToPeaks` `await`s `blob.arrayBuffer()` (a full multi-MB copy), decodes the whole recording, then
accumulates `Math.abs` over **every** sample to produce 140 buckets: a 5-minute dictation at 48 kHz is
~14.4 M iterations (~40–100 ms) on the main thread, and it runs after Stop and *before* transcription
starts (studio.js:284).
**Fix:** stride-sample in fixed windows (e.g. accumulate over 2048-sample slices, or read every Nth
sample) instead of touching each sample.

### P4 — The meter AudioContext is closed only from inside `requestAnimationFrame` — `dashboard/studio/studio.js:221`, `dashboard/studio/studio.js:230`
A new `AudioContext` is constructed for every take (261) and the *only* close path is the next frame
observing `state.recording === false` (230). Background/hidden tabs pause rAF, so a take recorded
while hidden leaves the context — and its `MediaStreamAudioSourceNode` on the live mic — open until
the tab is foregrounded; a page teardown mid-take leaks it entirely. No reference is stored, so
`stopRecording`/`cancelRecording` cannot close it directly.
**Fix:** keep the context on `state` and `await ctx.close()` in both stop paths; better, create one
context for the session and reconnect a new `createMediaStreamSource` per take.

### P5 — The WebLLM engine is never disposed — `dashboard/studio/local-sibling.js:111`
`dispose()` exists but has no caller, so switching the sibling to "Cloud" leaves the ~1–2 GB engine
(WASM heap or WebGPU buffers) resident for the rest of the session. `state.weave` is also replaced on
every `reflect()` (studio.js:365) without disposal.
**Fix:** call `dispose()` when the mode leaves `local` and on `pagehide`.

### P6 — localStorage read/write amplification — `dashboard/studio/providers.js:59-70`, `dashboard/studio/providers.js:83-96`, `dashboard/studio/studio.js:131-137`
The key `<input>` handler runs, per keystroke: `setKey` (parse + rewrite the whole key map) +
`syncActive`→`setActiveId` (another write) + `renderFeatures` (5 × `getKey`, each a parse of the same
map) + `renderLedger` (parse of up to 200 entries) — **8+ synchronous localStorage operations per
character**; pasting a 40-char Groq key is ~300 ops, each a potentially disk-flushed main-thread write.
Separately, `logSend` re-serializes the whole ledger (cap 200) on every outbound call, and one weave
triggers ~15 of them via the per-line polish fallback (weave.js:117).
**Fix:** debounce the input handler (~300 ms) or move to `change`, cache the parsed key map in memory
for the session, and keep the ledger in memory with a debounced flush.

### P7 — Unbounded IndexedDB growth; object URLs orphaned on re-resolve — `dashboard/studio/capture.js:6-10`, `dashboard/studio/images.js:14-21`, `dashboard/studio/images.js:70`
Every take (`saveAudio`) and every attached image is written to `zorro-studio-v1` and never removed —
`idbDelete`, `idbClear` and `removeOwnImage` all exist but have no callers, so the desk accumulates
one multi-MB audio blob per take until the origin quota is hit, with no UI to reclaim it. Each
`resolveArt` also mints a new object URL, and re-attaching/re-weaving replaces `block.art`
(studio.js:459-463) without revoking the previous URL, pinning multi-MB blobs for the page lifetime.
**Fix:** revoke the previous `block.art.dataUrl` before replacing it, delete the superseded IDB
record, and surface a "clear cached media" control (the unused helpers above are the implementation).

### P8 — Service worker caches every same-origin GET with no eviction — `dashboard/writer-sw.js:22-26`
The fetch handler puts *any* same-origin response (modules, svg, fonts, images) into Cache Storage
forever; only a cache-name bump ever reclaims space.
**Fix:** cap entries / prune the studio module set, or restrict runtime caching to the `ASSETS` list.

### P9 — Ken Burns never animates, and the figure builders are dead — `dashboard/studio/style.css:722` (see also 719-729), `dashboard/studio/render.js:66`, `dashboard/studio/media.js:95-118`
The base rule animates `kb-drift`, a keyframe set that does not exist (only `kb-a/b/c` are defined),
and `renderBlocksHtml` emits `class="hero"` / `class="wide kenburns"` with **no** `kb-a/b/c` variant —
so the animation silently does nothing while `will-change: transform` (style.css:721) still promotes
every article image to its own compositor layer for the whole page lifetime. `media.js`'s
`kenburnsFigure`/`voiceoverFigure`/`fieldBedFigure` are never imported; `render.js` inlines its own
markup and therefore drops the variant entirely.
**Fix:** emit the variant from `render.js` (`kenburns kb-${index % 3}`) or point the base rule at a
real keyframe set, drop `will-change` once the animation is single-shot, and delete or reuse the
`media.js` builders.

### Minor (documented, low impact)
- `dashboard/studio/studio.js:441`, `:464` — `renderBeatsPreview` rebuilds the whole list on each
  own-image attach. Only 8–14 nodes, so not a hot spot, but it also recreates every `<input
  type="file">` (focus/scroll loss) and triggers a fresh network `resolveArt` per attach. If touched,
  patch the single row instead of the list.
- `dashboard/studio/render.js:66` — the hero image is `loading="lazy"`; mark the first image
  `loading="eager" fetchpriority="high"` to protect LCP.
- Cold start — `writer.html` now pulls **11 module requests (~79 KB)** on every dashboard load
  (the `studio/studio.js` graph) even if the studio is never opened. Small bytes, but 11 round trips
  over HTTP/1.1, and none of them are precached (see D1).

### Checked and clean (performance)
No draft-autosave timer exists in the studio (the 700 ms debounce is `writer.js:122`, out of scope);
`blobToPeaks` closes its AudioContext (capture.js:39); the recording timer is cleared on stop *and*
cancel (studio.js:266, 298); `downloadFile` revokes its object URL (studio.js:639); published players
use `preload="none"` and no autoplay (media.js:107, 115, 125-126); the ledger is capped
(providers.js:4); Whisper/WebLLM are lazily dynamic-imported on first use, not at page load
(local-sibling.js:39, 60); the inline listen-player creates one AudioContext per page and only on
play (media.js:121); `status()` writes `textContent`; no reflow-loop patterns in the render paths.

---

## 2. Security

### S1 — Gemini key sent in the URL query string — `dashboard/studio/cloud-sibling.js:63`
`?key=${encodeURIComponent(key)}` puts the API key in a URL, which leaks into server access logs,
proxy history and `Referer`. The same file correctly uses `Authorization: Bearer` for Groq/HF
(cloud-sibling.js:32, 85), so this is an inconsistency, not a constraint.
**Fix:** send the `x-goog-api-key` request header instead of a query parameter.
*(Severity: high. Amplified by keys being persisted in `localStorage`, providers.js:1, 47.)*

### S2 — `newsListEntry` interpolates the body raw, bypassing the desk sanitizer — `dashboard/studio/site-map.js:81-89` (line 86)
The studio's shared `site-map.js` fork of the news entry interpolates `draft.body` straight into HTML.
The desk's own copy (`writer.js:331-339`) runs the same field through `sanitizeHtml`
(writer.js:167, called at writer.js:76/133/569); the studio fork does not, so any caller passing raw
HTML gets an XSS sink in the shared module. It currently has no caller inside `studio/`, but it is
exported and is one import away from being used.
**Fix:** reuse the writer.js implementation rather than forking it, or accept pre-sanitized input and
document that contract at the call site.

---

## 3. Business logic

### B1 — Cloud sibling capabilities computed once, never refreshed — `dashboard/studio/cloud-sibling.js:121-129`
`capabilities` is derived from the key store at construction time — i.e. at module load, before the
user has pasted any key — and never recomputed. `reflect()` gates on
`sibling.capabilities.includes("edit")` (studio.js:358), so after pasting a Groq or Gemini key the
Cloud sibling still reports "cannot edit" until a full reload. The transport itself is fine
(`routed()` re-reads the keys on every call, cloud-sibling.js:130), so the failure is purely the stale
advertised array.
**Fix:** derive `capabilities` from `routed()` per call (getter or method) and use that at
studio.js:358.

### B2 — The synthesized field bed never reaches the published page — `dashboard/studio/studio.js:513-527`
The bed asset emission is nested **inside** the `block.type === "voice"` branch, so with "use the
recording" off (or no audio recorded) the bed is never written even though it was rendered
(studio.js:406-409). Worse, `embellish` inserts a separate `{type: "field"}` block into the beat list
(weave.js:133-135) and `renderBlocksHtml` has no `field` case (render.js:75-77), so the bed is dropped
from the rendered article in every path; `fieldBedFigure` (media.js:112) is never used.
**Fix:** hoist bed emission out of the voice branch and render a `field` block in
`renderBlocksHtml` (or have `embellish` attach the bed to the existing voice block).

---

## 4. Deploy safety

### D1 — Studio modules missing from the service-worker precache — `dashboard/writer-sw.js:2-10`
`ASSETS` lists `writer.html`/`writer.js` but none of the 11 `dashboard/studio/*.js` modules that
`writer.html` now loads as a module graph. After the v2→v3 bump (or any cold install), an offline
load gets `writer.html` from cache but the `studio/studio.js` import fails, so `init()` never runs, no
listeners are wired, and the entire studio panel is silently inert — no error surfaced to the user.
**Fix:** add the studio module paths to `ASSETS` (or precache them in the install step).

### D2 — Unguarded, unescaped `<img src>` in the rendered article — `dashboard/studio/render.js:66`
`renderBlocksHtml` emits `<img src="${block.finalSrc}">` with no emptiness check and no attribute
escaping. When `art` is absent, studio.js:508 sets `finalSrc = art.dataUrl || ""`, producing
`<img src="">`, which resolves against the page URL — the browser re-requests the article HTML as an
image (wasted request plus broken layout) — and any quote in the value would break out of the
attribute. The write path is protected by `art.blob`, but the preview/download paths are not.
**Fix:** emit the figure only when `finalSrc` is non-empty, and escape it for the attribute.

---

## 5. Duplication / dead code (consolidate)

- **Two copies of the same hash**: `media.js:1-8` and `images.js:5-12` are identical FNV-1a
  implementations. Collapse into one shared helper.
- **A second source of truth for provider routing**: `featureList` (studio.js:74-94) re-derives
  Groq/Gemini/HF availability instead of asking the sibling's `routed()`
  (cloud-sibling.js:11-19, 130). One of the two should win.
- **Forked site-map writers**: `site-map.js:81-135` (`newsListEntry`, `insertFirstListItem`,
  `statusCardEntry`, `insertStatusCard`, `updateSitemapDate`) duplicates `writer.js:331, 341, 348,
  357, 379` with no studio caller — and the fork silently drops `sanitizeHtml` (see S2).
- **Unreferenced exports** (none called from `studio.js`): `providers.js` `allKeys` (55),
  `clearKey` (72), `listSiblings` (110), `onActiveChange` (130), `requireSibling` (135), `describe`
  (141); `idb.js` `idbKeys` (50), `idbDelete` (40), `idbClear` (60); `capture.js` `loadAudio` (12),
  `getAudioMeta` (17); `images.js` `restoreOwnImages` (23), `listOwnImages` (30), `removeOwnImage`
  (38); `local-sibling.js` `dispose` (111); `media.js` figure builders (95-118). Note that
  `idbDelete`/`idbClear`/`removeOwnImage`/`dispose` are exactly the cleanup P5 and P7 need — wire
  them up rather than deleting them.
- **Dead state fields**: `state.audioObjectUrl` (studio.js:37) and `state.bedObjectUrl` (studio.js:40)
  are written at 281 and 407 and never read or revoked. Object URLs do not duplicate the blob, so the
  cost is only a retained reference — remove the fields, or actually use them in the players.

## Suggested order of work
1. S1, S2 — trust/secrets and XSS.
2. B2, D2 — user-visible breakage in the published output.
3. D1 — offline studio is inert after the cache bump.
4. B1 — Cloud sibling requires a reload after typing a key.
5. P1, P5, P7 — the real memory/CPU costs (multi-MB re-encode, multi-GB engine, unbounded IDB).
6. P4, P2, P6, P8, P3, P9 — context lifecycle and encode blocking.
7. §5 consolidation last, reusing the cleanup helpers that P5/P7 need.
