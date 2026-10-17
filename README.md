# ochre

An SSR React starter wired with a current, type-safe stack, plus an optional Expo iOS app that talks to the same server. Clone it, init it, ship.

> Already have a project cloned from an older ochre? See [`MIGRATION.md`](./MIGRATION.md) to bring it up to date (it fixes some app-breaking bugs, and covers the move to this monorepo layout).

| layer              | choice                                                                                |
| ------------------ | ------------------------------------------------------------------------------------- |
| runtime / pkg mgr  | **Bun** ≥ 1.3 workspaces (one `bun.lock`, shared versions in the root `catalog`)      |
| server             | **Express 5** + **Vite** SSR (vite middleware in dev, static + SSR bundle in prod)    |
| routing            | **React Router 7** (`createBrowserRouter` client, `createStaticHandler` server)       |
| data               | **tRPC v11** + **TanStack Query** (`.queryOptions()` API) + **superjson**             |
| validation         | **zod 4**                                                                             |
| db                 | **Postgres** + **Prisma 7** (pg driver adapter, `prisma-client` generator, `migrate`) |
| auth               | **better-auth** (email + password, autoSignIn; Expo plugin for the app)               |
| styles             | **Tailwind v4** + **shadcn/ui** (new-york, oklch tokens shared with mobile)           |
| mobile (optional)  | **Expo SDK 57** dev client + **Expo Router** + **NativeWind 5**, iOS/iPad             |
| desktop (optional) | **Electron 44** + **electron-vite 5**, tRPC over IPC, unpacked Windows builds         |
| types              | **TypeScript 7** `tsc`, `strict` + `noUncheckedIndexedAccess` in every workspace      |
| tests              | **Playwright** e2e with committed screenshot baselines + **bun:test** units           |
| deploy             | **Drydock** (`drydock.yaml`, web only) · **EAS** for the app                          |

## Quickstart

Requires [Bun](https://bun.sh) ≥ 1.3 and a reachable Postgres.

**Start a new project from this template:**

```bash
git clone https://github.com/dested/sal-starter.git my-app && cd my-app
git remote rename origin upstream   # keeps `bun run sync` working; add your own origin later
bun install
bun run init my-app                 # web only; --mobile / --desktop keep those apps, --desktop-only keeps just Electron
createdb my_app                     # or point .env's DATABASE_URL at any Postgres
bun run db:migrate                  # apply prisma/migrations
bun run dev                         # → http://localhost:<the port init printed>
```

`init` renames everything, writes `project.json` (the project's identity: name, scheme, bundle id, surfaces, ports, db), picks per-project ports and writes a fresh `.env` (web only). Surfaces you didn't ask for are deleted in their own commit ("init: web-only", "init: desktop-only", …); `bun run add:mobile` / `add:desktop` bring one back any time. `--port <n>` picks the API port yourself (Metro gets n + 1, the desktop renderer n + 2). `--fresh-git` wipes history instead, which also cuts you off from `sync`.

**Ports:** every project gets its own distinct, uncommon pair and records it in `cliffnotes.md`. Never 3000/3001/5173/5174/8000/8080/4200/5000. The template uses 4080 (API) and 4081 (Metro).

**Pull template improvements later:**

```bash
bun run sync                        # merges upstream/main, never commits
git diff --cached && git commit
```

Your `project.json`, `drydock.yaml` and `bun.lock` stay yours; surfaces your fork dropped stay dropped. Real conflicts are listed for you to resolve.

## Scripts

All run from the repo root.

| script                                   | what it does                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `bun run dev`                            | web (HMR + SSR on 4080) + Metro on 4081 if `apps/mobile` exists           |
| `bun run dev web` / `mobile` / `desktop` | just one of them                                                          |
| `bun run init <name>`                    | rename the template, write `project.json` + `.env` (`--mobile`, `--port`) |
| `bun run sync`                           | merge `upstream/main` into this fork without committing                   |
| `bun run add:mobile`                     | add the Expo app to a fork without it, from upstream                      |
| `bun run add:desktop`                    | add the Electron app to a fork without it, from upstream                  |
| `bun run release`                        | desktop: unpacked build in `release/win-unpacked/`                        |
| `bun run build`                          | build client (`apps/web/dist/client`) + SSR bundle (`dist/server`)        |
| `bun run start`                          | run the production server (`NODE_ENV=production`)                         |
| `bun run typecheck`                      | `tsc --noEmit` in the root and every workspace                            |
| `bun run test`                           | `bun:test` in every workspace                                             |
| `bun run test:e2e`                       | Playwright e2e + screenshot comparison                                    |
| `bun run test:e2e:update`                | regenerate screenshot baselines                                           |
| `bun run db:migrate`                     | create + apply a migration, regenerate the client (dev)                   |
| `bun run db:migrate:create`              | create a migration without applying (for raw SQL)                         |
| `bun run db:deploy`                      | apply committed migrations (prod / CI)                                    |
| `bun run db:generate`                    | regenerate the Prisma client (auto-runs on install)                       |
| `bun run db:studio`                      | Prisma Studio                                                             |
| `bun run prettier`                       | format the repo                                                           |

Mobile-only scripts live in `apps/mobile/package.json`: `doctor`, `fingerprint`, `ios:prebuild`, `ios:device`, `ios:sim`, `add-device`, `build:dev|preview|prod`, `submit:prod`, `ota:preview|prod`.

## Layout

```
project.json             identity: name, scheme, bundleId, appId, surfaces, apiPort, metroPort, desktopPort, db, easProjectId, appleTeamId
package.json             workspace root: catalog, overrides, proxy scripts
drydock.yaml             deploy seed (web only)
scripts/                 init, sync, add-surface, dev
apps/web/                the SSR app and the API server
├── server.ts            Express entry: logging, /healthz, auth + tRPC mounts, vite/SSR
├── server/              env, logger, prisma, auth, trpc, router (exports AppRouter)
├── src/                 client: routes, pages, shadcn primitives, lib, styles
├── prisma/              schema + committed migrations
└── e2e/                 Playwright specs + __screenshots__
apps/mobile/             Expo app (optional)
├── app.config.ts        reads project.json; APP_VARIANT picks dev/preview/prod identity
├── eas.json             build profiles
├── modules/app-native/  local Expo module (Swift)
└── src/                 app/ (Expo Router), screens/, components/ui/, lib/
packages/native-example/ shared Expo module + config plugin (the template's native demo)
```

## How it fits together

**Auth.** Sign-in/up call `authClient` → POST `/api/auth/*` (mounted via `toNodeHandler(auth)`) → session cookie. On SSR, `entry-server.tsx` reads the session once per request and passes it to loaders, so the first paint already knows who you are. The app uses better-auth's Expo client: the cookie lives in SecureStore and the tRPC link sends it as a header.

**tRPC.** Components call `useQuery(trpc.posts.list.queryOptions())` → `/api/trpc/*` → `appRouter`. `createContext` attaches the session; `protectedProcedure` 401s without one. Mobile imports only the `AppRouter` type from `@app/web/router`.

**SSR + hydration.** Loaders prefetch tRPC queries into a per-request `QueryClient` (via a direct, no-HTTP options proxy). The cache is dehydrated into `window.__SSR_STATE__` through superjson and rehydrated on the client, so `useQuery` has data on first render and `Date`s are still `Date`s.

**Migrations.** Schema changes are committed `prisma migrate` migrations, never `db push`. Postgres features Prisma can't model are hand-written SQL in a migration. See `CLAUDE.md` → "Raw SQL in a migration".

**Styling.** One set of oklch tokens in `packages/tokens/tokens.css` (`@app/tokens`). Web and desktop import it from `app.css`; mobile imports it through NativeWind, which compiles the colors for native and follows the OS dark mode.

## Mobile: Windows + Mac + iPad

The app runs as a **development build** (a dev client), never Expo Go. The workflow splits across two machines:

- **Windows** (daily): editor, Postgres, `bun run dev` (API on 4080 + Metro on 4081). Allow inbound TCP 4080–4081 on the private network in Windows Firewall so the iPad can reach both.
- **Mac** (only when native code changes): `git pull`, `bun install`, then in `apps/mobile`: `bun run ios:prebuild` and `bun run ios:device` with the iPad plugged in. That compiles and installs the dev client; it does not start Metro.
- **iPad**: open the dev client, scan the QR from Windows Metro (or pick the server from the list). JS changes hot-reload from Windows.

When do you need a new build? When the native fingerprint changes: run `bun run fingerprint` in `apps/mobile` and compare with the fingerprint row at the bottom of the app's Home screen. Swift, native dependencies, config plugins and native `app.config.ts` fields change it; JS doesn't. Move code between machines on a branch, never `master` (pushing `master` deploys web).

**First-time setup per project:** set `appleTeamId` in `project.json`, then in `apps/mobile`: `eas login`, `eas init` (put the id it prints in `project.json` `easProjectId`; `app.config.ts` derives `updates.url` from it, because `eas init` / `eas update:configure` can't write a dynamic config). Distribution builds: `bun run build:preview` (internal, iPad registered via `bun run add-device`), `bun run build:prod` + `bun run submit:prod`.

**Run `eas` only inside `apps/mobile`.** Run at the repo root, it offers to create a new EAS project with a root `app.json`/`eas.json`; say no and `cd apps/mobile`. EAS uploads the whole git repo, so the workspace (root `bun.lock`, `packages/*`, `@app/web` types) comes along. With `EAS_NO_VCS=1` it uploads only the current directory: set `EAS_PROJECT_ROOT=../..` too, or Metro fails at "Bundle JavaScript" on missing workspace paths.

**Ship a fix (OTA).** JS-only changes go out without a store build: in `apps/mobile`, `eas update --channel production --environment production` (`bun run ota:prod`; `ota:preview` for internal builds). Installed apps check on launch and on every return to the foreground, download, and reload at once (`src/lib/ota.ts`). An update only reaches builds with the same fingerprint `runtimeVersion`: check with `eas fingerprint:compare --build-id <id>` first. Native changes (fingerprint differs) need a new `build:prod`.

## Testing

Playwright e2e lives in `apps/web/e2e/`. `bun run test:e2e` boots the app on port 3100 against an **isolated test database** (`ochre_test`), applies the committed migrations and truncates it, and runs the smoke suite (home, sign-up → dashboard → create post → sign-out, the 404 page). Visual baselines are committed under `e2e/__screenshots__/`; update them with `bun run test:e2e:update`.

```bash
createdb ochre_test                       # once; global-setup migrates it
bun run test:e2e                                 # or E2E_DATABASE_URL=postgres://…/x_test bun run test:e2e
```

The e2e DB name must end in `_test`. Screenshots are OS/font specific; regenerate on the platform your CI uses.

Unit tests: `bun run test`. `ssr-state.test.ts` proves a `Date` survives SSR dehydrate → hydrate; `tokens.test.ts` keeps the native dark tokens equal to the web ones.

Mobile has no device test runner in the template. `bunx expo export --platform ios` (in `apps/mobile`) proves the app bundles; `bun run doctor` checks the Expo setup. `verify.md` lists every check.

## Deploy

**Web: Drydock.** `drydock.yaml` at the root deploys `apps/web` (`kind: ssr`, `runtime: bun`, port from `project.json`). `predeploy` runs `prisma migrate deploy`, so committed migrations only; a failed migration fails the deploy. Drydock provides `DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`. Every push to `master` redeploys. Not yet verified for the workspace layout: Drydock's Dockerfile generator needs a workspace-aware fix first.

**App: EAS.** See "Mobile" above. Builds and OTA updates are separate from the web deploy.

## Gotchas

- **Express 5 is required.** The route patterns (`/api/auth/*splat`) use named wildcards.
- **`.env` lives at the repo root.** `apps/web` scripts pass `--env-file=../../.env`, and `prisma.config.ts` loads it for the Prisma CLI.
- **Server-only code lives in `apps/web/server/`.** Never import it from `src/*.tsx` or from mobile except as `import type`.
- **Identity lives in `project.json`.** Don't hardcode the name, scheme, bundle id or ports anywhere else.
- **Never edit `apps/mobile/ios/` or `android/`.** They're generated by prebuild and gitignored.

For the deeper "how to extend this" briefing (hard rules, common tasks, architecture flows), read [`CLAUDE.md`](./CLAUDE.md) and [`cliffnotes.md`](./cliffnotes.md).
