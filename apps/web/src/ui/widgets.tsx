/** Small shared controls for the painted UI. */
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { CrossHatch } from './motifs'

type MenuButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  children: ReactNode
  primary?: boolean
  /** smaller, for in-game menus */
  size?: 'lg' | 'md' | 'sm'
}

/** a menu entry: serif text that warms to amber on hover with an engraved band scratching in underneath */
export function MenuButton({ children, primary = false, size = 'lg', type = 'button', ...rest }: MenuButtonProps) {
  const fontSize = size === 'lg' ? (primary ? 'clamp(30px,2.6vw,40px)' : 'clamp(22px,1.9vw,28px)') : size === 'md' ? '24px' : '18px'
  return (
    <button
      type={type}
      {...rest}
      className="group relative pb-1.5 text-left font-serif text-bone outline-none transition-colors duration-300 ui-halo-soft hover:text-amber focus-visible:text-amber disabled:pointer-events-none disabled:opacity-40"
      style={{ fontSize, fontVariationSettings: '"opsz" 72, "SOFT" 100', fontWeight: primary ? 520 : 420, lineHeight: 1.15 }}>
      <span className="relative">{children}</span>
      <span className="absolute -bottom-0.5 left-0 h-[10px] w-full origin-left scale-x-0 transition-transform duration-500 ease-out group-hover:scale-x-100 group-focus-visible:scale-x-100">
        <CrossHatch cells={22} height={10} middle={false} strokeWidth={1.3} />
      </span>
    </button>
  )
}

/** a quiet text button for secondary actions inside panels */
export function TextButton({
  children,
  onClick,
  tone = 'bone',
}: {
  children: ReactNode
  onClick: () => void
  tone?: 'bone' | 'charcoal'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'font-sans text-[14px] font-medium underline decoration-1 underline-offset-4 outline-none transition-colors ' +
        (tone === 'bone'
          ? 'text-bone/80 decoration-bone/30 hover:text-amber hover:decoration-amber'
          : 'text-charcoal/80 decoration-charcoal/30 hover:text-ochre hover:decoration-ochre')
      }>
      {children}
    </button>
  )
}
