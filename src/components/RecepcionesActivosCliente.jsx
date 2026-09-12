import React, { useEffect, useMemo, useState } from 'react';
import { I } from '../icons.jsx';
import { useApp } from '../context.jsx';
import { getActivosParaOS } from '../services/activosService.js';
import {
  crearRecepcionActivoCliente,
  devolverRecepcionActivoCliente,
  listarRecepcionesActivosCliente,
} from '../services/recepcionesActivosClienteService.js';

const today = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);
const emptyReception = (sociedadId = '') => ({
  activo_id: '', fecha_ingreso: today(), hora_ingreso: nowTime(), guia_ingreso: '', observaciones: '', sociedad_id: sociedadId,
});
const emptyAsset = (codigo = '') => ({
  codigo, nombre: '', cliente_propietario_id: '', tipo_categoria: 'equipo', marca: '', modelo: '', placa_serie: '', estado: 'operativo', observacion: '',
});

const nombreCuenta = cuenta => cuenta?.razon_social || cuenta?.nombre_comercial || 'Cliente sin nombre';
const diasDesde = fecha => {
  if (!fecha) return '—';
  const inicio = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(inicio.getTime())) return '—';
  return Math.max(0, Math.floor((Date.now() - inicio.getTime()) / 86400000));
};

export function RecepcionesActivosCliente() {
  const { empresa, cuentas = [], sociedadesDisponibles = [], sociedadActiva, crearActivoCtx, crearHojaCosteo, navigate, addNotificacion } = useApp();
  const empresaId = empresa?.id || '';
  const sociedadPorDefecto = sociedadActiva?.id || sociedadesDisponibles.find(s => s.activa !== false)?.id || '';
  const [recepciones, setRecepciones] = useState([]);
  const [activos, setActivos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalRecepcion, setModalRecepcion] = useState(false);
  const [modalActivo, setModalActivo] = useState(false);
  const [modalDevolucion, setModalDevolucion] = useState(null);
  const [form, setForm] = useState(() => emptyReception(sociedadPorDefecto));
  const [assetSearch, setAssetSearch] = useState('');
  const [assetForm, setAssetForm] = useState(() => emptyAsset());
  const [devolucion, setDevolucion] = useState({ fecha_devolucion: today(), guia_devolucion: '' });

  const cargar = async () => {
    if (!empresaId) { setRecepciones([]); setActivos([]); return; }
    setLoading(true);
    try {
      const [pendientes, activosEmpresa] = await Promise.all([
        listarRecepcionesActivosCliente(empresaId, { pendientes: true }),
        getActivosParaOS(empresaId),
      ]);
      setRecepciones(pendientes);
      setActivos(activosEmpresa);
      setError('');
    } catch (err) {
      setError(err?.message || 'No se pudieron cargar las recepciones de activos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, [empresaId]);

  const activosFiltrados = useMemo(() => {
    const needle = assetSearch.trim().toLowerCase();
    if (!needle) return activos.slice(0, 12);
    return activos.filter(activo => [activo.codigo, activo.nombre, activo.marca, activo.modelo, activo.placa_serie]
      .filter(Boolean).join(' ').toLowerCase().includes(needle)).slice(0, 12);
  }, [activos, assetSearch]);
  const activosPorId = useMemo(() => new Map(activos.map(activo => [activo.id, activo])), [activos]);
  const activoSeleccionado = activosPorId.get(form.activo_id) || null;
  const codigoYaExiste = activos.some(activo => String(activo.codigo || '').trim().toLowerCase() === assetForm.codigo.trim().toLowerCase());

  const abrirRecepcion = () => {
    setForm(emptyReception(sociedadPorDefecto));
    setAssetSearch('');
    setAssetForm(emptyAsset());
    setError('');
    setModalRecepcion(true);
  };
  const cerrarRecepcion = () => {
    setModalRecepcion(false);
    setModalActivo(false);
    setError('');
  };
  const actualizarForm = (campo, valor) => setForm(actual => ({ ...actual, [campo]: valor }));
  const actualizarActivo = (campo, valor) => setAssetForm(actual => ({ ...actual, [campo]: valor }));

  const guardarActivo = async () => {
    if (!assetForm.codigo.trim() || !assetForm.nombre.trim()) return setError('Código y nombre son obligatorios para el equipo de cliente.');
    if (!assetForm.cliente_propietario_id) return setError('Selecciona el cliente propietario antes de crear el equipo.');
    if (codigoYaExiste) return setError(`Ya existe un activo con el código "${assetForm.codigo.trim()}" en esta empresa. Selecciónalo en el buscador.`);
    setSaving(true);
    try {
      const activo = await crearActivoCtx({
        codigo: assetForm.codigo.trim(), nombre: assetForm.nombre.trim(), tipo_categoria: assetForm.tipo_categoria,
        marca: assetForm.marca.trim() || null, modelo: assetForm.modelo.trim() || null, placa_serie: assetForm.placa_serie.trim() || null,
        estado: assetForm.estado, observacion: assetForm.observacion.trim() || null,
        propietario_tipo: 'cliente', cliente_propietario_id: assetForm.cliente_propietario_id,
      });
      setActivos(actual => [...actual, activo].sort((a, b) => String(a.codigo || '').localeCompare(String(b.codigo || ''))));
      actualizarForm('activo_id', activo.id);
      setAssetSearch(activo.codigo || '');
      setModalActivo(false);
      addNotificacion('Equipo de cliente creado y seleccionado para la recepción.');
    } catch (err) {
      if (err?.code === '23505') setError(`Ya existe un activo con el código "${assetForm.codigo.trim()}" en esta empresa.`);
      else setError(err?.message || 'No se pudo crear el equipo de cliente.');
    } finally {
      setSaving(false);
    }
  };

  const guardarRecepcion = async event => {
    event.preventDefault();
    if (!form.activo_id) return setError('Selecciona o crea el activo recibido.');
    if (!form.fecha_ingreso) return setError('La fecha de ingreso es obligatoria.');
    setSaving(true);
    try {
      const recepcion = await crearRecepcionActivoCliente(empresaId, form);
      setRecepciones(actual => [recepcion, ...actual]);
      cerrarRecepcion();
      addNotificacion(`Recepción ${recepcion.numero} registrada como pendiente de cotizar.`);
    } catch (err) {
      setError(err?.message || 'No se pudo registrar la recepción.');
    } finally {
      setSaving(false);
    }
  };

  const abrirCotizacion = recepcion => {
    const activo = activosPorId.get(recepcion.activo_id);
    if (!activo?.cliente_propietario_id) {
      setError('El activo de esta recepción no tiene cliente propietario; así no se puede abrir una cotización.');
      return;
    }
    navigate('cotizaciones', { recepcion_id: recepcion.id });
  };

  const iniciarHojaCosteo = async recepcion => {
    const activo = activosPorId.get(recepcion.activo_id);
    if (!activo?.cliente_propietario_id) {
      setError('El activo de esta recepción no tiene cliente propietario; así no se puede iniciar una Hoja de Costeo.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const hojaId = await crearHojaCosteo({
        cuenta_id: activo.cliente_propietario_id,
        sociedad_id: recepcion.sociedad_id || sociedadPorDefecto || null,
        activo_id: recepcion.activo_id,
        recepcion_id: recepcion.id,
        moneda: empresa?.moneda || 'PEN',
      });
      navigate('hoja_costeo_wizard', { hojaId });
    } catch (err) {
      setError(err?.message || 'No se pudo iniciar la Hoja de Costeo desde esta recepción.');
    } finally {
      setSaving(false);
    }
  };

  const abrirDevolucion = recepcion => {
    setDevolucion({ fecha_devolucion: today(), guia_devolucion: '' });
    setError('');
    setModalDevolucion(recepcion);
  };
  const guardarDevolucion = async event => {
    event.preventDefault();
    if (!modalDevolucion || !devolucion.fecha_devolucion) return setError('La fecha de devolución es obligatoria.');
    setSaving(true);
    try {
      await devolverRecepcionActivoCliente(empresaId, modalDevolucion.id, devolucion);
      setRecepciones(actual => actual.filter(recepcion => recepcion.id !== modalDevolucion.id));
      setModalDevolucion(null);
      setError('');
      addNotificacion(`Recepción ${modalDevolucion.numero} devuelta sin cotizar.`);
    } catch (err) {
      setError(err?.message || 'No se pudo registrar la devolución.');
    } finally {
      setSaving(false);
    }
  };

  if (!empresaId) return null;

  return <>
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-body">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div><div className="eyebrow">Taller</div><h3 style={{ margin: 0 }}>Recepciones de equipos de clientes</h3><div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>Piezas ingresadas aún pendientes de cotización.</div></div>
          <button type="button" className="btn btn-secondary" onClick={abrirRecepcion}>{I.plus} Nueva recepción</button>
        </div>
        {error && !modalRecepcion && !modalDevolucion && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="table-wrap"><table className="tbl" style={{ minWidth: 760 }}><thead><tr><th>Recepción</th><th>Código</th><th>Activo</th><th>Ingreso</th><th>Días</th><th>Guía</th><th /></tr></thead><tbody>
          {recepciones.map(recepcion => {
            const activo = activosPorId.get(recepcion.activo_id);
            return <tr key={recepcion.id}>
              <td className="mono"><strong>{recepcion.numero}</strong></td><td className="mono">{activo?.codigo || '—'}</td><td>{activo?.nombre || 'Activo no disponible'}{activo?.modelo ? ` · ${activo.modelo}` : ''}</td>
              <td>{recepcion.fecha_ingreso || '—'}{recepcion.hora_ingreso ? ` ${String(recepcion.hora_ingreso).slice(0, 5)}` : ''}</td><td>{diasDesde(recepcion.fecha_ingreso)}</td><td>{recepcion.guia_ingreso || '—'}</td>
              <td style={{ whiteSpace: 'nowrap' }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirCotizacion(recepcion)} disabled={saving}>Crear cotización</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => iniciarHojaCosteo(recepcion)} disabled={saving}>{I.clipboard} Iniciar Hoja de Costeo</button><button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => abrirDevolucion(recepcion)} disabled={saving}>Devolver sin cotizar</button></td>
            </tr>;
          })}
          {!recepciones.length && <tr><td colSpan="7" className="text-center text-muted" style={{ padding: 24 }}>{loading ? 'Cargando recepciones…' : 'No hay recepciones pendientes de cotizar.'}</td></tr>}
        </tbody></table></div>
      </div>
    </div>

    {modalRecepcion && <div className="modal-backdrop"><div className="modal" style={{ maxWidth: 760, width: 'calc(100vw - 32px)', maxHeight: '92vh', overflow: 'auto' }}><div className="modal-head"><div><h2>Nueva recepción</h2><div className="text-muted" style={{ fontSize: 12 }}>El número se asignará automáticamente al guardar.</div></div><button className="icon-btn" onClick={cerrarRecepcion}>{I.x}</button></div><form onSubmit={guardarRecepcion}><div className="modal-body">{error && <div className="alert alert-danger" style={{ marginBottom: 14 }}>{error}</div>}<div className="grid-2" style={{ gap: 14 }}>
      <div className="input-group" style={{ gridColumn: '1/-1' }}><label>Buscar activo (modo libre) *</label><input className="input" value={assetSearch} onChange={e => setAssetSearch(e.target.value)} placeholder="Código, equipo, modelo, fabricante o serie" /><div style={{ border: '1px solid var(--border)', borderRadius: 8, marginTop: 6, maxHeight: 160, overflow: 'auto' }}>{activosFiltrados.map(activo => <button key={activo.id} type="button" onClick={() => actualizarForm('activo_id', activo.id)} style={{ display: 'block', width: '100%', border: 'none', background: activo.id === form.activo_id ? 'var(--bg-subtle)' : 'transparent', padding: '9px 10px', textAlign: 'left', cursor: 'pointer' }}><strong className="mono">{activo.codigo}</strong> · {activo.nombre}{activo.modelo ? ` · ${activo.modelo}` : ''}{activo.marca ? ` · ${activo.marca}` : ''}</button>)}</div>{activoSeleccionado && <div className="text-muted" style={{ marginTop: 6, fontSize: 12 }}>Seleccionado: <strong>{activoSeleccionado.codigo}</strong> · {activoSeleccionado.nombre}</div>}<button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => { setAssetForm(emptyAsset(assetSearch.trim())); setModalActivo(true); setError(''); }}>{I.plus} Crear activo nuevo</button></div>
      <div className="input-group"><label>Fecha de ingreso *</label><input className="input" type="date" value={form.fecha_ingreso} onChange={e => actualizarForm('fecha_ingreso', e.target.value)} required /></div><div className="input-group"><label>Hora de ingreso</label><input className="input" type="time" value={form.hora_ingreso} onChange={e => actualizarForm('hora_ingreso', e.target.value)} /></div><div className="input-group"><label>Guía de ingreso</label><input className="input" value={form.guia_ingreso} onChange={e => actualizarForm('guia_ingreso', e.target.value)} placeholder="N° guía o documento" /></div><div className="input-group"><label>Sociedad</label><select className="select" value={form.sociedad_id} onChange={e => actualizarForm('sociedad_id', e.target.value)}><option value="">Sin sociedad</option>{sociedadesDisponibles.filter(s => s.activa !== false).map(s => <option key={s.id} value={s.id}>{s.razon_social || s.nombre || s.codigo}</option>)}</select></div><div className="input-group" style={{ gridColumn: '1/-1' }}><label>Observaciones</label><textarea className="input" rows="3" value={form.observaciones} onChange={e => actualizarForm('observaciones', e.target.value)} /></div>
    </div></div><div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={cerrarRecepcion}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Registrar recepción'}</button></div></form></div></div>}

    {modalActivo && <div className="modal-backdrop" style={{ zIndex: 1001 }}><div className="modal" style={{ maxWidth: 680, width: 'calc(100vw - 32px)' }}><div className="modal-head"><div><h2>Nuevo equipo de cliente</h2><div className="text-muted" style={{ fontSize: 12 }}>Equipo de cliente en custodia, sin campos financieros.</div></div><button className="icon-btn" onClick={() => { setModalActivo(false); setError(''); }}>{I.x}</button></div><div className="modal-body">{error && <div className="alert alert-danger" style={{ marginBottom: 14 }}>{error}</div>}<div className="grid-2" style={{ gap: 14 }}>
      <div className="input-group"><label>Cliente propietario *</label><select className="select" value={assetForm.cliente_propietario_id} onChange={e => actualizarActivo('cliente_propietario_id', e.target.value)}><option value="">Seleccionar cliente</option>{cuentas.filter(cuenta => cuenta.empresa_id === empresaId).map(cuenta => <option key={cuenta.id} value={cuenta.id}>{nombreCuenta(cuenta)}</option>)}</select></div><div className="input-group"><label>Código *</label><input className="input" value={assetForm.codigo} onChange={e => actualizarActivo('codigo', e.target.value)} /></div><div className="input-group"><label>Nombre *</label><input className="input" value={assetForm.nombre} onChange={e => actualizarActivo('nombre', e.target.value)} /></div><div className="input-group"><label>Tipo / categoría</label><select className="select" value={assetForm.tipo_categoria} onChange={e => actualizarActivo('tipo_categoria', e.target.value)}><option value="equipo">Equipo</option><option value="inmueble">Inmueble</option><option value="otro">Otro</option></select></div><div className="input-group"><label>Marca</label><input className="input" value={assetForm.marca} onChange={e => actualizarActivo('marca', e.target.value)} /></div><div className="input-group"><label>Modelo</label><input className="input" value={assetForm.modelo} onChange={e => actualizarActivo('modelo', e.target.value)} /></div><div className="input-group"><label>Placa / N° serie</label><input className="input" value={assetForm.placa_serie} onChange={e => actualizarActivo('placa_serie', e.target.value)} /></div><div className="input-group"><label>Estado</label><select className="select" value={assetForm.estado} onChange={e => actualizarActivo('estado', e.target.value)}><option value="operativo">Operativo</option><option value="en_mantenimiento">En mantenimiento</option><option value="dado_baja">Dado de baja</option></select></div><div className="input-group" style={{ gridColumn: '1/-1' }}><label>Observación</label><textarea className="input" rows="3" value={assetForm.observacion} onChange={e => actualizarActivo('observacion', e.target.value)} /></div>
    </div></div><div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={() => { setModalActivo(false); setError(''); }}>Cancelar</button><button type="button" className="btn btn-primary" onClick={guardarActivo} disabled={saving}>{saving ? 'Guardando…' : 'Crear y seleccionar activo'}</button></div></div></div>}

    {modalDevolucion && <div className="modal-backdrop"><div className="modal" style={{ maxWidth: 520 }}><div className="modal-head"><div><h2>Devolver sin cotizar</h2><div className="text-muted" style={{ fontSize: 12 }}>{modalDevolucion.numero}</div></div><button className="icon-btn" onClick={() => { setModalDevolucion(null); setError(''); }}>{I.x}</button></div><form onSubmit={guardarDevolucion}><div className="modal-body">{error && <div className="alert alert-danger" style={{ marginBottom: 14 }}>{error}</div>}<div className="grid-2" style={{ gap: 14 }}><div className="input-group"><label>Fecha de devolución *</label><input className="input" type="date" value={devolucion.fecha_devolucion} onChange={e => setDevolucion(actual => ({ ...actual, fecha_devolucion: e.target.value }))} required /></div><div className="input-group"><label>Guía de devolución</label><input className="input" value={devolucion.guia_devolucion} onChange={e => setDevolucion(actual => ({ ...actual, guia_devolucion: e.target.value }))} placeholder="N° guía o documento" /></div></div></div><div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={() => { setModalDevolucion(null); setError(''); }}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Confirmar devolución'}</button></div></form></div></div>}
  </>;
}
