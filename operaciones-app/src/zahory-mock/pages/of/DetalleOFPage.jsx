import React, { useEffect, useMemo, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { useCompactWorkMode } from '../../../useCompactWorkMode.js';
import {
  aprobarOF, guardarMaterialOF, guardarOperacionOF, listarMaterialesOF, obtenerCatalogoEdicionOF, obtenerOF,
  quitarMaterialOF, quitarOperacionOF,
} from '../../../services/ordenFabricacionService.js';
import { ETIQUETA_ESTADO_OF, formatearFecha, formatearMonto } from './ofBandejaLogic.js';
import { agruparRuta, textoHoras } from './ofCrearLogic.js';
import { admiteNoPlanificado, esEditable, materialDesdeLinea, resumenAprobacion, tareaDesdeOperacion, textoStock } from './ofFichaLogic.js';
import { ConfirmarModal, MaterialModal, TareaModal } from './OFModales.jsx';

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
const IcoCheck = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>;
const IcoInfo = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>;

export function DetalleOFPage({ onNav, routeParams = {}, ofIdRespaldo }) {
  useCompactWorkMode(true, { backLabel: 'Órdenes de Fabricación', onBack: () => onNav?.('maestranza-of') });
  const { estado: estadoSesion } = useSesionOperativa();
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
    obtenerOF(id)
      .then(fila => { if (vivo) { setOf(fila); if (!fila) setError('La OF no existe o no tienes acceso a ella.'); } })
      .catch(err => { if (vivo) setError(err?.message || 'No se pudo cargar la OF.'); })
      .finally(() => { if (vivo) setCargando(false); });
    // Catálogos para editar: si fallan, la ficha sigue en solo lectura.
    obtenerCatalogoEdicionOF(id).then(c => { if (vivo) setCatalogo(c); }).catch(() => {});
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
    const fila = await obtenerOF(id);
    setOf(fila);
    if (mensaje) setAviso(mensaje);
  };
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
          {puedeAprobar && (
            <div className="dx-ofd-hdr-actions">
              <button type="button" className="dx-ofd-primary" onClick={() => setModal({ tipo: 'aprobar' })}><IcoCheck />Aprobar OF</button>
            </div>
          )}
        </div>
        {aviso && <div className="dx-ofd-toast" role="status">{aviso}</div>}
        {editable && (
          <div className="dx-ofd-notice"><IcoInfo /><div>Revisa la ruta y los materiales. Al <b>aprobar</b>, la ruta queda fija y después solo se agregan materiales no planificados.</div></div>
        )}
        {of.estado === 'aprobada' && (
          <div className="dx-ofd-notice"><IcoInfo /><div>La OF está <b>aprobada</b>: la ruta ya no se edita. La reserva de stock y el registro de avance llegan en las siguientes entregas.</div></div>
        )}

        {of.estado === 'anulada'
          ? <div className="dx-ofd-anulada" role="status">Esta OF está anulada.</div>
          : (
            <ol className="dx-ofd-tl" aria-label="Estado de la OF">
              {LINEA_TIEMPO.map(([k, etiqueta], i) => (
                <li key={k} className={i < indiceEstado ? 'is-done' : i === indiceEstado ? 'is-now' : ''} aria-current={i === indiceEstado ? 'step' : undefined}>
                  <i />{etiqueta}
                </li>
              ))}
            </ol>
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
                      <div className={`dx-ofd-op is-head${editable ? ' is-edit' : ''}`} aria-hidden="true"><span>#</span><span>Tarea</span><span>Cargo</span><span>Horas</span><span>Equipo</span><span>Bahía</span><span className="is-r">{editable ? 'Costo' : 'Estado'}</span>{editable && <span />}</div>
                      {a.operaciones.map(op => (
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
              {!editable && !noPlanificado && of.estado !== 'anulada' && (
                <div className="dx-ofd-soon">{catalogo && !catalogo.puede_editar ? 'Tu rol puede ver esta OF, pero no editarla.' : 'Esta OF ya no admite cambios en la ruta ni en los materiales.'}</div>
              )}
            </div>
          </div>

          <aside className="dx-ofd-aside">
            <div className="dx-ofd-card dx-ofd-box">
              <h2>Costos</h2>
              <dl className="dx-ofd-dl">
                <dt>Mano de obra y máquina</dt><dd>{formatearMonto(totales.mo, moneda)}</dd>
                <dt>Materiales</dt><dd>{formatearMonto(totales.mat, moneda)}</dd>
                <dt>Costo real</dt><dd>{formatearMonto(of.costo_real, moneda)}</dd>
              </dl>
              <div className="dx-ofd-total"><span>Costo estimado</span><b>{formatearMonto(of.costo_estimado, moneda)}</b></div>
            </div>
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
      {modal?.tipo === 'material' && (
        <MaterialModal of={of} linea={modal.linea} noPlanificado={Boolean(modal.noPlanificado)}
          materiales={materialesCat} cargandoMateriales={cargandoMateriales}
          onGuardar={(lineaId, datos) => guardarMaterialOF(of.id, lineaId, datos)}
          onClose={r => { cerrarModal(); if (r) recargar(r.sin_costo ? 'Material guardado. No tiene costo promedio: quedó en 0.' : 'Material guardado.'); }} />
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
      {modal?.tipo === 'aprobar' && (
        <ConfirmarModal titulo={`¿Aprobar la ${of.numero}?`} accion="Aprobar OF"
          ayuda="Después de aprobarla, la ruta y los materiales ya no se editan; solo se agregan materiales no planificados."
          filas={[
            ['Operaciones', resumen.operaciones ? `${resumen.operaciones} · ${textoHoras(resumen.horas, resumen.horasMaquina)}` : 'Ninguna: agrega al menos una tarea'],
            ['Materiales de stock', resumen.materialesStock ? String(resumen.materialesStock) : 'Ninguno'],
            ['Sin stock suficiente hoy', resumen.sinStockSuficiente.length ? resumen.sinStockSuficiente.join(', ') : 'Ninguno'],
            ['Costo estimado', formatearMonto(of.costo_estimado, moneda)],
          ]}
          onConfirmar={() => aprobarOF(of.id)}
          onClose={r => { cerrarModal(); if (r) recargar('OF aprobada.'); }} />
      )}
    </section>
  );
}
