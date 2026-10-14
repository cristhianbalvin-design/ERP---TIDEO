export function separarProyectos(proyectos = []) {
  return proyectos.reduce((resultado, proyecto) => {
    (proyecto.mina_id ? resultado.conMina : resultado.sinMina).push(proyecto);
    return resultado;
  }, { conMina: [], sinMina: [] });
}

export function contarResumenMinas(minas = []) {
  return {
    minas: minas.length,
    proyectos: minas.reduce((total, mina) => total + (mina.proyectos || []).length, 0),
    sinAlmacen: minas.filter(mina => !(mina.almacenes || []).length).length,
  };
}

export function nombreAlmacen(almacen) {
  return [almacen?.codigo, almacen?.nombre].filter(Boolean).join(' · ');
}
