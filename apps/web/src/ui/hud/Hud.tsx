/**
 * The in-game HUD. Quiet by design: the needs and the dial fade when nothing changes (hold Tab to bring them
 * back), and nothing ever sits over the centre of the screen except the aim reticle.
 *
 *   top left: objective          top centre: watch ring          top right: toasts
 *   bottom left: dial + needs, first-use control hints above them    bottom centre: prompt, captions
 */
import { useBridge, type Toast } from '~/game/bridge'
import { useRecent, useRevealKey } from '../hooks'
import { Dial } from './Dial'
import { ControlHints } from './Hints'
import { Captions, ObjectiveLine } from './Lines'
import { GazeMark, NameTags, ObjectiveMarker, Prompt, Reticle, WatchRing, shownTags } from './Marks'
import { NeedGlyphs } from './Needs'
import { Toasts } from './Toasts'

const q = (v: number, steps = 10) => Math.round(v * steps)

export function Hud({ dimmed = false, toasts }: { dimmed?: boolean; toasts: readonly Toast[] }) {
  const hud = useBridge((s) => s.hud)
  const captions = useBridge((s) => s.captions)
  const objective = useBridge((s) => s.objective)
  const prompt = useBridge((s) => s.prompt)
  const nameTags = useBridge((s) => s.nameTags)
  const choosing = useBridge((s) => s.choice !== null)
  const objectiveMark = useBridge((s) => s.objectiveMark)
  const largeCaptions = useBridge((s) => s.settings.largeCaptions)
  const reveal = useRevealKey()

  const needs = hud.needs
  const needsKey = needs
    ? `${q(needs.fed)}.${q(needs.warmth)}.${q(needs.energy)}.${q(needs.health)}`
    : 'none'
  const needsRecent = useRecent(needsKey, 7000)
  const clock = hud.clock
  // wake the dial when the hour ticks over, the tide turns a corner or the wind shifts
  const dialKey = clock
    ? `${Math.floor(clock.hour)}.${q(clock.tide, 4)}.${hud.wind ? q(hud.wind.strength, 4) : 0}`
    : 'none'
  const dialRecent = useRecent(dialKey, 6000)
  const objectiveRecent = useRecent(
    objective ? `${objective.id}.${objective.text}.${objective.done}` : 'none',
    12000
  )
  // the mark waits 4 s after a new objective, so the line is read before the arrow pulls the eye
  const markWaiting = useRecent(objective ? objective.id : 'none', 4000)
  // a person target with its tag up: the diamond sits above the tag, not over the name
  const target = objective?.target
  const targetTagged =
    target?.kind === 'person' &&
    typeof window !== 'undefined' &&
    shownTags(nameTags, { width: window.innerWidth, height: window.innerHeight }).has(target.id)

  const lines = (
    <div className="absolute bottom-[clamp(24px,5vh,56px)] left-1/2 -translate-x-1/2">
      <div className="ui-scale flex flex-col items-center gap-[clamp(14px,2.6vh,26px)]">
        {hud.visible && prompt && <Prompt prompt={prompt} />}
        <Captions captions={captions} large={largeCaptions} />
      </div>
    </div>
  )
  // a hidden HUD (the death) drops the chrome, never the story: the captions stay
  if (!hud.visible)
    return (
      <div className="pointer-events-none fixed inset-0 overflow-hidden select-none">{lines}</div>
    )
  const held = hud.stage === 'held'
  const showNeeds = reveal || needsRecent
  const showDial = reveal || dialRecent

  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden select-none"
      style={{ opacity: dimmed ? 0 : 1, transition: 'opacity 400ms ease' }}>
      {/* a choice card owns the frame; tags over its dimmed scene only compete with the options */}
      <div style={{ opacity: choosing ? 0 : 1, transition: 'opacity 300ms ease' }}>
        <NameTags tags={nameTags} />
      </div>

      <ObjectiveMarker
        mark={objectiveMark}
        show={!markWaiting && !choosing && objective !== null}
        aboveTag={targetTagged}
      />

      <div className="absolute top-[clamp(18px,3.4vh,36px)] left-[clamp(20px,3vw,44px)]">
        <div className="ui-scale">
          {objective && <ObjectiveLine objective={objective} dim={!objectiveRecent && !reveal} />}
        </div>
      </div>

      <div className="absolute top-[clamp(18px,3.4vh,36px)] left-1/2 -translate-x-1/2">
        <div className="ui-scale">{hud.watching && <WatchRing watching={hud.watching} />}</div>
      </div>

      <div className="absolute top-[clamp(18px,3.4vh,36px)] right-[clamp(20px,3vw,44px)]">
        <div className="ui-scale">
          <Toasts toasts={toasts} />
        </div>
      </div>

      {!held && (clock || needs) && (
        <div className="ui-scale absolute bottom-[clamp(16px,3vh,32px)] left-[clamp(18px,2.6vw,40px)] flex items-end gap-4">
          {clock && (
            <div style={{ opacity: showDial ? 1 : 0.32, transition: 'opacity 1.4s ease' }}>
              <Dial clock={clock} wind={hud.wind} showWords={showDial} />
            </div>
          )}
          {needs && (
            <div className="mb-[22px]">
              <NeedGlyphs needs={needs} show={showNeeds} />
            </div>
          )}
        </div>
      )}

      <div
        className="absolute left-[clamp(20px,3vw,44px)] max-w-[min(560px,46vw)]"
        style={{
          bottom:
            !held && (clock || needs)
              ? 'calc(clamp(120px,17vh,160px) * var(--ui-zoom))'
              : 'clamp(24px,4vh,44px)',
        }}>
        <div className="ui-scale">
          <ControlHints />
        </div>
      </div>

      {!hud.aiming && objective?.id.startsWith('held.faces') && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <GazeMark />
        </div>
      )}

      {hud.aiming && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <Reticle />
        </div>
      )}

      {lines}
    </div>
  )
}
