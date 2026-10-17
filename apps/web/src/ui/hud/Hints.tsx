/**
 * First-use control hints, each shown once per life and derived only from bridge state: moving (the first time the
 * HUD shows in a walking stage), the menu, E on the first prompt, the watch ring, and throwing while aiming. Small,
 * low-contrast, bottom left; each fades once you have used it or after a while. Seen hints are kept in
 * localStorage (`ochre:hints`) against the player's name, and cleared when a new life starts (see GameUI).
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useBridge } from '~/game/bridge'

type HintId = 'move' | 'menu' | 'act' | 'watch' | 'aim'

const KEY = 'ochre:hints'

type Stored = { name: string; seen: HintId[] }

const isHint = (v: unknown): v is HintId => v === 'move' || v === 'menu' || v === 'act' || v === 'watch' || v === 'aim'

function load(name: string): Set<HintId> {
  try {
    const raw = window.localStorage.getItem(KEY)
    const v: unknown = raw ? JSON.parse(raw) : null
    if (typeof v === 'object' && v !== null && 'name' in v && 'seen' in v && v.name === name && Array.isArray(v.seen)) {
      return new Set(v.seen.filter(isHint))
    }
  } catch {
    // storage unavailable: hints show again next time, which is harmless
  }
  return new Set()
}

function save(name: string, seen: Set<HintId>) {
  const stored: Stored = { name, seen: [...seen] }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(stored))
  } catch {
    // see load
  }
}

/** a new life starts with every hint unseen */
export function clearHints() {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // see load
  }
}

/** how each hint ends: the keys or buttons that count as using it, and how long it stays at most */
const DONE: Record<HintId, { codes: string[]; buttons: number[]; ms: number; useMs: number }> = {
  move: { codes: ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'], buttons: [], ms: 16000, useMs: 1400 },
  menu: { codes: ['Escape'], buttons: [], ms: 7000, useMs: 0 },
  act: { codes: ['KeyE'], buttons: [], ms: 12000, useMs: 0 },
  watch: { codes: [], buttons: [], ms: 7000, useMs: 0 },
  aim: { codes: [], buttons: [0], ms: 9000, useMs: 0 },
}

export function ControlHints() {
  const name = useBridge((s) => s.hud.name)
  const stage = useBridge((s) => s.hud.stage)
  const visible = useBridge((s) => s.hud.visible)
  const watching = useBridge((s) => s.hud.watching !== null)
  const aiming = useBridge((s) => s.hud.aiming)
  const promptE = useBridge((s) => s.prompt !== null && s.prompt.key === 'E' && s.prompt.enabled)
  const [seen, setSeen] = useState<Set<HintId> | null>(null)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    setSeen(load(name))
  }, [name])

  const walking = stage !== 'held'
  // contextual hints first, then the basics
  const active: HintId | null = !seen || !visible
    ? null
    : watching && !seen.has('watch')
      ? 'watch'
      : aiming && !seen.has('aim')
        ? 'aim'
        : promptE && !seen.has('act')
          ? 'act'
          : walking && !seen.has('move')
            ? 'move'
            : !seen.has('menu')
              ? 'menu'
              : null

  useEffect(() => {
    if (!active) return
    setFading(false)
    const rule = DONE[active]
    let useTimer: number | null = null
    const finish = () => {
      setFading(true)
      window.setTimeout(() => {
        setSeen((prev) => {
          const next = new Set(prev)
          next.add(active)
          save(name, next)
          return next
        })
      }, 900)
    }
    const timeout = window.setTimeout(finish, rule.ms)
    const key = (e: KeyboardEvent) => {
      if (!rule.codes.includes(e.code) || useTimer !== null) return
      useTimer = window.setTimeout(finish, rule.useMs)
    }
    const button = (e: MouseEvent) => {
      if (rule.buttons.includes(e.button) && useTimer === null) useTimer = window.setTimeout(finish, rule.useMs)
    }
    window.addEventListener('keydown', key)
    window.addEventListener('mousedown', button)
    return () => {
      window.clearTimeout(timeout)
      if (useTimer !== null) window.clearTimeout(useTimer)
      window.removeEventListener('keydown', key)
      window.removeEventListener('mousedown', button)
    }
  }, [active, name])

  if (!active) return null
  const canRun = stage !== 'elder'
  const content: Record<HintId, ReactNode> = {
    move: (
      <>
        <Keys k={['W', 'A', 'S', 'D']} /> {stage === 'elder' ? 'walk' : 'move'}
        <Gap />
        <Keys k={['Mouse']} /> look
        {canRun && (
          <>
            <Gap />
            <Keys k={['Shift']} /> run
          </>
        )}
      </>
    ),
    menu: (
      <>
        <Keys k={['Esc']} /> menu, Field Notes and family
      </>
    ),
    act: (
      <>
        <Keys k={['E']} /> to do what the prompt says; hold it while the ring fills
      </>
    ),
    watch: <>Stay close and keep watching. You learn a skill when the ring is full.</>,
    aim: (
      <>
        <Keys k={['Left click']} /> throw
        <Gap />
        let go of <Keys k={['Right click']} /> to lower the spear
      </>
    ),
  }
  return (
    <p
      key={active}
      className="ui-wash animate-ui-rise font-sans text-[13.5px] text-bone/75 ui-halo-soft"
      style={{ opacity: fading ? 0 : 1, transition: 'opacity 900ms ease' }}>
      {content[active]}
    </p>
  )
}

function Keys({ k }: { k: string[] }) {
  return (
    <span className="mr-1 inline-flex gap-1 align-[1px]">
      {k.map((c) => (
        <kbd
          key={c}
          className="inline-grid h-[20px] min-w-[20px] place-items-center rounded-[5px] border border-bone/35 bg-soot/40 px-1.5 font-sans text-[11.5px] font-semibold not-italic text-bone/85">
          {c}
        </kbd>
      ))}
    </span>
  )
}

function Gap() {
  return <span className="mx-2.5 text-bone/30">·</span>
}
