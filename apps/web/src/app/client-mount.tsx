import { useEffect, useRef } from 'react'

/** a client-only module that draws into an element and returns its teardown */
export type Mountable = { mount(el: HTMLElement): () => void }

/**
 * Mounts an imperative (three.js) module on the client only. The module is dynamic-imported inside an effect,
 * so it never runs during SSR. Owned by the lead.
 */
export function ClientMount({ load, className }: { load: () => Promise<Mountable>; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let dispose: (() => void) | null = null
    let cancelled = false
    void load().then((m) => {
      if (!cancelled) dispose = m.mount(el)
    })
    return () => {
      cancelled = true
      dispose?.()
    }
  }, [load])
  return <div ref={ref} className={className ?? 'fixed inset-0 overflow-hidden bg-black'} />
}
