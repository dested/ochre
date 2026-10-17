# OCHRE: UI and visual language

> Source of truth for how OCHRE's interface looks, reads and moves. Follow it for anything on screen that isn't the
> 3D world. Keep it current as part of finishing a UI change. The starter's auth pages (`/sign-in`, `/sign-up`,
> `/dashboard`) keep the shadcn look described at the end.

## North star

**Painted, quiet and handmade.** The interface should feel like marks on bone paper and scratches on ochre, laid
over a painting: warm serif type, soft halos instead of boxes, one engraved motif, and almost nothing on screen
while you play. Think Firewatch's restraint, Sable's clarity and the Blombos engraving.

Failure looks like (a) modern chrome: bars, pills, glassy panels, icon fonts, drop-shadowed cards; (b) a "caveman"
pastiche: stone-texture buttons, bone fonts, fake runes. Neither.

1. **The painting is the background.** Text sits straight on the world with a soft dark halo (`.ui-halo`), never in
   a box. Paper slips (toasts, choices) are the only surfaces.
2. **Nothing over the centre.** The middle of the screen belongs to the world (the aim reticle is the one exception).
3. **Fade when idle.** The needs and the dial show when they change and fade after a few seconds; hold Tab to see
   them. Low needs stay up and breathe.
4. **No eyebrows, no periods in headings.** No kicker or label above a heading, ever (ages and dates go *below* the
   title). Headings never end in a period; body copy and captions keep theirs.

## Palette

Tokens live in `apps/web/src/styles/app.css` (`@theme`) and mirror in `src/ui/palette.ts` (`C`) for inline SVG.

| Token | Hex | Tailwind | Use |
| --- | --- | --- | --- |
| ochre | `#9c3d20` | `text-ochre` | engraved marks on paper, the motif on dark |
| ochre-bright | `#c4552c` | `text-ochre-bright` | the motif over paintings, health |
| burnt | `#c2602e` | `text-burnt` | warm accents |
| bone | `#efe3c8` | `text-bone` | all primary text on the world; paper |
| bone-dim | `#cdbf9f` | `text-bone-dim` | secondary text (relations, reasons, labels) |
| charcoal | `#2a2420` | `text-charcoal` | text on paper |
| soot | `#16110e` | `bg-soot` | screen backgrounds, washes, halos |
| teal | `#2f6f73` | `text-teal` | the sea |
| deep | `#173a52` | `text-deep` | deep sea, night |
| sage | `#7d8b5a` | `text-sage` | fynbos |
| violet | `#4a3a5c` | `text-violet` | dusk |
| amber | `#f2a03d` | `text-amber` | the one highlight: speaker names, counts, rings, hover, skills |

Amber is the only "signal" colour. Never introduce a blue or green UI accent.

## Type

Fonts are linked from Google Fonts in `apps/web/index.html`: **Fraunces** (variable, `opsz` and `SOFT` axes) for
headings, the wordmark, narration and names; **Figtree** for UI text and speech.

| Role | Style |
| --- | --- |
| Wordmark | Fraunces 128 px (88 below `lg`), weight 560, tracking 0.16em, `opsz 144, SOFT 100`, over the cross-hatch band |
| Screen title | Fraunces 64–120 px (chapter card), 40–56 px (pause, picker), weight ~480, `SOFT 100` |
| Menu item | Fraunces 22–28 px, primary 30–40 px; hover turns amber and scratches the band in underneath |
| Narration caption | Fraunces italic 22 px, weight 380, `opsz 36, SOFT 100` |
| Speech caption | speaker in Fraunces semibold amber 17 px, then Figtree 19 px bone |
| Song caption | Fraunces italic 21 px between two small voice marks |
| Overheard chatter (`chat-` ids) | Figtree 16 px, bone at 75 % (speaker 55 %, no accent), tight wash; dim by colour, since `animate-ui-rise` ends at opacity 1 |
| Objective | Figtree 17 px medium, count in Fraunces amber tabular figures ("3/12") |
| Prompt | key cap Figtree 14 px semibold, label Figtree 18 px medium, disabled reason Fraunces italic 15 px |
| Name tag | Fraunces 16 px semibold (bone → amber with the bond), relation Figtree 12 px bone-dim below |
| Toast | Fraunces 17 px semibold charcoal, body Figtree 13.5 px |
| Small print | Figtree 12–13 px |

Large captions (setting) scale captions by 1.28. At most three captions show; past that, chatter is dropped first, then
the oldest.

## Motif: the Blombos band

`CrossHatch` in `src/ui/motifs.tsx`: two framing lines, a middle line and a row of crossing diagonals, as on the
engraved ochre from Blombos Cave, drawn as scratched strokes with deterministic jitter and the `#ui-brush` filter.
Uses: under the wordmark, under screen titles (180–260 px), the menu hover underline, the loading bar (it engraves
itself as the world builds). `HatchRule` is a short three-stroke separator. A numeric `width` picks the cell count
so cells stay slightly narrower than tall.

## Surfaces and filters

- **Halo** (`.ui-halo`, `.ui-halo-soft`): layered dark text-shadows for text on the world.
- **Paper** (`.ui-paper`): bone with a faint grain; the torn edge comes from `filter: url(#ui-rough)` on a separate
  backing layer, so the filter never touches text.
- **Soot wash** (`.ui-wash`): a soft radial soot pool behind HUD text that can land on a bright sky, sand or paper
  (objective, captions, prompt, name tags; the watch ring has its own). Deep enough (0.6 core) that bone text reads
  over midday sand; `.ui-wash-tight` is the smaller pool for name tags.
- **Grain** (`.ui-grain`): an overlay noise for full-screen paintings.
- SVG filters (`src/ui/defs.tsx`, rendered once by `GameUI`): `#ui-rough` torn edges, `#ui-brush` dry-brush strokes,
  `#ui-brush-soft` a gentle wobble for filled glyphs.

## Layout

```
 objective (top left)        watch ring (top centre)                 toasts (top right)

                              [ the world: nothing here ]
                                  reticle when aiming

 dial + needs (bottom left)     prompt, then captions (bottom centre)
```

Margins: `clamp(20px, 3vw, 44px)` sides, `clamp(18px, 3.4vh, 36px)` top. Menus sit in a left column at
`clamp(28px, 7vw, 120px)`. Everything is laid out in px for 1280×800 and checked there and at 1920×1080.

**Big screens** (`.ui-scale`, `--ui-zoom` in app.css): from 1600×960 the text blocks zoom 1.2, from 2400×1350 1.5.
Put `.ui-scale` on a HUD block's inner wrapper or a screen's content column, never on name tags (projected px),
canvases or full-screen backdrops; an offset that must clear a zoomed block multiplies by `var(--ui-zoom)`.

## HUD elements

- **Needs**: four painted glyphs (mussel shell = fed, flame = warmth, crescent = energy, ochre hand = health). They
  dim, cool and shrink as they fall; under 25% they breathe and stay visible when idle. Never bars or numbers.
- **Dial**: a 68 px medallion. Sky follows daylight; the sun and moon ride a circle (dawn left, noon top, dusk right;
  the moon shows its phase); the sea at the bottom rises and falls with the tide; "Spring low tide" / "Low tide" /
  "High tide" appear under it near the extremes. The wind mark is an arrow on the rim pointing where the wind blows,
  longer and with streaks as it strengthens.
- **Watch ring**: an eye inside a filling amber ring, "Watching Ama · Shellfish".
- **Prompt**: key cap ("E", "Click"), a hold ring around it, the label, and "hold"; disabled shows the reason in
  italic.
- **Name tags**: name, relation, a small tick down to the head; warmer with the bond; a voice mark while speaking.
  At most four at once (speaking, then kin, then bond, then nearness); a stranger's "Keda's daughter" line shows only
  while that person speaks, kin relations always. They fade out while a choice card is up.
- **Gaze mark**: a dashed bone ring at the centre during `held.faces`, so a baby who can only look knows where it is
  looking.
- **Toasts**: "Rebal learned Tides" slips for the same skill fold into one ("Rebal, Wume and 2 others learned
  Tides").
- **Control hints** (`hud/Hints.tsx`): first-use lines above the dial, small keycaps and low-contrast words, one at
  a time: watch ring > aiming > move/look/run (the elder walks and has no Shift) > look (while held: Mouse only) > an
  enabled E prompt > Esc. Each shows once per life (`ochre:hints`, cleared by "Begin a life" and by picking a
  chapter) and fades after use or a timeout. The clocks run only over live play (not under chapter cards, pause or a
  minigame). Derived from bridge state only.
- **Name tags** glide between the ~15 Hz positions (transform transition) and are clamped 80 px inside the edges.
  The HUD hides entirely under the pause screen.

## Title, About and loading

- The title's "About this world" opens `screens/About.tsx`: two paragraphs on Blombos and how the game uses the
  research, then every Field Note's evidence line grouped (The coast; Stone, fire and the hunt; Ochre, beads and
  marks; Growing up and living together). A new note must be added to a group there.
- The title's Continue card reads `bridge.saved`: the chapter's painting, "Continue as <name>", "<stage> · age N".
- Chapter cards fade out over 700 ms into the world before `chapterCardDone`.
- Family: rows are labelled by the player's direct line ("Parents" only when the row is the player's own line,
  otherwise "Your parents' generation" etc.); a row of more than four people drops skills and uses small faces; the
  player sits in the middle of their siblings; skills skip Faces and stop at three ("and 4 more").
- Field Notes lists found notes first. The summary groups what you taught by skill.
- Loading shows the coming chapter's painting (slow push), the Blombos band engraving with real `loadingProgress`,
  a rotating true line, and "Building the world · N%".

## Minigames

Full-screen over their own painting (`public/art/minigames/`), title and hint top left on a soot wash, actions
bottom right, one spoken line at a time (the family member by relation from `lineage`, else Tuk / Ama), and a
result card bottom left: a verdict heading ("A good point", "Sixteen lines", "Eight beads on the string"), one
italic line, Continue (Enter).

- **Knapping**: press on the edge of the silcrete, pull the hammerstone back, release. Angle off square decides the
  blow: under 20° bites the outline, 25–58° travels across the face and thins it, past 72° glances. Too square and
  hard breaks a chunk away; too deep where it is narrow snaps it across. Space turns the stone over (each face has
  its own scars and thickness). Quality = symmetry and fit to the leaf (60%) and thinness (40%), scaled down if
  small. Finish unlocks after 6 strikes.
- **Engraving**: drag inside the ochre (mask: reddish pixels flood-filled from the middle of the painting). A line
  counts at 60 image px. Quality = lines / 10.
- **Beads**: the awl sways; press over the glint, hold, release in the pale band. Aim narrows the band. 8 from 12.
  Quality = 65% strung / 8 + 35% precision.
- DEV hooks for automation: `window.__knap` (world), `window.__beads` (phase, setup), `__ui.minigame(name)`, and
  `/lab/ui?minigame=knapping|engraving|beads`.

## Motion

- Entrances: `animate-ui-rise` (10 px up + fade, 700 ms), `animate-ui-slip` (toasts from the right), `animate-ui-fade`.
- Idle fades: 1.2–1.6 s opacity transitions. Low states: `animate-ui-breathe` (2.4 s).
- Paintings: a slow push-in (chapter cards 1.02 → 1.09 over 9 s; intro cards 1.03 → 1.1). The title drifts in
  two-layer parallax and follows the pointer gently.
- Nothing bounces, nothing spins.

## Copy

Second person, present tense, short. Plain warm English ("Come. The sea is sleeping."). Never invented "primitive"
speech. Sentence case. No exclamation marks in UI chrome (characters may exclaim in speech). No emoji.

## Art: the image style line

All painted art comes from GPT Image 2.5 Flare with the two concept paintings
(`public/art/concept/env-cave-golden.png`, `public/art/concept/people-lineup.png`) passed as `--input` references,
and this line at the start of every prompt:

> A painting in a warm, matte oil-and-gouache style matching the reference images: visible confident brushstrokes,
> soft edges, no outlines, golden ochre light with cool violet and teal shadows, strong atmospheric perspective, the
> quiet dignity of a Ghibli background painting and Firewatch key art. The southern Cape coast of South Africa about
> 80,000 years ago: limestone cliffs, fynbos with proteas, a turquoise sea, a rocky intertidal shelf. People are
> anatomically modern Africans with dark to medium brown skin and tightly coiled hair, in hide karosses and aprons,
> shell-bead strings and red ochre marks, natural adult proportions; never cavemen, never hunched. No text, no
> lettering, no frame, no modern objects, no metal.

Then the scene, then "Composition leaves the lower-left third calm for a title" for anything with type over it.
Ship as `.webp` ≤ 1600 px wide and ≤ 400 KB under `public/art/{title,intro,chapters,notes,ui}/`. The title's
foreground layer (`title/key-fg.webp`) is a transparent cut-out of the key art's bottom edge for parallax.

## Code map

- `src/ui/GameUI.tsx`: the root; renders by `bridge.screen`.
- `src/ui/hud/`: `Hud` (layout and idle logic), `Needs`, `Dial`, `Lines` (objective, captions), `Marks` (prompt,
  watch ring, reticle, name tags), `Toasts`, `Hints` (first-use control hints).
- `src/ui/screens/`: title (+ chapter picker, about), intro, loading, chapter card, pause, settings, notes,
  lineage, choice, summary. `src/ui/format.ts`: ages ("a few months old" under 1, whole years after).
- `src/ui/minigames/`: `MinigameHost` (dispatch, clamps quality, calls `minigameDone`), `kit.tsx` (frame over a
  painting, spoken line, result card, canvas loop), `Knapping` + `knap-geom.ts` (pure outline geometry and
  `assess`), `Engraving` (keeps the on-stone runs of each line in localStorage `ochre:engraving`, shown on the summary as "The mark you
  left"), `Beads`, `sound.ts` (plays through `game/audio/shared.ts`).
- `src/ui/motifs.tsx`, `defs.tsx`, `palette.ts`, `widgets.tsx` (`MenuButton`, `TextButton`), `hooks.ts`.
- `src/content/`: field notes, stages, skill labels.
- `/lab/ui` (`src/app/lab/ui.tsx`): every screen and HUD state over a painting. `?preset=busy|quiet|low|disabled|
  aiming|night|held|choice`, `?screen=<screen>`, `?stage=<stage>`, `?bg=cave|title|shore|night|bright|black`,
  `?panel=0`, `?hold=1`, `?minigame=<game>`. Backquote toggles the panel; `window.__ui` drives it in DEV.

## The starter's pages

`/sign-in`, `/sign-up` and `/dashboard` keep the shadcn "new-york" look from `@app/tokens` (`packages/tokens/tokens.css`,
oklch, light and dark): `Button`, `Card`, `Input`, `Label` in `src/components/ui/`, a `max-w-5xl` column. They now
use Figtree as the body font. Don't restyle them as part of game work.
