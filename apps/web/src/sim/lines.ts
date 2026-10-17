/**
 * The band's talk, as data: one-line remarks keyed by speaker (the fixed cast by id, everyone else by role) and the
 * moment (stage, time of day, task, weather, tide, recent events). `talk.ts` picks the best unused one.
 * Voice: short, concrete, present tense, no modern idioms. `{name}` is the player's name.
 */
import type { LifeStageId, TaskKind } from '../game/contracts'

export type TalkCast = 'ama' | 'tuk' | 'oro' | 'kaya' | 'nehe' | 'ilu' | 'sabo'
export type TalkRole = 'elder' | 'woman' | 'man' | 'teen' | 'child'
export type TalkSpeaker = TalkCast | TalkRole
export type TalkWhen = 'morning' | 'day' | 'evening' | 'night'
export type TalkWeather = 'rain' | 'storm' | 'wind' | 'fog' | 'clear'
export type TalkRecent = 'whale' | 'storm' | 'oro-died' | 'loss' | 'note' | 'hunt'

export type TalkLine = {
  id: string
  who: TalkSpeaker
  text: string
  stage?: readonly LifeStageId[]
  when?: readonly TalkWhen[]
  task?: readonly TaskKind[]
  weather?: readonly TalkWeather[]
  tide?: 'low' | 'high'
  after?: TalkRecent
  /** 'you': only said to the player; 'band': only said to someone else nearby; default: either */
  to?: 'you' | 'band'
}

export const TALK_CAST: readonly TalkCast[] = ['ama', 'tuk', 'oro', 'kaya', 'nehe', 'ilu', 'sabo']
const SPEAKERS: readonly TalkSpeaker[] = [...TALK_CAST, 'elder', 'woman', 'man', 'teen', 'child']

type Cond = Omit<TalkLine, 'id' | 'who' | 'text'>

const YOUNG: readonly LifeStageId[] = ['held', 'small', 'youth']
const GROWN: readonly LifeStageId[] = ['provider', 'elder']
const HEARTH: readonly TaskKind[] = ['socialize', 'eat', 'sing', 'tell-story', 'tend-fire']

const BANK: Record<TalkSpeaker, ReadonlyArray<readonly [string, Cond?]>> = {
  // practical and warm: shellfish, tides, corms, beads, hides
  ama: [
    ['Twist, then pull. The shell comes away clean.', { task: ['gather-shellfish'] }],
    ['Only the big ones. The small ones are for next moon.', { task: ['gather-shellfish'] }],
    ['The sea is out far today. The moon pulled it.', { tide: 'low' }],
    ['The water is coming back. Keep one eye on it.', { tide: 'high', stage: YOUNG }],
    ['Dry leaves on top, a fat corm below. Look.', { task: ['dig-corms'] }],
    ['There is a hole in my bag. Hold this for me.', { stage: YOUNG }],
    ['Eat the mussels first. Corms keep, mussels do not.', { task: ['eat'] }],
    ['You walk like your father now. Quiet feet.', { stage: ['youth'] }],
    ['Stay where I can see you.', { stage: ['small'], to: 'you' }],
    ['Wash your hands in the pool. You smell of fish.', { stage: ['small'], to: 'you', when: ['day', 'evening'] }],
    ['Scrape the skin from the inside. Slowly, or it tears.', { task: ['idle', 'socialize'], stage: YOUNG }],
    ['Your little one has my mother\'s eyes.', { stage: ['provider'], to: 'you' }],
    ['Wrap the baby well. The wind has teeth tonight.', { stage: ['provider'], when: ['evening', 'night'] }],
    ['So much meat. We will be smoking it for days.', { after: 'whale' }],
    ['Bring the small ones close to the fire.', { weather: ['storm', 'rain'] }],
    ['She held you before I did. Did you know that?', { after: 'oro-died', to: 'you' }],
    ['Sit. Eat. You can tell me about it after.', { when: ['evening'], to: 'you' }],
    ['The beads are for giving. That is what they are for.', { stage: ['youth'] }],
    ['Hungry? There are corms in the coals.', { when: ['morning', 'day'] }],
    ['Your hair is full of salt. Come here.', { stage: YOUNG, to: 'you' }],
    ['The gulls know where the mussels are before we do.', {}],
    ['A good bag holds a whole tide of shells. This one holds half.', {}],
  ],
  // quiet and exact about stone and tracks
  tuk: [
    ['Hear how it rings? That is good stone.', { task: ['knap'] }],
    ['Strike the edge, not the face.', { task: ['knap'] }],
    ['Heat makes it glassy. The edge comes off thinner.', { stage: ['youth'] }],
    ['Two eland passed here at first light. One is lame.', { task: ['track', 'hunt'] }],
    ['The wind is on our faces. Good. They cannot smell us.', { task: ['track', 'hunt'] }],
    ['Read the dung. Still wet means close.', { task: ['track'] }],
    ['Mm.', {}],
    ['The red stone at the gully is the best for the gum.', { stage: YOUNG }],
    ['A point breaks. You make another.', {}],
    ['Watch my hands, not my face.', { stage: ['small', 'youth'], to: 'you' }],
    ['You threw well. Do not tell the others I said so.', { stage: ['youth', 'provider'], after: 'hunt', to: 'you' }],
    ['Meat for every hearth tonight.', { after: 'hunt' }],
    ['Rain washes the tracks. We stay in today.', { weather: ['rain', 'storm'] }],
    ['The whale came to us. We did nothing to earn it.', { after: 'whale' }],
    ['Oro showed me where the ochre sleeps. I will show you.', { after: 'oro-died', to: 'you' }],
    ['Sleep. The eland will still be there tomorrow.', { when: ['night'] }],
    ['Stone remembers every blow. So be sure of each one.', {}],
    ['The ridge has more silcrete than we can carry in a lifetime.', {}],
  ],
  // old and wry; tide and moon sayings
  oro: [
    ['Round moon, sleeping sea. Thin moon, lazy sea.', {}],
    ['The sea breathes twice a day. Watch it long enough and you will see.', {}],
    ['When I was small the sea was further out. Or I was shorter.', {}],
    ['My knees know the rain before the sky does.', { weather: ['rain', 'storm', 'wind'] }],
    ['Come and sit. My stories do not walk to you.', { task: HEARTH, to: 'you' }],
    ['Feed the fire, child. It is always hungry, like you.', { task: ['tend-fire', 'socialize'], when: ['evening', 'night'] }],
    ['Dig where the leaves are dry. The corm is fat under them.', { task: ['dig-corms'] }],
    ['I have eaten more mussels than there are stars.', { task: ['eat'] }],
    ['The red earth remembers. That is why we wear it.', {}],
    ['Your mother was louder than you at your age.', { stage: ['small'], to: 'you' }],
    ['Young ones run. Old ones arrive.', {}],
    ['A whale. Once before in my life, and I was smaller than you.', { after: 'whale' }],
    ['Hm. That storm is coming for my bones.', { weather: ['storm'] }],
    ['Let me hold the little one. I have done this before.', { stage: ['provider'] }],
    ['Hush now. This song is older than I am.', { task: ['sing', 'tell-story'] }],
    ['The fire is low. So am I. Both of us will last the night.', { when: ['night'] }],
    ['Do not count the days. They count themselves.', {}],
    ['Everything I know, someone showed me. Remember that.', {}],
  ],
  // teasing
  kaya: [
    ['You have sand on your face. No, the other side.', { stage: ['small'], to: 'you' }],
    ['Slow as a tortoise. I was there long before you.', { stage: ['small'], to: 'you' }],
    ['I found more than you. Count them.', { task: ['gather-shellfish', 'dig-corms'], stage: YOUNG, to: 'you' }],
    ['Mother says I have to wait for you. So I am waiting.', { stage: ['small'], to: 'you' }],
    ['Who are the beads for? You go very quiet when I ask.', { stage: ['youth'], to: 'you' }],
    ['You look at that one from the lagoon a lot.', { stage: ['youth'], to: 'you' }],
    ['My children are wild. Yours too. It runs in us.', { stage: GROWN }],
    ['You snore. The whole cave knows it.', { stage: GROWN, to: 'you' }],
    ['Fat from the whale on your chin. Very fine.', { after: 'whale', to: 'you' }],
    ['Remember when you fell in the rock pool? I do.', { stage: GROWN, to: 'you' }],
    ['Grey hair suits you. It makes you look wise.', { stage: ['elder'], to: 'you' }],
    ['Do not cry at the fire. Everyone will see.', { after: 'oro-died', to: 'you' }],
    ['Mother likes you best. Everyone knows it.', { to: 'you' }],
    ['Race you to the water. Loser carries the bag.', { stage: YOUNG, to: 'you' }],
  ],
  // careful, missing her partner
  nehe: [
    ['Not that path. The rocks are loose there.', {}],
    ['Ilu, Sabo, come away from the edge.', { stage: ['small'] }],
    ['He used to sit there, by the fire. I keep his place warm.', { task: HEARTH }],
    ['Count the children before dark. I always count twice.', { when: ['evening'] }],
    ['The sea took him in the cold months. I watch it closely now.', { tide: 'high' }],
    ['Eat slowly. There is no hurry tonight.', { task: ['eat'] }],
    ['He would have liked to see the whale.', { after: 'whale' }],
    ['I am careful. Somebody has to be.', {}],
    ['Hold the wood under your arm, not in front. You will trip.', { task: ['fetch-wood'] }],
    ['Stay inside tonight. Storms change the shore.', { weather: ['storm'] }],
    ['Ilu eats like two boys. Sabo eats like a bird.', { stage: YOUNG }],
    ['I dreamed of him again. He was laughing.', { when: ['morning'] }],
  ],
  // playful
  ilu: [
    ['Race you to the dunes.', { stage: ['small'], to: 'you' }],
    ['I am the eland. You cannot catch me.', { stage: ['small'], task: ['play'] }],
    ['I saw a snake as long as Tuk. Almost.', { stage: ['small'] }],
    ['Sabo cheated. She always cheats.', { stage: ['small'], task: ['play'] }],
    ['Tuk let me hold his spear. Only for a moment.', { stage: ['youth'] }],
    ['I can throw further than you. Want to see?', { stage: ['youth'], to: 'you' }],
    ['My boy runs faster than I ever did. It is unfair.', { stage: GROWN }],
    ['The whale is bigger than the cave. I measured it in steps.', { after: 'whale' }],
    ['Hunting is mostly walking. Nobody tells you that.', { stage: ['youth', 'provider'], task: ['track', 'hunt'] }],
    ['I can hold my breath longer than anyone. Count.', { stage: YOUNG }],
    ['Kaya says I am too loud. I am the right loud.', {}],
  ],
  sabo: [
    ['Look, a crab. It is waving at you.', { stage: ['small'], tide: 'low', to: 'you' }],
    ['I hid. You did not find me. I win.', { stage: ['small'], task: ['play'] }],
    ['Ilu says he is fast. He is not fast.', { stage: ['small', 'youth'] }],
    ['Can I have your shell? The pink one.', { stage: ['small'], to: 'you' }],
    ['I made a bead with a hole right through. Look.', { stage: ['youth'] }],
    ['Mother worries. I tell her the sea is asleep.', { stage: ['youth'] }],
    ['My man snores worse than you. I checked.', { stage: GROWN, to: 'you' }],
    ['We were small together. Now look at us. Old.', { stage: ['elder'], to: 'you' }],
    ['Whale fat in my hair. I do not care.', { after: 'whale' }],
    ['I know a pool with a starfish in it. It is a secret.', { stage: YOUNG, to: 'you' }],
    ['Mother counts us every night. I count her back.', {}],
  ],
  elder: [
    ['My back says it is time to sit.', {}],
    ['The young ones walk too fast for me now.', {}],
    ['Pass me the shell bowl. My arms are short today.', { task: ['eat'] }],
    ['I have seen many winters. This one feels long.', { weather: ['rain', 'storm', 'wind'] }],
    ['The stories keep us. Tell them right.', { task: ['tell-story', 'socialize'] }],
    ['Warm your hands first. Then your feet.', { when: ['evening', 'night'] }],
    ['Feed the fire. It is the oldest one here.', { task: ['tend-fire'] }],
    ['When the ochre runs out at the seam, we walk to the next.', {}],
    ['We will carry her into the cave and give her the red earth.', { after: 'loss', stage: ['provider'] }],
    ['I am old, not deaf. Speak up anyway.', { to: 'you' }],
    ['Sing it again. Slower. Old ears.', { task: ['socialize'], when: ['evening', 'night'] }],
  ],
  woman: [
    ['The limpets come off easier when the sun is on them.', { task: ['gather-shellfish'] }],
    ['Mind the green weed. It is slippery.', { task: ['gather-shellfish'], to: 'you' }],
    ['Dig around the root, not on it.', { task: ['dig-corms'] }],
    ['Have you eaten today?', { to: 'you' }],
    ['The sea is a long way out. Good day for the rocks.', { tide: 'low' }],
    ['Wood first, then sitting. The fire does not wait.', { task: ['fetch-wood', 'tend-fire'] }],
    ['The baby kept me up all night. Talk quietly.', { when: ['morning'] }],
    ['There is still smoked meat from the whale.', { after: 'whale' }],
    ['Wet wood again. It smokes more than it burns.', { weather: ['rain', 'storm'] }],
    ['Bring the children in. The wind is turning.', { weather: ['wind', 'storm'] }],
    ['That is a good bead. Who made the hole?', {}],
    ['Sing the slow one. The little ones are tired.', { task: ['sing', 'socialize'], when: ['evening', 'night'] }],
  ],
  man: [
    ['The herd moved up onto the high grass.', {}],
    ['My spear point snapped on bone. I need new stone.', { task: ['knap'] }],
    ['Gum, ochre, heat. Then bind it tight.', { task: ['knap'] }],
    ['We walked all day and saw only their dust.', { when: ['evening'] }],
    ['Stay downwind. Always downwind.', { task: ['track', 'hunt'] }],
    ['A good hunt. My shoulders will tell me tomorrow.', { after: 'hunt' }],
    ['No hunting in this wind. They hear everything.', { weather: ['wind', 'storm'] }],
    ['The whale is a gift. Eat until you cannot move.', { after: 'whale' }],
    ['Bring more wood before dark. It will be a cold one.', { when: ['day'], weather: ['wind', 'rain', 'storm'] }],
    ['Sit with us. There is room by the fire.', { task: HEARTH, to: 'you' }],
    ['The fire is low. I will go.', { task: ['tend-fire'], when: ['night'] }],
    ['Sleep. Talk tomorrow.', { when: ['night'] }],
  ],
  teen: [
    ['They let me carry the spear today. Only carry it.', {}],
    ['I am not tired. I could walk to the lagoon and back.', {}],
    ['Everyone talks about the whale. I touched its eye.', { after: 'whale' }],
    ['The lagoon people have shells we have never seen.', { stage: ['youth'] }],
    ['I made a point. It broke. I made another.', { task: ['knap'] }],
    ['Do not tell the elders I was on the high rocks.', { to: 'you' }],
    ['Who is that by the fire? I have not seen them before.', { stage: ['youth'] }],
    ['The storm took the old tree at the gully.', { after: 'storm' }],
  ],
  child: [
    ['Look, look, a crab.', { tide: 'low' }],
    ['I am the eland. You are the hunter.', { task: ['play'] }],
    ['Is it time to eat yet?', { when: ['day', 'evening'] }],
    ['I found a shell with a hole. It is mine.', {}],
    ['The fire made a star. Did you see?', { when: ['evening', 'night'] }],
    ['I am not sleepy.', { when: ['night'] }],
    ['A whale. A whale. It smells bad.', { after: 'whale' }],
    ['The thunder is very loud. I am not scared.', { weather: ['storm'] }],
    ['Teach me the string game again.', { to: 'you' }],
    ['Why is the sea gone? Where does it go?', { tide: 'low' }],
  ],
}

/** a moment worth talking about, for the whole band */
const MOMENTS: ReadonlyArray<readonly [TalkRole | 'any', string, Cond]> = [
  ['any', 'Did you hear? Something big has washed up in the cove.', { after: 'whale', when: ['morning'] }],
  ['any', 'The red earth on her skin. She looked asleep.', { after: 'oro-died' }],
  ['any', 'Oro would have had a saying for this.', { after: 'oro-died' }],
  ['any', 'The cave is quieter without her.', { after: 'loss' }],
  ['any', 'The wind pulled half the brush from the shelter.', { after: 'storm' }],
  ['any', 'Meat tonight. The hunters are back.', { after: 'hunt' }],
  ['any', 'You found something, I can see it on your face.', { after: 'note', to: 'you' }],
]

function build(): TalkLine[] {
  const out: TalkLine[] = []
  for (const who of SPEAKERS) {
    BANK[who].forEach(([text, cond], i) => out.push({ id: `${who}-${i}`, who, text, ...(cond ?? {}) }))
  }
  MOMENTS.forEach(([who, text, cond], i) => {
    const roles: readonly TalkRole[] = who === 'any' ? ['elder', 'woman', 'man', 'teen'] : [who]
    for (const r of roles) out.push({ id: `moment-${i}-${r}`, who: r, text, ...cond })
  })
  return out
}

export const TALK_LINES: readonly TalkLine[] = build()

// ─── the last walk's memories ───────────────────────────────────────────────────────────────────────────────

/**
 * What the elder sees on the last walk down to the sea (elder.walk), narrated, filled from the life's own record
 * by `director/memories.ts`. Voice: present tense, plain and sensory, at most 12 words, no moral, never
 * "you remember". `{name}` is the person the memory is about; `{a}`, `{b}`, `{c}` the children.
 */
export type MemoryKind =
  | 'mother'
  | 'mother-shell'
  | 'seal-pup'
  | 'tide'
  | 'lion-eyes'
  | 'rain-dash'
  | 'honeyguide'
  | 'hunt'
  | 'beads'
  | 'partner'
  | 'children-1'
  | 'children-2'
  | 'children-3'
  | 'first-steps'
  | 'taught'
  | 'whale'
  | 'moon-dance'
  | 'buried'
  | 'engraving'
  | 'story'
  | 'heir'

export const MEMORY_LINES: Record<MemoryKind, string> = {
  mother: "{name}'s face above you, firelight moving in her eyes.",
  'mother-shell': "{name}'s fingers, a shell cool and wet in your palm.",
  'seal-pup': 'A seal pup on the warm rocks, blinking at you.',
  tide: 'Cold water round your ankles, the sea coming in fast.',
  'lion-eyes': 'Two eyes in the dark past the fire, then gone.',
  'rain-dash': 'Rain hammering the rocks, everyone running for the cave, laughing.',
  honeyguide: 'A little bird calling from the bushes, and honey on every chin.',
  hunt: "The eland's breath steaming, the spear light in your hand.",
  beads: "Shell beads warm from your neck, in {name}'s open hand.",
  partner: "{name}'s shoulder against yours, the fire burning low.",
  'children-1': '{a} asleep against you, small and heavy and warm.',
  'children-2': '{a} and {b} asleep against you, one on each side.',
  'children-3': '{a}, {b} and {c} asleep in a heap against you.',
  'first-steps': '{name} wobbling across the sand toward you, arms out.',
  taught: "{name}'s small hands copying yours, slow, then sure.",
  whale: 'The whale on the sand, and everyone shouting, running down.',
  'moon-dance': 'Feet stamping round the fire under a full white moon.',
  buried: '{name} under the red ochre, the storm gone quiet.',
  engraving: 'Red lines cut in the ochre, sharp under your thumb.',
  story: "Small faces in the firelight, waiting for the story's end.",
  heir: '{name} asleep by the fire, fists curled tight.',
}

/** when the record is thin: the sea and the shelter */
export const MEMORY_FALLBACK: readonly string[] = [
  'The same sea coming in over the same rocks.',
  'Smoke climbing the cave wall, the way it always has.',
  'Wind off the water, salt on your lips.',
]
