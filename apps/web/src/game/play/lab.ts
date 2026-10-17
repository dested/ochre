/** placeholder: the play agent replaces this with its lab (/lab/play) */
export function mount(el: HTMLElement): () => void {
  el.textContent = 'play lab: not built yet'
  el.style.color = '#efe3c8'
  return () => {
    el.textContent = ''
  }
}
