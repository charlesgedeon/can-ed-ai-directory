# canuniai.ca — Canadian University AI Approaches

A static directory of generative-AI policies, guidelines, and teaching resources
published by Canadian post-secondary institutions. Content lives in a Google
Sheet; the site is plain HTML/CSS/JS with no build step and no server, so it
runs on GitHub Pages as-is.

---

## Connecting your Google Sheet

**1. Build the sheet.** Create one Google Sheet with four tabs, named exactly:

```
institutions    resources    insights    prompts
```

Import the CSVs in `/data` into the matching tabs (File ▸ Import ▸ Upload ▸
*Insert new sheet*, then rename the tab).

**2. Publish each tab.** For each of the four tabs:

> File ▸ Share ▸ **Publish to web** ▸ pick that **one tab** (not "Entire
> document") ▸ pick **Comma-separated values (.csv)** ▸ **Publish**

Leave *Automatically republish when changes are made* ticked. Copy the URL it
gives you — it looks like:

```
https://docs.google.com/spreadsheets/d/e/2PACX-…/pub?gid=123&single=true&output=csv
```

**3. Paste the four URLs** into `assets/site.js`:

```js
const SHEET = {
  urls: {
    institutions: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQzSb79dEu_wTilttEy7pAe4-yjMNYncQ36jgW_YIAu1tdVndQMfS0bUuvGCJwHYmCyK8XoAXw5f4ct/pubhtml#gid=0&output=csv",
    resources:    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQzSb79dEu_wTilttEy7pAe4-yjMNYncQ36jgW_YIAu1tdVndQMfS0bUuvGCJwHYmCyK8XoAXw5f4ct/pubhtml#gid=2143168976&output=csv",
    insights:     "https://docs.google.com/spreadsheets/d/e/2PACX-1vQzSb79dEu_wTilttEy7pAe4-yjMNYncQ36jgW_YIAu1tdVndQMfS0bUuvGCJwHYmCyK8XoAXw5f4ct/pubhtml#gid=306385816&output=csv",
    prompts:      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQzSb79dEu_wTilttEy7pAe4-yjMNYncQ36jgW_YIAu1tdVndQMfS0bUuvGCJwHYmCyK8XoAXw5f4ct/pubhtml#gid=841758503&output=csv",
  },
  ...
};
```

That's the whole setup. Edit a cell and the change reaches the site on its own,
usually within a few minutes.

> **Copy the URL from the Publish dialog, not from a browser "Download CSV"
> button.** The latter gives you a `googleusercontent.com` address that's
> session-based and starts returning `400 Bad Request` later. The site logs a
> clear console error if it spots one.

### Why publish one tab at a time

Only the tabs you publish can be read. Everything else in the workbook — scratch
notes, contacts, institutions you're still weighing up, anything you'd rather not
have quoted back at you — stays private.

### The quicker alternative, and why it isn't the default

You can instead do Share ▸ **Anyone with the link** ▸ Viewer and put just the
sheet ID in `SHEET.id`. It's less setup and picks up edits instantly, which makes
it useful while you're building. Two reasons not to ship it:

- The ID sits in public JavaScript. Anyone can paste it into
  `docs.google.com/spreadsheets/d/{ID}/edit` and read **every tab** in the
  workbook, not just the four.
- It relies on an undocumented Google endpoint (`/gviz/tq`) that infers a data
  type per column. Mostly-empty date columns are exactly the case where that
  misbehaves.

Both methods are supported in the code; a published URL always wins over the ID,
so you can develop with one and ship with the other.

## How the page loads

The site paints instantly from `assets/data-snapshot.js` — a frozen copy of the
sheet — then fetches the live sheet in the background and re-renders if it
arrives. This means:

- the directory is fast on mobile and works with no network,
- a slow or unreachable Google never leaves a visitor staring at a blank page,
- your edits still show up on the next reload.

The footer says which one you're looking at: a green dot for live data, an amber
dot for the cached copy. If you see amber on the live site, open the browser
console — the reason is logged there.

Refresh the snapshot occasionally so it doesn't drift:

```bash
# download each tab as CSV into /data first
node tools/build-snapshot.js
```

---

## The sheet, tab by tab

### `institutions` — one row per institution

Every institution in the country belongs here, **including the ones with nothing
published**. Those are shown as "Nothing published yet", and the gap is part of
what the directory is for.

| Column | Notes |
|---|---|
| `Institution` | The join key. Must match the `resources` tab **exactly**. |
| `Province` | Groups the results. |
| `City` | Shown on the card. |
| `Institution Type` | University, Polytechnic, College, Research Institute… |
| `Language of Instruction` | English, French, Bilingual |
| `Has Published Guidance` | Reference only — the site derives this from `resources`. |
| `Institution Notes` | Free text, for your own use. |
| `Publish` | `No` hides the row. Blank means publish. |

### `resources` — one row per document

This is the important change from the old site: an institution can now have
**as many documents as it actually has**. UBC's principles, its library guide,
and a faculty-level policy are three rows, not a fight over one link.

| Column | Notes |
|---|---|
| `Institution` | Must match the `institutions` tab exactly. |
| `Resource Title` | The document's real title. Blank falls back to the type. |
| `URL` | |
| `Document Type` | Policy · Principles · Guidelines · Guidance · Statement · Library Guide · Toolkit · Syllabus Language · Resource Hub |
| `Issued By` | Teaching & Learning Centre · Library · Provost / Academic Leadership · Academic Integrity Office · Faculty or School · IT Services · University-wide / Unattributed |
| `Issuing Unit (verbatim)` | The unit's own name, e.g. "MacPherson Institute". |
| `Audience` | Semicolon-separated: `Instructors; Students` |
| `Scope` | University-wide · Faculty/School · Program · Graduate only |
| `Stance` | Permissive · Instructor discretion · Restrictive · Prohibited · Not stated |
| `Mentions Detection Tools` | Yes · No · Unclear |
| `Mentions Environmental Impact` | Yes · No |
| `Mentions Indigenous Data Sovereignty` | Yes · No |
| `Format` | Webpage · PDF · LibGuide · Google Site |
| `Language` | English · French · Bilingual |
| `Date Published`, `Last Reviewed`, `Link Checked` | |
| `Summary` | One or two sentences, shown under the title. |
| `Publish` | `No` hides the row. |

The values in the filter dropdowns are generated from whatever is actually in
the sheet, so adding a new `Document Type` needs no code change — but keeping
the vocabulary tight keeps the filters useful.

**Blank cells are fine.** Every field except `Institution` and `URL` degrades
gracefully; a document with only a URL still shows up.

### `insights` — one row per insight

`Body (Markdown)` accepts `## headings`, `**bold**`, `*italic*`,
`[links](https://…)`, `- bullets`, `1. numbered lists`, `> quotes`, and `---`.
Use a blockquote for the NotebookLM disclosure boxes. `Order` controls the
sequence. Each insight gets its own anchor, so you can link to one directly:
`insights.html#who-actually-writes-genai-guidance`.

### `prompts` — the rotating line above the directory

One per row. Simple HTML like `<strong>` is allowed here, since the existing
prompts use it to bold institution names.

---

## Deploying

Copy these into the repo root and push:

```
index.html
insights.html
about.html
assets/
data/
tools/
favicon.ico          ← keep your existing one
```

GitHub Pages ▸ Settings ▸ Pages ▸ deploy from `main` / root. For the custom
domain, add a `CNAME` file containing `canuniai.ca`.

---

## Things worth knowing

**Names must match between tabs.** The old site had six manual overrides that
silently did nothing because the keys used a straight apostrophe where the data
had a curly one (`Queen's` vs `Queen's`), or added a suffix the data didn't have
(`École de technologie supérieure (ÉTS)`). The join is now accent- and
apostrophe-insensitive, and anything that still fails to match gets named in the
browser console rather than vanishing. Check the console after a big edit.

**Search covers everything.** Institution, province, city, type, and every field
of every attached document, including URLs. Accents and apostrophes are ignored,
so `universite de montreal` finds Université de Montréal.

**Every view is a link.** Filters are written to the address bar, so
`?province=Ontario&audience=Instructors` is shareable, as is
`index.html#mcgill-university` for a single institution. Press `/` to jump to
the search box.

**Two data notes carried over from the old site,** both worth a look:
UQAM's URL points at `cpu.umontreal.ca`, which belongs to Université de
Montréal; and Université de Montréal's own link is to the École de santé
publique, so it's faculty-level rather than university-wide. The new `Scope`
column is the right place to record that distinction.
