# Authenticated Opera Control Bridge Design

**Date:** 2026-09-15  
**Repository:** `kylemwalkerpr-ship-it/portal`  
**Control branch:** `tooling/authenticated-opera-control-design`  
**Baseline main:** `ca23e3d76dfc9fc0516a8021e5c21729c845de00`  
**Supervisor:** GPT-5.6 Sol

## 1. Purpose

Create a fast local browser-control path that lets ChatGPT operate the user's already-authenticated Opera session instead of launching a separate cloud browser and repeating login, MFA, or anti-bot flows.

The target capability is DOM-level interaction with the browser the user already uses: discover tabs, inspect page structure, click controls, type into fields, select options, navigate, switch tabs, wait for page state, take screenshots, and handle ordinary uploads/downloads while preserving the user's existing cookies and authenticated sessions.

This is a local automation bridge, not a new production feature in YouSafe. It must remain isolated from application deployment and must not alter the active SEO worktree.

## 2. Success criteria

The bridge is accepted only when all of the following are proven on the user's Mac:

- attaches to an existing Opera browser session without requiring a second login;
- can enumerate existing tabs and identify the intended target deterministically;
- can read DOM/accessibility state and page URL/title;
- can click and type using element-level selectors rather than screen coordinates;
- can switch among multiple authenticated tabs without losing session state;
- can capture a screenshot for verification;
- can complete a harmless test interaction and confirm the resulting page state;
- survives normal repeated use without reinstalling or reauthenticating each task;
- exposes no browser-control endpoint beyond localhost;
- has a documented fallback if Opera extension compatibility fails.
## 3. Recommended architecture

Use a two-path local control architecture, preferring the least intrusive path that proves reliable with Opera 135.

### Primary path: Playwright MCP browser extension

Install the official Playwright MCP browser extension in Opera if Opera accepts and runs it correctly. The extension is designed to connect automation to tabs in an existing browser profile, allowing reuse of cookies, login state, MFA-completed sessions, and installed browser extensions.

A local Playwright MCP process will communicate with the browser extension. Remote Desktop Commander remains the transport from ChatGPT to the Mac, while the browser extension/Playwright layer supplies browser-native interaction.

This path is preferred because it does not require exposing a remote-debugging port and is purpose-built for attaching automation to an already-running logged-in browser.

### Fallback path: localhost CDP attachment

If the extension does not work correctly in Opera, launch a dedicated Opera automation instance using the user's normal profile only when safe to do so, or a synchronized dedicated automation profile, with remote debugging bound to loopback only. Connect Playwright using CDP.

The CDP endpoint must never bind to a LAN or public interface. It is an implementation detail on the Mac, not a network service intended for remote access.

### Explicit non-goal

Do not use coordinate-based GUI clicking as the normal interaction layer. macOS Accessibility/AppleScript may remain an emergency fallback for browser chrome that DOM/CDP cannot reach, but it is not the primary design.
## 4. Components and responsibilities

### Opera

Opera remains the user's normal interactive browser and source of authenticated session state. No credentials are copied into project files, prompts, or scripts.

### Playwright control layer

The control layer owns browser-native actions: tab discovery, selector resolution, clicks, typing, navigation, waits, screenshots, file chooser handling, and state verification. It should prefer semantic locators such as accessible role/name, label, text, or stable DOM attributes over brittle CSS paths.

### Remote Desktop Commander

Remote Desktop Commander provides authenticated access to the Mac filesystem and terminal. It starts, stops, inspects, and verifies the local Playwright control process. It is not responsible for browser DOM automation itself.

### Opera Browser Connector

The existing Opera Browser Connector remains useful for fast tab listing, accessibility-tree inspection, screenshots, navigation, and read-only corroboration. It can be used alongside Playwright, but it is not relied on for arbitrary page clicks because its current exposed tool surface does not provide them.

## 5. Control flow

1. User keeps Opera open and logs into sites normally.
2. ChatGPT identifies the desired tab and intended action.
3. Local Playwright attaches to the existing authenticated browser context.
4. The controller resolves the target element semantically and verifies it is visible/actionable.
5. The requested interaction is performed.
6. The resulting page state is read back and verified before success is reported.
7. For consequential actions, the existing user-approval boundary applies before the final irreversible click.
## 6. Safety and security boundaries

- Browser automation must remain local to the Mac; no debugging endpoint may listen on a non-loopback interface.
- Do not extract, print, persist, or transmit raw cookies, session tokens, passwords, API keys, or local-storage secrets unless the user explicitly requests a supported credential-management workflow.
- Prefer controlling the live browser context over copying profile databases or cookie stores.
- Never commit browser profile data, credentials, downloaded secrets, or authentication artifacts to Git.
- A browser-control process must be easy for the user to stop by closing the helper process or disconnecting Remote Desktop Commander.
- Read-only inspection may proceed when requested. Destructive or externally consequential actions retain the same confirmation boundaries as other tools.
- Production deploys remain governed by `AGENTS.md`; browser control is not permission to bypass GitHub release controls.

## 7. Opera compatibility strategy

Playwright does not treat Opera as an officially tested first-class browser channel, even though Opera is Chromium-based. Therefore compatibility is an evidence gate, not an assumption.

The first implementation step will be a non-destructive compatibility spike:

1. install/run the minimal Playwright MCP components locally;
2. attempt the extension path in Opera;
3. attach to a harmless existing tab;
4. enumerate tabs and read title/URL/DOM state;
5. perform one reversible or harmless click/type interaction;
6. verify state through both Playwright and, where useful, Opera Browser Connector;
7. if any extension behavior is unreliable, stop and switch to the localhost CDP fallback instead of patching around instability.

## 8. Persistence and startup

After the compatibility path is proven, the helper should be made persistent enough for routine use but remain user-controlled. Preferred order: a lightweight user-level launcher or LaunchAgent that starts only the local bridge, then a manual one-command launcher if persistence introduces fragility.

The browser itself should not be forcibly restarted merely to satisfy automation unless the chosen fallback technically requires it and the user is warned before session disruption.
## 9. Verification plan

Verification is staged to avoid risking authenticated accounts while proving the complete interaction path.

### Gate A — local prerequisites

Confirm Opera version/path, Node/npm availability, extension availability, local binding behavior, and absence of an existing conflicting Playwright installation or debugging service.

### Gate B — read-only attachment

Attach to Opera and prove existing-tab enumeration, URL/title reads, DOM/accessibility inspection, and screenshot capture. No page mutation is allowed at this gate.

### Gate C — harmless interaction

Use a non-destructive page or control to prove selector-based click, text entry, tab switching, wait-for-state, and verification. The test must not submit payments, change production settings, merge code, delete data, or publish content.

### Gate D — authenticated application test

On an authenticated site chosen by the user, prove that the existing logged-in state is reused without credential re-entry. Perform read-only navigation and one explicitly harmless interaction.

### Gate E — persistence

Restart only the helper process and prove that the bridge can reconnect to the still-running authenticated browser without a new installation or login flow.

## 10. Failure handling

If a selector is ambiguous, the controller must inspect and disambiguate rather than click the first match. If page state differs from the expected precondition, stop before mutation. If the browser disconnects, reconnect and re-read state instead of replaying the previous action blindly. If the extension path is unstable in Opera, fall back to CDP rather than layering screen-coordinate automation over it.
## 11. Decisions

- Primary implementation choice: official Playwright MCP browser-extension path in Opera, subject to an explicit compatibility gate.
- Fallback: localhost-only CDP attachment controlled by Playwright.
- TinyFish remains useful for public or disposable browser workflows but is not the authenticated-session control layer.
- Opera Browser Connector remains a complementary inspection/navigation tool, not the arbitrary-click engine.
- Remote Desktop Commander remains the Mac transport/process supervisor.
- No custom Opera extension will be built unless both official extension and CDP paths fail to meet the success criteria.

## 12. Non-goals

This work does not grant blanket permission to make consequential account changes without confirmation. It does not bypass MFA, CAPTCHA, anti-bot controls, site permissions, GitHub protections, or YouSafe deployment rules. It does not expose the authenticated browser to the public internet. It does not copy the user's browser profile into the YouSafe repository.

## 13. Current environment facts

At design time, the Mac is reachable through Remote Desktop Commander. Opera `135.0` is installed at `/Applications/Opera.app` and is running. Node `v26.0.0` and npm `11.12.1` are available. `playwright`, `playwright-core`, and `@playwright/test` do not currently resolve from the checked environment.

These observations establish feasibility only; installation and browser changes begin after this design is reviewed and the implementation plan is approved.
## 14. Fast local command surface

To avoid paying process-startup cost for every browser action, the implementation should keep one local controller process alive after attachment. That controller owns the Playwright browser connection and exposes a narrow structured command surface to Remote Desktop Commander.

Preferred implementation is a small Node controller plus a lightweight CLI or local IPC endpoint that accepts commands such as `tabs`, `inspect`, `click`, `fill`, `press`, `navigate`, `screenshot`, and `wait`. Commands and results should use structured JSON so the supervisor can verify exactly which tab, locator, and resulting state were involved.

The controller must bind only to local IPC or loopback, must not expose credentials, and must reconnect cleanly if Opera restarts. A user-level LaunchAgent may keep this helper available across chats after the compatibility gates pass.

This persistent layer is part of the success definition for "fast": normal follow-up clicks and reads should reuse the existing browser connection rather than spawn a new Playwright process for each action.