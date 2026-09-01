# DeepSeek V4 Flash implementation brief: eliminate contradictory ship state

## Role and scope

You are the implementation engineer. Work only in `yousafe-portal`. Do not commit, push, deploy, delete, reset, restore, or modify sibling repositories. Preserve all existing modified and untracked work. The supervisor will review and own Git operations.

## Live defect

In the Content Studio job modal, a draft can simultaneously show:

- green banner: `Previous ship refusal is stale — the current draft passes the quality gate. Click Approve → main to ship this version.`
- active blocker: `UNLINKED_RELATED_GUIDE`
- disabled `Approve → main` button
- loop result: `Audit & Fix paused for review`

Screenshot case: `## Related guides` contains plain-text entries such as `Administrative Review Letter Template UK, challenge a UK visa refusal.` rather than verified Markdown links.

Commit `d888220` does NOT resolve this defect. It only changes synthesized-keyword warning wording and brief keyword placement. Do not undo it.

## Verified root inconsistency

`components/design/admin-content-studio.tsx` declares the stale refusal cleared when `audit.score === 100`. The action buttons use the child editor's current `editorShipReady === true`. Score is not ship readiness, so the banner lies whenever a structural/link blocker exists at score 100.

## Required outcome

Establish one canonical current-gate state for the banner, blocker panel, and action enablement:

1. Never claim the current draft passes unless the latest audit response explicitly reports `shipReady === true` and zero blockers.
2. When current audit state is unknown, do not claim pass; instruct the operator to audit.
3. When `shipReady === false`, keep the refusal/blocker state visible and Approve disabled.
4. Reset stale child audit/ship state when the selected job or editor content version changes so one job's result cannot bleed into another.
5. `UNLINKED_RELATED_GUIDE` must be clearable deterministically when—and only when—a plain-text related-guide label can be matched to a verified live estate URL. Convert it to `[label](verified-url)` without inventing URLs.
6. If no unique verified URL match exists, hold for review with an honest message; never report pass and never manufacture a destination.
7. After repair, re-run the complete canonical audit and derive both `shipReady` and displayed findings from that same final response.

## Provider wiring required before live E2E

Add Entrim as a first-class OpenAI-compatible provider in the application's configurator and model/host catalog:

- provider id / pin: choose a consistent explicit id such as `entrim-deepseek`
- label: `DeepSeek V4 Flash · Entrim`
- base URL: `https://api.entrim.ai/v1`
- key env: `ENTRIM_API_KEY`
- model: `deepseek-ai/DeepSeek-V4-Flash`
- expose Entrim in the Draft lane host selector for the existing `deepseek-v4-flash` model family
- expose it in the Command/Configurator provider list
- configurator-vault credentials must take precedence over environment credentials, following the existing vault-overlay contract
- explicit Entrim selection must fail closed with a clear provider error; it must not silently execute another host
- preserve the existing defaults unless a test or documented policy says otherwise

Update the runtime provider resolution, completion/streaming paths, aliases, UI mapping, vault definitions, and focused tests consistently. Do not leak keys.

## Repair guidance

Inspect existing related-guide repair code in `editorialScaffold.ts`, `linkAudit.ts`, `contentQualityGate.ts`, and the re-audit route before adding logic. Reuse the verified estate URL set already fetched by the re-audit flow. Prefer a pure helper with tests. Matching must be normalized and unique; ambiguous/no-match entries remain blockers. Preserve all headings, bullets, numbering, citations, and unflagged links.

## Required tests

Add focused regressions proving:

- score 100 + blocker + `shipReady=false` never renders the green stale-pass banner and keeps Approve disabled
- score 100 + zero blockers + `shipReady=true` renders the green banner and enables Approve
- unknown audit state never renders a false pass
- a uniquely matching plain-text Related guides entry becomes a verified Markdown link and clears `unlinked_related_guide`
- unmatched/ambiguous text remains blocked and no URL is invented
- Entrim appears for DeepSeek V4 Flash in Draft and Command/Configurator
- Entrim pin resolves to exact endpoint/model and vault-over-env precedence works
- explicit provider failure does not silently fall back

Run targeted Jest, TypeScript, and the relevant build check. Then create or update a Playwright test that exercises the real job modal state end to end. Do not claim live success unless the production/local signed-in browser path was actually exercised.

## Deliverable

Implement the fix, report exact files and commands/results, identify any live-test blocker, and stop. Do not commit or push.
