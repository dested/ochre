/** placeholder: the sim agent replaces this with its lab (/lab/sim) */
export function mount(el: HTMLElement): () => void {
  el.textContent = 'sim lab: not built yet'
  el.style.color = '#efe3c8'
  return () => {
    el.textContent = ''
  }
}
