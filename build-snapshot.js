#!/usr/bin/env node
/* ------------------------------------------------------------------
   build-snapshot.js — refresh the offline fallback copy of the sheet

   Run this occasionally (say, monthly) so the cached copy that ships
   with the site doesn't drift too far from the live sheet:

     1. In Google Sheets, File ▸ Download ▸ CSV for each of the four
        tabs. Save them into /data as institutions.csv, resources.csv,
        insights.csv, prompts.csv
     2. node tools/build-snapshot.js
     3. Commit the updated assets/data-snapshot.js

   The site works fine without doing this — the snapshot is only what
   visitors see while the live sheet is loading, or if Google is down.
   ------------------------------------------------------------------ */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TABS = ["institutions", "resources", "insights", "prompts"];

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",")  { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift().map(h => h.trim());
  return rows
    .filter(r => r.some(v => v.trim() !== ""))
    .map(r => Object.fromEntries(
      head.map((h, i) => [h, (r[i] ?? "").trim()]).filter(([, v]) => v !== "")
    ));
}

const snapshot = { generated: new Date().toISOString().slice(0, 10) };

for (const tab of TABS) {
  const file = path.join(ROOT, "data", tab + ".csv");
  if (!fs.existsSync(file)) {
    console.error(`Missing data/${tab}.csv — download that tab from the sheet first.`);
    process.exit(1);
  }
  snapshot[tab] = parseCsv(fs.readFileSync(file, "utf8"));
  console.log(`  ${tab.padEnd(13)} ${String(snapshot[tab].length).padStart(4)} rows`);
}

/* Sanity check the join before writing anything. */
const fold = s => String(s ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[’‘]/g, "'").toLowerCase().trim();
const known = new Set(snapshot.institutions.map(i => fold(i.Institution)));
const orphans = [...new Set(
  snapshot.resources.map(r => r.Institution).filter(n => n && !known.has(fold(n)))
)];
if (orphans.length) {
  console.warn(
    "\n  WARNING — these appear in resources but not in institutions, so their\n" +
    "  documents will be invisible on the site. Check for typos:\n" +
    orphans.map(o => "    · " + o).join("\n")
  );
}

const banner = `/* ------------------------------------------------------------------
   data-snapshot.js  —  GENERATED FILE, DO NOT EDIT BY HAND
   Frozen copy of the Google Sheet, taken ${snapshot.generated}.
   Regenerate with: node tools/build-snapshot.js
   ------------------------------------------------------------------ */
`;

const out = path.join(ROOT, "assets", "data-snapshot.js");
fs.writeFileSync(out, banner + "window.SNAPSHOT = " + JSON.stringify(snapshot) + ";\n");
console.log(`\n  Wrote assets/data-snapshot.js (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
