import React, { useEffect, useMemo, useState } from 'react';
import { I, money } from './icons.jsx';
import { useApp } from './context.jsx';
import { getActivosParaOS } from './services/activosService.js';

const moneyValue = (value, moneda = 'PEN') => money(Number(value || 0), moneda === 'USD' ? '$' : 'S/');

const ESTADOS_PRODUCCION = ['Evaluación', 'Cotización', 'Stand By', 'Proceso', 'Terminado', 'No Procede', 'Devolución', 'Entregado', 'Negociación'];
const PRODUCTION_STYLE = {
  'Evaluación': { background: '#cffafe', color: '#155e75', borderColor: '#67e8f9' },
  'Cotización': { background: '#f3e8ff', color: '#6b21a8', borderColor: '#d8b4fe' },
  'Stand By': { background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' },
  'Proceso': { background: '#dbeafe', color: '#1e40af', borderColor: '#93c5fd' },
  'Terminado': { background: '#dcfce7', color: '#166534', borderColor: '#86efac' },
  'No Procede': { background: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' },
  'Devolución': { background: '#ffedd5', color: '#9a3412', borderColor: '#fdba74' },
  'Entregado': { background: '#ccfbf1', color: '#0f766e', borderColor: '#5eead4' },
  'Negociación': { background: '#ede9fe', color: '#5b21b6', borderColor: '#c4b5fd' },
};
const labelEstado = estado => String(estado || '—').replaceAll('_', ' ');
// La etiqueta visible es "Descripción", pero el campo real de os_clientes es nombre.
const descripcionOS = os => String(os?.nombre || '').trim();
const tooltipTexto = (valor, vacio) => String(valor || '').trim() || vacio;
const GRID_ICON_STYLE = {
  descripcion: { background: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc', borderRadius: 6 },
  observaciones: { background: '#f3e8ff', color: '#7e22ce', border: '1px solid #d8b4fe', borderRadius: 6 },
  editar: { background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: 6 },
  eliminar: { background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: 6 },
};

const emptyForm = (sociedadId = '') => ({
  cuenta_id: '', activo_id: '', cotizacion_id: '', sociedad_id: sociedadId,
  nombre: '', numero: '', estado: 'en_ejecucion', monto_aprobado: '',
  fecha_emision: new Date().toISOString().slice(0, 10), fecha_inicio: '', fecha_fin: '',
  responsable_comercial: '', observaciones: '',
});

const emptyCustomerAsset = (codigo = '') => ({
  codigo, nombre: '', tipo_categoria: 'equipo', marca: '', modelo: '',
  placa_serie: '', estado: 'operativo', observacion: '',
});

function PanelProduccionOSCliente() {
  const {
    empresa, osClientes, cuentas, cotizaciones, facturas, cxc, usuarios,
    sociedadesDisponibles = [], sociedadActiva,
    actualizarOSCliente, crearOSClienteManual, crearActivoCtx, eliminarOSCliente, addNotificacion, addToast,
  } = useApp();
  const empresaId = empresa?.id || '';
  const [activos, setActivos] = useState([]);
  const [loadingActivos, setLoadingActivos] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [assetSearch, setAssetSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [modalActivoCliente, setModalActivoCliente] = useState(false);
  const [form, setForm] = useState(() => emptyForm(sociedadActiva?.id || sociedadesDisponibles[0]?.id || ''));
  const [activoNuevo, setActivoNuevo] = useState(() => emptyCustomerAsset());
  const [saving, setSaving] = useState(false);
  const sociedadPorDefecto = sociedadActiva?.id || sociedadesDisponibles[0]?.id || '';

  const cargarActivos = async () => {
    if (!empresaId) { setActivos([]); return; }
    setLoadingActivos(true);
    try { setActivos(await getActivosParaOS(empresaId)); }
    catch (err) { setError(err?.message || 'No se pudieron cargar los activos.'); }
    finally { setLoadingActivos(false); }
  };
  useEffect(() => { cargarActivos(); }, [empresaId]);

  const rows = useMemo(() => osClientes
    .filter(os => os.empresa_id === empresaId)
    .map(os => {
      const cuenta = cuentas.find(c => c.id === os.cuenta_id);
      const cotizacion = cotizaciones.find(c => c.id === os.cotizacion_id);
      const activo = activos.find(a => a.id === os.activo_id);
      const facturasOS = facturas.filter(f => f.os_cliente_id === os.id);
      const cxcOS = cxc.filter(item => item.os_cliente_id === os.id);
      return { os, cuenta, cotizacion, activo, facturasOS, cxcOS };
    }), [osClientes, cuentas, cotizaciones, activos, facturas, cxc, empresaId]);

  const visibleRows = rows.filter(({ os, cuenta, cotizacion, activo }) => {
    const value = [os.numero, cuenta?.razon_social, cuenta?.nombre_comercial, cotizacion?.numero, activo?.codigo, activo?.nombre, activo?.modelo, activo?.marca, os.estado].filter(Boolean).join(' ').toLowerCase();
    return value.includes(search.trim().toLowerCase());
  });
  const kpis = useMemo(() => ({
    total: rows.length,
    enProceso: rows.filter(({ os }) => os.estado_produccion === 'Proceso').length,
    facturado: rows.reduce((total, { os }) => total + Number(os.monto_facturado || 0), 0),
    pendienteCobro: rows.reduce((total, { os }) => total + Math.max(0, Number(os.monto_facturado || 0) - Number(os.monto_cobrado || 0)), 0),
  }), [rows]);
  const activosFiltrados = activos.filter(a => [a.codigo, a.nombre, a.modelo, a.marca].filter(Boolean).join(' ').toLowerCase().includes(assetSearch.trim().toLowerCase()));
  const activoSeleccionado = activos.find(a => a.id === form.activo_id) || null;
  const codigoYaExiste = activos.some(a => String(a.codigo || '').trim().toLowerCase() === activoNuevo.codigo.trim().toLowerCase());
  const clienteSeleccionado = cuentas.find(c => c.id === form.cuenta_id);

  const updateForm = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const updateActivoNuevo = (field, value) => setActivoNuevo(current => ({ ...current, [field]: value }));
  const cerrarModalOS = () => { setModalActivoCliente(false); setModal(null); setError(''); };
  const abrirCrear = () => {
    setForm(emptyForm(sociedadPorDefecto)); setAssetSearch(''); setActivoNuevo(emptyCustomerAsset());
    setModalActivoCliente(false); setError(''); setModal('crear');
  };
  const abrirEditar = (os) => {
    setForm({ cuenta_id: os.cuenta_id || '', activo_id: os.activo_id || '', cotizacion_id: os.cotizacion_id || '', sociedad_id: os.sociedad_id || sociedadPorDefecto, nombre: os.nombre || '', numero: os.numero || '', estado: os.estado || 'en_ejecucion', monto_aprobado: os.monto_aprobado ?? '', fecha_emision: os.fecha_emision || '', fecha_inicio: os.fecha_inicio || '', fecha_fin: os.fecha_fin || '', responsable_comercial: os.responsable_comercial || '', observaciones: os.observaciones || '' });
    setAssetSearch(''); setActivoNuevo(emptyCustomerAsset()); setModalActivoCliente(false); setError(''); setModal(os);
  };
  const abrirAltaActivoCliente = () => {
    if (!form.cuenta_id) return setError('Selecciona primero el cliente para registrar su equipo en custodia.');
    setError(''); setActivoNuevo(emptyCustomerAsset(assetSearch.trim())); setModalActivoCliente(true);
  };
  const crearActivoNuevo = async () => {
    if (!form.cuenta_id) return setError('Selecciona primero el cliente propietario del activo nuevo.');
    if (!activoNuevo.codigo.trim() || !activoNuevo.nombre.trim()) return setError('Código y nombre son obligatorios para crear el equipo de cliente.');
    if (codigoYaExiste) return setError(`Ya existe un activo con el código "${activoNuevo.codigo.trim()}" en esta empresa. Selecciónalo desde el buscador.`);
    setSaving(true);
    try {
      const data = await crearActivoCtx({ codigo: activoNuevo.codigo.trim(), nombre: activoNuevo.nombre.trim(), tipo_categoria: activoNuevo.tipo_categoria || 'equipo', marca: activoNuevo.marca.trim() || null, modelo: activoNuevo.modelo.trim() || null, placa_serie: activoNuevo.placa_serie.trim() || null, estado: activoNuevo.estado || 'operativo', observacion: activoNuevo.observacion.trim() || null, propietario_tipo: 'cliente', cliente_propietario_id: form.cuenta_id });
      setActivos(previous => [...previous, data].sort((a, b) => String(a.codigo || '').localeCompare(String(b.codigo || ''))));
      updateForm('activo_id', data.id); setAssetSearch(data.codigo || ''); setModalActivoCliente(false);
      addNotificacion('Equipo de cliente creado y seleccionado.');
    } catch (err) {
      if (err?.code === '23505' || /empresa_id.*codigo|codigo.*empresa_id/i.test(err?.message || '')) setError(`Ya existe un activo con el código "${activoNuevo.codigo.trim()}" en esta empresa. Selecciónalo desde el buscador.`);
      else setError(err?.message || 'No se pudo crear el equipo de cliente.');
    } finally { setSaving(false); }
  };
  const guardarOS = async event => {
    event.preventDefault();
    if (!form.cuenta_id || !form.nombre.trim()) return setError('Cliente y descripción son obligatorios.');
    if (!form.activo_id) return setError('Selecciona o crea un activo para esta OS Cliente.');
    setSaving(true);
    const responsable = (usuarios || []).find(user => user.nombre === form.responsable_comercial);
    const payload = { cuenta_id: form.cuenta_id, activo_id: form.activo_id, cotizacion_id: form.cotizacion_id || null, sociedad_id: form.sociedad_id || null, nombre: form.nombre.trim(), estado: form.estado, monto_aprobado: Number(form.monto_aprobado || 0), fecha_emision: form.fecha_emision || null, fecha_inicio: form.fecha_inicio || null, fecha_fin: form.fecha_fin || null, responsable_comercial: form.responsable_comercial.trim() || responsable?.nombre || null, observaciones: form.observaciones.trim() || null };
    try {
      if (modal === 'crear') await crearOSClienteManual({ ...payload, numero: form.numero.trim() || undefined }, { navegarAlDetalle: false });
      else await actualizarOSCliente(modal.id, payload);
      cerrarModalOS(); addNotificacion('OS Cliente actualizada en el Panel de Producción.');
    } catch (err) { setError(err?.message || 'No se pudo guardar la OS Cliente.'); }
    finally { setSaving(false); }
  };
  const actualizarInline = (os, field, value) => actualizarOSCliente(os.id, { [field]: value });
  const eliminarFila = async ({ os, facturasOS, cxcOS }) => {
    if (facturasOS.length || cxcOS.length) {
      const mensaje = `No se puede eliminar la OS ${os.numero || ''}: tiene ${facturasOS.length} factura(s) y ${cxcOS.length} registro(s) de CxC asociados.`;
      setError(mensaje);
      addToast(mensaje, 'warning');
      return;
    }
    if (!window.confirm(`¿Eliminar la OS Cliente ${os.numero || ''}? Esta acción no se puede deshacer.`)) return;
    try {
      const resultado = await eliminarOSCliente(os.id);
      if (!resultado?.eliminada) {
        setError(resultado?.motivo || 'No se puede eliminar la OS porque tiene registros asociados.');
        return;
      }
      addNotificacion('OS Cliente eliminada.');
    } catch (err) {
      setError(err?.message || 'No se pudo eliminar la OS Cliente.');
    }
  };

  if (!empresaId) return <div className="p-4"><div className="alert alert-warning">Selecciona una empresa activa para consultar el Panel de Producción.</div></div>;

  return <div className="page">
    <div className="page-header"><div><div className="eyebrow">Seguimiento de producción</div><h1 className="page-title">Panel de Producción</h1><div className="page-sub">Seguimiento por OS Cliente · {rows.length} OS registradas</div></div><button className="btn btn-primary" onClick={abrirCrear}>{I.plus} Nueva OS Cliente</button></div>
    <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', marginBottom: 16 }}>
      <div className="kpi-card"><div className="kpi-label">Total OS</div><div className="kpi-value">{kpis.total}</div><div className="kpi-icon cyan">{I.clipboard}</div></div>
      <div className="kpi-card"><div className="kpi-label">En producción</div><div className="kpi-value">{kpis.enProceso}</div><div className="kpi-icon orange">{I.wrench}</div></div>
      <div className="kpi-card"><div className="kpi-label">Monto facturado</div><div className="kpi-value" style={{ fontSize: 20 }}>{moneyValue(kpis.facturado, empresa?.moneda)}</div><div className="kpi-icon green">{I.receipt}</div></div>
      <div className="kpi-card"><div className="kpi-label">Pendiente de cobro</div><div className="kpi-value" style={{ fontSize: 20 }}>{moneyValue(kpis.pendienteCobro, empresa?.moneda)}</div><div className="kpi-icon orange">{I.dollar}</div></div>
    </div>
    <div className="card" style={{ marginBottom: 16 }}><div className="card-body row" style={{ gap: 12 }}><input className="input" style={{ maxWidth: 420 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar OS, cliente, cotización o activo" /><span className="text-muted" style={{ alignSelf: 'center', fontSize: 12 }}>{loadingActivos ? 'Cargando activos…' : `${activos.length} activos disponibles`}</span></div></div>
    {error && !modal && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}
    <div className="card"><div className="table-wrap"><table className="tbl" style={{ minWidth: 2120 }}><thead><tr><th>OS</th><th>N° cotización</th><th>Cliente</th><th>Código de activo</th><th>Equipo</th><th>Modelo</th><th>Fabricante</th><th>Descripción</th><th>Observaciones</th><th>Estado</th><th>Estado producción</th><th>Emisión</th><th>Inicio</th><th>Fin</th><th>Vendedor</th><th>Precio</th><th>Factura</th><th>Pagos</th><th /></tr></thead><tbody>
      {visibleRows.map(({ os, cuenta, cotizacion, activo, facturasOS, cxcOS }) => <tr key={os.id}>
        <td><strong>{os.numero}</strong></td><td>{cotizacion?.numero || '—'}</td><td>{cuenta?.razon_social || cuenta?.nombre_comercial || '—'}</td><td className="mono">{activo?.codigo || '—'}</td><td>{activo?.nombre || '—'}</td><td>{activo?.modelo || '—'}</td><td>{activo?.marca || '—'}</td>
        <td><button type="button" className="icon-btn" title={tooltipTexto(descripcionOS(os), 'Sin descripción en esta OS Cliente')} aria-label="Ver descripción de la OS Cliente" style={GRID_ICON_STYLE.descripcion}>{I.file}</button></td>
        <td><button type="button" className="icon-btn" title={tooltipTexto(os.observaciones, 'Sin observaciones en esta OS Cliente')} aria-label="Ver observaciones de la OS Cliente" style={GRID_ICON_STYLE.observaciones}>{I.clipboard}</button></td>
        <td><span className="badge badge-gray">{labelEstado(os.estado)}</span></td>
        <td><select className="select badge" style={{ minWidth: 128, ...(os.estado_produccion ? PRODUCTION_STYLE[os.estado_produccion] : { background: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' }) }} value={os.estado_produccion || ''} onChange={e => actualizarInline(os, 'estado_produccion', e.target.value || null)}><option value="">Sin definir</option>{ESTADOS_PRODUCCION.map(estado => <option key={estado} value={estado}>{estado}</option>)}</select></td>
        <td><input className="input" type="date" defaultValue={os.fecha_emision || ''} onBlur={e => actualizarInline(os, 'fecha_emision', e.target.value || null)} /></td><td><input className="input" type="date" defaultValue={os.fecha_inicio || ''} onBlur={e => actualizarInline(os, 'fecha_inicio', e.target.value || null)} /></td><td><input className="input" type="date" defaultValue={os.fecha_fin || ''} onBlur={e => actualizarInline(os, 'fecha_fin', e.target.value || null)} /></td><td><input className="input" style={{ minWidth: 130 }} defaultValue={os.responsable_comercial || ''} onBlur={e => actualizarInline(os, 'responsable_comercial', e.target.value || null)} placeholder="Sin asignar" /></td><td><input className="input" type="number" min="0" defaultValue={os.monto_aprobado ?? 0} onBlur={e => actualizarInline(os, 'monto_aprobado', Number(e.target.value || 0))} /></td>
        <td title={`${facturasOS.length} factura(s) vinculada(s)`}>{moneyValue(os.monto_facturado, os.moneda)}<br /><span className="text-muted" style={{ fontSize: 11 }}>{facturasOS.length} doc.</span></td><td title={`${cxcOS.length} CxC vinculada(s)`}>{moneyValue(os.monto_cobrado, os.moneda)}<br /><span className="text-muted" style={{ fontSize: 11 }}>{cxcOS.length} CxC</span></td>
        <td style={{ whiteSpace: 'nowrap' }}><button type="button" className="icon-btn" title="Editar OS Cliente" style={GRID_ICON_STYLE.editar} onClick={() => abrirEditar(os)}>{I.edit}</button><button type="button" className="icon-btn" title="Eliminar OS Cliente" style={GRID_ICON_STYLE.eliminar} onClick={() => eliminarFila({ os, facturasOS, cxcOS })}>{I.trash}</button></td>
      </tr>)}
      {!visibleRows.length && <tr><td colSpan="19" className="text-center text-muted" style={{ padding: 36 }}>No hay OS Cliente para mostrar.</td></tr>}
    </tbody></table></div></div>
    {modal && <div className="modal-backdrop"><div className="modal" style={{ maxWidth: 860, width: 'calc(100vw - 32px)', maxHeight: '92vh', overflow: 'auto' }}><div className="modal-head"><div><h2>{modal === 'crear' ? 'Nueva OS Cliente' : 'Editar OS Cliente'}</h2><div className="text-muted" style={{ fontSize: 12 }}>El activo se busca libremente entre todos los activos de la empresa activa.</div></div><button className="icon-btn" onClick={cerrarModalOS}>{I.x}</button></div><form onSubmit={guardarOS}><div className="modal-body">{error && <div className="alert alert-danger" style={{ marginBottom: 14 }}>{error}</div>}<div className="grid-2" style={{ gap: 14 }}>
      <div className="input-group"><label>Cliente *</label><select className="select" value={form.cuenta_id} onChange={e => updateForm('cuenta_id', e.target.value)} required><option value="">Seleccionar</option>{cuentas.filter(c => c.empresa_id === empresaId).map(c => <option key={c.id} value={c.id}>{c.razon_social || c.nombre_comercial}</option>)}</select></div><div className="input-group"><label>Sociedad *</label><select className="select" value={form.sociedad_id} onChange={e => updateForm('sociedad_id', e.target.value)} required><option value="">Seleccionar</option>{sociedadesDisponibles.filter(s => s.activa !== false).map(s => <option key={s.id} value={s.id}>{s.razon_social || s.nombre || s.codigo}</option>)}</select></div><div className="input-group"><label>N° OS</label><input className="input" value={form.numero} onChange={e => updateForm('numero', e.target.value)} placeholder="Automático al crear" disabled={modal !== 'crear'} /></div><div className="input-group"><label>Cotización</label><select className="select" value={form.cotizacion_id} onChange={e => updateForm('cotizacion_id', e.target.value)}><option value="">Sin cotización</option>{cotizaciones.filter(c => c.empresa_id === empresaId).map(c => <option key={c.id} value={c.id}>{c.numero}</option>)}</select></div><div className="input-group" style={{ gridColumn: '1/-1' }}><label>Descripción *</label><input className="input" value={form.nombre} onChange={e => updateForm('nombre', e.target.value)} required /></div>
      <div className="input-group" style={{ gridColumn: '1/-1' }}><label>Buscar activo (modo libre)</label><input className="input" value={assetSearch} onChange={e => setAssetSearch(e.target.value)} placeholder="Código, equipo, modelo o fabricante; no se filtra por cliente" /><div style={{ border: '1px solid var(--border)', borderRadius: 8, marginTop: 6, maxHeight: 160, overflow: 'auto' }}>{activosFiltrados.slice(0, 12).map(a => <button type="button" key={a.id} onClick={() => updateForm('activo_id', a.id)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: a.id === form.activo_id ? 'var(--bg-subtle)' : 'transparent', padding: '9px 10px', cursor: 'pointer' }}><strong className="mono">{a.codigo}</strong> · {a.nombre}{a.modelo ? ` · ${a.modelo}` : ''}{a.marca ? ` · ${a.marca}` : ''}</button>)}{assetSearch && !activosFiltrados.length && <div className="text-muted" style={{ padding: 10 }}>No hay coincidencias para esta búsqueda.</div>}</div>{activoSeleccionado && <div className="text-muted" style={{ marginTop: 6, fontSize: 12 }}>Seleccionado: <strong>{activoSeleccionado.codigo}</strong> · {activoSeleccionado.nombre}</div>}<button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={abrirAltaActivoCliente}>{I.plus} Crear activo nuevo</button></div>
      <div className="input-group"><label>Estado</label><select className="select" value={form.estado} onChange={e => updateForm('estado', e.target.value)}><option value="en_ejecucion">En ejecución</option><option value="en_pausa">En pausa</option><option value="cerrada">Cerrada</option><option value="anulada">Anulada</option></select></div><div className="input-group"><label>Precio</label><input className="input" type="number" min="0" value={form.monto_aprobado} onChange={e => updateForm('monto_aprobado', e.target.value)} /></div><div className="input-group"><label>Fecha emisión</label><input className="input" type="date" value={form.fecha_emision} onChange={e => updateForm('fecha_emision', e.target.value)} /></div><div className="input-group"><label>Fecha inicio</label><input className="input" type="date" value={form.fecha_inicio} onChange={e => updateForm('fecha_inicio', e.target.value)} /></div><div className="input-group"><label>Fecha fin</label><input className="input" type="date" value={form.fecha_fin} onChange={e => updateForm('fecha_fin', e.target.value)} /></div><div className="input-group"><label>Vendedor</label><input className="input" list="produccion-vendedores" value={form.responsable_comercial} onChange={e => updateForm('responsable_comercial', e.target.value)} /><datalist id="produccion-vendedores">{usuarios.map(u => <option key={u.id} value={u.nombre} />)}</datalist></div><div className="input-group" style={{ gridColumn: '1/-1' }}><label>Observaciones</label><textarea className="input" rows="3" value={form.observaciones} onChange={e => updateForm('observaciones', e.target.value)} /></div>
    </div></div><div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={cerrarModalOS}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar OS Cliente'}</button></div></form></div></div>}
    {modalActivoCliente && <div className="modal-backdrop" style={{ zIndex: 1001 }}><div className="modal" style={{ maxWidth: 680, width: 'calc(100vw - 32px)' }}><div className="modal-head"><div><h2>Nuevo equipo de cliente</h2><div className="text-muted" style={{ fontSize: 12 }}>Equipo en custodia asociado al cliente de esta OS.</div></div><button className="icon-btn" onClick={() => { setModalActivoCliente(false); setError(''); }}>{I.x}</button></div><div className="modal-body">{error && <div className="alert alert-danger" style={{ marginBottom: 14 }}>{error}</div>}<div className="alert alert-info" style={{ marginBottom: 14 }}>Cliente propietario: <strong>{clienteSeleccionado?.razon_social || clienteSeleccionado?.nombre_comercial || 'Sin seleccionar'}</strong></div><div className="grid-2" style={{ gap: 14 }}><div className="input-group"><label>Código *</label><input className="input" value={activoNuevo.codigo} onChange={e => updateActivoNuevo('codigo', e.target.value)} /></div><div className="input-group"><label>Nombre *</label><input className="input" value={activoNuevo.nombre} onChange={e => updateActivoNuevo('nombre', e.target.value)} /></div><div className="input-group"><label>Tipo / Categoría</label><select className="select" value={activoNuevo.tipo_categoria} onChange={e => updateActivoNuevo('tipo_categoria', e.target.value)}><option value="equipo">Equipo</option><option value="inmueble">Inmueble</option><option value="otro">Otro</option></select></div><div className="input-group"><label>Marca</label><input className="input" value={activoNuevo.marca} onChange={e => updateActivoNuevo('marca', e.target.value)} /></div><div className="input-group"><label>Modelo</label><input className="input" value={activoNuevo.modelo} onChange={e => updateActivoNuevo('modelo', e.target.value)} /></div><div className="input-group"><label>Placa / N° serie</label><input className="input" value={activoNuevo.placa_serie} onChange={e => updateActivoNuevo('placa_serie', e.target.value)} /></div><div className="input-group"><label>Estado</label><select className="select" value={activoNuevo.estado} onChange={e => updateActivoNuevo('estado', e.target.value)}><option value="operativo">Operativo</option><option value="en_mantenimiento">En mantenimiento</option><option value="dado_baja">Dado de baja</option></select></div><div className="input-group" style={{ gridColumn: '1/-1' }}><label>Observación</label><textarea className="input" rows="3" value={activoNuevo.observacion} onChange={e => updateActivoNuevo('observacion', e.target.value)} /></div></div></div><div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={() => { setModalActivoCliente(false); setError(''); }}>Cancelar</button><button type="button" className="btn btn-primary" onClick={crearActivoNuevo} disabled={saving}>{saving ? 'Guardando…' : 'Crear y seleccionar activo'}</button></div></div></div>}
  </div>;
}

export { PanelProduccionOSCliente };
