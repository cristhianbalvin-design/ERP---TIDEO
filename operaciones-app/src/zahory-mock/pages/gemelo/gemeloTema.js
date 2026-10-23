// Detección del tema claro/oscuro para el gemelo (la app vive en un shadow root).
export function temaOscuro(el) {
  const host = el?.getRootNode?.()?.host;
  return [el?.closest?.('[data-theme]'), host, host?.closest?.('[data-theme]'), document.documentElement, document.body]
    .some(n => n?.getAttribute?.('data-theme') === 'dark' || n?.classList?.contains('dark'));
}

export function observarTema(el, alCambiar) {
  if (typeof MutationObserver !== 'function') return () => {};
  const obs = new MutationObserver(alCambiar);
  const host = el?.getRootNode?.()?.host;
  new Set([document.documentElement, document.body, host, el?.closest?.('[data-theme]')]).forEach(n => n && obs.observe(n, { attributes: true, attributeFilter: ['data-theme', 'class'] }));
  return () => obs.disconnect();
}
