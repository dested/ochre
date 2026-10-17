# ochre — Decisions

> Append-only log of choices with rejected alternatives. Never reverse one silently — add a superseding entry.

## 2026-10-07 — Optional Electron desktop surface (`apps/desktop`), first fork sal-git

**Why:** desktop tools (sal-git first, later sal-agent's app) should start from the same template as everything else: same tokens, same tRPC, same scripts. Electron because its main process is Node, so the whole app stays TypeScript. electron-vite 5 (Vite 6, like web) builds main/preload/renderer; electron-builder `--dir` only (no installer, no auto-update). `project.json` `surfaces` now says what a fork has, instead of inferring it from the filesystem; `--desktop-only` forks drop web, mobile and Drydock.
**Rejected:** Tauri (Rust backend, outside the stack), a separate desktop template (two templates drift), an installer + auto-update (Sal pins the exe).

## 2026-10-07 — tRPC over Electron IPC with our own link (`packages/trpc-ipc`)

**Why:** ~250 lines we own: `createIpcHandler` dispatches through `callProcedure`/`getErrorShape` (what tRPC's adapters use; the catalog keeps tRPC pinned exactly), tracks subscriptions per webContents and returns their iterators on stop, abort, navigation or destroy; the preload exposes `{ send, onMessage }` only; `ipcLink` maps AbortSignal to `cancel` and unsubscribe to `subscription.stop`. Round trips are tested over a fake ipc pair with structured clone.
**Rejected:** `electron-trpc` 0.7.1 (Dec 2024) and `trpc-electron` 0.1.2 (Jan 2025): both stale against tRPC 11.19.

## 2026-10-07 — No superjson over IPC; identity `ipcTransformer` for types

**Why:** Electron IPC is structured clone, which already carries Date, Map, Set and typed arrays; superjson would only burn CPU on big payloads. But a router without a transformer makes tRPC type outputs as JSON (`Date` → `string`), so the desktop router uses `ipcTransformer`, an identity serialize/deserialize that only flips tRPC's types. Any HTTP link to a web server keeps superjson.
**Rejected:** superjson on the IPC link (wasted work), no transformer (types lie about Dates).

## 2026-10-07 — No database for desktop-only apps

**Why:** a desktop tool that won't open while Postgres is down is worse than one with a settings file. Desktop-only forks have no Prisma, no auth, no `.env` secrets; app state is a JSON file under `data/.private/`. A desktop app that needs shared data talks to its web app's tRPC, which owns Postgres. Precedent: sal-agent.
**Rejected:** Postgres + Prisma in every surface (couples a local tool to a running server), SQLite (a second database technology).

## 2026-10-07 — `apps/mobile` pins `lru-cache` 5.1.1; init re-resolves the lock only when mobile goes

**Why:** with the hoisted linker, Bun puts one `lru-cache` at the root and its nested `@babel/helper-compilation-targets` copies (under preset-env plugins) get no `lru-cache` of their own. When a resolve hoists v11, those copies load it and Metro fails: `_lruCache is not a constructor`. A fresh `--mobile` fork hit it after `init` re-resolved the lock. A direct `lru-cache@5.1.1` devDependency in `apps/mobile` keeps v5 at the root; v11 users (path-scurry) get nested copies. `init` also stopped re-resolving the lock unless mobile is dropped.
**Rejected:** root `overrides` (forces v5 on everything that needs v11), the isolated linker (Metro/autolinking, see above).

## 2026-10-07 — Design tokens move to `packages/tokens` (`@app/tokens`)

**Why:** a desktop-only fork deletes `apps/web`, which used to own `tokens.css`. Web and desktop import it from `app.css`, mobile from `global.css`, all as `@app/tokens/tokens.css`; `tokens.test.ts` moved with it.
**Rejected:** copying tokens into desktop (drift), keeping `@app/web` as a desktop dependency (web is deleted there).

## 2026-10-02 — Mobile lives in ochre as an optional `apps/mobile` (monorepo, option b)

**Why:** one template, one sync story: `init` keeps or drops the app, `add:mobile` restores it from upstream, `sync` merges both. Web-only forks pay nothing at runtime (the Expo tree is pruned from their lockfile). The single-package template is tagged `v1-single` for clones that never move.
**Rejected:** a separate `sal-expo-starter` repo (two templates drift, every fix lands twice), mobile always present (web-only forks carry ~900 unused packages and a Metro dev server).

## 2026-10-02 — Expo Router is the one file-based router (exception to rule #3)

**Why:** Expo Router is how Expo does navigation, typed routes and deep links; fighting it with an explicit React Navigation tree costs more than the rule saves. To keep "routes are data you can read", route files are one-line re-exports of `src/screens/*`, groups are `(auth)`/`(app)` only, and guards are `Stack.Protected` in `_layout.tsx` (CLAUDE.md rule #23). Web stays on explicit `RouteObject[]`.
**Rejected:** plain React Navigation (loses typed routes and the Expo defaults), file-based routing on web too (rule #3 stands there).

## 2026-10-02 — Bun hoisted linker for the workspace

**Why:** Metro and React Native's native tooling (autolinking, CocoaPods scripts) expect a flat `node_modules`. `bunfig.toml` sets `linker = "hoisted"`; one React copy is checked with `bun pm why react`.
**Rejected:** Bun's isolated linker (Metro resolution and autolinking break on symlinked layouts), a hand-written Metro `watchFolders`/`nodeModulesPaths` config to compensate (rule #21).

## 2026-10-02 — NativeWind 5 rc on Tailwind 4.1.12

**Why:** NativeWind 5 is the only NativeWind that speaks Tailwind v4, so web and mobile share one token file and one class vocabulary. It's an rc: `nativewind` 5.0.0-rc.0 and `react-native-css` 3.1.0-rc.0 are pinned exactly, Tailwind is held at 4.1.12 and `lightningcss` at 1.30.1 (root `overrides`) because newer ones break its compiler. Revisit at NativeWind 5 GA.
**Rejected:** NativeWind 4 (Tailwind v3 only, so two token systems), plain `StyleSheet` (no shared tokens), Tamagui / Unistyles (a second styling language).

## 2026-10-02 — Native dark mode via a `@media native` block in tokens.css

**Why:** web toggles `.dark` on `<html>`; native has no `<html>`. NativeWind reads `@media (prefers-color-scheme: dark)` but `.dark` never matches on native and `.dark:root` throws. So tokens.css carries the dark values twice, and `tokens.test.ts` asserts both copies match.
**Rejected:** a JS theme provider on mobile (hydration-free here, but a second source of truth), mobile without dark mode.

## 2026-10-02 — Prisma `prisma-client` generator, output in `apps/web/server/generated`

**Why:** the old `prisma-client-js` writes into `node_modules/.prisma`, which a hoisted workspace shares across apps; the new generator emits plain TS next to the server code. Gitignored, regenerated on install. Prisma pinned `~7.10.0` (the CLI's `latest` is the 8.0 RC).
**Rejected:** keeping `prisma-client-js` (deprecated path, shared-`node_modules` collisions).

## 2026-10-02 — TypeScript 7 `tsc` replaces `tsgo`

**Why:** TypeScript 7 is the native compiler, released; the `@typescript/native-preview` dev dependency is gone. One `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`) is extended by every workspace; `bun run typecheck` runs the root and fans out. Expo's install check excludes `typescript` (it still recommends 5.x).
**Rejected:** staying on the preview package, letting `expo install` downgrade TypeScript.

## 2026-10-02 — `project.json` is the single identity file

**Why:** name, display name, scheme, bundle id, API/Metro ports, db name, EAS project id and Apple team id were otherwise smeared across a dozen files. `init` writes it, `app.config.ts` and `scripts/*` validate it with zod, the server reads its port. `.gitattributes` (`merge=ours`) keeps a fork's copy through `sync`.
**Rejected:** `.env` for identity (not committed, not readable by `app.config.ts` on EAS), `app.json` (mobile only).

## 2026-10-02 — No `packages/api`; mobile imports `AppRouter` from `@app/web/router` as a type

**Why:** the server is the web app; splitting it into a package now adds a build boundary for a single consumer. `@app/web` exports `./router` and `./tokens.css`, and mobile may only `import type` / CSS-import them (rule #17). Shared runtime code gets a `packages/shared` when a second consumer exists.
**Rejected:** `packages/api` + `packages/db` (Turborepo-style split; more wiring than product), duplicating router types.

## 2026-10-02 — Web-only forks regenerate `bun.lock`; `sync` keeps the fork's lock

**Why:** `@better-auth/expo` (a web dependency) has optional `expo-*` peers, and Bun keeps resolved optional peers in the lockfile once present. Deleting `apps/mobile` left 1447 lock entries vs 540 from a fresh resolve, and a textual merge on `sync` re-imports them. `init` deletes the lock and reinstalls; `sync` restores `HEAD:bun.lock` and lets `bun install` fold upstream's `package.json` changes in.
**Rejected:** committing the full lock to web-only forks (installs the Expo/Metro tree for nothing), a `trustedDependencies`/override hack (peers still resolve).

## 2026-10-02 — Deploy on Drydock (root `drydock.yaml`), not Render

**Why:** the owner deploys on Drydock. A pre-committed root `drydock.yaml` (`kind: ssr`, `runtime: bun`, `rootDir: apps/web`, `predeploy: bunx prisma migrate deploy`) is the seed every fork inherits; `.gitattributes` marks it `merge=ours` because Drydock rewrites it per project. `predeploy` overrides Drydock's `db push --accept-data-loss` default. `start` has no `--env-file`: prod env comes from Drydock. **Unverified:** Drydock's SSR Dockerfile generator copies `apps/web/bun.lock`, which doesn't exist in a Bun workspace, so a deploy fails until Drydock gets its workspace-aware fix (separate task, owner deferred). The template repo itself is never wired to Drydock.
**Rejected:** keeping `render.yaml` (not the owner's platform), letting Drydock default to `db push` (drops hand-written SQL).

## 2026-09-29 — Dev port from `PORT`, default 4080, unique per project

**Why:** 3000 collides with every other Node project on the machine. `PORT` is zod-validated in `server/env.ts` (default 4080) and `BETTER_AUTH_URL` follows it; `bun run init` derives a per-project port from the name (or `--port`) and rewrites 4080 so clones never share one.
**Rejected:** portless by default (overhead; opt-in only when a stable https origin is needed), a random port per boot (unbookmarkable, breaks auth URLs).

## 2026-09-29 — superjson on the tRPC wire AND the SSR state

**Why:** procedures should return real `Date`s. The transformer alone isn't enough: the dehydrated React Query cache is inlined into the HTML, and `JSON.stringify` there turns Dates back into strings on first client render. `src/lib/ssr-state.ts` routes that payload through superjson too. Supersedes the "return ISO strings" convention.
**Rejected:** ISO strings by convention (every consumer re-parses; easy to forget), TanStack's `dehydrate.serializeData` hook (same result, but splits the serialization across two config sites).

## 2026-09-29 — `prisma migrate`, never `db push`

**Why:** `db push` drops anything Prisma doesn't model (FTS indexes, triggers, exclusion constraints) and needs `--accept-data-loss` on deploy. Committed migrations run identically in dev (`migrate dev`), e2e (global-setup `migrate deploy`) and Render (`preDeployCommand: migrate deploy`); raw SQL lives in migration files.
**Rejected:** keeping `db push` for dev only (dev and prod schemas drift), a separate SQL runner for extensions/triggers (two sources of truth).

## 2026-09-29 — `noUncheckedIndexedAccess` and zero casts

**Why:** type safety is the guardrail on generated code. Index access is `T | undefined`; the template itself has no `any`/`as` casts (React Router's `any` loader context is narrowed by `isSsrContext`). `tsconfig` includes e2e/scripts/configs so they're checked too.
**Rejected:** a lint rule instead of compiler flags (no linter in the template; tsgo is the gate).

## 2026-09-11 — Stylesheet is a `<link>` in `index.html`, not a JS import

**Why:** importing `app.css` from `App.tsx` made Vite inject it after the client module graph loaded, so every dev load painted unstyled SSR HTML first. A head `<link>` is render-blocking in dev (Vite serves compiled CSS, HMR swaps the href) and gets hashed into `<head>` by `vite build`. Zero server code.
**Rejected:** collecting CSS from `vite.moduleGraph` in `server.ts` and inlining `<style data-vite-dev-id>` (works, but ~30 lines of dev-only plumbing for the same result).

## 2026-09-11 — Dark mode: `.dark` class + inline pre-paint script + `dark:` markup swaps

**Why:** the tokens already existed under `.dark`; an inline `<head>` script (stored choice → `prefers-color-scheme`) applies the class before first paint, and components render both variants and hide one with `dark:` so SSR and client markup are identical. Binary toggle persisted in `localStorage.theme`; absence means "follow the OS" (tracked live by `followSystemTheme`).
**Rejected:** media-query-only dark mode (no user override); React state / context for the theme (hydration mismatch or a post-mount icon flip); a system/light/dark tri-state (needs a dropdown → radix Slot dependency the template deliberately avoids).

## 2026-09-11 — Vite HMR websocket shares the Express `http.Server`

**Why:** the fixed `hmr.port: 24678` collided whenever two clones of this template ran at once (HMR silently connected to the wrong server and got a 400). `hmr: { server }` means one port, and it survives reverse proxies.
**Rejected:** `PORT + 1` (still a second port; breaks behind proxies), `hmr.port: 0` (Vite does not pick a free port in middleware mode).

## 2026-09-11 — Client-nav loaders prefetch through lazy browser singletons

**Why:** `getBrowserClients()` in `src/lib/trpc.tsx` gives loaders the same `QueryClient` + tRPC options proxy the app renders with, so `dashboardLoader` can `await prefetchQuery` on client navigation — no "Loading…" flash. Lazy so the shared `routes.tsx` allocates nothing during SSR.
**Rejected:** fire-and-forget prefetch (still flickers), creating the clients in `routes.tsx` at module scope (runs on the server too).

## 2026-10-04 — EAS from `apps/mobile` with the whole repo uploaded; LF line endings; instant OTA

**Why:** Store Brand (cloned from this starter's shape) lost its first EAS attempts to project-root mistakes. Sal's first `eas build` ran at the repo root: eas-cli created a stray project @quickgame/bland with a root `app.json`/`eas.json` and never produced a build. The first errored build on record, c24ca4eb (#3), ran with `EAS_NO_VCS=1`, so the archive root was `app/` alone (302 KB) and Metro failed in Bundle JavaScript: `ENOENT … stat '/Users/expo/workingdir/packages'`; rebuilt with `EAS_PROJECT_ROOT` at the repo root (31.7 MB) it passed (ff10310e, #4). Its first EAS Update also missed: the fingerprint hashed a CRLF file locally and LF on EAS. So: `eas` runs only in `apps/mobile` (git mode uploads the workspace), `EAS_NO_VCS` always pairs with `EAS_PROJECT_ROOT=../..`, and `* text=auto eol=lf` keeps fingerprints equal across Windows and EAS. The bun/node pins match the pair proven on EAS for SDK 57 (bun 1.3.10, node 22.22.2). OTA applies at once (`src/lib/ota.ts`: launch + foreground, fetch, reload) because a fix should reach players today, not on their second cold start.
**Rejected:** a root `eas.json` (makes the root an Expo project), Expo's default apply-on-next-launch (a fix waits a full cold start), `fallbackToCacheTimeout` > 0 (launch blocks on the network).
