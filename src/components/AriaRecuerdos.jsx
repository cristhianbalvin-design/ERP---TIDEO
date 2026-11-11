import React, { useEffect, useRef, useState } from 'react';
import { borrarRecuerdo, borrarTodosLosRecuerdos, fechaRecuerdo, listarRecuerdos, pausarMemoria } from '../services/ariaMemoriaService.js';

// "Lo que Aria recuerda de ti": cada persona ve, busca y borra sus recuerdos, y puede pausar la memoria.
const Papelera = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" /></svg>;

export default function AriaRecuerdos({ empresaId }) {
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState({ cargando: true, error: null, pausada: false, total: 0, lista: [] });
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const consulta = useRef(0);
  const cancelarRef = useRef(null);
  const borrarTodoRef = useRef(null);

  const cargar = (termino, espera = 0) => {
    const id = ++consulta.current;
    setEstado(prev => ({ ...prev, cargando: true, error: null }));
    const temporizador = setTimeout(() => {
      listarRecuerdos(empresaId, termino)
        .then(datos => { if (id === consulta.current) setEstado({ cargando: false, error: null, pausada: Boolean(datos?.pausada), total: Number(datos?.total) || 0, lista: Array.isArray(datos?.recuerdos) ? datos.recuerdos : [] }); })
        .catch(error => { if (id === consulta.current) setEstado(prev => ({ ...prev, cargando: false, error: error.message })); });
    }, espera);
    return () => clearTimeout(temporizador);
  };
  useEffect(() => cargar(texto, texto ? 300 : 0), [empresaId, texto]);
  useEffect(() => { if (confirmar) cancelarRef.current?.focus(); }, [confirmar]);

  const ejecutar = async (accion, alTerminar) => {
    if (ocupado) return;
    setOcupado(true);
    try { await accion(); alTerminar?.(); cargar(texto); }
    catch (error) { setEstado(prev => ({ ...prev, error: error.message })); }
    finally { setOcupado(false); }
  };
  const alternarPausa = () => ejecutar(() => pausarMemoria(empresaId, !estado.pausada));
  const borrarUno = id => ejecutar(() => borrarRecuerdo(id));
  const cerrarConfirmacion = () => { setConfirmar(false); requestAnimationFrame(() => borrarTodoRef.current?.focus()); };
  const borrarTodo = () => ejecutar(() => borrarTodosLosRecuerdos(empresaId), () => { setConfirmar(false); setTexto(''); });

  const cuenta = n => `${n} ${n === 1 ? 'recuerdo' : 'recuerdos'}`;
  const buscando = Boolean(texto.trim());
  return <div className="dx-asis-body dx-asis-conv dx-asis-mem">
    <div className="dx-asis-mem-sw">
      <span><b>{estado.pausada ? 'Memoria en pausa' : 'Memoria activada'}</b>
        <small>{estado.pausada ? 'Aria no usa ni guarda recuerdos. Los que ya tienes se conservan.' : 'Aria usa estos recuerdos y aprende nuevos mientras conversan.'}</small></span>
      <button type="button" role="switch" aria-checked={!estado.pausada} aria-label="Memoria de Aria activada" className="dx-asis-mem-tg" disabled={ocupado || estado.cargando} onClick={alternarPausa}><i aria-hidden="true" /></button>
    </div>
    {estado.pausada && <div className="dx-asis-mem-pausa" role="status">Mientras esté en pausa, Aria responde sin tus recuerdos.</div>}
    {(estado.total > 0 || buscando) && <label className="dx-asis-conv-search dx-asis-mem-search">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      <input type="search" value={texto} onChange={event => setTexto(event.target.value.slice(0, 100))} placeholder="Buscar en tus recuerdos" aria-label="Buscar en tus recuerdos" />
    </label>}
    {estado.cargando && !estado.lista.length && <div className="dx-asis-tools"><span className="dx-asis-dots" aria-hidden="true"><span /><span /><span /></span><span role="status">Cargando tus recuerdos…</span></div>}
    {estado.error && <div className="dx-asis-err" role="alert">{estado.error}</div>}
    {!estado.cargando && !estado.error && !estado.lista.length && <div className="dx-asis-conv-empty" role="status">
      <b>{buscando ? 'No encontré recuerdos' : 'Todavía no recuerdo nada de ti'}</b>
      {buscando ? 'Prueba con otra palabra.' : 'Dime «recuerda que…» en el chat, o conversa normalmente y aprenderé cómo trabajas.'}
    </div>}
    {!!estado.lista.length && <div className="dx-asis-conv-grp dx-asis-mem-grp">
      <span>{buscando ? `${estado.lista.length} ${estado.lista.length === 1 ? 'resultado' : 'resultados'}` : cuenta(estado.total)}</span>
      {!buscando && <button type="button" ref={borrarTodoRef} className="dx-asis-mem-todo" disabled={ocupado} onClick={() => setConfirmar(true)}>Borrar todo</button>}
    </div>}
    {estado.lista.map(r => <div className="dx-asis-mem-row" key={r.id}>
      <div className="dx-asis-mem-tx">
        <p>{r.texto}</p>
        <div className="dx-asis-mem-meta"><span className={`dx-asis-mem-pill${r.tipo === 'automatico' ? ' auto' : ''}`}>{r.tipo === 'automatico' ? 'Lo aprendí' : 'Me lo dijiste'}</span>
          <span>{fechaRecuerdo(r.creado_en)}{r.origen ? ` · de «${r.origen}»` : ''}</span></div>
      </div>
      <button type="button" className="dx-asis-mem-del" aria-label={`Borrar el recuerdo: ${r.texto}`} title="Borrar este recuerdo" disabled={ocupado} onClick={() => borrarUno(r.id)}><Papelera /></button>
    </div>)}
    {!!estado.lista.length && <p className="dx-asis-conv-note">Solo tú ves tus recuerdos · No guardo montos ni saldos: esos siempre los consulto en el ERP</p>}
    {confirmar && <div className="dx-asis-mem-ov" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); cerrarConfirmacion(); } }}>
      <div className="dx-asis-mem-sheet" role="alertdialog" aria-modal="true" aria-labelledby="dx-asis-mem-conf-t" aria-describedby="dx-asis-mem-conf-d">
        <h3 id="dx-asis-mem-conf-t">{estado.total === 1 ? '¿Borrar el recuerdo?' : `¿Borrar los ${estado.total} recuerdos?`}</h3>
        <p id="dx-asis-mem-conf-d">Aria olvidará todo lo que aprendió de ti en esta empresa. Tus conversaciones no se borran. Esto no se puede deshacer.</p>
        <div className="dx-asis-mem-sheet-b">
          <button type="button" ref={cancelarRef} className="dx-asis-mem-btn" disabled={ocupado} onClick={cerrarConfirmacion}>Cancelar</button>
          <button type="button" className="dx-asis-mem-btn danger" disabled={ocupado} onClick={borrarTodo}>{ocupado ? 'Borrando…' : 'Borrar todo'}</button>
        </div>
      </div>
    </div>}
  </div>;
}
