import React, { useMemo, useState } from 'react';
import { useApp } from '../context.jsx';
import { I } from '../icons.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const FORM_INIT = {
  vehiculo_id: '', tipo_mantenimiento: 'preventivo', fecha: today(), costo: '', moneda: 'PEN',
  taller_proveedor: '', kilometraje: '', proximo_mantenimiento_fecha: '', orden_compra_id: '', observaciones: '',
};

const tipoLabel = { preventivo: 'Preventivo', correctivo: 'Correctivo', predictivo: 'Predictivo', otro: 'Otro' };

export function MantenimientoFlotaPanel() {
  const {
    transportistas = [], mantenimientosFlota = [], addToast,
    crearMantenimientoFlotaCtx, actualizarMantenimientoFlotaCtx, eliminarMantenimientoFlotaCtx,
  } = useApp();
  const [form, setForm] = useState(FORM_INIT);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const vehicles = useMemo(() => transportistas.flatMap(t => (t.vehiculos || []).map(v => ({ ...v, transportista: t.razon_social }))), [transportistas]);
  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const vehicleName = id => {
    const vehicle = vehicles.find(item => item.id === id);
    return vehicle ? `${vehicle.placa} · ${vehicle.marca || ''} ${vehicle.modelo || ''}`.trim() : id || 'Sin vehículo';
  };

  const reset = () => { setForm(FORM_INIT); setEditId(null); };
  const edit = item => {
    setEditId(item.id);
    setForm({ ...FORM_INIT, ...item });
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  };
  const save = async event => {
    event.preventDefault();
    if (!form.vehiculo_id || !form.tipo_mantenimiento || !form.fecha) return;
    setSaving(true);
    try {
      if (editId) await actualizarMantenimientoFlotaCtx(editId, form);
      else await crearMantenimientoFlotaCtx(form);
      addToast?.(editId ? 'Mantenimiento actualizado.' : 'Mantenimiento registrado.', 'success');
      reset();
    } catch (error) { addToast?.(error?.message || 'No se pudo guardar el mantenimiento.'); }
    finally { setSaving(false); }
  };
  const remove = async item => {
    if (!window.confirm(`¿Eliminar el mantenimiento de ${vehicleName(item.vehiculo_id)}?`)) return;
    try { await eliminarMantenimientoFlotaCtx(item.id); addToast?.('Mantenimiento eliminado.', 'success'); }
    catch (error) { addToast?.(error?.message || 'No se pudo eliminar el mantenimiento.'); }
  };

  return (
    <div className="mt-6">
      <div className="page-section-title" style={{ marginBottom: 14 }}>
        <div><div className="eyebrow">Flota</div><h2 style={{ margin: 0 }}>Mantenimiento de vehículos</h2><div className="text-muted">Historial, costos y próximas intervenciones de la flota.</div></div>
        {editId && <button className="btn btn-secondary" type="button" onClick={reset}>Cancelar edición</button>}
      </div>
      <div className="grid-2" style={{ alignItems: 'start', gap: 16 }}>
        <form className="card" onSubmit={save}>
          <div className="card-head"><h3>{editId ? 'Editar mantenimiento' : 'Registrar mantenimiento'}</h3><span className="text-muted">CRUD operativo</span></div>
          <div className="card-body grid-2" style={{ gap: 10 }}>
            <div className="input-group" style={{ gridColumn: '1 / -1' }}><label>Vehículo *</label><select className="input" required value={form.vehiculo_id} onChange={e => update('vehiculo_id', e.target.value)}><option value="">Seleccionar vehículo</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.placa} · {v.marca || ''} {v.modelo || ''} · {v.transportista || 'Sin transportista'}</option>)}</select></div>
            <div className="input-group"><label>Tipo *</label><select className="input" required value={form.tipo_mantenimiento} onChange={e => update('tipo_mantenimiento', e.target.value)}>{Object.entries(tipoLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="input-group"><label>Fecha *</label><input className="input" type="date" required value={form.fecha || ''} onChange={e => update('fecha', e.target.value)} /></div>
            <div className="input-group"><label>Costo</label><input className="input" type="number" min="0" step="0.01" value={form.costo ?? ''} onChange={e => update('costo', e.target.value)} /></div>
            <div className="input-group"><label>Moneda</label><select className="input" value={form.moneda || 'PEN'} onChange={e => update('moneda', e.target.value)}><option value="PEN">PEN</option><option value="USD">USD</option></select></div>
            <div className="input-group"><label>Taller / proveedor</label><input className="input" value={form.taller_proveedor || ''} onChange={e => update('taller_proveedor', e.target.value)} /></div>
            <div className="input-group"><label>Kilometraje</label><input className="input" type="number" min="0" value={form.kilometraje ?? ''} onChange={e => update('kilometraje', e.target.value)} /></div>
            <div className="input-group"><label>Próximo mantenimiento</label><input className="input" type="date" value={form.proximo_mantenimiento_fecha || ''} onChange={e => update('proximo_mantenimiento_fecha', e.target.value)} /></div>
            <div className="input-group"><label>Orden de compra</label><input className="input" value={form.orden_compra_id || ''} onChange={e => update('orden_compra_id', e.target.value)} /></div>
            <div className="input-group" style={{ gridColumn: '1 / -1' }}><label>Observaciones</label><textarea className="input" rows="3" value={form.observaciones || ''} onChange={e => update('observaciones', e.target.value)} /></div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn-primary" type="submit" disabled={saving || !vehicles.length}>{saving ? 'Guardando…' : editId ? 'Guardar cambios' : 'Registrar mantenimiento'}</button></div>
            {!vehicles.length && <div className="text-muted" style={{ gridColumn: '1 / -1' }}>Registra primero un vehículo en Transportistas.</div>}
          </div>
        </form>
        <div className="card">
          <div className="card-head"><div><h3>Historial</h3><span className="text-muted">{mantenimientosFlota.length} registros</span></div></div>
          <div className="table-wrap"><table className="tbl"><thead><tr><th>Fecha</th><th>Vehículo</th><th>Tipo</th><th>Costo</th><th>Próximo</th><th></th></tr></thead><tbody>
            {!mantenimientosFlota.length && <tr><td colSpan="6" className="text-muted">Sin mantenimientos registrados.</td></tr>}
            {mantenimientosFlota.map(item => <tr key={item.id}>
              <td>{item.fecha || '—'}</td><td><strong>{vehicleName(item.vehiculo_id)}</strong><div className="text-muted" style={{ fontSize: 11 }}>{item.taller_proveedor || 'Sin taller'}</div></td><td><span className="badge badge-gray">{tipoLabel[item.tipo_mantenimiento] || item.tipo_mantenimiento}</span></td><td>{item.costo == null ? '—' : `${item.moneda || 'PEN'} ${Number(item.costo).toFixed(2)}`}</td><td>{item.proximo_mantenimiento_fecha || '—'}</td><td><div className="row" style={{ gap: 4 }}><button className="icon-btn" type="button" title="Editar" onClick={() => edit(item)}>{I.edit}</button><button className="icon-btn" type="button" title="Eliminar" style={{ color: 'var(--danger)' }} onClick={() => remove(item)}>{I.trash}</button></div></td>
            </tr>)}
          </tbody></table></div>
        </div>
      </div>
    </div>
  );
}
