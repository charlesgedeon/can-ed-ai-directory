/* ==================================================================
   site.js — shared configuration, data loading, and helpers
   ==================================================================

   ┌────────────────────────────────────────────────────────────────┐
   │  THE ONLY THING YOU NORMALLY NEED TO EDIT IS THE SHEET CONFIG  │
   │  DIRECTLY BELOW. Everything else reads from your Google Sheet. │
   └────────────────────────────────────────────────────────────────┘

   HOW TO CONNECT YOUR SHEET
   -------------------------
   Put the four CSVs in one Google Sheet, one per tab, named exactly:
   institutions, resources, insights, prompts. Then, for EACH tab:

     File ▸ Share ▸ Publish to web
       ▸ pick that one tab (not "Entire document")
       ▸ pick Comma-separated values (.csv)
       ▸ Publish

   Paste the four URLs it hands you into SHEET.urls below. Leave
   "Automatically republish when changes are made" ticked and your
   edits go live on their own within a few minutes.

   Publishing one tab at a time is deliberate: only the tabs you
   publish can be read. Anything else in the workbook — scratch notes,
   contacts, institutions you're still unsure about — stays private.
   That is NOT true of the link-sharing option further down, which
   exposes the whole spreadsheet to anyone who reads this file.

   HOW THE DATA LOADS
   ------------------
   The page paints immediately from assets/data-snapshot.js (a frozen
   copy of the sheet), then fetches the live sheet in the background and
   re-renders if it succeeds. So the directory is instant on mobile,
   works with no network, and can never show a blank page — but it still
   picks up your edits within one reload.
   ================================================================== */

const SHEET = {
  /* RECOMMENDED — paste the four "Publish to web" CSV URLs here.
     Each looks like:
       https://docs.google.com/spreadsheets/d/e/2PACX-…/pub?gid=123&single=true&output=csv
     Copy them from the Publish to web dialog itself. Do NOT use a URL
     copied from a browser "Download CSV" button — those point at
     googleusercontent.com, expire, and start returning 400s. */
  urls: {
    institutions: "",
    resources:    "",
    insights:     "",
    prompts:      "",
  },

  /* FALLBACK — only used when the urls above are blank.
     Share ▸ Anyone with the link ▸ Viewer, then paste the ID from the
     sheet's address bar. Quicker to set up and picks up edits
     instantly, which makes it handy while you're building. But it
     publishes your whole workbook to anyone who views this file, and
     it leans on an undocumented Google endpoint, so move to the
     published URLs above before the site is public. */
  id: "",
  tabs: {
    institutions: "institutions",
    resources:    "resources",
    insights:     "insights",
    prompts:      "prompts",
  },
};

/* ------------------------------------------------------------------
   Site-wide text. Edit here rather than in each HTML file.
   ------------------------------------------------------------------ */
const SITE = {
  title:    "Canadian University AI Approaches",
  tagline:  "Every published generative-AI policy, guideline, and guide, in one place.",
  author:   "Charlie Gedeon",
  authorUrl:"https://charliegedeon.com",
  contact:  "https://charliegedeon.com/contact/",
  newsletter:"https://charliegedeon.com/newsletter/",
};

/* ==================================================================
   CSV loading
   ================================================================== */

/** A published URL wins; otherwise fall back to the link-shared sheet. */
function csvUrl(tab) {
  const published = String((SHEET.urls && SHEET.urls[tab]) || "").trim();

  if (published) {
    if (published.includes("googleusercontent.com")) {
      console.error(
        `[directory] The URL for "${tab}" points at googleusercontent.com. ` +
        `Those links are temporary and will start failing. Copy the URL from ` +
        `the Publish to web dialog instead — it should begin ` +
        `https://docs.google.com/spreadsheets/d/e/2PACX-`
      );
    } else if (!published.includes("output=csv")) {
      console.warn(
        `[directory] The URL for "${tab}" doesn't end in output=csv, so it's ` +
        `probably publishing as a web page rather than CSV. Re-check the ` +
        `format dropdown in the Publish to web dialog.`
      );
    }
    return published;
  }

  if (!SHEET.id) return null;
  return `https://docs.google.com/spreadsheets/d/${SHEET.id}` +
         `/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET.tabs[tab])}`;
}

/** True when the site has any live source configured at all. */
const sheetConfigured = () =>
  Boolean(SHEET.id) || Object.values(SHEET.urls || {}).some(u => String(u).trim());

/* A small RFC-4180 CSV parser. Handles quoted fields, embedded commas,
   embedded newlines, and doubled quotes — which the Markdown insight
   bodies all rely on. Avoids pulling in a parsing library. */
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const rows = [];
  let row = [], field = "", inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",")  { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];

  const head = rows.shift().map(h => h.trim());
  return rows
    .filter(r => r.some(v => v.trim() !== ""))
    .map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

async function fetchTab(tab) {
  const url = csvUrl(tab);
  if (!url) throw new Error(`No URL configured for tab "${tab}"`);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${tab}: HTTP ${res.status}`);
  const rows = parseCsv(await res.text());
  if (!rows.length) throw new Error(`${tab}: sheet returned no rows`);
  return rows;
}

/**
 * Render from the snapshot right away, then upgrade to live sheet data.
 * @param {(data, meta) => void} render  called once or twice
 */
async function loadData(render) {
  const snap = window.SNAPSHOT || {};
  render(snap, { source: "cached", date: snap.generated });

  if (!sheetConfigured()) {
    setSourceNote("cached", snap.generated,
      "No Google Sheet connected yet — see SHEET.urls in assets/site.js.");
    return;
  }

  try {
    const [institutions, resources, insights, prompts] = await Promise.all([
      fetchTab("institutions"), fetchTab("resources"),
      fetchTab("insights"),     fetchTab("prompts"),
    ]);
    const live = { institutions, resources, insights, prompts };
    render(live, { source: "live" });
    setSourceNote("live");
    reportJoinProblems(live);
  } catch (err) {
    console.warn("[directory] Live sheet unavailable, showing the cached snapshot.", err);
    setSourceNote("cached", snap.generated,
      "Live sheet unreachable — check that it's shared with anyone who has the link.");
  }
}

/** Warn in the console about resource rows pointing at unknown institutions. */
function reportJoinProblems(data) {
  const known = new Set(data.institutions.map(i => i.Institution));
  const orphans = [...new Set(
    data.resources.map(r => r.Institution).filter(n => n && !known.has(n))
  )];
  if (orphans.length) {
    console.warn(
      "[directory] These names appear in the resources tab but not in the " +
      "institutions tab, so their documents will not show up. Usually a typo " +
      "or a curly-vs-straight apostrophe:", orphans
    );
  }
}

function setSourceNote(source, date, hint) {
  const el = document.getElementById("source-note");
  if (!el) return;
  const label = source === "live"
    ? "Live from Google Sheets"
    : `Cached copy${date ? " from " + fmtDate(date) : ""}`;
  el.innerHTML =
    `<span class="dot dot--${source}"></span><span>${esc(label)}</span>`;
  if (hint) el.title = hint;
}

/* ==================================================================
   Helpers
   ================================================================== */

const esc = s => String(s ?? "").replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Split a "Instructors; Students" cell into a clean array. */
const multi = s => String(s ?? "").split(/[;|]/).map(x => x.trim()).filter(Boolean);

/** Truthy check tolerant of how people actually type in spreadsheets. */
const yes = v => !/^(no|false|0|hidden|draft)$/i.test(String(v ?? "").trim());

/** Accent- and punctuation-insensitive key, so "Queen's" matches "Queen's". */
const fold = s => String(s ?? "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[’‘`´]/g, "'").replace(/[“”]/g, '"')
  .toLowerCase().trim();

const slug = s => fold(s)
  .replace(/['"]/g, "")            // Queen's → queens, not queen-s
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

function fmtDate(d) {
  const t = new Date(d);
  return isNaN(t) ? String(d)
    : t.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const ICON = {
  chevron: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  search:  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  x:       '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  ext:     '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><line x1="10" y1="14" x2="21" y2="3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
  sliders: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
};

/* ==================================================================
   Minimal Markdown renderer
   Covers the subset the insights tab uses: ## / ### headings, **bold**,
   *italic*, [links](url), - and 1. lists, > quotes, `code`, ---.
   Deliberately dependency-free so the page has nothing to download.
   ================================================================== */
function markdown(src) {
  const inline = t => esc(t)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");

  const out = [];
  const blocks = String(src ?? "").replace(/\r\n/g, "\n").trim().split(/\n{2,}/);

  for (const raw of blocks) {
    const b = raw.trim();
    if (!b) continue;

    if (/^---+$/.test(b)) { out.push("<hr>"); continue; }

    if (/^#{2,4}\s/.test(b)) {
      const level = Math.min(b.match(/^#+/)[0].length, 4);
      out.push(`<h${level}>${inline(b.replace(/^#+\s*/, ""))}</h${level}>`);
      continue;
    }

    if (b.split("\n").every(l => /^>\s?/.test(l))) {
      const inner = b.split("\n").map(l => l.replace(/^>\s?/, "")).join("\n");
      out.push(`<blockquote>${markdown(inner)}</blockquote>`);
      continue;
    }

    if (b.split("\n").every(l => /^\s*[-*]\s+/.test(l))) {
      out.push("<ul>" + b.split("\n")
        .map(l => `<li>${inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("") + "</ul>");
      continue;
    }

    if (b.split("\n").every(l => /^\s*\d+\.\s+/.test(l))) {
      out.push("<ol>" + b.split("\n")
        .map(l => `<li>${inline(l.replace(/^\s*\d+\.\s+/, ""))}</li>`).join("") + "</ol>");
      continue;
    }

    out.push(`<p>${inline(b).replace(/\n/g, "<br>")}</p>`);
  }
  return out.join("\n");
}

/* ==================================================================
   Shared chrome
   ================================================================== */
function renderChrome(current) {
  const links = [
    ["index.html",    "Directory", "directory"],
    ["insights.html", "Insights",  "insights"],
    ["about.html",    "About",     "about"],
    [SITE.newsletter, "Newsletter", null],
  ];

  const header = document.querySelector("[data-chrome=header]");
  if (header) header.innerHTML = `
    <div class="wrap masthead__inner">
      <a class="masthead__title" href="index.html">
        <h1>${esc(SITE.title)}</h1>
        <p class="masthead__tag">${esc(SITE.tagline)}</p>
      </a>
      <div class="masthead__right">
        <nav class="nav" aria-label="Main">
          ${links.map(([href, label, id]) =>
            `<a href="${href}"${id === current ? ' aria-current="page"' : ""}${
              id ? "" : ' target="_blank" rel="noopener noreferrer"'}>${esc(label)}</a>`
          ).join("")}
        </nav>
        <a class="btn-contact" href="${SITE.contact}" target="_blank" rel="noopener noreferrer">Contact</a>
      </div>
    </div>`;

  const footer = document.querySelector("[data-chrome=footer]");
  if (footer) footer.innerHTML = `
    <div class="wrap foot">
      <div>Built by <a href="${SITE.authorUrl}" target="_blank" rel="noopener noreferrer">${esc(SITE.author)}</a>.
        Spot a gap or a wrong link? <a href="${SITE.contact}" target="_blank" rel="noopener noreferrer">Tell me</a>.</div>
      <div class="foot__src" id="source-note"><span class="dot"></span><span>Loading…</span></div>
    </div>`;
}
