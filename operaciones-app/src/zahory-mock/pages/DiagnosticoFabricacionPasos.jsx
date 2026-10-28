import { useEffect, useMemo, useRef, useState } from 'react';
import {
  TIPOS_CARACTERISTICA, actualizarPiezaFabricacion, buscarMaterialesCatalogo, crearPiezaFabricacion, eliminarCaracteristica,
  eliminarPiezaFabricacion, faltantesPieza, firmarRutasPlanos, guardarCaracteristica, listarDibujosCatalogo,
  mensajeErrorFabricacion, resumenFabricacion, siguienteNumeroCaracteristica, subirPlanoPieza, usarDibujoCatalogoPieza,
} from '../../services/diagnosticoFabricacionService.js';
import { normalizeSvgViewport, sanitizarSvgCatalogo } from './dibujoHallazgoLogic.js';

// Diagnóstico de fabricación en página (mock docs/diseno/fabricacion/DiagnosticoFabricacion.dc.html).

const etiquetaTipo = tipo => TIPOS_CARACTERISTICA.find(item => item.id === tipo)?.etiqueta || 'Otro';
const textoMaterial = material => (material ? [material.descripcion, material.codigo, material.unidad].filter(Boolean).join(' · ') : '');
const formatoCantidad = valor => Number(valor || 0).toLocaleString('es-PE', { maximumFractionDigits: 3 });
const conSigno = (valor, signo) => (valor === null || valor === undefined || valor === '' ? '' : `${signo}${String(valor).replace(/^[-+−]\s*/, '')}`);
export const textoTolerancia = item => [conSigno(item.tolerancia_menos, '−'), conSigno(item.tolerancia_mas, '+')].filter(Boolean).join(' / ');
const textoValor = item => [item.nominal, textoTolerancia(item), item.unidad].filter(Boolean).join(' ');

function CampoDatos({ datos, onDatos, tecnicos, disabled }) {
  return (
    <section className="dx-fab-card">
      <header><h2>Datos del diagnóstico</h2></header>
      <div className="dx-fab-pad dx-fab-grid">
        <div className="dx-fab-field"><label htmlFor="fab-tecnico">Técnico responsable *</label>
          <select id="fab-tecnico" className="dx-fab-input" value={datos.tecnico_id || ''} disabled={disabled} onChange={event => onDatos({ tecnico_id: event.target.value })}>
            <option value="">Elige…</option>
            {tecnicos.map(tecnico => <option key={tecnico.id} value={tecnico.id}>{tecnico.nombre}</option>)}
          </select>
        </div>
        <div className="dx-fab-field"><label htmlFor="fab-fecha">Fecha de evaluación</label>
          <input id="fab-fecha" className="dx-fab-input" type="date" value={datos.fecha_inspeccion || ''} disabled={disabled} onChange={event => onDatos({ fecha_inspeccion: event.target.value })} />
        </div>
        <div className="dx-fab-field"><label htmlFor="fab-ref">Referencia del cliente</label>
          <input id="fab-ref" className="dx-fab-input" value={datos.referencia_cliente || ''} disabled={disabled} placeholder="Pedido, plano o revisión del cliente" onChange={event => onDatos({ referencia_cliente: event.target.value })} />
        </div>
        <div className="dx-fab-field dx-fab-span"><label htmlFor="fab-req">Requerimiento del cliente</label>
          <textarea id="fab-req" className="dx-fab-input dx-fab-textarea" value={datos.motivo || ''} disabled={disabled} placeholder="Qué pide fabricar el cliente" onChange={event => onDatos({ motivo: event.target.value })} />
        </div>
      </div>
    </section>
  );
}

export function FabricacionOrigenNuevo({ origen, onOrigen, search, onSearch, references, loading, seleccion, onSelect, tecnicos, datos, onDatos, etiquetaReferencia, detalleReferencia, borradores, aviso = null }) {
  return (
    <>
      <section className="dx-fab-card">
        <header>
          <h2>¿De dónde nace el pedido?</h2>
          <div className="dx-fab-seg" role="group" aria-label="Origen del diagnóstico">
            <button type="button" className={origen === 'oportunidad' ? 'on' : ''} aria-pressed={origen === 'oportunidad'} onClick={() => onOrigen('oportunidad')}>Oportunidad</button>
            <button type="button" className={origen === 'recepcion' ? 'on' : ''} aria-pressed={origen === 'recepcion'} onClick={() => onOrigen('recepcion')}>Recepción</button>
          </div>
        </header>
        <div className="dx-fab-pad">
          <label className="dx-ui-search dx-fab-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input value={search} onChange={event => onSearch(event.target.value)} aria-label={origen === 'oportunidad' ? 'Buscar oportunidad' : 'Buscar recepción'} placeholder={origen === 'oportunidad' ? 'Buscar oportunidad o cliente…' : 'Buscar recepción, cliente o activo…'} />
          </label>
        </div>
        <div className="dx-fab-refs" role="radiogroup" aria-label={origen === 'oportunidad' ? 'Oportunidades' : 'Recepciones'}>
          {loading && <p className="dx-fab-empty">Buscando…</p>}
          {!loading && !references.length && <p className="dx-fab-empty">Sin resultados.</p>}
          {!loading && references.map(reference => {
            const on = seleccion?.id === reference.id;
            return (
              <button key={reference.id} type="button" role="radio" aria-checked={on} className={`dx-fab-ref${on ? ' is-on' : ''}`} onClick={() => onSelect(reference)}>
                <span className="dx-ui-icon is-cyan" aria-hidden="true">◎</span>
                <span><b>{etiquetaReferencia(reference)}</b><small>{detalleReferencia ? detalleReferencia(reference) : [reference.cliente, origen === 'recepcion' ? reference.activo : 'Oportunidad'].filter(Boolean).join(' · ')}</small></span>
                {on ? <span className="dx-ui-pill is-cyan"><i />Elegida</span> : borradores?.(reference) > 0 ? <span className="dx-ui-pill is-amber">{borradores(reference)} {borradores(reference) === 1 ? 'borrador' : 'borradores'}</span> : null}
              </button>
            );
          })}
        </div>
      </section>
      {aviso}
      {origen === 'recepcion' && <div className="dx-fab-note">Desde una recepción, el activo recibido sirve de muestra: queda ligado al diagnóstico y la primera pieza toma su nombre.</div>}
      <CampoDatos datos={datos} onDatos={onDatos} tecnicos={tecnicos} />
    </>
  );
}

export function FabricacionOrigenPaso({ origenTexto, datos, onDatos, tecnicos, canEdit, dirty, guardando, onGuardar }) {
  return (
    <>
      <section className="dx-fab-card">
        <header><h2>Origen</h2></header>
        <div className="dx-fab-pad dx-fab-origen"><span className="dx-ui-icon is-cyan" aria-hidden="true">◎</span><div><b>{origenTexto.titulo}</b><small>{origenTexto.detalle}</small></div></div>
      </section>
      <CampoDatos datos={datos} onDatos={onDatos} tecnicos={tecnicos} disabled={!canEdit} />
      {canEdit && <div className="dx-fab-actions"><button type="button" className="dx-btn primary" disabled={!dirty || guardando} onClick={onGuardar}>{guardando ? 'Guardando…' : 'Guardar datos'}</button></div>}
    </>
  );
}

function BuscadorMaterial({ empresaId, value, onChange, disabled }) {
  const [texto, setTexto] = useState(textoMaterial(value));
  const [opciones, setOpciones] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  useEffect(() => { setTexto(textoMaterial(value)); }, [value?.id]);
  useEffect(() => {
    if (!abierto || disabled) return undefined;
    let vigente = true;
    setCargando(true);
    const timer = setTimeout(() => {
      buscarMaterialesCatalogo(empresaId, texto === textoMaterial(value) ? '' : texto)
        .then(rows => { if (vigente) setOpciones(rows); })
        .catch(() => { if (vigente) setOpciones([]); })
        .finally(() => { if (vigente) setCargando(false); });
    }, 250);
    return () => { vigente = false; clearTimeout(timer); };
  }, [abierto, texto, empresaId, disabled]);
  return (
    <div className="dx-fab-combo" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setAbierto(false); }}>
      <input id="fab-material" className="dx-fab-input" role="combobox" aria-expanded={abierto} aria-autocomplete="list" value={texto} disabled={disabled} placeholder="Busca por código o descripción" onFocus={() => setAbierto(true)} onChange={event => { setTexto(event.target.value); setAbierto(true); }} />
      {abierto && !disabled && (
        <div className="dx-fab-combo-menu" role="listbox">
          {cargando && <p className="dx-fab-empty">Buscando…</p>}
          {!cargando && !opciones.length && <p className="dx-fab-empty">No hay materiales activos con ese texto.</p>}
          {!cargando && opciones.map(material => (
            <button key={material.id} type="button" role="option" aria-selected={value?.id === material.id} onMouseDown={event => event.preventDefault()} onClick={() => { onChange(material); setTexto(textoMaterial(material)); setAbierto(false); }}>
              <b>{material.descripcion}</b><small>{[material.codigo, material.unidad].filter(Boolean).join(' · ')}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const PIEZA_VACIA = { nombre: '', cantidad: 1, material: null, observaciones: '' };

export function FabricacionPiezasPaso({ empresaId, diagnosticoId, piezas, onPiezas, canEdit, onVerPlano, nombreSugerido }) {
  const [editando, setEditando] = useState(null);
  const [borrador, setBorrador] = useState(PIEZA_VACIA);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [confirmarBorrar, setConfirmarBorrar] = useState(null);
  const abrir = pieza => {
    setError('');
    if (pieza) { setEditando(pieza.id); setBorrador({ nombre: pieza.nombre, cantidad: pieza.cantidad, material: pieza.material, observaciones: pieza.observaciones || '' }); }
    else { setEditando('nueva'); setBorrador({ ...PIEZA_VACIA, nombre: piezas.length ? '' : (nombreSugerido || '') }); }
  };
  const guardar = async () => {
    setGuardando(true); setError('');
    try {
      const datos = { nombre: borrador.nombre, cantidad: borrador.cantidad, material_id: borrador.material?.id || null, observaciones: borrador.observaciones };
      if (editando === 'nueva') {
        const creada = await crearPiezaFabricacion(empresaId, diagnosticoId, { ...datos, orden: piezas.length + 1 });
        onPiezas([...piezas, { ...creada, material: borrador.material }]);
      } else {
        const guardada = await actualizarPiezaFabricacion(empresaId, editando, datos);
        onPiezas(piezas.map(pieza => pieza.id === editando ? { ...pieza, ...guardada, cantidad: Number(guardada.cantidad), material: borrador.material } : pieza));
      }
      setEditando(null);
    } catch (saveError) { setError(mensajeErrorFabricacion(saveError)); }
    finally { setGuardando(false); }
  };
  const borrar = async pieza => {
    setGuardando(true); setError('');
    try { await eliminarPiezaFabricacion(empresaId, pieza); onPiezas(piezas.filter(item => item.id !== pieza.id)); setConfirmarBorrar(null); if (editando === pieza.id) setEditando(null); }
    catch (deleteError) { setError(mensajeErrorFabricacion(deleteError)); }
    finally { setGuardando(false); }
  };
  const valido = String(borrador.nombre || '').trim() && Number(borrador.cantidad) > 0;
  return (
    <>
      <section className="dx-fab-card">
        <header><h2>Piezas a fabricar</h2><small>{piezas.length} pieza{piezas.length === 1 ? '' : 's'} · cada una con su plano y características</small></header>
        <div className="dx-fab-pieces">
          {piezas.map(pieza => {
            const faltan = faltantesPieza(pieza);
            const criticas = pieza.caracteristicas.filter(item => item.critica).length;
            return (
              <article key={pieza.id} className={`dx-fab-piece${editando === pieza.id ? ' is-on' : ''}`}>
                <div className="dx-fab-piece-top"><span className="dx-ui-icon is-cyan" aria-hidden="true">⚙</span><div><b title={pieza.nombre}>{pieza.nombre}</b><small>Cantidad: {formatoCantidad(pieza.cantidad)}</small></div></div>
                <dl>
                  <dt>Material</dt><dd className={pieza.material_id ? '' : 'is-missing'} title={textoMaterial(pieza.material)}>{pieza.material_id ? textoMaterial(pieza.material) || 'Material del catálogo' : 'Elegir del catálogo'}</dd>
                  <dt>Plano</dt><dd className={pieza.plano_origen ? '' : 'is-missing'}>{pieza.plano_origen === 'subido' ? (pieza.plano_nombre_original || 'Plano subido') : pieza.plano_origen === 'catalogo' ? 'Dibujo del catálogo' : 'Sin plano'}</dd>
                  <dt>Características</dt><dd>{pieza.caracteristicas.length ? `${pieza.caracteristicas.length} (${criticas} crítica${criticas === 1 ? '' : 's'})` : '—'}</dd>
                </dl>
                {faltan.length > 0 && <span className="dx-ui-pill is-amber"><i />Falta {faltan.join(' y ')}</span>}
                <div className="dx-fab-piece-actions">
                  {canEdit && <button type="button" className="dx-btn" onClick={() => abrir(pieza)}>Editar</button>}
                  <button type="button" className="dx-btn primary" onClick={() => onVerPlano(pieza.id)}>{pieza.plano_origen ? 'Ver plano' : canEdit ? 'Agregar plano' : 'Ver'}</button>
                </div>
                {canEdit && (confirmarBorrar === pieza.id
                  ? <div className="dx-fab-confirm" role="alert">¿Quitar la pieza, su plano y sus características? <button type="button" className="dx-btn danger" disabled={guardando} onClick={() => borrar(pieza)}>Quitar</button><button type="button" className="dx-btn" onClick={() => setConfirmarBorrar(null)}>Cancelar</button></div>
                  : <button type="button" className="dx-fab-link-danger" onClick={() => setConfirmarBorrar(pieza.id)}>Quitar pieza</button>)}
              </article>
            );
          })}
          {canEdit && <button type="button" className="dx-fab-add" onClick={() => abrir(null)}><span aria-hidden="true">＋</span>Agregar pieza</button>}
          {!canEdit && !piezas.length && <p className="dx-fab-empty">Este diagnóstico no tiene piezas.</p>}
        </div>
      </section>
      {editando && (
        <section className="dx-fab-card" aria-label="Editar pieza">
          <header><h2>{editando === 'nueva' ? 'Nueva pieza' : `Editar pieza · ${borrador.nombre}`}</h2></header>
          <div className="dx-fab-pad dx-fab-grid">
            <div className="dx-fab-field"><label htmlFor="fab-pieza-nombre">Nombre de la pieza *</label><input id="fab-pieza-nombre" className="dx-fab-input" value={borrador.nombre} onChange={event => setBorrador(current => ({ ...current, nombre: event.target.value }))} /></div>
            <div className="dx-fab-field"><label htmlFor="fab-pieza-cantidad">Cantidad *</label><input id="fab-pieza-cantidad" className="dx-fab-input" type="number" min="0" step="any" inputMode="decimal" value={borrador.cantidad} onChange={event => setBorrador(current => ({ ...current, cantidad: event.target.value }))} /></div>
            <div className="dx-fab-field"><label htmlFor="fab-material">Material (catálogo de materiales)</label><BuscadorMaterial empresaId={empresaId} value={borrador.material} onChange={material => setBorrador(current => ({ ...current, material }))} /><span className="dx-fab-hint">Obligatorio para emitir. Solo materiales activos de la empresa.</span></div>
            <div className="dx-fab-field dx-fab-span"><label htmlFor="fab-pieza-obs">Observaciones</label><input id="fab-pieza-obs" className="dx-fab-input" value={borrador.observaciones} placeholder="Tratamiento, norma, notas del cliente…" onChange={event => setBorrador(current => ({ ...current, observaciones: event.target.value }))} /></div>
          </div>
          {error && <div className="dx-fab-error" role="alert">{error}</div>}
          <div className="dx-fab-actions"><button type="button" className="dx-btn" onClick={() => setEditando(null)}>Cancelar</button><button type="button" className="dx-btn primary" disabled={!valido || guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar pieza'}</button></div>
        </section>
      )}
      {!editando && error && <div className="dx-fab-error" role="alert">{error}</div>}
    </>
  );
}

// Dibujo del catálogo con el estilo de Hallazgos: partes (data-z) marcadas y cotas (data-cota) encendidas.
const marcarAtributo = (svg, atributo, ids, clase) => svg.replace(new RegExp(`(<[^>]+${atributo}=["']([^"']+)["'][^>]*)(>)`, 'gi'), (todo, abre, id, cierra) => {
  if (!ids.has(id)) return todo;
  const clases = [...new Set([...(abre.match(/\bclass=["']([^"']*)["']/i)?.[1]?.split(/\s+/).filter(Boolean) || []), clase])];
  const autocierre = /\/\s*$/.test(abre);
  const base = abre.replace(/\s*\/\s*$/, '').replace(/\s+class=["'][^"']*["']/i, '');
  return `${base} class="${clases.join(' ')}"${autocierre ? ' /' : ''}${cierra}`;
});
export function markupDibujoCatalogo(svg, zonasMarcadas = [], cotasEncendidas = []) {
  if (!svg) return '';
  let salida = normalizeSvgViewport(sanitizarSvgCatalogo(svg));
  salida = marcarAtributo(salida, 'data-z', new Set(zonasMarcadas.filter(Boolean)), 'is-marked');
  return marcarAtributo(salida, 'data-cota', new Set(cotasEncendidas.filter(Boolean)), 'c-on');
}

const CARACTERISTICA_VACIA = { nombre: '', tipo: 'cota', nominal: '', tolerancia_menos: '', tolerancia_mas: '', unidad: 'mm', critica: false };

export function FabricacionPlanoPaso({ empresaId, sociedadId, diagnosticoId, piezas, onPiezas, piezaId, onPiezaId, canEdit }) {
  const pieza = piezas.find(item => item.id === piezaId) || piezas[0] || null;
  const [urlPlano, setUrlPlano] = useState('');
  const [dibujos, setDibujos] = useState([]);
  const [errorDibujos, setErrorDibujos] = useState('');
  const [elegirDibujo, setElegirDibujo] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [seleccion, setSeleccion] = useState(null);
  const [borrador, setBorrador] = useState(null);
  const [mover, setMover] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const inputRef = useRef(null);
  const lienzoRef = useRef(null);

  useEffect(() => { setSeleccion(null); setBorrador(null); setMover(false); setError(''); setElegirDibujo(false); }, [pieza?.id]);
  useEffect(() => {
    let vigente = true;
    setUrlPlano('');
    if (pieza?.plano_origen === 'subido' && pieza.plano_imagen_ruta) {
      firmarRutasPlanos([pieza.plano_imagen_ruta]).then(mapa => { if (vigente) setUrlPlano(mapa.get(pieza.plano_imagen_ruta) || ''); }).catch(() => { if (vigente) setError('No se pudo abrir el plano.'); });
    }
    return () => { vigente = false; };
  }, [pieza?.plano_imagen_ruta, pieza?.plano_origen]);
  useEffect(() => {
    let vigente = true;
    if ((pieza?.plano_origen === 'catalogo' || elegirDibujo) && !dibujos.length) {
      setErrorDibujos('');
      listarDibujosCatalogo(empresaId, sociedadId).then(rows => { if (vigente) setDibujos(rows); }).catch(loadError => { if (vigente) setErrorDibujos(loadError?.message || 'No se pudieron cargar los dibujos del catálogo.'); });
    }
    return () => { vigente = false; };
  }, [pieza?.plano_origen, elegirDibujo, empresaId, sociedadId]);

  const componente = useMemo(() => dibujos.find(item => item.id === pieza?.componente_catalogo_id) || null, [dibujos, pieza?.componente_catalogo_id]);
  const svgCatalogo = componente?.svg || '';
  if (!pieza) return <section className="dx-fab-card"><p className="dx-fab-empty">Primero agrega una pieza en el paso 2.</p></section>;

  const actualizarPieza = cambios => onPiezas(piezas.map(item => item.id === pieza.id ? { ...item, ...cambios } : item));
  const subir = async archivo => {
    if (!archivo) return;
    setSubiendo(true); setError('');
    try { const guardada = await subirPlanoPieza(empresaId, diagnosticoId, pieza, archivo, { pagina }); actualizarPieza(guardada); }
    catch (uploadError) { setError(mensajeErrorFabricacion(uploadError)); }
    finally { setSubiendo(false); if (inputRef.current) inputRef.current.value = ''; }
  };
  const usarDibujo = async componenteId => {
    setSubiendo(true); setError('');
    try { const guardada = await usarDibujoCatalogoPieza(empresaId, pieza, componenteId); actualizarPieza(guardada); setElegirDibujo(false); }
    catch (saveError) { setError(mensajeErrorFabricacion(saveError)); }
    finally { setSubiendo(false); }
  };
  const posicion = event => {
    const caja = lienzoRef.current?.getBoundingClientRect();
    if (!caja || !caja.width || !caja.height) return null;
    return {
      pos_x: Math.round(Math.min(100, Math.max(0, ((event.clientX - caja.left) / caja.width) * 100)) * 100) / 100,
      pos_y: Math.round(Math.min(100, Math.max(0, ((event.clientY - caja.top) / caja.height) * 100)) * 100) / 100,
    };
  };
  const zonaPorId = id => (componente?.zonas || []).find(zona => zona.id === id) || null;
  // La parte bajo el dedo, aunque se toque un detalle del dibujo (rosca, línea de centro) que no es la parte.
  const zonaBajoElPunto = event => {
    const directa = event.target.closest?.('[data-z]');
    if (directa) return directa;
    const raiz = lienzoRef.current?.getRootNode?.();
    const pila = raiz?.elementsFromPoint?.(event.clientX, event.clientY) || [];
    return pila.map(nodo => nodo.closest?.('[data-z]')).find(nodo => nodo && lienzoRef.current?.contains(nodo)) || null;
  };
  const tocarPlano = event => {
    if (!canEdit || event.target.closest?.('.dx-fab-pin')) return;
    if (pieza.plano_origen === 'catalogo') {
      const zonaId = zonaBajoElPunto(event)?.getAttribute('data-z');
      if (!zonaId) { setError('Toca una parte del dibujo (camisa, vástago, tapas…).'); return; }
      setError('');
      const punto = posicion(event);
      if (!punto) return;
      if (borrador && (mover || !borrador.id)) {
        setBorrador(current => ({ ...current, ...punto, zona_id: zonaId, medida_id: current.zona_id === zonaId ? current.medida_id : null }));
        setMover(false);
        return;
      }
      setSeleccion(null);
      setBorrador({ ...CARACTERISTICA_VACIA, numero: siguienteNumeroCaracteristica(pieza.caracteristicas), ...punto, zona_id: zonaId, medida_id: null });
      return;
    }
    const punto = posicion(event);
    if (!punto) return;
    if (borrador && (mover || !borrador.id)) { setBorrador(current => ({ ...current, ...punto })); setMover(false); return; }
    setSeleccion(null);
    setBorrador({ ...CARACTERISTICA_VACIA, numero: siguienteNumeroCaracteristica(pieza.caracteristicas), ...punto });
  };
  const elegir = item => { setSeleccion(item.id); setBorrador({ ...item }); setMover(false); setError(''); };
  const guardarBorrador = async () => {
    setGuardando(true); setError('');
    try {
      const guardada = await guardarCaracteristica(empresaId, pieza.id, borrador);
      const lista = borrador.id ? pieza.caracteristicas.map(item => item.id === guardada.id ? guardada : item) : [...pieza.caracteristicas, guardada];
      actualizarPieza({ caracteristicas: lista.sort((a, b) => a.numero - b.numero) });
      setSeleccion(guardada.id); setBorrador({ ...guardada });
    } catch (saveError) { setError(mensajeErrorFabricacion(saveError)); }
    finally { setGuardando(false); }
  };
  const borrarBorrador = async () => {
    if (!borrador?.id) { setBorrador(null); return; }
    setGuardando(true); setError('');
    try { await eliminarCaracteristica(empresaId, borrador.id); actualizarPieza({ caracteristicas: pieza.caracteristicas.filter(item => item.id !== borrador.id) }); setBorrador(null); setSeleccion(null); }
    catch (deleteError) { setError(mensajeErrorFabricacion(deleteError)); }
    finally { setGuardando(false); }
  };

  const pines = [...pieza.caracteristicas.filter(item => item.id !== borrador?.id), ...(borrador ? [borrador] : [])];
  const medidaDe = item => zonaPorId(item.zona_id)?.medidas?.find(medida => medida.id === item.medida_id) || null;
  const markupCatalogo = pieza.plano_origen === 'catalogo' ? markupDibujoCatalogo(svgCatalogo, pines.map(item => item.zona_id), pines.map(item => medidaDe(item)?.cota)) : '';
  const zonaBorrador = borrador?.zona_id ? zonaPorId(borrador.zona_id) : null;
  const tienePlano = pieza.plano_origen === 'subido' ? Boolean(urlPlano) : pieza.plano_origen === 'catalogo' ? Boolean(svgCatalogo) : false;
  const criticas = pieza.caracteristicas.filter(item => item.critica).length;

  return (
    <>
      <div className="dx-fab-tabs" role="tablist" aria-label="Piezas">
        {piezas.map(item => <button key={item.id} type="button" role="tab" aria-selected={item.id === pieza.id} className={`dx-fab-tab${item.id === pieza.id ? ' on' : ''}`} onClick={() => onPiezaId(item.id)}>{item.nombre}{item.caracteristicas.length ? ` · ${item.caracteristicas.length}` : ''}</button>)}
      </div>
      <div className="dx-fab-plan-layout">
        <section className="dx-fab-card">
          <header><h2>Plano · {pieza.nombre}</h2>{canEdit && tienePlano && <small>{pieza.plano_origen === 'catalogo' ? (borrador && (mover || !borrador.id) ? 'Toca la parte donde va el pin' : 'Toca una parte del dibujo') : borrador && (mover || !borrador.id) ? 'Toca el plano para ubicar el pin' : 'Toca el plano para poner un pin'}</small>}</header>
          {canEdit && (
            <div className="dx-fab-src" role="group" aria-label="Origen del plano">
              <button type="button" className={pieza.plano_origen === 'subido' ? 'on' : ''} disabled={subiendo} onClick={() => inputRef.current?.click()}>⤒ {pieza.plano_origen === 'subido' ? 'Reemplazar plano' : 'Subir plano o foto'}</button>
              {(!pieza.plano_origen || pieza.plano_mime === 'application/pdf') && <label className="dx-fab-page" title="Página que se usa al subir un PDF">Página del PDF<input type="number" min="1" value={pagina} onChange={event => setPagina(Math.max(1, Number(event.target.value) || 1))} /></label>}
              <button type="button" className={pieza.plano_origen === 'catalogo' || elegirDibujo ? 'on' : ''} disabled={subiendo} onClick={() => setElegirDibujo(open => !open)}>▦ Dibujo del catálogo</button>
              <button type="button" className="is-soon" disabled title="Fase 2">✎ Plano de Ingeniería · próximamente</button>
              <input ref={inputRef} type="file" hidden accept="image/jpeg,image/png,image/webp,application/pdf" onChange={event => subir(event.target.files?.[0])} />
            </div>
          )}
          {elegirDibujo && canEdit && (
            <div className="dx-fab-dibujos" role="listbox" aria-label="Dibujos del catálogo">
              {!dibujos.length && <p className="dx-fab-empty" role={errorDibujos ? 'alert' : undefined}>{errorDibujos || 'Cargando dibujos…'}</p>}
              {dibujos.map(dibujo => (
                <button key={dibujo.id} type="button" role="option" aria-selected={pieza.componente_catalogo_id === dibujo.id} className={pieza.componente_catalogo_id === dibujo.id ? 'is-on' : ''} onClick={() => usarDibujo(dibujo.id)}>
                  <span className="dx-fab-dibujo-mini" dangerouslySetInnerHTML={{ __html: markupDibujoCatalogo(dibujo.svg) }} /><b>{dibujo.nombre}</b>
                </button>
              ))}
            </div>
          )}
          {subiendo && <p className="dx-fab-empty" role="status">Procesando plano…</p>}
          {!subiendo && !pieza.plano_origen && <p className="dx-fab-empty">{canEdit ? 'Sube el plano del cliente (imagen o PDF) o elige un dibujo del catálogo.' : 'Esta pieza no tiene plano.'}</p>}
          {!subiendo && pieza.plano_origen && !tienePlano && <p className="dx-fab-empty" role="status">Cargando plano…</p>}
          {!subiendo && tienePlano && (
            <div ref={lienzoRef} className={`dx-fab-canvas${canEdit ? ' is-editable' : ''}`} onClick={tocarPlano}>
              {pieza.plano_origen === 'subido'
                ? <img src={urlPlano} alt={`Plano de ${pieza.nombre}`} draggable="false" />
                : <span className="dx-fab-svg" dangerouslySetInnerHTML={{ __html: markupCatalogo }} />}
              {pines.map(item => (
                <button key={item.id || 'nuevo'} type="button" className={`dx-fab-pin${item.critica ? ' is-crit' : ''}${(item.id && item.id === seleccion) || (!item.id && borrador) ? ' is-sel' : ''}`} style={{ left: `${item.pos_x}%`, top: `${item.pos_y}%` }} aria-label={`Característica ${item.numero}${item.nombre ? `: ${item.nombre}` : ''}`} onClick={() => item.id && elegir(item)}>{item.numero}</button>
              ))}
            </div>
          )}
          {pieza.plano_origen === 'subido' && pieza.plano_nombre_original && <p className="dx-fab-hint dx-fab-pad-x">{pieza.plano_nombre_original}{pieza.plano_pagina ? ` · página ${pieza.plano_pagina}` : ''}</p>}
          {error && <div className="dx-fab-error" role="alert">{error}</div>}
        </section>

        <section className="dx-fab-card">
          <header><h2>Características</h2><small>{pieza.caracteristicas.length} · {criticas} crítica{criticas === 1 ? '' : 's'}</small></header>
          {borrador && (
            <div className="dx-fab-editor" aria-label={`Característica ${borrador.numero}`}>
              {zonaBorrador && (
                <div className="dx-fab-zona">
                  <span>Parte: <b>{zonaBorrador.nombre}</b></span>
                  {(zonaBorrador.medidas || []).length > 0 && canEdit && <div className="dx-fab-medidas" role="group" aria-label={`Medidas de ${zonaBorrador.nombre}`}>
                    {zonaBorrador.medidas.map(medida => (
                      <button key={medida.id} type="button" className={borrador.medida_id === medida.id ? 'on' : ''} aria-pressed={borrador.medida_id === medida.id} title={[medida.desde, medida.referencia].filter(Boolean).join(' · ') || undefined} onClick={() => setBorrador(current => current.medida_id === medida.id ? { ...current, medida_id: null } : { ...current, medida_id: medida.id, nombre: medida.nombre, tipo: 'cota' })}>{medida.nombre}</button>
                    ))}
                  </div>}
                  {medidaDe(borrador) && (medidaDe(borrador).desde || medidaDe(borrador).referencia) && <small>{[medidaDe(borrador).desde && `Se mide: ${medidaDe(borrador).desde}`, medidaDe(borrador).referencia && `Referencia típica: ${medidaDe(borrador).referencia}`].filter(Boolean).join(' · ')}</small>}
                </div>
              )}
              <div className="dx-fab-field wide"><label htmlFor="fab-car-nombre">Característica {borrador.numero} *</label><input id="fab-car-nombre" className="dx-fab-input" value={borrador.nombre} disabled={!canEdit} placeholder={zonaBorrador ? 'Elige una medida o escribe una característica' : undefined} onChange={event => setBorrador(current => ({ ...current, nombre: event.target.value }))} /></div>
              <div className="dx-fab-field wide"><label htmlFor="fab-car-tipo">Tipo</label><select id="fab-car-tipo" className="dx-fab-input" value={borrador.tipo} disabled={!canEdit} onChange={event => setBorrador(current => ({ ...current, tipo: event.target.value }))}>{TIPOS_CARACTERISTICA.map(tipo => <option key={tipo.id} value={tipo.id}>{tipo.etiqueta}</option>)}</select></div>
              <div className="dx-fab-field"><label htmlFor="fab-car-nominal">Nominal</label><input id="fab-car-nominal" className="dx-fab-input" value={borrador.nominal || ''} disabled={!canEdit} onChange={event => setBorrador(current => ({ ...current, nominal: event.target.value }))} /></div>
              <div className="dx-fab-field"><label htmlFor="fab-car-tmenos">Tolerancia −</label><input id="fab-car-tmenos" className="dx-fab-input" value={borrador.tolerancia_menos || ''} disabled={!canEdit} onChange={event => setBorrador(current => ({ ...current, tolerancia_menos: event.target.value }))} /></div>
              <div className="dx-fab-field"><label htmlFor="fab-car-tmas">Tolerancia +</label><input id="fab-car-tmas" className="dx-fab-input" value={borrador.tolerancia_mas || ''} disabled={!canEdit} onChange={event => setBorrador(current => ({ ...current, tolerancia_mas: event.target.value }))} /></div>
              <div className="dx-fab-field"><label htmlFor="fab-car-unidad">Unidad</label><input id="fab-car-unidad" className="dx-fab-input" value={borrador.unidad || ''} disabled={!canEdit} onChange={event => setBorrador(current => ({ ...current, unidad: event.target.value }))} /></div>
              <label className="dx-fab-check"><input type="checkbox" checked={Boolean(borrador.critica)} disabled={!canEdit} onChange={event => setBorrador(current => ({ ...current, critica: event.target.checked }))} /> Crítica</label>
              {canEdit && (
                <div className="dx-fab-editor-actions">
                  {borrador.id && <button type="button" className={`dx-btn${mover ? ' primary' : ''}`} onClick={() => setMover(value => !value)}>{mover ? (pieza.plano_origen === 'catalogo' ? 'Toca otra parte…' : 'Toca el plano…') : 'Mover pin'}</button>}
                  <button type="button" className="dx-btn danger" disabled={guardando} onClick={borrarBorrador}>{borrador.id ? 'Quitar' : 'Descartar'}</button>
                  <button type="button" className="dx-btn" onClick={() => { setBorrador(null); setSeleccion(null); setMover(false); }}>Cerrar</button>
                  <button type="button" className="dx-btn primary" disabled={guardando || !String(borrador.nombre || '').trim()} onClick={guardarBorrador}>{guardando ? 'Guardando…' : 'Guardar'}</button>
                </div>
              )}
            </div>
          )}
          <div className="dx-fab-chars">
            {!pieza.caracteristicas.length && <p className="dx-fab-empty">{canEdit ? (pieza.plano_origen === 'catalogo' ? 'Aún no hay características. Toca una parte del dibujo para poner el primer pin.' : 'Aún no hay características. Toca el plano para poner el primer pin.') : 'Sin características.'}</p>}
            {pieza.caracteristicas.map(item => (
              <div key={item.id} className={`dx-fab-char${item.id === seleccion ? ' is-sel' : ''}`} role="button" tabIndex={0} aria-label={`Editar característica ${item.numero}: ${item.nombre}`} onClick={() => elegir(item)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); elegir(item); } }}>
                <span className={`dx-fab-char-n${item.critica ? ' is-crit' : ''}`}>{item.numero}</span>
                <div><b>{item.nombre}</b><small>{etiquetaTipo(item.tipo)}{zonaPorId(item.zona_id) ? ` · ${zonaPorId(item.zona_id).nombre}` : ''}{item.critica ? ' · crítica' : ''}</small></div>
                <span className="dx-fab-val">{textoValor(item) || '—'}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

export function FabricacionRevisionPaso({ piezas, totalTareas, totalHH, trabajosIncompletos = [], cambiosSinGuardar = false, emitido = false, origenTexto, resumen, onResumen, canEdit, children }) {
  const datos = resumenFabricacion(piezas);
  const incompletas = piezas.filter(pieza => faltantesPieza(pieza).length);
  return (
    <>
      <div className="dx-fab-review">
        <section className="dx-fab-card">
          <header><h2>Revisión</h2></header>
          <div className="dx-fab-kpis">
            <div className="dx-fab-kpi"><b>{datos.piezas}</b><span>pieza{datos.piezas === 1 ? '' : 's'} ({formatoCantidad(datos.unidades)} und)</span></div>
            <div className="dx-fab-kpi"><b>{datos.caracteristicas}</b><span>características · {datos.criticas} críticas</span></div>
            <div className="dx-fab-kpi"><b>{totalTareas}</b><span>tareas</span></div>
            <div className="dx-fab-kpi"><b>{totalHH.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h</b><span>horas-hombre</span></div>
          </div>
          <ul className="dx-fab-checklist">
            <li>Origen: {origenTexto.titulo}</li>
            {!piezas.length && <li className="is-warn">Agrega al menos una pieza</li>}
            {piezas.map(pieza => {
              const faltan = faltantesPieza(pieza);
              return <li key={pieza.id} className={faltan.length ? 'is-warn' : ''}>{pieza.nombre}: {faltan.length ? `falta ${faltan.join(' y ')}` : `material y plano con ${pieza.caracteristicas.length} característica${pieza.caracteristicas.length === 1 ? '' : 's'}`}</li>;
            })}
            <li className={totalTareas && totalHH > 0 ? '' : 'is-warn'}>{!totalTareas ? 'Sin trabajos a realizar' : totalHH > 0 ? `${totalTareas} tarea${totalTareas === 1 ? '' : 's'} con horas` : `${totalTareas} tarea${totalTareas === 1 ? '' : 's'} sin horas-hombre`}</li>
            {trabajosIncompletos.length > 0 && <li className="is-warn">Hay trabajos sin actividades ni tareas: {trabajosIncompletos.join(', ')}</li>}
            {!emitido && cambiosSinGuardar && <li className="is-warn">Hay cambios sin guardar</li>}
            {!emitido && <li className="is-info">Al emitir, el diagnóstico queda de solo lectura. Después podrás generar la Hoja de Costeo desde aquí.</li>}
          </ul>
          <div className="dx-fab-pad"><div className="dx-fab-field"><label htmlFor="fab-conclusion">Conclusión para el cliente</label><textarea id="fab-conclusion" className="dx-fab-input dx-fab-textarea" value={resumen} disabled={!canEdit} placeholder="Factibilidad, consideraciones de fabricación y control…" onChange={event => onResumen(event.target.value)} /></div></div>
        </section>
        <section className="dx-fab-card">
          <header><h2>Ficha técnica para el cliente</h2><small>Vista previa</small></header>
          <div className="dx-fab-sheet">
            <h3>Ficha técnica de fabricación</h3>
            <div>{origenTexto.titulo}</div>
            {piezas.map((pieza, index) => (
              <div key={pieza.id} className="dx-fab-sheet-piece">
                <b>{index + 1} · {pieza.nombre} · {formatoCantidad(pieza.cantidad)} und{pieza.material ? ` · ${pieza.material.descripcion}` : ''}</b>
                {pieza.caracteristicas.length > 0 && <table><thead><tr><th>#</th><th>Característica</th><th>Nominal</th><th>Tol.</th><th>Crítica</th></tr></thead><tbody>{pieza.caracteristicas.map(item => <tr key={item.id}><td>{item.numero}</td><td>{item.nombre}</td><td>{[item.nominal, item.unidad].filter(Boolean).join(' ') || '—'}</td><td>{textoTolerancia(item) || '—'}</td><td>{item.critica ? 'Sí' : ''}</td></tr>)}</tbody></table>}
              </div>
            ))}
            {!piezas.length && <p className="dx-fab-empty">Sin piezas.</p>}
          </div>
          <p className="dx-fab-hint dx-fab-pad-x">El PDF con el plano globeado llega en la siguiente etapa.</p>
        </section>
      </div>
      {incompletas.length > 0 && <div className="dx-fab-note is-amber">Para emitir, todas las piezas deben tener material y plano. Faltan: {incompletas.map(pieza => pieza.nombre).join(', ')}.</div>}
      {children}
    </>
  );
}
