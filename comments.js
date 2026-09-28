// Anonymous comments ("Feel free to speak"), backed by the journo-comments Worker.
// Markup: <section class="speak" id="speak" data-thread="..."><h2>Feel free to speak</h2></section>
//     or: <details class="speak" data-thread="..."><summary>Feel free to speak</summary></details>
(() => {
  const API = "https://journo-comments.journo-sentinel.workers.dev";
  const SITEKEY = "0x4AAAAAAFFuR5dIXflIt2fe";
  let turnstile;

  function loadTurnstile() {
    if (!turnstile) {
      turnstile = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        s.onload = () => resolve(window.turnstile);
        s.onerror = reject;
        document.head.append(s);
      });
    }
    return turnstile;
  }

  const fmt = (ts) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  };

  function item(c) {
    const li = el("li");
    const meta = el("p", "speak-meta");
    meta.append(el("span", "speak-who", "Anonymous"), document.createTextNode(" · "));
    const t = el("time", null, fmt(c.created_at));
    t.dateTime = new Date(c.created_at).toISOString();
    meta.append(t);
    li.append(meta, el("p", "speak-body", c.body));
    return li;
  }

  function build(box) {
    if (box.dataset.ready) return;
    box.dataset.ready = "1";
    const thread = box.dataset.thread;

    const list = el("ol", "speak-list");
    const empty = el("p", "speak-empty", "No one has spoken yet... be the first.");
    const form = el("form", "speak-form");
    const label = el("label", "speak-label", "Your words");
    const area = el("textarea");
    area.id = "speak-" + thread;
    label.htmlFor = area.id;
    area.maxLength = 2000;
    area.rows = 4;
    area.required = true;
    area.placeholder = "Say what’s true for you...";
    const trap = el("input", "speak-trap");
    trap.name = "website";
    trap.tabIndex = -1;
    trap.autocomplete = "off";
    trap.setAttribute("aria-hidden", "true");
    const widget = el("div", "speak-widget");
    const row = el("div", "speak-row");
    const btn = el("button", "speak-send", "Speak");
    btn.type = "submit";
    const status = el("p", "speak-status");
    status.setAttribute("aria-live", "polite");
    row.append(btn, status);
    const note = el("p", "speak-note",
      "Anonymous. No name, no email, and no IP address is stored. Comments appear right away and may be removed. Please don’t post anyone’s private information.");
    form.append(label, area, trap, widget, row, note);
    box.append(list, empty, form);

    fetch(`${API}/comments?thread=${encodeURIComponent(thread)}`)
      .then((r) => r.json())
      .then((d) => {
        for (const c of d.comments || []) list.append(item(c));
        empty.hidden = list.children.length > 0;
      })
      .catch(() => { empty.textContent = "Comments couldn’t load right now."; });

    let widgetId, token = "";
    const waiters = [];
    const ready = () => {
      if (widgetId !== undefined) return;
      widgetId = null;
      loadTurnstile().then((ts) => {
        widgetId = ts.render(widget, {
          sitekey: SITEKEY,
          appearance: "interaction-only",
          "refresh-expired": "auto",
          callback: (t) => { token = t; waiters.splice(0).forEach((w) => w(t)); },
          "expired-callback": () => { token = ""; },
        });
      }).catch(() => { status.textContent = "The human check couldn’t load... try reloading the page."; });
    };
    area.addEventListener("focus", ready, { once: true });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = area.value.trim();
      if (!body) return;
      ready();
      btn.disabled = true;
      status.textContent = "Sending...";
      try {
        const t = token || await new Promise((res, rej) => { waiters.push(res); setTimeout(() => rej(new Error("timeout")), 20000); });
        const r = await fetch(`${API}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thread, body, token: t, website: trap.value }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Something went wrong.");
        if (d.comment) list.append(item(d.comment));
        empty.hidden = true;
        area.value = "";
        status.textContent = "Thank you for speaking.";
      } catch (err) {
        status.textContent = err.message === "timeout" ? "Couldn’t verify you’re human... please try again." : err.message;
      } finally {
        token = "";
        if (widgetId) window.turnstile.reset(widgetId);
        btn.disabled = false;
      }
    });
  }

  for (const box of document.querySelectorAll(".speak[data-thread]")) {
    if (box.tagName === "DETAILS") {
      box.addEventListener("toggle", () => box.open && build(box));
      if (box.open) build(box);
    } else {
      build(box);
    }
  }
})();
