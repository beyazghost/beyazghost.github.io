const $ = (id) => document.getElementById(id);
const KEYS = ["brave","tavily","exa","serper","perplexity"];
const LS = (k) => localStorage.getItem("fn_"+k);

function saveKeys() {
  KEYS.forEach(k => { const v = $(`key-${k}`).value.trim(); if (v) localStorage.setItem("fn_"+k, v); });
  $("keys-status").textContent = "saved";
  setTimeout(()=> $("keys-status").textContent="", 1500);
}
KEYS.forEach(k => { const v = LS(k); if (v) $(`key-${k}`).value = v; });
$("save-keys").addEventListener("click", saveKeys);

const results = [];
function renderResults() {
  const ul = $("results");
  ul.innerHTML = "";
  results.forEach(r => {
    const li = document.createElement("li");
    li.innerHTML = `<a href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.title||r.url)}</a>
      <div class="meta">${escapeHtml(r.source)} · ${escapeHtml(r.snippet||"")} ${r.published? "· "+r.published:""}</div>`;
    ul.appendChild(li);
  });
  $("result-count").textContent = results.length;
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

function params() {
  return {
    q: $("q").value.trim(),
    site: $("site").value.trim(),
    filetype: $("filetype").value,
    limit: Number($("limit").value)||10,
    datefrom: $("datefrom").value,
    dateto: $("dateto").value,
    lang: $("lang").value.trim(),
    safe: $("safe").value,
    providers: [...document.querySelectorAll('input[type=checkbox]:checked')].map(c=>c.value),
  };
}

async function searchBrave(p) {
  const key = LS("brave"); if (!key) throw new Error("no brave key");
  const q = buildQuery(p);
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${p.limit}`;
  const res = await fetch(url, { headers: { "X-Subscription-Token": key, "Accept":"application/json" } });
  if (!res.ok) throw new Error("brave "+res.status);
  const data = await res.json();
  return (data.web?.results||[]).map(x=>({title:x.title,url:x.url,snippet:x.description,source:"brave",published:x.page_age}));
}
async function searchTavily(p) {
  const key = LS("tavily"); if (!key) throw new Error("no tavily key");
  const res = await fetch("https://api.tavily.com/search", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ api_key:key, query:buildQuery(p), max_results:p.limit, search_depth:"basic", include_answer:false })
  });
  if (!res.ok) throw new Error("tavily "+res.status);
  const data = await res.json();
  return (data.results||[]).map(x=>({title:x.title,url:x.url,snippet:x.content,source:"tavily",published:x.published_date}));
}
async function searchExa(p) {
  const key = LS("exa"); if (!key) throw new Error("no exa key");
  const res = await fetch("https://api.exa.ai/search", {
    method:"POST", headers:{"Content-Type":"application/json","x-api-key":key},
    body: JSON.stringify({ query:buildQuery(p), numResults:p.limit, type:"neural" })
  });
  if (!res.ok) throw new Error("exa "+res.status);
  const data = await res.json();
  return (data.results||[]).map(x=>({title:x.title,url:x.url,snippet:x.text||x.snippet,source:"exa",published:x.publishedDate}));
}
async function searchSerper(p) {
  const key = LS("serper"); if (!key) throw new Error("no serper key");
  const res = await fetch("https://google.serper.dev/search", {
    method:"POST", headers:{"Content-Type":"application/json","X-API-KEY":key},
    body: JSON.stringify({ q:buildQuery(p), num:p.limit })
  });
  if (!res.ok) throw new Error("serper "+res.status);
  const data = await res.json();
  return (data.organic||[]).map(x=>({title:x.title,url:x.link,snippet:x.snippet,source:"serper",published:x.date}));
}
async function searchDDG(p) {
  // DuckDuckGo has no official API; use the public instant-answer endpoint (limited).
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(buildQuery(p))}&format=json&no_html=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("ddg "+res.status);
  const data = await res.json();
  const out = [];
  (data.RelatedTopics||[]).forEach(t => {
    if (t.FirstURL) out.push({title:t.Text,url:t.FirstURL,snippet:t.Text,source:"ddg"});
    (t.Topics||[]).forEach(st => { if (st.FirstURL) out.push({title:st.Text,url:st.FirstURL,snippet:st.Text,source:"ddg"}); });
  });
  return out.slice(0,p.limit);
}

function buildQuery(p) {
  let q = p.q;
  if (p.site) q += ` site:${p.site}`;
  if (p.filetype) q += ` filetype:${p.filetype}`;
  return q;
}

async function searchPerplexity(p) {
  const key = LS("perplexity"); if (!key) throw new Error("no perplexity key");
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method:"POST", headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},
    body: JSON.stringify({ model:"sonar", messages:[{role:"user",content:"Search the web for: "+buildQuery(p)+". Return a JSON array of results with title,url,snippet."}], temperature:0.2 })
  });
  if (!res.ok) throw new Error("perplexity "+res.status);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  // best-effort parse
  let arr = [];
  try { const m = text.match(/\[[\s\S]*\]/); if (m) arr = JSON.parse(m[0]); } catch {}
  return arr.slice(0,p.limit).map(x=>({title:x.title||x.url,url:x.url,snippet:x.snippet||"",source:"perplexity"}));
}
const ADAPTERS = { brave:searchBrave, tavily:searchTavily, exa:searchExa, serper:searchSerper, perplexity:searchPerplexity, ddg:searchDDG };

$("run-search").addEventListener("click", async () => {
  const p = params();
  if (!p.q) { $("search-status").textContent = "enter a query"; return; }
  $("search-status").textContent = "searching...";
  const tasks = p.providers.map(async (prov) => {
    try {
      const r = await ADAPTERS[prov](p);
      r.forEach(x => results.push(x));
      renderResults();
    } catch (e) {
      $("search-status").textContent += ` [${prov}: ${e.message}]`;
    }
  });
  await Promise.allSettled(tasks);
  // dedup by url
  const seen = new Set(); const dedup = [];
  results.forEach(r => { if (seen.has(r.url)) return; seen.add(r.url); dedup.push(r); });
  results.length = 0; results.push(...dedup);
  renderResults();
  $("search-status").textContent = `done · ${results.length} unique results`;
  recordRun(p, [...results]);
});
$("clear-results").addEventListener("click", () => { results.length=0; renderResults(); $("search-status").textContent=""; });

// Elasticsearch
$("es-run").addEventListener("click", async () => {
  const url = $("es-url").value.trim().replace(/\/$/,"");
  const index = $("es-index").value.trim() || "fishingnet";
  const key = $("es-key").value.trim();
  const mode = $("es-mode").value;
  $("es-status").textContent = "running...";
  $("es-out").textContent = "";
  try {
    const headers = { "Content-Type":"application/json" };
    if (key) headers["Authorization"] = `ApiKey ${key}`.includes(" ") ? `Bearer ${key}` : `ApiKey ${key}`;
    if (mode === "ingest") {
      // bulk ingest current results
      const body = results.map(r => JSON.stringify({ index:{_index:index} })+"\n"+JSON.stringify(r)).join("\n")+"\n";
      const res = await fetch(`${url}/_bulk`, { method:"POST", headers, body });
      const data = await res.json();
      $("es-out").textContent = JSON.stringify(data,null,2);
      $("es-status").textContent = res.ok ? "ingested" : "failed";
    } else {
      let body = $("es-query").value.trim();
      if (!body) body = JSON.stringify({query:{match_all:{}},size:20});
      const res = await fetch(`${url}/${index}/_search`, { method:"POST", headers, body });
      const data = await res.json();
      $("es-out").textContent = JSON.stringify(data,null,2);
      $("es-status").textContent = res.ok ? "ok" : "failed";
    }
  } catch (e) {
    $("es-status").textContent = "error: "+e.message;
  }
});


// History storage (localStorage, capped)
const HIST_KEY = "fn_history";
function loadHistory(){ try { return JSON.parse(localStorage.getItem(HIST_KEY)||"[]"); } catch { return []; } }
function saveHistory(h){ localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(-200))); }
function recordRun(p, res) {
  const h = loadHistory();
  h.push({ ts: new Date().toISOString(), query: p.q, params: p, count: res.length, results: res });
  saveHistory(h);
}

// Recurring
let recTimer = null;
function startRecurring() {
  const hours = Number($("rec-hours").value)||2;
  const ms = hours*3600*1000;
  if (recTimer) clearInterval(recTimer);
  const run = async () => {
    const p = params();
    if (!p.q) return;
    $("rec-status").textContent = "running...";
    const batch = [];
    for (const prov of p.providers) {
      try { const r = await ADAPTERS[prov](p); r.forEach(x=>batch.push(x)); } catch(e){ $("rec-msg").textContent = prov+": "+e.message; }
    }
    // dedup
    const seen=new Set(); const dedup=[]; batch.forEach(r=>{ if(seen.has(r.url))return; seen.add(r.url); dedup.push(r);});
    dedup.forEach(r=>results.push(r));
    renderResults();
    recordRun(p, dedup);
    $("rec-status").textContent = "last run "+new Date().toLocaleTimeString();
    $("rec-msg").textContent = `+${dedup.length} results`;
  };
  run();
  recTimer = setInterval(run, ms);
  $("rec-status").textContent = "running every "+hours+"h";
  $("rec-msg").textContent = "started";
}
function stopRecurring() {
  if (recTimer) { clearInterval(recTimer); recTimer=null; }
  $("rec-status").textContent = "stopped";
  $("rec-msg").textContent = "";
}
$("rec-start").addEventListener("click", startRecurring);
$("rec-stop").addEventListener("click", stopRecurring);

// Record manual runs too: wrap run-search handler? Instead record after manual search by hooking.
const _origRender = renderResults;
// hook: after run-search completes, record. We'll monkeypatch by adding recordRun in the run-search listener already defined above; re-open not possible. Instead add a delegated capture:
document.addEventListener("fn:run", (e)=> recordRun(e.detail.p, e.detail.res));
