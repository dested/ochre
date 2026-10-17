/**
 * About this world: where and when OCHRE is set, how the game uses the research, and the sources behind every
 * Field Note, grouped by theme. Opened from the title; Esc or Back closes it.
 */
import { useEffect } from 'react'
import type { FieldNoteId } from '~/game/contracts'
import { FIELD_NOTES } from '~/content/field-notes'
import { CrossHatch } from '../motifs'
import { MenuButton } from '../widgets'

const GROUPS: { title: string; notes: FieldNoteId[] }[] = [
  { title: 'The coast', notes: ['coastal-life', 'spring-tides', 'shellfish', 'corms', 'danger', 'whale'] },
  { title: 'Stone, fire and the hunt', notes: ['fire', 'silcrete', 'heat-treatment', 'still-bay', 'adhesives', 'tracking', 'hunting'] },
  { title: 'Ochre, beads and marks', notes: ['shell-beads', 'ochre', 'engraved-ochre', 'burial'] },
  { title: 'Growing up and living together', notes: ['faces', 'play', 'sharing', 'reciprocity', 'networks', 'cumulative-culture', 'stories'] },
]

export function AboutScreen({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-20 animate-ui-fade overflow-hidden bg-soot ui-grain">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-[0.12] blur-[10px]"
        style={{ backgroundImage: 'url(/art/notes/engraved-ochre.webp)', transform: 'scale(1.1)' }}
      />
      <div className="ui-scale absolute inset-0 overflow-y-auto px-[clamp(24px,7vw,120px)] pb-16 pt-[clamp(24px,6vh,64px)]">
        <div className="mx-auto max-w-[1080px]">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h2
                className="font-serif text-[clamp(36px,3.4vw,52px)] leading-none text-bone"
                style={{ fontVariationSettings: '"opsz" 96, "SOFT" 100', fontWeight: 480 }}>
                About this world
              </h2>
              <CrossHatch width={220} height={14} className="mt-3" />
            </div>
            <MenuButton onClick={onClose}>Back</MenuButton>
          </div>

          <div className="mt-8 grid max-w-[68ch] gap-5 font-sans text-[16.5px] leading-[1.65] text-bone/90">
            <p>
              Blombos Cave is a small cave in a limestone cliff above the Indian Ocean, near Stilbaai on South Africa’s
              southern Cape coast. People lived in it, on and off, through the Middle Stone Age. In layers about 75,000
              years old they left leaf-shaped Still Bay points, bone tools, beads made from tiny shells and pieces of
              red ochre engraved with crossed lines. Deeper layers, around 100,000 years old, hold a kit for grinding
              and mixing ochre. OCHRE is set on this coast a little before the Still Bay, around 80,000 years ago.
            </p>
            <p>
              What you do in the game is what the evidence says people here did: reading the tides, digging corms,
              heating silcrete, gluing points onto spears with ochre, piercing shells and marking stone. Where the
              ground is silent, as it is about families, songs and stories, the game borrows carefully from recent
              hunter-gatherers and says so. The people are invented. The world they live in comes from the work below.
            </p>
          </div>

          <div className="mt-12 grid gap-x-12 gap-y-10 lg:grid-cols-2">
            {GROUPS.map((g) => (
              <section key={g.title}>
                <h3
                  className="font-serif text-[22px] text-bone"
                  style={{ fontVariationSettings: '"opsz" 36, "SOFT" 100', fontWeight: 520 }}>
                  {g.title}
                </h3>
                <ul className="mt-3 grid gap-3">
                  {g.notes.map((id) => {
                    const n = FIELD_NOTES[id]
                    return (
                      <li key={id} className="border-l border-ochre-bright/50 pl-3">
                        <p className="font-serif text-[15px] text-amber" style={{ fontVariationSettings: '"opsz" 18', fontWeight: 540 }}>
                          {n.title}
                          <span className="ml-2 font-sans text-[12px] font-normal text-bone-dim">{n.site}</span>
                        </p>
                        <p className="mt-0.5 font-sans text-[13.5px] leading-snug text-bone/75">{n.evidence}</p>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
