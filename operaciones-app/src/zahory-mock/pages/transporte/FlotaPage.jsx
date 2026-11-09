import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { listarFlota, listarViajesEnCurso } from '../../../services/transporteFlotaService.js';
import { AccesoTransporte } from './AccesoTransporte.jsx';
import { usePermisosTransporte } from './usePermisosTransporte.js';
import { DxBuscador } from '../../components/dx/DxBuscador.jsx';
import { filtrarBusquedaInteligente } from '../../components/dx/busquedaInteligente.js';
import { ConductorEditor, Placa, TransportistaEditor, UnidadEditor } from './FlotaEditores.jsx';
import {
  estadoConductorFlota, estadoUnidadFlota, etiquetaContador, etiquetaTipoVehiculo, fechaActualLocal,
  formatearNumeroTransporte, recursosEnCurso,
} from './transporteUtils.js';

const FILTROS = {
  unidades: [['todos', 'Todas'], ['disponible', 'Disponibles'], ['en_viaje', 'En viaje'], ['vence', 'Por vencer'],
    ['vencido', 'Vencidas'], ['sincap', 'Sin capacidad'], ['inactiva', 'Inactivas']],
  conductores: [['todos', 'Todos'], ['disponible', 'Disponibles'], ['en_viaje', 'En viaje'], ['vence', 'Por vencer'], ['vencido', 'Vencidos'], ['inactivo', 'Inactivos']],
  transportistas: [['todos', 'Todos'], ['propio', 'Propios'], ['tercero', 'Terceros']],
};
const PESTANAS = [['unidades', 'Unidades'], ['conductores', 'Conductores'], ['transportistas', 'Transportistas']];
const NUEVO = { unidades: 'Nueva unidad', conductores: 'Nuevo conductor', transportistas: 'Nuevo transportista' };
const BUSCAR = { unidades: 'Placa, marca o tipo…', conductores: 'Nombre, DNI o brevete…', transportistas: 'Razón social o RUC…' };
const iniciales = nombre => String(nombre || '').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('')
  .toLocaleUpperCase('es-PE');
const nombreTransportista = item => item ? item.nombre_comercial || item.razon_social : 'Sin transportista';

function cumpleFiltro(filtro, estado, extra = {}) {
  if (filtro === 'todos') return true;
  if (filtro === 'vence' || filtro === 'vencido') return estado.documento.clave === filtro;
  if (filtro === 'sincap') return extra.sinCapacidad;
  if (filtro === 'en_viaje') return Boolean(estado.viaje);
  return estado.clave === filtro;
}

export function FlotaPage() {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const access = usePermisosTransporte(sesion);
  const [datos, setDatos] = useState({ transportistas: [], vehiculos: [], conductores: [] });
  const [ocupados, setOcupados] = useState({ vehiculos: {}, conductores: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pestana, setPestana] = useState('unidades');
  const [filtro, setFiltro] = useState('todos');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState(null);
  const [aviso, setAviso] = useState('');
  const hoy = fechaActualLocal();

  const cargar = useCallback(async () => {
    if (!empresaId || !access.ver) return;
    setLoading(true); setError('');
    try {
      const [flota, enCurso] = await Promise.all([listarFlota(empresaId), listarViajesEnCurso(empresaId)]);
      setDatos(flota); setOcupados(recursosEnCurso(enCurso));
    } catch (e) { setError(e.message || 'No se pudo cargar la flota.'); }
    finally { setLoading(false); }
  }, [empresaId, access.ver]);
  useEffect(() => { cargar(); }, [cargar]);

  const porId = useMemo(() => Object.fromEntries(datos.transportistas.map(item => [item.id, item])), [datos.transportistas]);
  const unidades = useMemo(() => datos.vehiculos.map(item => ({ item, estado: estadoUnidadFlota(item, ocupados, hoy) })), [datos.vehiculos, ocupados, hoy]);
  const conductores = useMemo(() => datos.conductores.map(item => ({ item, estado: estadoConductorFlota(item, ocupados, hoy) })), [datos.conductores, ocupados, hoy]);
  const activas = unidades.filter(({ estado }) => estado.clave !== 'inactiva');
  const disponibles = activas.filter(({ estado }) => estado.clave === 'disponible').length;
  const choferes = conductores.filter(({ estado }) => estado.clave !== 'inactivo');
  const porVencer = [...activas, ...choferes].filter(({ estado }) => estado.documento.clave === 'vence').length;
  const vencidos = [...activas.filter(({ estado }) => estado.documento.clave === 'vencido').map(({ item }) => `${item.placa}: certificado MTC vencido`),
    ...choferes.filter(({ estado }) => estado.documento.clave === 'vencido').map(({ item }) => `${item.nombre}: brevete vencido`)];
  const sinCapacidad = activas.filter(({ item }) => item.capacidad_toneladas == null).map(({ item }) => item.placa);
  const sinTransportista = datos.vehiculos.filter(item => !item.transportista_id).length + datos.conductores.filter(item => !item.transportista_id).length;

  const lista = useMemo(() => {
    if (pestana === 'unidades') {
      return filtrarBusquedaInteligente(unidades.filter(({ item, estado }) => cumpleFiltro(filtro, estado, { sinCapacidad: item.capacidad_toneladas == null }))
        .map(row => ({ ...row, busqueda: [row.item.placa, row.item.marca, row.item.modelo, etiquetaTipoVehiculo(row.item.tipo)] })), query);
    }
    if (pestana === 'conductores') {
      return filtrarBusquedaInteligente(conductores.filter(({ estado }) => cumpleFiltro(filtro, estado))
        .map(row => ({ ...row, busqueda: [row.item.nombre, row.item.dni, row.item.brevete] })), query);
    }
    return filtrarBusquedaInteligente(datos.transportistas.filter(item => filtro === 'todos' || item.tipo_operador === filtro)
      .map(item => ({ item, busqueda: [item.razon_social, item.nombre_comercial, item.ruc] })), query);
  }, [pestana, filtro, query, unidades, conductores, datos.transportistas]);

  const cambiarPestana = clave => { setPestana(clave); setFiltro('todos'); setQuery(''); };
  const abrir = (tipo, item = null) => { if (access.editar || (!item && access.crear)) setEditor({ tipo, item }); };
  const guardado = mensaje => () => { setEditor(null); setAviso(mensaje); cargar(); };
  const puedeCrear = access.crear;
  const teclado = (event, accion) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); accion(); } };

  if (access.motivo) return <AccesoTransporte acceso={access} />;
  const vacio = !loading && !error && !datos.transportistas.length && !datos.vehiculos.length && !datos.conductores.length;
  const tipoNuevo = pestana === 'unidades' ? 'unidad' : pestana === 'conductores' ? 'conductor' : 'transportista';

  return <section className="dx-ui dx-tms dx-tmsflota">
    <header className="dx-ui-head-page"><div><div className="dx-ui-eyebrow">Transporte comercial · Operación</div><h1 className="dx-ui-title">Flota</h1>
      <p className="dx-ui-sub">Unidades, conductores y transportistas que puedes asignar a tus viajes.</p></div>
      <div className="dx-ui-actions">{puedeCrear && <button type="button" className="dx-btn primary" onClick={() => abrir(vacio ? 'transportista' : tipoNuevo)}>
        ＋ {vacio ? 'Nuevo transportista' : NUEVO[pestana]}</button>}</div></header>

    {!vacio && <div className="dx-tms-kpis">
      <div className="dx-tms-kpi"><div className="dx-tms-kpi-k"><i>⛟</i>Unidades disponibles</div>
        <div className="dx-tms-kpi-v">{disponibles}<small>de {activas.length} activas</small></div>
        <div className="dx-tms-kpi-bar"><b style={{ width: `${activas.length ? disponibles / activas.length * 100 : 0}%` }} /></div>
        <div className="dx-tms-kpi-s">{activas.filter(({ estado }) => estado.viaje).length} en viaje ahora</div></div>
      <div className="dx-tms-kpi"><div className="dx-tms-kpi-k"><i>◉</i>Conductores disponibles</div>
        <div className="dx-tms-kpi-v">{choferes.filter(({ estado }) => estado.clave === 'disponible').length}<small>de {choferes.length}</small></div>
        <div className="dx-tms-kpi-s">{choferes.filter(({ estado }) => estado.clave !== 'disponible').length} en viaje o bloqueados</div></div>
      <div className="dx-tms-kpi is-warn"><div className="dx-tms-kpi-k"><i>◷</i>Documentos por vencer</div>
        <div className="dx-tms-kpi-v">{porVencer}</div><div className="dx-tms-kpi-s">En los próximos 30 días</div></div>
      <div className="dx-tms-kpi is-alert"><div className="dx-tms-kpi-k"><i>!</i>Bloquean el despacho</div>
        <div className="dx-tms-kpi-v">{vencidos.length}</div><div className="dx-tms-kpi-s">{vencidos.length} vencidos · {sinCapacidad.length} sin capacidad</div>
        {vencidos.length > 0 && <span className="dx-tms-pulse" aria-hidden="true" />}</div>
    </div>}

    {!loading && (vencidos.length > 0 || sinCapacidad.length > 0) && <div className="dx-tms-hero" role="status"><span className="dx-tms-hero-i" aria-hidden="true">⚠</span>
      <div className="dx-tms-hero-t"><b>{[vencidos.length && etiquetaContador(vencidos.length, 'documento vencido', 'documentos vencidos'),
        sinCapacidad.length && `${etiquetaContador(sinCapacidad.length, 'unidad', 'unidades')} sin capacidad`].filter(Boolean).join(' y ')}</b>
        <span>{[...vencidos.slice(0, 3), sinCapacidad.length ? `${sinCapacidad.slice(0, 4).join(', ')}: sin capacidad registrada` : ''].filter(Boolean).join(' · ')}</span></div>
      <button type="button" className="dx-btn" onClick={() => { setPestana('unidades'); setQuery(''); setFiltro(vencidos.length ? 'vencido' : 'sincap'); }}>Revisar →</button></div>}
    {sinTransportista > 0 && !loading && <div className="dx-transporte-composer-alert is-amber dx-tmsflota-note" role="status">
      <span>{etiquetaContador(sinTransportista, 'registro')} sin transportista. Edítalos y elige a quién pertenecen para despacharlos sin dudas.</span></div>}
    {aviso && <div className="dx-ui-notice dx-tmsflota-note" role="status">{aviso}</div>}

    <div className="dx-ui-card dx-tms-card">
      <div className="dx-tmsflota-tabs" role="tablist" aria-label="Flota">{PESTANAS.map(([clave, texto]) => <button key={clave} type="button" role="tab"
        aria-selected={pestana === clave} className={pestana === clave ? 'is-on' : ''} onClick={() => cambiarPestana(clave)}>{texto}
        <span>{clave === 'unidades' ? datos.vehiculos.length : clave === 'conductores' ? datos.conductores.length : datos.transportistas.length}</span></button>)}</div>
      {!vacio && <div className="dx-ui-toolbar dx-tmsflota-toolbar"><div className="dx-tms-filters is-inline">{FILTROS[pestana].map(([clave, texto]) =>
        <button key={clave} type="button" className={`dx-tms-fchip${filtro === clave ? ' is-on' : ''}`} aria-pressed={filtro === clave} onClick={() => setFiltro(clave)}>{texto}</button>)}</div>
        <DxBuscador value={query} onChange={setQuery} placeholder={BUSCAR[pestana]} label="Buscar en la flota" /></div>}
      {loading ? <div className="dx-tms-skeletons">{[1, 2, 3].map(key => <div key={key} className="dx-tms-sk is-tall" />)}</div>
        : error ? <div className="dx-tms-state"><span className="dx-tms-state-i is-red">!</span><b>No pudimos cargar la flota</b><span>{error}</span>
          <button type="button" className="dx-btn primary" onClick={cargar}>Reintentar</button></div>
          : vacio ? <div className="dx-tms-state"><span className="dx-tms-state-i">⛟</span><b>Aún no registras tu flota</b>
            <span>Agrega primero tu transportista (propio o tercero), luego sus unidades y conductores.</span>
            {puedeCrear && <button type="button" className="dx-btn primary" onClick={() => abrir('transportista')}>＋ Nuevo transportista</button>}</div>
            : !lista.length ? <div className="dx-tms-state"><span className="dx-tms-state-i">⌕</span><b>Sin resultados</b><span>Prueba con otra búsqueda o quita los filtros.</span>
              <button type="button" className="dx-btn" onClick={() => { setQuery(''); setFiltro('todos'); }}>Limpiar filtros</button></div>
              : pestana === 'unidades' ? <div className="dx-tmsflota-grid">{lista.map(({ item, estado }) => <button key={item.id} type="button"
                className={`dx-tmsflota-fc${estado.clave === 'bloqueada' ? ' is-blocked' : ''}`} aria-label={`Editar ${item.placa}`} onClick={() => abrir('unidad', item)}>
                <div className="dx-tmsflota-top"><Placa placa={item.placa} /><span className={`dx-ui-pill ${estado.color}`}><i />{estado.etiqueta}</span></div>
                <span className="dx-tmsflota-who"><b>{etiquetaTipoVehiculo(item.tipo)}</b><small>{[item.marca, item.modelo, item.anio].filter(Boolean).join(' · ') || 'Sin marca ni modelo'}</small></span>
                {item.capacidad_toneladas != null ? <div className="dx-tmsflota-cap"><div><small>Carga útil</small><b>{formatearNumeroTransporte(item.capacidad_toneladas)}<em>t</em></b></div>
                  <div><small>Volumen</small><b>{item.capacidad_m3 == null ? '—' : formatearNumeroTransporte(item.capacidad_m3)}<em>m³</em></b></div></div>
                  : <div className="dx-tmsflota-capmiss">⚠ Capacidad sin registrar{access.editar && <span>Completar</span>}</div>}
                <div className="dx-tmsflota-chips"><span className="dx-tmsflota-chip">{porId[item.transportista_id]?.tipo_operador === 'propio' ? '● Propia' : porId[item.transportista_id] ? '◌ Tercero' : '⚠'} · {nombreTransportista(porId[item.transportista_id])}</span>
                  {estado.viaje && <span className="dx-tmsflota-chip">⛟ {estado.viaje}</span>}</div>
                <div className="dx-tmsflota-docrow"><i className={`dx-tms-dot is-${estado.documento.clave}`} />Cert. MTC {item.nro_certificado_habilitacion || 'sin número'}
                  <span className={`is-${estado.documento.clave}`}>{estado.documento.etiqueta}</span></div>
              </button>)}{puedeCrear && <button type="button" className="dx-tmsflota-add" onClick={() => abrir('unidad')}><i aria-hidden="true">＋</i>Nueva unidad</button>}</div>
                : pestana === 'conductores' ? <div className="dx-tmsflota-grid">{lista.map(({ item, estado }) => <button key={item.id} type="button"
                  className={`dx-tmsflota-fc${estado.clave === 'bloqueado' ? ' is-blocked' : ''}`} aria-label={`Editar ${item.nombre}`} onClick={() => abrir('conductor', item)}>
                  <div className="dx-tmsflota-top"><span className="dx-tmsflota-av">{iniciales(item.nombre)}</span><span className="dx-tmsflota-who"><b>{item.nombre}</b><small>DNI {item.dni}</small></span>
                    <span className={`dx-ui-pill ${estado.color}`}><i />{estado.etiqueta}</span></div>
                  <div className="dx-tmsflota-cap"><div><small>Brevete</small><b className="is-sm">{item.brevete || '—'}</b></div><div><small>Categoría</small><b className="is-sm">{item.categoria_brevete || '—'}</b></div></div>
                  <div className="dx-tmsflota-chips"><span className="dx-tmsflota-chip">{porId[item.transportista_id]?.tipo_operador === 'propio' ? '● Propio' : porId[item.transportista_id] ? '◌ Tercero' : '⚠'} · {nombreTransportista(porId[item.transportista_id])}</span>
                    {estado.viaje && <span className="dx-tmsflota-chip">⛟ {estado.viaje}</span>}</div>
                  <div className="dx-tmsflota-docrow"><i className={`dx-tms-dot is-${estado.documento.clave}`} />Vigencia del brevete<span className={`is-${estado.documento.clave}`}>{estado.documento.etiqueta}</span></div>
                </button>)}{puedeCrear && <button type="button" className="dx-tmsflota-add" onClick={() => abrir('conductor')}><i aria-hidden="true">＋</i>Nuevo conductor</button>}</div>
                  : <div role="table" aria-label="Transportistas"><div className="dx-ui-head dx-tmsflota-cols" role="row" aria-hidden="true"><span>Transportista</span><span>RUC</span><span>Tipo</span>
                    <span>Contacto</span><span>Flota</span><span /></div>
                    {lista.map(({ item }) => {
                      const nu = datos.vehiculos.filter(row => row.transportista_id === item.id).length;
                      const nc = datos.conductores.filter(row => row.transportista_id === item.id).length;
                      return <div key={item.id} className="dx-ui-row dx-tmsflota-cols" role="button" tabIndex={0} onClick={() => abrir('transportista', item)}
                        onKeyDown={event => teclado(event, () => abrir('transportista', item))}>
                        <span className="dx-tmsflota-nm"><span className="dx-tmsflota-av is-sm">{iniciales(nombreTransportista(item))}</span>
                          <span><b>{item.razon_social}</b><small>{[item.nombre_comercial, item.nro_mtc && `MTC ${item.nro_mtc}`].filter(Boolean).join(' · ') || '—'}</small></span></span>
                        <span className="dx-tmsflota-ruc">RUC {item.ruc}</span>
                        <span className="dx-tmsflota-tp"><span className={`dx-ui-pill ${item.tipo_operador === 'propio' ? 'is-cyan' : 'is-violet'}`}><i />{item.tipo_operador === 'propio' ? 'Propio' : 'Tercero'}</span>
                          {item.activo === false && <span className="dx-ui-pill is-gray"><i />Inactivo</span>}</span>
                        <span className="dx-tmsflota-ct"><small>{item.telefono || 'Sin teléfono'}</small><small>{item.email || 'Sin correo'}</small></span>
                        <span className="dx-tmsflota-chips"><span className="dx-tmsflota-chip">⛟ {etiquetaContador(nu, 'unidad', 'unidades')}</span>
                          <span className="dx-tmsflota-chip">◉ {etiquetaContador(nc, 'conductor', 'conductores')}</span></span>
                        <span className="dx-ui-arrow" aria-hidden="true">›</span></div>;
                    })}</div>}
    </div>

    <UnidadEditor open={editor?.tipo === 'unidad'} unidad={editor?.item} empresaId={empresaId} transportistas={datos.transportistas.filter(item => item.activo !== false)}
      vehiculos={datos.vehiculos} tipos={datos.vehiculos.map(item => item.tipo).filter(Boolean)} onClose={() => setEditor(null)}
      onSaved={guardado(editor?.item ? 'Unidad actualizada.' : 'Unidad creada.')} />
    <ConductorEditor open={editor?.tipo === 'conductor'} conductor={editor?.item} empresaId={empresaId} transportistas={datos.transportistas.filter(item => item.activo !== false)}
      conductores={datos.conductores} onClose={() => setEditor(null)} onSaved={guardado(editor?.item ? 'Conductor actualizado.' : 'Conductor creado.')} />
    <TransportistaEditor open={editor?.tipo === 'transportista'} transportista={editor?.item} empresaId={empresaId} transportistas={datos.transportistas}
      onClose={() => setEditor(null)} onSaved={guardado(editor?.item ? 'Transportista actualizado.' : 'Transportista creado.')} />
  </section>;
}
