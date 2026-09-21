import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getSupabaseClient } from '../lib/supabaseClient.js';

const ESTADOS_PROYECTO = ['activo', 'inactivo'];
const FORM_INICIAL = { nombre: '', cuentaId: '', horasDisponibles: '', estado: 'activo', codigo: '' };

const isNonNegativeNumber = value => value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0);
const errorMessage = error => error?.message || error?.error_description || 'No se pudo guardar el proyecto.';
const labelCuenta = cuenta => cuenta?.nombre_comercial || cuenta?.razon_social || cuenta?.ruc || 'Cuenta sin nombre';

export function NuevoProyectoModal({
  open,
  empresaId,
  cuentas = [],
  proyecto = null,
  cuentaInicialId = '',
  cuentaFija = false,
  supabaseClient = null,
  onClose,
  onCreated,
  onUpdated,
  zIndex = 1200,
}) {
  const [form, setForm] = useState(FORM_INICIAL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editando = Boolean(proyecto?.id);

  useEffect(() => {
    if (!open) return;
    setForm(proyecto ? {
      codigo: proyecto.codigo || '',
      nombre: proyecto.nombre || '',
      cuentaId: proyecto.cuenta_id || cuentaInicialId || '',
      horasDisponibles: proyecto.horas_disponibles_mes_pactadas ?? '',
      estado: proyecto.estado || 'activo',
    } : { ...FORM_INICIAL, cuentaId: cuentaInicialId || '' });
    setError('');
  }, [open, proyecto, cuentaInicialId]);

  if (!open) return null;

  const update = (campo, valor) => setForm(actual => ({ ...actual, [campo]: valor }));

  const guardar = async event => {
    event.preventDefault();
    if (!form.nombre.trim() || !form.cuentaId || !isNonNegativeNumber(form.horasDisponibles)) {
      setError('Completa nombre y cuenta; las horas deben ser un número mayor o igual a cero.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const sb = supabaseClient || await getSupabaseClient();
      let codigo = form.codigo?.trim() || '';
      if (!editando) {
        const codigoResult = await sb.rpc('siguiente_codigo_proyecto', { p_empresa_id: empresaId });
        if (codigoResult.error) throw codigoResult.error;
        codigo = codigoResult.data;
      }

      const payload = {
        empresa_id: empresaId,
        cuenta_id: form.cuentaId,
        codigo,
        nombre: form.nombre.trim(),
        horas_disponibles_mes_pactadas: form.horasDisponibles === '' ? null : Number(form.horasDisponibles),
        estado: form.estado,
      };
      const result = editando
        ? await sb.from('proyectos').update(payload).eq('id', proyecto.id).select().single()
        : await sb.from('proyectos').insert({ ...payload, id: `pry_${Date.now().toString(36)}` }).select().single();
      if (result.error) throw result.error;

      if (editando) onUpdated?.(result.data);
      else onCreated?.(result.data);
      onClose?.();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop ops-modal-backdrop" style={{ zIndex }}>
      <div className="card" style={{ width: 'min(620px, 96vw)', maxHeight: '92vh', overflow: 'auto' }}>
        <div className="card-header">
          <div>
            <div className="eyebrow">Formulario de registro</div>
            <div className="font-display" style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>
              {editando ? 'Editar proyecto' : 'Nuevo proyecto'}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={saving} aria-label="Cerrar">×</button>
        </div>
        <form className="card-body" onSubmit={guardar}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="grid-2" style={{ gap: 14 }}>
            {editando && <div className="field"><label>Código asignado</label><div className="input mono" style={{ background: 'var(--surface-muted, #f4f5f7)' }}>{form.codigo}</div></div>}
            <div className="field">
              <label>Estado</label>
              <select className="select" value={form.estado} onChange={event => update('estado', event.target.value)} disabled={saving}>
                {ESTADOS_PROYECTO.map(estado => <option key={estado} value={estado}>{estado === 'activo' ? 'Activo' : 'Inactivo'}</option>)}
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Nombre del proyecto *</label>
              <input className="input" value={form.nombre} onChange={event => update('nombre', event.target.value)} disabled={saving} required autoFocus />
            </div>
            <div className="field">
              <label>Cuenta *</label>
              <select className="select" value={form.cuentaId} onChange={event => update('cuentaId', event.target.value)} disabled={saving || cuentaFija} required>
                <option value="">Seleccionar cuenta</option>
                {cuentas.map(cuenta => <option key={cuenta.id} value={cuenta.id}>{labelCuenta(cuenta)}</option>)}
              </select>
              {cuentaFija && <small>La cuenta se toma del paso anterior.</small>}
            </div>
            <div className="field">
              <label>Horas disponibles / mes pactadas</label>
              <input className="input" type="number" min="0" step="0.01" value={form.horasDisponibles} onChange={event => update('horasDisponibles', event.target.value)} disabled={saving} />
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear proyecto'}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
