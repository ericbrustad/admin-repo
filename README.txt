work — 2025-10-16 02:15:00Z
BANNER, COVER, MEDIA COUNT — 2025-10-15 11:58:45Z
Branch work — 2025-10-14 21:27:31Z
Device & Response UI Package
----------------------------
## Update Log
- 2025-10-31 — Legacy theme pack restoration, pets & party skins, and font imports. Commit: (pending HEAD)
  - Direct links: `apps/admin/pages/index.jsx`, `apps/admin/lib/admin-shared.js`, `apps/admin/styles/globals.css`, `apps/admin/docs/gpt-conversation-log.md`, `README.txt`, `apps/admin/public/**`, `apps/game-web/public/**`
  - Notes: Reinstated the chrome/forest/military/cartoon admin skins, added ocean/holiday/seasonal presets plus new party and pet themes with remote art so no binaries touch Git, expanded the appearance font picker with Google Font imports, refreshed the UI theme map wiring, logged the ChatGPT-5 pairing, and reset every game config so "Forest Outpost" replaces the Starfield dawn override across admin + gameplay mirrors.
- 2025-10-30 — Default game selectors & Supabase fallbacks. Commit: (pending HEAD)
  - Direct links: `apps/admin/components/DefaultGameControls.jsx`, `apps/admin/components/HomeDefaultButtons.jsx`, `apps/admin/pages/settings-defaults.jsx`, `apps/admin/pages/api/app-settings.js`, `apps/admin/pages/api/games/list.js`, `apps/admin/pages/index.jsx`, `apps/admin/docs/gpt-conversation-log.md`, `README.txt`
  - Notes: Added draft/published default selectors with localStorage + Supabase persistence, exposed `/api/app-settings` + `/api/games/list`, wired the Play Test toolbar with quick-launch buttons, surfaced repo metadata on the defaults page with fetch/render timestamps, and logged the GPT-5 pairing.
- 2025-10-30 — Yarn config cleanup & metadata snapshot hardening. Commit: (pending HEAD)
  - Direct links: `.yarnrc.yml`, `package.json`, `apps/admin/pages/index.jsx`, `README.txt`, `apps/admin/docs/gpt-conversation-log.md`
  - Notes: Reset the Yarn config to a minimal node-modules linker with the public npm registry, normalized the workspace package manager metadata, refined the Settings footer snapshot to drop placeholder dashes while surfacing full commit hashes, and logged the latest operator ↔ GPT session.
- 2025-10-29 — Node 22 warning cleanup & admin manifest fix. Commit: (pending HEAD)
  - Direct links: `.node-version`, `package.json`, `apps/game-web/pages/settings.jsx`, `yarn.lock`, `README.txt`
  - Notes: Bumped the checked-in Node version to 22.11.0 to match the enforced runtime, rewired <code>yarn build</code> to run the admin and game workspace builds sequentially so the admin routes manifest is always generated, expanded the Yarn lockfile, and logged the troubleshooting summary in the Settings safeguards and conversation log.
- 2025-10-28 — Settings footer env fallback & dev snapshot row. Commit: (pending HEAD)
  - Direct links: `apps/admin/pages/index.jsx`, `apps/admin/docs/gpt-conversation-log.md`, `README.txt`
  - Notes: Added NEXT_PUBLIC fallbacks for repo metadata so the Settings footer stays populated in local/dev runs, consolidated the Dev Environment Snapshot into a single footer row with captured timestamp details, refreshed the pairing log, and reconfirmed the admin build.
- 2025-10-28 — Yarn-only Vercel build alignment & Node 22 verification. Commit: (pending HEAD)
  - Direct links: `vercel.json`, `package.json`, `apps/game-web/pages/settings.jsx`, `README.txt`
  - Notes: Routed the Vercel build through <code>yarn build</code> so turbo compiles both apps under Node 22, updated root scripts/docs to describe the turbo filtered build, refreshed the Settings safeguards/log with the latest operator request, and kept the Yarn-only workflow guidance current.
- 2025-10-27 — Codex proxy audit vs. Vercel builds. Commit: (pending HEAD)
  - Direct links: `apps/game-web/pages/settings.jsx`, `README.txt`
  - Notes: Logged the new operator request to distinguish Codex shell proxy failures from Vercel builds, recorded the proxy env/config outputs plus curl diagnostics in the Settings conversation log, and extended the safeguards with a reminder to capture those checks alongside Yarn workflow notes.
- 2025-10-26 — Yarn workspace migration & safeguard refresh. Commit: (pending HEAD)
  - Direct links: `package.json`, `apps/game-web/package.json`, `tools/vercel-info.mjs`, `apps/game-web/pages/settings.jsx`, `.yarnrc.yml`, `yarn.lock`, `README.txt`
  - Notes: Replaced the pnpm-focused workflow with Yarn workspaces, refreshed the safeguard checklist and Settings log to cover the Yarn toolchain plus proxy fallout, documented the Yarn-first build commands, and captured the Corepack-to-Yarn migration attempt for QA reference.
- 2025-10-25 — Vercel Node 22.x alignment & safeguard refresh. Commit: (pending HEAD)
  - Direct links: `apps/game-web/package.json`, `tools/vercel-info.mjs`, `apps/game-web/pages/settings.jsx`, `README.txt`
  - Notes: Raised the game workspace engines to Node 22.x for Vercel compatibility, updated the build diagnostics to warn when the runtime drifts, refreshed the Settings safeguards/log, and reconfirmed the offline build after the upgrade.
- 2025-10-24 — Offline pnpm primary workflow & build script aliases. Commit: (pending HEAD)
  - Direct links: `package.json`, `apps/game-web/pages/settings.jsx`, `README.txt`
  - Notes: Promoted the offline pnpm shim to the default build command, added an opt-in standard pnpm script for proxy testing,
    documented the workflow so teammates skip Corepack downloads, and refreshed the Settings safeguards/log transcript.
- 2025-10-22 — Offline pnpm shim & TypeScript-free previews. Commit: (pending HEAD)
  - Direct links: `tools/offline-pnpm.mjs`, `apps/admin/pages/preview/[slug].jsx`, `apps/game-web/pages/index-supabase.jsx`, `package.json`, `apps/admin/pages/index.jsx`, `apps/admin/pages/api/admin-meta.js`
  - Notes: Added a local pnpm shim that routes `--filter` commands to the Next.js binaries for admin and game builds, dropped TypeScript-only entry points so offline builds stop downloading `@types/*`, refreshed the settings footer snapshot, and logged the GPT pairing that validated the fix.
- 2025-10-20 — Monorepo workspace bootstrap & shared package scaffold. Commit: (pending HEAD)
  - Direct links: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `apps/admin/**`, `apps/game-web/**`, `packages/shared/**`
  - Notes: Migrated the repo into a pnpm/turbo monorepo with Next.js apps relocated to `apps/admin` and `apps/game-web`, added
    workspace-aware GitHub paths plus Supabase/media mirroring, and introduced a starter shared workspace for cross-app types.
- 2025-10-20 — Supabase media upload repair & auto slugging workflow. Commit: (pending HEAD)
  - Direct links: `pages/api/upload.js`, `pages/api/list-media.js`, `pages/api/media/delete.js`, `lib/supabase-storage.js`, `components/MediaPool.jsx`, `pages/index.jsx`
  - Notes: Restored Supabase Storage uploads with POST semantics, added media slugs/tags surfaced in the Media Pool, introduced Supabase deletions that clean manifest records, and refreshed the New Game modal to auto-assign slugs while reflecting the publishing protection state.
- 2025-10-20 — Settings log relocation & repository snapshot panel. Commit: (pending HEAD)
  - Direct links: `pages/index.jsx`
  - Notes: Moved the Operator ↔ GPT conversation history into the Settings tab with status copy, removed it from the global header, and added a repository snapshot card that surfaces the repo, branch, commit, Vercel target, and timestamp for quick QA reference.
- 2025-10-16 — Game settings deck restructure & protection prompt modal. Commit: (pending HEAD)
  - Direct links: `pages/index.jsx`, `pages/api/admin-protection.js`, `pages/api/games.js`
  - Notes: Refreshed the Settings tab with a read-only title + slug, relocated the saved-games selector alongside a modal New Game launcher, added the cover thumbnail beside the admin header, delivered the password enable/disable prompt with required confirmation, and polished mission/device 3D controls plus modal styling. Note to review @ 2025-10-16 02:15:00Z.
- 2025-10-16 — Admin protection toggle parsing & Next build verification. Commit: (pending HEAD)
  - Direct links: `pages/api/admin-protection.js`
  - Notes: Accepts "false"/"true" strings from the dashboard toggle so the password stays off by default, keeps the admin and game JSON copies synchronized, and reran `npm run build` to confirm the Next.js admin bundle succeeds after restoring the game stylesheet. Note to review @ 2025-10-16 00:46:47Z.
- 2025-10-16 — Admin protection sync & game CSS guard. Commit: 49eafe7cd5384c38bebca33b1fc201b6f7c66079
  - Direct links: `pages/api/admin-protection.js`, `game/styles/globals.css`
  - Notes: Keeps the admin password toggle defaulted off while syncing the game JSON copies without forcing them back to false, and restores the game Next build by shipping the missing `styles/globals.css` so Vercel no longer fails on the module lookup. Note to review @ 2025-10-16 00:41:00Z.
- 2025-10-15 — Mission response normalization and legacy page archive. Commit: 0b52af3a53ef71c50f26765bdb681ffa9d197c21
  - Direct links: `components/InlineMissionResponses.jsx`, `docs/legacy-pages/`
  - Notes: Normalizes the mission response editor state before rendering so missing response blocks can no longer trigger the New Mission application error, and relocates historical admin page backups into `docs/legacy-pages` to prevent duplicate page routes from crashing the dashboard. Note to review @ 2025-10-15 15:32:10Z.
- 2025-10-15 — Header blur, cover save workflow, and media deletion fix. Commit: 97242a44ebaa6cbc54e9227762a211b57cb39e90
  - Direct links: `pages/index.jsx`, `components/AssignedMediaTab.jsx`, `components/InlineMissionResponses.jsx`, `pages/api/list-media.js`
  - Notes: Centered the Admin Control Deck title on a blurred header band with a brighter Save & Publish button, expanded the cover workspace with a dedicated Save Cover Image action, removed thumbnail clutter, hardened mission response rendering, and made Media Pool deletions respect repository paths. Note to review @ 2025-10-15 15:13:39Z.
- 2025-10-15 — Mission response inventory guards. Commit: 6eefb17e218f1a40bdcfa303fafbe8ccb56d6743
  - Direct links: `components/InlineMissionResponses.jsx`
  - Notes: Sanitizes the mission response media grid so null or string-only inventory items can't crash new mission drafts and keeps the drag-and-drop selector stable for PNG/JPG uploads under 1 MB.
  - Note to review @ 2025-10-15 14:49:27Z.
- 2025-10-15 — Assigned Media & mission error guards plus inline upload base64 fix. Commit: c02c87eaa1d6cf520eb96746d4c3807e8784423f
  - Direct links: `pages/index.jsx`, `components/InlineMissionResponses.jsx`, `components/SafeBoundary.jsx`, `.npmrc`
  - Notes: Wraps the mission response editor and Assigned Media tab in a reusable safe boundary so runtime issues render inline with a retry button instead of crashing the page, switches mission drag-and-drop uploads to a chunked base64 reader to keep PNG/JPG assets under 1 MB from breaking, and resets npm to the public registry for connectivity checks. Note to review @ 2025-10-15 14:32:40Z.
- 2025-10-15 — Admin protection state guard & npm proxy note. Commit: fc04b5884f75dee9b4ed0cf773549de2669533b9
  - Direct links: `pages/index.jsx`, `.npmrc`
  - Notes: Moves the password protection hooks ahead of the loader effect to stop the Admin dashboard from throwing a ReferenceError on load and drops a local npm registry override so installs can be pointed at an allowed mirror when access is restored. Note to review @ 2025-10-15 14:05:44Z.
- 2025-10-15 — Cover preview crash fix when loading Admin. Commit: 08fe39b45b449043b28c3e12552635de2c70edb9
  - Direct links: `pages/index.jsx`
  - Notes: Moves the cover upload preview and target state declarations ahead of their cleanup effects so the Admin dashboard no longer throws a client-side exception on load. Note to review @ 2025-10-15 13:54:21Z.
- 2025-10-15 — Admin landing crash fix and Assigned Media recovery. Commit: 65c62abe2882c3fd4360dc1236288862ab78b9a1
  - Direct links: `pages/index.jsx`
  - Notes: Restores the admin dashboard, mission modal, and Assigned Media tab by fixing the deployment banner reference order so the page no longer throws an application error. Note to review @ 2025-10-15 13:24:05Z.
- 2025-10-15 — Admin meta banner state guards. Commit: 2952ad333ce6beb0d9d2a29e8ac8f83487292040
  - Direct links: `pages/index.jsx`
  - Notes: Normalizes the branch/deployment banner defaults before applying API responses so undefined state can never break the dashboard render loop. Note to review @ 2025-10-15 13:41:37Z.
- 2025-10-15 — Admin meta banner, cover upload repair, and Assigned Media fixes. Commit: ddfa091ed00500a9556641f4e747281d2b514570.
  - Direct links: `pages/api/admin-meta.js`, `pages/index.jsx`, `components/AssignedMediaTab.jsx`
  - Notes: Adds a top-of-page branch/deployment banner with timestamps, stabilizes cover drag & drop previews so PNG/JPG art immediately appears in Settings and the Media Pool, resizes the cover workspace, relocates device Save/Close actions beneath the map, and updates Assigned Media to show tag labels with usage counts while restoring the tab from its crash.
- 2025-10-15 — Cover upload preview and media tab refresh. Commit: 62919ea47e2d9bf30fdefea10945f61e1286f698.
  - Direct links: `pages/index.jsx`, `components/AssignedMediaTab.jsx`, `components/MediaPool.jsx`
  - Notes: Adds a live blob preview for cover uploads with a 1 MB guardrail, keeps the banner free of cover art, and moves media usage summaries into Assigned Media while the Media Pool now focuses on thumbnails.
- 2025-10-15 — Disable game deploys and repair image uploads. Commit: e5c57eed043e6dbd4191e93ab4db801b7871ae36.
  - Direct link: `pages/index.jsx`
  - Notes: Added a Save & Publish deploy toggle that defaults off to block unintended game pushes, hardened drag & drop cover uploads so PNG/JPG art under 1 MB lands in `/media/covers` and syncs into the Media Pool, and refreshed upload handling to accept more image types without corruption.
- 2025-10-15 — Removed the config.json quick link from the Admin Control Deck header per QA feedback. Commit: f89ac490b7ce147abe929c38e53b8c1fb470db05.
  - Direct link: `pages/index.jsx`
  - Notes: Keeps the header focused on tab navigation and Save & Publish while leaving the game folder selector and password protection toggle off by default.
- 2025-10-15 — Cover workflow alignment & header preview cleanup. Commit: d173490c16c7aad4de654476372e23ccfd78adc1.
  - Direct link: `pages/index.jsx`
  - Notes: Replaced the banner preview with a single cover tile beside the Admin Control Deck title, retitled the settings upload tools to “Cover”, expanded accepted image formats, and updated instructional copy to highlight cover placement.
- 2025-10-15 — Banner terminology refresh & assigned media usage counters. Commit: 0ee8fe81a2c7c96dee0eec8be60999cafbe94774.
  - Direct links: `pages/index.jsx`, `components/AssignedMediaTab.jsx`, `components/MediaPool.jsx`
  - Notes: Renamed the game settings cover UX to a banner workflow with centered title + dual previews in the admin header, duplicated the banner preview as a Cover thumbnail beside the read-only heading, shifted media counts into Assigned Media with tag-aligned listings, and preserved the Game folder and password protection toggles in their off states.
- 2025-10-14 — Save & Publish polish + mission/media crash fix. Commit: 9070d1e1f29cd810a96624809cc1d449a2f352bf.
  - Direct link: `pages/index.jsx`
  - Notes: Locks the main header action to “Save & Publish” with a live cover thumbnail, rebuilds the Game Settings cover picker with drag & drop/upload/media pool options alongside the title, and adds defensive mission plus assigned-media logic to eliminate the client-side exception while data is loading.
- 2025-10-14 — Admin deck header realignment & crash guards. Commit: f2d360052ce8e62c7d763e0d5cee3f734a5765d8.
  - Direct link: `pages/index.jsx`
  - Notes: Moves SETTINGS/MISSIONS/DEVICES/TEXT/ASSIGNED MEDIA/MEDIA POOL and the 💾 Save control beside the Admin Control Deck
    heading, removes the "View missions.json" shortcut, and hardens mission creation plus Assigned Media interactions against
    null-config crashes.
- 2025-10-14 — Assigned media tagging & mission header adjustments. Commit: 9f79b6d3fa3dbe6560da34d9d37f77d3e1d4be5f.
  - Direct links: `components/AssignedMediaTab.jsx`, `components/MediaPool.jsx`, `pages/index.jsx`
  - Notes: Surfaced media tags within the Assigned Media tab (for icons, devices, rewards, and penalties), hardened tag lookups to eliminate the browser error in the assigned media view, and moved the mission title input into the overlay header while keeping the mission ID read-only next to Save & Close.
- 2025-10-14 — Assigned media theming + usage counters polish. Commit: 106ba00d859442d0b4e9add2dd76b53ef16121ab.
  - Direct links: `components/AssignedMediaTab.jsx`, `components/MediaPool.jsx`
  - Notes: Swapped the assigned-media overview and media pool cards to rely on global appearance variables, added per-section item/use totals, and ensured media previews only render when a file is actually in use (with safety guards on the Open action).
- 2025-10-14 — Mission/device editors and assigned media summary refresh. Commit: 1ef03a49facc444ce13b37412e076e9dd2e585d9.
  - Direct links: `pages/index.jsx`, `components/AssignedMediaTab.jsx`
  - Notes: Added floating Save/Cancel controls to mission and device editors, introduced a header cover-image window with drag/drop/import options, and moved media usage counts into the Assigned Media tab with per-type summaries.
- 2025-10-17 — Set Starfield Dawn as default admin skin and bump package version. Commit: 4fb54669263a320fa227306c4bf9b25e35f910dc. *(Legacy skin art deprecated in favor of external storage; see 2025-10-20 entry.)*
  - Direct links: `pages/index.jsx`, `lib/admin-shared.js`, `package.json`
- 2025-10-16 — Device editor map controls realignment. Commit: 974ddf67a4a52d773578de28d015c9ff6f455f64.
  - Direct link: `pages/index.jsx`
  - Notes: Keeps the device radius slider and ring selector anchored above the map while grouping Save, Cancel, and Close in the editor header.
- 2025-10-13 — Admin password protection API fix. Commit: 6ff58c6ee5795a7ee78809f83e5d6b0ffa597ead.
  - Direct link: `pages/api/admin-protection.js`
  - Notes: Restores the admin password toggle endpoint and always keeps the game password state off.
- 2025-10-14 — Admin UI theme helpers + assets. Commit: 860691231af6542e34489ab4cd7ef64fcae63634.
  - Direct link: `lib/admin-shared.js`
  - Direct link: `public/media/skins/`
  - Notes: Re-exports tone helpers so the admin password switch loads without build errors and ships the 12 themed skin backgrounds so the default skin stays legible while the game-side password remains disabled.
- 2025-10-15 — Admin basic auth obeys toggle. Commit: b9d9bbffb5254cbd710aa5545454370d4ec1cb48.
  - Direct link: `middleware.js`
  - Notes: Middleware now checks `/admin-protection.json` before challenging, allowing the password switch to disable prompts while keeping caching for quick reads.

## Yarn workspace workflow

- **Node runtime** — Vercel requires `node 22.x`; mirror that version locally and in CI before running the Yarn commands below.
- **Install dependencies** — Run `yarn install` from the repository root. In proxy-restricted environments this may surface `40
  3` responses; capture those logs so networking teams can allow the registry or provide an approved mirror. Until a Yarn lockfi
  le can be generated those failures will block `yarn build`; rely on the workspace Next.js binaries (for example `node apps/gam
  e-web/node_modules/.bin/next build`) for smoke checks and keep the proxy errors attached for follow-up.
- **Primary build** — `yarn build` now runs the admin workspace first (`yarn workspace esx-admin-control-panel-map run build`) and then the game workspace (`yarn workspace game-web run build`) so both `.next` directories exist for deployment. When the missing lockfile blocks Yarn, run `node apps/game-web/node_modules/.bin/next build` and `node apps/admin/node_modules/.bin/next build`, then attach the Yarn error output for continuity.
- **Admin build** — Use `yarn build:admin` when you need to compile the admin panel (`apps/admin`).
- **Game build** — Use `yarn build:game` for a focused game workspace rebuild.
- **Turbo aggregate** — `yarn build:turbo` retains the original `turbo run build` orchestration for multi-app rebuilds when you need every workspace’s pipeline.
- Keep `.yarnrc.yml`'s `nodeLinker: node-modules` setting in sync with production expectations so Yarn respects the existing `no
  de_modules` layout during offline work.
- Document Yarn/Corepack proxy incidents (including telemetry warnings and Corepack's Yarn 4 bootstrap) in the Settings log so 
  future operators understand the mitigation path.

## Yarn workspace workflow

- **Node runtime** — Vercel requires `node 22.x`; mirror that version locally and in CI before running the Yarn commands below.
- **Install dependencies** — Run `yarn install` from the repository root. In proxy-restricted environments this may surface `40
  3` responses; capture those logs so networking teams can allow the registry or provide an approved mirror. Until a Yarn lockfi
  le can be generated those failures will block `yarn build`; rely on the workspace Next.js binaries (for example `node apps/gam
  e-web/node_modules/.bin/next build`) for smoke checks and keep the proxy errors attached for follow-up.
- **Primary build** — `yarn build` executes `turbo run build --filter=game-web --filter=esx-admin-control-panel-map` so both apps compile together. When the missing lockfile blocks Yarn, run `node apps/game-web/node_modules/.bin/next build` and `node apps/admin/node_modules/.bin/next build`, then attach the Yarn error output for continuity.
- **Admin build** — Use `yarn build:admin` when you need to compile the admin panel (`apps/admin`).
- **Turbo aggregate** — `yarn build:turbo` retains the original `turbo run build` orchestration for multi-app rebuilds when you need every workspace’s pipeline.
- Keep `.yarnrc.yml`'s `nodeLinker: node-modules` setting in sync with production expectations so Yarn respects the existing `no
  de_modules` layout during offline work.
- Document Yarn/Corepack proxy incidents (including telemetry warnings and Corepack's Yarn 4 bootstrap) in the Settings log so 
  future operators understand the mitigation path.

## Yarn workspace workflow

- **Node runtime** — Vercel requires `node 22.x`; mirror that version locally and in CI before running the Yarn commands below.
- **Install dependencies** — Run `yarn install` from the repository root. In proxy-restricted environments this may surface `40
  3` responses; capture those logs so networking teams can allow the registry or provide an approved mirror. Until a Yarn lockfi
  le can be generated those failures will block `yarn build`; rely on the workspace Next.js binaries (for example `node apps/gam
  e-web/node_modules/.bin/next build`) for smoke checks and keep the proxy errors attached for follow-up.
- **Primary build** — `yarn build` delegates to `yarn workspace game-web run build`. When the missing lockfile blocks Yarn, execute `node apps/game-web/node_modules/.bin/next build` and attach the Yarn error output for continuity.
- **Admin build** — Use `yarn build:admin` when you need to compile the admin panel (`apps/admin`).
- **Turbo aggregate** — `yarn build:turbo` retains the original `turbo run build` orchestration for multi-app rebuilds.
- Keep `.yarnrc.yml`'s `nodeLinker: node-modules` setting in sync with production expectations so Yarn respects the existing `no
  de_modules` layout during offline work.
- Document Yarn/Corepack proxy incidents (including telemetry warnings and Corepack's Yarn 4 bootstrap) in the Settings log so 
  future operators understand the mitigation path.

## Yarn workspace workflow

- **Node runtime** — Vercel requires `node 22.x`; mirror that version locally and in CI before running the Yarn commands below.
- **Install dependencies** — Run `yarn install` from the repository root. In proxy-restricted environments this may surface `40
  3` responses; capture those logs so networking teams can allow the registry or provide an approved mirror. Until a Yarn lockfi
  le can be generated those failures will block `yarn build`; rely on the workspace Next.js binaries (for example `node apps/gam
  e-web/node_modules/.bin/next build`) for smoke checks and keep the proxy errors attached for follow-up.
- **Primary build** — `yarn build` delegates to `yarn workspace game-web run build`. When the missing lockfile blocks Yarn, execute `node apps/game-web/node_modules/.bin/next build` and attach the Yarn error output for continuity.
- **Admin build** — Use `yarn build:admin` when you need to compile the admin panel (`apps/admin`).
- **Turbo aggregate** — `yarn build:turbo` retains the original `turbo run build` orchestration for multi-app rebuilds.
- Keep `.yarnrc.yml`'s `nodeLinker: node-modules` setting in sync with production expectations so Yarn respects the existing `no
  de_modules` layout during offline work.
- Document Yarn/Corepack proxy incidents (including telemetry warnings and Corepack's Yarn 4 bootstrap) in the Settings log so 
  future operators understand the mitigation path.

## Offline pnpm workflow

- **Primary build** — `npm run build` now calls `node tools/offline-pnpm.mjs --filter game-web build`, ensuring the proxy never
  interferes with pnpm downloads. The shim executes the existing Next.js binaries from `node_modules/.bin` and mirrors pnpm's
  `--filter` semantics for the `game-web` workspace.
- **Standard checkups** — `npm run build:standard` still runs `pnpm --filter game-web build` so operators can purposely exercise
  the Corepack path when debugging the proxy tunnel. Expect it to fail in restricted environments; keep the logs for reference.
- **Turbo aggregate** — `npm run build:turbo` retains the original `turbo run build` orchestration should you need to build both
  apps locally without the shim.
- Ensure dependencies are installed locally (`npm install` or mirror the existing `node_modules`) so the offline shim can locate
  `next` inside `node_modules/.bin`.
- Update `tools/offline-pnpm.mjs` whenever workspace commands change so the shim continues to track Next.js entry points without
  touching Corepack.

Files included (drop into your Next.js project or use as reference):

/components
  - DevicesList.jsx            // Updated device list with up/down, full-row select, thumbnail, inline editor with Trigger ticker & target dropdown
  - InlineMissionResponses.jsx // Updated mission response editor with "Mark as Trigger" switch and preview badge
  - MissionListItem.jsx        // Small mission list item that displays response marker and thumbnail

AppDemo.jsx                   // Simple demo usage of components (not part of your app; for reference)

How to use:
- Copy files into your project's components/ folder.
- Import DevicesList where you render the Device sidebar.
  Example: import DevicesList from '../components/DevicesList'
- Import InlineMissionResponses where you manage mission editor responses.
  Example: import InlineMissionResponses from '../components/InlineMissionResponses'

Notes:
- The components are intentionally self-contained and use inline styles for easy drop-in.
- They expect the parent to handle persistence (saving to missions.json/config).
- The 'Trigger Target' dropdown uses a `triggerDevices` prop; if empty it shows 'None available'.
- The DevicesList inline editor provides a 'Triggered Device (ticker)' input per your request.

If you want, I can:
- Integrate these components into your actual pages/index.jsx and wire up your existing state/handlers.
- Convert styles to your project's theme or CSS modules.
- Add accessible keyboard support for reordering and selection.

## Supabase Lookup Cheatsheet

- **Games & Configs**
  - Slugs are generated automatically as `<title-slug>-<seed>` (example: `escape-ride-a1b2c3`) and stored in `games.slug` plus each `config.game.slug` payload.
  - Mission IDs auto-increment from `m01`, `m02`, … while device IDs start at `d01`, `d02`, … so Supabase JSON lookups stay predictable.
  - Publishing protection uses `config.game.deployEnabled`. When `true`, the admin shows “🟢 Protected” and blocks edits; when `false`, the admin shows “🔴 Editing unlocked”.

- **Media Pool (Supabase Storage `media` bucket)**
  - Objects save under `mediapool/<Category>/...` with tags noting the type (e.g., `image`, `audio`), folder (`folder:mediapool-images-icons`), and a `slug:<type>-<folder>-<filename>` identifier.
  - API responses surface `supabase.bucket` and `supabase.path` so deletions and mission/device bindings can recall the exact asset.
  - Dashboard deletions remove the Supabase object (when available) and prune the manifest entry so Assigned Media updates immediately.

- **Editors & Assigned Media**
  - Media Pool cards show the slug plus up to six tags for quick verification (icons vs. covers vs. mission pins, etc.).
  - The upload destination dropdown feeds the folder-derived tagging logic—choose the closest match (Images → Icons, Audio, Video, etc.) for accurate slugging.
