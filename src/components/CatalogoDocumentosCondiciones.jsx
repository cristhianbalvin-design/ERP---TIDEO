import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context.jsx';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';
import { SOCIEDAD_TODAS_ID } from '../services/sociedadesService.js';
import { RichTextEditor, normalizeRichTextDocument } from './RichTextEditor.jsx';
import { VARIABLES_COMERCIALES } from '../lib/textoComercial.js';
import { ConstructorBloquesEditor } from './ConstructorBloquesEditor.jsx';

const modulosPorCategoria = (categoriaBase, accion) => {
  if (categoriaBase === 'cotizacion') return ['parametros'];
  if (categoriaBase === 'contrato_laboral' && accion === 'ver') return ['rrhh_admin', 'rrhh_operativo'];
  if (categoriaBase === 'contrato_laboral' && ['crear', 'editar'].includes(accion)) return ['rrhh_admin'];
  return [];
};
const can = (role, categoriaBase, accion) => Boolean(
  role?.permisos?.todo
  || role?.es_admin_empresa
  || modulosPorCategoria(categoriaBase, accion).some(modulo => role?.permisos?.[accion]?.includes?.(modulo))
);
const scopeFilter = (query, sociedadId) => sociedadId ? query.eq('sociedad_id', sociedadId) : query.is('sociedad_id', null);

export function CatalogoDocumentosCondiciones({ active }) {
  const { empresa, sociedadActiva, role, authUser, addNotificacion, addToast } = useApp();
  const [tipos, setTipos] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [bibliotecas, setBibliotecas] = useState([]);
  const [draft, setDraft] = useState(null);
  const [segmentos, setSegmentos] = useState([]);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const cargaBibliotecaId = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nuevoTipo, setNuevoTipo] = useState({ codigo:'', nombre:'', motor_contenido:'condiciones_generales' });
  const [guardandoSegmento, setGuardandoSegmento] = useState(null);
  const [publicando, setPublicando] = useState(false);
  const [marcandoDefaultId, setMarcandoDefaultId] = useState(null);
  const puedeCrearCotizacion = can(role, 'cotizacion', 'crear');
  const puedeEditarCotizacion = can(role, 'cotizacion', 'editar');
  const puedeCrear = puedeCrearCotizacion;
  const puedeEditar = puedeEditarCotizacion;
  const sociedadId = empresa?.multisociedad_habilitado ? (sociedadActiva?.id === SOCIEDAD_TODAS_ID ? null : sociedadActiva?.id || null) : null;
  const requiereSociedad = Boolean(empresa?.multisociedad_habilitado && !sociedadId);
  const tipoSeleccionadoReal = tipos.find(tipo => tipo.id === selectedId) || null;
  const esConstructorBloques = tipoSeleccionadoReal?.motor_contenido === 'constructor_bloques';
  const tipoSeleccionado = esConstructorBloques ? null : tipoSeleccionadoReal;
  const publicada = useMemo(() => bibliotecas.filter(b => b.estado === 'publicada').sort((a,b) => b.version - a.version)[0] || null, [bibliotecas]);
  const historial = useMemo(() => bibliotecas.filter(b => b.estado === 'archivada').sort((a,b) => b.version - a.version), [bibliotecas]);

  const cargarTipos = useCallback(async () => {
    if (!active || !empresa?.id || requiereSociedad || !isSupabaseConfigured()) return;
    setLoading(true); setError('');
    try {
      const sb = await getSupabaseClient();
      const { data, error: queryError } = await scopeFilter(
        sb.from('tipos_documento_electronico').select('*').eq('empresa_id', empresa.id).in('categoria_base', ['cotizacion', 'contrato_laboral']).order('nombre'),
        sociedadId,
      );
      if (queryError) throw queryError;
      setTipos(data || []);
      setSelectedId(prev => (data || []).some(tipo => tipo.id === prev) ? prev : (data || []).find(tipo => tipo.es_default_para_categoria)?.id || data?.[0]?.id || '');
    } catch (err) { setError(err.message || 'No se pudo cargar el catálogo.'); }
    finally { setLoading(false); }
  }, [active, empresa?.id, requiereSociedad, sociedadId]);

  const cargarBibliotecas = useCallback(async () => {
    const cargaId = ++cargaBibliotecaId.current;
    if (!selectedId || esConstructorBloques || !isSupabaseConfigured()) {
      if (cargaId === cargaBibliotecaId.current) { setBibliotecas([]); setDraft(null); setSegmentos([]); }
      return;
    }
    try {
      const sb = await getSupabaseClient();
      const { data, error: queryError } = await sb.from('biblioteca_condiciones_generales').select('*').eq('tipo_documento_id', selectedId).order('version', { ascending:false });
      if (queryError) throw queryError;
      if (cargaId !== cargaBibliotecaId.current) return;
      const rows = data || [];
      setBibliotecas(rows);
      const borrador = rows.find(row => row.estado === 'borrador') || null;
      setDraft(borrador);
      const base = borrador || rows.find(row => row.estado === 'publicada') || null;
      if (!base) { setSegmentos([]); return; }
      const { data: segs, error: segError } = await sb.from('condiciones_generales_segmentos').select('*').eq('condiciones_generales_id', base.id).eq('activo', true).order('orden');
      if (segError) throw segError;
      if (cargaId !== cargaBibliotecaId.current) return;
      setSegmentos(segs || []);
    } catch (err) { if (cargaId === cargaBibliotecaId.current) setError(err.message || 'No se pudo cargar la biblioteca.'); }
  }, [selectedId, esConstructorBloques]);

  useEffect(() => { cargarTipos(); }, [cargarTipos]);
  useEffect(() => { cargarBibliotecas(); }, [cargarBibliotecas]);

  const seleccionarTipo = id => {
    if (id === selectedId) return;
    cargaBibliotecaId.current += 1;
    setSelectedId(id);
    setBibliotecas([]);
    setDraft(null);
    setSegmentos([]);
    setMostrarHistorial(false);
  };

  const crearTipo = async () => {
    if (!nuevoTipo.codigo.trim() || !nuevoTipo.nombre.trim()) return setError('Código y nombre son obligatorios.');
    try {
      const sb = await getSupabaseClient();
      const { data, error: insertError } = await sb.from('tipos_documento_electronico').insert({
        empresa_id: empresa.id, sociedad_id: sociedadId, codigo: nuevoTipo.codigo.trim().toUpperCase(), nombre: nuevoTipo.nombre.trim(), categoria_base:'cotizacion', motor_contenido:nuevoTipo.motor_contenido, activo:true,
      }).select().single();
      if (insertError) throw insertError;
      setNuevoTipo({ codigo:'', nombre:'', motor_contenido:'condiciones_generales' }); setTipos(prev => [...prev, data].sort((a,b) => a.nombre.localeCompare(b.nombre))); setSelectedId(data.id);
    } catch (err) { setError(err.message || 'No se pudo crear el tipo.'); }
  };

  const marcarDefault = async tipo => {
    setMarcandoDefaultId(tipo.id);
    setError('');
    try {
      const sb = await getSupabaseClient();
    let q = sb.from('tipos_documento_electronico').update({ es_default_para_categoria:false }).eq('empresa_id', empresa.id).eq('categoria_base', tipo.categoria_base);
      q = scopeFilter(q, sociedadId);
      const { error: clearError } = await q;
      if (clearError) throw clearError;
      const { error: setErrorDefault } = await sb.from('tipos_documento_electronico').update({ es_default_para_categoria:true }).eq('id', tipo.id);
      if (setErrorDefault) throw setErrorDefault;
      setTipos(prev => prev.map(row => ({ ...row, es_default_para_categoria: row.id === tipo.id })));
      addToast?.(`"${tipo.nombre}" ahora es el tipo predeterminado.`, 'success');
    } catch (err) { setError(err.message || 'No se pudo actualizar el tipo default.'); }
    finally { setMarcandoDefaultId(null); }
  };

  const crearBorrador = async (origen = publicada) => {
    if (!tipoSeleccionado) return;
    try {
      const sb = await getSupabaseClient();
      const version = Math.max(0, ...bibliotecas.map(row => Number(row.version || 0))) + 1;
      const { data: nueva, error: createError } = await sb.from('biblioteca_condiciones_generales').insert({
        empresa_id: empresa.id, sociedad_id: sociedadId, tipo_documento_id: tipoSeleccionado.id,
        nombre_interno: origen?.nombre_interno || 'Condiciones generales', version, estado:'borrador', created_by:authUser?.id || null,
      }).select().single();
      if (createError) throw createError;
      let cloned = [];
      if (origen) {
        const { data: origenSegs, error: sourceError } = await sb.from('condiciones_generales_segmentos').select('*').eq('condiciones_generales_id', origen.id).eq('activo',true).order('orden');
        if (sourceError) throw sourceError;
        const { data, error: cloneError } = await sb.from('condiciones_generales_segmentos').insert((origenSegs || []).map(seg => ({
          condiciones_generales_id:nueva.id, titulo:seg.titulo, contenido_json:seg.contenido_json, contenido_texto_plano:seg.contenido_texto_plano, orden:seg.orden, activo:true,
        }))).select().order('orden');
        if (cloneError) throw cloneError;
        cloned = data || [];
      }
      setBibliotecas(prev => [nueva, ...prev]); setDraft(nueva); setSegmentos(cloned);
      addNotificacion?.(`Borrador v${version} creado.`);
    } catch (err) { setError(err.message || 'No se pudo crear el borrador.'); }
  };

  const guardarSegmento = async (bibliotecaId, segment) => {
    if (!bibliotecaId) {
      setError('No se pudo guardar el segmento: el borrador no está inicializado.');
      return false;
    }
    try {
      const sb = await getSupabaseClient();
      const payload = { condiciones_generales_id:bibliotecaId, titulo:segment.titulo || '', contenido_json:normalizeRichTextDocument(segment.contenido_json), contenido_texto_plano:segment.contenido_texto_plano || '', orden:segment.orden, activo:true };
      const query = segment.id ? sb.from('condiciones_generales_segmentos').update(payload).eq('id', segment.id) : sb.from('condiciones_generales_segmentos').insert(payload);
      const { data, error: saveError } = await query.select().single();
      if (saveError) throw saveError;
      setSegmentos(prev => prev.map(item => item === segment || item.id === segment.id ? data : item));
      return true;
    } catch (err) { setError(err.message || 'No se pudo guardar el segmento.'); return false; }
  };

  const guardarSegmentoConFeedback = async (bibliotecaId, segment, segmentoKey) => {
    setGuardandoSegmento(segmentoKey);
    setError('');
    try {
      const guardado = await guardarSegmento(bibliotecaId, segment);
      if (guardado) addToast?.('Segmento guardado.', 'success');
    } finally { setGuardandoSegmento(null); }
  };

  const agregarSegmento = () => setSegmentos(prev => [...prev, { titulo:'', contenido_json:normalizeRichTextDocument(null), contenido_texto_plano:'', orden:prev.length + 1 }]);
  const editarSegmento = (index, patch) => setSegmentos(prev => prev.map((segmento, i) => i === index ? { ...segmento, ...patch } : segmento));
  const desactivarSegmento = async (segment, index) => {
    if (!segment.id) return setSegmentos(prev => prev.filter((_, i) => i !== index));
    try {
      const sb = await getSupabaseClient();
      const { error: deleteError } = await sb.from('condiciones_generales_segmentos').update({ activo:false }).eq('id', segment.id);
      if (deleteError) throw deleteError;
      setSegmentos(prev => prev.filter(item => item.id !== segment.id));
    } catch (err) { setError(err.message || 'No se pudo retirar el segmento.'); }
  };

  const mover = async (index, direction) => {
    const nextIndex = index + direction; if (!draft || nextIndex < 0 || nextIndex >= segmentos.length) return;
    const ordered = [...segmentos]; [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
    const withOrder = ordered.map((segmento, i) => ({ ...segmento, orden:i + 1 })); setSegmentos(withOrder);
    const persisted = withOrder.filter(item => item.id);
    if (!persisted.length) return;
    try {
      const sb = await getSupabaseClient();
      const { error: offsetError } = await sb.from('condiciones_generales_segmentos').upsert(persisted.map(item => ({ id:item.id, condiciones_generales_id:draft.id, titulo:item.titulo, contenido_json:item.contenido_json, contenido_texto_plano:item.contenido_texto_plano, orden:item.orden + 10000, activo:true })));
      if (offsetError) throw offsetError;
      const { error: finalError } = await sb.from('condiciones_generales_segmentos').upsert(persisted.map(item => ({ id:item.id, condiciones_generales_id:draft.id, titulo:item.titulo, contenido_json:item.contenido_json, contenido_texto_plano:item.contenido_texto_plano, orden:item.orden, activo:true })));
      if (finalError) throw finalError;
    } catch (err) { setError(err.message || 'No se pudo reordenar.'); }
  };

  const publicar = async () => {
    if (!draft) return;
    setPublicando(true);
    setError('');
    try {
      for (const segmento of segmentos) await guardarSegmento(draft.id, segmento);
      const sb = await getSupabaseClient();
      const anteriores = bibliotecas.filter(row => row.estado === 'publicada' && row.id !== draft.id);
      if (anteriores.length) {
        const { error: archiveError } = await sb.from('biblioteca_condiciones_generales').update({ estado:'archivada' }).in('id', anteriores.map(row => row.id));
        if (archiveError) throw archiveError;
      }
      const { error: publishError } = await sb.from('biblioteca_condiciones_generales').update({ estado:'publicada', publicada_at:new Date().toISOString(), publicada_by:authUser?.id || null }).eq('id', draft.id);
      if (publishError) throw publishError;
      addNotificacion?.(`Versión ${draft.version} publicada.`);
      addToast?.(`Versión ${draft.version} publicada.`, 'success');
      await cargarBibliotecas();
    } catch (err) { setError(err.message || 'No se pudo publicar la biblioteca.'); }
    finally { setPublicando(false); }
  };

  if (!active) return null;
  if (requiereSociedad) return <div className="alert alert-warning">Selecciona una sociedad concreta para administrar sus documentos.</div>;
  return <div className="params-section params-section-catalogo_documentos" style={{display:'grid', gap:16}}>
    <div className="card"><div className="card-head"><h3>Tipos de documento para cotizaciones</h3>{puedeCrear && <span className="badge badge-cyan">Categoría: cotización</span>}</div><div className="card-body">
      {error && <div className="alert alert-danger">{error}</div>}
      {puedeCrear && <div className="grid-2" style={{gap:8, marginBottom:14}}><input className="input" placeholder="Código, ej. COTIZACION_SERVICIOS" value={nuevoTipo.codigo} onChange={e=>setNuevoTipo(p=>({...p,codigo:e.target.value}))}/><div className="row" style={{gap:8}}><input className="input" placeholder="Nombre del tipo" value={nuevoTipo.nombre} onChange={e=>setNuevoTipo(p=>({...p,nombre:e.target.value}))}/><select className="input" value={nuevoTipo.motor_contenido} onChange={event=>setNuevoTipo(previous=>({...previous,motor_contenido:event.target.value}))} title="Motor de contenido"><option value="condiciones_generales">Condiciones generales</option><option value="constructor_bloques">Constructor de bloques</option></select><button className="btn btn-primary" onClick={crearTipo}>Crear tipo</button></div><div className="text-muted" style={{fontSize:12, gridColumn:'1/-1'}}>El valor por defecto conserva el editor actual; selecciona Constructor de bloques antes de crear un tipo especial.</div></div>}
      {loading ? <div className="text-muted">Cargando…</div> : tipos.length === 0 ? <div className="text-muted">No hay tipos configurados para este alcance.</div> : <div className="table-wrap"><table className="tbl"><thead><tr><th>Nombre</th><th>Código</th><th>Default</th><th>Estado</th><th></th></tr></thead><tbody>{tipos.map(tipo=><tr key={tipo.id} style={{background:tipo.id===selectedId?'var(--bg-alt)':undefined}}><td><button className="btn btn-ghost" onClick={()=>seleccionarTipo(tipo.id)}>{tipo.nombre}</button></td><td>{tipo.codigo}</td><td>{tipo.es_default_para_categoria?'Sí':'No'}</td><td>{tipo.activo?'Activo':'Inactivo'}</td><td>{puedeEditar && !tipo.es_default_para_categoria && <button className="btn btn-secondary" onClick={()=>marcarDefault(tipo)} disabled={Boolean(marcandoDefaultId)}>{marcandoDefaultId === tipo.id ? 'Marcando…' : 'Marcar default'}</button>}</td></tr>)}</tbody></table></div>}
    </div></div>
    {tipoSeleccionado && <div className="card"><div className="card-head"><div><h3>{tipoSeleccionado.nombre}</h3><div className="text-muted">{publicada ? `Vigente: versión ${publicada.version}` : 'Sin versión publicada'}</div></div><div className="row" style={{gap:8}}>{historial.length > 0 && <button className="btn btn-ghost" onClick={()=>setMostrarHistorial(value=>!value)}>Ver historial de versiones</button>}{puedeCrear && !draft && <button className="btn btn-secondary" onClick={()=>crearBorrador(publicada)}> {publicada ? 'Editar: crear borrador' : 'Crear borrador'} </button>}{draft && puedeEditar && <button className="btn btn-primary" onClick={publicar} disabled={publicando}>{publicando ? 'Publicando…' : `Publicar v${draft.version}`}</button>}</div></div><div className="card-body">
      {draft ? <><div className="alert alert-warning">Editando borrador v{draft.version}. Las versiones publicadas no se modifican.</div>{segmentos.map((segmento,index)=>{ const segmentoKey = segmento.id || `new-${index}`; const feedbackKey = `segment-${index}`; const guardando = guardandoSegmento === feedbackKey; return <div key={segmentoKey} style={{border:'1px solid var(--border)',borderRadius:8,padding:12,marginBottom:10}}><div className="row" style={{gap:8,alignItems:'center'}}><strong style={{minWidth:28}}>#{segmento.orden}</strong><input className="input" placeholder="Título del segmento" value={segmento.titulo} onChange={e=>editarSegmento(index,{titulo:e.target.value})}/><button className="btn btn-ghost" onClick={()=>mover(index,-1)} disabled={index===0}>↑</button><button className="btn btn-ghost" onClick={()=>mover(index,1)} disabled={index===segmentos.length-1}>↓</button><button type="button" className="btn btn-secondary" onClick={()=>guardarSegmentoConFeedback(draft.id, segmento, feedbackKey)} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button><button className="btn btn-ghost" onClick={()=>desactivarSegmento(segmento,index)}>Retirar</button></div><div style={{marginTop:8}}><RichTextEditor value={segmento.contenido_json} onChange={patch=>editarSegmento(index,patch)} variables={VARIABLES_COMERCIALES} /></div></div>})}<button className="btn btn-secondary" onClick={agregarSegmento}>+ Agregar segmento</button></> : <>{publicada ? <><div className="text-muted" style={{marginBottom:12}}>La versión publicada es de solo lectura. Crea un borrador para editarla.</div>{segmentos.map(segmento=><div key={segmento.id} style={{border:'1px solid var(--border)',borderRadius:8,padding:12,marginBottom:10}}><strong>{segmento.orden}. {segmento.titulo}</strong><div style={{marginTop:8}}><RichTextEditor value={segmento.contenido_json} disabled onChange={()=>{}} /></div></div>)}</> : <div className="text-muted">Crea el primer borrador para agregar segmentos.</div>}{mostrarHistorial && <div style={{marginTop:14}}><strong>Historial de versiones</strong><ul>{historial.map(row=><li key={row.id}>Versión {row.version} — archivada</li>)}</ul></div>}</>}
    </div></div>}
    {tipoSeleccionadoReal && esConstructorBloques && <ConstructorBloquesEditor tipo={tipoSeleccionadoReal} empresa={empresa} sociedadId={sociedadId} authUser={authUser} puedeCrear={can(role, tipoSeleccionadoReal.categoria_base, 'crear')} puedeEditar={can(role, tipoSeleccionadoReal.categoria_base, 'editar')} addNotificacion={addNotificacion} addToast={addToast} />}
  </div>;
}
