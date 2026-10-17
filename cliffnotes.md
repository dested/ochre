# ochre — CliffNotes

> Living map of the project. Read this before any coding session.
> Last updated: 2026-10-17 (overnight build in progress). Design → `plans/2026-10-17-ochre-design.md` · run plan + Ledger → `plans/2026-10-17-ochre-overnight.md` · contracts → `apps/web/src/game/contracts.ts` · plumbing briefing → `CLAUDE.md`.

## What this is

**OCHRE**: a web-based, stylized painterly 3D life simulator. You live one human life on the southern Cape coast of
South Africa about 80,000 years ago, in five stages (Held, Small, Coming of age, Provider, Elder), each with its own
body, camera and verbs; then you continue as your child. Knowledge is learned by watching, every mechanic is grounded
in real archaeology, and Field Notes explain the evidence. Built on sal-starter (`apps/web`: Express 5 + Vite SSR,
React Router 7, tRPC, Prisma 7, Tailwind 4); the game itself is imperative three.js under a React overlay.

**Paths below are relative to `apps/web/`** unless they start with `plans/`, `apps/`, `packages/` or `scripts/`.

## Quick Reference

- **Dev:** `bun run dev` → http://localhost:4080 (the game at `/`, labs at `/lab/world`, `/lab/people`, `/lab/sim`, `/lab/ui`, `/lab/play`; add `?stats=1` for fps · draw calls · triangles)
- **Live:** https://ochre.dested.com (Drydock project `ochre`, deploys on push to `main`; repo `github.com/dested/ochre`, private)
- **Ports:** API **4080** (web + `/api/*`). Never 3000/3001/5173/5174/8000/8080/4200/5000
- **Installs: bun 1.3.14 only** (`/w/junk/sim-80k/bun13/bun-linux-x64/bun install`). Local bun 1.4 rewrites `bun.lock` to v2, which Drydock's bun 1.3 image can't read
- **Type-check:** `bun run typecheck` · **Tests:** `bun run test` (sim and world-gen tests: `cd apps/web && bun test src/sim src/world-gen`)
- **Headless sim day:** `bun apps/web/src/sim/run-day.ts --seed 1 --days 2`
- **Images:** GPT Image 2.5 Flare via the `openai-image` skill; key `OPENAI_API_KEY` in the root `.env` (keys vault, project `sim-80k`). The org's credit ran out on 2026-10-17 after 47 images; top up before generating more
- **Units/axes:** metres, +Y up, +X east, +Z south (the sea is south); heading 0 faces +Z, π/2 faces +X
- **Health:** `GET /healthz`
- **Frozen QA build (overnight run):** a production build of a fixed sha on http://localhost:4090 (`/w/junk/sim-80k/qa-server`, rebuilt by `/w/junk/sim-80k/lead/rebuild-qa.sh`); `?qa` exposes the play session's QA handles in production builds
- **Perf numbers:** report draw calls and triangles; fps from bx (Intel UHD 770 iGPU, ~10 fps on high) says nothing about a real GPU. `?gpu=1` in the world lab times each render stage

## The game: module map

| Module | Path | Owner (overnight) | What |
| --- | --- | --- | --- |
| Contracts | `src/game/contracts.ts` | lead | every cross-module type + factory signature, `REQUIRED_POIS`, `FIELD_NOTE_IDS` |
| Bridge | `src/game/bridge.ts` | lead | game ⇄ UI store (`bridge.set`, `useBridge`, `bridge.actions`, `bridge.provide`) |
| Host | `src/game/engine/host.ts` | lead | the one WebGLRenderer per page, frame loop, resize, `?stats=1` line |
| Core | `src/core/clock.ts`, `src/core/rng.ts` | lead | sun/moon at 34° S, moon phase, spring/neap tides; mulberry32 `Rng`, `mix32` |
| World-gen | `src/world-gen/` | world | three-free heightfield, surfaces, POIs, tide → `WorldData` |
| Render | `src/game/render/` | world | painted-light post chain (`RenderPipeline`), `paint()` material patch |
| World view | `src/game/world/` | world | terrain, sea, sky, foliage, cave, fires, weather (`WorldView`) |
| Actors | `src/game/actors/` | people | procedural people (infant → elder) and animals, procedural animation |
| Sim | `src/sim/` | sim | three-free clock driving, band, needs, watch-to-learn, AI, animals, food/fire, director + chapters, save |
| Play | `src/game/play/`, `src/app/play.tsx` | play | the session at `/`: composition, controller, cameras, verbs, spear, events → bridge |
| UI | `src/ui/`, `src/content/field-notes.ts`, `public/art/` | ui | title, intro, HUD, captions, chapter cards, Field Notes, lineage, minigames |
| Audio | `src/game/audio/` | play | procedural WebAudio ambience, sfx, music cues |
| Labs | `src/app/lab/*.tsx` → module `lab.ts` `mount(el)` via `src/app/client-mount.tsx` | each owner | per-module sample pages |
| Concept art | `public/art/concept/` | lead | the visual targets (world, people) |


## Stack

| Layer              | Choice                          | Notes                                                                                        |
| ------------------ | ------------------------------- | -------------------------------------------------------------------------------------------- |
| Runtime / pkg mgr  | Bun ≥ 1.3, workspaces           | root `bun.lock`, hoisted linker, shared pins in the root `catalog`                           |
| Server             | **Express 5** + Vite SSR        | required for `*splat` route wildcards                                                        |
| Routing            | React Router 7                  | `createBrowserRouter` (client) / `createStaticHandler` (server); explicit `RouteObject[]`    |
| State / data       | TanStack Query + tRPC v11       | `@trpc/tanstack-react-query` (`.queryOptions()`); **superjson** on the wire and in SSR state |
| Validation         | zod 4                           | env, tRPC inputs                                                                             |
| API                | tRPC, Express mounts            | `/api/trpc`, `/api/auth/*`, `/healthz`                                                       |
| Database / ORM     | Postgres + Prisma 7             | `pg` driver adapter (`@prisma/adapter-pg`); `prisma migrate`, committed migrations           |
| Auth               | better-auth                     | email + password, autoSignIn                                                                 |
| Styling            | Tailwind v4 + shadcn (new-york) | CSS-first, oklch tokens; see `ui.md`                                                         |
| Tests              | Playwright + `bun:test`         | `e2e/` + committed `__screenshots__` baselines; unit `*.test.ts`                             |
| Types              | TypeScript 7 `tsc`              | `tsconfig.base.json` shared by every workspace                                               |
| Deploy             | Drydock (`drydock.yaml`)        | `rootDir: apps/web`; unverified until Drydock's workspace fix                                |
| Mobile (optional)  | Expo SDK 57, RN 0.86, Router    | dev client only; NativeWind 5 rc; better-auth Expo plugin; EAS for distribution              |
| Desktop (optional) | Electron 44, electron-vite 5    | tRPC over IPC (`@app/trpc-ipc`), no superjson, no DB; electron-builder `--dir` releases      |

## Directory structure

```
project.json             per-project identity (name, scheme, bundleId, appId, surfaces, apiPort, metroPort, desktopPort, db, easProjectId, appleTeamId)
package.json             workspace root: catalog, overrides (lightningcss), proxy scripts
bunfig.toml              linker = "hoisted"
tsconfig.base.json       shared strict compiler options
drydock.yaml             deploy seed (merge=ours with project.json, see .gitattributes)
scripts/
├── init.ts              clone → rename, project.json, per-project ports, drops unwanted surfaces (own commit)
├── sync.ts              merge upstream/main without committing; keeps identity, lockfile, dropped surfaces dropped
├── add-surface.ts       `add:mobile` / `add:desktop`: copy a surface from upstream, restore its root scripts, commit
├── dev.ts               runs web + Metro (APP_VARIANT=development) + electron-vite, whichever exist
├── project.ts           zod schema for project.json, SURFACE_PATHS, SURFACE_SCRIPTS, legacy-fork migration
└── shell.ts             git/run/fail helpers
apps/mobile/             @app/mobile (optional; see Mobile below)
apps/desktop/            @app/desktop (optional; see Desktop below)
packages/tokens/         @app/tokens: tokens.css (oklch, light/.dark/native dark) + tokens.test.ts, used by every app
packages/trpc-ipc/       @app/trpc-ipc: tRPC v11 over Electron IPC (main / preload / renderer entries + tests)
packages/native-example/ @app/native-example: Swift module + typed config plugin (plugin/build committed)

apps/web/                @app/web, the tree below
server.ts                Express entry: request logging, /healthz, auth + tRPC mounts,
                         vite (dev) / static+SSR (prod), startup banner. Dev AND prod.
server/
├── env.ts               zod-validated env (PORT, DATABASE_URL, BETTER_AUTH_*), parsed at import (throws → no boot)
├── logger.ts            ANSI request logger, startup banner, formatError
├── prisma.ts            PrismaClient singleton (HMR-safe) via pg adapter
├── auth.ts              better-auth instance + Session type
├── trpc.ts              createContext + initTRPC + public/protectedProcedure
├── router.ts            appRouter (me, posts.list, posts.create) + AppRouter type (exported as @app/web/router)
└── generated/prisma/    prisma-client generator output (gitignored)
src/
├── index.tsx            client entry — hydrateRoot + createBrowserRouter
├── entry-server.tsx     SSR entry — createStaticHandler.query + renderToString, returns {html,status,ssrState}
├── App.tsx              providers: QueryClientProvider + HydrationBoundary + TRPCProvider
├── app/
│   ├── routes.tsx       RouteObject[] tree + loaders (root/dashboard/redirectIfSignedIn)
│   ├── layout.tsx       nav + <Outlet/>; sign-out lives here
│   ├── error-boundary.tsx  root ErrorBoundary → 404 / error UI
│   ├── play.tsx         / (the game)
│   ├── lab/             /lab/* sample pages (one per module)
│   ├── client-mount.tsx client-only dynamic mount for imperative three modules
│   ├── sign-in.tsx      /sign-in
│   ├── sign-up.tsx      /sign-up
│   └── dashboard.tsx    /dashboard (protected; posts list + create form)
├── components/
│   ├── theme-toggle.tsx light/dark toggle (nav); icons swapped via `dark:` so SSR markup matches
│   └── ui/              shadcn primitives (button, card, input, label)
├── lib/
│   ├── auth-client.ts   better-auth React client
│   ├── theme.ts         theme state — applyTheme/setTheme/toggleTheme/followSystemTheme (mirrors index.html script)
│   ├── trpc.tsx         TRPCProvider + useTRPC + getBrowserClients() (lazy browser QueryClient/tRPC singletons)
│   ├── ssr-state.ts     superjson (de)serialize of the dehydrated cache (+ ssr-state.test.ts)
│   └── utils.ts         cn()
└── styles/
    └── app.css          Tailwind v4 import + @app/tokens/tokens.css + custom variant/base layer
public/                  favicon.svg, robots.txt (served by vite dev / express static prod)
e2e/                     smoke.spec.ts, global-setup.ts (migrate deploy + truncate), db.ts (test DB URL), __screenshots__/
index.html               SSR template — stylesheet <link>, pre-paint theme script, <!--app-html--> + <!--app-state-->
prisma/schema.prisma     User / Session / Account / Verification + Post
prisma/migrations/       committed migrations (init + everything after); raw SQL lives here
prisma.config.ts         Prisma 7 CLI config; loads the root .env itself (Bun/Prisma don't)
```

```
apps/mobile/
├── app.config.ts        reads ../../project.json (zod); APP_VARIANT → name/bundle id/scheme; plugins; fingerprint runtimeVersion
├── eas.json             development / preview / production profiles, channels of the same names (bun 1.3.10 + node 22.22.2 pinned)
├── metro.config.js      withNativewind(getDefaultConfig(__dirname)), nothing else
├── global.css           tailwind layers + nativewind/theme + @app/tokens/tokens.css
├── modules/app-native/  local Expo module (Swift nativeHello)
└── src/
    ├── app/             Expo Router: _layout (providers, splash, Stack.Protected), (auth)/, (app)/ — one-line re-exports
    ├── screens/         sign-in, sign-up, home (posts + native examples + fingerprint row)
    ├── components/ui/   button, card, input, label (cva, mirrors web)
    ├── lib/             api-url, auth-client (expoClient + SecureStore), trpc, query-rn, app-config, ota, utils
    └── env.ts           zod over EXPO_PUBLIC_API_URL
```

```
apps/desktop/
├── electron.vite.config.ts  main/preload/renderer builds; __DATA_DIR__; renderer port = desktopPort; CSP plugin
├── scripts/release.ts       electron-builder --dir from project.json (appId, displayName) → <repo>/release
└── src/
    ├── main/            index.ts (lifecycle, pinned paths, single instance, window, IPC handler), router.ts (+ test),
    │                    launches.ts (second-instance argv hub), window-state.ts (bounds), env.d.ts
    ├── preload/         index.ts: exposeTrpcIpc() only (built as CJS for the sandbox)
    └── renderer/        index.html (CSP meta, stylesheet link), src/{main.tsx, App.tsx (demo), lib/{trpc,theme,utils}.ts,
                         components/ui/ (button, card, input, label mirrored from web), styles/app.css}
```

## File map (concept → path)

| Concept / task                    | Location                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| App providers                     | `src/App.tsx`                                                                            |
| Routing + loaders                 | `src/app/routes.tsx`                                                                     |
| New page component                | `src/app/<name>.tsx`                                                                     |
| 404 / error UI                    | `src/app/error-boundary.tsx`                                                             |
| tRPC procedures                   | `server/router.ts`                                                                       |
| tRPC context / procedure builders | `server/trpc.ts`                                                                         |
| DB schema                         | `prisma/schema.prisma`                                                                   |
| Migrations / raw SQL              | `prisma/migrations/` (see CLAUDE.md "Raw SQL in a migration")                            |
| SSR state (superjson)             | `src/lib/ssr-state.ts`                                                                   |
| Auth config                       | `server/auth.ts` (server) · `src/lib/auth-client.ts` (client)                            |
| HTTP mounts / SSR / 404 logic     | `server.ts`                                                                              |
| Logging                           | `server/logger.ts`                                                                       |
| Env vars / dev port               | `server/env.ts` + `.env.example` (root) + `project.json`                                 |
| Project identity / ports          | `project.json` (read by `scripts/project.ts`, `app.config.ts`)                           |
| Design tokens (all apps)          | `packages/tokens/tokens.css` (see `ui.md`)                                               |
| Desktop main / router             | `apps/desktop/src/main/{index,router}.ts`                                                |
| tRPC over IPC                     | `packages/trpc-ipc/src/{main,preload,renderer,protocol}.ts`                              |
| Mobile screens / routes           | `apps/mobile/src/screens/` · `apps/mobile/src/app/`                                      |
| Mobile API base URL               | `apps/mobile/src/lib/api-url.ts`                                                         |
| Mobile native config              | `apps/mobile/app.config.ts` · config plugins                                             |
| Swift code                        | `apps/mobile/modules/<name>/` · `packages/<name>/ios/`                                   |
| Template sync / init              | `scripts/{init,sync,add-surface,project}.ts`                                             |
| Deploy                            | `drydock.yaml`                                                                           |
| Theme (dark mode)                 | `index.html` (pre-paint script) · `src/lib/theme.ts` · `src/components/theme-toggle.tsx` |
| Browser query/tRPC singletons     | `src/lib/trpc.tsx` (`getBrowserClients()`)                                               |
| E2E tests                         | `e2e/*.spec.ts`                                                                          |

## Routes / URLs

Routes are explicit in `src/app/routes.tsx` (no file-based routing). The root route is a bare `Shell` (`<Outlet/>`): the game and the labs render full-bleed; the starter's auth pages nest under its nav `Layout`.

| Route         | Serves                | File                             | Loader                                   |
| ------------- | --------------------- | -------------------------------- | ---------------------------------------- |
| `/`           | The game (title → play) | `src/app/play.tsx` → `src/game/play/session.ts` + `src/ui/GameUI.tsx` | `rootLoader` (session) |
| `/lab/world`  | World lab (views, hour, moon, weather; `?people=1`, `?spoor=x,z,heading`, `?gpu=1`) | `src/app/lab/world.tsx` → `src/game/world/lab.ts` | — |
| `/lab/people` | People lab (lineup, anims, close-ups; `?crowd=25`, `?animals=1`) | `src/app/lab/people.tsx` → `src/game/actors/lab.ts` | — |
| `/lab/sim`    | Sim lab (top-down band, time controls, director panel) | `src/app/lab/sim.tsx` → `src/sim/lab.ts` | — |
| `/lab/ui`     | UI lab (every screen and HUD state, audio panel) | `src/app/lab/ui.tsx` | — |
| `/lab/play`   | Controller sandbox | `src/app/lab/play.tsx` → `src/game/play/lab.ts` | — |
| `/sign-in`    | Sign in               | `src/app/sign-in.tsx`            | `redirectIfSignedIn`                     |
| `/sign-up`    | Sign up               | `src/app/sign-up.tsx`            | `redirectIfSignedIn`                     |
| `/dashboard`  | Protected app         | `src/app/dashboard.tsx`          | `dashboardLoader` (redirects + prefetch) |
| `/healthz`    | DB health JSON        | `server.ts`                      | —                                        |
| `/api/auth/*` | better-auth           | `server.ts` (`toNodeHandler`)    | —                                        |
| `/api/trpc/*` | tRPC                  | `server.ts` → `server/router.ts` | —                                        |
| unmatched GET | 404 page (status 404) | `error-boundary.tsx`             | —                                        |

Mobile routes (Expo Router, file-based; each file re-exports a screen):

| Route      | Group    | File                                     | Screen                    |
| ---------- | -------- | ---------------------------------------- | ------------------------- |
| `/`        | `(app)`  | `apps/mobile/src/app/(app)/index.tsx`    | `src/screens/home.tsx`    |
| `/sign-in` | `(auth)` | `apps/mobile/src/app/(auth)/sign-in.tsx` | `src/screens/sign-in.tsx` |
| `/sign-up` | `(auth)` | `apps/mobile/src/app/(auth)/sign-up.tsx` | `src/screens/sign-up.tsx` |

`(app)` is guarded by `Stack.Protected guard={signedIn}`, `(auth)` by the inverse, in `src/app/_layout.tsx`.

## Architecture

Browser ↔ Express 5 (`server.ts`) ↔ Postgres. One Express server runs in dev (Vite middleware + `ssrLoadModule`) and prod (static `dist/client` + built `dist/server/entry-server.js`), gated on `NODE_ENV`. SSR: `render(req)` builds a Fetch Request, runs `createStaticHandler(routes).query()` to execute loaders (session + tRPC prefetch happen here), `renderToString`s with `<StaticRouterProvider>`, and dehydrates the QueryClient into `window.__SSR_STATE__` through superjson (`src/lib/ssr-state.ts`). The client deserializes and rehydrates that cache (Dates stay Dates), so `useQuery` has data on first paint. The SSR-side tRPC options proxy calls procedures **directly** (no HTTP). Client-side navigations prefetch the same way through `getBrowserClients()` in the loader's browser branch, so there is no "Loading…" flash either way. The stylesheet is a `<link>` in `index.html` (render-blocking in dev, hashed in prod) and the theme class is applied by an inline `<head>` script before first paint — no unstyled or wrong-theme flash. In dev, Vite's HMR websocket shares the Express `http.Server` (one port).

## Data model

`prisma/schema.prisma` — better-auth's required models (`User`, `Session`, `Account`, `Verification`) mapped to lowercase tables via `@@map`; fields are camelCase (better-auth queries by name) with snake_case `@map` columns. App model: `Post` (id, title, content, `authorId` → User `onDelete: Cascade`, createdAt). FK relations to `User` should cascade. Every schema change is a committed migration in `prisma/migrations/`; extensions, exclusion constraints, FTS triggers and expression indexes are hand-written SQL in a migration.

## Systems

### Auth (better-auth)

Email + password, `autoSignIn` on sign-up. Client (`auth-client.ts`) → `/api/auth/*` (`toNodeHandler`, mounted before `express.json`). SSR reads the session once per request; loaders get it via `requestContext`; the root loader returns `{ session }`, read with `useRouteLoaderData('root')`. **Lives in:** `server/auth.ts`, `src/lib/auth-client.ts`, `src/app/{sign-in,sign-up,layout}.tsx`. Sign-in/up/out all call `revalidator.revalidate()` so the nav reflects the new session.

### tRPC

`publicProcedure` / `protectedProcedure` (401 without session). Context attaches the session from request headers. superjson transformer on the server and on every link (browser + SSR loopback). **Lives in:** `server/trpc.ts`, `server/router.ts`, `src/lib/trpc.tsx`.

### Theme (dark mode)

`.dark` on `<html>` switches the oklch tokens; `color-scheme` follows so form controls/scrollbars match. Resolution order: `localStorage.theme` (`'light'|'dark'`) → `prefers-color-scheme`. The inline script in `index.html` applies it before first paint; `src/lib/theme.ts` handles toggles (`toggleTheme`) and OS changes while no explicit choice is stored (`followSystemTheme`, called once in `index.tsx`). `ThemeToggle` (nav) renders both icons and hides one with `dark:` so server and client markup are identical. **Lives in:** `index.html`, `src/lib/theme.ts`, `src/components/theme-toggle.tsx`, `src/styles/app.css`.

### Mobile

Expo dev-client app (never Expo Go). Talks to the web server's `/api/trpc` + `/api/auth/*`; base URL from `EXPO_PUBLIC_API_URL`, else the dev LAN host (Metro `hostUri`) + `apiPort`. Auth: better-auth `expoClient` + SecureStore; the tRPC link sends the cookie as a header. Server trusts the app schemes via `expo()` plugin + `trustedOrigins`. Variants (`APP_VARIANT`) coexist on one device. Native dark mode via the `@media native` block in tokens.css. Native changes need a new dev-client build on the Mac (compare `bun run fingerprint` with the Home screen's fingerprint row). EAS Update: `runtimeVersion` is the fingerprint, `updates.url` comes from `project.json` `easProjectId` (none → expo-updates off), each build profile has its own channel, and `src/lib/ota.ts` (mounted in the root layout) checks on launch and every foreground, fetches and `reloadAsync`s; off in `__DEV__`. `.gitattributes` forces LF so a Windows checkout fingerprints the same as the EAS build. **Lives in:** `apps/mobile/`, `packages/native-example/`, `apps/web/server/auth.ts`.

### Desktop

Electron main process owns everything Node: lifecycle, the window, and an `appRouter` served over IPC by `@app/trpc-ipc` (one channel, structured clone, no superjson; `ipcTransformer` is an identity transformer that only keeps tRPC's output types honest). The renderer is sandboxed (contextIsolation, no nodeIntegration) and only sees `window.trpcIpc`. TanStack Query never refetches on its own. All Electron state is pinned to `<repo>/data/.private/electron`. Single-instance lock forwards argv + cwd. Releases are unpacked (`release/win-unpacked`). **Lives in:** `apps/desktop/`, `packages/trpc-ipc/`.

### Template workflow

`project.json` `surfaces` (`web | mobile | desktop`) says what a fork has; `scripts/project.ts` maps each surface to its paths (web: `apps/web` + `drydock.yaml`; mobile: `apps/mobile` + `packages/native-example`; desktop: `apps/desktop` + `packages/trpc-ipc`) and root scripts. `init` renames identity strings in tracked files, writes `project.json`, picks ports, and drops the surfaces not asked for in one commit (`init: web-only`, `init: desktop-only`, `init: web + desktop`, …), refreshing `bun.lock`: from scratch when mobile is dropped (Bun keeps optional Expo peers otherwise), never when mobile stays (a fresh resolve hoists lru-cache 11 over Babel's 5 and Metro fails). `sync` merges `upstream/main` with `--no-commit`, keeps `project.json`/`drydock.yaml` (merge=ours driver) and the fork's `bun.lock`, re-deletes excluded surfaces' paths and root scripts, fills in `surfaces`/`desktopPort`/`appId` for forks older than them, then installs + typechecks. `add:mobile` / `add:desktop` check a surface out of upstream, restore its scripts and commit. **Lives in:** `scripts/`.

### Logging & errors

Dependency-free ANSI logger: one line per request (method · status · path · timing), startup banner, `formatError`. Loader/render errors and unmatched routes render the root `ErrorBoundary`. **Lives in:** `server/logger.ts`, `src/app/error-boundary.tsx`.

## Common tasks (how to modify)

### Add a route

1. Create `src/app/<name>.tsx` exporting `<NamePage>`.
2. Add `{ path: '<name>', Component: NamePage }` to `routes.tsx` (add a `loader` for auth/data).

### Add a tRPC procedure

Add to `appRouter` in `server/router.ts`; pick public/protected; validate input with zod; return real `Date`s (superjson) and format them deterministically in render.

### Add a DB table

Edit `prisma/schema.prisma` → `bun run db:migrate --name <what>` (applies + regenerates the client) → read and commit `prisma/migrations/<ts>_<what>/` → use `prisma.x` in procedures. Raw SQL: `bun run db:migrate:create --name <what>`, append SQL, then `bun run db:migrate`.

### Add an e2e test

Add `e2e/*.spec.ts`; screenshot only stable views; `bun run test:e2e:update` to write baselines.

## Gotchas & hard rules

- **Path alias `~/*` → `src/*`** (client only, in web and in mobile); server uses relative imports.
- **Mobile ↔ web contract is `import type` only** (CLAUDE.md rule #17); tokens come from `@app/tokens`. Identity only in `project.json` (#22). No hand edits to `ios/`/`android/` (#18), no custom Metro config (#21).
- **Root scripts proxy with `bun run --cwd apps/web <script>`** — `bun --cwd X run` silently prints the script list instead.
- **`./server/*` is server-only** — import into `src/*` only as `import type`.
- **Express 5 required** — `*splat` wildcards break on Express 4 (symptom: `/api/auth/*` 404s, auth dead).
- **`.env` loading**: Bun loads `.env` only into its own runtime, not the Prisma CLI (Node subprocess); Prisma 7 dropped auto-loading — `prisma.config.ts` loads it manually. Keep that block.
- **Run `bun run db:generate` after schema edits** (auto-runs on `bun install`).
- **superjson everywhere** — any new tRPC link needs `transformer: superjson`; SSR state goes through `ssr-state.ts`, never raw `JSON.stringify`. Format Dates deterministically (UTC / fixed `timeZone`) or SSR/hydration markup diverges.
- **Migrations, never `db push`** — and review generated SQL: Prisma can emit `DROP INDEX` for hand-made expression indexes.
- **Port** — `PORT` env (default `project.json` apiPort, 4080); Metro = apiPort + 1; never 3000/3001/5173/5174/8000/8080/4200/5000.
- **Types** — `strict` + `noUncheckedIndexedAccess`; no `any`, no `as` casts to paper over mismatches, narrow instead (see `isSsrContext` in `routes.tsx`).
- **Stylesheet is a `<link>` in `index.html`** — never `import` CSS from a component (Vite injects it after the module graph loads → unstyled flash in dev). `@import` new CSS from `app.css`.
- **Theme script and `theme.ts` must stay in sync**; never branch on theme in render (use `dark:` classes) or hydration mismatches.
- **New data routes prefetch in both loader branches** — SSR via `ctx.trpc`, client via `getBrowserClients()` — or the page flickers on client nav.
- **HMR has no fixed port** — it shares the Express server; giving it one collides with other clones running locally.
- **shadcn has no `asChild`** (no `@radix-ui/react-slot`) — style a `Link` with `buttonVariants()`.
- **No `tailwind.config`** — Tailwind v4, tokens in `tokens.css`. Tailwind pinned 4.1.12 + lightningcss 1.30.1 for NativeWind 5 rc.
- **EAS runs from `apps/mobile` only.** At the root it creates a stray EAS project + root `app.json`/`eas.json`. `EAS_NO_VCS=1` uploads only the cwd: add `EAS_PROJECT_ROOT=../..` or Metro dies with ENOENT on workspace paths.
- Use `log.*` from `server/logger.ts`, not raw `console.log`, in server code.
- **Reversed depth inverts three 0.185's sort lists.** The host sets `reversedDepthBuffer: true`; anything that needs a draw order (sky, sea, transparent foliage, decals) sets compensating `renderOrder`. Cameras: near 0.1, far ≥ 30000.
- **The game talks to the UI only through `src/game/bridge.ts`**, and modules talk only through `src/game/contracts.ts`; world-gen and the sim import nothing from three or the DOM (they run under `bun:test`).
- **Desktop IPC has no superjson** — never add a transformer other than `ipcTransformer` to the desktop router or `ipcLink`. Every procedure output must survive structured clone (no functions, no class instances you need back).
- **Desktop preload must stay tiny and CJS** — import only `@app/trpc-ipc/preload`; anything else lands in the sandboxed preload bundle.
- **Electron pins respect the 3-day `minimumReleaseAge`** in the global bunfig; a same-week Electron won't install.

## Status

- **Built (overnight 2026-10-17):** OCHRE playable end to end at `/`: title → Begin a life → four painted intro cards →
  five chapters (Held, Small, Coming of age, Provider, Elder) → life summary → Continue as heir. The Chapters menu jumps to
  any stage. 29 director beats (held.faces/sea/shell/night · small.follow/watch/gather/dig/tide/play/fire/afternoon ·
  youth.stone/knap/heat/haft/throw/track/share/gathering/afternoon · provider.steps/teach/storm/whale ·
  elder.walk/story/mark/evening). Procedural world (cliff cave, shelf, cove, dunes, plateau, tide, weather, day/night,
  moon), painted-light post chain, procedural people from infant to elder with ~20 anims, animals (eland herd, right
  whale), sim (band AI, needs, watch-to-learn skills, food/fire, chapters, save), HUD/captions/Field Notes codex/lineage/
  minigames, procedural WebAudio. Labs at `/lab/{world,people,sim,ui,play}`. Deploys through Drydock to
  https://ochre.dested.com on push to main (the workspace Dockerfile works).
- **Starter base kept:** SSR + hydration, better-auth, tRPC, Prisma 7 + migrations, logging, /healthz, e2e harness,
  optional mobile/desktop surfaces (not used by OCHRE).
- **Not built:** voiceover (no ElevenLabs key), new concept art (OpenAI credit exhausted), mobile, a real-GPU perf pass,
  accounts and cloud saves (saves are local), Steam packaging.
- **Unverified:** feel with a real mouse, audio by ear, fps on a real GPU.
- **Next:** `plans/2026-10-17-needs-sal.md` (decisions, checks, known issues).
