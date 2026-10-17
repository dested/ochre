import { useEffect, useState } from 'react'

/** true for `ms` after `key` last changed (and after mount); drives the HUD's fade-when-idle */
export function useRecent(key: string, ms: number): boolean {
  const [recent, setRecent] = useState(true)
  useEffect(() => {
    setRecent(true)
    const t = setTimeout(() => setRecent(false), ms)
    return () => clearTimeout(t)
  }, [key, ms])
  return recent
}

/** true while Tab is held: brings every faded HUD element back */
export function useRevealKey(): boolean {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      e.preventDefault()
      setHeld(true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Tab') setHeld(false)
    }
    const blur = () => setHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])
  return held
}

/** false until `ms` after mount (e.g. a hint that appears late) */
export function useAfter(ms: number): boolean {
  const [done, setDone] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setDone(true), ms)
    return () => clearTimeout(t)
  }, [ms])
  return done
}
