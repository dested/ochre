# ochre — Verify

> How to check a change. Cheap checks run after every change; `[heavy — ask first]` ones need a database, a device or a remote service.

## Cheap (always)

```bash
bun install                 # lockfile resolves; postinstall regenerates the Prisma client
bun run typecheck           # tsc --noEmit: root + every workspace. Must be green
bun run test                # bun:test in every workspace (ssr-state, tokens, trpc-ipc round trips, desktop router)
bun run build               # apps/web/dist/client + dist/server
bun pm why react            # exactly one react (the Expo SDK's version)
```

Web boots without a database for pages that don't query:

```bash
bun run dev web             # → http://localhost:4080
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4080/                       # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4080/api/auth/get-session   # 200
```

## Mobile (cheap, Windows)

Run in `apps/mobile`:

```bash
bun run doctor                                  # expo-doctor (all checks) + expo-modules-autolinking verify
bunx expo-modules-autolinking search            # lists app-native and @app/native-example
bunx expo export --platform ios --output-dir .cache/export   # bundles the whole app (no device needed)
bunx cross-env APP_VARIANT=development expo config --type introspect   # runs config plugins in memory
```

In the introspect output: `ios.bundleIdentifier` ends in `.dev`, `infoPlist.SalNativeExample` is set by the plugin, `NSAllowsLocalNetworking` is present. With `APP_VARIANT=production` there's no ATS exception and no suffix. `expo prebuild --platform ios` refuses to run on Windows; introspect is the substitute.

With `bun run dev` running (API + Metro):

```bash
curl -s http://localhost:4081/status            # packager-status:running
curl -s -H "expo-platform: ios" http://localhost:4081/ -o /dev/null -w "%{http_code}\n"   # 200 manifest
```

## Desktop (cheap, Windows)

```bash
bun run --cwd apps/desktop build     # out/main, out/preload/index.cjs (~1 KB), out/renderer
bun run dev desktop                  # renderer on 4082 + the window; ping, echo and ticking subscription all work
bun run release                      # release/win-unpacked/<name>.exe launches and shows the same
```

Scripted check without clicking: Playwright's `_electron.launch({ args: ['apps/desktop'] })` (or `{ executablePath: '…exe' }`) and read `[data-testid=ping|echo|ticks]`. For dev mode, `bunx electron-vite dev --remoteDebuggingPort 9333` in `apps/desktop` and `chromium.connectOverCDP`. State must land in `data/.private/electron`, nothing in `%APPDATA%`.

## Template scripts (cheap, in a scratch clone)

Never run these in the template itself. Clone into a temp dir, `git remote rename origin upstream`, `bun install`, then:

- `bun run init demo-web` → commit "init: web-only", no `apps/mobile`, `bun.lock` without `expo` entries, typecheck + test + build green.
- `bun run add:mobile` in that clone → commit "add apps/mobile from upstream/main @ <sha>", typecheck green.
- `bun run init demo --desktop-only` → commit "init: desktop-only", no `apps/web`/`apps/mobile`/`drydock.yaml`, no web/db root scripts, `.env.example` without DB/auth; install, typecheck, test, `bun run dev` (window), `bun run release` (exe) green.
- `bun run init demo --desktop` → web + desktop, commit "init: web + desktop".
- `bun run init demo-app --mobile` → `git diff --stat` shows only identity strings; `expo export` works.
- `bun run sync` against an upstream commit that touches `project.json`, `apps/mobile` and a shared file → the fork's `project.json` kept, mobile changes dropped in a web-only fork, shared file merged, nothing committed.

## E2E `[heavy — ask first]`

Needs a reachable Postgres and the credentials in the root `.env`.

```bash
createdb ochre_test   # once
bun run test:e2e            # Playwright on :3100 against ochre_test
curl -s http://localhost:4080/healthz          # {"status":"ok",...} with bun run dev up
```

Screenshot diffs after an intentional UI change: `bun run test:e2e:update`, then review and commit the PNGs.

## Device (Gate 3) `[heavy — ask first]`

Needs the Mac, the iPad and an Apple Developer account. Windows runs `bun run dev`; inbound TCP 4080–4081 allowed on the private network.

1. Mac: `git pull` (the branch, not `master`), `bun install`, then in `apps/mobile`: `bun run ios:prebuild`, `bun run ios:device` with the iPad plugged in.
2. iPad: open the dev client, connect to Windows Metro.
3. Sign up on the iPad → a post created there shows up on web `/dashboard` (and vice versa).
4. Home shows "Hello from Swift" and the `@app/native-example` plist value. The fingerprint row matches `bun run fingerprint`.
5. Kill the API on Windows → Home shows the "Can’t reach the server" card; Retry recovers once it's back.
6. Toggle iPad dark mode → the app follows.

## EAS and deploy `[heavy — ask first]`

- `bun run build:preview` (in `apps/mobile`) installs on a registered iPad; `bun run ota:preview` reaches it.
- Before any `eas update`: `eas fingerprint:compare --build-id <build>` says the local runtime matches the build's.
- OTA: publish a visible JS change with `bun run ota:preview`, background and reopen the app → it reloads into the change.
- Drydock: blocked until Drydock's workspace-aware Dockerfile fix. Then: deploy, `/healthz` 200, sign up on the deployed URL.
