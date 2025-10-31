# Toolchain Drop-in (Node 22 + Yarn 4) — 2025-10-28T00:00:00.000Z

Place **all files** at the **repo root** (same folder as `turbo.json`).

Files included:
- `.npmrc` — hardened registry/timeouts and engine strictness
- `.nvmrc` — pins Node 22.11.0
- `package.json` (root) — adds engines, packageManager, Volta pins, and `vercel:info`
- `tools/vercel-info.mjs` — prints Node/Corepack/Yarn during build (non-fatal if Node 22)

## Vercel settings (both Admin & Game projects)
Install Command:
```
yarn install --immutable
```
Env vars:
```
NPM_CONFIG_REGISTRY = https://registry.npmjs.org/
NODE_OPTIONS        = --dns-result-order=ipv4first
```
Node.js Version: **22.x (Latest LTS)**
Root Directory:
- Admin → `apps/admin`
- Game  → `apps/game-web`

Then Redeploy with **Clear build cache**.

## One code fix to apply in your repo
Open `apps/admin/pages/index.jsx` and change the ref lines:
```diff
- if (pnpmShimLoggedRef.current) return;
+ if (initialConversationLoggedRef.current) return;

...

- pnpmShimLoggedRef.current = true;
+ initialConversationLoggedRef.current = true;
```
