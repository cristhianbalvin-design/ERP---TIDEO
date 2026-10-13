export function seleccionarAlEnfocar(event) {
  const input = event.currentTarget || event.target;
  if (!input || input.disabled || input.dataset.numericEditing === 'true') return;
  const select = () => { if (input.isConnected && (!globalThis.document || globalThis.document.activeElement === input)) input.select?.(); };
  select();
  requestAnimationFrame(select);
  setTimeout(select, 40);
}

export function seleccionarAlPulsar(event) {
  const input = event.currentTarget || event.target;
  if (!input || input.disabled || input.dataset.numericEditing === 'true') return;
  input.select?.();
}

export function marcarEdicionNumerica(event) {
  const input = event.currentTarget || event.target;
  if (input?.dataset) input.dataset.numericEditing = 'true';
}

export function limpiarSeleccionAlDesenfocar(event) {
  const input = event.currentTarget || event.target;
  if (input?.dataset) delete input.dataset.numericEditing;
}
