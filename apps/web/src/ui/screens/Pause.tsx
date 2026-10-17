/** The pause menu over the frozen game: Resume, Field Notes, Family, Settings, Quit to title. */
import { useEffect, useState } from 'react'
import { bridge, useBridge } from '~/game/bridge'
import { STAGES } from '~/content/stages'
import { CrossHatch } from '../motifs'
import { ageLabel } from '../format'
import { MenuButton } from '../widgets'
import { SettingsPanel } from './Settings'

export function PauseScreen() {
  const hud = useBridge((s) => s.hud)
  const newNotes = useBridge((s) => s.notesNew.length)
  const [settings, setSettings] = useState(false)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (settings) setSettings(false)
      else bridge.actions.resume()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [settings])
  return (
    <div className="fixed inset-0 animate-ui-fade">
      <div className="absolute inset-0 bg-soot/55 backdrop-blur-[3px]" />
      <div className="absolute inset-y-0 left-0 w-[calc(min(520px,90vw)*var(--ui-zoom))] bg-gradient-to-r from-soot/90 via-soot/70 to-transparent" />
      <div className="ui-scale absolute inset-y-0 left-[clamp(28px,6vw,96px)] flex flex-col justify-center">
        <h2
          className="font-serif text-[clamp(40px,3.6vw,56px)] leading-none text-bone ui-halo-soft"
          style={{ fontVariationSettings: '"opsz" 96, "SOFT" 100', fontWeight: 480 }}>
          {hud.name}
        </h2>
        <p className="mt-2 font-serif text-[19px] italic text-amber" style={{ fontVariationSettings: '"opsz" 24' }}>
          {STAGES[hud.stage].title} · {ageLabel(hud.ageYears)}
        </p>
        <CrossHatch width={200} height={14} className="mt-4" />
        {settings ? (
          <div className="mt-8">
            <SettingsPanel onBack={() => setSettings(false)} />
          </div>
        ) : (
          <nav className="mt-8 flex flex-col items-start gap-2.5">
            <MenuButton primary onClick={() => bridge.actions.resume()}>
              Resume
            </MenuButton>
            <MenuButton onClick={() => bridge.actions.openNotes()}>
              Field Notes
              {newNotes > 0 && <span className="ml-3 align-middle font-sans text-[14px] text-amber">{newNotes} new</span>}
            </MenuButton>
            <MenuButton onClick={() => bridge.actions.openLineage()}>Family</MenuButton>
            <MenuButton onClick={() => setSettings(true)}>Settings</MenuButton>
            <MenuButton onClick={() => bridge.actions.quitToTitle()}>Quit to title</MenuButton>
          </nav>
        )}
      </div>
    </div>
  )
}
