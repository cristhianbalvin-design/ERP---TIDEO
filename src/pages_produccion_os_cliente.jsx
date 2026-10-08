import React, { useEffect, useMemo, useState } from 'react';
import { I, money } from './icons.jsx';
import { useApp } from './context.jsx';
import { getActivosParaOS } from './services/activosService.js';
import { BandejaRecepcionesActivosCliente } from './components/RecepcionesActivosCliente.jsx';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabaseClient.js';
import './panel_produccion.css';

const moneyValue = (value, moneda = 'PEN') => money(Number(value || 0), moneda === 'USD' ? '$' : 'S/');

const ESTADOS_PRODUCCION = ['Evaluación', 'Cotización', 'Stand By', 'Proceso', 'Terminado', 'No Procede', 'Devolución', 'Entregado', 'Negociación'];
const labelEstado = estado => String(estado || '—').replaceAll('_', ' ');
// La etiqueta visible es "Descripción", pero el campo real de os_clientes es nombre.
const descripcionOS = os => String(os?.nombre || '').trim();
const ESTADOS_CERRADOS = ['Terminado', 'Entregado', 'No Procede', 'Devolución'];
const fechaLocal = () => {
  const fecha = new Date();
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
};
const diaCalendario = valor => {
  if (!valor) return null;
  const [anio, mes, dia] = valor.slice(0, 10).split('-').map(Number);
  return Number.isFinite(anio + mes + dia) ? Math.floor(Date.UTC(anio, mes - 1, dia) / 86400000) : null;
};
const fechaCorta = valor => valor ? `${valor.slice(8, 10)}/${valor.slice(5, 7)}` : '';
const claseEstado = estado => ({ 'Evaluación': 'evaluacion', 'Cotización': 'cotizacion', 'Stand By': 'stand-by', 'Proceso': 'proceso', 'Terminado': 'terminado', 'No Procede': 'no-procede', 'Devolución': 'devolucion', 'Entregado': 'entregado', 'Negociación': 'negociacion' })[estado] || 'sin-definir';
const iniciales = nombre => String(nombre || '').trim().split(/\s+/).map(parte => parte[0]).join('').slice(0, 2).toUpperCase() || '—';

const emptyForm = (sociedadId = '') => ({
  cuenta_id: '', activo_id: '', cotizacion_id: '', sociedad_id: sociedadId,
  nombre: '', numero: '', estado: 'en_ejecucion', monto_aprobado: '',
  fecha_emision: new Date().toISOString().slice(0, 10), fecha_inicio: '', fecha_fin: '', fecha_cierre_real: '',
  responsable_comercial: '', observaciones: '',
});

function PanelProduccionOSCliente() {
  const {
    empresa, osClientes, cuentas, cotizaciones, facturas, cxc, usuarios,
    sociedadesDisponibles = [], sociedadActiva,
    actualizarOSCliente, crearOSClienteManual, eliminarOSCliente, addNotificacion, addToast,
  } = useApp();
  const empresaId = empresa?.id || '';
  const [activos, setActivos] = useState([]);
  const [cotizacionesEspeciales, setCotizacionesEspeciales] = useState([]);
  const [loadingActivos, setLoadingActivos] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [vendedorFiltro, setVendedorFiltro] = useState('todos');
  const [soloAtrasadas, setSoloAtrasadas] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [vista, setVista] = useState('lista');
  const [filasAbiertas, setFilasAbiertas] = useState({});
  const [drawerRecepciones, setDrawerRecepciones] = useState(false);
  const [resumenRecepciones, setResumenRecepciones] = useState({ total: 0, pendientes: 0 });
  const botonRecepcionesRef = React.useRef(null);
  const abridorRecepcionesRef = React.useRef(null);
  const [assetSearch, setAssetSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(() => emptyForm(sociedadActiva?.id || sociedadesDisponibles[0]?.id || ''));
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
  useEffect(() => {
    let activa = true;
    if (!empresaId || !isSupabaseConfigured()) {
      setCotizacionesEspeciales([]);
      return () => { activa = false; };
    }
    const cargarCotizacionesEspeciales = async () => {
      try {
        const sb = await getSupabaseClient();
        const { data, error: queryError } = await sb
          .from('cotizaciones_especiales')
          .select('id,numero')
          .eq('empresa_id', empresaId);
        if (queryError) throw queryError;
        if (activa) setCotizacionesEspeciales(data || []);
      } catch {
        if (activa) setCotizacionesEspeciales([]);
      }
    };
    cargarCotizacionesEspeciales();
    return () => { activa = false; };
  }, [empresaId]);

  const rows = useMemo(() => osClientes
    .filter(os => os.empresa_id === empresaId)
    .map(os => {
      const cuenta = cuentas.find(c => c.id === os.cuenta_id);
      const cotizacion = os.cotizacion_id
        ? cotizaciones.find(c => c.id === os.cotizacion_id)
        : cotizacionesEspeciales.find(c => c.id === os.cotizacion_especial_id);
      const activo = activos.find(a => a.id === os.activo_id);
      const facturasOS = facturas.filter(f => f.os_cliente_id === os.id);
      const cxcOS = cxc.filter(item => item.os_cliente_id === os.id);
      return { os, cuenta, cotizacion, activo, facturasOS, cxcOS };
    }), [osClientes, cuentas, cotizaciones, cotizacionesEspeciales, activos, facturas, cxc, empresaId]);

  const vendedores = useMemo(() => [...new Set(rows.map(({ os }) => os.responsable_comercial).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [rows]);
  const baseRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es');
    const hoy = diaCalendario(fechaLocal());
    return rows.map(row => {
      const { os } = row;
      const cerrado = ESTADOS_CERRADOS.includes(os.estado_produccion);
      const finDia = diaCalendario(os.fecha_fin);
      const atrasada = !cerrado && finDia !== null && finDia < hoy;
      const inicioDia = diaCalendario(os.fecha_inicio || os.fecha_emision);
      const avance = finDia === null || inicioDia === null ? null : Math.max(0.04, Math.min(1, (hoy - inicioDia) / Math.max(1, finDia - inicioDia)));
      let plazo;
      if (cerrado) plazo = { texto: os.fecha_cierre_real ? `Cerrada ${fechaCorta(os.fecha_cierre_real)}` : 'Cerrada', tono: 'green', avance: 1 };
      else if (finDia === null) plazo = { texto: 'Sin fecha estimada', tono: 'gray', avance: null };
      else {
        const dias = finDia - hoy;
        plazo = dias < 0 ? { texto: `Atrasada ${Math.abs(dias)} d`, tono: 'red', avance: 1 }
          : dias === 0 ? { texto: 'Vence hoy', tono: 'amber', avance }
            : dias <= 7 ? { texto: `Faltan ${dias} d`, tono: 'amber', avance }
              : { texto: `En plazo · ${dias} d`, tono: 'green', avance };
      }
      const vendedor = os.responsable_comercial || '';
      const texto = [os.numero, row.cotizacion?.numero, row.cuenta?.razon_social, row.cuenta?.nombre_comercial, row.activo?.codigo, row.activo?.nombre, row.activo?.modelo, row.activo?.marca, os.estado, os.estado_produccion, vendedor, os.nombre, os.observaciones].filter(Boolean).join(' ').toLocaleLowerCase('es');
      return { ...row, cerrado, atrasada, plazo, texto };
    }).filter(row => (!query || row.texto.includes(query))
      && (vendedorFiltro === 'todos' || (vendedorFiltro === '__sin_asignar__' ? !row.os.responsable_comercial : row.os.responsable_comercial === vendedorFiltro))
      && (!soloAtrasadas || row.atrasada));
  }, [rows, search, vendedorFiltro, soloAtrasadas]);
  const conteosEstado = useMemo(() => {
    const conteos = { todos: baseRows.length, sin: baseRows.filter(({ os }) => !os.estado_produccion).length };
    ESTADOS_PRODUCCION.forEach(estado => { conteos[estado] = baseRows.filter(({ os }) => os.estado_produccion === estado).length; });
    return conteos;
  }, [baseRows]);
  const visibleRows = useMemo(() => baseRows.filter(({ os }) => filtroEstado === 'todos' || (filtroEstado === 'sin' ? !os.estado_produccion : os.estado_produccion === filtroEstado)), [baseRows, filtroEstado]);
  const filasVista = vista === 'lista' ? visibleRows : baseRows;
  const kpis = useMemo(() => ({
    total: rows.length,
    enProceso: rows.filter(({ os }) => os.estado_produccion === 'Proceso').length,
    facturado: rows.reduce((total, { os }) => total + Number(os.monto_facturado || 0), 0),
    pendienteCobro: rows.reduce((total, { os }) => total + Math.max(0, Number(os.monto_facturado || 0) - Number(os.monto_cobrado || 0)), 0),
    atrasadas: rows.filter(({ os }) => !ESTADOS_CERRADOS.includes(os.estado_produccion) && diaCalendario(os.fecha_fin) !== null && diaCalendario(os.fecha_fin) < diaCalendario(fechaLocal())).length,
    cerradas: rows.filter(({ os }) => ESTADOS_CERRADOS.includes(os.estado_produccion)).length,
  }), [rows]);
  const montoTotal = useMemo(() => rows.reduce((total, { os }) => total + Number(os.monto_aprobado || 0), 0), [rows]);
  const porcentajeFacturado = montoTotal ? Math.round(kpis.facturado / montoTotal * 100) : 0;
  const activosFiltrados = activos.filter(a => [a.codigo, a.nombre, a.modelo, a.marca].filter(Boolean).join(' ').toLowerCase().includes(assetSearch.trim().toLowerCase()));
  const activoSeleccionado = activos.find(a => a.id === form.activo_id) || null;
  const cotizacionSeleccionada = cotizaciones.find(c => c.id === form.cotizacion_id) || null;
  const tieneCotizacionVinculada = Boolean(form.cotizacion_id);
  const montoCotizacion = cotizacionSeleccionada?.total ?? form.monto_aprobado;
  const monedaCotizacion = cotizacionSeleccionada?.moneda || empresa?.moneda || 'PEN';
  const updateForm = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const actualizarCotizacionForm = cotizacionId => {
    const cotizacion = cotizaciones.find(c => c.id === cotizacionId);
    setForm(current => ({
      ...current,
      cotizacion_id: cotizacionId,
      monto_aprobado: cotizacion ? String(cotizacion.total ?? 0) : current.monto_aprobado,
    }));
  };
  const cerrarModalOS = () => { setModal(null); setError(''); };
  const abrirDrawerRecepciones = (origen = document.activeElement) => {
    abridorRecepcionesRef.current = origen;
    setDrawerRecepciones(true);
  };
  const cerrarDrawerRecepciones = () => {
    setDrawerRecepciones(false);
    (abridorRecepcionesRef.current || botonRecepcionesRef.current)?.focus();
  };
  const abrirCrear = () => {
    setForm(emptyForm(sociedadPorDefecto)); setAssetSearch(''); setError(''); setModal('crear');
  };
  const abrirEditar = (os) => {
    setForm({ cuenta_id: os.cuenta_id || '', activo_id: os.activo_id || '', cotizacion_id: os.cotizacion_id || '', sociedad_id: os.sociedad_id || sociedadPorDefecto, nombre: os.nombre || '', numero: os.numero || '', estado: os.estado || 'en_ejecucion', monto_aprobado: os.monto_aprobado ?? '', fecha_emision: os.fecha_emision || '', fecha_inicio: os.fecha_inicio || '', fecha_fin: os.fecha_fin || '', fecha_cierre_real: os.fecha_cierre_real || '', responsable_comercial: os.responsable_comercial || '', observaciones: os.observaciones || '' });
    setAssetSearch(''); setError(''); setModal(os);
  };
  const guardarOS = async event => {
    event.preventDefault();
    if (!form.cuenta_id || !form.nombre.trim()) return setError('Cliente y descripción son obligatorios.');
    if (!form.activo_id) return setError('Selecciona o crea un activo para esta OS Cliente.');
    setSaving(true);
    const responsable = (usuarios || []).find(user => user.nombre === form.responsable_comercial);
    const payload = { cuenta_id: form.cuenta_id, activo_id: form.activo_id, cotizacion_id: form.cotizacion_id || null, sociedad_id: form.sociedad_id || null, nombre: form.nombre.trim(), estado: form.estado, monto_aprobado: Number(montoCotizacion || 0), fecha_emision: form.fecha_emision || null, fecha_inicio: form.fecha_inicio || null, fecha_fin: form.fecha_fin || null, fecha_cierre_real: form.fecha_cierre_real || null, responsable_comercial: form.responsable_comercial.trim() || responsable?.nombre || null, observaciones: form.observaciones.trim() || null };
    if (cotizacionSeleccionada) payload.moneda = monedaCotizacion;
    try {
      if (modal === 'crear') await crearOSClienteManual(payload, { navegarAlDetalle: false });
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

  return <div className="dx-prod">
    <header className="dx-prod-top"><div><div className="dx-prod-eyebrow">Seguimiento de producción</div><h1 className="dx-prod-title">Panel de Producción</h1><p className="dx-prod-sub">Seguimiento por OS Cliente · {rows.length} OS registradas</p></div><div className="dx-prod-top-actions"><button ref={botonRecepcionesRef} type="button" className="dx-prod-btn" onClick={event => abrirDrawerRecepciones(event.currentTarget)}>Recepciones <span className="dx-prod-btn-count">{resumenRecepciones.total}</span></button><button type="button" className="dx-prod-btn dx-prod-primary" onClick={abrirCrear}>{I.plus} Nueva OS Cliente</button></div></header>
    <section className="dx-prod-kpis" aria-label="Resumen de órdenes de servicio">
      <article className="dx-prod-kpi"><div className="dx-prod-kpi-top">Total OS <span className="dx-prod-kpi-ico is-cyan">{I.clipboard}</span></div><strong className="dx-prod-kpi-value">{kpis.total}</strong><span className="dx-prod-kpi-note">{kpis.cerradas} cerradas · {kpis.total - kpis.cerradas} abiertas</span></article>
      <article className="dx-prod-kpi"><div className="dx-prod-kpi-top">En producción <span className="dx-prod-kpi-ico is-violet">{I.wrench}</span></div><strong className="dx-prod-kpi-value">{kpis.enProceso}</strong><span className="dx-prod-kpi-note">Estado Proceso</span></article>
      <button type="button" className={`dx-prod-kpi dx-prod-alert-kpi${soloAtrasadas ? ' is-on' : ''}`} aria-pressed={soloAtrasadas} onClick={() => setSoloAtrasadas(value => !value)}><div className="dx-prod-kpi-top">Atrasadas <span className="dx-prod-kpi-ico is-red">{I.alert}</span></div><strong className="dx-prod-kpi-value">{kpis.atrasadas}</strong><span className="dx-prod-kpi-note">Pulsa para filtrar</span></button>
      <article className="dx-prod-kpi"><div className="dx-prod-kpi-top">Facturado <span className="dx-prod-kpi-ico is-green">{I.receipt}</span></div><strong className="dx-prod-kpi-value dx-prod-kpi-money">{moneyValue(kpis.facturado, empresa?.moneda)}</strong><span className="dx-prod-kpi-note">{porcentajeFacturado}% del monto de las OS</span></article>
      <article className="dx-prod-kpi"><div className="dx-prod-kpi-top">Pendiente de cobro <span className="dx-prod-kpi-ico is-amber">{I.dollar}</span></div><strong className="dx-prod-kpi-value dx-prod-kpi-money">{moneyValue(kpis.pendienteCobro, empresa?.moneda)}</strong><span className="dx-prod-kpi-note">Facturado menos cobrado</span></article>
    </section>
    <BandejaRecepcionesActivosCliente drawerAbierto={drawerRecepciones} onAbrirDrawer={abrirDrawerRecepciones} onCerrarDrawer={cerrarDrawerRecepciones} onResumen={setResumenRecepciones} />
    {error && !modal && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}
    <section className="dx-prod-card">
      <div className="dx-prod-bar"><div className="dx-prod-bar-title"><h2>Órdenes de servicio</h2><span className="dx-prod-count">{filasVista.length} {filasVista.length === 1 ? 'resultado' : 'resultados'}</span></div><label className="dx-prod-search"><span className="dx-prod-sr-only">Buscar órdenes</span><span aria-hidden="true">{I.search}</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar OS, cliente, cotización o activo" /></label><select className="dx-prod-select" aria-label="Filtrar por vendedor" value={vendedorFiltro} onChange={e => setVendedorFiltro(e.target.value)}><option value="todos">Todos los vendedores</option><option value="__sin_asignar__">Sin asignar</option>{vendedores.map(vendedor => <option key={vendedor} value={vendedor}>{vendedor}</option>)}</select><button type="button" className={`dx-prod-toggle${soloAtrasadas ? ' is-on' : ''}`} aria-pressed={soloAtrasadas} onClick={() => setSoloAtrasadas(value => !value)}>Solo atrasadas</button><div className="dx-prod-segment" aria-label="Vista de órdenes"><button type="button" className={vista === 'lista' ? 'is-on' : ''} aria-pressed={vista === 'lista'} onClick={() => setVista('lista')}>Lista</button><button type="button" className={vista === 'tablero' ? 'is-on' : ''} aria-pressed={vista === 'tablero'} onClick={() => setVista('tablero')}>Tablero</button></div><span className="dx-prod-subcount">{loadingActivos ? 'Cargando activos…' : `${activos.length} activos disponibles`}</span></div>
      {vista === 'lista' && <nav className="dx-prod-flow" aria-label="Filtrar por estado de producción">{[['todos', 'Todas'], ['sin', 'Sin definir'], ...ESTADOS_PRODUCCION.map(estado => [estado, estado])].map(([valor, texto]) => <button type="button" key={valor} className={`dx-prod-chip dx-prod-state-${claseEstado(valor === 'sin' || valor === 'todos' ? '' : valor)}${filtroEstado === valor ? ' is-on' : ''}${conteosEstado[valor] === 0 && valor !== 'todos' ? ' is-zero' : ''}`} aria-pressed={filtroEstado === valor} onClick={() => setFiltroEstado(valor)}><i />{texto}<b>{conteosEstado[valor]}</b></button>)}</nav>}
      {vista === 'lista' ? <div className="dx-prod-list"><div className="dx-prod-cols dx-prod-head"><span>OS</span><span>Cliente y equipo</span><span>Estado de producción</span><span>Plazo</span><span>Cobranza</span><span>Acciones</span></div>
        {visibleRows.map(({ os, cuenta, cotizacion, activo, facturasOS, cxcOS, cerrado, atrasada, plazo }) => {
          const abierta = Boolean(filasAbiertas[os.id]);
          const monto = Number(os.cotizacion_id ? (cotizacion?.total ?? os.monto_aprobado) : os.monto_aprobado || 0);
          const facturado = Number(os.monto_facturado || 0);
          const cobrado = Number(os.monto_cobrado || 0);
          const porcentajeFact = monto ? Math.min(100, facturado / monto * 100) : 0;
          const porcentajeCob = monto ? Math.min(100, cobrado / monto * 100) : 0;
          return <article key={os.id} className={`dx-prod-row${abierta ? ' is-open' : ''}${atrasada ? ' is-late' : ''}`}>
            <div className="dx-prod-cols dx-prod-main">
              <div className="dx-prod-os-cell"><button type="button" className="dx-prod-osbtn" aria-expanded={abierta} aria-label={`${abierta ? 'Ocultar' : 'Mostrar'} detalle de ${os.numero || 'OS'}`} onClick={() => setFilasAbiertas(current => ({ ...current, [os.id]: !current[os.id] }))}><span className="dx-prod-chevron">{I.chevRight}</span><span><strong>{os.numero || '—'}</strong><small>{cotizacion?.numero || 'Sin cotización'}</small></span></button></div>
              <div className="dx-prod-client"><strong>{cuenta?.razon_social || cuenta?.nombre_comercial || '—'}</strong><div className="dx-prod-equipo"><code>{activo?.codigo || '—'}</code><span>{activo?.nombre || 'Activo no disponible'}</span></div><div className="dx-prod-seller"><span className="dx-prod-avatar">{iniciales(os.responsable_comercial)}</span>{os.responsable_comercial || 'Sin asignar'}</div></div>
              <div className="dx-prod-state-cell"><span className={`dx-prod-select-pill dx-prod-state-${claseEstado(os.estado_produccion)}`}><i /><select aria-label={`Estado de producción de ${os.numero || 'OS'}`} value={os.estado_produccion || ''} onChange={e => actualizarInline(os, 'estado_produccion', e.target.value || null)}><option value="">Sin definir</option>{ESTADOS_PRODUCCION.map(estado => <option key={estado} value={estado}>{estado}</option>)}</select><span className="dx-prod-select-arrow">{I.chev}</span></span></div>
              <div className="dx-prod-time"><span className={`dx-prod-pill is-${plazo.tono}`}><i />{plazo.texto}</span>{plazo.avance !== null && <div className={`dx-prod-track${atrasada ? ' is-red' : cerrado ? ' is-green' : ''}`}><i style={{ width: `${Math.round(plazo.avance * 100)}%` }} /></div>}<small>{os.fecha_emision ? `Emitida ${fechaCorta(os.fecha_emision)}` : 'Sin fecha de emisión'}{os.fecha_fin ? ` · Cierre est. ${fechaCorta(os.fecha_fin)}` : ''}</small></div>
              <div className="dx-prod-money"><strong>{moneyValue(monto, cotizacion?.moneda || os.moneda || empresa?.moneda)}</strong><div className="dx-prod-track dx-prod-cash-track"><i className="is-invoiced" style={{ width: `${porcentajeFact}%` }} /><i className="is-paid" style={{ width: `${porcentajeCob}%` }} /></div><small>Fact. {moneyValue(facturado, os.moneda || empresa?.moneda)} · Cobr. {moneyValue(cobrado, os.moneda || empresa?.moneda)}</small>{facturado > cobrado && <small className="dx-prod-pending">Por cobrar {moneyValue(facturado - cobrado, os.moneda || empresa?.moneda)}</small>}</div>
              <div className="dx-prod-actions"><button type="button" className="dx-prod-icon-btn" aria-label={`Editar OS ${os.numero || ''}`} title="Editar OS Cliente" onClick={() => abrirEditar(os)}>{I.edit}</button><button type="button" className="dx-prod-icon-btn is-danger" aria-label={`Eliminar OS ${os.numero || ''}`} title="Eliminar OS Cliente" onClick={() => eliminarFila({ os, facturasOS, cxcOS })}>{I.trash}</button></div>
            </div>
            {abierta && <div className="dx-prod-detail"><div className="dx-prod-detail-wide"><span>Descripción</span><p>{descripcionOS(os) || 'Sin descripción en esta OS Cliente'}</p></div><div className="dx-prod-detail-wide"><span>Observaciones</span><p>{os.observaciones || 'Sin observaciones en esta OS Cliente'}</p></div><div><span>Equipo</span><p>{[activo?.nombre, activo?.modelo, activo?.marca].filter(Boolean).join(' · ') || '—'}</p></div><div><span>Documentos</span><p>{facturasOS.length} factura(s) · {cxcOS.length} CxC vinculada(s)</p></div><div><span>Estado de la OS</span><p><span className="dx-prod-pill is-gray">{labelEstado(os.estado)}</span></p></div><label>Emisión<input type="date" defaultValue={os.fecha_emision || ''} onBlur={e => actualizarInline(os, 'fecha_emision', e.target.value || null)} /></label><label>Inicio<input type="date" defaultValue={os.fecha_inicio || ''} onBlur={e => actualizarInline(os, 'fecha_inicio', e.target.value || null)} /></label><label>Fecha estimada de cierre<input type="date" defaultValue={os.fecha_fin || ''} onBlur={e => actualizarInline(os, 'fecha_fin', e.target.value || null)} /></label><label>Fecha real de cierre<input type="date" defaultValue={os.fecha_cierre_real || ''} onBlur={e => actualizarInline(os, 'fecha_cierre_real', e.target.value || null)} /></label><label>Vendedor<input type="text" defaultValue={os.responsable_comercial || ''} onBlur={e => actualizarInline(os, 'responsable_comercial', e.target.value || null)} placeholder="Sin asignar" /></label><label>Precio{os.cotizacion_id ? <span className="dx-prod-fixed-value">{moneyValue(cotizacion?.total ?? os.monto_aprobado, cotizacion?.moneda || os.moneda || empresa?.moneda)}</span> : <input type="number" min="0" defaultValue={os.monto_aprobado ?? 0} onBlur={e => actualizarInline(os, 'monto_aprobado', Number(e.target.value || 0))} />}</label></div>}
          </article>;
        })}
        {!visibleRows.length && <div className="dx-prod-empty"><strong>No hay OS que coincidan</strong><span>Prueba con otro texto o quita los filtros.</span><button type="button" className="dx-prod-btn dx-prod-btn-sm" onClick={() => { setSearch(''); setVendedorFiltro('todos'); setSoloAtrasadas(false); setFiltroEstado('todos'); }}>Quitar filtros</button></div>}
      </div> : <div className="dx-prod-board">{[['sin', 'Sin definir'], ...ESTADOS_PRODUCCION.map(estado => [estado, estado])].map(([estado, label]) => {
         const items = baseRows.filter(({ os }) => estado === 'sin' ? !os.estado_produccion : os.estado_produccion === estado);
         return <section className={`dx-prod-board-col dx-prod-state-${claseEstado(estado === 'sin' ? '' : estado)}`} key={estado}><h3><i />{label}<b>{items.length}</b></h3><div className="dx-prod-board-items">{items.map(({ os, cuenta, cotizacion, activo, plazo }) => <article className="dx-prod-board-card" key={os.id}><div className="dx-prod-board-card-top"><strong>{os.numero || '—'}</strong><span className={`dx-prod-pill is-${plazo.tono}`}><i />{plazo.texto}</span></div><strong className="dx-prod-board-client">{cuenta?.razon_social || cuenta?.nombre_comercial || '—'}</strong><span className="dx-prod-board-equipo">{activo?.codigo || '—'} · {activo?.nombre || 'Activo no disponible'}</span><div className="dx-prod-board-foot"><span><i className="dx-prod-avatar">{iniciales(os.responsable_comercial)}</i>{os.responsable_comercial || 'Sin asignar'}</span><b>{moneyValue(os.cotizacion_id ? (cotizacion?.total ?? os.monto_aprobado) : os.monto_aprobado, cotizacion?.moneda || os.moneda || empresa?.moneda)}</b></div></article>)}{!items.length && <p className="dx-prod-none">Sin OS en este estado</p>}</div></section>;
      })}</div>}
    </section>
    {modal && <div className="modal-backdrop"><div className="modal" style={{ maxWidth: 860, width: 'calc(100vw - 32px)', maxHeight: '92vh', overflow: 'auto' }}><div className="modal-head"><div><h2>{modal === 'crear' ? 'Nueva OS Cliente' : 'Editar OS Cliente'}</h2><div className="text-muted" style={{ fontSize: 12 }}>El activo se busca libremente entre todos los activos de la empresa activa.</div></div><button className="icon-btn" onClick={cerrarModalOS}>{I.x}</button></div><form onSubmit={guardarOS}><div className="modal-body">{error && <div className="alert alert-danger" style={{ marginBottom: 14 }}>{error}</div>}<div className="grid-2" style={{ gap: 14 }}>
      <div className="input-group"><label>Cliente *</label><select className="select" value={form.cuenta_id} onChange={e => updateForm('cuenta_id', e.target.value)} required><option value="">Seleccionar</option>{cuentas.filter(c => c.empresa_id === empresaId).map(c => <option key={c.id} value={c.id}>{c.razon_social || c.nombre_comercial}</option>)}</select></div><div className="input-group"><label>Sociedad *</label><select className="select" value={form.sociedad_id} onChange={e => updateForm('sociedad_id', e.target.value)} required><option value="">Seleccionar</option>{sociedadesDisponibles.filter(s => s.activa !== false).map(s => <option key={s.id} value={s.id}>{s.razon_social || s.nombre || s.codigo}</option>)}</select></div><div className="input-group"><label>N° OS</label><input className="input" value={form.numero} placeholder={modal === 'crear' ? 'Se asigna al guardar' : ''} readOnly /></div><div className="input-group"><label>Cotización</label><select className="select" value={form.cotizacion_id} onChange={e => actualizarCotizacionForm(e.target.value)}><option value="">Sin cotización</option>{cotizaciones.filter(c => c.empresa_id === empresaId && c.estado === 'aprobada' && !c.os_cliente_id).map(c => <option key={c.id} value={c.id}>{c.numero}</option>)}</select></div><div className="input-group" style={{ gridColumn: '1/-1' }}><label>Descripción *</label><input className="input" value={form.nombre} onChange={e => updateForm('nombre', e.target.value)} required /></div>
      <div className="input-group" style={{ gridColumn: '1/-1' }}><label>Buscar activo (modo libre)</label><input className="input" value={assetSearch} onChange={e => setAssetSearch(e.target.value)} placeholder="Código, equipo, modelo o fabricante; no se filtra por cliente" /><div style={{ border: '1px solid var(--border)', borderRadius: 8, marginTop: 6, maxHeight: 160, overflow: 'auto' }}>{activosFiltrados.slice(0, 12).map(a => <button type="button" key={a.id} onClick={() => updateForm('activo_id', a.id)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: a.id === form.activo_id ? 'var(--bg-subtle)' : 'transparent', padding: '9px 10px', cursor: 'pointer' }}><strong className="mono">{a.codigo}</strong> · {a.nombre}{a.modelo ? ` · ${a.modelo}` : ''}{a.marca ? ` · ${a.marca}` : ''}</button>)}{assetSearch && !activosFiltrados.length && <div className="text-muted" style={{ padding: 10 }}>No se encontró un activo para esta búsqueda. Regístralo desde Recepción de Activos.{form.cuenta_id && <button type="button" className="btn btn-secondary btn-sm" style={{ display: 'block', marginTop: 8 }} onClick={() => window.location.assign('/operaciones/#/recepcion-activos')}>Ir a Recepción de Activos</button>}</div>}</div>{activoSeleccionado && <div className="text-muted" style={{ marginTop: 6, fontSize: 12 }}>Seleccionado: <strong>{activoSeleccionado.codigo}</strong> · {activoSeleccionado.nombre}</div>}</div>
      <div className="input-group"><label>Estado</label><select className="select" value={form.estado} onChange={e => updateForm('estado', e.target.value)}><option value="en_ejecucion">En ejecución</option><option value="en_pausa">En pausa</option><option value="cerrada">Cerrada</option><option value="anulada">Anulada</option></select></div><div className="input-group"><label>Precio</label>{tieneCotizacionVinculada ? <input className="input" style={{ minWidth: 180 }} value={`${moneyValue(montoCotizacion, monedaCotizacion)} · ${monedaCotizacion}`} readOnly aria-label="Precio de la cotización vinculada" /> : <input className="input" type="number" min="0" value={form.monto_aprobado} onChange={e => updateForm('monto_aprobado', e.target.value)} />}</div><div className="input-group"><label>Fecha emisión</label><input className="input" type="date" value={form.fecha_emision} onChange={e => updateForm('fecha_emision', e.target.value)} /></div><div className="input-group"><label>Fecha inicio</label><input className="input" type="date" value={form.fecha_inicio} onChange={e => updateForm('fecha_inicio', e.target.value)} /></div><div className="input-group"><label>Fecha fin</label><input className="input" type="date" value={form.fecha_fin} onChange={e => updateForm('fecha_fin', e.target.value)} /></div><div className="input-group"><label>Vendedor</label><input className="input" list="produccion-vendedores" value={form.responsable_comercial} onChange={e => updateForm('responsable_comercial', e.target.value)} /><datalist id="produccion-vendedores">{usuarios.map(u => <option key={u.id} value={u.nombre} />)}</datalist></div><div className="input-group" style={{ gridColumn: '1/-1' }}><label>Observaciones</label><textarea className="input" rows="3" value={form.observaciones} onChange={e => updateForm('observaciones', e.target.value)} /></div>
    </div></div><div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={cerrarModalOS}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar OS Cliente'}</button></div></form></div></div>}
  </div>;
}

export { PanelProduccionOSCliente };
