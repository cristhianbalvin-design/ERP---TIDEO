import React, { useEffect, useMemo, useState } from 'react';
import { sanitizarSvgCatalogo } from '../dibujoHallazgoLogic.js';
import { firmarRutasPlanos } from '../../../services/diagnosticoFabricacionService.js';
import { abrirNoConformidadOF, cerrarNoConformidadOF, medirCalidadOF } from '../../../services/ordenFabricacionService.js';
import { Campo, ModalBase } from './OFModales.jsx';
import {
  DISPOSICIONES, ETIQUETA_DISPOSICION, claveMedicion, esConforme, leerNumero, limites, ncAbierta, piezasDeCalidad,
  resultadoUnidad, textoNominal, textoTolerancia,
} from './ofCalidadLogic.js';

const ETIQUETA_RESULTADO = { ok: 'OK', fuera: 'Fuera', concesion: 'Concesión', pendiente: 'Pendiente', opcional: 'Opcional' };
const IcoMas = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
const IcoCheck = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>;
const corto = n => (n === null || n === undefined ? '' : Number(n).toLocaleString('es-PE', { maximumFractionDigits: 4 }));

function Plano({ pieza, caracteristicas, porClave, ncs }) {
  const ficha = pieza.ficha;
  const [url, setUrl] = useState('');
  const [fallo, setFallo] = useState(false);
  const svg = useMemo(() => (ficha?.svg ? sanitizarSvgCatalogo(ficha.svg) : ''), [ficha?.svg]);
  useEffect(() => {
    let vivo = true;
    setUrl('');
    setFallo(false);
    if (!svg && ficha?.plano_imagen_ruta) {
      firmarRutasPlanos([ficha.plano_imagen_ruta])
        .then(mapa => { if (vivo) { const u = mapa.get(ficha.plano_imagen_ruta); if (u) setUrl(u); else setFallo(true); } })
        .catch(() => { if (vivo) setFallo(true); });
    }
    return () => { vivo = false; };
  }, [svg, ficha?.plano_imagen_ruta]);

  if (!svg && !url) {
    return <div className="dx-ofq-noplan">{fallo ? 'No se pudo abrir el plano de esta pieza.' : ficha ? 'Cargando el plano…' : 'Esta pieza no tiene plano en la ficha técnica.'}</div>;
  }
  return (
    <>
      <div className="dx-ofq-canvas">
        {svg ? <div className="dx-ofq-svg" dangerouslySetInnerHTML={{ __html: svg }} /> : <img src={url} alt={`Plano de ${pieza.nombre}`} />}
        {caracteristicas.filter(c => c.pos_x !== null && c.pos_y !== null).map(c => {
          const fuera = Array.from({ length: c.pieza_cantidad }, (_, i) => i + 1)
            .some(u => resultadoUnidad(c, porClave.get(claveMedicion(c.id, u)) ? { ...porClave.get(claveMedicion(c.id, u)), unidad: u } : null, ncs) === 'fuera');
          return <span key={c.id} className={`dx-ofq-pin${c.critica ? ' is-crit' : ''}${fuera ? ' is-bad' : ''}`} style={{ left: `${c.pos_x}%`, top: `${c.pos_y}%` }} aria-hidden="true">{c.numero}</span>;
        })}
      </div>
      <div className="dx-ofq-legend"><span><i className="is-crit" />Crítica</span><span><i />No crítica</span></div>
    </>
  );
}

function CeldaMedicion({ c, unidad, medicion, ncs, editable, onMedir, onNc }) {
  const abierta = ncAbierta(ncs, c.id, unidad);
  const r = resultadoUnidad(c, medicion ? { ...medicion, unidad } : null, ncs);
  const [texto, setTexto] = useState(medicion?.valor === null || medicion?.valor === undefined ? '' : String(medicion.valor));
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { setTexto(medicion?.valor === null || medicion?.valor === undefined ? '' : String(medicion.valor)); }, [medicion?.valor]);
  const bloqueada = !editable || Boolean(abierta) || guardando;
  const etiqueta = `${c.nombre}, unidad ${unidad}`;
  const guardar = async (valor, conforme = null) => {
    setGuardando(true);
    try { await onMedir(c, unidad, valor, conforme); } finally { setGuardando(false); }
  };
  const alSalir = () => {
    const actual = medicion?.valor ?? null;
    const nuevo = leerNumero(texto);
    if (texto.trim() !== '' && nuevo === null) { setTexto(actual === null ? '' : String(actual)); return; }
    if (nuevo === actual) return;
    guardar(nuevo);
  };
  return (
    <div className="dx-ofq-cell">
      <span className="dx-ofq-ulabel">Unidad #{unidad}</span>
      {c.tipo_control === 'medida' ? (
        <input inputMode="decimal" aria-label={etiqueta} value={texto} readOnly={bloqueada} placeholder="—"
          onChange={e => setTexto(e.target.value)} onBlur={alSalir}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      ) : (
        <select aria-label={etiqueta} className="dx-ofq-sel" disabled={bloqueada}
          value={medicion ? (medicion.conforme ? 'si' : 'no') : ''}
          onChange={e => guardar(null, e.target.value === '' ? null : e.target.value === 'si')}>
          <option value="">—</option><option value="si">Conforme</option><option value="no">No conforme</option>
        </select>
      )}
      <span className={`dx-ofq-res is-${r}`}>{abierta ? 'NC abierta' : ETIQUETA_RESULTADO[r]}</span>
      {r === 'fuera' && !abierta && editable && (
        <button type="button" className="dx-ofq-nclink" onClick={() => onNc(c, unidad)}>Registrar NC</button>
      )}
    </div>
  );
}

function NcModal({ pares, inicial, onClose }) {
  const [par, setPar] = useState(inicial ? claveMedicion(inicial.c.id, inicial.unidad) : (pares[0] ? claveMedicion(pares[0].c.id, pares[0].unidad) : ''));
  const actual = pares.find(p => claveMedicion(p.c.id, p.unidad) === par);
  const sugerida = actual ? (actual.c.tipo_control === 'medida'
    ? `${actual.c.nombre}: medido ${corto(actual.valor)} ${actual.c.unidad || ''}, fuera de ${textoTolerancia(actual.c)}.`.replace(/\s+/g, ' ')
    : `${actual.c.nombre}: no conforme.`) : '';
  const [descripcion, setDescripcion] = useState(sugerida);
  const [disposicion, setDisposicion] = useState('reprocesar');
  const [responsable, setResponsable] = useState('');
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  useEffect(() => { setDescripcion(sugerida); }, [par]); // eslint-disable-line react-hooks/exhaustive-deps
  const guardar = async () => {
    if (!actual) { setError('Elige la medición fuera de tolerancia.'); return; }
    if (!descripcion.trim()) { setError('Describe la no conformidad.'); return; }
    setTrabajando(true); setError('');
    try {
      const r = await abrirNoConformidadOF({ caracteristicaId: actual.c.id, unidad: actual.unidad, descripcion: descripcion.trim(), disposicion, responsable: responsable.trim() });
      onClose(r);
    } catch (err) { setError(err?.message || 'No se pudo registrar la NC.'); setTrabajando(false); }
  };
  return (
    <ModalBase titulo="Registrar no conformidad" ayuda="Se abre sobre una medición fuera de tolerancia y bloquea la liberación hasta cerrarla."
      sucio={!trabajando && descripcion !== sugerida} onClose={() => onClose()}
      pie={cerrar => (
        <>
          {error && <div className="dx-ofd-server" role="alert">{error}</div>}
          <div className="dx-ofd-modal-actions">
            <button type="button" className="dx-ofd-ghost" data-cerrar onClick={cerrar} disabled={trabajando}>Cancelar</button>
            <button type="button" className="dx-ofd-primary" onClick={guardar} disabled={trabajando || !actual}>{trabajando ? 'Registrando…' : 'Registrar NC'}</button>
          </div>
        </>
      )}>
      <div className="dx-ui-form-grid">
        <Campo id="ofq-nc-par" label="Medición" requerido completo>
          <select id="ofq-nc-par" className="dx-ui-select" value={par} onChange={e => setPar(e.target.value)}>
            {pares.map(p => (
              <option key={claveMedicion(p.c.id, p.unidad)} value={claveMedicion(p.c.id, p.unidad)}>
                {`${p.c.numero} · ${p.c.nombre} · Unidad #${p.unidad}${p.valor !== null && p.valor !== undefined ? ` · ${corto(p.valor)} ${p.c.unidad || ''}` : ''}`}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="ofq-nc-desc" label="Descripción" requerido completo>
          <textarea id="ofq-nc-desc" rows={2} value={descripcion} onChange={e => setDescripcion(e.target.value)} />
        </Campo>
        <div className="dx-ui-field dx-ui-field-full">
          <span className="dx-ofq-lbl">Disposición <span className="dx-ui-required">*</span></span>
          <div className="dx-ofq-disp" role="radiogroup" aria-label="Disposición">
            {DISPOSICIONES.map(d => (
              <label key={d.id} className={disposicion === d.id ? 'is-on' : ''}>
                <input type="radio" name="ofq-disp" value={d.id} checked={disposicion === d.id} onChange={() => setDisposicion(d.id)} />
                <span><b>{d.titulo}</b><small>{d.ayuda}</small></span>
              </label>
            ))}
          </div>
        </div>
        <Campo id="ofq-nc-resp" label="Responsable" completo ayuda="Quién ejecuta la corrección.">
          <input id="ofq-nc-resp" value={responsable} onChange={e => setResponsable(e.target.value)} maxLength={120} />
        </Campo>
      </div>
    </ModalBase>
  );
}

function CerrarNcModal({ nc, caracteristica, onClose }) {
  const concesion = nc.disposicion === 'concesion';
  const medida = caracteristica?.tipo_control === 'medida';
  const [accion, setAccion] = useState('');
  const [valor, setValor] = useState('');
  const [conforme, setConforme] = useState('si');
  const [evidencia, setEvidencia] = useState('');
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const l = caracteristica ? limites(caracteristica) : null;
  const okValor = medida && valor.trim() !== '' ? esConforme(caracteristica, valor) : null;
  const guardar = async () => {
    if (!accion.trim()) { setError('Describe la acción realizada.'); return; }
    if (concesion && !evidencia.trim()) { setError('Indica la evidencia de la aprobación del cliente.'); return; }
    if (!concesion && medida && leerNumero(valor) === null) { setError('Escribe la nueva medición.'); return; }
    setTrabajando(true); setError('');
    try {
      const r = await cerrarNoConformidadOF({
        ncId: nc.id, accion: accion.trim(), evidencia: concesion ? evidencia.trim() : null,
        valor: !concesion && medida ? leerNumero(valor) : null,
        conforme: !concesion && !medida ? conforme === 'si' : null,
      });
      onClose(r);
    } catch (err) { setError(err?.message || 'No se pudo cerrar la NC.'); setTrabajando(false); }
  };
  return (
    <ModalBase titulo={`Cerrar ${nc.numero}`} estrecho sucio={!trabajando && Boolean(accion || valor || evidencia)} onClose={() => onClose()}
      ayuda={concesion ? 'Se acepta la unidad fuera de tolerancia con la aprobación del cliente.' : 'La unidad debe volver a medirse dentro de tolerancia para cerrar la NC.'}
      pie={cerrar => (
        <>
          {error && <div className="dx-ofd-server" role="alert">{error}</div>}
          <div className="dx-ofd-modal-actions">
            <button type="button" className="dx-ofd-ghost" data-cerrar onClick={cerrar} disabled={trabajando}>Cancelar</button>
            <button type="button" className="dx-ofd-primary" onClick={guardar} disabled={trabajando}>{trabajando ? 'Cerrando…' : 'Cerrar NC'}</button>
          </div>
        </>
      )}>
      <div className="dx-ui-form-grid">
        {!concesion && caracteristica && (medida ? (
          <Campo id="ofq-cnc-valor" label={`Nueva medición · ${caracteristica.nombre} · Unidad #${nc.unidad}`} requerido completo
            error={okValor === false ? `Sigue fuera de tolerancia (${corto(l.min)} – ${corto(l.max)} ${caracteristica.unidad || ''}).` : ''}
            ayuda={l ? `Dentro de tolerancia: ${corto(l.min)} – ${corto(l.max)} ${caracteristica.unidad || ''}.` : ''}>
            <input id="ofq-cnc-valor" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} aria-invalid={okValor === false} />
          </Campo>
        ) : (
          <Campo id="ofq-cnc-conf" label={`Nueva revisión · Unidad #${nc.unidad}`} requerido completo>
            <select id="ofq-cnc-conf" className="dx-ui-select" value={conforme} onChange={e => setConforme(e.target.value)}>
              <option value="si">Conforme</option><option value="no">No conforme</option>
            </select>
          </Campo>
        ))}
        <Campo id="ofq-cnc-accion" label="Acción realizada" requerido completo>
          <textarea id="ofq-cnc-accion" rows={2} value={accion} onChange={e => setAccion(e.target.value)} />
        </Campo>
        {concesion && (
          <Campo id="ofq-cnc-evid" label="Evidencia de la aprobación del cliente" requerido completo ayuda="Por ejemplo: correo del 12/11 de J. Ramos aprobando la desviación.">
            <textarea id="ofq-cnc-evid" rows={2} value={evidencia} onChange={e => setEvidencia(e.target.value)} />
          </Campo>
        )}
      </div>
    </ModalBase>
  );
}

export function OFCalidadPanel({ calidad, resumen, onCambio }) {
  const [modal, setModal] = useState(null);
  const [error, setError] = useState('');
  const editable = calidad.estado === 'en_calidad' && calidad.puedeInspeccionar;
  const porClave = useMemo(() => new Map(calidad.mediciones.map(m => [claveMedicion(m.caracteristica_id, m.unidad), m])), [calidad.mediciones]);
  const piezas = useMemo(() => piezasDeCalidad(calidad.caracteristicas, calidad.ficha), [calidad.caracteristicas, calidad.ficha]);
  const ncs = calidad.noConformidades;
  const carPorId = useMemo(() => new Map(calidad.caracteristicas.map(c => [c.id, c])), [calidad.caracteristicas]);
  const paresFuera = useMemo(() => {
    const lista = [];
    calidad.caracteristicas.forEach(c => {
      for (let u = 1; u <= c.pieza_cantidad; u += 1) {
        const m = porClave.get(claveMedicion(c.id, u));
        if (m && !m.conforme && !ncAbierta(ncs, c.id, u) && resultadoUnidad(c, { ...m, unidad: u }, ncs) === 'fuera') lista.push({ c, unidad: u, valor: m.valor });
      }
    });
    return lista;
  }, [calidad.caracteristicas, porClave, ncs]);

  const medir = async (c, unidad, valor, conforme) => {
    setError('');
    try { await medirCalidadOF(c.id, unidad, valor, conforme); await onCambio(); }
    catch (err) { setError(err?.message || 'No se pudo guardar la medición.'); await onCambio(); }
  };
  const cerrarModal = r => { setModal(null); if (r) onCambio(r.numero ? `${r.numero} registrada.` : 'NC cerrada.'); };

  if (!calidad.caracteristicas.length) {
    return (
      <div className="dx-ofd-empty">
        {calidad.estado === 'en_calidad' || ['lista_entrega', 'entregada', 'cerrada'].includes(calidad.estado)
          ? 'Esta OF no tiene características de calidad: no viene de un diagnóstico de fabricación con ficha técnica.'
          : calidad.ficha
            ? `Al enviar a calidad se copian las características de la ficha técnica v${calidad.ficha.version} (${(calidad.ficha.piezas || []).length} ${(calidad.ficha.piezas || []).length === 1 ? 'pieza' : 'piezas'}).`
            : 'Esta OF no viene de un diagnóstico de fabricación con ficha técnica: se libera sin mediciones.'}
      </div>
    );
  }

  return (
    <div className="dx-ofq">
      <div className="dx-ofq-sum">
        <div className={resumen.criticasOk === resumen.criticasTotal ? 'is-ok' : ''}><span>Críticas OK</span><b>{resumen.criticasOk} / {resumen.criticasTotal}</b></div>
        <div className={resumen.fuera ? 'is-bad' : ''}><span>Fuera de tolerancia</span><b>{resumen.fuera}</b></div>
        <div className={resumen.ncAbiertas ? 'is-bad' : ''}><span>NC abiertas</span><b>{resumen.ncAbiertas}</b></div>
        <div><span>Opcionales medidas</span><b>{resumen.opcionalesMedidas} / {resumen.opcionalesTotal}</b></div>
      </div>
      {error && <div className="dx-ofd-server" role="alert">{error}</div>}
      {!editable && calidad.estado === 'en_calidad' && <div className="dx-ofd-soon">Tu rol puede ver la calidad de esta OF, pero no registrar mediciones.</div>}

      {piezas.map(p => (
        <section className="dx-ofq-piece" key={p.clave} aria-label={`Pieza ${p.nombre}`}>
          <header className="dx-ofq-phead">
            <h3>{p.orden} · {p.nombre}</h3>
            <span className="dx-ofd-tag">{p.cantidad} {p.cantidad === 1 ? 'unidad' : 'unidades'}</span>
            {p.ficha?.material?.descripcion && <span className="dx-ofd-muted">{p.ficha.material.descripcion}</span>}
          </header>
          <div className="dx-ofq-body">
            <div className="dx-ofq-plan"><Plano pieza={p} caracteristicas={p.caracteristicas} porClave={porClave} ncs={ncs} /></div>
            <div className="dx-ofq-table" role="table" aria-label={`Mediciones de ${p.nombre}`}>
              <div className="dx-ofq-row is-head" role="row" style={{ '--u': p.cantidad }}>
                <span role="columnheader">#</span><span role="columnheader">Característica</span><span role="columnheader">Nominal</span><span role="columnheader">Tolerancia</span>
                {Array.from({ length: p.cantidad }, (_, i) => <span role="columnheader" key={i}>Unidad #{i + 1}</span>)}
              </div>
              {p.caracteristicas.map(c => (
                <div className="dx-ofq-row" role="row" key={c.id} style={{ '--u': p.cantidad }}>
                  <span className={`dx-ofq-num${c.critica ? ' is-crit' : ''}`} role="cell">{c.numero}</span>
                  <div className="dx-ofq-char" role="cell"><b>{c.nombre}{c.critica && <span className="dx-ofq-crit">Crítica</span>}</b><small>{c.parte || '—'}</small></div>
                  <span className="dx-ofq-nom" role="cell">{textoNominal(c)}</span>
                  <span className="dx-ofq-tol" role="cell">{textoTolerancia(c)}</span>
                  {Array.from({ length: p.cantidad }, (_, i) => (
                    <div role="cell" key={i}>
                      <CeldaMedicion c={c} unidad={i + 1} medicion={porClave.get(claveMedicion(c.id, i + 1)) || null} ncs={ncs}
                        editable={editable} onMedir={medir} onNc={(car, u) => setModal({ tipo: 'nc', inicial: { c: car, unidad: u } })} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="dx-ofq-sec">
        <header>
          <h3>No conformidades</h3>
          {editable && (
            <button type="button" className="dx-ofd-ghost" disabled={!paresFuera.length} title={paresFuera.length ? '' : 'No hay mediciones fuera de tolerancia sin NC.'}
              onClick={() => setModal({ tipo: 'nc' })}><IcoMas />Registrar NC</button>
          )}
        </header>
        {!ncs.length && <p className="dx-ofd-muted">Sin no conformidades.</p>}
        {ncs.map(n => {
          const c = carPorId.get(n.caracteristica_id);
          const abierta = n.estado === 'abierta';
          return (
            <div className={`dx-ofq-nc${abierta ? ' is-open' : ''}`} key={n.id}>
              <h4>{n.numero} <span className={`dx-ofq-ncst is-${n.estado}`}><i />{abierta ? 'Abierta' : 'Cerrada'}</span></h4>
              <p>
                <b>{c ? `${c.nombre} · Unidad #${n.unidad}` : `Unidad #${n.unidad}`}</b>
                {n.valor_medido !== null && n.valor_medido !== undefined ? `: medido ${corto(n.valor_medido)} ${c?.unidad || ''}.` : '.'}
                {' '}{n.descripcion} Disposición: <b>{ETIQUETA_DISPOSICION[n.disposicion] || n.disposicion}</b>.
                {n.responsable ? ` Responsable: ${n.responsable}.` : ''}
                {!abierta && ` Cierre: ${n.accion_cierre || ''}${n.valor_cierre !== null && n.valor_cierre !== undefined ? ` (re-medido ${corto(n.valor_cierre)} ${c?.unidad || ''})` : ''}${n.evidencia ? `. Evidencia: ${n.evidencia}` : ''}.`}
              </p>
              {abierta && editable && <button type="button" className="dx-ofd-ghost" onClick={() => setModal({ tipo: 'cerrar', nc: n })}><IcoCheck />Cerrar NC</button>}
            </div>
          );
        })}
      </section>

      {modal?.tipo === 'nc' && <NcModal pares={paresFuera} inicial={modal.inicial} onClose={cerrarModal} />}
      {modal?.tipo === 'cerrar' && <CerrarNcModal nc={modal.nc} caracteristica={carPorId.get(modal.nc.caracteristica_id)} onClose={cerrarModal} />}
    </div>
  );
}
