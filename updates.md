# ochre — Updates

> Terse, newest-first log: what was asked → what was done. One entry per finished task.

## 2026-10-07 — desktop surface (Electron) for sal-git

Ask: Phase 0 of sal-git's plan (G:/code/sal-git/plans/2026-10-07-sal-git.md): an optional, thin Electron surface so sal-git can be a `--desktop-only` fork.
Done: `packages/tokens` (tokens moved out of web), `packages/trpc-ipc` (tRPC v11 over IPC, own link, 9 tests), `apps/desktop` (electron-vite 5, Electron 44.5.1, pinned data dir, single instance, saved bounds, sandbox + CSP, demo query/mutation/subscriptions, unpacked release via electron-builder API). `project.json` gains `surfaces`/`desktopPort`/`appId` (legacy forks migrated by sync); `init --desktop|--desktop-only`, `add:desktop` (add-mobile → add-surface), `sync`/`dev` per surface. Verified: typecheck + tests all workspaces, web build, built app + dev mode + packaged exe driven by Playwright (ping/echo/ticks). Electron 44.7.0 (plan) was blocked by the 3-day minimumReleaseAge, so 44.5.1.
Touched: packages/{tokens,trpc-ipc}, apps/desktop, apps/{web,mobile} token imports, scripts/\*, project.json, package.json, .gitignore, docs

## 2026-10-04 — Expo build fixes + instant OTA from Store Brand

Ask: port what Store Brand needed to build and ship on EAS, so the next project's first EAS build works.
Done: root cause traced (eas run at the repo root, then EAS_NO_VCS uploading only the app dir; see decisions). `.gitattributes` LF for fingerprint parity; eas.json pins bun 1.3.10 / node 22.22.2 and gives development a channel; app.config `updates` checkAutomatically ON_LOAD + fallbackToCacheTimeout 0, `ios.config.usesNonExemptEncryption`; `src/lib/ota.ts` mounted in the root layout; ship-a-fix + EAS-root docs. Verified: typecheck root + all workspaces, `expo config` resolves. NOT verified: an EAS build or update from the starter.
Touched: .gitattributes, apps/mobile/{eas.json,app.config.ts,src/lib/ota.ts,src/app/\_layout.tsx}, README.md, cliffnotes.md, decisions.md, verify.md, updates.md

## 2026-10-02 — monorepo + optional Expo app (branch `monorepo`)

Ask: turn ochre into a Bun workspace with an optional Expo iOS app (plan: pickleball `plans/2026-10-02-research-expo-starter.md`), Phases 0–2 and 4, Windows half of 3.
Done: app moved to `apps/web` (history kept, `v1-single` tag); root catalog + hoisted linker + `tsconfig.base.json`, TS 7 `tsc`, prisma-client generator, `project.json`, Drydock seed replaces render.yaml, tan→sal rename. `apps/mobile`: Expo SDK 57 dev client, Expo Router groups + `Stack.Protected`, better-auth Expo, tRPC, NativeWind 5 over shared `tokens.css` (+ native dark block), APP_VARIANTs, eas.json, local Swift module + `packages/native-example` with config plugin. `init --mobile`, `sync`, `add:mobile`; web-only lock regeneration. Verified: typecheck all workspaces, test 4/4, build, expo-doctor 21/21, autolinking verify, `expo export --platform ios`, introspected Info.plist, dev boots API 4080 + Metro 4081, `/healthz` ok, e2e 4/4 (baselines unchanged), init/sync/add:mobile in scratch clones. NOT verified: Mac/iPad dev-client build (Gate 3), EAS, Drydock deploy.
Touched: everything moved under apps/web; new apps/mobile, packages/native-example, scripts/{init,sync,add-mobile,dev,project,shell}.ts, project.json, package.json, bunfig.toml, tsconfig\*.json, drydock.yaml, .gitattributes, docs (CLAUDE.md, README, MIGRATION §21, cliffnotes, ui, decisions, verify)

## 2026-09-29 — template hardening (port, types, superjson, zod 4, migrations)

Ask: harden the template before the Frozen Ropes rebuild and future projects start from it.
Done: dev port = `PORT` (default 4080, init picks one per project, bans 3000 & co.); `noUncheckedIndexedAccess` + typecheck covers e2e/scripts/configs, all `as` casts removed; superjson on tRPC + SSR state with a unit and e2e proof that Dates survive hydration; zod 4; `prisma migrate` (initial migration, `db:migrate`/`db:migrate:create`/`db:deploy`, Render + e2e run `migrate deploy`, raw-SQL guide). Verified: typecheck, `bun run test` 3/3, build, e2e 4/4 on a throwaway local Postgres.
Touched: server.ts, server/{env,trpc,router,prisma}.ts, src/{index,entry-server}.tsx, src/lib/{trpc.tsx,ssr-state.ts,ssr-state.test.ts}, src/app/{routes,dashboard,home,layout}.tsx, e2e/\*, playwright.config.ts, prisma.config.ts, prisma/migrations/, scripts/init.ts, render.yaml, tsconfig.json, package.json, .env.example, docs

## 2026-09-11 — kill the unstyled flash on load + other load-time jank

Ask: fix the FOUC every load; find similar jank; make it incredible.
Done: stylesheet moved to a head `<link>` (FOUC gone in dev); flash-free dark mode with nav toggle + `color-scheme` + synced `theme-color`; `<ScrollRestoration />`; client-nav tRPC prefetch via `getBrowserClients()`; HMR websocket shares the Express server (fixed-port collision between clones); immutable `Cache-Control` for hashed assets. e2e screenshot baselines NOT regenerated (no DB creds in this session) — run `bun run test:e2e:update`.
Touched: index.html, server.ts, src/App.tsx, src/index.tsx, src/app/layout.tsx, src/app/routes.tsx, src/lib/trpc.tsx, src/lib/theme.ts, src/components/theme-toggle.tsx, src/styles/app.css, CLAUDE.md, MIGRATION.md, cliffnotes.md, ui.md, decisions.md
