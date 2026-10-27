import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { aprobarConteo, cerrarConteo, guardarConteo, iniciarConteo, listarConteos } from '../../../services/wmsMultipropositoService.js';
import { AvisoSoloLectura, Encabezado, PaginaPrevia } from './WmsComun.jsx';
import { estadoPrevio, mensajeError, useWmsBase } from './useWmsBase.js';
import { ESTADOS_CONTEO, formatoCantidad, formatoMoneda, resumenConteo } from './wmsMultiLogic.js';

const TIPOS = { zona: 'Por zona', ciclico: 'Cíclico ABC', total: 'Total' };
const PASOS = ['Planificado', 'Contando', 'Revisión', 'Ajustado'];
const pasoActual = estado => ({ en_proceso: 1, por_aprobar: 2, cerrado: 3 }[estado] ?? 0);
const nuevoForm = almacenes => ({ almacen_id: almacenes[0]?.id || '', tipo: 'zona', nombre: '', ubicacion_prefijo: '', clase: 'A' });

export function ConteosPage() {
  const base = useWmsBase();
  const { empresaId, permisos, puede, almacenes, sesion, config, sociedadId } = base;
  const [conteos, setConteos] = useState([]);
  const [seleccion, setSeleccion] = useState('');
  const [contados, setContados] = useState({});
  const [ciego, setCiego] = useState(true);
  const [escaneo, setEscaneo] = useState('');
  const [form, setForm] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const inputs = useRef({});

  const cargar = useCallback(async (mantener = '') => {
    if (!empresaId || !permisos.ver) return;
    setCargando(true); setError('');
    try {
      const lista = await listarConteos({ empresa_id: empresaId });
      setConteos(lista || []);
      const sel = (lista || []).find(c => c.id === mantener);
      if (sel) setContados(Object.fromEntries((sel.items || []).map((it, i) => [i, it.fisico ?? ''])));
    } catch (e) { setError(mensajeError(e)); }
    finally { setCargando(false); }
  }, [empresaId, permisos.ver]);
  useEffect(() => { cargar(); }, [cargar]);

  const conteo = conteos.find(c => c.id === seleccion) || null;
  const itemsVivos = useMemo(() => (conteo?.items || []).map((it, i) => ({ ...it, fisico: contados[i] === '' || contados[i] === undefined ? null : Number(String(contados[i]).replace(',', '.')) })), [conteo, contados]);
  const resumen = useMemo(() => resumenConteo(itemsVivos), [itemsVivos]);
  const editable = conteo?.estado === 'en_proceso' && puede.crear;
  const nombreAlmacen = id => { const a = almacenes.find(x => x.id === id); return a ? `${a.codigo} · ${a.nombre}` : '—'; };

  const abrir = c => {
    setSeleccion(c.id); setError(''); setAviso(''); setEscaneo('');
    setContados(Object.fromEntries((c.items || []).map((it, i) => [i, it.fisico ?? ''])));
  };

  const crear = async e => {
    e.preventDefault();
    if (!form.almacen_id) { setError('Elige el almacén a contar.'); return; }
    setOcupado(true); setError('');
    try {
      const r = await iniciarConteo({
        empresa_id: empresaId, almacen_id: form.almacen_id, sociedad_id: sociedadId, tipo: form.tipo, nombre: form.nombre.trim(),
        ubicacion_prefijo: form.tipo === 'zona' ? form.ubicacion_prefijo.trim() : null, clase: form.tipo === 'ciclico' ? form.clase : null,
      });
      setForm(null); setAviso(`Conteo ${r?.codigo} creado con ${r?.items} líneas.`);
      await cargar(r?.id); setSeleccion(r?.id || '');
    } catch (er) { setError(mensajeError(er)); }
    finally { setOcupado(false); }
  };

  const payloadContados = () => Object.entries(contados).map(([idx, fisico]) => ({ idx: Number(idx), fisico: fisico === '' ? null : Number(String(fisico).replace(',', '.')) }));
  const guardar = async () => {
    if (payloadContados().some(x => x.fisico !== null && (!Number.isFinite(x.fisico) || x.fisico < 0))) { setError('Hay cantidades contadas no válidas.'); return false; }
    setOcupado(true); setError('');
    try { await guardarConteo({ empresa_id: empresaId, conteo_id: conteo.id, contados: payloadContados() }); setAviso('Avance guardado.'); await cargar(conteo.id); return true; }
    catch (er) { setError(mensajeError(er)); return false; }
    finally { setOcupado(false); }
  };
  const cerrar = async () => {
    if (resumen.pendientes) { setError(`Faltan ${resumen.pendientes} líneas por contar.`); return; }
    if (!(await guardar())) return;
    setOcupado(true);
    try {
      const r = await cerrarConteo({ empresa_id: empresaId, conteo_id: conteo.id });
      setAviso(r?.estado === 'por_aprobar'
        ? `Las diferencias suman ${formatoMoneda(r.valor_diferencias)} y superan el umbral de ${formatoMoneda(r.umbral)}: el conteo queda por aprobar por otra persona.`
        : `Conteo cerrado. Se registraron ${r?.ajustes || 0} ajustes en el kardex.`);
      await cargar(conteo.id);
    } catch (er) { setError(mensajeError(er)); }
    finally { setOcupado(false); }
  };
  const decidir = async aprobar => {
    setOcupado(true); setError('');
    try {
      const r = await aprobarConteo({ empresa_id: empresaId, conteo_id: conteo.id, aprobar });
      setAviso(aprobar ? `Ajustes aprobados: ${r?.ajustes || 0} movimientos en el kardex.` : 'Conteo devuelto para recontar.');
      await cargar(conteo.id);
    } catch (er) { setError(mensajeError(er)); }
    finally { setOcupado(false); }
  };
  const escanear = e => {
    e.preventDefault();
    const q = escaneo.trim().toLowerCase();
    const i = (conteo?.items || []).findIndex(it => String(it.ubicacion_codigo || '').toLowerCase() === q || String(it.sku || '').toLowerCase() === q);
    if (i < 0) { setError(`El código «${escaneo}» no está en este conteo.`); return; }
    setError(''); setEscaneo(''); inputs.current[i]?.focus(); inputs.current[i]?.select?.();
  };

  const previo = estadoPrevio(base, { clase: 'dx-wcnt', nombre: 'los conteos' });
  if (previo) return <PaginaPrevia previo={previo} onReintentar={base.recargarBase} />;

  const enCurso = conteos.filter(c => c.estado === 'en_proceso').length;
  const porAprobar = conteos.filter(c => c.estado === 'por_aprobar').length;
  const paso = pasoActual(conteo?.estado);
  const usuarioId = sesion.usuario?.id;

  return <section className="dx-ui dx-wms dx-wcnt">
    <Encabezado titulo="Conteos cíclicos" sub="Cuenta por zona o por clase ABC sin cerrar el almacén. Los ajustes sobre el umbral los aprueba otra persona.">
      {puede.crear && <button type="button" className="dx-btn primary" onClick={() => { setError(''); setForm(nuevoForm(almacenes)); }}>Nuevo conteo</button>}
    </Encabezado>
    <AvisoSoloLectura sesion={sesion} />
    {!config.modulos.conteos && <div className="dx-w-note amber" role="status">El módulo de conteos está desactivado en Configuración del WMS.</div>}
    {aviso && <div className="dx-w-note green" role="status">{aviso}</div>}
    {error && <div className="dx-w-note red" role="alert">{error}</div>}
    <div className="dx-ui-summary">
      <div className="dx-ui-chip"><b>{enCurso}</b><span>En proceso</span></div>
      <div className="dx-ui-chip"><b>{porAprobar}</b><span>Por aprobar</span></div>
      <div className="dx-ui-chip"><b>{formatoMoneda(config.umbral_aprobacion_ajuste)}</b><span>Umbral de aprobación</span></div>
    </div>
    <div className="dx-w-side">
      <div className="dx-ui-card">
        {!conteo ? <>
          <div className="dx-w-bar"><h2>Conteos</h2><span className="dx-ui-count">{conteos.length} recientes</span></div>
          {cargando && !conteos.length ? <div className="dx-ui-empty">Cargando conteos…</div>
            : !conteos.length ? <div className="dx-ui-empty">Todavía no hay conteos. Empieza por una zona de alta rotación o por los materiales clase A.</div>
            : <div className="dx-w-scroll"><table className="dx-w-table">
              <thead><tr><th>Código</th><th>Almacén</th><th className="dx-w-hide-m">Tipo</th><th className="num">Líneas</th><th>Estado</th></tr></thead>
              <tbody>{conteos.map(c => <tr key={c.id} className="click" tabIndex={0} onClick={() => abrir(c)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(c); } }}>
                <td><b>{c.codigo}</b><small>{c.nombre}</small></td>
                <td>{nombreAlmacen(c.almacen_id)}{c.zona ? <small>Zona {c.zona}</small> : null}</td>
                <td className="dx-w-hide-m">{TIPOS[c.tipo] || c.tipo}</td>
                <td className="num">{(c.items || []).length}</td>
                <td><span className={`dx-ui-pill ${ESTADOS_CONTEO[c.estado]?.pill || 'is-gray'}`}><i />{ESTADOS_CONTEO[c.estado]?.label || c.estado}</span></td>
              </tr>)}</tbody>
            </table></div>}
        </> : <>
          <div className="dx-w-bar">
            <h2>{conteo.codigo} · {nombreAlmacen(conteo.almacen_id)}</h2>
            <span className="dx-w-toggle"><span id="dx-wcnt-ciego">Conteo ciego</span><button type="button" className={`dx-w-sw${ciego ? ' on' : ''}`} role="switch" aria-checked={ciego} aria-labelledby="dx-wcnt-ciego" onClick={() => setCiego(v => !v)} /></span>
            <button type="button" className="dx-btn sm" onClick={() => setSeleccion('')}>Volver</button>
          </div>
          <div className="dx-w-sec">
            <div className="dx-w-flow" aria-label="Avance del conteo">{PASOS.map((p, i) => <span key={p} className={i < paso ? 'done' : i === paso ? 'cur' : ''}>{p}</span>)}</div>
            {editable && <form className="dx-w-scan" onSubmit={escanear}><span aria-hidden="true">▦</span><input aria-label="Escanear ubicación o material" placeholder="Escanea ubicación o material para ir a su línea" value={escaneo} onChange={e => setEscaneo(e.target.value)} /></form>}
          </div>
          <div className="dx-w-scroll"><table className="dx-w-table">
            <thead><tr><th>Ubicación</th><th>Material</th>{(!ciego || !editable) && <th className="num">Sistema</th>}<th className="num">Contado</th>{(!ciego || !editable) && <th className="num">Diferencia</th>}{(!ciego || !editable) && <th className="num dx-w-hide-m">Valor</th>}</tr></thead>
            <tbody>{itemsVivos.map((it, i) => {
              const dif = it.fisico === null ? null : it.fisico - Number(it.teorico);
              return <tr key={`${it.ubicacion_id}-${it.material_id}-${i}`}>
                <td><b>{it.ubicacion_codigo}</b></td>
                <td className="mat"><b>{it.sku}</b><small>{it.nombre}{it.clase ? ` · Clase ${it.clase}` : ''}</small></td>
                {(!ciego || !editable) && <td className="num">{formatoCantidad(it.teorico)} {it.unidad}</td>}
                <td className="num">{editable
                  ? <input ref={el => { inputs.current[i] = el; }} className="dx-w-in" inputMode="decimal" aria-label={`Contado de ${it.sku} en ${it.ubicacion_codigo}`} value={contados[i] ?? ''} onChange={e => setContados({ ...contados, [i]: e.target.value })} />
                  : it.fisico === null ? '—' : formatoCantidad(it.fisico)}</td>
                {(!ciego || !editable) && <td className="num"><span className={`dx-w-diff ${dif < 0 ? 'neg' : dif > 0 ? 'pos' : ''}`}>{dif === null ? '—' : `${dif > 0 ? '+' : ''}${formatoCantidad(dif)}`}</span></td>}
                {(!ciego || !editable) && <td className="num dx-w-hide-m">{dif === null ? '—' : formatoMoneda(Math.abs(dif) * Number(it.costo || 0))}</td>}
              </tr>;
            })}</tbody>
          </table></div>
        </>}
      </div>

      <div className="dx-ui-card">
        {!conteo ? <div className="dx-w-sec"><h3>Cómo funciona</h3><p className="sub">1. Crea el conteo: el sistema toma una foto del stock de la zona o clase elegida.<br />2. Cuenta a ciegas (sin ver el sistema) escaneando ubicaciones.<br />3. Al cerrar, si las diferencias superan {formatoMoneda(config.umbral_aprobacion_ajuste)}, otra persona aprueba los ajustes.<br />4. Los ajustes entran al kardex con motivo «Ajuste por conteo».</p></div> : <>
          <div className="dx-w-sec">
            <h3>Resumen</h3>
            <div className="dx-w-kv"><span>Líneas contadas</span><b>{resumen.contadas} de {resumen.total}</b></div>
            <div className="dx-w-kv"><span>Exactitud</span><b>{resumen.exactitud === null ? '—' : `${resumen.exactitud}%`}</b></div>
            <div className="dx-w-kv"><span>Faltante valorizado</span><b className="dx-w-diff neg">{formatoMoneda(resumen.faltante)}</b></div>
            <div className="dx-w-kv"><span>Sobrante valorizado</span><b className="dx-w-diff pos">{formatoMoneda(resumen.sobrante)}</b></div>
            <div className="dx-w-total"><span>Diferencia total</span><span>{formatoMoneda(resumen.valor)}</span></div>
            {resumen.valor > Number(config.umbral_aprobacion_ajuste) && conteo.estado === 'en_proceso' && <div className="dx-w-note amber">Supera el umbral de {formatoMoneda(config.umbral_aprobacion_ajuste)}: al cerrar quedará por aprobar.</div>}
            {conteo.estado === 'por_aprobar' && <div className="dx-w-note amber">Pendiente de aprobación. Quien cerró el conteo no puede aprobar sus propios ajustes.</div>}
            {conteo.estado === 'cerrado' && <div className="dx-w-note green">Cerrado{conteo.cerrado_at ? ` el ${new Date(conteo.cerrado_at).toLocaleDateString('es-PE')}` : ''}. Ajustes registrados en el kardex.</div>}
          </div>
          <div className="dx-w-sec"><div className="dx-w-tools">
            {editable && <><button type="button" className="dx-btn" disabled={ocupado} onClick={guardar}>Guardar avance</button><button type="button" className="dx-btn primary" disabled={ocupado} onClick={cerrar}>{ocupado ? 'Procesando…' : 'Cerrar conteo'}</button></>}
            {conteo.estado === 'por_aprobar' && puede.editar && <><button type="button" className="dx-btn" disabled={ocupado} onClick={() => decidir(false)}>Devolver a recontar</button><button type="button" className="dx-btn primary" disabled={ocupado || conteo.cerrado_por === usuarioId} title={conteo.cerrado_por === usuarioId ? 'Debe aprobarlo otra persona' : undefined} onClick={() => decidir(true)}>Aprobar ajustes</button></>}
          </div></div>
        </>}
      </div>
    </div>

    {form && <div className="dx-w-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !ocupado) setForm(null); }}>
      <form className="dx-w-modal" role="dialog" aria-modal="true" aria-labelledby="dx-wcnt-nuevo-t" onSubmit={crear}>
        <h3 id="dx-wcnt-nuevo-t">Nuevo conteo</h3>
        <div className="dx-w-field"><label htmlFor="dx-wcnt-alm">Almacén</label><select id="dx-wcnt-alm" value={form.almacen_id} onChange={e => setForm({ ...form, almacen_id: e.target.value })}>{almacenes.map(a => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>)}</select></div>
        <div className="dx-w-field"><span>Tipo de conteo</span><div className="dx-w-seg" role="group" aria-label="Tipo de conteo">{Object.entries(TIPOS).map(([id, label]) => <button key={id} type="button" className={form.tipo === id ? 'on' : ''} aria-pressed={form.tipo === id} onClick={() => setForm({ ...form, tipo: id })}>{label}</button>)}</div></div>
        {form.tipo === 'zona' && <div className="dx-w-field"><label htmlFor="dx-wcnt-zona">Ubicaciones que empiezan por</label><input id="dx-wcnt-zona" placeholder="Ej.: A-01" maxLength={30} value={form.ubicacion_prefijo} onChange={e => setForm({ ...form, ubicacion_prefijo: e.target.value })} /></div>}
        {form.tipo === 'ciclico' && <div className="dx-w-field"><label htmlFor="dx-wcnt-clase">Clase ABC (por consumo valorizado del último año)</label><select id="dx-wcnt-clase" value={form.clase} onChange={e => setForm({ ...form, clase: e.target.value })}><option value="A">A · 80% del consumo</option><option value="B">B · siguiente 15%</option><option value="C">C · resto</option></select></div>}
        <div className="dx-w-field"><label htmlFor="dx-wcnt-nombre">Nombre · opcional</label><input id="dx-wcnt-nombre" maxLength={120} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} /></div>
        {error && <div className="dx-w-note red" role="alert">{error}</div>}
        <div className="dx-w-modal-actions"><button type="button" className="dx-btn" onClick={() => setForm(null)}>Cancelar</button><button className="dx-btn primary" disabled={ocupado}>{ocupado ? 'Creando…' : 'Crear conteo'}</button></div>
      </form>
    </div>}
  </section>;
}
