import React, { useEffect, useMemo, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { useCompactWorkMode } from '../../../useCompactWorkMode.js';
import { obtenerOF } from '../../../services/ordenFabricacionService.js';
import { ETIQUETA_ESTADO_OF, formatearFecha, formatearMonto } from './ofBandejaLogic.js';
import { agruparRuta, textoHoras } from './ofCrearLogic.js';

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

export function DetalleOFPage({ onNav, routeParams = {}, ofIdRespaldo }) {
  useCompactWorkMode(true, { backLabel: 'Órdenes de Fabricación', onBack: () => onNav?.('maestranza-of') });
  const { estado: estadoSesion } = useSesionOperativa();
  const id = routeParams.id || ofIdRespaldo || '';
  const [of, setOf] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [pestana, setPestana] = useState('ruta');

  useEffect(() => {
    if (estadoSesion !== 'listo') return undefined;
    let vivo = true;
    if (!id) { setCargando(false); setError('No se indicó qué OF abrir.'); return undefined; }
    setCargando(true);
    setError('');
    setPestana('ruta');
    obtenerOF(id)
      .then(fila => { if (vivo) { setOf(fila); if (!fila) setError('La OF no existe o no tienes acceso a ella.'); } })
      .catch(err => { if (vivo) setError(err?.message || 'No se pudo cargar la OF.'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [id, estadoSesion]);

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
        </div>

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

            <div className="dx-ofd-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={pestana === 'ruta'} className={pestana === 'ruta' ? 'is-on' : ''} onClick={() => setPestana('ruta')}>
                Ruta · {of.operaciones.length}
              </button>
              <button type="button" role="tab" aria-selected={pestana === 'materiales'} className={pestana === 'materiales' ? 'is-on' : ''} onClick={() => setPestana('materiales')}>
                Materiales · {of.materiales.length}
              </button>
            </div>

            <div className="dx-ofd-panel" role="tabpanel">
              {pestana === 'ruta' && !of.operaciones.length && (
                <div className="dx-ofd-empty">Esta OF aún no tiene operaciones.</div>
              )}
              {pestana === 'ruta' && ruta.map(t => (
                <div className="dx-ofd-trab" key={t.nombre}>
                  <div className="dx-ofd-trab-h"><b>{t.nombre}</b><span className="dx-ofd-muted dx-ofd-right">{t.tareas} {t.tareas === 1 ? 'tarea' : 'tareas'} · {textoHoras(t.horas, t.horasMaquina)}</span></div>
                  {t.actividades.map(a => (
                    <div key={a.nombre}>
                      <div className="dx-ofd-act">Actividad · {a.nombre}</div>
                      <div className="dx-ofd-op is-head" aria-hidden="true"><span>#</span><span>Tarea</span><span>Cargo</span><span>Horas</span><span>Equipo</span><span>Bahía</span><span className="is-r">Estado</span></div>
                      {a.operaciones.map(op => (
                        <div className="dx-ofd-op" key={op.id}>
                          <span className="dx-ofd-o-seq dx-ofd-seq">{op.secuencia}</span>
                          <span className="dx-ofd-o-tar dx-ofd-strong">{op.tarea}</span>
                          <span className="dx-ofd-o-car dx-ofd-muted"><span className="dx-ofd-k">Cargo</span>{op.cargo || 'Sin dato'}</span>
                          <span className="dx-ofd-o-hh"><span className="dx-ofd-k">Horas</span>{op.horas} h{op.horas_maquina ? ` · ${op.horas_maquina} h-máq.` : ''}</span>
                          <span className="dx-ofd-o-eq dx-ofd-muted"><span className="dx-ofd-k">Equipo</span>{op.equipo || 'Sin equipo'}</span>
                          <span className="dx-ofd-o-bah"><span className="dx-ofd-k">Bahía</span>{op.bahia ? <span className="dx-ofd-tag">{op.bahia}</span> : <span className="dx-ofd-tag is-warn">La asigna el Planner</span>}</span>
                          <span className="dx-ofd-o-st"><span className={`dx-ofd-opst is-${op.estado}`}><i />{ESTADO_OPERACION[op.estado] || op.estado}</span></span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
              {pestana === 'materiales' && !of.materiales.length && (
                <div className="dx-ofd-empty">Esta OF no tiene materiales.</div>
              )}
              {pestana === 'materiales' && of.materiales.length > 0 && (
                <div className="dx-ofd-mats">
                  {of.materiales.map(m => (
                    <div className="dx-ofd-mat" key={m.id}>
                      <span className="dx-ofd-cell">
                        <span className="dx-ofd-strong">{m.descripcion}</span>
                        <span className="dx-ofd-muted">{ORIGEN_MATERIAL[m.origen] || 'Sin dato'}{m.no_planificado ? ' · No planificado' : ''}</span>
                      </span>
                      <span className="dx-ofd-muted">{m.cantidad} {m.unidad || 'und'} × {formatearMonto(m.costo_unitario, moneda)}</span>
                      <span className="dx-ofd-money">{formatearMonto(m.subtotal, moneda)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="dx-ofd-soon">La edición de la ruta y los materiales y el avance por partes llegan en la siguiente fase (F3).</div>
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
    </section>
  );
}
