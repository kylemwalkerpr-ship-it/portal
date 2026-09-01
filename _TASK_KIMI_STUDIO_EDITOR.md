# Kimi K2.7 Code — Content Studio document + Word-like editor

Repo: `/Users/phantomdarne/Documents/GitHub/yousafe-portal` only.
No commit/push/deploy. No secrets. Do not touch marketplace homepage copy.
Read files in ≤80 line chunks. Never dump editorialScaffold.ts or admin-inline-editor.tsx whole.

Time box: ship a **working** WYSIWYG default + YAML sanitizer + expansion anti-repeat. UI polish can be CSS in the same files. If you hit TPM, stop after tests for the sanitizer.

---

## P0 — Mangled “document header”

Live body starts with nested YAML **inside** `description:`:

```
content_type: article region: US description: "contenttype: article region: US description: \"contenttype: ...
```

Cause: `applyDeterministicRepairs` / `metaDescriptionFrom` / `clampMetaToAhrefs` treating leaked frontmatter as prose and writing it back into `description:`. Each pass nests another copy.

**Required**

1. `sanitizeFrontmatter(content): string` (put in `formatContract.ts` or a tiny `lib/seoFactory/frontmatterSanitize.ts`):
   - Exactly **one** YAML block at top `---\n...\n---`
   - `description` is a **single line**, 70–160 chars, **must not** contain `content_type:`, `region:`, `canonicalUrl:`, `robots:`, `ogImage:`, `description:`, or `---`
   - If description is polluted, replace with first clean sentence of the **body** after H1 (use existing `metaDescriptionFrom` **only on body**, never on fm)
   - Strip leaked YAML lines from **visible body** (admin and live)
2. Call this at the **end** of `applyDeterministicRepairs` and after every `closeShipGate` / Fix All path.
3. Test `tests/frontmatter-sanitize.test.ts` with the **exact live blob** (nested description). After sanitize: one FM, description 70–160, body starts with `#` H1 not `content_type:`.

---

## P0 — Editor shows published article only

Admin must **not** see YAML, JSON-LD `<script>`, or raw markdown fences as the default view.

Files: `components/design/admin-inline-editor.tsx` (and any Source toggle).

- Default view = **rendered article** (existing markdown→HTML/JSX used on legal live pages — `renderTarget` / same components the public template uses). No frontmatter, no schema dumps.
- Optional **Source** behind a menu item (power user), default off.
- Streaming draft: tokens appear as **readable prose** in that same canvas (strip `---` / `description:` if the model streams FM).

---

## P1 — One Word-like window

Reimagine the editor chrome (same page, no new app):

- **Top menu bar** (File / Edit / View / Publish): Save, Fix All, Approve/Ship, Preview live, Source toggle, word count.
- **Single canvas**: streaming generation + edit + ship status (blockers as a slim bar under the menu, not a wall of YAML).
- Keep existing APIs (`reaudit`, generate-stream, ship). Do not invent a second Git write path.

Match market tokens only if this UI is inside portal admin — use existing admin styles, not a new design system.

---

## P1 — Expansion must not repeat

Depth rescue / refine that pads word count currently clones paragraphs.

In `depthRescue.ts` / pipelineStream refine: **reject** an expansion chunk if cosine/jaccard of 40+ char sentences vs existing body > 0.85, or if it repeats an H2. Prefer new H2 sections over parroting. If still short, stop looping (do not fail forever). Test: body with 3 paragraphs; expansion must not re-append the same paragraph.

---

## P1 — CI / git builds that fail to run

Investigate latest `main` CI (`gh run list` / `npx tsc --noEmit`). Common: MarketplaceShell template backticks, unused imports, test pin drift.

Fix what is red **now**. Add `npx tsc --noEmit` already in CI if missing (`package.json` / github workflow). Do not skip tests.

```
npx tsc --noEmit
npx jest tests/frontmatter-sanitize.test.ts tests/pipeline-four-stage-close.test.ts --no-coverage
```

Report: FILES / root cause of nested description / CI / TESTS.
