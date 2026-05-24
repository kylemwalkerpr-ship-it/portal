# Brief 47 — Inquiry Lifecycle: Full Student Control + Schema-Wide Discipline

**Owner:** Kimi (Swarms B, C, D, E)  •  **Schema owner:** Claude (Swarm A, applied via Supabase Mgmt API)
**Reviewer:** Claude
**Repo:** yousafe-portal (plus a small saas-repo addendum in §5.3)
**Status:** Worktree-ready
**Predecessor commits:** 41 Part B `ee20e2b` + `5529d83`, 46 `469f7bb`/`676858f`/`14377bc`

---

## 0. Goal

Give the student (the inquiry **initiator**) end-to-end control over their inquiries: **edit**, **delete**, **archive**, **delete the broadcast status**. Make the schema enforce the safety rules so the UI cannot accidentally orphan an order. Display inquiries in an enriched brief form. Wire archive/delete behavior across every role (student, attorney, consultant, admin, support) and across every surface (list, detail, attorney queue, messenger, status ring, dispute panel). Auto-delete stale inquiries after 30 days so the marketplace queue does not balloon.

### The hard rules (load-bearing — every swarm reads these)

1. **An inquiry that has produced an order CANNOT be deleted.** Schema enforces it (a trigger blocks hard-delete when `orders.source_inquiry_id` references the row); the API enforces it (returns 409 before the SQL would block); the UI enforces it (the Delete action is hidden when an order exists, only Archive is offered).
2. **Order-linked inquiries can always be archived** (so disputes can still be traced). Archive is reversible.
3. **An inquiry with an accepted offer / linked order is auto-removed from the open attorney queue** (server-side filter — never appears in `/api/attorney/inquiries` GET). The inquiry stays alive for dispute reads; it just exits the work queue.
4. **30-day auto-delete cron** hard-deletes inquiries where:
   - `created_at < now() - interval '30 days'`
   - `archived_at is null`
   - `status not in ('converted')`
   - **AND** there is no row in `orders` with `source_inquiry_id = inquiry.id`
   - The trigger from rule 1 would block it anyway, but the cron also filters explicitly so we never raise the trigger error in normal cron operation.
5. **The status broadcast** (`public.inquiry_statuses` row, the 24h WhatsApp-style ring) is a separate object that can be deleted independently of the inquiry. Killing the inquiry cascades to kill the status; killing the status leaves the inquiry intact.
6. **Roles:** student owns CRUD on their own inquiries. Attorney + consultant are read-only on the inquiry record itself (state changes happen via messaging / offers). Admin + support are read-only on **all** inquiries including archived (dispute reads); they may not delete or unarchive — only the student can unarchive their own.

---

## 1. Things to read before starting (every swarm)

```
git log --oneline -8
cat supabase/inquiries_pipeline.sql
cat supabase/inquiry_attorney_targeting.sql
cat supabase/inquiry_cleanup_cron.sql
cat supabase/messenger_foundation.sql | head -90
cat app/api/client/inquiries/route.ts
cat app/api/client/inquiries/[id]/route.ts
cat app/api/client/inquiries/[id]/messages/route.ts
cat app/api/inquiries/route.ts
cat app/api/inquiries/with-status/route.ts
cat app/api/attorney/inquiries/route.ts
cat lib/checkoutOrders.ts | grep -n "source_inquiry\|inquiries" 
ls app/api/admin/
ls app/api/support/
cat components/design/my-inquiries.jsx
cat components/design/inquiry-intake-form.jsx | head -120
cat components/design/attorney-inquiries.jsx | head -60
grep -rn "inquiry_statuses" components/ app/ lib/ | head -20
```

### Schema you must trust (do not rederive)

`public.inquiries` columns (after Swarm A migration is applied):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `client_profile_id` | uuid FK profiles | nullable (anonymous intakes) |
| `email`, `full_name`, `phone` | text | |
| `country`, `case_type`, `case_type_label` | text | |
| `urgency`, `recommended_tier` | text | |
| `answers`, `meta` | jsonb | |
| `source` | text | `caseworks` / `status_broadcast` / `portal_attorney_chat` etc. |
| `access_token` | text | anonymous resume link |
| `claimed_by_attorney_id`, `claimed_at` | uuid + ts | |
| `target_attorney_profile_id` | uuid FK profiles | direct-address |
| **`status`** | text | CHECK extended to `('open','claimed','engaged','converted','closed','cancelled','archived')` after Swarm A |
| **`archived_at`** | timestamptz | NULL = not archived |
| **`archived_by_role`** | text | `'client'` only for now |
| **`archived_reason`** | text | optional |
| `created_at`, `updated_at` | timestamptz | |

`public.inquiry_messages` — cascades on inquiry delete (already).
`public.attorney_offers` — cascades on inquiry delete (already).
`public.inquiry_statuses` — cascades on inquiry delete (already).
`public.orders.source_inquiry_id` — `ON DELETE SET NULL`; this is the trace we must preserve. The Swarm A trigger replaces the SET NULL behavior with a hard block when source_inquiry_id is non-null.

### URL contract for status broadcasts

`inquiry_statuses` is a separate object that *links to* an inquiry via `inquiry_id`. Anyone with an active status has a row in `inquiry_statuses` with `expires_at > now()`. Deleting that row hides the status from the marketplace ring; the inquiry continues to exist and is reachable from `/dashboard?page=inquiries`.

---

## 2. ──── SWARM A — SCHEMA (Claude-applied, NOT Kimi) ────

Kimi: **do not run any SQL.** Claude will apply this via the Supabase Management API before Kimi starts coding. This section is here so every swarm can see the contract.

### A.1 — `supabase/inquiry_full_lifecycle.sql` (Claude writes + applies)

```sql
-- ────────────────────────────────────────────────────────────────────
-- Brief 47 — Inquiry full lifecycle: archive, delete-guard, 30d cron.
-- Idempotent.  Runs after inquiries_pipeline.sql + inquiry_cleanup_cron.sql.
-- ────────────────────────────────────────────────────────────────────

-- 1. Extend status check constraint to include 'archived' and 'engaged'
--    ('engaged' is already used by the attorney-messages route — formalize it).
alter table public.inquiries
  drop constraint if exists inquiries_status_check;
alter table public.inquiries
  add constraint inquiries_status_check
  check (status in ('open','claimed','engaged','converted','closed','cancelled','archived'));

-- 2. Archive metadata columns.
alter table public.inquiries
  add column if not exists archived_at      timestamptz,
  add column if not exists archived_by_role text check (archived_by_role in ('client','admin','support','system')),
  add column if not exists archived_reason  text;

create index if not exists inquiries_archived_idx
  on public.inquiries(archived_at)
  where archived_at is not null;

-- 3. Trigger: refuse hard-delete when an order points at this inquiry.
--    This is the schema-side enforcement of "order-linked inquiries cannot
--    be deleted, only archived" — defensive against API bugs.
create or replace function public.prevent_inquiry_delete_if_order_exists()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.orders
     where source_inquiry_id = old.id
  ) then
    raise exception
      'INQUIRY_DELETE_BLOCKED: inquiry % is the source of one or more orders; archive instead.', old.id
      using errcode = '23503';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_block_inquiry_delete_with_order on public.inquiries;
create trigger trg_block_inquiry_delete_with_order
  before delete on public.inquiries
  for each row execute function public.prevent_inquiry_delete_if_order_exists();

-- 4. 30-day stale auto-delete cron.
--    Coexists with the 14-day close cron in inquiry_cleanup_cron.sql
--    (that one only sets status='closed'; this one hard-deletes).
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-stale-inquiries-30d') then
    perform cron.unschedule('purge-stale-inquiries-30d');
  end if;
end $$;

select cron.schedule(
  'purge-stale-inquiries-30d',
  '15 3 * * *',
  $job$
    delete from public.inquiries i
     where i.created_at < now() - interval '30 days'
       and i.archived_at is null
       and i.status not in ('converted')
       and not exists (
         select 1 from public.orders o where o.source_inquiry_id = i.id
       );
  $job$
);

-- 5. (Optional safety) Realtime publication — ensure inquiries is in
--    supabase_realtime so the UI can subscribe to update events. No-op if
--    already present.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'inquiries'
  ) then
    execute 'alter publication supabase_realtime add table public.inquiries';
  end if;
end $$;

commit;
```

**Claude applies this via `POST https://api.supabase.com/v1/projects/krggzrxxnqfsbbklatxl/database/query`** with the SQL above as the body. After successful apply, Claude commits the .sql file to `supabase/inquiry_full_lifecycle.sql` so the migration is part of the repo history.

Claude verifies post-apply with a SELECT that confirms:
- `inquiries_status_check` constraint includes 'archived' + 'engaged'
- `archived_at`, `archived_by_role`, `archived_reason` columns exist
- Trigger `trg_block_inquiry_delete_with_order` exists
- Cron job `purge-stale-inquiries-30d` exists

---

## 3. ──── SWARM B — API ────

Touch only `app/api/**/*.ts`. Use existing helpers: `requireClient`, `requireAdmin`, `requirePortalUser`, `ok` / `fail` from `lib/apiEnvelope`.

### B.1 — Modify `app/api/client/inquiries/route.ts` (GET)

Current GET returns all inquiries owned by the client. Change to:

- Read `?include=archived` (boolean, default false) and `?status=<one of open|engaged|claimed|closed|cancelled|converted|archived>` (optional filter).
- Default behavior:
  - Exclude `archived_at IS NOT NULL` unless `include=archived` is set.
  - **Do NOT exclude order-linked inquiries from this endpoint** — the student should see their own converted inquiries on their own list. Only the *attorney queue* hides converted ones; the student keeps the trace.
- Always exclude `source='portal_attorney_chat'` (preserve current behavior).
- The select must now include: `id, case_type_label, case_type, country, urgency, recommended_tier, status, claimed_by_attorney_id, claimed_at, source, archived_at, archived_by_role, archived_reason, answers, created_at, updated_at`. The answers jsonb is needed by the enriched list view (Swarm C).
- Additionally for each row, the response must include `order_id` (joined from `orders` on `source_inquiry_id`) so the UI knows when an order is attached. Use a sub-select in Postgres or a follow-up `IN (...)` lookup, your call. Document which.

### B.2 — New: `PATCH /api/client/inquiries/[id]`

File: `app/api/client/inquiries/[id]/route.ts` (extend the existing GET; add PATCH below it).

Behavior:
- Requires `requireClient()`. Verifies ownership (either `client_profile_id === ctx.profileId` or `email === ctx.email` then back-fill).
- Reject (409) if inquiry is `archived_at IS NOT NULL` — must unarchive first.
- Reject (409) if `status === 'converted'` — order-linked is immutable (no edits to a brief that already produced a paid order).
- Accept body fields, all optional, all clamped:
  - `country` (2-4 char uppercase)
  - `case_type` + `case_type_label`
  - `urgency`
  - `headline` (5..120) — written into `answers._headline`
  - `summary` (0..400) — written into `answers._summary`
  - `answers` (jsonb merge — shallow merge over existing answers, but preserve `_intake_notes` and any keys not present in the patch)
  - `target_attorney_profile_id` (uuid or null)
- Run `safetyGuard` on headline + summary (same pattern as `app/api/inquiries/with-status/route.ts`).
- Update `updated_at` to now().
- Re-compute `recommended_tier` via `recommendTier(country, caseType, mergedAnswers)` and store if any of country / case_type / answers actually changed.
- If a row exists in `inquiry_statuses` for this inquiry (`inquiry_id` match), update its `payload` jsonb with the new headline/case_type_label/urgency/tier so the broadcast stays in sync. Do not extend `expires_at`.
- Return `ok({ inquiry: <full updated row including order_id sub-select> })`.

### B.3 — New: `DELETE /api/client/inquiries/[id]`

Same file (`app/api/client/inquiries/[id]/route.ts`).

Behavior:
- Requires `requireClient()`. Verifies ownership.
- Pre-flight: `select count(*) from orders where source_inquiry_id = $1`. If > 0, return `fail('This inquiry produced an order; archive it instead.', 409, { reason: 'order_exists' })`. Do not even attempt the delete.
- Do not reject archived inquiries — student can delete an archived non-order-linked inquiry too.
- Issue `delete from inquiries where id = $1`. Cascades fire for `inquiry_messages`, `attorney_offers`, `inquiry_statuses`. The Swarm A trigger is a safety net behind the API check.
- Return `ok({ deleted: true })`.
- Catch the `INQUIRY_DELETE_BLOCKED` Postgres error code (23503 / 23P01 — confirm exact codes from your local test) and translate to a 409 with `{ reason: 'order_exists' }` as a defensive fallback.

### B.4 — New: `POST /api/client/inquiries/[id]/archive`

File: `app/api/client/inquiries/[id]/archive/route.ts`.

Behavior:
- Requires `requireClient()`. Verifies ownership.
- Accept body `{ reason?: string }` (max 200 chars).
- Reject if already archived (`archived_at IS NOT NULL`) → 409 `{ reason: 'already_archived' }`.
- Update:
  ```
  archived_at = now(),
  archived_by_role = 'client',
  archived_reason = <reason or null>,
  status = case when status = 'converted' then status else 'archived' end,
  updated_at = now()
  ```
  Note: order-linked inquiries keep `status='converted'` even after archive (so the order trace reads correctly); non-order-linked flip to `status='archived'`.
- Delete any active `inquiry_statuses` row tied to this inquiry (archived broadcasts should not appear in the marketplace ring). The cascade does this automatically only on inquiry delete; for archive we do it explicitly:
  ```
  delete from inquiry_statuses where inquiry_id = $1
  ```
- Return `ok({ archived: true, inquiry: <updated row> })`.

### B.5 — New: `POST /api/client/inquiries/[id]/unarchive`

Same shape. Resets `archived_at = null`, `archived_by_role = null`, `archived_reason = null`. If the row was `status='archived'`, restore to `'open'` (do not try to reconstruct prior intermediate states). If it was `status='converted'`, leave it. Does NOT re-create the status broadcast — student must post a new one if they want it visible.

### B.6 — New: `DELETE /api/client/inquiries/[id]/status`

File: `app/api/client/inquiries/[id]/status/route.ts`.

Behavior:
- Requires `requireClient()`. Verifies inquiry ownership (same check pattern).
- Issue `delete from inquiry_statuses where inquiry_id = $1 and person_id = $ctx.profileId`. Idempotent — deleting an already-gone row returns success with `deleted: 0`.
- Inquiry itself stays untouched.
- Return `ok({ deleted: <row count> })`.

### B.7 — Modify `app/api/attorney/inquiries/route.ts` (GET)

Filter the open queue:

- Exclude rows with `archived_at IS NOT NULL`.
- Exclude rows with `status IN ('converted', 'archived')`.
- Exclude rows where any row in `attorney_offers` has `status = 'accepted'` for this inquiry (the "auto-removed when order linked" rule).
- Everything else (open/claimed/engaged/closed/cancelled rows pre-conversion) follows the existing filters in the route.
- Add a one-line comment: `// Brief 47 §B.7: queue must not surface inquiries that already produced an accepted offer or that the client archived.`

### B.8 — New: `GET /api/admin/inquiries` + `GET /api/admin/inquiries/[id]`

Files: `app/api/admin/inquiries/route.ts` and `app/api/admin/inquiries/[id]/route.ts`.

Behavior:
- Requires `requireAdmin()` (use existing helper; if not present, use `requirePortalUser` with role check for `'admin' | 'support'` — verify by reading existing admin routes).
- List endpoint returns ALL inquiries including archived. Supports `?archived=true|false|all` (default `all`), `?status=<filter>`, `?q=<text search across case_type_label + email>`, `?page` + `?limit`.
- Detail endpoint returns the inquiry plus the same `threads` structure as `/api/client/inquiries/[id]` GET — admin should see attorney threads for dispute reads. Include the `order_id` join too.
- Both endpoints are READ-ONLY. No PATCH/DELETE/archive endpoints under `/admin/` — admin cannot mutate inquiries per the role contract in §0.

### B.9 — New: `GET /api/support/inquiries` + `GET /api/support/inquiries/[id]`

Same shape as B.8 but gated on the `support` role. If the existing `support` role gate is in `app/api/support/orders/route.ts` or similar, copy the pattern. These endpoints are also read-only.

### B.10 — Modify `lib/checkoutOrders.ts` (no behavioral change, comment only)

Find the line `await db.from('inquiries').update({ status: 'converted', updated_at: acceptedAt }).eq('id', item.sourceInquiryId)` (~line 310). Add a one-line comment above it: `// Brief 47: status='converted' is what triggers the attorney-queue auto-removal in /api/attorney/inquiries`. **Do not change the code.**

---

## 4. ──── SWARM C — STUDENT UI ────

Touch only `components/design/my-inquiries.jsx` and `components/design/inquiry-intake-form.jsx`. Disjoint from Swarm B (no API changes), Swarm D (no other-role UI), Swarm E (no messaging).

### C.1 — Reorg `components/design/my-inquiries.jsx`

Replace the current bare-list view with this layout:

**Header row:** title `My inquiries` + `+ New inquiry` button (unchanged) + a tab strip:
- `Active` (default) — calls `/api/client/inquiries` (default behavior excludes archived)
- `Archived` — calls `/api/client/inquiries?include=archived` and filters to `archived_at !== null`

**Each row in the list** must show an enriched brief (not just one line). Card layout:

- **Header line:** `<flag of country>  <case_type_label>` (display font, 16px, ink color). Right side: a status badge — colored per status. New status colors:
  - `open` → moss `#5F6B3A`
  - `claimed` → indigo `#3C3B6E`
  - `engaged` → indigo deep `#2A2A55`
  - `converted` → gold `#C4A45A` with the label `Order placed`
  - `closed` → ink-soft
  - `cancelled` → brick `#B22234`
  - `archived` → ink-soft with `Archived` label
- **Sub-line:** `<urgency>` chip (low/med/high colored mono pill) + `<recommended_tier>` chip + `Submitted <relative date>`.
- **Brief preview:** if `answers._headline` exists, render it in 14px ink. Otherwise render the first 2-3 sentences of `answers._summary` or the first scalar value in `answers` (whichever exists). Max 180 chars. `text-overflow: ellipsis`.
- **Order-linked badge** (when `order_id` is present): a small filled badge `📎 Order #<short-id>` in gold. Render in the header line right of the title.
- **Actions menu** (overflow `⋮` button at the far right of the header line): opens a popover with these items, conditionally rendered:
  - **View** (always) — open the existing `InquiryDetail` (do not change detail layout in this swarm beyond what §C.2 says)
  - **Edit** — only when `archived_at IS NULL` AND `status !== 'converted'`. Opens the intake form in edit mode (see §C.3).
  - **Delete broadcast** — only when an `inquiry_statuses` row exists for this inquiry. This is hard to detect from the inquiry list alone; instead, ALWAYS show the option and let the API return `{ deleted: 0 }` silently if nothing was deleted. Show a toast "Status broadcast removed" on any 2xx.
  - **Archive** — only when `archived_at IS NULL`. Confirm modal: `"Archive this inquiry? It will be hidden from your active list but kept for dispute reference."` On confirm, POST `/api/client/inquiries/{id}/archive`.
  - **Unarchive** — only when `archived_at IS NOT NULL`. POST `/api/client/inquiries/{id}/unarchive`.
  - **Delete permanently** — only when `archived_at IS NULL` AND there is no `order_id`. Confirm modal with strong language: `"This permanently deletes the inquiry and all attorney messages. Continue?"`. DELETE `/api/client/inquiries/{id}`. If the API returns 409 `{ reason: 'order_exists' }`, replace the menu item with the archive flow and show a toast: `"An order is linked to this inquiry — archived instead."`
  - The order in the popover from top to bottom: View, Edit, Delete broadcast, Archive / Unarchive, Delete permanently.

**Loading + error states** stay where they are; only the success state changes.

### C.2 — Enriched detail view inside `my-inquiries.jsx`

The `InquiryDetail` function in the same file gets a full brief block at the top before the thread list:

- Country chip + case_type_label + status badge
- Urgency + recommended_tier + submitted date
- Full headline (if present) in display font 22px
- Full summary in 14px line-height 1.5
- All scalar entries from `answers` (excluding underscore-prefixed keys like `_headline`, `_summary`, `_intake_notes`) rendered as a definition list: `<key (humanized)>: <value>` with values truncated at 200 chars + "more" toggle.
- If `order_id`: a prominent banner above the brief: `"📎 Order placed — this inquiry produced order #<short id>. It can be archived but no longer edited or deleted."` linking to `/dashboard?page=orders&open=<order_id>`.
- If `archived_at`: a prominent banner: `"⏸ Archived <date>. <reason if any>"` with an "Unarchive" button.

The existing thread/messages section stays beneath this brief block. Do not touch the threads rendering.

### C.3 — Intake form in edit mode (`components/design/inquiry-intake-form.jsx`)

Currently the intake form is multi-phase (country → case → questions → contact → review → submit POST). Extend it to support editing:

- Accept new optional props: `existingInquiry` (the full inquiry row from the API) and `onSaved(updatedInquiry)`.
- When `existingInquiry` is provided:
  - Hydrate `country`, `caseTypeId`, `answers`, headline/summary fields from `existingInquiry` (with `_headline` / `_summary` extracted from `answers`).
  - Skip the `country` and `case` phases visually (start on `questions` phase) but allow the back button to navigate to them — students may want to change country if they relocate, but warn with a small notice: `"Changing country may reset case-specific answers."` Do not auto-reset; let them re-edit.
  - Replace the final `Submit` button label with `Save changes`.
  - On final submit, send PATCH to `/api/client/inquiries/{existingInquiry.id}` with the standard body shape. Do NOT call POST. On success call `onSaved(updatedInquiry)`.
  - Skip the draft-localStorage logic (the localStorage in current code is for new submissions; do not collide with edit mode).
- When `existingInquiry` is null/undefined, behavior is UNCHANGED — current new-submission flow runs as today.

The consumer in `my-inquiries.jsx` (Swarm C) wires the "Edit" action menu entry to mount the intake form with `existingInquiry={q}`.

---

## 5. ──── SWARM D — OTHER-ROLE UI ────

Touch `components/design/attorney-inquiries.jsx`, `components/design/admin.jsx`, and (cross-repo) `components/dashboard/inquiries-panel.tsx` in `yousafe-saas`. Disjoint from Swarms B/C/E.

### 5.1 — Attorney queue UI mirrors the API filter (`attorney-inquiries.jsx`)

The API at `/api/attorney/inquiries` already hides converted + archived + offer-accepted rows after Swarm B. The UI must:

- Add a small "Auto-removed when an order is placed or the client archives" hint under the queue header so attorneys understand why a row might disappear.
- Add an "Archived by client" empty-state for individual inquiry detail pages reachable by direct link (`/marketplace?view=mine&open=<id>`): if the attorney follows a stale link to an inquiry that has been archived, show: `"This inquiry was archived by the client. Existing messages remain for dispute reference."` Read-only for the attorney.
- Detect "archived" state from the inquiry detail endpoint (verify: existing `/api/attorney/inquiries/[id]` GET returns `archived_at` after Swarm B — if not, the attorney detail endpoint must be updated too; in that case ping Claude before changing the API contract).

### 5.2 — Admin inquiries panel (`components/design/admin.jsx`)

Add a new top-level admin section: **Inquiries** (sidebar nav: between Orders and Escrow, icon `📥`). Implementation:

- New `page === 'inquiries'` branch in the admin render switch.
- Table view: columns = `Submitted`, `Client`, `Country`, `Case type`, `Urgency`, `Status`, `Order`, `Actions`.
- Filters at the top: `Status` dropdown (all / open / engaged / converted / archived / closed / cancelled), `Archived` toggle (default `all`), text search.
- Calls `GET /api/admin/inquiries` (Swarm B B.8). Pagination (50 per page).
- Row click opens a read-only detail drawer with the same brief block as student §C.2 plus thread previews. No edit/delete/archive UI on this surface — admin is read-only.

### 5.3 — Support inquiries panel (cross-repo, `yousafe-saas`)

In `yousafe-saas`, create `app/(dashboard)/inquiries/page.tsx` and `components/dashboard/inquiries-panel.tsx`. Same UX as §5.2 but calls `GET /api/support/inquiries` (which lives in the **portal** repo — saas calls portal's API via the shared Supabase / cross-host fetch pattern used elsewhere in saas). If saas does not already cross-host fetch portal APIs, instead replicate the read logic against Supabase directly using `clerk_user_id` lookup + `requireSupport()` (mirror saas's existing admin/support gate).

Add a sidebar nav entry **Inquiries** for the `support` and `admin` roles in `components/dashboard/sidebar.tsx` (mirror the `Settings` entry pattern shipped in `5529d83`).

---

## 6. ──── SWARM E — MESSENGER / STATUS BROADCAST ────

Touch only `components/messaging/**/*.tsx`/`.jsx` and `components/design/dashboard-right-pane.jsx` if needed for status ring deletion. Disjoint from Swarms B/C/D.

### 6.1 — Conversation header behavior when inquiry is archived

In the WhatsApp-style messenger (`components/messaging/ChatScreen.tsx` + `UnifiedInbox.tsx`):

- When the conversation's source inquiry has `archived_at IS NOT NULL`, the header strip above messages shows a small grey banner: `"⏸ This inquiry was archived <date>. Existing messages are read-only."`.
- The composer at the bottom is disabled (read-only input with placeholder `"Inquiry archived — cannot send new messages."`).
- This applies symmetrically to client and attorney views.
- Source of the `archived_at` flag: include it in the existing thread / inquiry payload that the messenger already loads. If the existing payload does not carry `archived_at`, ask Claude — likely a one-line select addition.

### 6.2 — Conversation behavior when inquiry is deleted

When realtime broadcasts an `inquiries` DELETE row (subscribe via `subscribeToTable('inquiries', ...)`), the messenger:

- Drops the conversation from `UnifiedInbox` immediately.
- If the user has the deleted inquiry's chat open: replace the chat body with a centered placeholder: `"This inquiry was deleted by the client. No further actions are possible."` and disable the composer.
- Keep the conversation history local for ~30 seconds (so the user can read what they just wrote/received) before unmounting.

### 6.3 — Status ring deletion control (student)

Wherever the student's own status ring is rendered (look for `inquiry_statuses` SELECT in `components/messaging/UnifiedInbox.tsx` or `components/design/dashboard-right-pane.jsx`), add an `⋮` overflow on the student's own status tile that opens: **Delete broadcast**. On click, DELETE `/api/client/inquiries/{inquiry_id}/status` (Swarm B B.6). On success, optimistically remove the tile.

### 6.4 — Attorney status ring view of an archived inquiry

If a student archives an inquiry that still has an active `inquiry_statuses` row (which Swarm B B.4 already deletes), the attorney's ring will not show the broadcast. No work needed in Swarm E for this — the server-side delete in B.4 handles it. Mention this in your handoff under "verified path".

---

## 7. Acceptance gates (verify before each swarm handoff)

Run these manually after wiring (in the order they appear):

### Schema (Swarm A — Claude)
- A.1 `select check_clause from information_schema.check_constraints where constraint_name = 'inquiries_status_check'` returns the 7-value set including `archived` + `engaged`.
- A.2 `\d public.inquiries` shows `archived_at`, `archived_by_role`, `archived_reason`.
- A.3 `select tgname from pg_trigger where tgname = 'trg_block_inquiry_delete_with_order'` returns 1 row.
- A.4 `select jobname from cron.job where jobname = 'purge-stale-inquiries-30d'` returns 1 row.

### Swarm B (API)
- B.1 GET `/api/client/inquiries` default excludes archived; with `?include=archived` includes them. Each row carries `order_id` (or `null`) and `answers`.
- B.2 PATCH inquiry: success path updates fields; archived row returns 409; converted row returns 409.
- B.3 DELETE inquiry: non-order row deletes (cascade verified by checking `inquiry_messages`/`attorney_offers`/`inquiry_statuses` are gone); order-linked row returns 409 with `{ reason: 'order_exists' }`; the trigger blocks even a direct API bypass.
- B.4 / B.5 Archive flips `archived_at`, kills active status broadcast, restores on unarchive (but does not re-create the broadcast).
- B.6 Status DELETE removes only the broadcast row; inquiry remains.
- B.7 Attorney queue does NOT contain an inquiry that has an accepted offer.
- B.8 / B.9 Admin + support list/detail endpoints return archived rows; mutation endpoints return 405 (or do not exist).
- B.10 Comment-only diff in `lib/checkoutOrders.ts`.
- `npx tsc --noEmit` clean.

### Swarm C (Student UI)
- Enriched list view shows country flag, case type, urgency chip, brief preview.
- Active / Archived tabs work; default is Active.
- Actions menu shows the right options for each row state per §C.1.
- Edit opens intake form pre-populated; Save changes hits PATCH.
- Archive shows confirmation, hides row from Active tab.
- Delete permanently is hidden on order-linked rows; replaced by Archive flow if API returns 409.
- Detail view shows order-linked banner + archived banner per §C.2.
- `npx tsc --noEmit` clean.

### Swarm D (Other roles UI)
- Attorney queue hint about auto-removal renders.
- Attorney detail view shows the archived read-only state when applicable.
- Admin Inquiries panel renders with filters + pagination + read-only drawer.
- Support inquiries panel renders in saas (cross-repo) with sidebar entry.
- `npx tsc --noEmit` clean in both repos.

### Swarm E (Messenger)
- Archived inquiry shows banner + disabled composer in both client and attorney views.
- Realtime DELETE removes the conversation from inbox; open chat shows centered placeholder.
- Student's own status tile has a Delete broadcast control.
- `npx tsc --noEmit` clean.

### Global no-regression
- WhatsApp identity tokens in messenger byte-identical (`git diff components/messaging/messenger-tokens.css` empty).
- Theme system from Brief 41 unaffected.
- Brief 46 chrome unaffected (`git diff components/marketplace/MarketplaceShell.tsx` empty).
- `/api/inquiries` POST (the public caseworks intake) still works — no edits to anonymous flow.
- Order-linked inquiries stay reachable from `/dashboard?page=orders&open=<id>`.

---

## 8. ROLE BOUNDARY — non-negotiable

- Worktree only across every Kimi swarm.
- **Do not run any SQL.** Swarm A's migration is Claude-applied via the Supabase Management API.
- No `git add`, `git commit`, `git push`, `git stash`, `git rebase`, `git merge`, no branch ops.
- No deploy / wrangler / Cloudflare commands.
- Do not edit files outside the swarm's stated path list.
- Each swarm sub-agent ends its return with `"Worktree-ready for Claude review."` and stops.

Two prior sequencing breaches are on record. The next unauthorized git op gets the commit reverted on sight regardless of substance.

---

## 9. Handoff schemas (one block per swarm: B, C, D, E)

Use the per-swarm template from Brief 46 §5, swapping the acceptance-gate bullets for the §7 list relevant to each swarm. Include a `### Notes / deviations` section — if a spec point in this brief is wrong or impossible (e.g. an existing endpoint signature has shifted), call it out there instead of silently improvising.

---

## 10. Pre-authored commit messages (Claude uses one per swarm)

**Swarm A — applied by Claude:**
```
feat(schema): inquiry lifecycle — archive cols + delete-guard + 30d cron

Adds archived_at / archived_by_role / archived_reason to inquiries,
extends the status CHECK to include 'archived' + 'engaged', installs
a BEFORE DELETE trigger that blocks hard-delete when an order references
the inquiry (defensive against API bugs), and schedules a daily 03:15 UTC
cron that purges inquiries older than 30 days that are not archived,
not converted, and have no linked order.

Adds inquiries to the supabase_realtime publication so messenger UIs
can subscribe to DELETE events.

Applied via Supabase Management API; committed for repo history.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

**Swarm B — API:**
```
feat(inquiries): student full-control API + queue auto-removal

PATCH / DELETE / archive / unarchive / status-delete on
/api/client/inquiries/[id]. Order-linked deletes return 409 before
the schema trigger fires. Archive deletes any active status broadcast.

Attorney queue filter excludes archived + converted + accepted-offer
rows. Read-only admin + support inquiry endpoints under
/api/admin/inquiries and /api/support/inquiries.

Co-Authored-By: Kimi <noreply@moonshot.cn>
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

**Swarm C — Student UI:**
```
feat(inquiries): enriched student list + edit/archive/delete actions

my-inquiries.jsx gains Active/Archived tabs, action menu (View / Edit /
Delete broadcast / Archive / Unarchive / Delete permanently) with
per-row state gating. Inquiry detail renders the full brief, order-linked
banner, and archived banner. inquiry-intake-form.jsx supports edit mode
via existingInquiry prop, posting PATCH instead of POST.

Co-Authored-By: Kimi <noreply@moonshot.cn>
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

**Swarm D — Other-role UI:**
```
feat(inquiries): attorney queue hint + admin/support read-only panels

Attorney inquiry queue gains an auto-removal explainer + archived
read-only state for direct-link landings. New admin Inquiries page
(filters + pagination + drawer). Cross-repo: support Inquiries page
in yousafe-saas with sidebar entry.

Co-Authored-By: Kimi <noreply@moonshot.cn>
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

**Swarm E — Messenger:**
```
feat(inquiries): messenger archived + deleted-realtime + status delete

ChatScreen shows an archived banner with disabled composer when the
source inquiry has archived_at set. Realtime DELETE on inquiries drops
the conversation from UnifiedInbox and renders a placeholder if the
chat is open. Student's own status ring tile gains a Delete broadcast
overflow control.

Co-Authored-By: Kimi <noreply@moonshot.cn>
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```
