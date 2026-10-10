/** Agrupa fotos consecutivas por orientación: dos horizontales o tres verticales por fila. */
export function agruparFotosEnFilas(fotos = []) {
  const filas = [];
  let orientacionActual = null;
  let fila = null;

  for (const foto of fotos) {
    const horizontal = Number(foto?.width) >= Number(foto?.height);
    const orientacion = horizontal ? 'horizontal' : 'vertical';
    const limite = horizontal ? 2 : 3;
    if (orientacion !== orientacionActual || !fila || fila.fotos.length >= limite) {
      fila = { orientacion, limite, fotos: [] };
      filas.push(fila);
      orientacionActual = orientacion;
    }
    fila.fotos.push(foto);
  }
  return filas;
}
