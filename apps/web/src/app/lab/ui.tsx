/**
 * /lab/ui: the UI over a painting, driven by a mock. Buttons for every screen and HUD state, so each can be
 * checked by eye. URL: ?preset=busy&bg=cave&panel=0&hold=1 (hold keeps chapter cards and intros from advancing).
 * DEV handle: window.__ui = { preset(name), screen(name), bg(name) }.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { bridge, useBridge, type BridgeState, type Screen, type Toast } from '~/game/bridge'
import { FIELD_NOTE_IDS, LIFE_STAGES, type Caption, type LifeStageId, type MinigameId } from '~/game/contracts'
import { clockAt } from '~/core/clock'
import { STAGES } from '~/content/stages'
import { GameUI } from '~/ui/GameUI'

const BACKGROUNDS = {
  cave: '/art/concept/env-cave-golden.png',
  title: '/art/title/key-bg.webp',
  shore: '/art/chapters/small.webp',
  night: '/art/chapters/elder.webp',
  bright: '/art/concept/people-lineup.png',
  black: '',
} as const
type BgName = keyof typeof BACKGROUNDS

function isBg(v: string): v is BgName {
  return v in BACKGROUNDS
}

const SCREENS: readonly Screen[] = ['title', 'intro', 'loading', 'playing', 'chapter-card', 'paused', 'notes', 'lineage', 'summary']
function isScreen(v: string): v is Screen {
  return (SCREENS as readonly string[]).includes(v)
}
function isStage(v: string): v is LifeStageId {
  return (LIFE_STAGES as readonly string[]).includes(v)
}

const GAMES: readonly MinigameId[] = ['knapping', 'engraving', 'beads']

const EPOCH = { dayOfYear: 250, hour: 0, moonPhase: 0.5, year: 0 }
const clockFor = (hour: number, moonPhase = 0.5) => clockAt(hour * 3600, { ...EPOCH, moonPhase })

let seq = 0
const id = (p: string) => `${p}-${++seq}`
const cap = (kind: Caption['kind'], text: string, speaker: string | null = null): Caption => ({
  id: id('cap'),
  kind,
  text,
  speaker,
  seconds: 6,
})
const toast = (kind: Toast['kind'], title: string, body: string | null = null, noteId: string | null = null): Toast => ({
  id: id('toast'),
  kind,
  title,
  body,
  noteId,
})

const BASE_HUD: BridgeState['hud'] = {
  visible: true,
  name: 'Teni',
  ageYears: 6,
  stage: 'small',
  needs: { fed: 0.72, warmth: 0.84, energy: 0.58, health: 0.95 },
  clock: clockFor(9.1),
  inventory: null,
  watching: null,
  wind: { dir: 0.9, strength: 0.45 },
  aiming: false,
}

type Person = BridgeState['lineage'][number]
const person = (p: Partial<Person> & Pick<Person, 'id' | 'name' | 'relation' | 'ageYears' | 'generation'>): Person => ({
  alive: true,
  bond: 0.5,
  skills: [],
  motherId: null,
  fatherId: null,
  partnerId: null,
  isPlayer: false,
  ...p,
})

const LINEAGE: BridgeState['lineage'] = [
  person({ id: 'oro', name: 'Oro', relation: 'Grandmother', ageYears: 62, generation: -2, bond: 0.8, partnerId: 'gau', skills: ['corms', 'medicine', 'stories', 'ochre', 'engraving'] }),
  person({ id: 'gau', name: 'Gau', relation: 'Grandfather', ageYears: 64, generation: -2, alive: false, bond: 0.2, partnerId: 'oro', skills: ['tracking'] }),
  person({ id: 'ama', name: 'Ama', relation: 'Mother', ageYears: 28, generation: -1, bond: 0.95, motherId: 'oro', fatherId: 'gau', partnerId: 'tuk', skills: ['shellfish', 'tides', 'corms', 'beads', 'hides'] }),
  person({ id: 'tuk', name: 'Tuk', relation: 'Father', ageYears: 31, generation: -1, bond: 0.7, partnerId: 'ama', skills: ['knapping', 'heat', 'hafting', 'tracking', 'spear'] }),
  person({ id: 'sefu', name: 'Sefu', relation: 'Uncle', ageYears: 25, generation: -1, bond: 0.45, motherId: 'oro', fatherId: 'gau', skills: ['spear'] }),
  person({ id: 'kaya', name: 'Kaya', relation: 'Sister', ageYears: 10, generation: 0, bond: 0.75, motherId: 'ama', fatherId: 'tuk', skills: ['shellfish'] }),
  person({ id: 'teni', name: 'Teni', relation: 'You', ageYears: 6, generation: 0, bond: 1, motherId: 'ama', fatherId: 'tuk', isPlayer: true }),
  person({ id: 'lino', name: 'Lino', relation: 'Cousin', ageYears: 3, generation: 0, bond: 0.5, fatherId: 'sefu' }),
  person({ id: 'nehe', name: 'Nehe', relation: 'Neighbour', ageYears: 33, generation: -1, bond: 0.35, skills: ['hides', 'corms'] }),
  person({ id: 'ilu', name: 'Ilu', relation: "Nehe's son", ageYears: 8, generation: 0, bond: 0.4, motherId: 'nehe' }),
  person({ id: 'sabo', name: 'Sabo', relation: "Nehe's daughter", ageYears: 5, generation: 0, bond: 0.3, motherId: 'nehe' }),
]

type Preset = Partial<Omit<BridgeState, 'hud'>> & { hud?: Partial<BridgeState['hud']> }

const PRESETS: Record<string, () => Preset> = {
  busy: () => ({
    screen: 'playing',
    hud: {
      watching: { name: 'Ama', skill: 'shellfish', progress: 0.62 },
    },
    objective: { id: 'small.gather', text: 'Gather shellfish (3/12)', done: 3, total: 12 },
    captions: [
      cap('speech', 'Come. The moon was full. The sea is sleeping.', 'Ama'),
      cap('narration', 'The rocks are bare and shining. Things move in the pools.'),
    ],
    prompt: { label: 'Gather mussels', key: 'E', holdSeconds: 1.2, holdProgress: 0.45, enabled: true, reason: null },
    toasts: [toast('learned', 'You learned Shellfish'), toast('note', 'New Field Note', 'Spring tides', 'spring-tides')],
    nameTags: [
      { id: 'ama', name: 'Ama', relation: 'Mother', x: 820, y: 330, bond: 0.95, opacity: 1, speaking: 'Come.' },
      { id: 'kaya', name: 'Kaya', relation: 'Sister', x: 520, y: 400, bond: 0.7, opacity: 0.95, speaking: null },
      { id: 'nehe', name: 'Nehe', relation: null, x: 1010, y: 300, bond: 0.3, opacity: 0.75, speaking: null },
      { id: 'ilu', name: 'Ilu', relation: "Nehe's son", x: 330, y: 360, bond: 0.4, opacity: 0.6, speaking: null },
    ],
  }),
  quiet: () => ({
    screen: 'playing',
    objective: { id: 'small.follow', text: 'Follow Ama to the rocks', done: null, total: null },
  }),
  low: () => ({
    screen: 'playing',
    hud: { needs: { fed: 0.15, warmth: 0.32, energy: 0.2, health: 0.6 }, clock: clockFor(19.6) },
    objective: { id: 'provider.wood', text: 'Bring firewood before dark (2/5)', done: 2, total: 5 },
    captions: [cap('narration', 'The wind turns cold. The fire needs feeding.')],
  }),
  disabled: () => ({
    screen: 'playing',
    objective: { id: 'small.follow', text: 'Follow Ama to the rocks', done: null, total: null },
    prompt: {
      label: 'Gather mussels',
      key: 'E',
      holdSeconds: 1.2,
      holdProgress: 0,
      enabled: false,
      reason: "You don't know how yet. Watch someone.",
    },
  }),
  aiming: () => ({
    screen: 'playing',
    hud: { stage: 'youth', ageYears: 14, aiming: true, wind: { dir: -0.6, strength: 0.7 }, clock: clockFor(7.4) },
    objective: { id: 'youth.throw', text: 'Get close. Throw.', done: null, total: null },
  }),
  night: () => ({
    screen: 'playing',
    hud: { clock: clockFor(21.8), needs: { fed: 0.9, warmth: 0.88, energy: 0.3, health: 0.95 }, wind: null },
    captions: [cap('song', 'Your grandmother sings the song about the moon and the tide.')],
    nameTags: [{ id: 'oro', name: 'Oro', relation: 'Grandmother', x: 700, y: 380, bond: 0.8, opacity: 1, speaking: 'sing' }],
  }),
  held: () => ({
    screen: 'playing',
    hud: { stage: 'held', ageYears: 0, needs: null, wind: null },
    objective: { id: 'held.faces', text: 'Look at the faces around you (2/4)', done: 2, total: 4 },
    captions: [cap('narration', 'Warmth. A heartbeat. A voice you already know.')],
    toasts: [toast('face', 'Mother · Ama')],
  }),
  choice: () => ({
    screen: 'playing',
    hud: { stage: 'youth', ageYears: 14 },
    objective: { id: 'youth.share', text: 'Share the meat', done: null, total: null },
    choice: {
      id: 'share',
      prompt: 'Who eats first?',
      options: [
        { id: 'oro', label: 'Grandmother', detail: 'Oro, who dug corms for you every winter', personId: 'oro' },
        { id: 'nehe-kids', label: "Nehe's children", detail: 'Ilu and Sabo, who have no father to hunt for them', personId: 'ilu' },
        { id: 'tuk', label: 'Tuk', detail: 'Your father, who taught you to read the ground', personId: 'tuk' },
      ],
    },
  }),
}

function applyPreset(name: string) {
  const make = PRESETS[name]
  if (!make) return
  const p = make()
  const { hud, ...rest } = p
  bridge.set({
    captions: [],
    objective: null,
    prompt: null,
    toasts: [],
    nameTags: [],
    choice: null,
    minigame: null,
    hasLife: true,
    lineage: LINEAGE,
    ...rest,
    hud: { ...BASE_HUD, ...hud },
  })
}

function goScreen(screen: Screen) {
  const extra: Partial<BridgeState> = {}
  if (screen === 'loading') extra.loadingProgress = 0.62
  if (screen === 'title' && !bridge.get().saved) extra.saved = { name: 'Teni', stage: 'youth', ageYears: 14 }
  if (screen === 'lineage' && bridge.get().lineage.length === 0) extra.lineage = LINEAGE
  if (screen === 'chapter-card' && !bridge.get().chapter) extra.chapter = cardFor('small')
  if (screen === 'notes' && bridge.get().notesUnlocked.length === 0) {
    extra.notesUnlocked = FIELD_NOTE_IDS.slice(0, 15)
    extra.notesNew = ['spring-tides', 'shellfish', 'heat-treatment']
  }
  if (screen === 'summary' && !bridge.get().summary) {
    extra.summary = {
      name: 'Teni',
      years: 61,
      children: ['Sela', 'Bo'],
      taught: [
        { name: 'Sela', skill: 'corms' },
        { name: 'Ilo', skill: 'tides' },
        { name: 'Nia', skill: 'tides' },
        { name: 'Bo', skill: 'tides' },
      ],
      storyTold: 'The night the sea slept',
      beadsGivenTo: 'Hesa',
      notesFound: 19,
      heirId: 'nia',
      heirName: 'Nia',
    }
  }
  bridge.set({ ...extra, screen })
}

function cardFor(stage: LifeStageId) {
  const s = STAGES[stage]
  return { stage, title: s.title, subtitle: s.line, ageYears: s.ageYears }
}

export function UiLab() {
  const [bg, setBg] = useState<BgName>('cave')
  const [panel, setPanel] = useState(true)
  const [hour, setHour] = useState(9.1)
  const screen = useBridge((s) => s.screen)
  const hud = useBridge((s) => s.hud)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const hold = params.has('hold')
    let overlayFrom: Screen = 'playing'
    const uninstall = bridge.provide({
      newLife: (name) => {
        bridge.set({ hasLife: true, screen: 'intro' })
        bridge.setHud({ name })
      },
      continueLife: () => applyPreset('quiet'),
      chooseChapter: (stage) => {
        applyPreset('quiet')
        bridge.set({ chapter: cardFor(stage), screen: 'chapter-card' })
      },
      introDone: () => {
        if (hold) return
        bridge.set({ chapter: cardFor('held'), screen: 'chapter-card' })
      },
      chapterCardDone: () => {
        if (hold) return
        bridge.set({ screen: 'playing' })
      },
      pause: () => bridge.set({ screen: 'paused' }),
      resume: () => bridge.set({ screen: 'playing' }),
      openNotes: () => {
        overlayFrom = bridge.get().screen
        bridge.set({ screen: 'notes' })
      },
      openLineage: () => {
        overlayFrom = bridge.get().screen
        bridge.set({ screen: 'lineage' })
      },
      closeOverlay: () => bridge.set({ screen: overlayFrom }),
      markNoteRead: (noteId) => bridge.set({ notesNew: bridge.get().notesNew.filter((n) => n !== noteId) }),
      quitToTitle: () => bridge.set({ screen: 'title' }),
      choose: () => bridge.set({ choice: null }),
      minigameDone: (game, quality) => {
        bridge.set({
          minigame: null,
          toasts: [...bridge.get().toasts, toast('item', 'Done', `${game}: quality ${quality.toFixed(2)}`)],
        })
      },
      summaryContinue: (asHeir) => {
        if (asHeir) bridge.set({ chapter: cardFor('small'), screen: 'chapter-card' })
        else bridge.set({ screen: 'title' })
      },
      setSettings: (patch) => bridge.set({ settings: { ...bridge.get().settings, ...patch } }),
    })

    const b = params.get('bg')
    if (b && isBg(b)) setBg(b)
    if (params.get('panel') === '0') setPanel(false)
    const preset = params.get('preset')
    if (preset) applyPreset(preset)
    const sc = params.get('screen')
    const st = params.get('stage')
    if (st && isStage(st)) bridge.set({ chapter: cardFor(st) })
    if (sc && isScreen(sc)) goScreen(sc)
    const mg = params.get('minigame')
    const game = GAMES.find((g) => g === mg)
    if (game) bridge.set({ screen: 'playing', minigame: game })

    const key = (e: KeyboardEvent) => {
      if (e.key === '`') setPanel((p) => !p)
    }
    window.addEventListener('keydown', key)
    if (import.meta.env.DEV) {
      Object.assign(window, {
        __ui: {
          preset: applyPreset,
          screen: (n: string) => isScreen(n) && goScreen(n),
          bg: (n: string) => isBg(n) && setBg(n),
          state: () => bridge.get(),
          minigame: (n: string) => {
            const game = GAMES.find((g) => g === n)
            if (game) bridge.set({ screen: 'playing', minigame: game })
          },
        },
      })
    }
    return () => {
      uninstall()
      window.removeEventListener('keydown', key)
      bridge.reset()
    }
  }, [])

  const src = BACKGROUNDS[bg]
  return (
    <div className="fixed inset-0 overflow-hidden bg-soot">
      {src && <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${src})` }} />}
      <GameUI />
      {panel && (
        <aside className="fixed bottom-3 right-3 z-50 max-h-[calc(100vh-24px)] w-[260px] overflow-y-auto rounded-md bg-black/80 p-3 font-sans text-[12px] text-white/90 shadow-xl">
          <p className="mb-1 font-semibold">ui lab · screen: {screen} · ` hides</p>
          <Group label="Screen">
            {SCREENS.map((s) => (
              <Btn key={s} on={() => goScreen(s)} active={screen === s}>
                {s}
              </Btn>
            ))}
          </Group>
          <Group label="HUD preset">
            {Object.keys(PRESETS).map((p) => (
              <Btn key={p} on={() => applyPreset(p)}>
                {p}
              </Btn>
            ))}
          </Group>
          <Group label="Chapter card">
            {LIFE_STAGES.map((s) => (
              <Btn key={s} on={() => bridge.set({ chapter: cardFor(s), screen: 'chapter-card' })}>
                {s}
              </Btn>
            ))}
          </Group>
          <Group label="Minigame">
            {GAMES.map((g) => (
              <Btn key={g} on={() => bridge.set({ screen: 'playing', minigame: g })}>
                {g}
              </Btn>
            ))}
          </Group>
          <Group label="Push">
            <Btn on={() => bridge.set({ captions: [...bridge.get().captions, cap('speech', 'Not so far!', 'Ama')] })}>speech</Btn>
            <Btn on={() => bridge.set({ captions: [...bridge.get().captions, cap('narration', 'The sea breathes in, and out.')] })}>narration</Btn>
            <Btn on={() => bridge.set({ captions: [...bridge.get().captions, cap('song', 'A low song about the moon and the tide.')] })}>song</Btn>
            <Btn on={() => bridge.set({ toasts: [...bridge.get().toasts, toast('learned', 'You learned Corms')] })}>learned</Btn>
            <Btn on={() => bridge.set({ toasts: [...bridge.get().toasts, toast('note', 'New Field Note', 'Corms of the fynbos', 'corms')] })}>note</Btn>
            <Btn on={() => bridge.set({ toasts: [...bridge.get().toasts, toast('bond', 'Kaya is glad of you')] })}>bond</Btn>
            <Btn on={() => bridge.set({ captions: [], toasts: [] })}>clear</Btn>
          </Group>
          <Group label={`Hour ${hour.toFixed(1)}`}>
            <input
              type="range"
              min={0}
              max={24}
              step={0.1}
              value={hour}
              onChange={(e) => {
                const h = Number(e.target.value)
                setHour(h)
                bridge.setHud({ clock: clockFor(h) })
              }}
              className="w-full"
            />
          </Group>
          {hud.needs && (
            <Group label="Needs">
              {(['fed', 'warmth', 'energy', 'health'] as const).map((k) => (
                <label key={k} className="flex w-full items-center gap-2">
                  <span className="w-12">{k}</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={hud.needs?.[k] ?? 0}
                    onChange={(e) => {
                      const n = bridge.get().hud.needs
                      if (n) bridge.setHud({ needs: { ...n, [k]: Number(e.target.value) } })
                    }}
                    className="flex-1"
                  />
                </label>
              ))}
            </Group>
          )}
          <Group label="Background">
            {(Object.keys(BACKGROUNDS) as BgName[]).map((n) => (
              <Btn key={n} on={() => setBg(n)} active={bg === n}>
                {n}
              </Btn>
            ))}
          </Group>
        </aside>
      )}
    </div>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-2">
      <p className="mb-1 text-white/50">{label}</p>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  )
}

function Btn({ on, active = false, children }: { on: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={on}
      className={'rounded px-1.5 py-0.5 ' + (active ? 'bg-amber text-black' : 'bg-white/10 hover:bg-white/20')}>
      {children}
    </button>
  )
}
