import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context.jsx';
import { useAsistenteErp } from '../context/AsistenteErpContext.jsx';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import { SOCIEDAD_TODAS_ID } from '../services/sociedadesService.js';
import { formatos, fecha, importe, subtitulo, titulo, resumenDia, textoHablado } from './datos.js';
import { crearMotor } from './motorAria.js';
import sprite from './sprite.svg?raw';
import './inicio.css';

const Icon = ({ name }) => <svg className="dxi-i" aria-hidden="true"><use href={`#i-${name}`} /></svg>;
const preguntas = ['¿Qué debo pagar hoy?', '¿Qué cobros están vencidos?',
  '¿Qué OC están atrasadas?', '¿Qué falta aprobar?'];
const hoy = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());
const color = { red: 'dxi-ic-red', amber: 'dxi-ic-am', violet: 'dxi-ic-vi', cyan: 'dxi-ic-cy', green: 'dxi-ic-gr' };
const pill = { 'Vence hoy': 'dxi-is-red', Urgente: 'dxi-is-amber',
  'Sugerido por Aria': 'dxi-is-cyan', 'Regla automática': 'dxi-is-gray' };
const valor = (grupo, moneda) => grupo?.por_moneda?.find(x => x.moneda === moneda);

function Hero({ saludo, nombre, dia, resumen, cargando, error, data, hablando, escuchar, recorrer }) {
  return <section className="dxi-hero">
    <div className="dxi-hero-txt">
      <div className="dxi-eyebrow dxi-reveal">{dia} · Tu día</div>
      <h1 className="dxi-reveal"><span id="greet">{saludo}</span>{nombre && <>, <em>{nombre}</em></>}</h1>
      <div className="dxi-say dxi-reveal" id="heroSay" aria-live="polite">
        {cargando ? 'Preparando tu día…' : error || resumen}
      </div>
      <div className="dxi-hero-act dxi-reveal">
        <button className="dxi-btn dxi-p" id="bListen" disabled={!data} onClick={escuchar}>
          <Icon name={hablando ? 'stop' : 'play'} />
          <span id="bListenT">{hablando ? 'Detener' : 'Escuchar mi día'}</span>
        </button>
        <button className="dxi-btn dxi-g" id="bTour" disabled={!data} onClick={recorrer}>
          <Icon name="spark" />Preséntame mi día
        </button>
      </div>
    </div>
    <div className="dxi-stage dxi-reveal" id="stage">
      <div id="heroAv" data-s="reposo" style={{ position: 'absolute', inset: 0 }} />
    </div>
  </section>;
}

function Preguntar({ pregunta, setPregunta, ask }) {
  return <div className="dxi-ask" id="ask" style={matchMedia('(prefers-reduced-motion: reduce)').matches
    ? undefined : { opacity: 0, transform: 'translateY(14px)' }}>
    <div className="dxi-ask-in">
      <form id="askF" onSubmit={e => { e.preventDefault(); ask(pregunta); }}>
        <span className="dxi-sparkle"><Icon name="spark" /></span>
        <input id="askI" aria-label="Pregúntale a Aria" placeholder="Pregúntale a Aria lo que necesites"
          autoComplete="off" value={pregunta} onChange={e => setPregunta(e.target.value)} />
        <button className="dxi-send" aria-label="Enviar"><Icon name="up" /></button>
      </form>
      <div className="dxi-sug" id="sug">{preguntas.map(q => <button key={q} onClick={() => ask(q)}>{q}</button>)}</div>
    </div>
  </div>;
}

function Kpi({ grupo, titulo: etiqueta, cero = false }) {
  if (!grupo && !cero) return null;
  const valores = grupo?.por_moneda?.filter(x => x.total != null) || [];
  return <div className="dx-ui-kpi">
    <strong>{valores[0] ? importe(valores[0].total, valores[0].moneda) : cero ? importe(0, 'PEN') : '—'}</strong>
    <span>{etiqueta}{valores.slice(1).map(x => <React.Fragment key={x.moneda}>
      <br /><span className="dx-ui-kpi-extra">+ {importe(x.total, x.moneda)}</span>
    </React.Fragment>)}</span>
  </div>;
}

function Bandeja({ data, scope, setScope, area, setArea, visibles, filtrados, navigate, posponer }) {
  const areas = ['Todas', ...new Set(visibles.map(i => i.area))];
  return <div className="dx-ui-card dxi-reveal" id="inbox">
    <div className="dxi-bar"><h2>Por resolver</h2><span className="dxi-count" id="cnt">{visibles.length}</span>
      <div className="dxi-seg" role="group" aria-label="Alcance">
        {['mios', 'area'].map(s => <button key={s} id={s === 'mios' ? 'sM' : 'sA'}
          className={scope === s ? 'dxi-on' : ''} onClick={() => { setScope(s); setArea('Todas'); }}>
          {s === 'mios' ? 'Míos' : 'Mi área'}
        </button>)}
      </div>
    </div>
    {data.filas_mias === 0 && <div className="dxi-empty">
      No tienes pendientes asignados hoy; te muestro los de tu área.</div>}
    <div className="dxi-filters" id="filters">{areas.map(a => <button key={a} className={area === a ? 'dxi-on' : ''}
      onClick={() => setArea(a)}>{a} <span>{a === 'Todas' ? visibles.length : visibles.filter(i => i.area === a).length}
      </span></button>)}</div>
    <div id="rows">{filtrados.map(i => {
      const f = formatos[i.id];
      const mio = scope === 'mios';
      return <div className="dxi-row" data-id={i.id} key={i.id}>
        <span className={`dx-ui-icon ${color[f[1]]}`}><Icon name={f[0]} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="dxi-r-t">{titulo(i, mio)}<span className={`dx-ui-pill ${pill[f[2]]}`}>{f[2]}</span></div>
          <div className="dxi-r-s">{subtitulo(i, mio)}</div>
        </div>
        <div className="dxi-r-a">
          {i.pantalla && <button className="dxi-act" onClick={() => navigate(i.pantalla)}>{f[3]}</button>}
          <button className="dxi-later" title="Posponer" aria-label="Posponer para mañana" onClick={() => posponer(i.id)}>
            <Icon name="clock" />
          </button>
        </div>
      </div>;
    })}</div>
    {!filtrados.length && <div className="dxi-empty" id="none">Nada pendiente en este filtro.</div>}
  </div>;
}

function Avisos({ data, navigate }) {
  const pantalla = id => data.items?.find(i => i.id === id)?.pantalla;
  return <div className="dx-ui-card dxi-reveal" id="alerts">
    <div className="dxi-bar"><h2>Aria te avisa</h2></div>
    {data.alertas?.oc && <div className="dxi-al"><span className="dx-ui-icon dxi-ic-am"><Icon name="truck" /></span>
      <div><p>{data.alertas.oc.documento} {data.alertas.oc.dias_atraso != null &&
        `lleva ${data.alertas.oc.dias_atraso} ${data.alertas.oc.dias_atraso === 1 ? 'día' : 'días'} de atraso`}</p>
        {pantalla('oc_atrasada') && <button onClick={() => navigate(pantalla('oc_atrasada'))}>
          Ver orden de compra</button>}</div></div>}
    {data.alertas?.ot && <div className="dxi-al"><span className="dx-ui-icon dxi-ic-vi"><Icon name="wrench" /></span>
      <div><p>{data.alertas.ot.documento} no registra parte
        {data.alertas.ot.ultimo_parte && ` desde el ${fecha(data.alertas.ot.ultimo_parte)}`}</p>
        {pantalla('ot_sin_parte') && <button onClick={() => navigate(pantalla('ot_sin_parte'))}>Abrir OT</button>}
      </div></div>}
    {data.alertas?.stock_bajo != null && <div className="dxi-al">
      <span className="dx-ui-icon dxi-ic-gr"><Icon name="check" /></span><div><p>
        {data.alertas.stock_bajo === 0 ? 'Stock en orden: ningún material bajo el mínimo'
          : `${data.alertas.stock_bajo} materiales bajo el mínimo`}</p></div></div>}
    {!Object.keys(data.alertas || {}).length && <div className="dxi-empty">Sin avisos disponibles.</div>}
  </div>;
}

function Dinero({ dinero, moneda, setMoneda }) {
  const keys = [['cobrar_vencido', 'Por cobrar vencido', '#00ACC1'],
    ['pagar_vencido', 'Por pagar vencido', '#DC2626'], ['pagar_7d', 'Por pagar en 7 días', '#E08A00']];
  const max = Math.max(1, ...keys.map(([k]) => Number(valor(dinero[k], moneda)?.total || 0)));
  return <div className="dx-ui-card dxi-reveal" id="money">
    <div className="dxi-bar"><h2>Cobros y pagos</h2><div className="dxi-seg" role="group" aria-label="Moneda">
      {['PEN', 'USD'].map(m => <button key={m} id={m === 'PEN' ? 'mP' : 'mU'}
        className={moneda === m ? 'dxi-on' : ''} onClick={() => setMoneda(m)}>{m}</button>)}
    </div></div>
    <div className="dxi-money" id="moneyB">{keys.map(([k, label, c]) => {
      if (!dinero[k]) return null;
      const v = valor(dinero[k], moneda);
      return <div key={k}><div className="dxi-mr-h"><span>{label}</span>
        <span>{v?.cantidad || 0} documentos</span></div><div className="dxi-mr-v">{importe(v?.total || 0, moneda)}</div>
        <div className="dxi-track"><i style={{ background: c,
          width: `${Math.max(0, Number(v?.total || 0)) / max * 100}%` }} />
        </div></div>;
    })}</div>
  </div>;
}

function Agenda({ agenda }) {
  const n = agenda.atrasadas || 0;
  return <div className="dx-ui-card dxi-reveal"><div className="dxi-bar"><h2>Agenda de hoy</h2></div>
    {agenda.hoy?.length ? agenda.hoy.map((a, i) => <div className="dxi-al" key={a.id || i}>
      <span className="dx-ui-icon dxi-ic-cy"><Icon name="clock" /></span><div>
        <p>{a.hora && `${a.hora} · `}{a.descripcion || a.tipo}</p><div className="dxi-r-s">{a.tercero}</div>
      </div></div>) : <div className="dxi-empty">Sin actividades para hoy.
        {n > 0 && ` Tienes ${n} ${n === 1 ? 'actividad comercial pendiente' : 'actividades comerciales pendientes'}`}
        {n > 0 && agenda.atrasada_desde && ` desde el ${fecha(agenda.atrasada_desde)}`}{n > 0 && '.'}
      </div>}
    {!!agenda.hoy?.length && n > 0 && <div className="dxi-empty">Tienes {n} {n === 1
      ? 'actividad comercial pendiente' : 'actividades comerciales pendientes'}
      {agenda.atrasada_desde && ` desde el ${fecha(agenda.atrasada_desde)}`}.</div>}
  </div>;
}

function Superposicion({ overlay, data, aviso }) {
  const pendientes = data?.filas_mias > 0 ? data.filas_mias : data?.filas_area > 0 ? data.filas_area : 0;
  return createPortal(<div className="dxi-root" ref={overlay}>
    <button className="dxi-fab" id="fab" aria-label="Pregúntale a Aria"><span className="dxi-tp">Pregúntale a Aria</span>
      {pendientes > 0 && <span className="dxi-cnt" id="fabN">{pendientes}</span>}
      <span className="dxi-fab-av" id="fabAv" data-s="reposo" />
    </button>
    <div className="dxi-mor" id="mor"><img className="dxi-hum" id="morH" alt="" />
      <div className="dxi-rob" id="morW"><img id="morR" alt="" /><b className="dxi-re" style={{ left: '34.3%' }} />
        <b className="dxi-re" style={{ left: '59.7%' }} /></div><i className="dxi-bst" /><i className="dxi-scn" /></div>
    <div className="dxi-spot" id="spot" />
    <div className="dxi-fl" id="fl"><div className="dxi-fl-host" id="flAv" data-s="reposo" /></div>
    <div className="dxi-bub" id="bub" role="dialog" aria-label="Recorrido con Aria">
      <div className="dxi-say" id="bubSay" aria-live="polite" /><div className="dxi-bub-f"><span id="bubN" />
        <button className="dxi-sk" id="bubSk">Salir</button><button className="dxi-act" id="bubNx">Siguiente</button>
      </div></div><div className={`dxi-toast${aviso ? ' dxi-on' : ''}`} id="toast" role="status">{aviso}</div>
  </div>, document.body);
}

export default function Inicio() {
  const { empresa, sociedadActiva, authUser, navigate } = useApp();
  const { solicitarApertura } = useAsistenteErp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const [scope, setScope] = useState('mios');
  const [area, setArea] = useState('Todas');
  const [moneda, setMoneda] = useState('PEN');
  const [pregunta, setPregunta] = useState('');
  const [ocultos, setOcultos] = useState([]);
  const [hablando, setHablando] = useState(false);
  const [aviso, setAviso] = useState('');
  const root = useRef(null), overlay = useRef(null), motor = useRef(null), steps = useRef([]);
  const toastTimer = useRef(null), tourFrame = useRef(null);
  const sociedadId = sociedadActiva?.id === SOCIEDAD_TODAS_ID ? null : sociedadActiva?.id || null;
  useEffect(() => {
    let activo = true, timer, cancelarEspera;
    const esperas = [1500, 3000, 5000];
    setData(null); setError(''); setCargando(true);
    if (!empresa?.id) { setCargando(false); return () => { activo = false; }; }
    (async () => {
      try {
        const cliente = await getSupabaseClient();
        if (!cliente) throw Error();
        for (let intento = 0; activo; intento++) {
          let respuesta;
          try {
            respuesta = await cliente.rpc('inicio_pendientes', {
              p_empresa_id: empresa.id, p_sociedad_id: sociedadId
            });
          } catch (fallo) {
            if (!(fallo instanceof TypeError) || intento >= esperas.length) throw fallo;
          }
          if (!activo) return;
          const { data: resultado, error: fallo, status } = respuesta || {};
          if (respuesta && !fallo) {
            setData(resultado); setScope(resultado?.filas_mias > 0 ? 'mios' : 'area'); setArea('Todas');
            return;
          }
          const transitorio = !respuesta || (fallo?.code !== '42501' &&
            (fallo?.code === '57014' || [0, 500, 502, 503, 504].includes(status)));
          if (!transitorio || intento >= esperas.length) throw fallo;
          await new Promise(resolve => {
            cancelarEspera = resolve;
            timer = setTimeout(resolve, esperas[intento]);
          });
          cancelarEspera = null;
        }
      } catch {
        if (activo) setError('No se pudo cargar tu inicio. Inténtalo de nuevo.');
      } finally { if (activo) setCargando(false); }
    })();
    return () => { activo = false; clearTimeout(timer); cancelarEspera?.(); };
  }, [empresa?.id, sociedadId, recarga]);
  const prefijo = `dx-inicio:${authUser?.id || ''}:${empresa?.id || ''}:`;
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(prefijo + hoy()) || '[]');
      setOcultos(Array.isArray(v) ? v : []);
    } catch { setOcultos([]); }
  }, [prefijo]);
  const items = useMemo(() => (data?.items || []).filter(i => formatos[i.id] && !ocultos.includes(i.id)),
    [data, ocultos]);
  const visibles = items.filter(i => scope === 'area' || i.cantidad_mia > 0);
  const filtrados = visibles.filter(i => area === 'Todas' || i.area === area);
  const resumen = data ? resumenDia(data, items) : '';
  const primerosMontos = data?.ver_finanzas ? ['pagar_vencido', 'cobrar_vencido'].map(clave =>
    data.dinero?.[clave]?.por_moneda?.find(x => x.total != null && x.moneda)) : [];
  const pendientes = data?.filas_mias > 0 ? data.filas_mias : data?.filas_area || 0;
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('dx-inicio-pendientes', { detail: data ? pendientes : null }));
  }, [data, pendientes]);
  const monto = x => x ? importe(x.total, x.moneda) : '0';
  const pasoKpi = primerosMontos.some(Boolean)
    ? `Este es tu pulso del día: ${monto(primerosMontos[0])} vencidos por pagar y ${monto(primerosMontos[1])} por cobrar.`
    : `Este es tu pulso del día: ${pendientes} ${pendientes === 1 ? 'pendiente' : 'pendientes'}.`;
  steps.current = [data && { el: '#kpis', t: pasoKpi },
    ...filtrados.slice(0, 2).map(i => ({ el: `[data-id="${i.id}"]`, t: titulo(i, scope === 'mios') })),
    data?.alertas && Object.keys(data.alertas).length > 0 && { el: '#alerts', t: 'Aquí están tus avisos de hoy.' },
    data?.ver_finanzas && data?.dinero && { el: '#money', t: 'Aquí ves tus cobros y pagos separados por moneda.' },
    data && { el: '#ask', t: 'Y si necesitas algo más, pregúntame aquí.' }
  ].filter(Boolean).map(paso => ({ ...paso, s: textoHablado(paso.t) }));
  useEffect(() => {
    const rootEl = root.current, overlayEl = overlay.current;
    if (!rootEl || !overlayEl) return;
    const scopeEl = {
      querySelector: s => rootEl.querySelector(s) || overlayEl.querySelector(s),
      querySelectorAll: s => [...rootEl.querySelectorAll(s), ...overlayEl.querySelectorAll(s)]
    };
    const m = crearMotor(scopeEl, () => steps.current, () => solicitarApertura());
    motor.current = m;
    return () => { m.destroy(); motor.current = null; clearTimeout(toastTimer.current);
      cancelAnimationFrame(tourFrame.current); };
  }, [solicitarApertura]);
  function posponer(id) {
    const next = [...ocultos, id];
    setOcultos(next);
    try { localStorage.setItem(prefijo + hoy(), JSON.stringify(next)); } catch { /* almacenamiento opcional */ }
    setAviso('Pospuesto para mañana');
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setAviso(''), 1900);
  }
  function ask(q) { if (q.trim()) { solicitarApertura(q.trim()); setPregunta(''); } }
  async function escuchar() {
    if (hablando) { motor.current.stopSpeech(); setHablando(false); return; }
    setHablando(true);
    const m = motor.current;
    await m?.speak(resumen, root.current?.querySelector('#heroSay'), textoHablado(resumen));
    if (motor.current === m) setHablando(false);
  }
  function recorrer() {
    setArea('Todas');
    tourFrame.current = requestAnimationFrame(() => motor.current?.startTour());
  }
  const hora = Number(new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', hourCycle: 'h23', timeZone: 'America/Lima'
  }).format(new Date()));
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const nombre = String(authUser?.nombre || authUser?.user_metadata?.nombre || '').trim().split(/\s+/)[0];
  const diaRaw = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima'
  }).format(new Date()).replace(',', '');
  const dia = diaRaw[0].toUpperCase() + diaRaw.slice(1);
  return <>
    <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: sprite }} />
    <section className="dxi-root" ref={root}><div className="dxi-main">
      <Hero {...{ saludo, nombre, dia, resumen, cargando, error, data, hablando, escuchar, recorrer }} />
      <section className="dxi-content"><Preguntar {...{ pregunta, setPregunta, ask }} />
        {cargando && <div className="dxi-empty" role="status">Cargando pendientes…</div>}
        {error && <div className="dxi-empty" role="alert">{error} <button onClick={() => setRecarga(x => x + 1)}>
          Reintentar</button></div>}
        {data && <><div className="dx-ui-kpi-row dxi-reveal" id="kpis"><div className="dx-ui-kpi">
          <strong id="kN">{data.filas_mias || 0}</strong><span>Míos por resolver<br />
            <i id="kA" style={{ fontStyle: 'normal' }}>{data.filas_area || 0} en mi área</i></span></div>
          {data.ver_finanzas && <><Kpi cero grupo={data.dinero?.pagar_hoy} titulo={<>Por pagar<br />hoy</>} />
            <Kpi grupo={data.dinero?.pagar_vencido} titulo="CxP vencida" />
            <Kpi grupo={data.dinero?.cobrar_vencido} titulo="CxC vencida" /></>}</div>
          {data.fuentes_con_error?.length > 0 && <div className="dxi-empty" role="status">
            Falta información de algunas áreas: {data.fuentes_con_error.join(', ')}.</div>}
          <div className="dxi-cols"><Bandeja {...{ data, scope, setScope, area, setArea, visibles, filtrados,
            navigate, posponer }} /><div className="dxi-side"><Avisos {...{ data, navigate }} />
            {data.ver_finanzas && data.dinero && <Dinero dinero={data.dinero} {...{ moneda, setMoneda }} />}
            {data.agenda && <Agenda agenda={data.agenda} />}</div></div></>}
      </section>
    </div></section><Superposicion {...{ overlay, data, aviso }} />
  </>;
}
