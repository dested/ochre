/** Keyboard and mouse state for the play session: held keys, per-frame edges, mouse deltas, pointer lock. */

export type Input = {
  down(code: string): boolean
  /** went down since the last endFrame */
  pressed(code: string): boolean
  readonly mouse: {
    dx: number
    dy: number
    wheel: number
    lmb: boolean
    rmb: boolean
    lmbPressed: boolean
    rmbPressed: boolean
  }
  readonly locked: boolean
  /** whether a click on the canvas asks for pointer lock */
  wantLock: boolean
  /** false ignores all input (menus open) */
  enabled: boolean
  requestLock(): void
  releaseLock(): void
  /** fires when pointer lock ends without releaseLock (the browser's Esc) */
  onLockLost(cb: () => void): () => void
  endFrame(): void
  dispose(): void
}

function isTyping(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement
}

export function createInput(canvas: HTMLCanvasElement): Input {
  const held = new Set<string>()
  const edges = new Set<string>()
  const mouse = { dx: 0, dy: 0, wheel: 0, lmb: false, rmb: false, lmbPressed: false, rmbPressed: false }
  const lockLost = new Set<() => void>()
  let releasing = false
  let dragging = false

  const input: Input = {
    down: (c) => input.enabled && held.has(c),
    pressed: (c) => input.enabled && edges.has(c),
    mouse,
    get locked() {
      return document.pointerLockElement === canvas
    },
    wantLock: true,
    enabled: true,
    requestLock() {
      if (document.pointerLockElement === canvas) return
      try {
        const p: unknown = canvas.requestPointerLock()
        if (p instanceof Promise) p.catch(() => {})
      } catch {
        // drag fallback
      }
    },
    releaseLock() {
      if (document.pointerLockElement === canvas) {
        releasing = true
        document.exitPointerLock()
      }
    },
    onLockLost(cb) {
      lockLost.add(cb)
      return () => lockLost.delete(cb)
    },
    endFrame() {
      edges.clear()
      mouse.dx = 0
      mouse.dy = 0
      mouse.wheel = 0
      mouse.lmbPressed = false
      mouse.rmbPressed = false
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContext)
      document.removeEventListener('pointerlockchange', onLockChange)
      input.releaseLock()
    },
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e.target)) return
    if (!held.has(e.code)) edges.add(e.code)
    held.add(e.code)
    if (input.enabled && (e.code === 'Space' || e.code === 'Tab')) e.preventDefault()
  }
  const onKeyUp = (e: KeyboardEvent) => {
    held.delete(e.code)
  }
  const onBlur = () => {
    held.clear()
    mouse.lmb = false
    mouse.rmb = false
  }
  const onMouseDown = (e: MouseEvent) => {
    if (!input.enabled) return
    if (e.button === 0) {
      mouse.lmb = true
      mouse.lmbPressed = true
    } else if (e.button === 2) {
      mouse.rmb = true
      mouse.rmbPressed = true
    }
    dragging = true
    if (input.wantLock) input.requestLock()
  }
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) mouse.lmb = false
    else if (e.button === 2) mouse.rmb = false
    if (!mouse.lmb && !mouse.rmb) dragging = false
  }
  const onMouseMove = (e: MouseEvent) => {
    if (!input.enabled) return
    if (document.pointerLockElement === canvas || dragging) {
      mouse.dx += e.movementX
      mouse.dy += e.movementY
    }
  }
  const onWheel = (e: WheelEvent) => {
    if (!input.enabled) return
    mouse.wheel += Math.sign(e.deltaY)
    e.preventDefault()
  }
  const onContext = (e: Event) => e.preventDefault()
  const onLockChange = () => {
    if (document.pointerLockElement === canvas) return
    if (releasing) {
      releasing = false
      return
    }
    for (const cb of lockLost) cb()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('contextmenu', onContext)
  document.addEventListener('pointerlockchange', onLockChange)
  return input
}
