# Medium-style redesign

_Started 2026-05-22 14:38 UTC_

---

## User

I want to redesign this code base so that it mimics medium.com look.

## Assistant

_[tool: local_ls]_

I can't recreate Medium's distinctive branded UI directly, but I can absolutely build something in the same *genre* — a clean, serif-led, reading-first editorial design with the long-form aesthetic that Medium-style sites are known for. The visual decisions would be original (typography pairing, palette, layout chrome, interactions) rather than copying Medium's specific brand assets.

Let me peek at your codebase first so I know what we're redesigning, then ask a few targeted questions.

_[tool: questions_v2]_

Before I dive in — a quick read confirms this is **Caseworks**, an editorial/legal-content site (articles, authors, topics, attorneys, intake flows). That's actually a perfect fit for a long-form, reading-first editorial redesign. A few questions so I build the right thing:

## User

Questions answered:
- scope: Decide for me
- fidelity: Clickable prototype with realistic interactions (hover, save, follow, claps/likes, nav)
- vibe: Decide for me
- type_pairing: Decide for me
- image_density: Decide for me
- homepage_layout: Decide for me
- reader_features: Floating highlight/note toolbar on text selection, Save to library, Author follow + related stories, Inline applause/clap-style reactions, Reading progress bar at top, Member-only paywall partial, Table of contents on long articles, Estimated reading time + word count, Comments / responses thread
- nav_style: Decide for me
- variations: Decide for me
- tweaks: Decide for me
- content_source: Decide for me

## Assistant

_[tool: local_ls]_

Great — I'll decide and commit. Letting you know my system before I build:

**Direction: "Modern editorial, warm paper."**
- **Type**: *Lora* for display + body (transitional serif with proper italics), *IBM Plex Sans* for UI/meta. Big serif headlines, generous leading.
- **Palette**: Warm paper background `oklch(98% 0.005 80)`, soft ink `oklch(20% 0.01 60)`, with a single brick accent `oklch(55% 0.12 35)` used sparingly (links, follow-state, applause).
- **Layout**: Editorial grid home (one lead story big, then a 3-up, then a list). Minimal sticky nav: wordmark left, search center, account right. Topic chips below.
- **Scope**: 3 connected screens — **Home feed**, **Article reader** (with the full feature set you picked), and **Author profile**. Wired together with realistic state (save, follow, applause counts persist across nav).
- **Tweaks** (live): accent color, font pairing, paper tone, density, dark mode.
- **Content**: I'll pull real headlines/authors/topics from your Caseworks codebase so it feels grounded.

Let me grab some real content and start building.

_[tool: local_read]_

_[tool: local_read]_

_[tool: local_read]_

_[tool: local_grep]_

_[tool: local_read]_

_[tool: local_grep]_

_[tool: local_read]_

Good — I have plenty of real titles, topics, and authors. Let me check one full article for body text, then build.

_[tool: update_todos]_

_[tool: copy_starter_component]_

_[tool: read_file]_

_[tool: write_file]_

_[tool: write_file]_

Now I'll write everything. Starting with the main HTML shell + data layer.Now the shared components and store:

_[tool: write_file]_

Now the home page:

_[tool: write_file]_

Now the reader page — the centerpiece with TOC, highlight toolbar, claps, paywall, comments:

_[tool: write_file]_

Now the Author page and the root App with Tweaks:

_[tool: write_file]_

_[tool: write_file]_

_[tool: grep]_

Let me quickly verify the TweaksPanel API matches:

_[tool: read_file]_

_[tool: show_html]_

API looks compatible. Let me open the file and check for runtime issues:

_[tool: done]_

_[tool: update_todos]_

_[tool: fork_verifier_agent]_

Done — built **`caseworks-redesign.html`** as an editorial reading-first redesign in the *same genre* as Medium-style sites, with an original visual identity rather than copying Medium's branded chrome.

**What I built** (open the Tweaks toggle in the toolbar to switch font pair, accent, paper tone, dark mode, density, reading width, and free/member status):

- **Home feed** — masthead with date + issue number, lead story (large), Editor's picks (3-up), reading list (numbered rows), right-rail with author follows, trending list, topic browse, and a membership pitch. Topic chip bar is sticky under the nav.
- **Article reader** ("Form I-765: the eight common mistakes") — sticky brick **reading-progress bar** at top, floating left rail with claps/comments/save/share, opening byline with **Follow** that flips state, hero, expandable **Table of Contents** that highlights the active section as you scroll, full prose body with inline links + pull quote, big **clap button** at the end (taps up to 50, animates), author card, **Responses** with a working draft form and threaded replies, then "Continue reading" related grid. The brick member-only article also demonstrates the **paywall fade** — switch Account to "Member" in Tweaks to unlock the rest.
- **Author profile** — large masthead with stats, Follow button, tabbed body (Writing / About / Pinned / Reading list), articles list, and a side rail of other reviewers.
- **Highlight toolbar** — select any text in the article body and a pill-shaped floating toolbar appears (highlight / note / copy / share-as-quote / respond).

State persists across nav: save an article on the home feed, it stays saved in the reader and footer. Follow an author once, it sticks everywhere.

**Type & palette** — Lora display + body, IBM Plex Sans for UI, IBM Plex Mono for tiny labels, warm paper background, soft ink, single brick accent. Imagery is stripe-placeholder with monospace captions describing what photo to drop in.

**File layout** — `caseworks-redesign.html` shell, then `data.jsx`, `shared.jsx` (nav/footer/cards/store), `home.jsx`, `reader.jsx`, `author.jsx`, `app.jsx`, plus the `tweaks-panel.jsx` starter.

Tell me what to push further — more screens (intake, topic, library), a second visual direction side-by-side on a canvas, or a tighter pass on any one screen.

