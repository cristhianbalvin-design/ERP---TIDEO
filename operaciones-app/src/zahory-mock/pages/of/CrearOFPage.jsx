import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { useCompactWorkMode } from '../../../useCompactWorkMode.js';
import { crearOFDesdeOS, listarOSElegiblesOF, vistaPreviaOF } from '../../../services/ordenFabricacionService.js';
import { formatearFecha, formatearMonto } from './ofBandejaLogic.js';
import { agruparRuta, filtrarOS, modoCreacion, textoHoras, totalesVistaPrevia } from './ofCrearLogic.js';

const ICONOS = {
  atras: <path d="M15 18l-6-6 6-6" />,
  buscar: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  doc: <><path d="M6 3h9l5 5v13H6z" /><path d="M14 3v6h6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  alerta: <><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>,
};
const Svg = ({ id }) => <svg viewBox="0 0 24 24" aria-hidden="true">{ICONOS[id]}</svg>;

const TIPO = { fabricacion: ['Fabricación', 'is-fab'], mixto: ['Mixta', 'is-mix'] };
const TipoPill = ({ tipo }) => {
  const [txt, cls] = TIPO[tipo] || ['Sin definir', ''];
  return <span className={`dx-ofn-pill ${cls}`}>{txt}</span>;
};

export function CrearOFPage({ onNav, routeParams = {} }) {
  useCompactWorkMode(true, { backLabel: 'Órdenes de Fabricación', onBack: () => onNav?.('maestranza-of') });
  const { empresaId, estado: estadoSesion } = useSesionOperativa();
  const [elegibles, setElegibles] = useState([]);
  const [cargandoOS, setCargandoOS] = useState(true);
  const [errorOS, setErrorOS] = useState('');
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [osId, setOsId] = useState(routeParams.os || '');
  const [vista, setVista] = useState(null);
  const [cargandoVista, setCargandoVista] = useState(false);
  const [errorCampo, setErrorCampo] = useState('');
  const [errorServidor, setErrorServidor] = useState('');
  const [creando, setCreando] = useState(false);
  const inputRef = useRef(null);
  const campoRef = useRef(null);
  const solicitud = useRef(0);

  useEffect(() => {
    if (estadoSesion !== 'listo' || !empresaId) return;
    setCargandoOS(true);
    listarOSElegiblesOF(empresaId)
      .then(setElegibles)
      .catch(err => setErrorOS(err?.message || 'No se pudieron cargar las OS.'))
      .finally(() => setCargandoOS(false));
  }, [empresaId, estadoSesion]);

  useEffect(() => {
    setVista(null);
    setErrorServidor('');
    if (!osId || estadoSesion !== 'listo') return;
    const id = ++solicitud.current;
    setCargandoVista(true);
    vistaPreviaOF(osId)
      .then(v => { if (id === solicitud.current) setVista(v); })
      .catch(err => { if (id === solicitud.current) { setOsId(''); setErrorCampo(err?.message || 'No se pudo leer la OS.'); } })
      .finally(() => { if (id === solicitud.current) setCargandoVista(false); });
  }, [osId, estadoSesion]);

  useEffect(() => {
    if (!abierto) return undefined;
    const cerrar = e => { if (campoRef.current && !e.composedPath().includes(campoRef.current)) setAbierto(false); };
    document.addEventListener('pointerdown', cerrar, true);
    return () => document.removeEventListener('pointerdown', cerrar, true);
  }, [abierto]);

  const opciones = useMemo(() => filtrarOS(elegibles, texto), [elegibles, texto]);
  const modo = modoCreacion(vista);
  const copiar = modo !== 'adicional';
  const totales = totalesVistaPrevia(vista, copiar);
  const ruta = useMemo(() => agruparRuta(copiar ? vista?.operaciones : []), [vista, copiar]);
  const moneda = vista?.os?.moneda || 'PEN';

  const elegir = os => {
    setOsId(os.id);
    setTexto('');
    setAbierto(false);
    setErrorCampo('');
  };
  const cambiarOS = () => {
    setOsId('');
    setVista(null);
    setTimeout(() => { inputRef.current?.focus(); setAbierto(true); }, 0);
  };
  const teclas = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAbierto(true); setActivo(i => Math.min(i + 1, opciones.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && abierto && opciones[activo]) { e.preventDefault(); elegir(opciones[activo]); }
    if (e.key === 'Escape') setAbierto(false);
  };

  const crear = async () => {
    setErrorServidor('');
    if (!osId || !vista) {
      setErrorCampo('Elige la OS de la que nace la OF.');
      inputRef.current?.focus();
      return;
    }
    setCreando(true);
    try {
      const of = await crearOFDesdeOS(osId, copiar);
      onNav?.('maestranza-of', { creada: of.numero || 'OF' });
    } catch (err) {
      setErrorServidor(err?.message || 'No se pudo crear la OF.');
    } finally {
      setCreando(false);
    }
  };

  const os = vista?.os;
  const resumen = [
    ['Cliente', os?.cliente],
    ['Componente', os?.componente],
    ['Compromiso', os?.fecha_compromiso ? formatearFecha(os.fecha_compromiso) : ''],
    ['Moneda', os ? (moneda === 'USD' ? 'Dólares (USD)' : moneda === 'PEN' ? 'Soles (PEN)' : moneda) : ''],
    ['Operaciones', vista ? `${totales.operaciones} ${totales.operaciones === 1 ? 'operación' : 'operaciones'}` : ''],
    ['Horas', totales.operaciones ? textoHoras(totales.horas, totales.horasMaquina) : ''],
  ];

  return (
    <section className="dx-ofn">
      <div className="dx-ofn-in">
        <button type="button" className="dx-ofn-back" onClick={() => onNav?.('maestranza-of')}><Svg id="atras" />Órdenes de Fabricación</button>
        <div className="dx-ofn-top">
          <div>
            <div className="dx-ofn-eyebrow">Producción</div>
            <h1 className="dx-ofn-title">Nueva Orden de Fabricación</h1>
            <p className="dx-ofn-sub">La OF toma los datos de la OS y copia la ruta y los materiales de los Trabajos de fabricación de su hoja.</p>
          </div>
        </div>

        <div className="dx-ofn-grid">
          <div className="dx-ofn-main">
            <div className="dx-ofn-card">
              <div className="dx-ofn-sec">
                <h2><span className="dx-ofn-n">1</span>Orden de servicio</h2>
                <p className="dx-ofn-help">Solo OS de fabricación o mixtas, activas.</p>
                {!osId && (
                  <div className="dx-ofn-field" ref={campoRef}>
                    <label htmlFor="dx-ofn-os">OS cliente <span className="dx-ofn-req" aria-hidden="true">*</span></label>
                    <div className={`dx-ofn-combo ${errorCampo ? 'is-error' : ''}`}>
                      <Svg id="buscar" />
                      <input
                        id="dx-ofn-os"
                        ref={inputRef}
                        role="combobox"
                        aria-expanded={abierto}
                        aria-controls="dx-ofn-os-lista"
                        aria-required="true"
                        aria-invalid={Boolean(errorCampo)}
                        autoComplete="off"
                        placeholder={cargandoOS ? 'Cargando OS…' : 'Buscar por número, cliente o descripción'}
                        value={texto}
                        onFocus={() => setAbierto(true)}
                        onChange={e => { setTexto(e.target.value); setActivo(0); setAbierto(true); }}
                        onKeyDown={teclas}
                      />
                    </div>
                    {errorCampo && <span className="dx-ofn-ferr">{errorCampo}</span>}
                    {abierto && (
                      <div className="dx-ofn-pop" id="dx-ofn-os-lista" role="listbox">
                        {cargandoOS && <div className="dx-ofn-popmsg">Cargando OS…</div>}
                        {!cargandoOS && errorOS && <div className="dx-ofn-popmsg is-error">{errorOS}</div>}
                        {!cargandoOS && !errorOS && !elegibles.length && (
                          <div className="dx-ofn-popmsg">No hay OS de fabricación o mixtas activas. Marca el tipo de ejecución en la OS.</div>
                        )}
                        {!cargandoOS && elegibles.length > 0 && !opciones.length && <div className="dx-ofn-popmsg">Ninguna OS coincide con «{texto}».</div>}
                        {opciones.map((o, i) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected={i === activo}
                            key={o.id}
                            className={`dx-ofn-opt ${i === activo ? 'is-act' : ''}`}
                            onMouseEnter={() => setActivo(i)}
                            onClick={() => elegir(o)}
                          >
                            <span className="dx-ofn-strong">{o.numero} · {o.cliente || 'Sin cliente'}</span>
                            <TipoPill tipo={o.tipo_ejecucion} />
                            <span className="dx-ofn-muted">
                              {o.nombre || 'Sin descripción'} · {o.hoja_numero ? `Hoja ${o.hoja_numero}` : 'Sin hoja de costeo'}
                              {o.ofs ? ` · ${o.ofs} OF creada${o.ofs === 1 ? '' : 's'}` : ''}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {osId && (
                  <div className="dx-ofn-resolved">
                    <span className="dx-ofn-doc"><Svg id="doc" /></span>
                    <div className="dx-ofn-cell">
                      <span className="dx-ofn-strong">{os ? `${os.numero} · ${os.cliente || 'Sin cliente'}` : 'Cargando OS…'}</span>
                      <span className="dx-ofn-muted">{os ? `${os.nombre || 'Sin descripción'} · Compromiso ${formatearFecha(os.fecha_compromiso)}` : ''}</span>
                    </div>
                    {os && <TipoPill tipo={os.tipo_ejecucion} />}
                    <button type="button" className="dx-ofn-link" onClick={cambiarOS}>Cambiar</button>
                  </div>
                )}
                {modo === 'adicional' && (
                  <div className="dx-ofn-notice"><Svg id="alerta" /><div>Esta OS ya tiene la <b>{vista.of_existente.numero}</b> con el plan de la hoja. Se creará una <b>OF adicional vacía</b>, sin copiar la hoja, para armar su ruta a mano.</div></div>
                )}
              </div>

              <div className="dx-ofn-sec">
                <h2><span className="dx-ofn-n">2</span>Lo que se copiará de la hoja</h2>
                {!osId && <p className="dx-ofn-help">Elige una OS para ver la ruta y los materiales que tendrá la OF.</p>}
                {osId && cargandoVista && <p className="dx-ofn-help">Cargando la vista previa…</p>}
                {vista && modo === 'adicional' && <p className="dx-ofn-help">No se copia nada: la OF adicional nace sin operaciones ni materiales.</p>}
                {vista && modo === 'sin_hoja' && <div className="dx-ofn-notice is-info"><Svg id="info" /><div>La OS no tiene Hoja de Costeo. La OF se crea <b>vacía</b> y su ruta se arma a mano.</div></div>}
                {vista && modo === 'hoja_sin_fabricacion' && <div className="dx-ofn-notice is-info"><Svg id="info" /><div>La hoja <b>{vista.hoja.numero}</b> no tiene Trabajos marcados como Fabricación. La OF se crea <b>vacía</b>.</div></div>}
                {vista && modo === 'copiar' && (
                  <>
                    <div className="dx-ofn-notice is-info"><Svg id="info" /><div>Hoja <b>{vista.hoja.numero}</b> · solo los Trabajos de <b>Fabricación (OF)</b>. La bahía sale del equipo de cada tarea; si no tiene equipo, la asigna el Planner.</div></div>
                    {ruta.map(t => (
                      <div className="dx-ofn-trab" key={t.nombre}>
                        <div className="dx-ofn-trab-h"><b>{t.nombre}</b><span className="dx-ofn-pill is-fab">Fabricación (OF)</span><span className="dx-ofn-muted dx-ofn-right">{t.tareas} {t.tareas === 1 ? 'tarea' : 'tareas'} · {textoHoras(t.horas, t.horasMaquina)}</span></div>
                        {t.actividades.map(a => (
                          <div key={a.nombre}>
                            <div className="dx-ofn-act">Actividad · {a.nombre}</div>
                            <div className="dx-ofn-op is-head" aria-hidden="true"><span>#</span><span>Tarea</span><span>Cargo</span><span>Horas</span><span>Equipo</span><span>Bahía</span><span className="is-r">Costo</span></div>
                            {a.operaciones.map(op => (
                              <div className="dx-ofn-op" key={op.linea_id}>
                                <span className="dx-ofn-o-seq dx-ofn-seq">{op.secuencia}</span>
                                <span className="dx-ofn-o-tar dx-ofn-strong">{op.tarea}</span>
                                <span className="dx-ofn-o-car dx-ofn-muted"><span className="dx-ofn-k">Cargo</span>{op.cargo || 'Sin dato'}</span>
                                <span className="dx-ofn-o-hh"><span className="dx-ofn-k">Horas</span>{Number(op.horas) || 0} h{op.horas_maquina ? ` · ${op.horas_maquina} h-máq.` : ''}</span>
                                <span className="dx-ofn-o-eq dx-ofn-muted"><span className="dx-ofn-k">Equipo</span>{op.equipo || 'Sin equipo'}</span>
                                <span className="dx-ofn-o-bah"><span className="dx-ofn-k">Bahía</span>{op.bahia ? <span className="dx-ofn-tag">{op.bahia}</span> : <span className="dx-ofn-tag is-warn">La asigna el Planner</span>}</span>
                                <span className="dx-ofn-o-cost dx-ofn-money">{formatearMonto(op.costo, moneda)}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    ))}
                    <h3 className="dx-ofn-h3">Materiales</h3>
                    {!vista.materiales.length && <div className="dx-ofn-empty">La hoja no tiene materiales en estos Trabajos. Podrás agregarlos en la OF.</div>}
                    {vista.materiales.length > 0 && (
                      <div className="dx-ofn-mats">
                        {vista.materiales.map((m, i) => (
                          <div className="dx-ofn-mat" key={i}>
                            <span className="dx-ofn-strong">{m.descripcion}</span>
                            <span className="dx-ofn-muted">{Number(m.cantidad) || 0} {m.unidad || 'und'} × {formatearMonto(m.costo_unitario, moneda)}</span>
                            <span className="dx-ofn-money">{formatearMonto(m.subtotal, moneda)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="dx-ofn-foot">
              {errorServidor && <div className="dx-ofn-serr" role="alert">{errorServidor}</div>}
              <button type="button" className="dx-ofn-ghost" onClick={() => onNav?.('maestranza-of')}>Cancelar</button>
              <button type="button" className="dx-ofn-primary" disabled={creando || cargandoVista} onClick={crear}>
                {creando ? 'Creando…' : modo === 'adicional' ? 'Crear OF adicional' : 'Crear OF'}
              </button>
            </div>
          </div>

          <aside className="dx-ofn-aside">
            <div className="dx-ofn-card dx-ofn-box">
              <h3>Resumen de la OF</h3>
              <dl className="dx-ofn-dl">
                {resumen.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v || 'Sin dato'}</dd></React.Fragment>)}
              </dl>
              <div className="dx-ofn-total"><span>Costo estimado</span><b>{formatearMonto(totales.costo, moneda)}</b></div>
            </div>
            <div className="dx-ofn-card dx-ofn-box dx-ofn-note">
              La OF se crea en <b>Borrador</b> con el número siguiente (OF-AA-NNNN). La ruta y los materiales se editan en la ficha de la OF.
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
