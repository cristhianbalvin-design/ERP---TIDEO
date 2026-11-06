export const normalizarBusqueda = valor => String(valor ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLocaleLowerCase('es');

export const terminosBusqueda = consulta => normalizarBusqueda(consulta)
  .split(/\s+/)
  .filter(Boolean);

export function coincideBusquedaInteligente(registro, consulta) {
  const terms = terminosBusqueda(consulta);
  if (!terms.length) return true;

  const text = normalizarBusqueda(
    Object.values(registro || {})
      .flat(Infinity)
      .filter(value => value != null)
      .join(' '),
  );

  return terms.every(term => text.includes(term));
}

export const filtrarBusquedaInteligente = (registros, consulta) => (
  registros || []
).filter(registro => coincideBusquedaInteligente(registro, consulta));
