// Estados que descuentan el valor día en nómina. Las faltas justificadas y las
// ausencias con goce conservan su tratamiento sin descuento.
export const ESTADOS_ASISTENCIA_DESCUENTAN_VALOR_DIA = ['falta', 'permiso_sin_goce'];

export function contarDiasDescontablesAsistencia(registros = []) {
  return (registros || []).filter(registro =>
    ESTADOS_ASISTENCIA_DESCUENTAN_VALOR_DIA.includes(registro?.estado)
  ).length;
}
