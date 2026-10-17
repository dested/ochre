# OCHRE: design

Status: active (2026-10-17). Owner: lead. The single source of truth for what the game is.
Agents build against this file and `apps/web/src/game/contracts.ts`. Where they disagree, ask the lead.

## The pitch

**OCHRE.** One life, eighty thousand years ago.

You are born in a cave above the sea at the southern tip of Africa, around 80,000 years before today. You are
exactly like the person playing: the same body, the same mind, the same fear of the dark. The world around you
is completely different. You live one whole life, from being carried on your mother's back to being the old one
who tells the stories at the fire. Each stage of life plays differently (the Spore idea, applied to one human
life). When you die, you go on as your grandchild, carrying what you taught them.

The game is about **understanding**: why these people did what they did, and how anyone survived. Every system
is grounded in real archaeology (Blombos Cave, Pinnacle Point, Klasies River, Sibudu, Panga ya Saidi), and the
Field Notes explain the real evidence behind what you just did.

Price point and bar: a $14.99 Steam game. It has to look like someone painted it.

## The setting

- **Where:** the southern Cape coast of South Africa, modelled loosely on the Blombos Cave area. A limestone
  cliff with a cave mouth about 35 m above the sea, a rocky intertidal shelf below it, a sandy cove, a dune
  field, a river mouth with a lagoon to the east, the fynbos plateau above the cliffs, and blue mountains far
  inland to the north.
- **When:** about 80,000 years ago (late Marine Isotope Stage 5). Cooler than today, the sea a little lower,
  winter rains (the Cape is a winter-rainfall region).
- **Who:** a band of about 22 people in five or six families, egalitarian, sharing everything, linked by
  marriage to neighbouring bands. Anatomically modern humans: dark to medium brown skin, tightly coiled hair,
  the full range of human faces and bodies. Depict them with dignity, never as cavemen: no hunching, no grunting.
- **What they have:** fire, hide cloaks, carrying bags, digging sticks, bifacial Still Bay spear points made
  from heat-treated silcrete, bone awls, red ochre (paint, sunscreen, hide tanning, glue), pierced shell beads
  (Nassarius kraussianus), engraved ochre, the knowledge of tides, plants, animals and stars.
- **Food:** shellfish (brown mussels, limpets, turban shells) at low spring tides, corms and bulbs dug from the
  fynbos (a huge, reliable carbohydrate source), tortoises, eland and other antelope, seals, the occasional
  stranded whale, honey, fruit.
- **Danger:** hunger, cold winter storms, lions, leopards and spotted hyenas at night, puff adders, the surf,
  injury, infection, childbirth.

### Names and language

People speak an unrecorded language. We never invent fake "primitive" speech. Dialogue appears as subtitles in
plain, warm English ("Come. The sea is sleeping."), with an optional soft murmured voice texture. Names come from
an invented, pleasant syllable table, two syllables at most, with no click letters and no names borrowed from a
living people: Ama, Tuk, Nehe, Sabo, Ilu, Kaya, Oro, Teni. The fixed cast below keeps these names; everyone else
comes from the table in `src/sim/names.ts` (sim agent).

### The fixed cast (every stage uses them)

| Role | Name | Notes |
| --- | --- | --- |
| Mother | Ama | Patient, laughs easily, the best shore forager |
| Father | Tuk | Quiet, a fine knapper and tracker |
| Grandmother (Ama's mother) | Oro | The singer and story-keeper; dies in Provider day 3 |
| Older sister | Kaya | Four years older than you |
| Widow with two children | Nehe | Her children are Ilu and Sabo |
| The player | chosen | Default "Teni"; the title screen offers a name field with that default |

## Structure: a life in five stages

Each stage is a chapter with its own body, camera, verbs and pace. The demo has a Chapters menu so any stage
can be entered directly (with a generated band and a fitting history).

| # | Stage | Age | Body and camera | Verbs | The feeling |
| --- | --- | --- | --- | --- | --- |
| 1 | **Held** | 0–1 | No body. Infant POV riding mother's back or arms; soft focus, warm vignette, muffled sound | Look, reach, cry | Everything is faces, warmth and the sea's breath |
| 2 | **Small** | 6 | A small child, third person, the world is huge | Follow, watch, gather, play, give | Learning by watching, the joy and danger of the shore |
| 3 | **Coming of age** | 14 | Teen, third person | Collect, knap, haft, track, throw, share, gift | Becoming useful, the first hunt, choosing someone |
| 4 | **Provider** | 26 | Adult, third person | Everything, plus teach and carry your own child | Keeping people alive through the seasons |
| 5 | **Elder** | 58 | Old body, slow, stiff | Engrave, tell, walk | Passing it on, and letting go |

### Core mechanics (all stages)

- **Watching is how you learn.** There is no XP. Knowledge is a set of skills (`SkillId` in contracts). You
  learn a skill by staying near someone who is doing it (a ring fills over ~8 seconds; walk away and it pauses).
  Later, people learn from you the same way: in Provider, your child watches you. This is cumulative culture,
  the real reason humans succeeded, made playable.
- **Knowledge gates verbs.** You can't gather shellfish safely until you know Shellfish, can't follow spoor
  until you know Tracking, can't heat-treat stone until you know Heat. Without a skill, the interaction prompt
  reads "You don't know how yet. Watch someone."
- **Needs:** hunger, warmth, energy, health (0..1). Shown as four small painted glyphs, never bars, and only
  from stage 2 on. Hunger falls over time and refills by eating at the hearth. Warmth falls at night, in rain
  and in wind, and refills near fire. Energy falls with exertion and refills with sleep.
- **Sharing.** Food you gather goes to the hearth, not your pocket. Eating is social: the band eats together in
  the evening. Giving food raises bonds. Hoarding is impossible by design.
- **Bonds.** Each person has a bond value with you (0..1). It rises with time near them, gifts, shared food and
  help. It's shown as name-tag warmth and in the Lineage view.
- **Time.** One in-game day is 20 real minutes at normal speed (stage 1 runs faster). The moon drives the tides:
  the lowest tides (spring tides) come near full and new moon, exposing the mussel beds. The calendar has four
  seasons; winter brings storms and rain.
- **Field Notes.** Short painted cards that unlock when you do something real ("You just heat-treated silcrete.
  People at Pinnacle Point were doing this 164,000 years ago."). Each has a title, a painting, a 60–120 word
  body, the real site, the date range and one sentence on how we know.

## Chapter scripts (the demo spine)

Each beat lists: the objective line (exact copy), what completes it, captions, and notes unlocked. Captions are
in the second person, present tense, short. Speech is attributed. The director (`src/sim/director/`) runs these
as data; the play layer implements the verbs.

### Intro (before stage 1)

Four painted cards with a slow push-in, one caption each, click or wait 6 s to advance:
1. "Eighty thousand years ago, at the southern edge of Africa, a cave looked out over the sea."
2. "The people who lived there were exactly like you. The same hands. The same mind."
3. "They had no writing, no metal, no farms. Everything they knew, they learned from each other."
4. "You are born at the end of winter, in the year the whale came ashore."

### Stage 1: Held

1. **Faces** · objective: "Look at the faces around you" · complete: learn 4 faces (look at a face for 1.5 s:
   it sharpens out of the blur and a name toast appears: "Mother · Ama"). Caption on enter: "Warmth. A
   heartbeat. A voice you already know."
2. **The sea** · objective: none (carried) · mother walks from the hearth down the path to the shore at low
   tide with you on her back (scripted path, ~60 s) · caption: "The world sways. Somewhere ahead, something
   enormous is breathing." On arrival: "The sea breathes in, and out." Unlock note `coastal-life`.
3. **The shell** · objective: "Reach for what she offers" · mother crouches at the rocks and holds out a small
   shell; LMB reach while looking at it · complete: you hold the shell. Caption (Ama): "Look. Small, like you."
   Unlock note `shell-beads`.
4. **Night** · carried back up to the hearth, dusk falls, grandmother sings (caption: "Your grandmother sings
   the song about the moon and the tide."), the fire, your eyes close (fade). Chapter card: "Small".

### Stage 2: Small (age 6)

1. **Follow** · objective: "Follow Ama to the rocks" · caption (Ama): "Come. The moon was full. The sea is
   sleeping." · complete: reach the shellfish bed with Ama · unlock `spring-tides`.
2. **Watch** · objective: "Watch Ama gather mussels" · complete: learn Shellfish · on learn toast: "You learned
   Shellfish".
3. **Gather** · objective: "Gather shellfish (0/12)" · complete: 12 · surf rule: stepping into breaking surf
   knocks you back and Ama calls "Not so far!" · unlock `shellfish`.
4. **The tide turns** · objective: "Get back to the sand before the sea wakes up" · the tide rises fast (scripted
   ×20 tide speed for 60 s) · complete: reach sand above the tide line.
5. **Play** · objective: "Catch the eland" · the other children play a hunting game; one child is the eland,
   tag them within 60 s (optional: completes either way after 60 s) · unlock `play`.
6. **The digging stick** · objective: "Watch Grandmother dig" then "Dig corms (0/3)" · learn Corms, then dig
   3 corms on the fynbos slope (hold E 2 s each) · a puff adder lies near the patch: if you come within 2 m,
   the camera nudges and Grandmother says "Stop. Look where you step." · unlock `corms`, `danger`.
7. **The fire** · objective: "Bring the food to the hearth" · give your corms and shellfish at the hearth
   (E on the hearth) · evening meal (everyone sits; 20 s of caption: "The corms roast in the coals. Everyone
   eats from the same fire.") · watch Father knapping by the fire (learn nothing yet; caption: "Your father
   turns a stone in his hands as if he is listening to it.") · sleep → chapter card "Coming of age" · unlock
   `sharing`, `fire`.

### Stage 3: Coming of age (age 14)

1. **Stone** · objective: "Walk with Tuk to the silcrete outcrop" then "Collect silcrete (0/3)" · unlock
   `silcrete`.
2. **Heat** · objective: "Bury the stones under the hearth" · E at the hearth · night falls (time skip with
   caption: "Under the coals, all night, the stone slowly changes.") · learn Heat · unlock `heat-treatment`.
3. **Knap** · objective: "Shape a spear point" · the knapping minigame (UI agent) · the result quality (0..1)
   is stored · unlock `still-bay`.
4. **Haft** · objective: "Haft the point" · E at the hearth with ochre and gum: caption "Ochre, gum and heat.
   Three things that make a fourth." · unlock `adhesives`.
5. **Track** · objective: "Follow Tuk onto the plateau" then "Watch Tuk read the ground" (learn Tracking) then
   "Follow the eland's trail" · spoor marks glow faintly once Tracking is known; the wind indicator matters:
   eland flee if you come within 40 m upwind or 15 m downwind.
6. **The throw** · objective: "Get close. Throw." · aim with RMB, throw with LMB; a hit wounds the eland; the
   party finishes it (no gore, a cut to the carry) · unlock `hunting`.
7. **The share** · objective: "Share the meat" · at the hearth choose who gets the first portions: three
   choices shown as people (Grandmother, the widow Nehe's children, Tuk). Each choice gets a short reaction;
   all are valid · unlock `reciprocity`.
8. **The gathering** · objective: "Go to the river mouth" then "Give your beads to someone" · the neighbouring
   band is camped at the lagoon; three young people you can talk to (one line each); give the bead string
   to one (E) · they become your partner · unlock `networks` · chapter card "Provider".

### Stage 4: Provider (age 26), sandbox with three beats

Free days. You have a partner and a child (age 1 at the start, on your back). Needs matter. The band runs its
day around you. Beats fire on day triggers:
1. **Day 1 · Teach** · objective: "Teach your child to dig corms" · dig corms with your child (age 5 in this
   beat; skip the years with a card) watching within 6 m · unlock `cumulative-culture`.
2. **Day 2 · The whale** · a whale strands in the cove at dawn. Objective: "Tell the others" (talk to 3
   people), then the whole band and the neighbours feast for a day · unlock `whale`.
3. **Day 3 · Winter** · a storm night: objective "Bring firewood before dark (0/5)" · if the fire dies, warmth
   crashes. Grandmother dies in the night (she is very old); a quiet mourning scene at dawn with ochre ·
   unlock `burial`.

### Stage 5: Elder (age 58)

1. **The mark** · objective: "Engrave the ochre" · the engraving minigame (UI agent): scrape lines across a
   piece of ochre, it keeps whatever you make · unlock `engraved-ochre`.
2. **The story** · objective: "Tell a story at the fire" · choose one of three stories (each named for a skill
   you know: "The night the sea slept", "How the stone learned fire", "The eland's trail"). The children who
   hear it learn that skill · unlock `stories`.
3. **The last walk** · objective: "Walk down to the sea" · slow walk, no HUD, dawn. Sit at the shore (E).
   Fade to the **Life summary**: years lived, children, what you taught, the bead you gave, the story you told.
   Then: "Continue as <grandchild name>" (starts stage 2 as the grandchild nearest 6, keeping the band, everyone
   aged to match) or "Return to the title".

## Visual direction ("painted light")

Target: Firewatch's painted atmosphere, Ghibli's warmth, Sable's clarity. Never photoreal, never cel-with-ink.

- **Shading:** soft three-step light ramps with warm light and cool, coloured shadows (no grey). Object colour is
  vertex colour or a flat albedo with a world-space brush-noise variation (no texture photos).
- **Atmosphere does the heavy lifting:** strong aerial perspective (distance fog tinted by the sky and sun
  direction), height fog in the lagoon at dawn, god rays through the cave mouth and clouds, sun glow.
- **Post:** a painterly filter (Kuwahara-style, low radius, stronger in the distance), canvas grain, soft edge
  darkening (watercolour pooling) on silhouettes, bloom on fire and sun, warm/cool split toning per time of day,
  vignette. Must stay readable: no mush on the player or faces.
- **Time of day is the colour script:** dawn (rose and lavender, lagoon fog), day (warm ochre land, teal sea),
  golden hour (long shadows, everything amber), dusk (violet, fire becomes the key light), night (deep blue,
  moonlight on the sea, stars, firelight pools).
- **The sea is a hero:** turquoise shallows, deep blue beyond, painted foam bands that move with the tide and
  waves, sparkle on the sun path, waves breaking on the rocks.
- **Foliage:** fynbos as rounded, clumped shrubs in sage, olive, rust and blond; proteas with pink heads; restio
  reeds; milkwood trees in the gullies; wind sway everywhere; instanced grass with gradient blades.
- **People:** stylized but adult proportions (not chibi), simplified faces with clear eyes and brows, readable at
  third-person distance. Hide cloaks (karosses) and aprons in tan and ochre, shell bead strings, ochre marks on
  skin, coiled hair styles. Children in small hide aprons. Elders thinner, greyer, a stick.
- **Palette anchors:** ochre red `#9c3d20`, burnt orange `#c2602e`, bone `#efe3c8`, charcoal `#2a2420`, sea teal
  `#2f6f73`, deep sea `#173a52`, fynbos sage `#7d8b5a`, dusk violet `#4a3a5c`, fire amber `#f2a03d`.

## UI direction

See `ui.md` (UI agent writes it in item 1). Painted, quiet and handmade. Headings in a warm serif (Fraunces),
UI in a humanist sans (Figtree). The motif is the Blombos cross-hatch engraving. No eyebrows, no periods in
headings, no modern-looking bars or chrome. The HUD is minimal and fades when nothing changes.

## Architecture

```
apps/web/src/
  game/contracts.ts        lead · every cross-module type and factory signature
  game/bridge.ts           lead · the game ⇄ UI store (useSyncExternalStore) + action handlers
  game/engine/host.ts      lead · renderer, loop, resize (one renderer per page)
  world-gen/               world · three-free: heightfield, surfaces, POIs, tide → WorldData
  game/render/             world · painted material patch, lights rig, post chain (RenderPipeline)
  game/world/              world · WorldView: terrain, sea, sky, foliage, rocks, cave, fires, weather
  game/actors/             people · createPerson / createAnimal: procedural meshes, rigs, animation
  sim/                     sim · three-free: clock, band, needs, knowledge, AI, animals, food, director, save
  game/play/               play · session (composes everything), player controller, cameras, verbs, spear
  game/audio/              ui (later item) · procedural WebAudio ambience, music, sfx
  ui/                      ui · React overlay: title, intro, HUD, captions, notes, lineage, minigames
  content/field-notes.ts   ui · the Field Notes data
  app/lab/*.tsx            one per agent · their sample page (/lab/world, /lab/people, /lab/sim, /lab/ui)
  app/play.tsx             play · the game route (/), mounts the session + <GameUI/>
```

- **One renderer per page**, created by `game/engine/host.ts`. Labs use it too.
- **Three-free where it can be:** world-gen and sim import nothing from three or the DOM, so they run in
  `bun:test` and a headless sim runner.
- **Determinism:** world-gen and sim draw randomness only from a seeded RNG (`src/sim/rng.ts`, mulberry32),
  never `Math.random()`.
- **Performance budget:** 60 fps at 1920×1080 on a mid desktop GPU, under 300 draw calls, terrain + sea +
  foliage instanced. Every lab and the game show `?stats=1` (fps, draw calls, triangles).
- **Persistence:** the life and lineage save to localStorage through `sim.serialize()` (zod-validated on load).
  Server saves (tRPC `lineage.*`, Prisma `Lineage`) are a later lead item.
- **Assets:** no downloaded models or photo textures. Geometry is procedural. Painted 2D art (title, intro
  cards, chapter cards, Field Notes) comes from GPT Image 2.5 Flare into `apps/web/public/art/`, prompted from
  the art bible in `ui.md`.
