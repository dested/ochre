/**
 * The Field Notes codex: a grid of painted cards (found ones show their painting and title, unread ones carry a
 * mark; unfound ones are blank engraved cards), and a detail view with the painting, the note, the site and
 * date, and how we know. Opening a note marks it read.
 */
import { useEffect, useState } from 'react'
import { bridge, useBridge } from '~/game/bridge'
import { FIELD_NOTE_IDS, type FieldNoteId } from '~/game/contracts'
import { FIELD_NOTES, type FieldNote } from '~/content/field-notes'
import { CrossHatch, HatchRule } from '../motifs'
import { MenuButton, TextButton } from '../widgets'

const thumb = (id: FieldNoteId) => `/art/notes/thumbs/${id}.webp`

export function NotesScreen() {
  const unlocked = useBridge((s) => s.notesUnlocked)
  const fresh = useBridge((s) => s.notesNew)
  const [open, setOpen] = useState<FieldNoteId | null>(null)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (open) setOpen(null)
      else bridge.actions.closeOverlay()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open])

  const show = (id: FieldNoteId) => {
    setOpen(id)
    if (fresh.includes(id)) bridge.actions.markNoteRead(id)
  }

  // found notes first, in the codex's order, then the blanks still to find
  const order = [...FIELD_NOTE_IDS.filter((id) => unlocked.includes(id)), ...FIELD_NOTE_IDS.filter((id) => !unlocked.includes(id))]
  const found = FIELD_NOTE_IDS.filter((id) => unlocked.includes(id)).length
  const note = open ? FIELD_NOTES[open] : null

  return (
    <div className="fixed inset-0 animate-ui-fade overflow-hidden bg-soot ui-grain">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-[0.12] blur-[10px]"
        style={{ backgroundImage: 'url(/art/title/key-bg.webp)', transform: 'scale(1.1)' }}
      />
      {note ? (
        <NoteDetail note={note} onBack={() => setOpen(null)} />
      ) : (
        <div className="ui-scale absolute inset-0 overflow-y-auto px-[clamp(24px,5vw,80px)] pb-12 pt-[clamp(24px,5vh,52px)]">
          <div className="mb-[clamp(16px,3vh,32px)] flex items-end justify-between gap-6">
            <div>
              <h2
                className="font-serif text-[clamp(36px,3.4vw,52px)] leading-none text-bone"
                style={{ fontVariationSettings: '"opsz" 96, "SOFT" 100', fontWeight: 480 }}>
                Field Notes
              </h2>
              <CrossHatch width={200} height={14} className="mt-3" />
              <p className="mt-2 font-sans text-[14px] text-bone-dim">
                {found} of {FIELD_NOTE_IDS.length} found. Each one is real: what people did here, and how we know.
              </p>
            </div>
            <MenuButton onClick={() => bridge.actions.closeOverlay()}>Back</MenuButton>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-[clamp(10px,1.2vw,18px)]">
            {order.map((id, i) =>
              unlocked.includes(id) ? (
                <FoundCard key={id} note={FIELD_NOTES[id]} isNew={fresh.includes(id)} index={i} onOpen={() => show(id)} />
              ) : (
                <LockedCard key={id} index={i} />
              ),
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FoundCard({ note, isNew, index, onOpen }: { note: FieldNote; isNew: boolean; index: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group animate-ui-rise self-start text-left outline-none"
      style={{ animationDelay: `${Math.min(index, 18) * 30}ms` }}>
      <div className="relative aspect-[3/2] overflow-hidden rounded-[3px] ring-amber/80 group-focus-visible:ring-2">
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-[1200ms] ease-out group-hover:scale-[1.07]"
          style={{ backgroundImage: `url(${thumb(note.id)})` }}
        />
        <div className="absolute inset-0 rounded-[3px] border border-bone/10 transition-colors group-hover:border-bone/45" />
        {isNew && (
          <span className="absolute right-2 top-2 rounded-full bg-soot/75 px-2 py-0.5 font-sans text-[11px] font-semibold text-amber">
            New
          </span>
        )}
      </div>
      <p
        className="mt-2 font-serif text-[17px] leading-tight text-bone transition-colors group-hover:text-amber"
        style={{ fontVariationSettings: '"opsz" 24, "SOFT" 60', fontWeight: 520 }}>
        {note.title}
      </p>
      <p className="mt-0.5 font-sans text-[12px] text-bone-dim">{note.date}</p>
    </button>
  )
}

function LockedCard({ index }: { index: number }) {
  return (
    <div className="animate-ui-rise" style={{ animationDelay: `${Math.min(index, 18) * 30}ms` }} aria-label="Not yet found">
      <div className="relative grid aspect-[3/2] place-items-center overflow-hidden rounded-[3px] border border-bone/10 bg-charcoal/50">
        <div className="w-[62%] opacity-25">
          <CrossHatch cells={7} height={18} salt={index + 3} color="#cdbf9f" />
        </div>
      </div>
      <p className="mt-2 font-serif text-[17px] italic leading-tight text-bone/30" style={{ fontVariationSettings: '"opsz" 24' }}>
        Not yet found
      </p>
    </div>
  )
}

function NoteDetail({ note, onBack }: { note: FieldNote; onBack: () => void }) {
  return (
    <div className="absolute inset-0 grid animate-ui-fade grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] max-lg:grid-cols-1 max-lg:overflow-y-auto">
      <div className="relative min-h-[260px] overflow-hidden">
        <div
          key={note.id}
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${note.image})`, animation: 'ui-note-push 18s linear both' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-soot max-lg:bg-gradient-to-b" />
      </div>
      <div className="relative flex flex-col overflow-y-auto bg-soot px-[clamp(24px,4vw,64px)] py-10">
        <div className="ui-scale my-auto">
          <h2
            className="animate-ui-rise font-serif text-[clamp(34px,3vw,48px)] leading-[1.02] text-bone"
            style={{ fontVariationSettings: '"opsz" 96, "SOFT" 100', fontWeight: 480 }}>
            {note.title}
          </h2>
          <p className="mt-3 animate-ui-rise font-sans text-[14px] text-amber" style={{ animationDelay: '120ms' }}>
            {note.site} · {note.date}
          </p>
          <CrossHatch width={180} height={13} className="mt-4" />
          <p
            className="mt-5 max-w-[56ch] animate-ui-rise font-sans text-[16.5px] leading-[1.62] text-bone/90"
            style={{ animationDelay: '220ms' }}>
            {note.body}
          </p>
          <div className="mt-6 max-w-[56ch] animate-ui-rise border-l-2 border-ochre-bright/70 pl-4" style={{ animationDelay: '320ms' }}>
            <h3 className="font-serif text-[17px] text-bone" style={{ fontVariationSettings: '"opsz" 24, "SOFT" 60', fontWeight: 560 }}>
              How we know
            </h3>
            <p className="mt-1 font-serif text-[15.5px] italic leading-relaxed text-bone/75" style={{ fontVariationSettings: '"opsz" 18' }}>
              {note.evidence}
            </p>
          </div>
          <div className="mt-8 flex items-center gap-5">
            <HatchRule />
            <TextButton onClick={onBack}>All notes</TextButton>
          </div>
        </div>
      </div>
      <style>{`@keyframes ui-note-push{from{transform:scale(1.02)}to{transform:scale(1.12)}}`}</style>
    </div>
  )
}
