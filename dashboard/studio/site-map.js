export const SITE = "https://spbzorro.pages.dev";

export const categoryInfo = {
  reflection: { section: "reflections", label: "Personal reflection", archive: "reflections.html", genre: "Personal reflection" },
  research: { section: "refractions", label: "Research", archive: "refractions.html", genre: "Research" },
  report: { section: "reports", label: "Report", archive: "reports.html", genre: "Report" },
};

export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&", "<": "<", ">": ">", '"': """, "'": "'",
})[char]);

const ALLOWED_TAGS = new Set(["p", "strong", "em", "a", "ul", "ol", "li", "blockquote", "br", "h1", "h2", "h3", "h4", "h5", "h6"]);
const ALLOWED_ATTRS = new Set(["href", "target", "rel", "class", "id", "datetime"]);

export const sanitizeHtml = (html) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  const toRemove = [];
  while (walker.nextNode()) {
    const el = walker.currentNode;
    if (!ALLOWED_TAGS.has(el.tagName.toLowerCase())) {
      toRemove.push(el);
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      if (!ALLOWED_ATTRS.has(attr.name.toLowerCase())) {
        el.removeAttribute(attr.name);
      }
    }
    if (el.tagName.toLowerCase() === "a") {
      el.setAttribute("rel", "noopener noreferrer");
      el.setAttribute("target", "_blank");
    }
  }
  for (const el of toRemove) el.replaceWith(...el.childNodes);
  return doc.body.innerHTML;
};

export const makeSlug = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 80)
  .replace(/-+$/g, "");

export const validSlug = (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;

export const formatDate = (value) => {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" }).format(parsed);
};

export const canonicalUrl = (slug) => `${SITE}/writing/${slug}`;

export const translateControl = () => `<select id="translate" class="translate" aria-label="Translate this page"><option value="">Translate ▾</option><option value="haw" lang="haw">ʻŌlelo Hawaiʻi</option><option value="tr" lang="tr">Türkçe</option><option value="es" lang="es">Español</option><option value="pt" lang="pt">Português</option><option value="fr" lang="fr">Français</option><option value="de" lang="de">Deutsch</option><option value="it" lang="it">Italiano</option><option value="ru" lang="ru">Русский</option><option value="uk" lang="uk">Українська</option><option value="ar" lang="ar">العربية</option><option value="hi" lang="hi">हिन्दी</option><option value="zh-CN" lang="zh-CN">中文</option><option value="ja" lang="ja">日本語</option><option value="ko" lang="ko">한국어</option><option value="vi" lang="vi">Tiếng Việt</option><option value="tl" lang="tl">Tagalog</option><option value="id" lang="id">Bahasa Indonesia</option><option value="sw" lang="sw">Kiswahili</option><option value="en" lang="en">English (original)</option></select>`;

export const articleCard = (draft) => {
  const meta = `${categoryInfo[draft.category].label} · ${formatDate(draft.date)}`;
  return `    <li data-writing-desk="${escapeHtml(draft.slug)}">
      <a href="writing/${escapeHtml(draft.slug)}">${escapeHtml(draft.title)}</a>
      <p>${escapeHtml(meta)} · ${escapeHtml(draft.description || draft.subtitle)}</p>
    </li>\n`;
};

export const insertProjectCard = (html, sectionId, card) => {
  const sectionStart = html.indexOf(`<section id="${sectionId}"`);
  if (sectionStart < 0) throw new Error(`Could not find the ${sectionId} section on the home page.`);
  const sectionEnd = html.indexOf("</section>", sectionStart);
  if (sectionEnd < 0) throw new Error(`The ${sectionId} section has no closing tag.`);
  let section = html.slice(sectionStart, sectionEnd);
  const listOpen = /<ul\b[^>]*class=["'][^"']*\bproject-list\b[^"']*["'][^>]*>/i.exec(section);
  if (listOpen) {
    const offset = sectionStart + listOpen.index + listOpen[0].length;
    return `${html.slice(0, offset)}\n${card}${html.slice(offset)}`;
  }
  if (sectionId === "reports") section = section.replace(/\s*<p>On-the-ground reporting\.\.\. first dispatches coming soon\.<\/p>/i, "");
  const speakLink = /\s*<p class="speak-link">/.exec(section);
  const insertionPoint = speakLink ? sectionStart + speakLink.index : sectionEnd;
  const list = `\n    <ul class="project-list">\n${card}    </ul>\n`;
  if (sectionId === "reports") {
    const cleanedSection = section.replace(/\s*<p>On-the-ground reporting\.\.\. first dispatches coming soon\.<\/p>/i, "");
    const updatedSection = `${cleanedSection.slice(0, speakLink ? speakLink.index : cleanedSection.length)}${list}${cleanedSection.slice(speakLink ? speakLink.index : cleanedSection.length)}`;
    return `${html.slice(0, sectionStart)}${updatedSection}${html.slice(sectionEnd)}`;
  }
  return `${html.slice(0, insertionPoint)}${list}${html.slice(insertionPoint)}`;
};

export const insertArchiveCard = (html, card) => {
  const listOpen = /<ul\b[^>]*class=["'][^"']*\bproject-list\b[^"']*["'][^>]*>/i.exec(html);
  if (listOpen) {
    const offset = listOpen.index + listOpen[0].length;
    return `${html.slice(0, offset)}\n${card}${html.slice(offset)}`;
  }
  const mainClose = html.indexOf("</main>");
  if (mainClose < 0) throw new Error("Could not find the main content section in the selected archive.");
  let main = html.slice(0, mainClose);
  main = main.replace(/\s*<p>On-the-ground reporting\.\.\. first dispatches coming soon\.<\/p>/i, "");
  const speakSection = main.indexOf('<section class="speak"');
  const insertionPoint = speakSection >= 0 ? speakSection : main.length;
  const list = `  <ul class="project-list">\n${card}  </ul>\n\n`;
  return `${main.slice(0, insertionPoint)}${list}${main.slice(insertionPoint)}${html.slice(mainClose)}`;
};

export const newsListEntry = (draft) => {
  const body = sanitizeHtml(draft.body || "");
  return `    <li id="${escapeHtml(draft.slug)}" data-writing-desk="${escapeHtml(draft.slug)}">
      <time datetime="${escapeHtml(draft.date)}">${formatDate(draft.date)}</time>
      <p><strong>${escapeHtml(draft.title)}</strong></p>
${body}
      <details class="speak" data-thread="news-${escapeHtml(draft.slug)}"><summary>Feel free to speak</summary></details>
    </li>\n`;
};

export const insertFirstListItem = (html, openingTag, entry, errorMessage) => {
  const start = html.indexOf(openingTag);
  if (start < 0) throw new Error(errorMessage);
  const offset = start + openingTag.length;
  return `${html.slice(0, offset)}\n${entry}${html.slice(offset)}`;
};

export const statusCardEntry = (draft) => {
  const summary = escapeHtml(draft.description || draft.title);
  return `\n        <li data-writing-desk="${escapeHtml(draft.slug)}">
          <time datetime="${escapeHtml(draft.date)}">${formatDate(draft.date)}</time>
          <strong>${escapeHtml(draft.title)}:</strong> ${summary}
          <a href="news#${escapeHtml(draft.slug)}">Read it</a>
        </li>`;
};

export const insertStatusCard = (html, draft) => {
  const entry = statusCardEntry(draft);
  const marker = '<ul class="status-list">';
  const start = html.indexOf(marker);
  if (start < 0) throw new Error("Could not find the home page’s status list.");
  const offset = start + marker.length;
  return `${html.slice(0, offset)}${entry}${html.slice(offset)}`;
};

export const sitemapWithArticle = (xml, slug, day) => {
  const loc = canonicalUrl(slug);
  if (xml.includes(`<loc>${loc}</loc>`)) throw new Error(`The sitemap already contains ${loc}.`);
  const entry = sitemapArticleEntry(slug, day);
  const close = xml.lastIndexOf("</urlset>");
  if (close < 0) throw new Error("Could not find the closing sitemap tag.");
  return `${xml.slice(0, close)}${entry}${xml.slice(close)}`;
};

export const sitemapArticleEntry = (slug, day) => `  <url>\n    <loc>${canonicalUrl(slug)}</loc>\n    <lastmod>${escapeHtml(day)}</lastmod>\n    <changefreq>yearly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;

export const updateSitemapDate = (xml, page, day) => {
  const loc = `${SITE}/${page}`;
  const escaped = loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = new RegExp(`(<url>\\s*<loc>${escaped}<\\/loc>\\s*<lastmod>)[^<]*(<\\/lastmod>)`);
  if (block.test(xml)) return xml.replace(block, `$1${day}$2`);
  const entry = `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${day}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
  const close = xml.lastIndexOf("</urlset>");
  if (close < 0) throw new Error("Could not find the closing sitemap tag.");
  return `${xml.slice(0, close)}${entry}${xml.slice(close)}`;
};
