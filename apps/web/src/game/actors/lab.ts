/** placeholder: the people agent replaces this with its lab (/lab/people) */
export function mount(el: HTMLElement): () => void {
  el.textContent = 'people lab: not built yet'
  el.style.color = '#efe3c8'
  return () => {
    el.textContent = ''
  }
}
