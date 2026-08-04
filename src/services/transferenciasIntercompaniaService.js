import { registrarTransferencia } from './inventarioService.js';
import { crearGuia } from './guiasService.js';

export async function registrarTransferenciaIntercompania(empresaId, form, usuarioId) {
  const sociedadOrigenId = form?.sociedad_origen_id || null;
  const sociedadDestinoId = form?.sociedad_destino_id || null;
  if (!sociedadOrigenId || !sociedadDestinoId) {
    throw new Error('Sociedad origen y destino son obligatorias para la transferencia intercompañía.');
  }
  if (sociedadOrigenId === sociedadDestinoId) {
    throw new Error('La transferencia intercompañía requiere sociedades diferentes.');
  }

  const movimientos = await registrarTransferencia(empresaId, {
    ...form,
    tipo_origen: 'transferencia_intercompania',
  }, usuarioId);

  const guia = await crearGuia(empresaId, {
    ...(form.guia || {}),
    tipo_origen: 'transferencia_intercompania',
    motivo_traslado: form.guia?.motivo_traslado || '03',
    almacen_origen_id: form.almacen_origen_id,
    sociedad_origen_id: sociedadOrigenId,
    sociedad_destino_id: sociedadDestinoId,
    lineas: form.guia?.lineas || [{
      material_id: form.material_id,
      descripcion: form.descripcion_material || form.material_id,
      codigo: form.codigo_material || null,
      unidad: form.unidad || 'NIU',
      cantidad: Number(form.cantidad),
      lote: form.lote || null,
      serie: form.serie || null,
      peso_unitario: Number(form.peso_unitario || 0),
    }],
  }, usuarioId);

  return { ...movimientos, guia };
}
