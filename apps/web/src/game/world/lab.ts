/** placeholder: the world agent replaces this with its lab (/lab/world) */
export function mount(el: HTMLElement): () => void {
  el.textContent = 'world lab: not built yet'
  el.style.color = '#efe3c8'
  return () => {
    el.textContent = ''
  }
}
