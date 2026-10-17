# OCHRE overnight build

Status: active (2026-10-17). Lead: Opus 5.5 (bosun). Agents: world (opus-xhigh), people (opus-xhigh), sim (opus-high),
ui (opus-high), play (opus-high). Board: down at start (board.localhost unreachable); retry later.

Sal, 2026-10-17 ~00:05 (verbatim, abridged only by cutting):
- "new game idea. ive been thinking about the life of someone 80k years ago. what they were born into wht they did
  throughout their life, etc. i want to make a simulator game. for living like it was 80k years ago. i dont ahve a
  name yet, come up with one. the idea is they are the same bioligcally as us, but in a completely different
  environment so how do they navigate it. idk why spore is coming to mind"
- "im going to leave this completely open ended. i wnt you to decide everything and give me a demo in the morning.
  it should be web based but we might put it in expo later. sal-starter. i think its 3d but idk. you can use some
  image tokens, gpt image 2.5 not 2.0. maybe use @../celworld/ for assets, up to you."
- "i want this to be incredible. i want tolive their lives. i want to understand. i want it to look incredible.
  steam game 14.99 kinda thing."
- "use /bosun you can use up to 2 xhigh agents and 5 agents total. plan, decide, and build. im going to let you
  run all night with a goal of giving me something that will blow me away in the morning. maybe not a complete game
  but all the bits and peices there to show me what i need to prove this out and then just spend totkens to finish
  it out."
- Answers: self-approve the sample and fan out; one life by stage; stylized painterly 3D; GitHub + Drydock.
- "it should be noted celworld has a ton of shaders or whatever and you can also make your own theres a whole api."
- "okay good night, make good choices"

The design: `plans/2026-10-17-ochre-design.md`. The contracts: `apps/web/src/game/contracts.ts`.
The visual targets: `apps/web/public/art/concept/env-cave-golden.png` (the world) and
`apps/web/public/art/concept/people-lineup.png` (the people). Every visual sample is judged against them.

## Shape

| Phase | Who | What | Ends when |
| --- | --- | --- | --- |
| 0 | Lead | sal-starter as `ochre`, GitHub `dested/ochre`, Drydock `ochre.dested.com`, contracts, bridge, host, core clock + rng, routes, concept art, this plan | Green and pushed |
| 1 | All five | Item 1 of each brief = that pipeline's sample. The lead reviews each at full resolution and self-approves (Sal's OK) or sends `fix` | Five samples passed |
| 2 | All five | Remaining items; play integrates the real modules as they land | Chapters 1–3 playable end to end, 4–5 reachable |
| 3 | Lead | Integration fixes, gate, deploy, kit, the morning report | Pushed and live |

Cap: 5 agents + board-scribe. No Explore while all five run (the lead does its own reads).
Time cap: no new items start after 07:00 PT; agents stop by 07:30; the lead gates, deploys and writes the report.
Spend: image generation capped at 200 GPT Image 2.5 Flare calls in total (ui up to 120, world up to 20, people up
to 10, play up to 10, lead the rest). Use `--quality low` for drafts.
Checkpoint for Sal: the morning report with the live URL, the local URL and a 2-minute "what to try" list.

Stop plan: TaskStop each agent; kill its background jobs by the pid or port it reported; close its bx profile
(`bx.exe --profile ochre-<name> stop`). The lead's own jobs: the dev server (:4080) and the Drydock portal (:4400).

## Ownership

Paths are under `apps/web/` unless they start with `plans/` or a repo-root file.

| Path | Owner |
| --- | --- |
| `src/world-gen/**`, `src/game/world/**`, `src/game/render/**` (incl. `paint.ts`), `src/game/world/lab.ts`, `src/app/lab/world.tsx` | world |
| `src/game/actors/**`, `src/app/lab/people.tsx` | people |
| `src/sim/**`, `src/app/lab/sim.tsx` | sim |
| `src/ui/**`, `src/content/**`, `src/game/audio/**`, `public/art/**` (except `public/art/concept/`), `index.html`, `ui.md`, `src/app/lab/ui.tsx`, `src/styles/app.css` | ui |
| `src/game/play/**`, `src/app/play.tsx`, `src/app/lab/play.tsx` | play |
| `src/game/contracts.ts`, `src/game/bridge.ts`, `src/game/engine/**`, `src/core/**`, `src/app/routes.tsx`, `src/app/client-mount.tsx`, `package.json`s, `bun.lock`, `server/**`, `prisma/**`, `plans/**`, `cliffnotes.md`, `decisions.md`, `updates.md`, `verify.md`, `README.md`, `CLAUDE.md`, `public/art/concept/` | lead |

A file nobody owns: ask the lead before touching it. Need a contract change, a dependency, a route or a shared
type? Send the lead the exact lines.

## Rules for every agent

- Re-read your section and **Standing answers** before each item and before asking anything. The file is the truth;
  messages arrive late.
- Edit only your owned paths. Scratch and screenshots go in `/w/junk/sim-80k/<your name>/` (create it).
- Commit only with `bash ~/.claude/sal/bin/commit-paths.sh "<area>: <what> (<your name>)" <your paths>`, run from
  `/w/code/sim-80k`, paths relative to it (e.g. `apps/web/src/sim`). No push, stash, reset, checkout --, restore,
  clean, amend or worktree. Commit often (every meaningful step), so others can integrate.
- **Never run `bun install` or `bun add`.** The lockfile must stay v1 (Drydock builds with bun 1.3). Ask the lead for
  any dependency, with the reason. Prefer writing it yourself.
- **Typecheck your own paths:** `cd /w/code/sim-80k/apps/web && bunx tsc --noEmit -p . 2>&1 | grep -E '<your path regex>'`
  must print nothing. Errors in files you don't own are another agent's work in flight: ignore them, never fix them.
  Tests: `cd /w/code/sim-80k/apps/web && bun test <your dir>`.
- No `any`, no papering `as`, no `@ts-ignore`, no `!` where narrowing works. `noUncheckedIndexedAccess` is on.
- world-gen and sim are three-free and DOM-free, and use `src/core/rng.ts` (never `Math.random()`).
- No top-level DOM or `window` access in any module (the app is SSR); labs mount through `mount(el)`.
- **The dev server is the lead's**: http://localhost:4080 (HMR). Never start another. If it's down, send
  `blocked <id>: dev server down` and keep working on code.
- **Browser checks with bx, on your own profile**: `bx.exe --profile ochre-<your name> open <url>`, then
  `bx.exe --profile ochre-<your name> snap /w/junk/sim-80k/<your name>/<file>.png`, and Read the PNG. The viewport is
  1280×800. Check the console with `bx.exe --profile ochre-<your name> console`. Close your tabs when done.
- Each lab and the game accept `?stats=1` (the host prints fps · draw calls · triangles). Watch it.
- Images: `set -a && . /w/code/sim-80k/.env && set +a && bun /home/dested/.claude/skills/openai-image/generate-image.mjs "<prompt>" <out.png> --size 1536x1024 --quality low|high`
  (GPT Image 2.5 Flare). Stay inside your image cap. Never print the key.
- Background jobs over a minute: report the pid or port and the log path. Stop them all before you finish.
- **Ready line** after each item: `ready <id> <sha> <one-line result>; shots: <absolute png paths>; doubts: <…>`.
  Then start your next item at once. Don't wait for the review. A `fix` from the lead outranks your current item.
- Report in ≤ 10 lines. Never paste code or logs into messages.
- Design questions: re-read the design doc first, then `question <id>: <q> (recommend: <option>)` and continue
  with your recommendation unless it's destructive.

## world: opus-xhigh, scratch /w/junk/sim-80k/world/

**Goal.** The coast, painted. A real-time world that makes someone stop and stare: the cave above the sea, the
shelf, the cove, the fynbos, the sky and the sea through a full day, in the painted-light look.

**Read first.** `plans/2026-10-17-ochre-design.md` (Setting, Visual direction, Architecture); `contracts.ts`
(Time, World data, Rendering); `src/core/clock.ts`; `src/game/engine/host.ts`; the concept painting
`public/art/concept/env-cave-golden.png`. celworld (`/w/code/celworld`) is Sal's own engine and you may read and
adapt anything from it (its ground GLSL `packages/engine/src/core/ground*.ts`, the watercolour and diorama look
post chains under `packages/engine/src/look/`, the toon ramp) with a one-line credit comment. Don't import from it.

**Decisions already made.**
- Exports: `createWorldData: CreateWorldData` from `src/world-gen/index.ts`; `createRenderPipeline:
  CreateRenderPipeline` from `src/game/render/index.ts`; `paint: PaintMaterial` from `src/game/render/paint.ts`
  (replace the placeholder; keep the export name); `createWorldView: CreateWorldView` from `src/game/world/index.ts`.
- Axes: +X east, +Z south, the sea to the south. World size 2048 m. The layout (you may move things up to ±30%, then
  report the final POI coordinates): cliff line running east–west near z ≈ 60–120; the cave mouth near (−40, 80),
  floor about 30–35 m above mean sea level, facing +Z; the intertidal shelf below it (z ≈ 130–200), exposed at low
  tide; a sandy cove to the west (x −300..−80); a river mouth and lagoon to the east (x 250..500, z 0..160); dunes
  behind the cove; the fynbos plateau north of the cliffs rising gently inland; blue mountains beyond the northern
  edge as a backdrop (not walkable). Every `REQUIRED_POIS` id exists, and walkable paths connect cave ↔ shore (a
  cliff path), cave ↔ plateau, cave ↔ cove, cave ↔ lagoon.
- The heightfield can't do overhangs: the cave is its own rock-shell mesh set into the cliff over a flat floor
  terrace in the heightfield. Inside it is dim, lit by the hearths.
- `heightAt` is called hundreds of times per frame: sample a precomputed grid (bilinear), no noise at query time.
  `createWorldData` runs in under 1.5 s.
- Tide: the sea surface sits at `clock.seaLevel`; the shelf floods and drains with it; foam and wet sand follow the
  waterline. Waves break on the shelf and the cove.
- Fires: `WorldFrame.fires` → flames (animated, additive, painted), embers, a warm point light per fire (limit the
  lights to the 4 nearest the focus), smoke wisps.
- The sky: gradient sky with sun disc and glow, painted clouds, stars and the Milky Way at night, the moon with
  phase. Time of day sets the colour script in the design doc (dawn, day, golden, dusk, night).
- The painted-light look is yours to invent: ramped lighting with coloured shadows, aerial perspective, a painterly
  post filter (Kuwahara-style), grain, edge pooling, bloom, grade, vignette. `setDream` (stage 1 blur and warm
  vignette) and `setFade` are part of the pipeline. Quality levels low/medium/high trade the post and the grass.
- `paint()` makes the people agent's MeshStandardMaterials sit in the same light (ramp, rim, brush noise, fog).
- Budget: 60 fps at 1920×1080 on a mid GPU, under 250 draw calls for the world.

**Owns.** `src/world-gen/**`, `src/game/world/**`, `src/game/render/**`, `src/app/lab/world.tsx`.

**Items.**
1. `W1` (the sample): world-gen with every POI, terrain, sea with tide and foam, sky through the day, the cave
   shell, the painted post chain, and `/lab/world`: a free-fly camera (WASD + mouse drag, Shift fast), sliders for
   hour, day of year, moon phase (tide follows), and buttons for 5 preset views: `cave` (inside the mouth looking
   out, like the concept painting), `shore` (on the shelf at low tide), `cove`, `plateau` (looking at the
   mountains), `aerial`. Expose `window.__lab = { view(name), setHour(h), setMoon(p), setDay(d) }` (DEV) so bx can
   drive it. Ready with shots of `cave` at 17:30 (golden), `shore` at 09:00 low spring tide, `aerial` at 12:00,
   `cave` at 22:00 (night, fire lit).
2. `W2`: foliage (fynbos clumps, proteas, restios, milkwoods in gullies, instanced grass with wind), rocks and
   boulders, the cliff path, the hearths inside the cave with fire, weather (`WeatherState`: clouds, rain, wind,
   fog, a storm look), and the real `paint()`. Ready with the same four shots plus a rain shot.
3. `W3`: polish and performance: LOD, quality levels, the sea on the rocks, dawn lagoon mist, god rays at the cave
   mouth, a tracking-marks helper (`src/game/world/spoor.ts`: `createSpoor(world): { root; add(x, z, heading, age);
   clear() }` painted hoof prints on the ground), and anything the lead's review asks for.

**Done when** (each item): your paths typecheck clean; `bun test src/world-gen` passes (write tests: every
required POI exists, POIs are walkable, cave↔shore is connected on a walk grid, `heightAt` is deterministic);
the shots are taken and you looked at them against the concept painting; `?stats=1` shows the draw calls.

## people: opus-xhigh, scratch /w/junk/sim-80k/people/

**Goal.** The people of OCHRE, every age from infant to elder, and the animals they live among, animated and
alive, in the painted-light look. Players must love these faces: in stage 1 the camera looks at faces from 40 cm.

**Read first.** The design doc (Setting, The fixed cast, Visual direction: People); `contracts.ts` (Actors);
`public/art/concept/people-lineup.png` (the target). celworld's character pipeline is Sal's own code and you may
read and adapt it with a credit comment: `/w/code/celworld/packages/engine/src/chars/mesh.ts` (MeshBuilder: lathe
profiles and limbs into one skinned BufferGeometry with vertex colours), `build.ts` (the 20-bone rig), `walk.ts`
(planted-foot walk with analytic leg IK, no skating). Its proportions are chibi and its clothes modern: yours are
natural adult proportions and hides.

**Decisions already made.**
- Exports from `src/game/actors/index.ts`: `createPerson: CreatePerson`, `createAnimal: CreateAnimal`, and
  `randomLook(seed: number, sex: Sex, ageYears: number): PersonLook` (a plausible look for the band).
- Heights: infant 0–1 ≈ 0.55–0.75 m; child of 6 ≈ 1.12 m; teen of 14 ≈ 1.52 m; adult women ≈ 1.55 m, men ≈ 1.65 m;
  elders slightly shorter and stooped. Age morphs continuously (`setAge`).
- Look: stylized but natural (between Firewatch and Sable), simplified faces with clear eyes (whites, dark irises,
  a highlight), brows, nose, lips, ears; they blink. Coiled hair styles as sculpted masses. Hide karosses and aprons
  in tan, brown and ochre with soft folds; shell bead strings in bone white; ochre marks. Children wear a small hide
  apron; infants wear a bead string. Never cartoon cavemen.
- Materials: `MeshStandardMaterial` (vertex colours, roughness ≈ 0.85, metalness 0) passed through `paint()` from
  `src/game/render/paint.ts` (a placeholder until world lands it; call it anyway). Skin gets `{ skin: true }`.
- Animation is procedural (no clip files): every `PersonAnim`, with blends (`fadeSeconds`), walk/run driven by
  `setSpeed` with planted feet, `setLookAt` turning head and eyes, `setTalking` (mouth + small gestures), held items
  in the hands (every `HeldItem` as a small mesh), `carry` with the infant in a back sling, on the hip or in arms.
- Budget: 25 people + 30 animals at 60 fps: at most 3 draw calls per person, shared materials.
- Animals (stylized, same look): eland (the hero animal: big, dewlap, spiral horns, tan with faint stripes), Cape
  fur seal, kelp gull (flying and standing), spotted hyena, lion, angulate tortoise, a stranded southern right
  whale (mostly static, breathing). Every `AnimalAnim` that makes sense per kind.

**Owns.** `src/game/actors/**`, `src/app/lab/people.tsx`.

**Items.**
1. `P1` (the sample): `createPerson` with the full age range and look variety, the anims idle, walk, run, crouch,
   gather, sit, carry (an infant on the back), held spear and digging stick, and `/lab/people`: a lineup of the fixed
   cast (Oro 62, Ama 28 carrying the infant, Tuk 31 with a spear, Kaya 10, the player at 6, a teen of 14, an elder
   man of 60) on a warm ground disc under a golden-hour key light and a sky-blue fill, orbit camera, an anim picker,
   an age slider, a "close-up" button that frames one face at 40 cm, and `window.__lab = { anim(name), age(years),
   closeup(i), lineup() }` (DEV). Ready with shots: the lineup, a close-up of Ama's face, a walk frame.
2. `P2`: every remaining `PersonAnim` and `HeldItem`, `setTalking`, blink, look-at, hip and arms carries, and a crowd
   test (`/lab/people?crowd=25` walking in circles) to prove the budget. Ready with shots.
3. `P3`: the animals with their anims; `/lab/people?animals=1` lineup and a herd of 12 eland walking/grazing/running.
   Ready with shots.

**Done when** (each item): your paths typecheck clean; shots taken and compared with the concept lineup; the
crowd test holds 60 fps on `?stats=1`.

## sim: opus-high, scratch /w/junk/sim-80k/sim/

**Goal.** The living band, as pure TypeScript: time, people, needs, knowledge, animals, food and fire, the AI
that runs their days, and the director that turns it into the five chapters.

**Read first.** The whole design doc; `contracts.ts` (Time, World data, Simulation); `src/core/clock.ts`,
`src/core/rng.ts`.

**Decisions already made.**
- Export `createSim: CreateSim` from `src/sim/index.ts`. Three-free and DOM-free. Deterministic for a seed.
- The fixed cast and names are in the design doc. The band: 22 people in 5–6 families, ages spread from infants
  to two elders, every adult with skills that fit (Ama: shellfish, tides, corms, beads, hides; Tuk: knapping, heat,
  hafting, tracking, spear; Oro: corms, medicine, stories, ochre, engraving). Looks via a local `randomLook` with the
  same signature as the actors' one (write your own in `src/sim/looks.ts`; three-free).
- Time: `clockAt` from core with an epoch per stage start; `timeScale` default 72 (one day per 20 real minutes).
- Daily life (sandbox, no director): the band sleeps in the cave at night, wakes at dawn, women and children go to
  the shore around the spring low tides, men go to the plateau to hunt or to the silcrete ridge, elders dig corms
  near the cave and tend the hearth, children play on the dunes, everyone returns by dusk, the hearth is fed, food
  goes to the hearth store and is eaten together in the evening, stories and singing at the fire, sleep. A utility
  AI picks tasks from needs, time, tide and role. NPCs move along paths from a grid A* over `WorldData.walkable`
  (2 m cells, cached, amortized), at walking speed 1.3 m/s, children 1.1, elders 0.9.
- Watching: a person doing a task with `skill` set teaches anyone within 6 m who lacks it, over 8 game-independent
  real seconds of watching (progress pauses when out of range). The player's ring is `state.watching`.
- Interactions: `interactionsNear` lists what the player can do now (gather at a shellfish bed only while its
  `tideMax` is above the sea level, dig at the corm patch, give at the hearth, talk to people, add wood…), gated by
  skills with the reason "You don't know how yet. Watch someone."
- Animals: an eland herd (8–14) grazing the plateau that flees from people upwind within 40 m or downwind within
  15 m and returns later; seals hauled out on the seal rocks; gulls over the shore; 2 hyenas that roam near the
  cave edge at night and keep away from fire; tortoises in the fynbos. A speared eland (`spear-hit`) is wounded,
  runs, then falls; meat goes to the hunters to carry.
- Weather: winter has rain and storms; a storm is scripted in Provider day 3.
- Save: `serialize()` → `{ version: 1, payload }`; loading validates with zod and throws a clear error on mismatch.
- Performance: a step for 22 people and 40 animals averages under 1 ms; pathfinding is amortized across frames.

**Owns.** `src/sim/**`, `src/app/lab/sim.tsx`.

**Items.**
1. `S1` (the sample): everything above except the director, against a fixture world (`src/sim/test-world.ts`, an
   analytic `WorldData` with every required POI) until `createWorldData` lands from world (then use the real one
   in the lab, keep the fixture for tests). `/lab/sim`: a top-down 2D canvas view (shaded height, the sea at the
   current tide, POIs, people as labelled dots coloured by task, animals, fires), time controls (pause, ×1, ×10,
   ×100, ×600), a click-to-inspect panel (needs, task, skills, relations), and a scrolling event log. Plus
   `bun test src/sim` (determinism, a full day without NaN or stuck agents, everyone asleep in the cave at 01:00,
   shellfish gathered at low tide, the hearth eaten from at dusk) and a headless day log:
   `bun apps/web/src/sim/run-day.ts --seed 1 --days 2` prints a compact timeline. Ready with a shot of the lab at
   morning low tide and at dusk.
2. `S2`: the director (`src/sim/director/`): beats as data per the design doc's chapter scripts, exact copy,
   objectives with progress, captions, notes (the `FIELD_NOTE_IDS`), choices, minigame and camera cues, time skips,
   chapter cards and ends; skip-to-chapter for every stage with a fitting band history (stage 3: the player 14 with
   Tuk and Ama alive; stage 4: the player 26 with a partner from the lagoon band and a child of 1, Oro very old;
   stage 5: the player 58, their children grown, grandchildren); the life summary and continue-as-heir; the
   storm and whale events. Add a director panel to `/lab/sim` (current beat, objective, a "complete beat" button).
3. `S3`: tuning and fixes from the play agent's playthrough, and anything the lead's review asks for.

**Done when** (each item): your paths typecheck clean; `bun test src/sim` passes; the run-day log reads like a
real day; the lab shot shows it.

## ui: opus-high, scratch /w/junk/sim-80k/ui/

**Goal.** Everything on screen that isn't the 3D world, and the sound: a quiet, painted, handmade interface, the
title and the paintings, the Field Notes that make people understand, the minigames, and the procedural audio.

**Read first.** The whole design doc (UI direction, Field Notes, the chapter scripts for exact copy);
`src/game/bridge.ts` (your entire contract with the game); `contracts.ts` (Caption, Objective, Choice,
LifeSummary, FIELD_NOTE_IDS, Audio); Sal's rules: no eyebrow labels above headings, no periods at the end of
headings.

**Decisions already made.**
- Root component `GameUI` exported from `src/ui/GameUI.tsx`: renders by `bridge.screen` and reads only through
  `useBridge`, calls only `bridge.actions.*`. It renders on the server too (SSR): no DOM access outside effects.
- Fonts: Fraunces (headings, the wordmark) and Figtree (UI text) from Google Fonts, linked in `index.html` (yours).
  Set `<title>OCHRE</title>` and a real description there.
- Screens: title (painted key art with slow parallax drift, the OCHRE wordmark with the Blombos cross-hatch motif,
  "Begin a life" with a name field defaulting to Teni, "Continue" when `hasLife`, "Chapters", "Field Notes"),
  chapter picker (the five stages with their paintings), intro (the four cards and captions from the design doc,
  click or 6 s to advance, Esc to skip), loading, HUD, chapter cards (painting, title, "Age 6"), pause (Resume,
  Field Notes, Family, Settings, Quit to title), Field Notes codex (grid of cards, unread marks, detail view),
  lineage (the band as a family tree with bonds), choice dialog, summary (the life summary and
  "Continue as <heir>").
- HUD: four need glyphs (fed, warmth, energy, health) as small painted marks that dim as they fall (no bars), a sun
  and moon dial with the tide, the objective line (top left, with "3/12"), captions (bottom centre: speech shows the
  speaker's name; narration in italic serif; songs with a small mark), the interaction prompt near the bottom
  ("E · Gather mussels", a hold ring, the disabled reason), toasts (top right: "You learned Shellfish", "New Field
  Note"), the watch ring ("Watching Ama · Shellfish" with a filling ring), name tags (bridge.nameTags, positioned
  by x/y), the wind mark, the aim reticle. Everything fades when idle and never covers the centre.
- Field Notes: `src/content/field-notes.ts` exports `FIELD_NOTES: Record<FieldNoteId, FieldNote>` with
  `{ id, title, body (60–120 words, accurate, plain English), site, date (e.g. "~75,000 years ago"), evidence (one
  sentence: how we know), image: '/art/notes/<id>.webp' }`. **Research with WebSearch; never write from memory**
  and keep the facts conservative. A painting for each.
- Art: GPT Image 2.5 Flare, up to 120 images; a shared style line in `ui.md` so they match (painted, warm, matte,
  the concept paintings' look). Ship as `.webp` (ffmpeg is installed) at ≤ 1600 px wide, ≤ 400 KB each, under
  `public/art/{title,intro,chapters,notes,ui}/`. Delete rejected drafts from `public/art` before committing.
- Minigames (`src/ui/minigames/`), opened when `bridge.minigame` is set, closed with
  `bridge.actions.minigameDone(game, quality)`: `knapping` (a silcrete core seen close, painted; click points on
  the edge to strike, the angle and force matter, flakes come off, aim for a symmetric leaf-shaped point; quality
  0..1 from symmetry and thinness; 30–90 s), `engraving` (scrape lines across a red ochre piece; it keeps what you
  make; quality = how many lines, no wrong answer), `beads` (pierce 8 small shells with a bone awl, timing-based).
- Audio (`src/game/audio/index.ts` exporting `createAudio: CreateAudio`): procedural WebAudio only (no files):
  surf and waves by distance, wind, fire crackle, birds by day and insects/frogs at night, rain, the muffled stage-1
  filter with a heartbeat, footsteps and every `SfxName`, and gentle music cues per stage (a plucked-string
  pentatonic, a soft hum drone, sparse and warm).
- `/lab/ui` (`src/app/lab/ui.tsx`): a mock driver with buttons for every screen and HUD state over a background
  painting, so each state can be checked by eye. Use `bridge.provide` with mock actions.
- Write `ui.md` (the visual language: palette tokens, type scale, spacing, motifs, motion, the image style line).

**Owns.** `src/ui/**`, `src/content/**`, `src/game/audio/**`, `public/art/**` except `public/art/concept/`,
`index.html`, `ui.md`, `src/app/lab/ui.tsx`, `src/styles/app.css`.

**Items.**
1. `U1` (the sample): `ui.md`, fonts, the title screen with its key art, the HUD (every element), captions, prompt,
   toasts, watch ring, name tags, objective, and `/lab/ui`. Ready with shots: the title, the HUD in a busy moment
   (watching + objective + caption + prompt + toast + name tags), a chapter card.
2. `U2`: intro cards (4 paintings), chapter cards and picker (5 paintings), pause, settings, the Field Notes codex
   with all 24 notes researched and painted, lineage, choice, summary. Ready with shots.
3. `U3`: the three minigames. Ready with shots.
4. `U4`: the audio module, with a test panel in `/lab/ui` (play each sfx, scrub the ambience inputs).

**Done when** (each item): your paths typecheck clean; every screen checked with bx at 1280×800 for alignment,
wrapping and legibility over bright and dark backgrounds; no text clipped; no eyebrows, no periods in headings.

## play: opus-high, scratch /w/junk/sim-80k/play/

**Goal.** Make it a game. The session that composes world, actors, sim, render and UI into the `/` route; the
controller, cameras and verbs that make each stage of life feel different; and the full playthrough.

**Read first.** The whole design doc; `contracts.ts`; `bridge.ts`; `engine/host.ts`; `app/client-mount.tsx`.

**Decisions already made.**
- `src/app/play.tsx` renders `<GameUI />` (from `~/ui/GameUI` once the ui agent lands it; until then a local
  minimal overlay of your own inside `src/game/play/`) and a `ClientMount` that loads `src/game/play/session.ts`,
  which exports `mount(el)`. The session: one `createHost`, one `createRenderPipeline`, `createWorldData(seed)`,
  `createWorldView`, `createSim`, one actor per `SimPerson`/`SimAnimal` (created and disposed as they appear and
  die), positions on `heightAt`, sim stepping, bridge writes, and `bridge.provide(...)` with every action.
- Until a module lands, use a stub of your own in `src/game/play/stubs/` (a flat-ish WorldData with every POI, a
  basic view, capsule actors, a stub sim with a few walkers). Swap each for the real one as soon as its owner
  commits it (watch `git log`). Delete the stubs when nothing uses them.
- Controller (stages 2–5): third person, WASD relative to the camera, Shift run (not as elder), mouse orbit camera
  (pointer lock on click; drag fallback), collision with the terrain and the cave shell, camera distance and height
  per stage (child: low and close; elder: slow, slight sway). Walk 1.4 m/s (child 1.2, elder 0.8), run 3.6
  (child 3.0). Movement respects `world.walkable` and slows in shallow water. Report movement with
  `{ type: 'move' }` each frame.
- Stage 1 camera: the infant is carried (`carriedBy`), the camera rides the carrier's sling or arms at the infant's
  eye, mouse look within a ±70° cone, `pipeline.setDream(0.6)`, the gaze ray picks the face nearest the screen
  centre within 6° and sends `{ type: 'gaze' }`; LMB on the offered shell sends the `reach` interaction.
- Interaction: each frame `sim.interactionsNear(player, 2.5)`; the nearest one becomes `bridge.prompt`; E presses or
  holds (holdSeconds) then sends `{ type: 'interact' }`. Name tags: project people within 25 m, throttled to 15 Hz.
- Events: route every `SimEvent` to the bridge (captions with expiry, objective, toasts with the Field Note title,
  chapter cards, choices, minigames) and to the camera (focus, fade, shake), the pipeline (fade) and audio (sfx).
- Spear (stage 3+ with a hafted spear): RMB aims (camera tightens, reticle via `bridge.hud.aiming`), LMB throws a
  spear projectile on a ballistic arc; hitting an animal's body sends `spear-hit` with quality from the point quality
  and distance; a miss leaves the spear stuck in the ground to pick up.
- Surf: in stage 2, stepping where the water is surf and deeper than 0.3 m pushes the player back up the shore with
  a small shake.
- Esc pauses (host paused, bridge screen `paused`). Saving: `sim.serialize()` to localStorage key `ochre.save.v1`
  every 30 s and on chapter end; "Continue" loads it.
- Performance: the whole game holds 60 fps at 1920×1080 on a mid GPU; profile with `?stats=1`.

**Owns.** `src/game/play/**`, `src/app/play.tsx`, `src/app/lab/play.tsx`.

**Items.**
1. `PL1` (the sample): the session with stubs (real modules swapped in as they land), the third-person controller
   and camera, the stage 1 carried camera with gaze, interactions and prompts, name tags, captions and toasts on the
   bridge, pause. `/lab/play` is your controller sandbox. Ready with a short description of the feel and shots: the
   third-person view at child height, the infant view.
2. `PL2`: spear aiming and throwing, surf push, camera cues, fades and time skips, minigame and choice hand-off,
   spoor marks while tracking (world's `spoor.ts` when it lands), the wind mark, audio wiring (`createAudio` when it
   lands: AudioFrame each frame, sfx on events and footsteps), save and continue.
3. `PL3`: play chapters 1→5 end to end with the real sim director (bx can't judge feel: play it via `window.__game`
   handles you expose: `qaState()`, `qaTeleport(poiId)`, `qaSkipBeat()`, `qaStage(stage)`), fix what's yours, and send
   precise `blocked`/`question` lines to the lead for others' bugs. Expose those handles in DEV only.

**Done when** (each item): your paths typecheck clean; the route loads with no console errors; shots taken.

## Standing answers

- (2026-10-17, lead) The lockfile must stay v1. Only the lead installs dependencies, with bun 1.3.14 at
  `/w/junk/sim-80k/bun13/bun-linux-x64/bun`. Applies to: all.
- (2026-10-17, lead) Sal pre-approved self-review: the lead's `pass` on your sample is the approval. Applies to: all.

- (2026-10-17 00:50, lead) `host.ts` creates the renderer with `reversedDepthBuffer: true` (3c5b2d9). Read
  `renderer.capabilities.reversedDepthBuffer` if your shaders write depth. Applies to: world, people, play.

## Ledger (lead, updated 2026-10-17 00:40)

Board: down · Last pushed: 60add27 (main) · Gate: typecheck green at 60add27 · Deploy: c61a551 live at https://ochre.dested.com (CI green)

| Agent | Model | Owns | Item now | Last sha / artifact | Status |
| --- | --- | --- | --- | --- | --- |
| world | opus-xhigh | world-gen, game/world, game/render | W1 | — | working (spawned 00:38) |
| people | opus-xhigh | game/actors | P1 | — | working (spawned 00:39) |
| sim | opus-high | sim | S1 | — | working (spawned 00:38) |
| ui | opus-high | ui, content, audio, public/art, index.html, ui.md | U1 | — | working (spawned 00:38) |
| play | opus-high | game/play, app/play.tsx | PL1 | — | working (spawned 00:38) |

Background jobs: lead dev server :4080 (log /w/junk/sim-80k/dev.log); Drydock portal :4400 (Windows bun, log in
scratchpad drydock-portal.log)
Images used: 2 / 200 (lead: concept env + people)
Waiting on Sal: none (needs-sal file: plans/2026-10-17-needs-sal.md)
Escalations: none
Next: watch commits; review each sample (W1, P1, S1, U1, PL1) as ready lines arrive; write the kit (cliffnotes, decisions).
