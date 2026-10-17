/**
 * A minimal stand-in for the ui agent's GameUI, used until ~/ui/GameUI lands: every screen and HUD element the
 * play session drives, plain but legible, so the game is playable end to end. Reads only through useBridge.
 */
import { useEffect, useState } from 'react'
import { bridge, useBridge } from '../bridge'
import { LIFE_STAGES, type LifeStageId } from '../contracts'

const STAGE_TITLE: Record<LifeStageId, string> = {
  held: 'Held',
  small: 'Small',
  youth: 'Coming of age',
  provider: 'Provider',
  elder: 'Elder',
}

const INTRO = [
  'Eighty thousand years ago, at the southern edge of Africa, a cave looked out over the sea.',
  'The people who lived there were exactly like you. The same hands. The same mind.',
  'They had no writing, no metal, no farms. Everything they knew, they learned from each other.',
  'You are born at the end of winter, in the year the whale came ashore.',
]

const panel = 'rounded-md bg-[#2a2420]/70 px-4 py-2 text-[#efe3c8] backdrop-blur-sm'
const btn =
  'rounded-md border border-[#efe3c8]/30 bg-[#2a2420]/70 px-5 py-2 text-[#efe3c8] transition hover:bg-[#9c3d20]/80'

function Title() {
  const hasLife = useBridge((s) => s.hasLife)
  const [name, setName] = useState('Teni')
  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-gradient-to-b from-[#4a3a5c] via-[#c2602e] to-[#173a52]">
      <div className="flex flex-col items-center gap-5 text-[#efe3c8]">
        <h1 className="font-serif text-7xl tracking-[0.3em]">OCHRE</h1>
        <p className="font-serif italic opacity-80">One life, eighty thousand years ago</p>
        <label className="flex items-center gap-3">
          <span className="opacity-80">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-40 rounded bg-black/30 px-3 py-1 text-[#efe3c8] outline-none"
          />
        </label>
        <div className="flex gap-3">
          <button className={btn} onClick={() => bridge.actions.newLife(name)}>
            Begin a life
          </button>
          {hasLife && (
            <button className={btn} onClick={() => bridge.actions.continueLife()}>
              Continue
            </button>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-2 pt-4">
          {LIFE_STAGES.map((s) => (
            <button key={s} className={`${btn} text-sm`} onClick={() => bridge.actions.chooseChapter(s)}>
              {STAGE_TITLE[s]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Intro() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => (i >= INTRO.length - 1 ? bridge.actions.introDone() : setI(i + 1)), 6000)
    return () => clearTimeout(t)
  }, [i])
  return (
    <div
      className="pointer-events-auto absolute inset-0 grid cursor-pointer place-items-center bg-black px-10"
      onClick={() => (i >= INTRO.length - 1 ? bridge.actions.introDone() : setI(i + 1))}
    >
      <p className="max-w-2xl text-center font-serif text-2xl leading-relaxed text-[#efe3c8]">{INTRO[i]}</p>
    </div>
  )
}

function Hud() {
  const hud = useBridge((s) => s.hud)
  const captions = useBridge((s) => s.captions)
  const objective = useBridge((s) => s.objective)
  const prompt = useBridge((s) => s.prompt)
  const toasts = useBridge((s) => s.toasts)
  const tags = useBridge((s) => s.nameTags)
  if (!hud.visible) return null
  const clock = hud.clock
  return (
    <div className="pointer-events-none absolute inset-0 select-none text-[#efe3c8]">
      {objective && (
        <div className={`absolute left-5 top-5 ${panel}`}>
          {objective.text}
          {objective.total !== null && (
            <span className="ml-2 opacity-70">
              {objective.done ?? 0}/{objective.total}
            </span>
          )}
        </div>
      )}
      <div className="absolute right-5 top-5 flex w-72 flex-col items-end gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={panel}>
            <div className="font-serif">{t.title}</div>
            {t.body && <div className="text-sm opacity-80">{t.body}</div>}
          </div>
        ))}
      </div>
      {clock && (
        <div className={`absolute bottom-5 right-5 text-sm ${panel}`}>
          {String(Math.floor(clock.hour)).padStart(2, '0')}:{String(Math.floor((clock.hour % 1) * 60)).padStart(2, '0')}
          {' · '}tide {clock.seaLevel >= 0 ? '+' : ''}
          {clock.seaLevel.toFixed(1)} m{hud.needs && ` · fed ${Math.round(hud.needs.fed * 100)}`}
        </div>
      )}
      {hud.watching && (
        <div className={`absolute left-1/2 top-[18%] -translate-x-1/2 ${panel}`}>
          Watching {hud.watching.name} · {hud.watching.skill}
          <div className="mt-1 h-1 rounded bg-white/20">
            <div className="h-1 rounded bg-[#f2a03d]" style={{ width: `${hud.watching.progress * 100}%` }} />
          </div>
        </div>
      )}
      {tags.map((t) => (
        <div
          key={t.id}
          className="absolute -translate-x-1/2 -translate-y-full text-center text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
          style={{ left: t.x, top: t.y, opacity: t.opacity }}
        >
          {t.speaking && <div className="mb-1 max-w-56 font-serif italic">{t.speaking}</div>}
          <div>{t.name}</div>
          {t.relation && <div className="text-xs opacity-75">{t.relation}</div>}
        </div>
      ))}
      <div className="absolute bottom-24 left-1/2 flex w-[42rem] -translate-x-1/2 flex-col items-center gap-1 text-center">
        {captions.map((c) => (
          <div key={c.id} className={`${panel} ${c.kind === 'narration' ? 'font-serif italic' : ''}`}>
            {c.speaker && <span className="mr-2 opacity-70">{c.speaker}</span>}
            {c.text}
          </div>
        ))}
      </div>
      {prompt && (
        <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 ${panel} ${prompt.enabled ? '' : 'opacity-70'}`}>
          {prompt.enabled ? (
            <>
              <span className="mr-2 rounded border border-[#efe3c8]/50 px-1.5 text-xs">{prompt.key}</span>
              {prompt.label}
              {prompt.holdSeconds > 0 && (
                <div className="mt-1 h-1 rounded bg-white/20">
                  <div className="h-1 rounded bg-[#f2a03d]" style={{ width: `${prompt.holdProgress * 100}%` }} />
                </div>
              )}
            </>
          ) : (
            <>
              {prompt.label} <span className="ml-2 text-sm italic opacity-80">{prompt.reason}</span>
            </>
          )}
        </div>
      )}
      {hud.aiming && <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-1/2 rounded-full border border-white/80" />}
    </div>
  )
}

function Modals() {
  const choice = useBridge((s) => s.choice)
  const minigame = useBridge((s) => s.minigame)
  if (choice)
    return (
      <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-black/40">
        <div className={`${panel} flex flex-col gap-3 p-6`}>
          <div className="font-serif text-xl">{choice.prompt}</div>
          {choice.options.map((o) => (
            <button key={o.id} className={btn} onClick={() => bridge.actions.choose(choice.id, o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    )
  if (minigame)
    return (
      <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-black/50">
        <div className={`${panel} flex flex-col gap-3 p-6`}>
          <div className="font-serif text-xl">The {minigame} minigame lands with the UI</div>
          <button className={btn} onClick={() => bridge.actions.minigameDone(minigame, 0.7)}>
            Finish
          </button>
        </div>
      </div>
    )
  return null
}

function Menu() {
  const screen = useBridge((s) => s.screen)
  const chapter = useBridge((s) => s.chapter)
  const summary = useBridge((s) => s.summary)
  const notes = useBridge((s) => s.notesUnlocked)
  const lineage = useBridge((s) => s.lineage)
  const progress = useBridge((s) => s.loadingProgress)
  const shade = 'pointer-events-auto absolute inset-0 grid place-items-center bg-black/55 text-[#efe3c8]'
  if (screen === 'loading')
    return <div className={`${shade} bg-black font-serif text-xl`}>Building the world · {Math.round(progress * 100)}%</div>
  if (screen === 'chapter-card' && chapter)
    return (
      <div className={`${shade} cursor-pointer`} onClick={() => bridge.actions.chapterCardDone()}>
        <div className="text-center">
          <h2 className="font-serif text-6xl">{chapter.title}</h2>
          <p className="mt-3 opacity-80">{chapter.subtitle}</p>
          <p className="mt-1 opacity-60">Age {chapter.ageYears}</p>
        </div>
      </div>
    )
  if (screen === 'paused')
    return (
      <div className={shade}>
        <div className="flex flex-col gap-2">
          <button className={btn} onClick={() => bridge.actions.resume()}>Resume</button>
          <button className={btn} onClick={() => bridge.actions.openNotes()}>Field Notes</button>
          <button className={btn} onClick={() => bridge.actions.openLineage()}>Family</button>
          <button className={btn} onClick={() => bridge.actions.quitToTitle()}>Quit to title</button>
        </div>
      </div>
    )
  if (screen === 'notes' || screen === 'lineage')
    return (
      <div className={shade}>
        <div className={`${panel} max-h-[70vh] w-[32rem] overflow-auto p-6`}>
          <h2 className="mb-3 font-serif text-2xl">{screen === 'notes' ? 'Field Notes' : 'Family'}</h2>
          {screen === 'notes'
            ? notes.map((n) => <div key={n}>{n}</div>)
            : lineage.map((p) => (
                <div key={p.id}>
                  {p.name} · {p.relation} · {p.ageYears}
                </div>
              ))}
          <button className={`${btn} mt-4`} onClick={() => bridge.actions.closeOverlay()}>Back</button>
        </div>
      </div>
    )
  if (screen === 'summary' && summary)
    return (
      <div className={shade}>
        <div className={`${panel} flex flex-col gap-2 p-6`}>
          <h2 className="font-serif text-3xl">{summary.name}</h2>
          <p>{summary.years} years</p>
          {summary.heirName && (
            <button className={btn} onClick={() => bridge.actions.summaryContinue(true)}>
              Continue as {summary.heirName}
            </button>
          )}
          <button className={btn} onClick={() => bridge.actions.summaryContinue(false)}>Return to the title</button>
        </div>
      </div>
    )
  return null
}

export function PlayOverlay() {
  const screen = useBridge((s) => s.screen)
  return (
    <div className="pointer-events-none fixed inset-0 z-10">
      {screen === 'title' && <Title />}
      {screen === 'intro' && <Intro />}
      {(screen === 'playing' || screen === 'paused') && <Hud />}
      {screen === 'playing' && <Modals />}
      <Menu />
    </div>
  )
}
