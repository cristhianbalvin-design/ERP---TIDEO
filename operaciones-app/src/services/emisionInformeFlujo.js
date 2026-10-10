export function obtenerMotivoEmisionInforme({ textoConclusion, conclusionConfirmada, conclusionModificada, permisoInforme, permisoDiagnostico }) {
  if (!permisoInforme) return 'No tienes permiso para emitir el informe.';
  if (!permisoDiagnostico) return 'No tienes permiso para emitir el diagnóstico.';
  if (!String(textoConclusion || '').trim()) return 'Falta redactar el diagnóstico';
  if (!conclusionConfirmada || conclusionModificada) return 'Falta confirmar la conclusión';
  return '';
}

export async function ejecutarEmisionInformeDosPasos({ estadoDiagnostico, guardarPendiente, emitirDiagnostico, emitirInforme }) {
  if (guardarPendiente) await guardarPendiente();
  const emitirDiagnosticoPrimero = estadoDiagnostico === 'borrador';
  if (emitirDiagnosticoPrimero) await emitirDiagnostico();
  try {
    return await emitirInforme();
  } catch (error) {
    if (emitirDiagnosticoPrimero) {
      throw new Error(`El diagnóstico quedó emitido pero el informe no: reintenta Emitir informe. ${error?.message || ''}`.trim());
    }
    throw error;
  }
}
