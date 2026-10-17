/**
 * GPU time per stage of the frame, from EXT_disjoint_timer_query_webgl2 (lab only: `?gpu=1`). Stages are timed one
 * after another (WebGL allows a single elapsed-time query at once); results come back a few frames late and are
 * smoothed. Where the extension is missing (Safari, some mobiles) it reports nothing.
 */

/** the extension's TIME_ELAPSED_EXT and GPU_DISJOINT_EXT enums */
const TIME_ELAPSED = 0x88bf
const GPU_DISJOINT = 0x8fbb
/** frames each stage's median is taken over */
const WINDOW = 30

export type GpuTimer = {
  begin(label: string): void
  end(): void
  /** median milliseconds per stage over the last few frames, in the order they first ran */
  report(): { label: string; ms: number }[]
  dispose(): void
}

export function createGpuTimer(gl: WebGL2RenderingContext): GpuTimer | null {
  if (!gl.getExtension('EXT_disjoint_timer_query_webgl2')) return null
  const pending: { q: WebGLQuery; label: string }[] = []
  const free: WebGLQuery[] = []
  const recent = new Map<string, number[]>()
  let open: { q: WebGLQuery; label: string } | null = null

  const collect = () => {
    const disjoint = Boolean(gl.getParameter(GPU_DISJOINT))
    while (pending.length > 0) {
      const head = pending[0]
      if (!head || !gl.getQueryParameter(head.q, gl.QUERY_RESULT_AVAILABLE)) break
      pending.shift()
      if (!disjoint) {
        const ns: unknown = gl.getQueryParameter(head.q, gl.QUERY_RESULT)
        if (typeof ns === 'number') {
          const list = recent.get(head.label) ?? []
          list.push(ns / 1e6)
          if (list.length > WINDOW) list.shift()
          recent.set(head.label, list)
        }
      }
      free.push(head.q)
    }
  }

  return {
    begin(label) {
      if (open) return
      collect()
      // never let a stalled pipe grow the queue without bound
      if (pending.length > 64) return
      const q = free.pop() ?? gl.createQuery()
      if (!q) return
      gl.beginQuery(TIME_ELAPSED, q)
      open = { q, label }
    },
    end() {
      if (!open) return
      gl.endQuery(TIME_ELAPSED)
      pending.push(open)
      open = null
    },
    report() {
      return [...recent.entries()].map(([label, list]) => {
        const sorted = [...list].sort((a, b) => a - b)
        return { label, ms: sorted[sorted.length >> 1] ?? 0 }
      })
    },
    dispose() {
      if (open) gl.endQuery(TIME_ELAPSED)
      for (const p of pending) gl.deleteQuery(p.q)
      for (const q of free) gl.deleteQuery(q)
      pending.length = 0
      free.length = 0
    },
  }
}
