import {
  SITE, escapeHtml, formatDate, translateControl, canonicalUrl, categoryInfo,
} from "./site-map.js";
import { listenPlayerMarkup, listenPlayerScript } from "./media.js";

export function extFromMime(mimeType) {
  if (/wav/.test(mimeType)) return "wav";
  if (/ogg/.test(mimeType)) return "ogg";
  if (/m4a|mp4/.test(mimeType)) return "m4a";
  if (/webm/.test(mimeType)) return "webm";
  if (/mpeg|mp3/.test(mimeType)) return "mp3";
  if (/jpeg|jpg/.test(mimeType)) return "jpg";
  if (/png/.test(mimeType)) return "png";
  if (/svg/.test(mimeType)) return "svg";
  return "bin";
}

export function assetHref(slug, kind, index, ext) {
  return `${slug}/assets/${kind}-${index}.${ext}`;
}

function plainTextOf(blocks) {
  return blocks
    .filter((block) => block.text)
    .map((block) => block.text)
    .join(" ");
}

function readMinutes(blocks) {
  const words = plainTextOf(blocks).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 225));
}

function firstImageBlock(blocks) {
  return blocks.find((block) => block.type === "image") || null;
}

export function heroAbsolute(meta) {
  const hero = firstImageBlock(meta.blocks || []);
  if (!hero || !hero.finalSrc || hero.artProvider === "placeholder") return `${SITE}/portrait-og.jpg`;
  if (/^data:/.test(hero.finalSrc)) return `${SITE}/portrait-og.jpg`;
  return `${SITE}/writing/${hero.finalSrc}`;
}

export function renderBlocksHtml(blocks) {
  let heroUsed = false;
  const parts = [];
  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        parts.push(`<h2>${escapeHtml(block.text)}</h2>`);
        break;
      case "paragraph":
        parts.push(`<p>${escapeHtml(block.text)}</p>`);
        break;
      case "quote":
        parts.push(`<blockquote class="pull"><p><em>${escapeHtml(block.text)}</em></p></blockquote>`);
        break;
      case "divider":
        parts.push(`<hr>`);
        break;
      case "image": {
        const caption = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : "";
        const alt = escapeHtml(block.caption || block.prompt || "Image from the field");
        const cls = heroUsed ? "wide kenburns" : "hero";
        const src = escapeHtml(block.finalSrc || "");
        if (src) {
          parts.push(`  <figure class="${cls}">\n    <img src="${src}" alt="${alt}" loading="lazy">${caption}\n  </figure>`);
          heroUsed = true;
        }
        break;
      }
      case "voice":
        if (block.narrationSrc) {
          parts.push(listenPlayerMarkup(block.narrationSrc, block.bedSrc, "my voice, with the field beneath it"));
        }
        break;
      case "field":
        if (block.bedSrc) {
          parts.push(listenPlayerMarkup("", block.bedSrc, "the field"));
        }
        break;
      default:
        break;
    }
  }
  return parts.join("\n");
}

export function renderArticleHtml(meta) {
  const config = categoryInfo[meta.category] || categoryInfo.reflection;
  const title = escapeHtml(meta.title);
  const subtitle = escapeHtml(meta.subtitle || "");
  const description = escapeHtml(meta.description || meta.subtitle || meta.title);
  const url = canonicalUrl(meta.slug);
  const minutes = readMinutes(meta.blocks || []);
  const heroImage = heroAbsolute(meta);
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: meta.title,
    alternativeHeadline: meta.subtitle || undefined,
    genre: config.genre,
    datePublished: meta.date,
    image: heroImage,
    about: meta.about || undefined,
    author: { "@type": "Person", name: "Sean Patrick Barrett", url: `${SITE}/` },
    mainEntityOfPage: url,
  }, null, 2);
  const blocksHtml = renderBlocksHtml(meta.blocks || []);
  const spineNote = meta.spine ? `  <p class="note lede-note"><strong>One line it hangs on:</strong> ${escapeHtml(meta.spine)}</p>\n` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}... Sean Patrick Barrett</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${url}">
<link rel="preload" href="../fonts/newsreader-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="../style.css">
<meta property="og:type" content="article">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${heroImage}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${jsonLd.replace(/</g, "\\u003c")}</script>
</head>
<body class="story">
<header class="site-header">
  <div class="wrap">
    <p class="crumb"><a href="../">&larr; Sean Patrick Barrett</a> ${translateControl()}</p>
    <p class="label">${escapeHtml(config.label)} &middot; ${formatDate(meta.date)}</p>
    <h1>${title}</h1>
    <p class="tagline"><em>${subtitle}</em></p>
    <div class="author"><img src="author-avatar.svg" width="44" height="44" alt=""><p><a href="../">Sean Patrick Barrett</a><span>${minutes} min read &middot; ${formatDate(meta.date)} &middot; dictated &amp; woven with my sibling</span></p></div>
  </div>
</header>
<main class="wrap article">
${spineNote}
${blocksHtml}
  <section class="speak" id="speak" data-thread="writing-${escapeHtml(meta.slug)}"><h2>Feel free to speak</h2></section>
</main>
<footer class="site-footer"><div class="wrap"><p>&copy; ${new Date(`${meta.date}T12:00:00`).getFullYear()} Sean Patrick Barrett &middot; <a href="../">Home</a></p></div></footer>
<script src="../translate.js" defer></script>
<script src="../comments.js" defer></script>
<script>${listenPlayerScript()}</script>
</body>
</html>
`;
}
