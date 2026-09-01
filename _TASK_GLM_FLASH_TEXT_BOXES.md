# Flash — market text must sit on a legible surface

Repo: `/Users/phantomdarne/Documents/GitHub/yousafe-portal`. No commit. No secrets. No landing copy rewrite.
Reads ≤80 lines. Stop by 25 min with tsc green.

## Bug

Find a Specialist (`components/design/find-attorney.jsx` ~93–104 and market `MarketplaceProvidersIndex.tsx` ~151–158) prints **Verified panel / Find Your Specialist.** in `C.text` / `T.gold` / `#FFFFFF` **directly on dark paper + pattern**. Blue/gold on walnut is unreadable.

Rule for **every** market surface (`app/marketplace/**`, `app/shop/**`, `components/marketplace/**`, and `find-attorney.jsx` when rendered inside `MarketplaceShell`):

- Body copy, headings, eyebrows, ledes that sit on **paper/pattern** must be inside a **text box**: `background: T.vellum` or `T.cream` (or `color-mix` paper 88% + black), `color: T.ink` / `T.inkMid`, padding, radius 8–12, optional `T.rule` border.
- Split titles `h2 em` already use onPaperEm — if they stay on paper they must still meet 4.5:1 **or** move into the same box.
- Do **not** use `T.gold`, `T.indigo`, `C.text` (portal blue), or `C.textMuted` as text **on paper**.
- Cards that already use vellum/cream: keep; just fix ink vs paper.
- Decorative pattern stays visible **around** the boxes, not through 0% opacity text.

Minimum: wrap the Find a Specialist intro (eyebrow + h2 + lede) in one box. Then grep `color: T.gold`, `color: C.text`, `color: T.indigo` in marketplace + find-attorney and box or retoken each **text** hit.

`npx tsc --noEmit`

Report FILES / remaining unboxed page if any.
