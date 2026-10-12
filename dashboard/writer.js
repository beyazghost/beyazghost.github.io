(() => {
  const SITE = "https://spbzorro.pages.dev";
  const DRAFTS_KEY = "zorro-writing-desk-drafts-v1";
  const category = document.getElementById("category");
  const title = document.getElementById("title");
  const subtitle = document.getElementById("subtitle");
  const date = document.getElementById("date");
  const description = document.getElementById("description");
  const slugInput = document.getElementById("slug");
  const bodyEditor = document.getElementById("body-editor");
  const status = document.getElementById("editor-status");
  const preview = document.getElementById("preview");
  const previewEmpty = document.getElementById("preview-empty");
  const draftList = document.getElementById("draft-list");
  const writeButton = document.getElementById("write-entry");
  const categoryInfo = {
    reflection: { section: "reflections", label: "Personal reflection", archive: "reflections.html", genre: "Personal reflection" },
    research: { section: "refractions", label: "Research", archive: "refractions.html", genre: "Research" },
    report: { section: "reports", label: "Report", archive: "reports.html", genre: "Report" },
  };
  let siteDirectory = null;
  let slugWasEdited = false;
  let currentDraftId = "";
  let saveTimer = 0;

  const localDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  };

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);

  const makeSlug = (value) => String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");

  const validSlug = (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;

  const formatDate = (value) => {
    const parsed = new Date(`${value}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" }).format(parsed);
  };

  function showStatus(message, kind = "") {
    status.textContent = message;
    status.className = `status${kind ? ` ${kind}` : ""}`;
  }

  function readDrafts() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DRAFTS_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function currentDraft() {
    const section = category.value;
    const data = {
      category: section,
      title: title.value.trim(),
      subtitle: subtitle.value.trim(),
      date: date.value,
      description: description.value.trim(),
      slug: section === "news" ? (makeSlug(title.value) || `update-${date.value}`) : slugInput.value.trim(),
      slugEdited: slugWasEdited,
      body: sanitizeHtml(bodyEditor.innerHTML),
      savedAt: new Date().toISOString(),
    };
    const id = currentDraftId || `${data.category}-${makeSlug(data.title) || "untitled"}`;
    return { id, data };
  }

  function refreshDraftOptions(selectedId = "") {
    const drafts = readDrafts();
    const entries = Object.values(drafts).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    draftList.replaceChildren();
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = entries.length ? "Choose a saved draft" : "No saved drafts yet";
    draftList.append(empty);
    for (const draft of entries) {
      const option = document.createElement("option");
      option.value = draft.id;
      option.textContent = `${draft.title || "Untitled"} · ${draft.category || "draft"}`;
      draftList.append(option);
    }
    draftList.value = selectedId;
  }

  function saveDraft(announce = true) {
    const { id, data } = currentDraft();
    if (!data.title && !data.body.replace(/<[^>]*>/g, "").trim()) {
      if (announce) showStatus("Add a title or some text before saving a draft.", "error");
      return false;
    }
    try {
      const drafts = readDrafts();
      drafts[id] = { id, ...data };
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
      currentDraftId = id;
      refreshDraftOptions(id);
      if (announce) showStatus("Draft saved in this browser. It stays available offline.", "ok");
      return true;
    } catch {
      if (announce) showStatus("This browser could not save the draft. Export the entry before closing this page.", "error");
      return false;
    }
  }

  function scheduleDraftSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveDraft(false), 700);
  }

  function restoreDraft(draft) {
    category.value = ["reflection", "research", "report", "news"].includes(draft.category) ? draft.category : "reflection";
    title.value = draft.title || "";
    subtitle.value = draft.subtitle || "";
    date.value = draft.date || localDate();
    description.value = draft.description || "";
    slugInput.value = draft.slug || makeSlug(draft.title);
    slugWasEdited = !!draft.slugEdited;
    bodyEditor.innerHTML = sanitizeHtml(draft.body || "");
    currentDraftId = draft.id || "";
    syncCategoryFields();
    showStatus("Draft loaded from this browser.", "ok");
  }

  function startNewEntry() {
    window.clearTimeout(saveTimer);
    currentDraftId = "";
    slugWasEdited = false;
    category.value = "reflection";
    title.value = "";
    subtitle.value = "";
    date.value = localDate();
    description.value = "";
    slugInput.value = "";
    bodyEditor.replaceChildren();
    syncCategoryFields();
    refreshDraftOptions();
    preview.hidden = true;
    previewEmpty.hidden = false;
    showStatus("Started a new entry. Previous drafts remain saved in this browser.");
  }

  function syncCategoryFields() {
    const isNews = category.value === "news";
    document.getElementById("subtitle-field").hidden = isNews;
    document.getElementById("slug-field").hidden = isNews;
    document.getElementById("description-field").querySelector("label").textContent = isNews ? "Short line for the home page" : "Listing description";
    document.getElementById("description").placeholder = isNews
      ? "One sentence shown in the current-status list."
      : "The short description shown in the section lists.";
  }

  function sanitizeHtml(input) {
    const source = document.createElement("template");
    source.innerHTML = String(input || "");
    const allowed = new Set(["P", "H2", "H3", "STRONG", "B", "EM", "I", "A", "BLOCKQUOTE", "UL", "OL", "LI", "HR", "BR", "PRE", "CODE"]);
    const cleanNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || "");
      if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
      const tag = node.tagName.toUpperCase();
      const children = document.createDocumentFragment();
      for (const child of [...node.childNodes]) children.append(cleanNode(child));
      if (!allowed.has(tag)) return children;
      const clean = document.createElement(tag.toLowerCase());
      if (tag === "A") {
        const href = (node.getAttribute("href") || "").trim();
        if (/^(https?:|mailto:|\/|\.\.?\/|#)/i.test(href) && !/^javascript:/i.test(href)) {
          clean.setAttribute("href", href);
          if (/^https?:/i.test(href)) {
            clean.setAttribute("target", "_blank");
            clean.setAttribute("rel", "noopener");
          }
        }
      }
      clean.append(children);
      return clean;
    };
    const result = document.createElement("div");
    const inline = [];
    const flushInline = () => {
      if (!inline.length) return;
      const paragraph = document.createElement("p");
      paragraph.append(...inline.splice(0));
      result.append(paragraph);
    };
    const blockTags = new Set(["P", "H2", "H3", "BLOCKQUOTE", "UL", "OL", "PRE", "HR"]);
    for (const child of [...source.content.childNodes]) {
      const clean = cleanNode(child);
      if (clean.nodeType === Node.ELEMENT_NODE && blockTags.has(clean.tagName)) {
        flushInline();
        result.append(clean);
      } else if (clean.nodeType === Node.TEXT_NODE && !clean.textContent.trim()) {
        if (inline.length) inline.push(clean);
      } else {
        inline.push(clean);
      }
    }
    flushInline();
    return result.innerHTML;
  }

  function translateControl() {
    return `<select id="translate" class="translate" aria-label="Translate this page"><option value="">Translate ▾</option><option value="haw" lang="haw">ʻŌlelo Hawaiʻi</option><option value="tr" lang="tr">Türkçe</option><option value="es" lang="es">Español</option><option value="pt" lang="pt">Português</option><option value="fr" lang="fr">Français</option><option value="de" lang="de">Deutsch</option><option value="it" lang="it">Italiano</option><option value="ru" lang="ru">Русский</option><option value="uk" lang="uk">Українська</option><option value="ar" lang="ar">العربية</option><option value="iw" lang="iw">עברית</option><option value="hi" lang="hi">हिन्दी</option><option value="zh-CN" lang="zh-CN">中文</option><option value="ja" lang="ja">日本語</option><option value="ko" lang="ko">한국어</option><option value="vi" lang="vi">Tiếng Việt</option><option value="tl" lang="tl">Tagalog</option><option value="id" lang="id">Bahasa Indonesia</option><option value="sw" lang="sw">Kiswahili</option><option value="en" lang="en">English (original)</option></select>`;
  }

  function canonicalUrl(slug) {
    return `${SITE}/writing/${slug}`;
  }

  function articleHtml(draft) {
    const metaTitle = escapeHtml(`${draft.title}... Sean Patrick Barrett`);
    const safeTitle = escapeHtml(draft.title);
    const safeSubtitle = escapeHtml(draft.subtitle);
    const safeDescription = escapeHtml(draft.description || draft.subtitle || draft.title);
    const pubDate = escapeHtml(draft.date);
    const url = canonicalUrl(draft.slug);
    const config = categoryInfo[draft.category];
    const plainBody = new DOMParser().parseFromString(draft.body, "text/html").body.textContent || "";
    const minutes = Math.max(1, Math.ceil(plainBody.trim().split(/\s+/).filter(Boolean).length / 225));
    const jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: draft.title,
      alternativeHeadline: draft.subtitle || undefined,
      genre: config.genre,
      datePublished: draft.date,
      author: { "@type": "Person", name: "Sean Patrick Barrett", url: `${SITE}/` },
      mainEntityOfPage: url,
    }, null, 2);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${metaTitle}</title>
<meta name="description" content="${safeDescription}">
<link rel="canonical" href="${url}">
<link rel="preload" href="../fonts/newsreader-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="../style.css">
<meta property="og:type" content="article">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/portrait-og.jpg">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${jsonLd.replace(/</g, "\\u003c")}</script>
</head>
<body class="story">
<header class="site-header">
  <div class="wrap">
    <p class="crumb"><a href="../">&larr; Sean Patrick Barrett</a> ${translateControl()}</p>
    <p class="label">${escapeHtml(config.label)} · ${formatDate(draft.date)}</p>
    <h1>${safeTitle}</h1>
    <p class="tagline"><em>${safeSubtitle}</em></p>
    <div class="author"><img src="author-avatar.svg" width="44" height="44" alt=""><p><a href="../">Sean Patrick Barrett</a><span>${minutes} min read · ${formatDate(draft.date)}</span></p></div>
  </div>
</header>
<main class="wrap article">
${draft.body}
  <section class="speak" id="speak" data-thread="writing-${escapeHtml(draft.slug)}"><h2>Feel free to speak</h2></section>
</main>
<footer class="site-footer"><div class="wrap"><p>&copy; ${new Date(`${draft.date}T12:00:00`).getFullYear()} Sean Patrick Barrett &middot; <a href="../">Home</a></p></div></footer>
<script src="../translate.js" defer></script>
<script src="../comments.js" defer></script>
</body>
</html>
`;
  }

  function articleCard(draft) {
    const meta = `${categoryInfo[draft.category].label} · ${formatDate(draft.date)}`;
    return `    <li data-writing-desk="${escapeHtml(draft.slug)}">
      <a href="writing/${escapeHtml(draft.slug)}">${escapeHtml(draft.title)}</a>
      <p>${escapeHtml(meta)} · ${escapeHtml(draft.description || draft.subtitle)}</p>
    </li>\n`;
  }

  function insertProjectCard(html, sectionId, card) {
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
  }

  function insertArchiveCard(html, card) {
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
  }

  function newsListEntry(draft) {
    const body = sanitizeHtml(draft.body);
    return `    <li id="${escapeHtml(draft.slug)}" data-writing-desk="${escapeHtml(draft.slug)}">
      <time datetime="${escapeHtml(draft.date)}">${formatDate(draft.date)}</time>
      <p><strong>${escapeHtml(draft.title)}</strong></p>
${body}
      <details class="speak" data-thread="news-${escapeHtml(draft.slug)}"><summary>Feel free to speak</summary></details>
    </li>\n`;
  }

  function insertFirstListItem(html, openingTag, entry, errorMessage) {
    const start = html.indexOf(openingTag);
    if (start < 0) throw new Error(errorMessage);
    const offset = start + openingTag.length;
    return `${html.slice(0, offset)}\n${entry}${html.slice(offset)}`;
  }

  function statusCardEntry(draft) {
    const summary = escapeHtml(draft.description || draft.title);
    return `\n        <li data-writing-desk="${escapeHtml(draft.slug)}">
          <time datetime="${escapeHtml(draft.date)}">${formatDate(draft.date)}</time>
          <strong>${escapeHtml(draft.title)}:</strong> ${summary}
          <a href="news#${escapeHtml(draft.slug)}">Read it</a>
        </li>`;
  }

  function insertStatusCard(html, draft) {
    const entry = statusCardEntry(draft);
    const marker = '<ul class="status-list">';
    const start = html.indexOf(marker);
    if (start < 0) throw new Error("Could not find the home page’s status list.");
    const offset = start + marker.length;
    return `${html.slice(0, offset)}${entry}${html.slice(offset)}`;
  }

  function sitemapWithArticle(xml, slug, day) {
    const loc = canonicalUrl(slug);
    if (xml.includes(`<loc>${loc}</loc>`)) throw new Error(`The sitemap already contains ${loc}.`);
    const entry = sitemapArticleEntry(slug, day);
    const close = xml.lastIndexOf("</urlset>");
    if (close < 0) throw new Error("Could not find the closing sitemap tag.");
    return `${xml.slice(0, close)}${entry}${xml.slice(close)}`;
  }

  function sitemapArticleEntry(slug, day) {
    return `  <url>\n    <loc>${canonicalUrl(slug)}</loc>\n    <lastmod>${escapeHtml(day)}</lastmod>\n    <changefreq>yearly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
  }

  function updateSitemapDate(xml, page, day) {
    const loc = `${SITE}/${page}`;
    const escaped = loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = new RegExp(`(<url>\\s*<loc>${escaped}<\\/loc>\\s*<lastmod>)[^<]*(<\\/lastmod>)`);
    if (block.test(xml)) return xml.replace(block, `$1${day}$2`);
    const entry = `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${day}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
    const close = xml.lastIndexOf("</urlset>");
    if (close < 0) throw new Error("Could not find the closing sitemap tag.");
    return `${xml.slice(0, close)}${entry}${xml.slice(close)}`;
  }

  async function readText(directory, name) {
    const handle = await directory.getFileHandle(name);
    return await (await handle.getFile()).text();
  }

  async function prepareUpdates(draft) {
    if (!siteDirectory) throw new Error("Choose the site’s local folder first.");
    const index = await readText(siteDirectory, "index.html");
    const style = await readText(siteDirectory, "style.css");
    if (!style.includes(".story .article")) throw new Error("That folder does not look like the spbzorro site folder.");
    const sitemap = await readText(siteDirectory, "sitemap.xml");
    const updates = new Map();

    if (draft.category === "news") {
      const news = await readText(siteDirectory, "news.html");
      if (news.includes(`id="${draft.slug}"`)) throw new Error(`Status entry “${draft.slug}” already exists.`);
      updates.set("news.html", insertFirstListItem(news, '<ol class="news">', newsListEntry(draft), "Could not find the news entry list."));
      updates.set("index.html", insertStatusCard(index, draft));
      updates.set("sitemap.xml", updateSitemapDate(updateSitemapDate(sitemap, "news", draft.date), "", draft.date));
      return updates;
    }

    const config = categoryInfo[draft.category];
    const writerDirectory = await siteDirectory.getDirectoryHandle("writing");
    try {
      await writerDirectory.getFileHandle(`${draft.slug}.html`);
      throw new Error(`The writing page “${draft.slug}” already exists.`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) throw error;
      if (error?.name !== "NotFoundError") throw error;
    }
    const archive = await readText(siteDirectory, config.archive);
    const pagePath = `writing/${draft.slug}`;
    if (index.includes(`href="${pagePath}"`) || archive.includes(`href="${pagePath}"`)) {
      throw new Error(`The writing page “${draft.slug}” is already listed in the site.`);
    }
    const card = articleCard(draft);
    updates.set(`writing/${draft.slug}.html`, articleHtml(draft));
    updates.set("index.html", insertProjectCard(index, config.section, card));
    updates.set(config.archive, insertArchiveCard(archive, card));
    updates.set("sitemap.xml", sitemapWithArticle(sitemap, draft.slug, draft.date));
    return updates;
  }

  async function writeUpdates(updates) {
    const handles = new Map();
    for (const [path] of updates) {
      const pieces = path.split("/");
      let directory = siteDirectory;
      for (const piece of pieces.slice(0, -1)) directory = await directory.getDirectoryHandle(piece);
      const handle = await directory.getFileHandle(pieces.at(-1), { create: true });
      handles.set(path, handle);
    }
    for (const [path, content] of updates) {
      const writable = await handles.get(path).createWritable();
      await writable.write(content);
      await writable.close();
    }
  }

  async function chooseSiteFolder() {
    if (!window.showDirectoryPicker) {
      showStatus("Folder writing is not available in this browser. Use the download fallback below.", "error");
      return;
    }
    try {
      const selected = await window.showDirectoryPicker({ mode: "readwrite" });
      await readText(selected, "index.html");
      await readText(selected, "style.css");
      siteDirectory = selected;
      document.getElementById("privacy-note").textContent = `Ready to write into “${selected.name}”. Content remains on this computer.`;
      document.getElementById("privacy-note").className = "privacy";
      showStatus(`Selected site folder: ${selected.name}.`, "ok");
    } catch (error) {
      if (error?.name === "AbortError") return;
      siteDirectory = null;
      showStatus(error?.message || "Could not open that folder. Choose the root of the spbzorro site source.", "error");
    }
  }

  function downloadFile(name, content, type = "text/html") {
    const blob = new Blob([content], { type: `${type};charset=utf-8` });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  async function downloadFallback() {
    const draft = currentDraft().data;
    if (!draft.title || !draft.date || !draft.body.replace(/<[^>]*>/g, "").trim()) {
      showStatus("Add a title, date, and entry text before exporting.", "error");
      return;
    }
    if (draft.category === "news") {
      downloadFile(`${makeSlug(draft.title) || "status-update"}-news-entry.html`, newsListEntry(draft), "text/html");
      downloadFile(`${makeSlug(draft.title) || "status-update"}-home-status-entry.html`, statusCardEntry(draft), "text/html");
      showStatus("Downloaded the news entry and home-status snippet. Add them to news.html and index.html in your site folder.", "ok");
      return;
    }
    if (!draft.slug) {
      showStatus("Set a page address before exporting.", "error");
      return;
    }
    if (!validSlug(draft.slug)) {
      showStatus("Use only lowercase letters, numbers, and single hyphens in the page address.", "error");
      return;
    }
    const card = articleCard(draft);
    downloadFile(`${draft.slug}.html`, articleHtml(draft));
    downloadFile(`${draft.slug}-section-card.html`, card);
    downloadFile(`${draft.slug}-sitemap-entry.xml`, sitemapArticleEntry(draft.slug, draft.date), "application/xml");
    showStatus("Downloaded the article and its section/sitemap snippets. Add them to your site folder.", "ok");
  }

  async function writeEntry() {
    if (!title.value.trim() || !date.value || !currentDraft().data.body.replace(/<[^>]*>/g, "").trim()) {
      showStatus("Add a title, date, and entry text before writing to the site.", "error");
      return;
    }
    if (category.value !== "news" && !slugInput.value.trim()) {
      showStatus("Add a page address before writing this article.", "error");
      return;
    }
    const draft = currentDraft().data;
    if (category.value !== "news" && !validSlug(draft.slug)) {
      showStatus("Use only lowercase letters, numbers, and single hyphens in the page address.", "error");
      return;
    }
    writeButton.disabled = true;
    try {
      const updates = await prepareUpdates(draft);
      await writeUpdates(updates);
      saveDraft(false);
      showStatus(`Wrote ${[...updates.keys()].join(", ")}. These files are local; publish them through your usual Git workflow.`, "ok");
    } catch (error) {
      showStatus(error?.message || "Could not write the entry. Your draft remains saved in this browser.", "error");
    } finally {
      writeButton.disabled = false;
    }
  }

  function buildPreview() {
    const draft = currentDraft().data;
    if (!draft.title || !draft.date || !draft.body.replace(/<[^>]*>/g, "").trim()) {
      showStatus("Add a title, date, and entry text to preview.", "error");
      return;
    }
    let markup;
    if (draft.category === "news") {
      markup = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><base href="../"><link rel="stylesheet" href="style.css"><title>${escapeHtml(draft.title)}</title></head><body class="story"><header class="site-header"><div class="wrap"><p class="label">Status</p><h1>Status Updates</h1><p class="tagline"><em>Straight from me, newest first.</em></p></div></header><main class="wrap news-page"><ol class="news">${newsListEntry(draft)}</ol></main></body></html>`;
    } else {
      markup = articleHtml(draft);
      markup = markup.replace('<link rel="stylesheet" href="../style.css">', '<base href="../"><link rel="stylesheet" href="style.css">');
    }
    preview.srcdoc = markup;
    preview.hidden = false;
    previewEmpty.hidden = true;
    preview.scrollIntoView({ behavior: "smooth", block: "start" });
    showStatus("Preview updated.", "ok");
  }

  title.addEventListener("input", () => {
    if (!slugWasEdited && category.value !== "news") slugInput.value = makeSlug(title.value);
    scheduleDraftSave();
  });
  slugInput.addEventListener("input", () => { slugWasEdited = true; scheduleDraftSave(); });
  category.addEventListener("change", () => { syncCategoryFields(); scheduleDraftSave(); });
  for (const field of [subtitle, date, description, bodyEditor]) {
    field.addEventListener("input", scheduleDraftSave);
    field.addEventListener("change", scheduleDraftSave);
  }

  document.getElementById("toolbar").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-command]");
    if (!button) return;
    bodyEditor.focus();
    document.execCommand(button.dataset.command, false, button.dataset.value || null);
    bodyEditor.innerHTML = sanitizeHtml(bodyEditor.innerHTML);
    scheduleDraftSave();
  });
  document.getElementById("insert-link").addEventListener("click", () => {
    const href = window.prompt("Enter a web address or relative site link:");
    if (!href) return;
    if (!/^(https?:\/\/|mailto:|\/|\.\.?\/|#)/i.test(href)) {
      showStatus("Use a web address, email link, or relative site link.", "error");
      return;
    }
    bodyEditor.focus();
    document.execCommand("createLink", false, href);
    bodyEditor.innerHTML = sanitizeHtml(bodyEditor.innerHTML);
    scheduleDraftSave();
  });
  document.getElementById("choose-folder").addEventListener("click", chooseSiteFolder);
  document.getElementById("publish-site").addEventListener("click", () => {
    showStatus("Opening the local publish terminal. Approve the browser prompt if it appears.");
    window.location.href = "spbzorro-publish://run";
  });
  document.getElementById("new-entry").addEventListener("click", startNewEntry);
  document.getElementById("save-draft").addEventListener("click", () => saveDraft(true));
  document.getElementById("preview-entry").addEventListener("click", buildPreview);
  document.getElementById("write-entry").addEventListener("click", writeEntry);
  document.getElementById("load-draft").addEventListener("click", () => {
    const selected = readDrafts()[draftList.value];
    if (selected) restoreDraft(selected);
  });
  document.getElementById("delete-draft").addEventListener("click", () => {
    const id = draftList.value;
    if (!id) return;
    const drafts = readDrafts();
    delete drafts[id];
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    currentDraftId = "";
    refreshDraftOptions();
    showStatus("Draft deleted from this browser.", "ok");
  });
  document.getElementById("download-fallback").addEventListener("click", downloadFallback);

  document.getElementById("date").value = localDate();
  syncCategoryFields();
  refreshDraftOptions();
  document.getElementById("folder-support").textContent = window.showDirectoryPicker
    ? "Direct local-folder writing is available in this browser."
    : "This browser cannot write directly to a folder; use the download snippets instead.";
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("writer-sw.js").catch(() => {});
  }
})();
