/**
 * Toasts that arrive while the player can't see the HUD (a chapter card, pause, notes, a choice or a minigame) are
 * held here and released one at a time once play is back on screen, so none expire unseen. The session expires its
 * own toasts after a few seconds, so the held ones are copies the UI times itself. Pure steps plus one hook.
 */
import { useEffect, useRef, useState } from 'react'
import type { Toast } from '~/game/bridge'

const SHOW_MS = 4500
const GAP_MS = 1400
/** after a card closes, let the scene land before the first held toast */
const SETTLE_MS = 800

export type ToastQueue = {
  /** every toast id already classified */
  seen: ReadonlySet<string>
  /** ids that arrived while live: they show straight from the bridge */
  direct: ReadonlySet<string>
  queued: readonly Toast[]
  released: readonly { toast: Toast; until: number }[]
  nextAt: number
  wasLive: boolean
}

export const EMPTY_QUEUE: ToastQueue = {
  seen: new Set(),
  direct: new Set(),
  queued: [],
  released: [],
  nextAt: 0,
  wasLive: false,
}

/** classify toasts the queue hasn't seen: live ones show directly, the rest wait */
export function noteToasts(q: ToastQueue, toasts: readonly Toast[], live: boolean): ToastQueue {
  const fresh = toasts.filter((t) => !q.seen.has(t.id))
  if (fresh.length === 0) return q
  const seen = new Set(q.seen)
  for (const t of fresh) seen.add(t.id)
  if (live) {
    const direct = new Set(q.direct)
    for (const t of fresh) direct.add(t.id)
    return { ...q, seen, direct }
  }
  return { ...q, seen, queued: [...q.queued, ...fresh] }
}

/** expire released toasts and, while live, release the next held one when its turn comes */
export function tickQueue(q: ToastQueue, live: boolean, now: number): ToastQueue {
  let next = q
  if (live && !q.wasLive) next = { ...next, nextAt: Math.max(next.nextAt, now + SETTLE_MS) }
  if (live !== q.wasLive) next = { ...next, wasLive: live }
  if (next.released.some((r) => r.until <= now)) {
    next = { ...next, released: next.released.filter((r) => r.until > now) }
  }
  const head = next.queued[0]
  if (live && head && now >= next.nextAt) {
    next = {
      ...next,
      queued: next.queued.slice(1),
      released: [...next.released, { toast: head, until: now + SHOW_MS }],
      nextAt: now + GAP_MS,
    }
  }
  return next
}

/** what the HUD shows: released held toasts, then the bridge's toasts that arrived while live */
export function visibleToasts(q: ToastQueue, toasts: readonly Toast[]): Toast[] {
  return [...q.released.map((r) => r.toast), ...toasts.filter((t) => q.direct.has(t.id))]
}

/** the queue over the bridge's toasts; `live` is true while play is on screen with nothing over it */
export function useToastQueue(toasts: readonly Toast[], live: boolean): Toast[] {
  const queue = useRef<ToastQueue>(EMPTY_QUEUE)
  const [, setVersion] = useState(0)
  queue.current = noteToasts(queue.current, toasts, live)
  const pending = queue.current.queued.length > 0 || queue.current.released.length > 0

  useEffect(() => {
    const step = () => {
      const next = tickQueue(queue.current, live, performance.now())
      if (next === queue.current) return
      queue.current = next
      setVersion((v) => v + 1)
    }
    step()
    if (!pending) return
    const t = setInterval(step, 200)
    return () => clearInterval(t)
  }, [live, pending])

  return visibleToasts(queue.current, toasts)
}
