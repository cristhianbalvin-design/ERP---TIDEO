import React, { useEffect, useRef, useState } from 'react';
import { agruparPorFecha, horaCorta, listarConversaciones } from '../services/ariaMemoriaService.js';

// Lista de conversaciones anteriores con Aria, con buscador (título, resumen o mensajes).
function Resaltado({ texto, termino }) {
  const t = String(termino || '').trim();
  if (!t) return texto;
  const normal = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const pos = normal(texto).indexOf(normal(t));
  if (pos < 0) return texto;
  return <>{texto.slice(0, pos)}<mark>{texto.slice(pos, pos + t.length)}</mark>{texto.slice(pos + t.length)}</>;
}

function Fila({ c, activa, termino, onAbrir }) {
  const teclado = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onAbrir(c.id); } };
  return <div role="button" tabIndex={0} className={`dx-asis-conv-row${activa ? ' is-act' : ''}`} aria-current={activa ? 'true' : undefined}
    onClick={() => onAbrir(c.id)} onKeyDown={teclado}>
    <span className={`dx-asis-conv-ic${c.borrador_pendiente ? ' eg' : ''}`} aria-hidden="true">{c.borrador_pendiente ? 'S/' : '≡'}</span>
    <div className="dx-asis-conv-tx">
      <b><Resaltado texto={c.titulo} termino={termino} /></b>
      {termino.trim() && c.fragmento ? <p>…<Resaltado texto={c.fragmento} termino={termino} />…</p> : c.resumen ? <p>{c.resumen}</p> : null}
      {c.borrador_pendiente && <span className="dx-asis-conv-pill">Borrador pendiente</span>}
    </div>
    <div className="dx-asis-conv-meta">{horaCorta(c.actualizado_en)}<br />{c.mensajes} {c.mensajes === 1 ? 'mensaje' : 'mensajes'}</div>
  </div>;
}

export default function AriaConversaciones({ empresaId, activaId, onAbrir, onNueva }) {
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState({ cargando: true, error: null, lista: [] });
  const consulta = useRef(0);
  useEffect(() => {
    const id = ++consulta.current;
    setEstado(prev => ({ ...prev, cargando: true, error: null }));
    const espera = setTimeout(() => {
      listarConversaciones(empresaId, texto)
        .then(lista => { if (id === consulta.current) setEstado({ cargando: false, error: null, lista: Array.isArray(lista) ? lista : [] }); })
        .catch(error => { if (id === consulta.current) setEstado({ cargando: false, error: error.message, lista: [] }); });
    }, texto ? 300 : 0);
    return () => clearTimeout(espera);
  }, [empresaId, texto]);

  // Al buscar, un solo grupo con el número de resultados; sin búsqueda, agrupadas por fecha.
  const grupos = texto.trim() && estado.lista.length
    ? [{ nombre: `${estado.lista.length} ${estado.lista.length === 1 ? 'resultado' : 'resultados'}`, items: estado.lista }]
    : agruparPorFecha(estado.lista);
  return <div className="dx-asis-body dx-asis-conv">
    <div className="dx-asis-conv-bar">
      <label className="dx-asis-conv-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input type="search" value={texto} onChange={event => setTexto(event.target.value.slice(0, 100))} placeholder="Buscar en tus conversaciones" aria-label="Buscar en tus conversaciones" />
      </label>
      <button type="button" className="dx-asis-conv-nueva" onClick={onNueva}>+ Nueva</button>
    </div>
    {estado.cargando && !estado.lista.length && <div className="dx-asis-tools"><span className="dx-asis-dots" aria-hidden="true"><span /><span /><span /></span><span role="status">Cargando conversaciones…</span></div>}
    {estado.error && <div className="dx-asis-err" role="alert">{estado.error}</div>}
    {!estado.cargando && !estado.error && !estado.lista.length && <div className="dx-asis-conv-empty" role="status">
      <b>{texto ? 'No encontré conversaciones' : 'Aún no tienes conversaciones guardadas'}</b>
      {texto ? 'Prueba con otra palabra, por ejemplo el nombre de un proveedor o un número de OC.' : 'Cuando converses con Aria, aquí podrás volver a cualquier conversación.'}
    </div>}
    {grupos.map(grupo => <React.Fragment key={grupo.nombre}>
      <div className="dx-asis-conv-grp">{grupo.nombre}</div>
      {grupo.items.map(c => <Fila key={c.id} c={c} activa={c.id === activaId} termino={texto} onAbrir={onAbrir} />)}
    </React.Fragment>)}
    {!!estado.lista.length && <p className="dx-asis-conv-note">Se guardan 180 días · Solo tú ves tus conversaciones</p>}
  </div>;
}
