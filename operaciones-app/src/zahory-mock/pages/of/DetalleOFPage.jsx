import React, { useEffect, useMemo, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { useCompactWorkMode } from '../../../useCompactWorkMode.js';
import {
  anularOF, aprobarOF, enviarACalidadOF, guardarMaterialOF, guardarOperacionOF, liberarOF, listarMaterialesOF, listarPartesOF, obtenerCalidadOF, obtenerCatalogoAvanceOF, obtenerReservasOF,
  obtenerCatalogoEdicionOF, obtenerOF, quitarMaterialOF, quitarOperacionOF, registrarParteOF, revisarParteOF,
} from '../../../services/ordenFabricacionService.js';
import { ETIQUETA_ESTADO_OF, formatearFecha, formatearMonto } from './ofBandejaLogic.js';
import { agruparRuta, textoHoras } from './ofCrearLogic.js';
import { admiteNoPlanificado, esEditable, materialDesdeLinea, resumenAprobacion, tareaDesdeOperacion, textoStock } from './ofFichaLogic.js';
import { ConfirmarModal, MaterialModal, TareaModal } from './OFModales.jsx';
import { OFCalidadPanel } from './OFCalidadPanel.jsx';
import { AnularOFModal, AvanceModal, RevisarParteModal } from './OFAvanceModales.jsx';
import { ESTADOS_ANULABLES, ESTADOS_AVANCE, ESTADOS_PARTES, ETIQUETA_PARTE, etiquetasReserva, hoyISO, resumenProduccion, resumenReservas } from './ofAvanceLogic.js';
import { ESTADOS_CON_CALIDAD, ESTADOS_ENVIO, normalizarCalidad, resumenCalidad } from './ofCalidadLogic.js';
import { cargarDatosEntrega, cargarEntrega } from '../../../services/ofEntregaService.js';
import { OFEntregaWizard } from './OFEntregaWizard.jsx';
import { OFEntregaPanel, OFEntregaUnidades } from './OFEntregaPanel.jsx';

const LINEA_TIEMPO = [
  ['borrador', 'Borrador'],
  ['en_ingenieria', 'Ingeniería'],
  ['aprobada', 'Aprobada'],
  ['en_produccion', 'Producción'],
  ['en_calidad', 'Calidad'],
  ['lista_entrega', 'Lista'],
  ['entregada', 'Entregada'],
  ['cerrada', 'Cerrada'],
];

const ESTADO_OPERACION = { pendiente: 'Pendiente', en_proceso: 'En proceso', terminada: 'Terminada', bloqueada: 'Bloqueada' };
const ORIGEN_MATERIAL = { stock: 'Stock propio', compra: 'Compra', cliente: 'Material del cliente' };
const MONEDA = { PEN: 'Soles (PEN)', USD: 'Dólares (USD)', EUR: 'Euros (EUR)' };

const Atras = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>;
const IcoMas = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
const IcoEditar = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>;
const IcoQuitar = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;
const IcoX = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>;
const IcoCheck = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>;
const IcoEnviar = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
const IcoInfo = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>;

export function DetalleOFPage({ onNav, routeParams = {}, ofIdRespaldo }) {
  useCompactWorkMode(true, { backLabel: 'Órdenes de Fabricación', onBack: () => onNav?.('maestranza-of') });
  const { estado: estadoSesion, empresaId } = useSesionOperativa();
  const id = routeParams.id || ofIdRespaldo || '';
  const [of, setOf] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [pestana, setPestana] = useState('ruta');
  const [catalogo, setCatalogo] = useState(null);
  const [materialesCat, setMaterialesCat] = useState([]);
  const [cargandoMateriales, setCargandoMateriales] = useState(false);
  const [modal, setModal] = useState(null);
  const [aviso, setAviso] = useState('');
  const [calidad, setCalidad] = useState(null);
  const [avanceCat, setAvanceCat] = useState(null);
  const [partes, setPartes] = useState([]);
  const [reservas, setReservas] = useState(null);
  const [datosEntrega, setDatosEntrega] = useState(null);
  const [entrega, setEntrega] = useState(null);

  useEffect(() => {
    if (estadoSesion !== 'listo') return undefined;
    let vivo = true;
    if (!id) { setCargando(false); setError('No se indicó qué OF abrir.'); return undefined; }
    setCargando(true);
    setError('');
    setPestana('ruta');
    setModal(null);
    setAviso('');
    setCatalogo(null);
    setMaterialesCat([]);
    setCalidad(null);
    setAvanceCat(null);
    setPartes([]);
    setReservas(null);
    setDatosEntrega(null);
    setEntrega(null);
    obtenerOF(id)
      .then(fila => { if (vivo) { setOf(fila); if (!fila) setError('La OF no existe o no tienes acceso a ella.'); } })
      .catch(err => { if (vivo) setError(err?.message || 'No se pudo cargar la OF.'); })
      .finally(() => { if (vivo) setCargando(false); });
    // Catálogos para editar: si fallan, la ficha sigue en solo lectura.
    obtenerCatalogoEdicionOF(id).then(c => { if (vivo) setCatalogo(c); }).catch(() => {});
    // F4 · Calidad: si falla, la pestaña muestra el aviso y el resto de la ficha sigue igual.
    obtenerCalidadOF(id).then(c => { if (vivo) setCalidad(normalizarCalidad(c)); }).catch(() => {});
    // F3b · Avance: técnicos, permisos y partes. Si fallan, la ficha sigue sin registrar avance.
    obtenerCatalogoAvanceOF(id).then(c => { if (vivo) setAvanceCat(c); }).catch(() => {});
    listarPartesOF(id).then(l => { if (vivo) setPartes(l); }).catch(() => {});
    // F3c · Reservas WMS de los materiales de stock (franja de la pestaña Materiales).
    obtenerReservasOF(id).then(r => { if (vivo) setReservas(r); }).catch(() => {});
    cargarDatosEntrega(id).then(r => { if (vivo) setDatosEntrega(r); }).catch(() => {});
    cargarEntrega(id).then(r => { if (vivo) setEntrega(r); }).catch(() => {});
    setCargandoMateriales(true);
    listarMaterialesOF(id)
      .then(lista => { if (vivo) setMaterialesCat(lista); })
      .catch(() => {})
      .finally(() => { if (vivo) setCargandoMateriales(false); });
    return () => { vivo = false; };
  }, [id, estadoSesion]);

  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(''), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  const recargar = async mensaje => {
    const [fila, cal, lista, res] = await Promise.all([
      obtenerOF(id), obtenerCalidadOF(id).catch(() => null), listarPartesOF(id).catch(() => null), obtenerReservasOF(id).catch(() => null),
    ]);
    setOf(fila);
    if (res) setReservas(res);
    if (cal) setCalidad(normalizarCalidad(cal));
    if (lista) setPartes(lista);
    const [preparacion, entregado] = await Promise.all([cargarDatosEntrega(id).catch(() => null), cargarEntrega(id).catch(() => null)]);
    setDatosEntrega(preparacion);
    setEntrega(entregado);
    if (mensaje) setAviso(mensaje);
  };
  const resumenQ = useMemo(() => resumenCalidad(calidad || {}), [calidad]);
  const prod = useMemo(() => resumenProduccion(of, partes), [of, partes]);
  const resR = useMemo(() => resumenReservas(reservas), [reservas]);
  const reservaPorLinea = useMemo(() => new Map((reservas?.lineas || []).map(l => [l.of_material_id, l])), [reservas]);
  const stockPorMaterial = useMemo(() => new Map(materialesCat.map(m => [m.id, m.disponible])), [materialesCat]);
  const materialPorId = useMemo(() => new Map(materialesCat.map(m => [m.id, m])), [materialesCat]);

  const ruta = useMemo(() => agruparRuta(of?.operaciones || []), [of]);
  const totales = useMemo(() => {
    const ops = of?.operaciones || [];
    const mats = of?.materiales || [];
    const r = n => Math.round(n * 100) / 100;
    return {
      mo: r(ops.reduce((s, o) => s + o.costo, 0)),
      mat: r(mats.reduce((s, m) => s + m.subtotal, 0)),
      horas: r(ops.reduce((s, o) => s + o.horas, 0)),
      horasMaq: r(ops.reduce((s, o) => s + o.horas_maquina, 0)),
    };
  }, [of]);

  const volver = () => onNav?.('maestranza-of');

  if (cargando || error || !of) {
    return (
      <section className="dx-ofd">
        <div className="dx-ofd-in">
          <button type="button" className="dx-ofd-back" onClick={volver}><Atras />Órdenes de Fabricación</button>
          <div className={`dx-ofd-card dx-ofd-msg ${error ? 'is-error' : ''}`} role={error ? 'alert' : undefined}>
            {cargando ? 'Cargando la OF…' : error}
          </div>
        </div>
      </section>
    );
  }

  const indiceEstado = LINEA_TIEMPO.findIndex(([k]) => k === of.estado);
  const moneda = of.moneda;
  const editable = esEditable(of.estado) && Boolean(catalogo?.puede_editar);
  const noPlanificado = admiteNoPlanificado(of.estado) && Boolean(catalogo?.puede_editar);
  const puedeAprobar = esEditable(of.estado) && Boolean(catalogo?.puede_aprobar);
  const puedeAnular = ESTADOS_ANULABLES.includes(of.estado) && Boolean(avanceCat?.puede_anular);
  const puedeEnviarCalidad = ESTADOS_ENVIO.includes(of.estado) && Boolean(calidad?.puedeEnviar);
  const puedeLiberar = of.estado === 'en_calidad' && Boolean(calidad?.puedeLiberar);
  const verCalidad = ESTADOS_ENVIO.includes(of.estado) || ESTADOS_CON_CALIDAD.includes(of.estado);
  const puedeRegistrar = ESTADOS_AVANCE.includes(of.estado) && Boolean(avanceCat?.puede_registrar) && of.operaciones.some(o => o.estado !== 'terminada');
  const puedeRevisar = ESTADOS_AVANCE.includes(of.estado) && Boolean(avanceCat?.puede_revisar);
  const verPartes = ESTADOS_PARTES.includes(of.estado);
  const verEntrega = ['entregada', 'cerrada'].includes(of.estado);
  const puedeEntregar = of.estado === 'lista_entrega' && Boolean(datosEntrega?.puede_entregar);
  const enProduccion = verPartes && (of.estado !== 'aprobada' || partes.length > 0);
  const cerrarModal = () => setModal(null);
  const abrirTarea = (operacion = null, preset = {}) => setModal({ tipo: 'tarea', operacion: operacion && { ...operacion, _form: tareaDesdeOperacion(operacion) }, preset });
  const abrirMaterial = (linea = null) => setModal({ tipo: 'material', linea: linea && { ...linea, _form: materialDesdeLinea(linea) } });
  const resumen = resumenAprobacion(of, stockPorMaterial);
  const datos = [
    ['Cliente', of.cliente],
    ['OS', of.os?.numero],
    ['Hoja de costeo', of.hoja?.numero],
    ['Componente', of.componente],
    ['Apertura', of.fecha_apertura ? formatearFecha(of.fecha_apertura) : ''],
    ['Compromiso', of.fecha_compromiso ? formatearFecha(of.fecha_compromiso) : ''],
    ['Responsable', ''],
    ['Moneda', MONEDA[moneda] || moneda],
    ['Avance', `${Math.round(of.avance_pct)} %`],
  ];

  return (
    <section className="dx-ofd">
      <div className="dx-ofd-in">
        <button type="button" className="dx-ofd-back" onClick={volver}><Atras />Órdenes de Fabricación</button>
        <div className="dx-ofd-hdr">
          <div>
            <div className="dx-ofd-eyebrow">Orden de Fabricación</div>
            <h1 className="dx-ofd-title">
              {of.numero}
              <span className={`dx-ofd-pill is-${of.estado}`}><i />{ETIQUETA_ESTADO_OF[of.estado] || of.estado}</span>
            </h1>
            <p className="dx-ofd-sub">{[of.descripcion, of.cliente].filter(Boolean).join(' · ') || 'Sin descripción'}</p>
          </div>
          {(puedeAnular || puedeAprobar || puedeRegistrar || puedeEnviarCalidad || puedeLiberar || puedeEntregar) && (
            <div className="dx-ofd-hdr-actions">
              {puedeAnular && <button type="button" className="dx-ofd-ghost" onClick={() => setModal({ tipo: 'anular' })}>Anular OF</button>}
              {puedeRegistrar && <button type="button" className={puedeEnviarCalidad ? 'dx-ofd-ghost' : 'dx-ofd-primary'} onClick={() => setModal({ tipo: 'avance' })}><IcoMas />Registrar avance</button>}
              {puedeAprobar && <button type="button" className="dx-ofd-primary" onClick={() => setModal({ tipo: 'aprobar' })}><IcoCheck />Aprobar OF</button>}
              {puedeEnviarCalidad && <button type="button" className="dx-ofd-primary" onClick={() => setModal({ tipo: 'enviar-calidad' })}><IcoEnviar />Enviar a calidad</button>}
              {puedeLiberar && (
                <button type="button" className="dx-ofd-primary" disabled={!resumenQ.liberable} onClick={() => setModal({ tipo: 'liberar' })}
                  title={resumenQ.liberable ? '' : 'Faltan críticas dentro de tolerancia o hay una NC abierta.'}><IcoCheck />Liberar OF</button>
              )}
              {puedeEntregar && <button type="button" className="dx-ofd-primary" onClick={() => setModal({ tipo: 'entrega' })}>Entregar al cliente</button>}
            </div>
          )}
        </div>
        {aviso && <div className="dx-ofd-toast" role="status">{aviso}</div>}
        {editable && (
          <div className="dx-ofd-notice"><IcoInfo /><div>Revisa la ruta y los materiales. Al <b>aprobar</b>, se reserva el stock y se pide a Compras lo que falte; la ruta queda fija y después solo se agregan materiales no planificados.</div></div>
        )}
        {of.estado === 'aprobada' && (
          <div className={`dx-ofd-notice${resR.faltantes.length ? ' is-warn' : ''}`}><IcoInfo /><div>
            {resR.total > 0 && <>Se reservaron <b>{resR.completas} de {resR.total} {resR.total === 1 ? 'material' : 'materiales'}</b>{reservas?.almacen ? ` en ${reservas.almacen}` : ''}. </>}
            {resR.faltantes.map(f => {
              const m = of.materiales.find(x => x.id === f.of_material_id);
              return <React.Fragment key={f.of_material_id}>Falta <b>{f.faltante} {m?.unidad || 'und'}</b> de {m?.descripcion || 'un material'}{f.solpe ? <>: va a Compras en la SOLPE <b>{f.solpe}</b></> : ''}. </React.Fragment>;
            })}
            La ruta ya no se edita y la OF pasa a <b>En producción</b> con el primer parte aprobado.
          </div></div>
        )}
        {of.estado === 'en_calidad' && calidad && (
          <div className={`dx-ofd-notice${resumenQ.liberable ? ' is-ok' : resumenQ.fuera || resumenQ.ncAbiertas ? ' is-warn' : ''}`}><IcoInfo /><div>
            {resumenQ.liberable
              ? <>Todas las críticas están dentro de tolerancia y no hay NC abiertas. Ya se puede <b>liberar</b> la OF.</>
              : resumenQ.ncAbiertas
                ? <>Hay <b>{resumenQ.ncAbiertas} {resumenQ.ncAbiertas === 1 ? 'no conformidad abierta' : 'no conformidades abiertas'}</b>: la OF no se libera hasta cerrarlas.</>
                : <>La OF está <b>en calidad</b>: registra las mediciones de cada unidad en la pestaña Calidad.</>}
          </div></div>
        )}
        {of.estado === 'lista_entrega' && calidad?.liberadoEn && (
          <div className="dx-ofd-notice is-ok"><IcoCheck /><div>OF liberada por calidad{calidad.liberadoPor ? ` (${calidad.liberadoPor})` : ''} el {formatearFecha(calidad.liberadoEn)}: <b>lista para entrega</b>.</div></div>
        )}

        {of.estado === 'anulada'
          ? <div className="dx-ofd-anulada" role="status">Esta OF está anulada. Motivo: {of.motivo_anulacion || 'Sin dato'}. Fecha de anulación: {formatearFecha(of.anulada_en ? hoyISO(new Date(of.anulada_en)) : null)}.</div>
          : (
            <ol className="dx-ofd-tl" aria-label="Estado de la OF">
              {LINEA_TIEMPO.map(([k, etiqueta], i) => (
                <li key={k} className={i < indiceEstado ? 'is-done' : i === indiceEstado ? 'is-now' : ''} aria-current={i === indiceEstado ? 'step' : undefined}>
                  <i />{etiqueta}
                </li>
              ))}
            </ol>
          )}

        {enProduccion && (
          <div className="dx-ui dx-ofd-kpis">
            <div className="dx-ui-kpi-row">
              <div className="dx-ui-kpi"><strong>{prod.avance} %</strong><span>Avance ponderado</span></div>
              <div className="dx-ui-kpi"><strong>{prod.horasReales} h</strong><span>Horas reales de {prod.horasEstimadas} h</span></div>
              <div className="dx-ui-kpi"><strong>{formatearMonto(of.costo_real, moneda)}</strong><span>Costo real</span></div>
              <div className="dx-ui-kpi"><strong>{prod.porAprobar}</strong><span>{prod.porAprobar === 1 ? 'Parte por aprobar' : 'Partes por aprobar'}</span></div>
            </div>
          </div>
        )}

        <div className="dx-ofd-grid">
          <div className="dx-ofd-card dx-ofd-main">
            <dl className="dx-ofd-fields">
              {datos.map(([k, v]) => (
                <div className="dx-ofd-field" key={k}><dt>{k}</dt><dd>{v || 'Sin dato'}</dd></div>
              ))}
            </dl>

            <div className="dx-ofd-tabsbar">
              <div className="dx-ofd-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={pestana === 'ruta'} className={pestana === 'ruta' ? 'is-on' : ''} onClick={() => setPestana('ruta')}>
                  Ruta · {of.operaciones.length}
                </button>
                <button type="button" role="tab" aria-selected={pestana === 'materiales'} className={pestana === 'materiales' ? 'is-on' : ''} onClick={() => setPestana('materiales')}>
                  Materiales · {of.materiales.length}
                </button>
                {verPartes && (
                  <button type="button" role="tab" aria-selected={pestana === 'partes'} className={pestana === 'partes' ? 'is-on' : ''} onClick={() => setPestana('partes')}>
                    Partes · {partes.length}{prod.porAprobar ? <b>{prod.porAprobar} por aprobar</b> : null}
                  </button>
                )}
                {verCalidad && (
                  <button type="button" role="tab" aria-selected={pestana === 'calidad'} className={pestana === 'calidad' ? 'is-on' : ''} onClick={() => setPestana('calidad')}>
                    Calidad{resumenQ.ncAbiertas ? <b>{resumenQ.ncAbiertas}</b> : null}
                  </button>
                )}
                {verEntrega && <button type="button" role="tab" aria-selected={pestana === 'unidades'} className={pestana === 'unidades' ? 'is-on' : ''} onClick={() => setPestana('unidades')}>Unidades · {entrega?.unidades?.length || 0}</button>}
              </div>
              {pestana === 'ruta' && editable && (
                <button type="button" className="dx-ofd-ghost" onClick={() => abrirTarea()}><IcoMas />Agregar tarea</button>
              )}
              {pestana === 'materiales' && (editable || noPlanificado) && (
                <button type="button" className="dx-ofd-ghost" onClick={() => (editable ? abrirMaterial() : setModal({ tipo: 'material', noPlanificado: true }))}>
                  <IcoMas />{editable ? 'Agregar material' : 'Material no planificado'}
                </button>
              )}
            </div>

            <div className="dx-ofd-panel" role="tabpanel">
              {pestana === 'unidades' && verEntrega && <OFEntregaUnidades datos={entrega} />}
              {pestana === 'ruta' && !of.operaciones.length && (
                <div className="dx-ofd-empty">
                  Esta OF aún no tiene operaciones.
                  {editable && <div><button type="button" className="dx-ofd-addbtn" onClick={() => abrirTarea()}><IcoMas />Agregar la primera tarea</button></div>}
                </div>
              )}
              {pestana === 'ruta' && ruta.map(t => (
                <div className="dx-ofd-trab" key={t.nombre}>
                  <div className="dx-ofd-trab-h"><b>{t.nombre}</b><span className="dx-ofd-muted dx-ofd-right">{t.tareas} {t.tareas === 1 ? 'tarea' : 'tareas'} · {textoHoras(t.horas, t.horasMaquina)}</span></div>
                  {t.actividades.map(a => (
                    <div key={a.nombre}>
                      <div className="dx-ofd-act">Actividad · {a.nombre}</div>
                      {enProduccion
                        ? <div className="dx-ofd-op is-head is-prod" aria-hidden="true"><span>#</span><span>Tarea</span><span>Cargo</span><span>Horas reales</span><span>Equipo · bahía</span><span>Avance</span><span className="is-r">Estado</span></div>
                        : <div className={`dx-ofd-op is-head${editable ? ' is-edit' : ''}`} aria-hidden="true"><span>#</span><span>Tarea</span><span>Cargo</span><span>Horas</span><span>Equipo</span><span>Bahía</span><span className="is-r">{editable ? 'Costo' : 'Estado'}</span>{editable && <span />}</div>}
                      {enProduccion && a.operaciones.map(op => (
                        <div className="dx-ofd-op is-prod" key={op.id}>
                          <span className="dx-ofd-o-seq dx-ofd-seq">{op.secuencia}</span>
                          <span className="dx-ofd-o-tar dx-ofd-strong">{op.tarea}</span>
                          <span className="dx-ofd-o-car dx-ofd-muted"><span className="dx-ofd-k">Cargo</span>{op.cargo || 'Sin dato'}</span>
                          <span className="dx-ofd-o-hh"><span className="dx-ofd-k">Horas</span>{op.horas_reales} h de {op.horas} h</span>
                          <span className="dx-ofd-o-eq dx-ofd-muted"><span className="dx-ofd-k">Equipo</span>{op.equipo || 'Sin equipo'} · {op.bahia || 'Planner'}</span>
                          <span className="dx-ofd-o-bah dx-ofd-progress" aria-label={`Avance ${Math.round(op.avance_pct)} %`}>
                            <b>{Math.round(op.avance_pct)} %</b><span className="dx-ofd-bar"><i style={{ width: `${Math.min(100, Math.max(0, op.avance_pct))}%` }} /></span>
                          </span>
                          <span className="dx-ofd-o-st"><span className={`dx-ofd-opst is-${op.estado}`}><i />{ESTADO_OPERACION[op.estado] || op.estado}</span></span>
                        </div>
                      ))}
                      {!enProduccion && a.operaciones.map(op => (
                        <div className={`dx-ofd-op${editable ? ' is-edit' : ''}`} key={op.id}>
                          <span className="dx-ofd-o-seq dx-ofd-seq">{op.secuencia}</span>
                          <span className="dx-ofd-o-tar dx-ofd-strong">{op.tarea}</span>
                          <span className="dx-ofd-o-car dx-ofd-muted"><span className="dx-ofd-k">Cargo</span>{op.cargo || 'Sin dato'}</span>
                          <span className="dx-ofd-o-hh"><span className="dx-ofd-k">Horas</span>{op.horas} h{op.horas_maquina ? ` · ${op.horas_maquina} h-máq.` : ''}</span>
                          <span className="dx-ofd-o-eq dx-ofd-muted"><span className="dx-ofd-k">Equipo</span>{op.equipo || 'Sin equipo'}</span>
                          <span className="dx-ofd-o-bah"><span className="dx-ofd-k">Bahía</span>{op.bahia ? <span className="dx-ofd-tag">{op.bahia}</span> : <span className="dx-ofd-tag is-warn">La asigna el Planner</span>}</span>
                          {editable
                            ? <span className="dx-ofd-o-st dx-ofd-money"><span className="dx-ofd-k">Costo</span>{formatearMonto(op.costo, moneda)}</span>
                            : <span className="dx-ofd-o-st"><span className={`dx-ofd-opst is-${op.estado}`}><i />{ESTADO_OPERACION[op.estado] || op.estado}</span></span>}
                          {editable && (
                            <span className="dx-ofd-o-act dx-ofd-icons">
                              <button type="button" className="dx-ofd-ib" aria-label={`Editar ${op.tarea}`} onClick={() => abrirTarea(op)}><IcoEditar /></button>
                              <button type="button" className="dx-ofd-ib is-del" aria-label={`Quitar ${op.tarea}`} onClick={() => setModal({ tipo: 'quitar-tarea', operacion: op })}><IcoQuitar /></button>
                            </span>
                          )}
                        </div>
                      ))}
                      {editable && a.operaciones[0] && (
                        <div className="dx-ofd-add">
                          <button type="button" className="dx-ofd-addbtn"
                            onClick={() => abrirTarea(null, { familia_trabajo_id: a.operaciones[0].familia_trabajo_id, actividad_id: a.operaciones[0].actividad_id, posicion: String(a.operaciones[a.operaciones.length - 1].secuencia + 1) })}>
                            <IcoMas />Tarea en «{a.nombre}»
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
              {pestana === 'materiales' && !of.materiales.length && (
                <div className="dx-ofd-empty">
                  Esta OF no tiene materiales.
                  {editable && <div><button type="button" className="dx-ofd-addbtn" onClick={() => abrirMaterial()}><IcoMas />Agregar el primer material</button></div>}
                </div>
              )}
              {pestana === 'materiales' && of.materiales.length > 0 && (
                <div className="dx-ofd-mats">
                  {of.materiales.map(m => {
                    const opMat = of.operaciones.find(o => o.id === m.operacion_id);
                    const stock = editable && m.origen === 'stock' && materialPorId.has(m.material_id)
                      ? textoStock(materialPorId.get(m.material_id), m.cantidad) : null;
                    return (
                      <div className={`dx-ofd-mat${editable ? ' is-edit' : ''}`} key={m.id}>
                        <span className="dx-ofd-cell">
                          <span className="dx-ofd-strong">{m.descripcion}</span>
                          <span className="dx-ofd-muted">
                            {ORIGEN_MATERIAL[m.origen] || 'Sin dato'}{m.no_planificado ? ' · No planificado' : ''}
                            {opMat ? ` · ${opMat.secuencia} ${opMat.tarea}` : ''}
                          </span>
                          {m.no_planificado && m.motivo && <span className="dx-ofd-muted">Motivo: {m.motivo}</span>}
                          {stock && <span className={`dx-ofd-stock is-${stock.tono}`}>{stock.texto}</span>}
                          {!editable && verPartes && m.origen === 'stock' && reservas && (
                            <span className="dx-ofd-res">
                              {etiquetasReserva(reservaPorLinea.get(m.id), m.unidad).map(t => <span key={t.texto} className={`dx-ofd-tag is-${t.tono}`}>{t.texto}</span>)}
                            </span>
                          )}
                        </span>
                        <span className="dx-ofd-muted">{m.cantidad} {m.unidad || 'und'} × {formatearMonto(m.costo_unitario, moneda)}</span>
                        <span className="dx-ofd-money">{formatearMonto(m.subtotal, moneda)}</span>
                        {editable && (
                          <span className="dx-ofd-icons">
                            <button type="button" className="dx-ofd-ib" aria-label={`Editar ${m.descripcion}`} onClick={() => abrirMaterial(m)}><IcoEditar /></button>
                            <button type="button" className="dx-ofd-ib is-del" aria-label={`Quitar ${m.descripcion}`} onClick={() => setModal({ tipo: 'quitar-material', linea: m })}><IcoQuitar /></button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {pestana === 'partes' && !partes.length && (
                <div className="dx-ofd-empty">Aún no hay partes. Registra el avance de una operación con «Registrar avance».</div>
              )}
              {pestana === 'partes' && partes.length > 0 && (
                <div className="dx-ofd-mats dx-ofd-partes">
                  <div className="dx-ofd-parte is-head" aria-hidden="true"><span>Parte</span><span>Operación</span><span>Técnico</span><span className="is-r">Horas</span><span className="is-r">Avance</span><span>Estado</span><span /></div>
                  {partes.map(p => {
                    const av = p.estado === 'aprobado' ? p.avance_validado : p.avance_reportado;
                    return (
                      <div className="dx-ofd-parte" key={p.id}>
                        <span className="dx-ofd-p-num dx-ofd-cell"><span className="dx-ofd-mono">{p.numero || 'Sin número'}</span><span className="dx-ofd-muted">{formatearFecha(p.fecha)}</span></span>
                        <span className="dx-ofd-p-op dx-ofd-strong">{p.operacion ? `${p.secuencia} · ${p.operacion}` : 'Sin dato'}</span>
                        <span className="dx-ofd-p-tec dx-ofd-muted"><span className="dx-ofd-k">Técnico</span>{p.tecnico || 'Sin dato'}</span>
                        <span className="dx-ofd-p-hh is-r"><span className="dx-ofd-k">Horas</span>{p.horas} h</span>
                        <span className="dx-ofd-p-av is-r"><span className="dx-ofd-k">Avance</span>{av == null ? 'Sin dato' : `${av} %`}</span>
                        <span className="dx-ofd-p-st"><span className={`dx-ofd-opst is-p-${p.estado}`}><i />{ETIQUETA_PARTE[p.estado] || p.estado}</span></span>
                        <span className="dx-ofd-p-acc">
                          {p.estado === 'en_revision' && puedeRevisar && (
                            <button type="button" className="dx-ofd-mini" onClick={() => setModal({ tipo: 'revisar', parte: p })} aria-label={`Revisar ${p.numero || 'parte'}`}>Revisar</button>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {pestana === 'calidad' && (calidad
                ? <OFCalidadPanel calidad={calidad} resumen={resumenQ} onCambio={mensaje => recargar(mensaje)} />
                : <div className="dx-ofd-empty">Cargando la calidad de la OF…</div>)}
              {(pestana === 'ruta' || pestana === 'materiales') && !editable && !noPlanificado && of.estado !== 'anulada' && (
                <div className="dx-ofd-soon">{catalogo && !catalogo.puede_editar ? 'Tu rol puede ver esta OF, pero no editarla.' : 'Esta OF ya no admite cambios en la ruta ni en los materiales.'}</div>
              )}
            </div>
          </div>

          <aside className="dx-ofd-aside">
            {verEntrega && <OFEntregaPanel datos={entrega} of={{ ...of, garantia_meses: datosEntrega?.garantia_meses }} empresaId={empresaId} puedeEditar={Boolean(catalogo?.puede_editar)} onActualizado={() => recargar()} />}
            {calidad && ESTADOS_CON_CALIDAD.includes(of.estado) && (
              <div className="dx-ofd-card dx-ofd-box">
                <h2>Liberación</h2>
                <ul className="dx-ofq-check">
                  <li className={resumenQ.criticasOk === resumenQ.criticasTotal ? 'is-ok' : 'is-bad'}>{resumenQ.criticasOk === resumenQ.criticasTotal ? <IcoCheck /> : <IcoX />}<span>Críticas dentro de tolerancia ({resumenQ.criticasOk}/{resumenQ.criticasTotal})</span></li>
                  <li className={resumenQ.ncAbiertas ? 'is-bad' : 'is-ok'}>{resumenQ.ncAbiertas ? <IcoX /> : <IcoCheck />}<span>Sin no conformidades abiertas</span></li>
                  <li className="is-ok"><IcoCheck /><span>Las no críticas son opcionales</span></li>
                </ul>
                <p className="dx-ofd-muted dx-ofq-note">{calidad.liberadoEn ? `Liberada${calidad.liberadoPor ? ` por ${calidad.liberadoPor}` : ''} el ${formatearFecha(calidad.liberadoEn)}.` : 'Solo el permiso Calidad de OF registra mediciones, gestiona las NC y libera la OF.'}</p>
              </div>
            )}
            <div className="dx-ofd-card dx-ofd-box">
              <h2>Costos</h2>
              <dl className="dx-ofd-dl">
                <dt>Mano de obra y máquina</dt><dd>{formatearMonto(totales.mo, moneda)}</dd>
                <dt>Materiales</dt><dd>{formatearMonto(totales.mat, moneda)}</dd>
                <dt>Costo real</dt><dd>{formatearMonto(of.costo_real, moneda)}</dd>
              </dl>
              <div className="dx-ofd-total"><span>Costo estimado</span><b>{formatearMonto(of.costo_estimado, moneda)}</b></div>
            </div>
            {verPartes && (
              <div className="dx-ofd-card dx-ofd-box">
                <h2>Costo real</h2>
                {enProduccion ? (
                  <>
                    <dl className="dx-ofd-dl">
                      <dt>Mano de obra ({prod.horasReales} h)</dt><dd>{formatearMonto(prod.manoObra, moneda)}</dd>
                      <dt>Materiales despachados</dt><dd>{formatearMonto(prod.materiales, moneda)}</dd>
                    </dl>
                    <div className="dx-ofd-total"><span>Real a la fecha</span><b>{formatearMonto(of.costo_real, moneda)}</b></div>
                    {of.costo_estimado > 0 && (
                      <p className="dx-ofd-muted dx-ofd-note">{Math.round((of.costo_real / of.costo_estimado) * 100)} % del estimado con {prod.avance} % de avance.</p>
                    )}
                  </>
                ) : <p className="dx-ofd-muted dx-ofd-note">Se calcula con los partes aprobados y los materiales despachados.</p>}
              </div>
            )}
            <div className="dx-ofd-card dx-ofd-box">
              <h2>Origen</h2>
              <dl className="dx-ofd-dl">
                <dt>OS</dt><dd>{of.os?.numero || 'Sin dato'}</dd>
                <dt>Tipo de OS</dt><dd>{of.os?.tipo_ejecucion === 'mixto' ? 'Mixta' : of.os?.tipo_ejecucion === 'fabricacion' ? 'Fabricación' : 'Sin dato'}</dd>
                <dt>Hoja</dt><dd>{of.hoja?.numero || 'Sin hoja (OF armada a mano)'}</dd>
                <dt>Horas</dt><dd>{of.operaciones.length ? textoHoras(totales.horas, totales.horasMaq) : 'Sin dato'}</dd>
              </dl>
            </div>
          </aside>
        </div>
      </div>

      {modal?.tipo === 'tarea' && (
        <TareaModal of={of} operacion={modal.operacion} preset={modal.preset} catalogo={catalogo}
          onGuardar={(opId, datos) => guardarOperacionOF(of.id, opId, datos)}
          onClose={r => { cerrarModal(); if (r) recargar(r.sin_tarifa ? 'Tarea guardada. Su cargo no tiene tarifa: quedó sin costo de mano de obra.' : 'Tarea guardada.'); }} />
      )}
      {modal?.tipo === 'entrega' && <OFEntregaWizard of={of} empresaId={empresaId} datos={datosEntrega} onClose={cerrarModal} onEntregada={(r, falloPdf) => {
        cerrarModal(); setPestana('unidades'); recargar(`OF entregada. Acta ${r.numero} y guía ${r.guia_numero} emitidas.${falloPdf ? ' El PDF no se pudo generar; usa Reintentar PDF.' : ''}`);
      }} />}
      {modal?.tipo === 'material' && (
        <MaterialModal of={of} linea={modal.linea} noPlanificado={Boolean(modal.noPlanificado)}
          materiales={materialesCat} cargandoMateriales={cargandoMateriales}
          onGuardar={(lineaId, datos) => guardarMaterialOF(of.id, lineaId, datos)}
          onClose={r => {
            cerrarModal();
            if (!r) return;
            const falt = r.reserva?.faltantes?.some(f => f.of_material_id === r.id);
            recargar(r.sin_costo ? 'Material guardado. No tiene costo promedio: quedó en 0.'
              : r.reserva ? (falt ? 'Material agregado. No hay stock suficiente: lo que falta va a Compras (SOLPE).' : 'Material agregado y reservado.')
                : 'Material guardado.');
          }} />
      )}
      {modal?.tipo === 'quitar-tarea' && (
        <ConfirmarModal titulo={`¿Quitar la tarea ${modal.operacion.secuencia} · ${modal.operacion.tarea}?`} peligro accion="Quitar tarea"
          ayuda="Los materiales asociados a esta tarea quedan sin operación."
          onConfirmar={() => quitarOperacionOF(modal.operacion.id)}
          onClose={r => { cerrarModal(); if (r) recargar('Tarea quitada.'); }} />
      )}
      {modal?.tipo === 'quitar-material' && (
        <ConfirmarModal titulo={`¿Quitar ${modal.linea.descripcion}?`} peligro accion="Quitar material"
          onConfirmar={() => quitarMaterialOF(modal.linea.id)}
          onClose={r => { cerrarModal(); if (r) recargar('Material quitado.'); }} />
      )}
      {modal?.tipo === 'enviar-calidad' && (
        <ConfirmarModal titulo={`¿Enviar la ${of.numero} a calidad?`} accion="Enviar a calidad"
          ayuda={calidad?.ficha
            ? `Se copian las piezas y características de la ficha técnica v${calidad.ficha.version} para medirlas por unidad. La OF pasa a «En calidad».`
            : 'Esta OF no viene de un diagnóstico de fabricación con ficha técnica: pasa a «En calidad» sin mediciones.'}
          onConfirmar={() => enviarACalidadOF(of.id)}
          onClose={r => { cerrarModal(); if (r) { setPestana('calidad'); recargar('OF enviada a calidad.'); } }} />
      )}
      {modal?.tipo === 'liberar' && (
        <ConfirmarModal titulo={`¿Liberar la ${of.numero}?`} accion="Liberar OF"
          ayuda="La OF pasa a «Lista para entrega» y las mediciones quedan de solo lectura."
          filas={[
            ['Críticas dentro de tolerancia', `${resumenQ.criticasOk} de ${resumenQ.criticasTotal}`],
            ['No conformidades', `${(calidad?.noConformidades || []).length} (abiertas: ${resumenQ.ncAbiertas})`],
            ['Opcionales medidas', `${resumenQ.opcionalesMedidas} de ${resumenQ.opcionalesTotal}`],
          ]}
          onConfirmar={() => liberarOF(of.id)}
          onClose={r => { cerrarModal(); if (r) recargar('OF liberada: lista para entrega.'); }} />
      )}
      {modal?.tipo === 'anular' && (
        <AnularOFModal of={of} onAnular={motivo => anularOF(of.id, motivo)}
          onClose={r => { cerrarModal(); if (r) recargar(ESTADOS_AVANCE.includes(of.estado) ? 'OF anulada. Reservas liberadas.' : 'OF anulada.'); }} />
      )}
      {modal?.tipo === 'avance' && (
        <AvanceModal of={of} tecnicos={avanceCat?.tecnicos || []}
          onGuardar={datos => registrarParteOF(of.id, datos)}
          onClose={r => { cerrarModal(); if (r) { setPestana('partes'); recargar(`Parte ${r.numero || ''} enviado a revisión.`.replace('  ', ' ')); } }} />
      )}
      {modal?.tipo === 'revisar' && (
        <RevisarParteModal parte={modal.parte} moneda={moneda}
          onRevisar={(accion, avance, obs) => revisarParteOF(modal.parte.id, accion, avance, obs)}
          onClose={r => { cerrarModal(); if (r) recargar(r.estado === 'observado' ? 'Parte observado: el técnico debe registrar uno corregido.' : 'Parte aprobado: avance y costo real actualizados.'); }} />
      )}
      {modal?.tipo === 'aprobar' && (
        <ConfirmarModal titulo={`¿Aprobar la ${of.numero}?`} accion={resumen.materialesStock ? 'Aprobar y reservar' : 'Aprobar OF'}
          ayuda="Al aprobarla se reserva el stock y lo que falte se pide a Compras (SOLPE). Después la ruta y los materiales ya no se editan; solo se agregan materiales no planificados."
          filas={[
            ['Operaciones', resumen.operaciones ? `${resumen.operaciones} · ${textoHoras(resumen.horas, resumen.horasMaquina)}` : 'Ninguna: agrega al menos una tarea'],
            ['Se reservará', resumen.materialesStock ? `${resumen.materialesStock} ${resumen.materialesStock === 1 ? 'material de stock' : 'materiales de stock'}` : 'Ninguno'],
            ['Irá a Compras (sin stock suficiente hoy)', resumen.sinStockSuficiente.length ? resumen.sinStockSuficiente.join(', ') : 'Nada'],
            ['Costo estimado', formatearMonto(of.costo_estimado, moneda)],
          ]}
          onConfirmar={() => aprobarOF(of.id)}
          onClose={r => {
            cerrarModal();
            if (!r) return;
            const falt = r.reserva?.faltantes?.length || 0;
            recargar(r.reserva?.sin_almacen ? 'OF aprobada. No hay almacén de consumo interno: no se reservó stock.'
              : falt ? `OF aprobada. Stock reservado; ${falt} ${falt === 1 ? 'material va' : 'materiales van'} a Compras (SOLPE).`
                : r.reserva?.lineas ? 'OF aprobada y stock reservado.' : 'OF aprobada.');
          }} />
      )}
    </section>
  );
}
