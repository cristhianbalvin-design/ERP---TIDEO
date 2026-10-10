export const BORRADOR_OTRO_DIAGNOSTICO_ERROR = 'La recepción ya tiene un borrador asociado a otro diagnóstico. No se generó la conclusión con IA.';

export function validarBorradorDiagnostico(borrador, diagnosticoId) {
  if (!borrador || borrador.diagnostico_id !== diagnosticoId) {
    throw new Error(BORRADOR_OTRO_DIAGNOSTICO_ERROR);
  }
  return borrador;
}
