# OCHRE

**One life, eighty thousand years ago.**

<p align="center">
  <img src="docs/screenshots/title.jpg" alt="The OCHRE title screen: a painted view of the southern Cape coast at sunset, a band walking the cliff path" width="100%">
</p>

You are born in a cave above the sea at the southern tip of Africa, about 80,000 years before today. Your body and
mind are the same as the player's: the same hands, the same fear of the dark. The world around you is nothing like
ours. You live one whole life, from riding on your mother's back to being the old one who tells the stories at the
fire. Each stage of life plays differently, the way Spore turns a species into a series of games, here applied to
one human life. When you die, you carry on as your grandchild.

The game is about understanding: why these people did what they did, and how anyone got through a winter. Every
skill is learned the way it was then, by watching someone who already knows.

**Play it in the browser: [ochre.dested.com](https://ochre.dested.com)**

OCHRE is a playable prototype. It was built from scratch overnight by a team of AI agents. You can play from
birth to death, and the five chapters, the living band, the world and the codex are all in. It is not a finished
game. Notes on what's missing are in [Status](#status).

<p align="center">
  <img src="docs/screenshots/intro-whale.jpg" alt="A painted intro card: the band walks down to a whale stranded on the beach. Caption: You are born at the end of winter, in the year the whale came ashore." width="100%">
</p>

## Contents

- [A life in five chapters](#a-life-in-five-chapters)
- [The coast](#the-coast)
- [The band](#the-band)
- [Learning by watching](#learning-by-watching)
- [Field Notes](#field-notes)
- [When you die](#when-you-die)
- [Controls](#controls)
- [Run it locally](#run-it-locally)
- [How it's built](#how-its-built)
- [Status](#status)
- [Credits](#credits)
- [License](#license)

## A life in five chapters

The game is one life, told in five chapters. A director runs 29 beats across them, while the band carries on with
its own day around you. The Chapters screen lets you jump to any stage.

<p align="center">
  <img src="docs/screenshots/chapters.jpg" alt="The Chapters of a life screen: five painted cards for Held, Small, Coming of age, Provider and Elder" width="100%">
</p>

### Held

**Birth.** Everything is faces, warmth and the breath of the sea. You can't walk or talk. You look. The camera is
your eyes in your mother's arms. Who you look at, and how long you look, is the whole game.

<p>
  <img src="docs/screenshots/held-faces.jpg" alt="Held: looking up at Ama, your mother, under the cave roof at sunset; the objective reads Look at the faces around you" width="49%">
  <img src="docs/screenshots/held-sea.jpg" alt="Held: from the cave mouth, the sea at sunset below the cliff" width="49%">
</p>
<p align="center">
  <img src="docs/screenshots/held-night.jpg" alt="Held: night at the hearth; caption: Your grandmother sings the song about the moon and the tide" width="70%">
</p>

### Small

**Age 6.** You learn by watching, on a shore that is wide and full of wonders. You follow Ama to the rocks, gather
mussels, beat the spring tide back to the sand, dig corms with your grandmother, and play on the dunes.

<p>
  <img src="docs/screenshots/chapter-small.jpg" alt="The Small chapter card: painted children running through the fynbos above the sea" width="49%">
  <img src="docs/screenshots/small-corms.jpg" alt="Small: digging corms in the fynbos with the band; a card reads You learned Corms, from watching Oro" width="49%">
</p>
<p align="center">
  <img src="docs/screenshots/small-fire.jpg" alt="Small: the whole band round the fire inside the cave at dusk; caption: The corms roast in the coals. Everyone eats from the same fire." width="100%">
</p>

### Coming of age

**Age 14.** Stone, fire and the first hunt, and becoming someone people need. Walk to the silcrete outcrop with your
father, bury stones under the hearth to change them, shape a spear point, haft it with glue, track eland onto the
plateau and get close enough to throw.

<p>
  <img src="docs/screenshots/chapter-youth.jpg" alt="The Coming of age chapter card: a painted young man studying stone with his elders" width="49%">
  <img src="docs/screenshots/youth-spear-point.jpg" alt="Coming of age: the band works round the fire in the cave; you are watching Sabo work hides, and the prompt reads Shape a spear point" width="49%">
</p>
<p align="center">
  <img src="docs/screenshots/youth-hunt.jpg" alt="Coming of age: two hunters with spears in the long grass of the plateau; objective: Get close. Throw." width="100%">
</p>

### Provider

**Age 26.** Keeping the people you love alive through the seasons. Teach your own child to dig, bring in firewood
before a winter storm, and run to tell the band when a whale comes ashore.

<p>
  <img src="docs/screenshots/chapter-provider.jpg" alt="The Provider chapter card: a painted eland bull above the sea, hunters crouched in the bush" width="49%">
  <img src="docs/screenshots/provider-whale.jpg" alt="Provider: a southern right whale stranded on the cove beach; caption: Gulls wheel over the cove, screaming, already fighting over it." width="49%">
</p>

### Elder

**Age 58.** Passing it on, and letting go. Engrave a piece of ochre the way it was done at Blombos Cave, tell a
story at the fire, spend a last evening with the band and walk down to the sea.

<p>
  <img src="docs/screenshots/chapter-elder.jpg" alt="The Elder chapter card: a painted old man teaching children to work stone at the cave mouth" width="49%">
  <img src="docs/screenshots/elder-story.jpg" alt="Elder: the band gathered in a ring round the fire in the cave; the prompt reads Tell a story" width="49%">
</p>
<p align="center">
  <img src="docs/screenshots/elder-walk.jpg" alt="Elder: an old woman stands on the rocks at the water's edge at sunset; objective: Walk down to the sea" width="100%">
</p>

## The coast

The world is generated from code: a cliff cave above a rocky shore, a sandy cove, dunes, and a plateau of grass and
fynbos behind the cliffs. The tide rises and falls with the moon. Spring and neap tides come from the real lunar
cycle, and the sun and moon move as they do at 34° south. Weather rolls in, and day turns to night. A custom
"painted light" renderer turns all of it into something like an oil sketch.

<p align="center">
  <img src="docs/screenshots/world-aerial.jpg" alt="Aerial view of the generated coastline: cliffs, a long beach, dunes and the plateau beyond, in late afternoon light" width="100%">
</p>
<p>
  <img src="docs/screenshots/world-cave.jpg" alt="Looking out from inside the cave over a hearth to the sea and the beach at golden hour" width="49%">
  <img src="docs/screenshots/world-lookout.jpg" alt="The cliff-top lookout at sunset, the sun low over the sea" width="49%">
</p>
<p>
  <img src="docs/screenshots/world-cove.jpg" alt="Sunset over the cove, the dunes in silhouette" width="49%">
  <img src="docs/screenshots/world-storm.jpg" alt="A storm on the cove: rain slanting across the dunes under a dark sky" width="49%">
</p>

## The band

A band of 20 to 30 people lives in the cave: your family, the families you marry into, the old and the newborn. Each one is
modelled, rigged and dressed in code, from infant to elder, with around twenty animations: walking, carrying,
sitting at the fire, sleeping, knapping, throwing. They have names, relationships and needs, they go about their day
without you, and they remember what you taught them.

<p align="center">
  <img src="docs/screenshots/people-lineup.jpg" alt="A lineup of procedural people: a grandmother with a staff, a mother carrying an infant, a father with a spear, a girl, a boy, a young man and an old man" width="100%">
</p>
<p align="center">
  <img src="docs/screenshots/people-faces.jpg" alt="Four faces close up: a grandmother with white hair, a mother with her baby, a bearded father, an old man with a white beard; all wear shell beads and red ochre marks" width="100%">
</p>

The Family screen shows everyone you're related to and, in the ring around each face, how close you are.

<p align="center">
  <img src="docs/screenshots/family.jpg" alt="The Family screen: a tree of grandparents, parents, your generation and the next, then the rest of the band, each with their age, closeness and skills" width="100%">
</p>

## Learning by watching

You can't do anything until you've seen someone do it. Stand near a person who is working and watch. A ring fills,
and you learn the skill from them. Later in life, children learn from you the same way. Some skills open a hands-on
minigame painted in the same style as the rest of the game.

<p>
  <img src="docs/screenshots/minigame-knapping.jpg" alt="The knapping minigame: a silcrete stone half shaped into a point on a hide by the fire, the sea behind" width="49%">
  <img src="docs/screenshots/minigame-engraving.jpg" alt="The engraving minigame: a cross-hatched pattern scored into a piece of red ochre, like the Blombos Cave engravings" width="49%">
</p>

**Knapping:** press on the edge, pull the hammerstone back and let go. Square blows shape the edge, slanting blows
thin the face, and Space turns the stone over. **Engraving:** drag a stone point across the ochre, and every line
stays.

## Field Notes

Every activity in the game is something people really did, and the game shows you how we know. Doing something
for the first time unlocks a Field Note. There are 24, each with a painting, a short account and the evidence behind
it: the heat-treated silcrete, the Still Bay points, the three-part hafting glue, the engraved ochre of Blombos Cave.

<p>
  <img src="docs/screenshots/field-notes.jpg" alt="The Field Notes codex: a grid of painted cards such as Silcrete, Changed by fire, Still Bay points, Glue from three things, The eland, When a whale came ashore" width="49%">
  <img src="docs/screenshots/field-note.jpg" alt="The Marks on ochre Field Note: a painting of engraved red ochre beside an account of the Blombos finds and how we know" width="49%">
</p>

## When you die

At the end of a life you see what it added up to: your children, what you taught and to whom, the beads you gave,
the story you told. Then you carry on as your grandchild, and the band goes on.

<p align="center">
  <img src="docs/screenshots/life-summary.jpg" alt="The life summary for Teni, 58 years beside the sea: children, what you taught, the beads you gave, the story you told, Field Notes found, and Continue as Rebal, your grandchild" width="100%">
</p>

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Move |
| Mouse | Look |
| Shift | Run |
| C | Crouch |
| E | Do what the prompt says (hold it while the ring fills) |
| Tab | Show the HUD, which fades out of the way on its own |
| Esc | Pause: Field Notes, Family, Settings |

## Run it locally

You need [Bun](https://bun.sh) 1.3 and a Postgres database. The server's health check and accounts use Postgres;
the game itself saves to the browser.

```bash
git clone https://github.com/dested/ochre.git && cd ochre
bun install
cp .env.example .env              # point DATABASE_URL at your Postgres
createdb ochre
bun run --cwd apps/web db:deploy  # apply the migrations
bun run dev                       # → http://localhost:4080
```

Use Bun 1.3 for installs. Bun 1.4 rewrites `bun.lock` into a format the deploy image can't read yet.

| Command | What it does |
| --- | --- |
| `bun run dev` | The game with hot reload on http://localhost:4080 |
| `bun run typecheck` | `tsc` across every workspace (strict, `noUncheckedIndexedAccess`) |
| `bun run test` | Unit tests, including the sim and world generation |
| `bun run build` | Production build of the client and the SSR server |
| `bun apps/web/src/sim/run-day.ts --seed 1 --days 2` | Run the band through two days headless and print what happened |

Each part of the game has its own lab page for working on it in isolation:

| Page | What it shows |
| --- | --- |
| http://localhost:4080/lab/world | The world at any hour, moon, weather and camera (`?view=cave&hour=17.5`) |
| http://localhost:4080/lab/people | People of every age, every animation, face close-ups; `?animals=1` for the animals |
| http://localhost:4080/lab/sim | The band from above, with time controls and the director's state |
| http://localhost:4080/lab/ui | Every screen and HUD state, and the audio |
| http://localhost:4080/lab/play | The controller and cameras |

Add `?stats=1` to any page for frame time, draw calls and triangles.

## How it's built

| Layer | Choice |
| --- | --- |
| Rendering | [three.js](https://threejs.org) 0.185 with a custom painted-light pipeline: painted shading on every material, then a post chain of aerial perspective, bloom, a filmic grade, a Kuwahara paint filter whose brush grows with distance (faces stay crisp, the far coast turns to brushwork), and strokes laid along the image's flow over canvas grain |
| World | A procedural heightfield with surfaces, points of interest and a tide model; no three.js or DOM, so it runs under unit tests |
| People and animals | Meshes, rigs, clothing and animation generated in code, with no model files |
| Simulation | A deterministic sim of the band: needs, food and fire, daily routines, relationships, watch-to-learn skills, and a director that runs the chapters |
| UI | React 19 and Tailwind 4 over the canvas: HUD, captions, chapter cards, Field Notes, Family, minigames |
| Audio | Generated live with WebAudio: wind, surf, fire, birds, footsteps and music cues, no sound files |
| Art | The painted title, intro, chapter, Field Note and minigame art was generated with GPT Image 2.5 |
| App | A Bun workspace: Express 5 with Vite SSR, React Router 7, tRPC 11, Prisma 7 on Postgres, TypeScript 7 strict |

The world generator and the sim never import three.js or the DOM. Everything that crosses between modules is typed
in one contracts file (`apps/web/src/game/contracts.ts`), and the game talks to the React UI through a single bridge
store. [`cliffnotes.md`](cliffnotes.md) maps every file, and [`decisions.md`](decisions.md) records why things are
the way they are.

## Status

OCHRE is a prototype, built to prove the idea out. Not done yet:

- **Voice:** every line is a caption for now.
- **Saves are local** to your browser. No accounts or cloud saves.
- **Performance:** only measured on an integrated GPU. Busy scenes draw over a million triangles, and a dedicated GPU
  pass hasn't happened.
- **Mobile:** desktop browsers with a mouse and keyboard only.
- **Rough edges:** some objectives don't yet point you to where you need to go. You can walk into bushes. A few props
  and garments clip.

## Credits

- Built on [sal-starter](https://github.com/dested/sal-starter).
- The procedural mesh builder, walk gait and face-colour rules are adapted from celworld, Sal Aiello's own engine.
- The game's subject is the work of the archaeologists who excavated and studied Blombos Cave, Pinnacle Point, Sibudu
  and the other Middle Stone Age sites of the southern Cape. Each Field Note cites its sources.

## License

[MIT](LICENSE) © 2026 Sal Aiello
