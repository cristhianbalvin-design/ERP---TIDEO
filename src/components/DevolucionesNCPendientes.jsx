import React, { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';

// Devoluciones de clientes cerradas en el almacén (Operaciones) que esperan nota de crédito.
// Se muestra solo si hay alguna pendiente; "Marcar NC emitida" la quita de la lista.
export function DevolucionesNCPendientes({ empresaId, addToast }) {
  const [pendientes, setPendientes] = useState([]);
  const [ocupado, setOcupado] = useState('');

  const cargar = useCallback(async () => {
    if (!empresaId || !isSupabaseConfigured()) return;
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('wms_devoluciones')
      .select('id, numero, cerrada_at, motivo, guia_id, cuenta_id, wms_devolucion_lineas(cantidad_liberada, cantidad_merma, cantidad, costo_unitario)')
      .eq('empresa_id', empresaId).eq('nc_estado', 'pendiente').order('cerrada_at', { ascending: true }).limit(20);
    if (error) return;
    const guias = [...new Set((data || []).map(d => d.guia_id).filter(Boolean))];
    const cuentas = [...new Set((data || []).map(d => d.cuenta_id).filter(Boolean))];
    const [g, c] = await Promise.all([
      guias.length ? supabase.from('guias_remision').select('id, numero_completo').in('id', guias) : { data: [] },
      cuentas.length ? supabase.from('cuentas').select('id, razon_social, nombre_comercial').in('id', cuentas) : { data: [] },
    ]);
    const gm = new Map((g.data || []).map(x => [x.id, x.numero_completo]));
    const cm = new Map((c.data || []).map(x => [x.id, x.razon_social || x.nombre_comercial]));
    setPendientes((data || []).map(d => ({
      ...d, guia: gm.get(d.guia_id) || 'Sin dato', cliente: cm.get(d.cuenta_id) || 'Sin dato',
      valor: Math.round((d.wms_devolucion_lineas || []).reduce((t, l) => t + Number(l.cantidad || 0) * Number(l.costo_unitario || 0), 0) * 100) / 100,
    })));
  }, [empresaId]);
  useEffect(() => { cargar(); }, [cargar]);

  const marcar = async d => {
    setOcupado(d.id);
    try {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.rpc('wms_devolucion_marcar_nc', { p_empresa_id: empresaId, p_devolucion_id: d.id });
      if (error) throw error;
      addToast?.(`Devolución ${d.numero}: nota de crédito marcada como emitida.`, 'success');
      await cargar();
    } catch (e) {
      addToast?.(e.message || 'No se pudo actualizar la devolución.', 'error');
    } finally { setOcupado(''); }
  };

  if (!pendientes.length) return null;
  return (
    <div className="card" style={{ padding: '14px 18px', marginBottom: 16, borderLeft: '4px solid var(--orange)' }} role="region" aria-label="Devoluciones con nota de crédito pendiente">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Devoluciones de clientes con nota de crédito pendiente ({pendientes.length})</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>El almacén ya inspeccionó la mercadería devuelta. Emite la nota de crédito en Facturación y márcala aquí.</div>
      {pendientes.map(d => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--card-border)' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <b>{d.numero}</b> · Guía {d.guia} · {d.cliente}
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.motivo} · valor al costo S/ {d.valor.toFixed(2)}</div>
          </div>
          <button type="button" className="btn btn-secondary" disabled={ocupado === d.id} onClick={() => marcar(d)}>{ocupado === d.id ? 'Guardando…' : 'Marcar NC emitida'}</button>
        </div>
      ))}
    </div>
  );
}
