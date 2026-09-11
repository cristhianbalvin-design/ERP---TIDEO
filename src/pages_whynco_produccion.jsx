import React, { useEffect, useMemo, useState } from 'react';
import { I, money } from './icons.jsx';
import { useApp } from './context.jsx';
import { getActivosParaOS } from './services/activosService.js';

const WHYNCO_EMPRESA_ID = 'emp_20513453711';

const descriptionsFromQuote = (cotizacion) => {
  const items = Array.isArray(cotizacion?.items) ? cotizacion.items : [];
  const descriptions = items
    .map(item => typeof item === 'object' && item ? item.descripcion : null)
    .filter(Boolean);
  return descriptions.length ? descriptions.join(' · ') : '—';
};

const moneyValue = (value, moneda = 'PEN') => money(Number(value || 0), moneda === 'USD' ? '$' : 'S/');

const emptyForm = (sociedadId = '') => ({
  cuenta_id: '', activo_id: '', cotizacion_id: '', sociedad_id: sociedadId,
  nombre: '', numero: '', estado: 'en_ejecucion', monto_aprobado: '',
  fecha_emision: new Date().toISOString().slice(0, 10), fecha_inicio: '', fecha_fin: '',
  responsable_comercial: '', observaciones: '',
});

function PanelProduccionWhynco() {
  const {
    empresa, osClientes, cuentas, cotizaciones, facturas, cxc, usuarios,
    sociedadesDisponibles = [], sociedadActiva,
    actualizarOSCliente, crearOSClienteManual, crearActivoCtx, addNotificacion,
  } = useApp();
  const [activos, setActivos] = useState([]);
  const [loadingActivos, setLoadingActivos] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [assetSearch, setAssetSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(() => emptyForm(sociedadActiva?.id || sociedadesDisponibles[0]?.id || ''));
  const [creandoActivo, setCreandoActivo] = useState(false);
  const [activoNuevo, setActivoNuevo] = useState({ codigo: '', nombre: '', modelo: '', marca: '' });
  const [saving, setSaving] = useState(false);

  const esWhynco = empresa?.id === WHYNCO_EMPRESA_ID;
  const sociedadPorDefecto = sociedadActiva?.id || sociedadesDisponibles[0]?.id || '';

  const cargarActivos = async () => {
    if (!esWhynco) return;
    setLoadingActivos(true);
    try {
      setActivos(await getActivosParaOS(WHYNCO_EMPRESA_ID));
    } catch (err) {
      setError(err?.message || 'No se pudieron cargar los activos.');
    } finally {
      setLoadingActivos(false);
    }
  };

  useEffect(() => { cargarActivos(); }, [esWhynco]);

  const rows = useMemo(() => osClientes
    .filter(os => os.empresa_id === WHYNCO_EMPRESA_ID)
    .map(os => {
      const cuenta = cuentas.find(c => c.id === os.cuenta_id);
      const cotizacion = cotizaciones.find(c => c.id === os.cotizacion_id);
      const activo = activos.find(a => a.id === os.activo_id);
      const facturasOS = facturas.filter(f => f.os_cliente_id === os.id);
      const cxcOS = cxc.filter(item => item.os_cliente_id === os.id);
      return { os, cuenta, cotizacion, activo, facturasOS, cxcOS };
    }), [osClientes, cuentas, cotizaciones, activos, facturas, cxc]);

  const visibleRows = rows.filter(({ os, cuenta, cotizacion, activo }) => {
    const value = [os.numero, cuenta?.razon_social, cuenta?.nombre_comercial, cotizacion?.numero,
      activo?.codigo, activo?.nombre, activo?.modelo, activo?.marca, os.estado]
      .filter(Boolean).join(' ').toLowerCase();
    return value.includes(search.trim().toLowerCase());
  });

  const activosFiltrados = activos.filter(a => {
    const value = [a.codigo, a.nombre, a.modelo, a.marca].filter(Boolean).join(' ').toLowerCase();
    return value.includes(assetSearch.trim().toLowerCase());
  });
  const activoSeleccionado = activos.find(a => a.id === form.activo_id) || null;
  const codigoYaExiste = activos.some(a => String(a.codigo || '').trim().toLowerCase() === activoNuevo.codigo.trim().toLowerCase());

  const updateForm = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const updateActivoNuevo = (field, value) => setActivoNuevo(current => ({ ...current, [field]: value }));

  const abrirCrear = () => {
    setForm(emptyForm(sociedadPorDefecto));
    setAssetSearch('');
    setActivoNuevo({ codigo: '', nombre: '', modelo: '', marca: '' });
    setCreandoActivo(false);
    setError('');
    setModal('crear');
  };

  const abrirEditar = (os) => {
    setForm({
      cuenta_id: os.cuenta_id || '', activo_id: os.activo_id || '', cotizacion_id: os.cotizacion_id || '',
      sociedad_id: os.sociedad_id || sociedadPorDefecto, nombre: os.nombre || '', numero: os.numero || '',
      estado: os.estado || 'en_ejecucion', monto_aprobado: os.monto_aprobado ?? '',
      fecha_emision: os.fecha_emision || '', fecha_inicio: os.fecha_inicio || '', fecha_fin: os.fecha_fin || '',
      responsable_comercial: os.responsable_comercial || '', observaciones: os.observaciones || '',
    });
    setAssetSearch('');
    setActivoNuevo({ codigo: '', nombre: '', modelo: '', marca: '' });
    setCreandoActivo(false);
    setError('');
    setModal(os);
  };

  const crearActivoNuevo = async () => {
    if (!form.cuenta_id) return setError('Selecciona primero el cliente propietario del activo nuevo.');
    if (!activoNuevo.codigo.trim() || !activoNuevo.nombre.trim()) {
      return setError('El código y el equipo son obligatorios para crear el activo.');
    }
    if (codigoYaExiste) return setError('Ya existe un activo con ese código en WHYNCO; selecciónalo de la lista.');
    setSaving(true);
    try {
      const data = await crearActivoCtx({
        codigo: activoNuevo.codigo.trim(),
        nombre: activoNuevo.nombre.trim(),
        modelo: activoNuevo.modelo.trim() || null,
        marca: activoNuevo.marca.trim() || null,
        tipo_categoria: 'equipo',
        propietario_tipo: 'cliente',
        cliente_propietario_id: form.cuenta_id,
        activo_padre_id: null,
      });
      setActivos(previous => [...previous, data].sort((a, b) => String(a.codigo || '').localeCompare(String(b.codigo || ''))));
      updateForm('activo_id', data.id);
      setAssetSearch(data.codigo || '');
      setCreandoActivo(false);
      addNotificacion('Activo de cliente creado y seleccionado.');
    } catch (err) {
      setError(err?.message || 'No se pudo crear el activo.');
    } finally {
      setSaving(false);
    }
  };

  const guardarOS = async event => {
    event.preventDefault();
    if (!form.cuenta_id || !form.nombre.trim()) return setError('Cliente y descripción son obligatorios.');
    if (!form.activo_id) return setError('Selecciona o crea un activo para esta OS Cliente.');
    setSaving(true);
    const responsable = (usuarios || []).find(user => user.nombre === form.responsable_comercial);
    const payload = {
      cuenta_id: form.cuenta_id,
      activo_id: form.activo_id,
      cotizacion_id: form.cotizacion_id || null,
      sociedad_id: form.sociedad_id || null,
      nombre: form.nombre.trim(),
      estado: form.estado,
      monto_aprobado: Number(form.monto_aprobado || 0),
      fecha_emision: form.fecha_emision || null,
      fecha_inicio: form.fecha_inicio || null,
      fecha_fin: form.fecha_fin || null,
      responsable_comercial: form.responsable_comercial.trim() || responsable?.nombre || null,
      observaciones: form.observaciones.trim() || null,
    };
    try {
      if (modal === 'crear') {
        await crearOSClienteManual({ ...payload, numero: form.numero.trim() || undefined }, { navegarAlDetalle: false });
      } else {
        await actualizarOSCliente(modal.id, payload);
      }
      setModal(null);
      addNotificacion('OS Cliente actualizada en el Panel de Producción.');
    } catch (err) {
      setError(err?.message || 'No se pudo guardar la OS Cliente.');
    } finally {
      setSaving(false);
    }
  };

  const actualizarInline = (os, field, value) => actualizarOSCliente(os.id, { [field]: value });

  if (!esWhynco) {
    return <div className="p-4"><div className="alert alert-warning">Este panel está disponible únicamente para el tenant WHYNCO.</div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="eyebrow">WHYNCO · Producción</div>
          <h1 className="page-title">Panel de Producción</h1>
          <div className="page-sub">Seguimiento por OS Cliente · {rows.length} OS registradas</div>
        </div>
        <button className="btn btn-primary" onClick={abrirCrear}>{I.plus} Nueva OS Cliente</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body row" style={{ gap: 12 }}>
          <input className="input" style={{ maxWidth: 420 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar OS, cliente, cotización o activo" />
          <span className="text-muted" style={{ alignSelf: 'center', fontSize: 12 }}>{loadingActivos ? 'Cargando activos…' : `${activos.length} activos disponibles`}</span>
        </div>
      </div>
      {error && !modal && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card"><div className="table-wrap"><table className="tbl" style={{ minWidth: 1900 }}>
        <thead><tr>
          <th>OS</th><th>N° cotización</th><th>Cliente</th><th>Código WHYNCO</th><th>Equipo</th><th>Modelo</th><th>Fabricante</th><th>Descripción</th>
          <th>Estado</th><th>Emisión</th><th>Inicio</th><th>Fin</th><th>Vendedor</th><th>Precio</th><th>Factura</th><th>Pagos</th><th />
        </tr></thead>
        <tbody>{visibleRows.map(({ os, cuenta, cotizacion, activo, facturasOS, cxcOS }) => <tr key={os.id}>
          <td><strong>{os.numero}</strong></td>
          <td>{cotizacion?.numero || '—'}</td>
          <td>{cuenta?.razon_social || cuenta?.nombre_comercial || '—'}</td>
          <td className="mono">{activo?.codigo || '—'}</td><td>{activo?.nombre || '—'}</td><td>{activo?.modelo || '—'}</td><td>{activo?.marca || '—'}</td>
          <td style={{ maxWidth: 240, whiteSpace: 'normal' }}>{descriptionsFromQuote(cotizacion)}</td>
          <td><select className="select" value={os.estado || 'en_ejecucion'} onChange={e => actualizarInline(os, 'estado', e.target.value)}><option value="en_ejecucion">En ejecución</option><option value="en_pausa">En pausa</option><option value="cerrada">Cerrada</option><option value="anulada">Anulada</option></select></td>
          <td><input className="input" type="date" defaultValue={os.fecha_emision || ''} onBlur={e => actualizarInline(os, 'fecha_emision', e.target.value || null)} /></td>
          <td><input className="input" type="date" defaultValue={os.fecha_inicio || ''} onBlur={e => actualizarInline(os, 'fecha_inicio', e.target.value || null)} /></td>
          <td><input className="input" type="date" defaultValue={os.fecha_fin || ''} onBlur={e => actualizarInline(os, 'fecha_fin', e.target.value || null)} /></td>
          <td><input className="input" style={{ minWidth: 130 }} defaultValue={os.responsable_comercial || ''} onBlur={e => actualizarInline(os, 'responsable_comercial', e.target.value || null)} placeholder="Sin asignar" /></td>
          <td><input className="input" type="number" min="0" defaultValue={os.monto_aprobado ?? 0} onBlur={e => actualizarInline(os, 'monto_aprobado', Number(e.target.value || 0))} /></td>
          <td title={`${facturasOS.length} factura(s) vinculada(s)`}>{moneyValue(os.monto_facturado, os.moneda)}<br /><span className="text-muted" style={{ fontSize: 11 }}>{facturasOS.length} doc.</span></td>
          <td title={`${cxcOS.length} CxC vinculada(s)`}>{moneyValue(os.monto_cobrado, os.moneda)}<br /><span className="text-muted" style={{ fontSize: 11 }}>{cxcOS.length} CxC</span></td>
          <td><button className="btn btn-secondary btn-sm" onClick={() => abrirEditar(os)}>Editar</button></td>
        </tr>)}
        {!visibleRows.length && <tr><td colSpan="17" className="text-center text-muted" style={{ padding: 36 }}>No hay OS Cliente para mostrar.</td></tr>}
        </tbody>
      </table></div></div>

      {modal && <div className="modal-backdrop"><div className="modal" style={{ maxWidth: 860, width: 'calc(100vw - 32px)', maxHeight: '92vh', overflow: 'auto' }}>
        <div className="modal-head"><div><h2>{modal === 'crear' ? 'Nueva OS Cliente' : 'Editar OS Cliente'}</h2><div className="text-muted" style={{ fontSize: 12 }}>El activo se busca libremente entre todos los activos de WHYNCO.</div></div><button className="icon-btn" onClick={() => setModal(null)}>{I.x}</button></div>
        <form onSubmit={guardarOS}><div className="modal-body">
          {error && <div className="alert alert-danger" style={{ marginBottom: 14 }}>{error}</div>}
          <div className="grid-2" style={{ gap: 14 }}>
            <div className="input-group"><label>Cliente *</label><select className="select" value={form.cuenta_id} onChange={e => updateForm('cuenta_id', e.target.value)} required><option value="">Seleccionar</option>{cuentas.filter(c => c.empresa_id === WHYNCO_EMPRESA_ID).map(c => <option key={c.id} value={c.id}>{c.razon_social || c.nombre_comercial}</option>)}</select></div>
            <div className="input-group"><label>Sociedad *</label><select className="select" value={form.sociedad_id} onChange={e => updateForm('sociedad_id', e.target.value)} required><option value="">Seleccionar</option>{sociedadesDisponibles.filter(s => s.activa !== false).map(s => <option key={s.id} value={s.id}>{s.razon_social || s.nombre || s.codigo}</option>)}</select></div>
            <div className="input-group"><label>N° OS</label><input className="input" value={form.numero} onChange={e => updateForm('numero', e.target.value)} placeholder="Automático al crear" disabled={modal !== 'crear'} /></div>
            <div className="input-group"><label>Cotización</label><select className="select" value={form.cotizacion_id} onChange={e => updateForm('cotizacion_id', e.target.value)}><option value="">Sin cotización</option>{cotizaciones.filter(c => c.empresa_id === WHYNCO_EMPRESA_ID).map(c => <option key={c.id} value={c.id}>{c.numero}</option>)}</select></div>
            <div className="input-group" style={{ gridColumn: '1/-1' }}><label>Descripción *</label><input className="input" value={form.nombre} onChange={e => updateForm('nombre', e.target.value)} required /></div>
            <div className="input-group" style={{ gridColumn: '1/-1' }}><label>Buscar activo (modo libre)</label><input className="input" value={assetSearch} onChange={e => setAssetSearch(e.target.value)} placeholder="Código, equipo, modelo o fabricante; no se filtra por cliente" />
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginTop: 6, maxHeight: 160, overflow: 'auto' }}>{activosFiltrados.slice(0, 12).map(a => <button type="button" key={a.id} onClick={() => updateForm('activo_id', a.id)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: a.id === form.activo_id ? 'var(--bg-subtle)' : 'transparent', padding: '9px 10px', cursor: 'pointer' }}><strong className="mono">{a.codigo}</strong> · {a.nombre}{a.modelo ? ` · ${a.modelo}` : ''}{a.marca ? ` · ${a.marca}` : ''}</button>)}{assetSearch && !activosFiltrados.length && <div className="text-muted" style={{ padding: 10 }}>No hay coincidencias para esta búsqueda.</div>}</div>
              {activoSeleccionado && <div className="text-muted" style={{ marginTop: 6, fontSize: 12 }}>Seleccionado: <strong>{activoSeleccionado.codigo}</strong> · {activoSeleccionado.nombre}</div>}
              <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => { setCreandoActivo(v => !v); setActivoNuevo(v => ({ ...v, codigo: assetSearch.trim() || v.codigo })); }}>{I.plus} Crear activo nuevo</button>
            </div>
            {creandoActivo && <div className="card" style={{ gridColumn: '1/-1', padding: 14 }}><div style={{ fontWeight: 700, marginBottom: 10 }}>Nuevo activo del cliente seleccionado</div><div className="grid-2" style={{ gap: 10 }}>
              <div className="input-group"><label>Código *</label><input className="input" value={activoNuevo.codigo} onChange={e => updateActivoNuevo('codigo', e.target.value)} /></div><div className="input-group"><label>Equipo *</label><input className="input" value={activoNuevo.nombre} onChange={e => updateActivoNuevo('nombre', e.target.value)} /></div>
              <div className="input-group"><label>Modelo</label><input className="input" value={activoNuevo.modelo} onChange={e => updateActivoNuevo('modelo', e.target.value)} /></div><div className="input-group"><label>Fabricante</label><input className="input" value={activoNuevo.marca} onChange={e => updateActivoNuevo('marca', e.target.value)} /></div>
            </div><div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>Se crea con propietario_tipo='cliente', cliente_propietario_id del cliente elegido y sin activo padre.</div><button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={crearActivoNuevo} disabled={saving}>Crear y seleccionar activo</button></div>}
            <div className="input-group"><label>Estado</label><select className="select" value={form.estado} onChange={e => updateForm('estado', e.target.value)}><option value="en_ejecucion">En ejecución</option><option value="en_pausa">En pausa</option><option value="cerrada">Cerrada</option><option value="anulada">Anulada</option></select></div>
            <div className="input-group"><label>Precio</label><input className="input" type="number" min="0" value={form.monto_aprobado} onChange={e => updateForm('monto_aprobado', e.target.value)} /></div>
            <div className="input-group"><label>Fecha emisión</label><input className="input" type="date" value={form.fecha_emision} onChange={e => updateForm('fecha_emision', e.target.value)} /></div><div className="input-group"><label>Fecha inicio</label><input className="input" type="date" value={form.fecha_inicio} onChange={e => updateForm('fecha_inicio', e.target.value)} /></div>
            <div className="input-group"><label>Fecha fin</label><input className="input" type="date" value={form.fecha_fin} onChange={e => updateForm('fecha_fin', e.target.value)} /></div><div className="input-group"><label>Vendedor</label><input className="input" list="whynco-vendedores" value={form.responsable_comercial} onChange={e => updateForm('responsable_comercial', e.target.value)} /><datalist id="whynco-vendedores">{usuarios.map(u => <option key={u.id} value={u.nombre} />)}</datalist></div>
            <div className="input-group" style={{ gridColumn: '1/-1' }}><label>Observaciones</label><textarea className="input" rows="3" value={form.observaciones} onChange={e => updateForm('observaciones', e.target.value)} /></div>
          </div>
        </div><div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar OS Cliente'}</button></div></form>
      </div></div>}
    </div>
  );
}

export { PanelProduccionWhynco };
