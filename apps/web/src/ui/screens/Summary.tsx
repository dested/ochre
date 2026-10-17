/**
 * The life summary: the years, the children, what you taught and to whom, the bead you gave, the story you told.
 * Then "Continue as <heir>" (the band goes on) or "Return to the title".
 */
import type { ReactNode } from 'react'
import { bridge, useBridge } from '~/game/bridge'
import { FIELD_NOTE_IDS } from '~/game/contracts'
import { SKILL_LABELS } from '~/content/skills'
import { CrossHatch, HatchRule } from '../motifs'
import { MenuButton } from '../widgets'

function Section({ title, children, delay }: { title: string; children: ReactNode; delay: number }) {
  return (
    <div className="animate-ui-rise" style={{ animationDelay: `${delay}ms` }}>
      <h3 className="font-serif text-[17px] text-amber" style={{ fontVariationSettings: '"opsz" 24, "SOFT" 60', fontWeight: 540 }}>
        {title}
      </h3>
      <div className="mt-1 font-sans text-[16px] leading-relaxed text-bone/90">{children}</div>
    </div>
  )
}

export function SummaryScreen() {
  const s = useBridge((st) => st.summary)
  if (!s) return null
  return (
    <div className="fixed inset-0 animate-ui-fade overflow-hidden bg-soot ui-grain" style={{ animationDuration: '2400ms' }}>
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/art/chapters/elder.webp)', animation: 'ui-sum-push 40s linear both' }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, rgb(22 17 14 / 0.92) 0%, rgb(22 17 14 / 0.8) 38%, rgb(22 17 14 / 0.25) 70%, rgb(22 17 14 / 0.1) 100%)',
        }}
      />
      <div className="absolute inset-y-0 left-[clamp(28px,7vw,120px)] flex w-[min(560px,84vw)] flex-col justify-center overflow-y-auto py-10">
        <h1
          className="animate-ui-rise font-serif leading-none text-bone"
          style={{ fontSize: 'clamp(56px,6vw,96px)', fontVariationSettings: '"opsz" 144, "SOFT" 100', fontWeight: 480 }}>
          {s.name}
        </h1>
        <p
          className="mt-3 animate-ui-rise font-serif text-[clamp(20px,1.7vw,26px)] italic text-bone/85"
          style={{ fontVariationSettings: '"opsz" 36, "SOFT" 100', animationDelay: '300ms' }}>
          {s.years} years beside the sea
        </p>
        <CrossHatch width={240} height={16} className="mt-5" />

        <div className="mt-7 grid grid-cols-2 gap-x-8 gap-y-6 max-sm:grid-cols-1">
          <Section title="Children" delay={600}>
            {s.children.length > 0 ? s.children.join(', ') : 'None of your own. The band raised its children together.'}
          </Section>
          <Section title="What you taught" delay={750}>
            {s.taught.length > 0 ? (
              <ul>
                {s.taught.map((t, i) => (
                  <li key={`${t.name}-${t.skill}-${i}`}>
                    {SKILL_LABELS[t.skill]} to {t.name}
                  </li>
                ))}
              </ul>
            ) : (
              'Nothing yet. Knowledge waits for someone to watch.'
            )}
          </Section>
          <Section title="The beads you gave" delay={900}>
            {s.beadsGivenTo ? `To ${s.beadsGivenTo}` : 'You kept them'}
          </Section>
          <Section title="The story you told" delay={1050}>
            {s.storyTold ? <span className="font-serif italic">“{s.storyTold}”</span> : 'No story at the fire'}
          </Section>
          <Section title="Field Notes" delay={1200}>
            {s.notesFound} of {FIELD_NOTE_IDS.length} found
          </Section>
        </div>

        <div className="mt-9 flex animate-ui-rise items-center gap-4" style={{ animationDelay: '1500ms' }}>
          <HatchRule />
        </div>
        <nav className="mt-4 flex animate-ui-rise flex-col items-start gap-2" style={{ animationDelay: '1600ms' }}>
          {s.heirName && (
            <MenuButton primary onClick={() => bridge.actions.summaryContinue(true)}>
              Continue as {s.heirName}
            </MenuButton>
          )}
          <MenuButton onClick={() => bridge.actions.summaryContinue(false)}>Return to the title</MenuButton>
        </nav>
      </div>
      <style>{`@keyframes ui-sum-push{from{transform:scale(1.04)}to{transform:scale(1.14) translate(1%,0)}}`}</style>
    </div>
  )
}
