import { useEffect, useMemo, useState } from 'react';
import { useApp } from './context.jsx';
import { puedeVerPantalla } from './access/roleAccess.js';
import { normalizarMonedaBI, crearCSVBI } from './biComercialMetrics.js';
import { asignarSociedadMovimientos } from './biFinancieroMetrics.js';
import { PERFIL_SOCIEDAD, SOCIEDAD_TODAS_ID } from './services/sociedadesService.js';
import { getEstadoResultados, getEstadoResultadosPorScope } from './services/estadoResultadosService.js';
import { isSupabaseMode } from './lib/dataMode.js';
import { maestrosService } from './services/maestrosService.js';
import { cargarFuentesDashboard } from './services/dashboardGeneralService.js';
import { claveEquivalenciaMovimientoCuenta, monedasDifierenMovimientoCuenta } from './services/tesoreriaService.js';
import { getTipoCambioPorFecha, convertirMonto as convertirMontoConTc } from './services/tipoCambioService.js';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabaseClient.js';
import { alcanceSociedades, filtrarSociedades, calcularDashboard, contarDashboard, temasAtencion, nombreCliente, cantidadTexto } from './dashboardGeneralMetrics.js';
import './dashboard_general.css';
const fuentesVacias = { cobros: { data: [], error: '' }, tickets: { data: [], error: '' }, recepciones: { data: [], error: '' } };
const fechaLocal = () => {
  const fecha = new Date();
  return [fecha.getFullYear(), String(fecha.getMonth() + 1).padStart(2, '0'), String(fecha.getDate()).padStart(2, '0')].join('-');
};
const dinero = (valor, moneda) => valor == null ? 'Sin dato' : `${moneda === 'USD' ? 'US$' : 'S/'} ${Number(valor).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sumar = filas => filas.reduce((total, fila) => total + (Number(fila.saldo) || 0), 0);
const porcentaje = (parte, total) => total ? `${Math.round(parte / total * 100)}% vencido` : 'Sin saldo';
const nombreMes = periodo => ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'][Number(periodo.slice(5, 7)) - 1];
function Tarjeta({ titulo, nota, children, atencion = false }) {
  return <section className={`dx-ui-card ${atencion ? 'dx-dash-atencion' : ''}`}>
  <div className="dx-ui-toolbar">
   <h2>{titulo}</h2>
   <span className="dx-ui-count">{nota}</span>
  </div>{children}</section>;
}
function Indicador({ titulo, valor, subtitulo, items, negativo }) {
  return (<div className="kpi-card bi-kpi-card bic-kpi">
   <div className="kpi-label">{titulo}
    <span className="bic-tooltip-trigger" tabIndex="0" aria-label={`Detalle: ${titulo}`}>ⓘ
     <div className="bi-kpi-tooltip" role="tooltip">
      <div className="bi-tooltip-title">{titulo}</div>
      <div className="bi-tooltip-separator"/>
      <div className="bi-tooltip-items">{items.map((item, indice) => <div className="bi-tooltip-row" key={indice}>
       <span>{item.label}</span>
       <strong>{item.value}</strong>
      </div>)}</div>
      <div className="bi-tooltip-separator"/>
      <div className="bi-tooltip-row bi-tooltip-result">
       <span>Total</span>
       <strong>{valor}</strong>
      </div>
     </div>
    </span>
   </div>
   <div className={`kpi-value ${negativo ? 'is-neg' : ''}`}>{valor}</div>
   <div className="kpi-sub">{subtitulo}</div>
  </div>);
}
function Fila({ titulo, detalle, valor, onClick, alerta = false }) {
  return <button type="button" className="dx-dash-row is-plain" onClick={onClick}>
  <span>
   <b>{titulo}</b>
   <small>{detalle}</small>
  </span>
  <span className={alerta ? 'dx-ui-pill is-red' : 'dx-dash-amt'}>{alerta && <i />}{valor}</span>
  <span className="dx-dash-go" aria-hidden="true">›</span>
 </button>;
}
function BarrasHorizontales({ filas }) {
  const maximo = Math.max(1, ...filas.map(fila => fila.numero));
  return <div className="dx-dash-list">{filas.map(fila => <div className="dx-dash-hbar" key={fila.label}>
  <span>{fila.label}</span>
  <div className="dx-dash-hline">
   <i style={{ width: `${Math.max(0, fila.numero) / maximo * 100}%` }}/>
  </div>
  <b>{fila.valor}</b>
 </div>)}</div>;
}
export function Dashboard({ role }) {
  const app = useApp();
  const { empresa, navigate, sociedadActiva, perfilSociedad, sociedadesDisponibles = [] } = app;
  const canFin = Boolean(role?.permisos?.ver_finanzas || role?.permisos?.todo);
  const hoy = fechaLocal();
  const periodo = hoy.slice(0, 7);
  const base = normalizarMonedaBI(empresa?.moneda || empresa?.moneda_base || 'PEN');
  const [moneda, setMoneda] = useState(base);
  const [fuentes, setFuentes] = useState(fuentesVacias);
  const [cargando, setCargando] = useState(false);
  const [equivalencias, setEquivalencias] = useState({ solicitud: null, valores: {}, error: '' });
  const [er, setEr] = useState({ loading: false, data: null, error: '' });
  const [cebe, setCebe] = useState(false);
  const [mas, setMas] = useState(false);
  const [mes, setMes] = useState(5);
  const multi = Boolean(empresa?.multisociedad_habilitado && perfilSociedad !== PERFIL_SOCIEDAD.SIN_MULTISOCIEDAD);
  const alcance = useMemo(() => alcanceSociedades(multi, sociedadActiva?.id, sociedadesDisponibles, SOCIEDAD_TODAS_ID), [multi, sociedadActiva?.id, sociedadesDisponibles]);
  const idsScope = alcance.sociedadIds?.join('|') || '';
  useEffect(() => setMoneda(base), [base, empresa?.id]);
  useEffect(() => {
    let vivo = true;
    if (!empresa?.id)
      return undefined;
    setCargando(true);
    setFuentes(fuentesVacias);
    cargarFuentesDashboard(empresa.id).then(resultado => { if (vivo)
      setFuentes(resultado); }).finally(() => { if (vivo)
      setCargando(false); });
    maestrosService.getCentrosBeneficio(empresa.id).then(resultado => { if (vivo)
      setCebe(!(resultado || []).some(item => item.estado === 'activo')); }).catch(() => { if (vivo)
      setCebe(false); });
    return () => { vivo = false; };
  }, [empresa?.id]);
  useEffect(() => {
    let vivo = true;
    if (!canFin || !empresa?.id) {
      setEr({ loading: false, data: null, error: '' });
      return undefined;
    }
    if (!isSupabaseMode()) {
      setEr({ loading: false, data: null, error: 'Estado de Resultados disponible en modo Supabase.' });
      return undefined;
    }
    if (multi && !idsScope) {
      setEr({ loading: false, data: null, error: 'Sin sociedad disponible.' });
      return undefined;
    }
    setEr({ loading: true, data: null, error: '' });
    const argumentos = { empresaId: empresa.id, periodo, cecoIds: [], cebeIds: [] };
    const solicitud = multi ? getEstadoResultadosPorScope({ ...argumentos, mode: alcance.mode, sociedadIds: alcance.sociedadIds }) : getEstadoResultados(argumentos);
    solicitud.then(data => { if (vivo)
      setEr({ loading: false, data, error: '' }); }).catch(error => { if (vivo)
      setEr({ loading: false, data: null, error: error?.message || 'No se pudo cargar el Estado de Resultados.' }); });
    return () => { vivo = false; };
  }, [canFin, empresa?.id, periodo, multi, idsScope, alcance.mode]);
  const datos = useMemo(() => {
    const scope = filas => filtrarSociedades(isSupabaseMode() ? filas || [] : [], alcance);
    const cxc = scope(app.cxc);
    const movimientos = asignarSociedadMovimientos({ movimientos: app.movimientosTesoreria || [], cuentasBancarias: app.cuentasBancarias || [], cxc: app.cxc || [], cxp: app.cxp || [], facturas: app.facturas || [] });
    const ids = new Set(cxc.map(fila => fila.id));
    const claves = ['ots', 'cotizaciones', 'osClientes', 'valorizaciones', 'ordenesCompra', 'partes', 'solicitudesRRHH', 'facturas'];
    const filtrados = Object.fromEntries(claves.map(clave => [clave, scope(app[clave])]));
    return { ...filtrados, cxc, cxp: scope(app.cxp), cuentasBancarias: scope(app.cuentasBancarias), movimientosTesoreria: scope(movimientos), oportunidades: app.oportunidades || [], solpes: app.solpes || [], cuentas: app.cuentas || [], cobros: fuentes.cobros.data.filter(fila => ids.has(fila.cxc_id)), tickets: fuentes.tickets.data, recepciones: scope(fuentes.recepciones.data) };
  }, [app.cxc, app.cxp, app.cuentasBancarias, app.movimientosTesoreria, app.facturas, app.ots, app.oportunidades, app.cotizaciones, app.osClientes, app.valorizaciones, app.ordenesCompra, app.solpes, app.partes, app.solicitudesRRHH, app.cuentas, fuentes, alcance]);
  const solicitudEquivalencias = useMemo(() => {
    const cuentas = datos.cuentasBancarias.filter(c => c.estado === 'activo');
    return datos.movimientosTesoreria.map(mov => {
      const cuenta = cuentas.find(c => c.id === mov?.cuenta_bancaria_id);
      return cuenta ? { mov, cuenta, key: claveEquivalenciaMovimientoCuenta(mov, cuenta) } : null;
    }).filter(item => item && monedasDifierenMovimientoCuenta(item.mov, item.cuenta) &&
      (item.mov.monto_en_moneda_cuenta == null || item.mov.monto_en_moneda_cuenta === ''));
  }, [datos.cuentasBancarias, datos.movimientosTesoreria]);
  useEffect(() => {
    let activo = true;
    if (!canFin || !solicitudEquivalencias.length) return () => { activo = false; };
    const cargar = async () => {
      const supabase = isSupabaseConfigured() ? await getSupabaseClient() : null;
      const valores = {};
      for (const { mov, cuenta, key } of solicitudEquivalencias) {
        const fecha = mov.fecha || mov.fecha_movimiento || mov.fecha_operacion || mov.created_at || mov.creado_en || '';
        const origen = String(mov.moneda || 'PEN').trim().toUpperCase();
        const destino = cuenta.moneda;
        const tc = await getTipoCambioPorFecha(fecha, supabase);
        const par = [origen, String(destino || 'PEN').trim().toUpperCase()];
        const tasa = par.includes('PEN') && par.includes('USD') ? tc?.usd : par.includes('PEN') && par.includes('EUR') ? tc?.eur : 1;
        if (!tc || !Number.isFinite(Number(tasa)) || Number(tasa) <= 0) throw new Error('Tipo de cambio no disponible');
        valores[key] = convertirMontoConTc(mov.monto, origen, destino, tc);
      }
      if (activo) setEquivalencias({ solicitud: solicitudEquivalencias, valores, error: '' });
    };
    cargar().catch(error => { if (activo) setEquivalencias({ solicitud: solicitudEquivalencias, valores: {}, error: error?.message || 'Tipo de cambio no disponible' }); });
    return () => { activo = false; };
  }, [canFin, solicitudEquivalencias]);
  const cajaCargando = canFin && (app.supabaseStatus?.loading || (solicitudEquivalencias.length > 0 && equivalencias.solicitud !== solicitudEquivalencias));
  const cajaError = !cajaCargando && solicitudEquivalencias.length > 0 && equivalencias.solicitud === solicitudEquivalencias && equivalencias.error;
  const metricas = useMemo(() => canFin ? calcularDashboard({ ...datos, equivalenciasCuenta: equivalencias.solicitud === solicitudEquivalencias ? equivalencias.valores : {} }, moneda, hoy) : contarDashboard(datos, moneda, hoy), [datos, moneda, hoy, canFin, equivalencias, solicitudEquivalencias]);
  if (!isSupabaseMode())
    return <section className="dx-ui dx-dash">
  <div className="dx-dash-wrap">
   <h1>Dashboard General</h1>
   <p className="dx-dash-error">Se necesita la conexión de datos reales para mostrar el tablero.</p>
  </div>
 </section>;
  const puedeVer = modulo => puedeVerPantalla(role, modulo, modulo === 'panel_produccion' ? ['os_cliente'] : []);
  let temas = temasAtencion(datos, metricas, hoy, canFin, moneda).filter(tema => puedeVer(tema.modulo));
  if (puedeVer('partes') && puedeVer('solicitudes_rrhh')) {
    const partes = temas.find(tema => tema.modulo === 'partes');
    const solicitudes = temas.find(tema => tema.modulo === 'solicitudes_rrhh');
    if (partes && solicitudes) {
      temas = temas.filter(tema => tema !== solicitudes).map(tema => tema === partes ? { ...tema, titulo: 'Por aprobar', detalle: `${partes.detalle} y ${solicitudes.detalle} de RRHH`, cantidad: partes.cantidad + solicitudes.cantidad } : tema);
    }
  }
  const fmt = valor => dinero(valor, moneda);
  const estadoCaja = cajaCargando ? 'Cargando' : cajaError ? 'Error al cargar' : null;
  const actual = canFin ? metricas.meses[5] : null;
  const cobroEstado = cargando ? 'Cargando' : fuentes.cobros.error ? 'Error al cargar' : fmt(actual?.cobrado);
  const resultadoValor = er.data?.resultadoNeto?.[moneda];
  const ingresos = er.data?.er?.ingresos?.total?.[moneda];
  const resultado = er.loading ? 'Cargando' : er.error ? 'Error al cargar' : fmt(resultadoValor);
  const margen = er.loading ? 'Cargando' : er.error ? 'Error al cargar' : ingresos ? `${(resultadoValor / ingresos * 100).toFixed(1)}%` : 'Sin dato';
  const vencidoCobrar = canFin ? sumar(metricas.vencidos) : 0;
  const vencidoPagar = canFin ? sumar(metricas.pagosVencidos) : 0;
  const kpis = canFin ? [
    { titulo: 'Caja operativa', valor: estadoCaja || fmt(metricas.caja), subtitulo: estadoCaja ? `Detracciones: ${estadoCaja}` : metricas.detracciones == null ? 'Sin cuenta de detracciones' : `Detracciones: ${fmt(metricas.detracciones)}`, negativo: !estadoCaja && metricas.caja < 0, items: estadoCaja ? [] : metricas.cuentasOperativas.map(cuenta => ({ label: cuenta.nombre, value: fmt(cuenta.saldo) })) },
    { titulo: 'Por cobrar', valor: fmt(metricas.totalCobrar), subtitulo: porcentaje(vencidoCobrar, metricas.totalCobrar), items: [{ label: 'Vencido', value: fmt(vencidoCobrar) }, { label: 'Por vencer', value: fmt(metricas.totalCobrar - vencidoCobrar) }] },
    { titulo: 'Por pagar', valor: fmt(metricas.totalPagar), subtitulo: porcentaje(vencidoPagar, metricas.totalPagar), items: [{ label: 'Vencido', value: fmt(vencidoPagar) }, { label: 'Por vencer', value: fmt(metricas.totalPagar - vencidoPagar) }] },
    { titulo: 'Por facturar', valor: fmt(metricas.cadena[4].valor), subtitulo: cantidadTexto(metricas.cadena[4].cantidad, 'OS abierta', 'OS abiertas'), items: [] },
  ] : [];
  const exportar = () => {
    const filas = [...kpis.map(item => ['Indicador', item.titulo, item.valor, item.subtitulo]), ...temas.map(item => [item.nivel, item.titulo, item.detalle, item.monto == null ? '' : fmt(item.monto)])];
    const url = URL.createObjectURL(new Blob([crearCSVBI(['Tipo', 'Nombre', 'Valor', 'Detalle'], filas)], { type: 'text/csv;charset=utf-8' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'dashboard-general.csv';
    enlace.click();
    URL.revokeObjectURL(url);
  };
  const maxChart = canFin ? Math.max(1, ...metricas.meses.flatMap(item => [item.facturado, item.cobrado])) : 1;
  const maxCadena = canFin ? Math.max(1, ...metricas.cadena.map(item => item.valor)) : 1;
  return (<section className="dx-ui dx-dash">
   <div className="dx-dash-wrap">
    <header className="dx-ui-head-page">
     <div>
      <div className="dx-ui-eyebrow">Centro de control</div>
      <h1 className="dx-ui-title">Dashboard General</h1>
      <p className="dx-ui-sub">{new Date(`${hoy}T12:00:00`).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {empresa?.nombre_comercial || empresa?.razon_social || 'Empresa'}</p>
     </div>
     <div className="dx-ui-actions">{canFin && <div className="dx-dash-seg" role="group" aria-label="Moneda">{[['PEN', 'Soles'], ['USD', 'Dólares']].map(([valor, etiqueta]) => <button type="button" key={valor} className={moneda === valor ? 'is-on' : ''} aria-pressed={moneda === valor} onClick={() => setMoneda(valor)}>{etiqueta}</button>)}</div>}<button type="button" className="dx-btn" onClick={exportar}>Exportar</button>
     </div>
    </header>
    {cebe && <div className="dx-dash-warning">No hay un centro de beneficio activo. <button type="button" onClick={() => navigate('maestros')}>Ir a Maestros Base</button>
    </div>}
    {app.supabaseStatus?.loading && <p className="dx-dash-note">Cargando datos de la empresa…</p>}
    {app.supabaseStatus?.error && <p className="dx-dash-error">Error al cargar datos de la empresa: {String(app.supabaseStatus.error.message || app.supabaseStatus.error)}</p>}
    {multi && !idsScope && <p className="dx-dash-warning">Sin sociedad disponible para mostrar datos.</p>}
    {canFin && <div className="kpi-grid bic-kpis">{kpis.map(item => <Indicador key={item.titulo} {...item}/>)}</div>}
    <div className="dx-dash-grid">
     <Tarjeta atencion titulo="Requiere atención" nota={cantidadTexto(temas.length, 'tema', 'temas')}>
      {cargando && <p className="dx-dash-note">Cargando fuentes adicionales…</p>}
      {['tickets', 'recepciones'].map(clave => fuentes[clave].error && <p className="dx-dash-error" key={clave}>Error al cargar {clave}: {fuentes[clave].error}</p>)}
      {!temas.length && !cargando && <p className="dx-dash-note">Sin temas pendientes.</p>}
      {(mas ? temas : temas.slice(0, 6)).map(tema => <button type="button" key={tema.titulo} className="dx-dash-row" onClick={() => navigate(tema.modulo)}>
       <span className={`dx-ui-pill ${tema.nivel === 'Crítico' ? 'is-red' : tema.nivel === 'Atención' ? 'is-amber' : 'is-gray'}`}>
        <i />{tema.nivel}</span>
       <span>
        <b>{tema.titulo}</b>
        <small>{tema.detalle}</small>
       </span>
       <span className="dx-dash-amt">{tema.monto == null ? '' : fmt(tema.monto)}</span>
       <span className="dx-dash-go" aria-hidden="true">›</span>
      </button>)}
      {temas.length > 6 && <button className="dx-dash-more" type="button" onClick={() => setMas(!mas)}>{mas ? 'Ver menos' : `Ver ${temas.length - 6} más`}</button>}
     </Tarjeta>
     {canFin && <Tarjeta titulo="Liquidez" nota="Hoy">
      <div className="dx-dash-liq">
       {[['Caja operativa', metricas.caja], ['Más: por cobrar', metricas.totalCobrar], ['Menos: por pagar', metricas.totalPagar]].map(([label, valor]) => <div className="dx-dash-liqline" key={label}>
        <span>{label}</span>
        <strong className={valor < 0 ? 'is-neg' : ''}>{label === 'Caja operativa' && estadoCaja ? estadoCaja : fmt(valor)}</strong>
       </div>)}
       <div className="dx-dash-net">
        <span>Posición neta</span>
        <strong className={metricas.neta < 0 ? 'is-neg' : ''}>{estadoCaja || fmt(metricas.neta)}</strong>
       </div>
       <p className="dx-dash-note">{!estadoCaja && (metricas.caja == null ? 'Sin cuenta operativa activa; se considera cero para la posición neta.' : 'No incluye detracciones.')}</p>
       <div className="dx-dash-month-stats">{[['Facturado del mes', fmt(actual?.facturado), false], ['Cobrado del mes', cobroEstado, false], ['Resultado del mes', resultado, resultadoValor < 0], ['Margen neto', margen, false]].map(([label, valor, negativo]) => <div key={label}>
        <span>{label}</span>
        <strong className={negativo ? 'is-neg' : ''}>{valor}</strong>
       </div>)}</div>
       {fuentes.cobros.error && <p className="dx-dash-error">{fuentes.cobros.error}</p>}{er.error && <p className="dx-dash-error">{er.error}</p>}
      </div>
     </Tarjeta>}
    </div>
    {canFin && <>
     <div className="dx-dash-block">
      <Tarjeta titulo="Del negocio a la caja" nota="Montos sin IGV, salvo por cobrar">
       <div className="dx-dash-chain">{metricas.cadena.map(item => <div className="dx-dash-stage" key={item.label}>
        <span>{item.label}</span>
        <strong>{fmt(item.valor)}</strong>
        <small>{cantidadTexto(item.cantidad, item.label === 'Oportunidades' ? 'abierta' : item.label === 'Cotizado enviado' ? 'sin respuesta' : item.label === 'Por cobrar' ? 'comprobante' : 'OS abierta', item.label === 'Oportunidades' ? 'abiertas' : item.label === 'Cotizado enviado' ? 'sin respuesta' : item.label === 'Por cobrar' ? 'comprobantes' : 'OS abiertas')}</small>
        <div className="dx-dash-track">
         <i style={{ width: `${Math.max(0, item.valor) / maxCadena * 100}%` }}/>
        </div>
       </div>)}</div>
      </Tarjeta>
     </div>
     <div className="dx-dash-grid is-even">
      <Tarjeta titulo="Facturado y cobrado" nota="Últimos 6 meses, con IGV">
       <div className="dx-dash-plot">
        <div className="dx-dash-legend">
         <span>
          <i className="s1"/>Facturado {fmt(metricas.meses.reduce((total, item) => total + item.facturado, 0))}</span>
         <span>
          <i className="s2"/>Cobrado {cargando ? 'Cargando' : fuentes.cobros.error ? 'Error al cargar' : fmt(metricas.meses.reduce((total, item) => total + item.cobrado, 0))}</span>
        </div>
        <div className="dx-dash-bars">{metricas.meses.map((item, indice) => <button type="button" className={`dx-dash-month ${mes === indice ? 'is-on' : ''}`} key={item.periodo} onMouseEnter={() => setMes(indice)} onFocus={() => setMes(indice)} aria-label={`${item.periodo}, facturado ${fmt(item.facturado)}, cobrado ${fmt(item.cobrado)}`}>
         <i className="s1" style={{ height: `${Math.max(0, item.facturado) / maxChart * 100}%` }}/>
         <i className="s2" style={{ height: `${Math.max(0, item.cobrado) / maxChart * 100}%` }}/>
        </button>)}</div>
        <div className="dx-dash-xlabels">{metricas.meses.map(item => <span key={item.periodo}>{nombreMes(item.periodo)}</span>)}</div>
        <div className="dx-dash-tip">
         <b>{nombreMes(metricas.meses[mes].periodo)}</b>
         <span>Facturado <b>{fmt(metricas.meses[mes].facturado)}</b>
         </span>
         <span>Cobrado <b>{cargando ? 'Cargando' : fuentes.cobros.error ? 'Error al cargar' : fmt(metricas.meses[mes].cobrado)}</b>
         </span>
        </div>
       </div>
      </Tarjeta>
      <Tarjeta titulo="Antigüedad de la cobranza" nota={metricas.totalCobrar && vencidoCobrar === metricas.totalCobrar ? '100% vencida' : cantidadTexto(metricas.vencidos.length, 'vencida', 'vencidas')}>
       <BarrasHorizontales filas={['Por vencer', '1 a 30', '31 a 60', '61 a 90', 'Más de 90'].map((label, indice) => ({ label, numero: metricas.aging[indice], valor: fmt(metricas.aging[indice]) }))}/>
       <div className="dx-dash-sub">Mayores deudores</div>{puedeVer('cxc') && metricas.deudores.length ? metricas.deudores.map(item => <Fila key={item.nombre} titulo={item.nombre} detalle={`${cantidadTexto(item.dias, 'día', 'días')} de mora, ${cantidadTexto(item.cantidad, 'comprobante', 'comprobantes')}`} valor={fmt(item.saldo)} onClick={() => navigate('cxc')}/>) : <p className="dx-dash-note">Sin deudores pendientes.</p>}
      </Tarjeta>
     </div>
    </>}
    <div className="dx-dash-grid is-even">
     <Tarjeta titulo="Órdenes de trabajo" nota={cantidadTexto(metricas.activos.length, 'vigente', 'vigentes')}>
      <BarrasHorizontales filas={metricas.otGrupos.map(item => ({ ...item, numero: item.cantidad, valor: item.cantidad }))}/>
      <div className="dx-dash-sub">Más atrasadas</div>{puedeVer('ot') && metricas.atrasadas.length ? metricas.atrasadas.slice(0, 3).map((item, indice) => <Fila key={item.id || indice} titulo={`${item.codigo || item.numero || 'Orden de trabajo'} · ${nombreCliente(item, datos.cuentas)}`} detalle={item.servicio?.nombre || (typeof item.servicio === 'string' ? item.servicio : '') || item.descripcion || 'Sin dato'} valor={cantidadTexto(item.dias, 'día', 'días')} alerta onClick={() => navigate('ot', { detail: item.id })}/>) : <p className="dx-dash-note">Sin órdenes atrasadas.</p>}
     </Tarjeta>{canFin && <Tarjeta titulo="Pagos vencidos" nota={cantidadTexto(metricas.pagosVencidos.length, 'documento', 'documentos')}>
      {puedeVer('cxp') && metricas.proveedores.length ? metricas.proveedores.map(item => <Fila key={item.nombre} titulo={item.nombre} detalle={`${cantidadTexto(item.dias, 'día', 'días')} vencida, ${cantidadTexto(item.cantidad, 'documento', 'documentos')}`} valor={fmt(item.saldo)} onClick={() => navigate('cxp')}/>) : <p className="dx-dash-note">Sin pagos vencidos.</p>}
      <div className="dx-dash-sub">Vencen en 7 días</div>
      <div className="dx-dash-liq">
       <p className="dx-dash-note">{metricas.proximos.length ? `${cantidadTexto(metricas.proximos.length, 'documento', 'documentos')} por ${fmt(sumar(metricas.proximos))}` : `Sin pagos por vencer en ${moneda === 'USD' ? 'dólares' : 'soles'}`}</p>
      </div>
     </Tarjeta>}</div>
   </div>
  </section>);
}
