import { useCallback, useEffect, useMemo, useState } from 'react';
import { catalogoComponentesService } from '../services/catalogoComponentesService.js';

const SAFE_TAGS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'clipPath']);
const SAFE_ATTRS = new Set(['xmlns', 'viewBox', 'role', 'aria-label', 'class', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'd', 'points', 'transform', 'text-anchor', 'opacity', 'fill', 'fill-rule', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'data-z', 'data-cota', 'font-size', 'font-weight']);

export function sanitizarSvgCatalogo(svg, zonaActiva = '') {
  if (!svg || typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return '';
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) return '';
  const limpiar = nodo => {
    [...nodo.children].forEach(hijo => {
      if (!SAFE_TAGS.has(hijo.localName)) {
        hijo.remove();
        return;
      }
      [...hijo.attributes].forEach(attr => {
        if (!SAFE_ATTRS.has(attr.name) || /^on/i.test(attr.name) || /javascript:|url\s*\(/i.test(attr.value)) hijo.removeAttribute(attr.name);
      });
      if (zonaActiva && hijo.getAttribute('data-z') === zonaActiva) {
        hijo.setAttribute('class', `${hijo.getAttribute('class') || ''} is-highlight`.trim());
      }
      limpiar(hijo);
    });
  };
  limpiar(root);
  [...root.attributes].forEach(attr => {
    if (!SAFE_ATTRS.has(attr.name) || /^on/i.test(attr.name) || /javascript:|url\s*\(/i.test(attr.value)) root.removeAttribute(attr.name);
  });
  return new XMLSerializer().serializeToString(root);
}

function EditableField({ value, onChange, disabled, label, multiline = false, placeholder }) {
  const props = { value: value ?? '', disabled, placeholder, 'aria-label': label, onChange: evento => onChange(evento.target.value) };
  return multiline
    ? <textarea {...props} rows="2" />
    : <input {...props} />;
}

export default function CatalogoComponentesPanel({ empresaId, sociedadId, puedeEditar, onClose }) {
  const [componentes, setComponentes] = useState([]);
  const [seleccionId, setSeleccionId] = useState('');
  const [zonaId, setZonaId] = useState('');
  const [borradores, setBorradores] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState('');
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await catalogoComponentesService.listar(empresaId, sociedadId);
      setComponentes(Array.isArray(data) ? data : []);
      setSeleccionId(actual => data?.some(item => item.id === actual) ? actual : data?.[0]?.id || '');
      setZonaId(actual => data?.flatMap(item => item.zonas || []).some(item => item.id === actual) ? actual : '');
      setError('');
    } catch (err) {
      setError(err?.message || 'No se pudo cargar el catálogo.');
    } finally {
      setCargando(false);
    }
  }, [empresaId, sociedadId]);

  useEffect(() => { recargar(); }, [recargar]);
  const seleccionado = componentes.find(item => item.id === seleccionId);
  const zonaSeleccionada = seleccionado?.zonas?.find(item => item.id === zonaId);
  const medidas = useMemo(() => (zonaSeleccionada?.medidas || []).map(medida => ({
    ...medida,
    ...borradores[medida.id],
  })), [zonaSeleccionada, borradores]);
  const svg = useMemo(() => sanitizarSvgCatalogo(seleccionado?.svg, zonaId), [seleccionado?.svg, zonaId]);

  const actualizarBorrador = (id, campo, valor) => setBorradores(prev => ({
    ...prev,
    [id]: { ...prev[id], [campo]: valor },
  }));

  const guardar = async medida => {
    setGuardando(medida.id); setAviso(''); setError('');
    try {
      await catalogoComponentesService.guardarOverride(empresaId, sociedadId, seleccionado.id, zonaSeleccionada.id, medida.id, medida);
      setBorradores(prev => { const next = { ...prev }; delete next[medida.id]; return next; });
      await recargar(); setAviso('Medida guardada para esta sociedad.');
    } catch (err) { setError(err?.message || 'No se pudo guardar el cambio.'); }
    finally { setGuardando(''); }
  };

  const restablecer = async medida => {
    setGuardando(medida.id); setAviso(''); setError('');
    try {
      await catalogoComponentesService.restablecer(empresaId, sociedadId, seleccionado.id, zonaSeleccionada.id, medida.id);
      setBorradores(prev => { const next = { ...prev }; delete next[medida.id]; return next; });
      await recargar(); setAviso('Se restableció la medida base.');
    } catch (err) { setError(err?.message || 'No se pudo restablecer la medida.'); }
    finally { setGuardando(''); }
  };

  const cambiarEstado = async componente => {
    setGuardando(`estado:${componente.id}`); setAviso(''); setError('');
    try {
      await catalogoComponentesService.cambiarEstado(empresaId, sociedadId, componente.id, !componente.activo);
      await recargar(); setAviso(`Componente ${componente.activo ? 'desactivado' : 'activado'}.`);
    } catch (err) { setError(err?.message || 'No se pudo actualizar el componente.'); }
    finally { setGuardando(''); }
  };

  return <div className="cc-overlay" role="presentation" onMouseDown={evento => { if (evento.target === evento.currentTarget) onClose(); }}>
    <section className="cc-panel" role="dialog" aria-modal="true" aria-labelledby="cc-titulo">
      <header className="cc-header"><div><div className="cc-eyebrow">MAESTROS · REFERENCIA TÉCNICA</div><h2 id="cc-titulo">Catálogo de componentes</h2><p>Dibujos base con medidas que puedes personalizar para esta sociedad.</p></div><button type="button" className="cc-close" aria-label="Cerrar catálogo" onClick={onClose}>×</button></header>
      {error && <div className="cc-message is-error" role="alert">{error}</div>}{aviso && <div className="cc-message" role="status">{aviso}</div>}
      {cargando ? <div className="cc-loading">Cargando catálogo…</div> : <div className="cc-layout">
        <aside className="cc-list" aria-label="Componentes">{componentes.map(componente => <div className={`cc-component${seleccionId === componente.id ? ' is-selected' : ''}`} key={componente.id}>
          <button type="button" className="cc-component-select" onClick={() => { setSeleccionId(componente.id); setZonaId(''); }}><strong>{componente.nombre}</strong><span>{componente.descripcion}</span></button>
          <button type="button" role="switch" aria-checked={Boolean(componente.activo)} aria-label={`${componente.activo ? 'Desactivar' : 'Activar'} ${componente.nombre}`} disabled={!puedeEditar || guardando === `estado:${componente.id}`} onClick={() => cambiarEstado(componente)} className={`cc-switch${componente.activo ? ' is-on' : ''}`}><i /></button>
        </div>)}</aside>
        {seleccionado && <main className="cc-detail">
          <div className="cc-drawing"><div className="cc-drawing-title"><strong>{seleccionado.nombre}</strong><span>Selecciona una zona del dibujo</span></div>{svg ? <div className="cc-svg" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="cc-empty">El dibujo no se pudo mostrar.</div>}</div>
          <div className="cc-zones" aria-label="Zonas del componente">{(seleccionado.zonas || []).map(zona => <button key={zona.id} type="button" className={`cc-zone${zona.id === zonaId ? ' is-active' : ''}`} onClick={() => setZonaId(zona.id)}>{zona.nombre}<small>{zona.medidas?.length || 0} medidas</small></button>)}</div>
          {zonaSeleccionada ? <section className="cc-measures"><div className="cc-measures-heading"><div><h3>{zonaSeleccionada.nombre}</h3><p>Medidas y referencias típicas</p></div></div>
            {(zonaSeleccionada.medidas || []).map(base => { const medida = medidas.find(item => item.id === base.id) || base; const personalizado = Boolean(base.personalizado || borradores[base.id]); return <article className="cc-measure" key={base.id}>
              <div className="cc-measure-top"><strong>{base.nombre}</strong>{personalizado ? <span className="cc-pill is-custom">Personalizado</span> : <span className="cc-pill">Base</span>}</div>
              <div className="cc-fields"><label>Nombre<EditableField label="Nombre de medida" value={medida.nombre} disabled={!puedeEditar} onChange={v => actualizarBorrador(base.id, 'nombre', v)} /></label><label>Cota<EditableField label="Cota" value={medida.cota} placeholder={medida.cota == null || medida.cota === '' ? 'Sin cota en el dibujo' : undefined} disabled={!puedeEditar} onChange={v => actualizarBorrador(base.id, 'cota', v)} /></label><label>Dónde se mide<EditableField label="Dónde se mide" multiline value={medida.desde} disabled={!puedeEditar} onChange={v => actualizarBorrador(base.id, 'desde', v)} /></label><label>Referencia típica<EditableField label="Referencia típica" multiline value={medida.referencia} disabled={!puedeEditar} onChange={v => actualizarBorrador(base.id, 'referencia', v)} /></label></div>
              {puedeEditar && <div className="cc-measure-actions">{personalizado && <button type="button" className="cc-link" disabled={guardando === base.id} onClick={() => restablecer(base)}>Restablecer a base</button>}<button type="button" className="cc-save" disabled={!borradores[base.id] || guardando === base.id} onClick={() => guardar(medida)}>{guardando === base.id ? 'Guardando…' : 'Guardar'}</button></div>}
            </article>; })}
          </section> : <div className="cc-prompt">Elige una zona para ver sus medidas.</div>}
        </main>}
      </div>}
      {!puedeEditar && <footer className="cc-readonly">Tienes acceso de solo lectura a este catálogo.</footer>}
    </section>
  </div>;
}
