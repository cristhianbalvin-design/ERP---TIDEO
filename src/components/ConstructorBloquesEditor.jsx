import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';
import { obtenerVariablesDocumentales } from '../lib/variablesDocumentales.js';
import { RichTextEditor, normalizeRichTextDocument } from './RichTextEditor.jsx';

const newKey = () => globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const emptyTable = () => {
  const columnId = newKey();
  return { columnas: [{ id: columnId, titulo: 'Columna 1', tipo: 'texto' }], filas: [{ id: newKey(), valores: { [columnId]: '' } }] };
};
const emptyGroup = () => ({ fuente_repeticion: '', titulo_item: '' });
const orderBlocks = blocks => [...blocks].sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0));

const normalizeTable = value => {
  const columnas = Array.isArray(value?.columnas) ? value.columnas.filter(column => column?.id).map(column => ({
    id: column.id,
    titulo: column.titulo || '',
    tipo: column.tipo === 'check' ? 'check' : 'texto',
  })) : [];
  const safeColumns = columnas.length ? columnas : emptyTable().columnas;
  const filas = Array.isArray(value?.filas) ? value.filas.map(row => ({
    id: row?.id || newKey(),
    valores: Object.fromEntries(safeColumns.map(column => [column.id, row?.valores?.[column.id] ?? (column.tipo === 'check' ? false : '')])),
  })) : [];
  return { columnas: safeColumns, filas };
};

const plainTextForBlock = block => {
  if (block.tipo_bloque === 'texto_rico') return block.contenido_texto_plano || '';
  if (block.tipo_bloque === 'tabla') {
    const table = normalizeTable(block.contenido_json);
    return table.filas.map(row => table.columnas.map(column => column.tipo === 'check' ? (row.valores[column.id] ? 'Sí' : 'No') : row.valores[column.id] || '').join(' | ')).join('\n');
  }
  return [block.contenido_json?.fuente_repeticion || '', block.contenido_json?.titulo_item || ''].filter(Boolean).join('\n');
};

const contentForType = type => {
  if (type === 'tabla') return emptyTable();
  if (type === 'grupo_repetible') return emptyGroup();
  return normalizeRichTextDocument(null);
};

const blockPayload = (block, plantillaId, parentId = block.bloque_padre_id || null) => ({
  plantilla_documento_id: plantillaId,
  bloque_padre_id: parentId,
  tipo_bloque: block.tipo_bloque,
  titulo: block.titulo || null,
  contenido_json: block.tipo_bloque === 'texto_rico'
    ? normalizeRichTextDocument(block.contenido_json)
    : block.tipo_bloque === 'tabla'
      ? normalizeTable(block.contenido_json)
      : block.contenido_json || contentForType(block.tipo_bloque),
  contenido_texto_plano: plainTextForBlock(block),
  orden: Number(block.orden || 1),
  activo: true,
});

function TablaBlockEditor({ value, disabled, onChange }) {
  const table = normalizeTable(value);
  const update = next => onChange?.({ contenido_json: next });
  const updateColumn = (columnId, patch) => update({ ...table, columnas: table.columnas.map(column => column.id === columnId ? { ...column, ...patch } : column) });
  const addColumn = () => {
    const id = newKey();
    update({ ...table, columnas: [...table.columnas, { id, titulo: `Columna ${table.columnas.length + 1}`, tipo: 'texto' }], filas: table.filas.map(row => ({ ...row, valores: { ...row.valores, [id]: '' } })) });
  };
  const removeColumn = id => update({ ...table, columnas: table.columnas.filter(column => column.id !== id), filas: table.filas.map(row => {
    const valores = { ...row.valores }; delete valores[id]; return { ...row, valores };
  }) });
  const addRow = () => update({ ...table, filas: [...table.filas, { id: newKey(), valores: Object.fromEntries(table.columnas.map(column => [column.id, column.tipo === 'check' ? false : ''])) }] });
  const updateCell = (rowId, column, value) => update({ ...table, filas: table.filas.map(row => row.id === rowId ? { ...row, valores: { ...row.valores, [column.id]: value } } : row) });
  return <div style={{display:'grid', gap:8}}>
    <div className="text-muted" style={{fontSize:12}}>Define columnas de texto o casilla y las filas que debe mostrar la tabla.</div>
    <div className="table-wrap"><table className="tbl"><thead><tr>{table.columnas.map(column => <th key={column.id}><div className="row" style={{gap:4, minWidth:130}}><input className="input" value={column.titulo} disabled={disabled} onChange={event => updateColumn(column.id, { titulo:event.target.value })} /><select className="input" value={column.tipo} disabled={disabled} onChange={event => {
      const tipo = event.target.value;
      update({ ...table, columnas: table.columnas.map(item => item.id === column.id ? { ...item, tipo } : item), filas: table.filas.map(row => ({ ...row, valores: { ...row.valores, [column.id]: tipo === 'check' ? Boolean(row.valores[column.id]) : String(row.valores[column.id] || '') } })) });
    }}><option value="texto">Texto</option><option value="check">Check</option></select>{!disabled && <button type="button" className="btn btn-ghost" onClick={() => removeColumn(column.id)}>×</button>}</div></th>)}<th style={{width:44}} /></tr></thead><tbody>{table.filas.map(row => <tr key={row.id}>{table.columnas.map(column => <td key={column.id}>{column.tipo === 'check' ? <input type="checkbox" checked={Boolean(row.valores[column.id])} disabled={disabled} onChange={event => updateCell(row.id, column, event.target.checked)} /> : <input className="input" value={row.valores[column.id] || ''} disabled={disabled} onChange={event => updateCell(row.id, column, event.target.value)} />}</td>)}<td>{!disabled && <button type="button" className="btn btn-ghost" onClick={() => update({ ...table, filas: table.filas.filter(item => item.id !== row.id) })}>×</button>}</td></tr>)}</tbody></table></div>
    {!disabled && <div className="row" style={{gap:8}}><button type="button" className="btn btn-secondary" onClick={addColumn}>+ Columna</button><button type="button" className="btn btn-secondary" onClick={addRow}>+ Fila</button></div>}
  </div>;
}

function BloqueCard({ block, index, total, depth, children, disabled, saving, saved, variables, onChange, onSave, onRemove, onMove, onAddChild }) {
  const typeLabel = { texto_rico:'Texto', tabla:'Tabla', grupo_repetible:'Grupo repetible' }[block.tipo_bloque] || block.tipo_bloque;
  const group = { ...emptyGroup(), ...(block.contenido_json || {}) };
  return <div style={{border:'1px solid var(--border)', borderRadius:8, padding:12, marginBottom:10, background:depth ? 'var(--bg-alt)' : undefined}}>
    <div className="row" style={{gap:8, alignItems:'center', flexWrap:'wrap'}}>
      <strong style={{minWidth:28}}>#{block.orden}</strong><span className="badge badge-cyan">{typeLabel}</span>
      <input className="input" placeholder="Título del bloque (opcional)" value={block.titulo || ''} disabled={disabled} onChange={event => onChange({ titulo:event.target.value })} style={{flex:'1 1 220px'}} />
      {!disabled && <><button type="button" className="btn btn-ghost" onClick={() => onMove(index, -1)} disabled={index === 0}>↑</button><button type="button" className="btn btn-ghost" onClick={() => onMove(index, 1)} disabled={index === total - 1}>↓</button><button type="button" className="btn btn-secondary" onClick={onSave} disabled={saving}>{saving ? 'Guardando…' : saved ? 'Guardado ✓' : 'Guardar'}</button><button type="button" className="btn btn-ghost" onClick={onRemove}>Retirar</button></>}
    </div>
    <div style={{marginTop:10}}>
      {block.tipo_bloque === 'texto_rico' && <RichTextEditor value={block.contenido_json} disabled={disabled} onChange={onChange} variables={variables} />}
      {block.tipo_bloque === 'tabla' && <TablaBlockEditor value={block.contenido_json} disabled={disabled} onChange={onChange} />}
      {block.tipo_bloque === 'grupo_repetible' && <div style={{display:'grid', gap:10}}><div className="grid-2" style={{gap:8}}><div className="input-group"><label>Fuente de repetición</label><input className="input" placeholder="Ej. equipos" value={group.fuente_repeticion} disabled={disabled} onChange={event => onChange({ contenido_json:{ ...group, fuente_repeticion:event.target.value } })} /></div><div className="input-group"><label>Título por ítem</label><input className="input" placeholder="Ej. Equipo {{equipo.nombre}}" value={group.titulo_item} disabled={disabled} onChange={event => onChange({ contenido_json:{ ...group, titulo_item:event.target.value } })} /></div></div><div style={{borderTop:'1px solid var(--border)', paddingTop:10}}><strong style={{fontSize:13}}>Bloques por ítem</strong>{!block.id && <div className="text-muted" style={{fontSize:12, marginTop:6}}>Guarda primero el grupo para agregar bloques hijos.</div>}{block.id && <BloquesList blocks={children} parentId={block.id} depth={depth + 1} disabled={disabled} variables={variables} onChange={onChange} onSave={onSave} onRemove={onRemove} onMove={onMove} onAdd={onAddChild} />}</div></div>}
    </div>
  </div>;
}

function BloquesList({ blocks, parentId, depth, disabled, variables, onChange, onSave, onRemove, onMove, onAdd }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const items = orderBlocks(blocks);
  return <div style={{marginTop:10}}>
    {items.map((block, index) => <BloqueCard key={block.client_key || block.id} block={block} index={index} total={items.length} depth={depth} children={orderBlocks(blocks._all?.filter(item => item.bloque_padre_id === block.id) || [])} disabled={disabled} saving={blocks._savingId === (block.client_key || block.id)} saved={blocks._savedId === (block.client_key || block.id)} variables={variables} onChange={patch => onChange(block, patch)} onSave={() => onSave(block)} onRemove={() => onRemove(block)} onMove={(itemIndex, direction) => onMove(parentId, itemIndex, direction)} onAddChild={onAdd} />)}
    {!disabled && <div style={{marginTop:8}}>{pickerOpen ? <div className="row" style={{gap:8, flexWrap:'wrap'}}><span className="text-muted" style={{fontSize:12}}>Tipo de bloque:</span><button type="button" className="btn btn-secondary" onClick={() => { onAdd(parentId, 'texto_rico'); setPickerOpen(false); }}>Texto</button><button type="button" className="btn btn-secondary" onClick={() => { onAdd(parentId, 'tabla'); setPickerOpen(false); }}>Tabla</button>{depth === 0 && <button type="button" className="btn btn-secondary" onClick={() => { onAdd(parentId, 'grupo_repetible'); setPickerOpen(false); }}>Grupo repetible</button>}<button type="button" className="btn btn-ghost" onClick={() => setPickerOpen(false)}>Cancelar</button></div> : <button type="button" className="btn btn-secondary" onClick={() => setPickerOpen(true)}>+ Agregar bloque</button>}</div>}
  </div>;
}

export function ConstructorBloquesEditor({ tipo, empresa, sociedadId, authUser, puedeCrear, puedeEditar, addNotificacion, addToast }) {
  const [plantillas, setPlantillas] = useState([]);
  const [draft, setDraft] = useState(null);
  const [bloques, setBloques] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [guardandoId, setGuardandoId] = useState(null);
  const [guardadoId, setGuardadoId] = useState(null);
  const cargaId = useRef(0);
  const variables = useMemo(() => obtenerVariablesDocumentales(tipo?.categoria_base), [tipo?.categoria_base]);
  const publicada = useMemo(() => plantillas.filter(row => row.estado === 'publicada').sort((a, b) => b.version - a.version)[0] || null, [plantillas]);
  const historial = useMemo(() => plantillas.filter(row => row.estado === 'archivada').sort((a, b) => b.version - a.version), [plantillas]);

  const cargar = useCallback(async () => {
    const request = ++cargaId.current;
    if (!tipo?.id || !isSupabaseConfigured()) return;
    setLoading(true); setError('');
    try {
      const sb = await getSupabaseClient();
      const { data, error: queryError } = await sb.from('plantillas_documento_bloques').select('*').eq('tipo_documento_id', tipo.id).order('version', { ascending:false });
      if (queryError) throw queryError;
      if (request !== cargaId.current) return;
      const rows = data || [];
      setPlantillas(rows);
      const nextDraft = rows.find(row => row.estado === 'borrador') || null;
      setDraft(nextDraft);
      const base = nextDraft || rows.find(row => row.estado === 'publicada') || null;
      if (!base) { setBloques([]); return; }
      const { data: loadedBlocks, error: blockError } = await sb.from('documento_bloques').select('*').eq('plantilla_documento_id', base.id).eq('activo', true).order('orden');
      if (blockError) throw blockError;
      if (request === cargaId.current) setBloques(loadedBlocks || []);
    } catch (err) { if (request === cargaId.current) setError(err.message || 'No se pudo cargar la plantilla.'); }
    finally { if (request === cargaId.current) setLoading(false); }
  }, [tipo?.id]);

  useEffect(() => { setPlantillas([]); setDraft(null); setBloques([]); setMostrarHistorial(false); cargar(); }, [cargar]);

  const replaceBlock = (before, after) => setBloques(previous => previous.map(block => block === before || block.id === before.id || block.client_key === before.client_key ? { ...after, client_key: before.client_key } : block));
  const updateBlock = (block, patch) => replaceBlock(block, { ...block, ...patch });
  const childrenFor = parentId => orderBlocks(bloques.filter(block => block.bloque_padre_id === parentId));
  const rootBlocks = childrenFor(null);

  const crearBorrador = async (origen = publicada) => {
    try {
      const sb = await getSupabaseClient();
      const version = Math.max(0, ...plantillas.map(row => Number(row.version || 0))) + 1;
      const { data: nueva, error: createError } = await sb.from('plantillas_documento_bloques').insert({ empresa_id:empresa.id, sociedad_id:sociedadId, tipo_documento_id:tipo.id, nombre_interno:origen?.nombre_interno || tipo.nombre, version, estado:'borrador', created_by:authUser?.id || null }).select().single();
      if (createError) throw createError;
      let cloned = [];
      if (origen) {
        const { data: sourceBlocks, error: sourceError } = await sb.from('documento_bloques').select('*').eq('plantilla_documento_id', origen.id).eq('activo', true).order('orden');
        if (sourceError) throw sourceError;
        const pending = orderBlocks(sourceBlocks || []);
        const ids = new Map();
        while (pending.length) {
          const nextIndex = pending.findIndex(block => !block.bloque_padre_id || ids.has(block.bloque_padre_id));
          if (nextIndex < 0) throw new Error('La jerarquía de bloques de la versión publicada no es válida.');
          const source = pending.splice(nextIndex, 1)[0];
          const { data: copied, error: copyError } = await sb.from('documento_bloques').insert(blockPayload(source, nueva.id, source.bloque_padre_id ? ids.get(source.bloque_padre_id) : null)).select().single();
          if (copyError) throw copyError;
          ids.set(source.id, copied.id);
          cloned.push(copied);
        }
      }
      setPlantillas(previous => [nueva, ...previous]); setDraft(nueva); setBloques(cloned); addNotificacion?.(`Borrador v${version} creado.`);
    } catch (err) { setError(err.message || 'No se pudo crear el borrador.'); }
  };

  const guardarBloque = async block => {
    if (!draft?.id) { setError('No se pudo guardar el bloque: el borrador no está inicializado.'); return false; }
    try {
      const sb = await getSupabaseClient();
      const payload = blockPayload(block, draft.id);
      const query = block.id ? sb.from('documento_bloques').update(payload).eq('id', block.id) : sb.from('documento_bloques').insert(payload);
      const { data, error: saveError } = await query.select().single();
      if (saveError) throw saveError;
      replaceBlock(block, data);
      return true;
    } catch (err) { setError(err.message || 'No se pudo guardar el bloque.'); return false; }
  };

  const guardarConFeedback = async block => {
    const key = block.client_key || block.id;
    setGuardandoId(key); setError('');
    try {
      if (await guardarBloque(block)) {
        setGuardadoId(key); addToast?.('Bloque guardado.', 'success');
        window.setTimeout(() => setGuardadoId(current => current === key ? null : current), 1500);
      }
    } finally { setGuardandoId(null); }
  };

  const addBlock = (parentId, tipoBloque) => {
    const siblings = childrenFor(parentId);
    setBloques(previous => [...previous, { client_key:newKey(), plantilla_documento_id:draft?.id || null, bloque_padre_id:parentId, tipo_bloque:tipoBloque, titulo:'', contenido_json:contentForType(tipoBloque), contenido_texto_plano:'', orden:siblings.length + 1, activo:true }]);
  };

  const retirar = async block => {
    const descendants = bloques.filter(item => item.bloque_padre_id === block.id);
    if (!block.id) return setBloques(previous => previous.filter(item => item !== block && item.bloque_padre_id !== block.client_key));
    try {
      const sb = await getSupabaseClient();
      const ids = [block.id, ...descendants.filter(item => item.id).map(item => item.id)];
      const { error: removeError } = await sb.from('documento_bloques').update({ activo:false }).in('id', ids);
      if (removeError) throw removeError;
      setBloques(previous => previous.filter(item => !ids.includes(item.id)));
    } catch (err) { setError(err.message || 'No se pudo retirar el bloque.'); }
  };

  const mover = async (parentId, index, direction) => {
    const siblings = childrenFor(parentId);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= siblings.length) return;
    const ordered = [...siblings]; [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
    const withOrder = ordered.map((block, itemIndex) => ({ ...block, orden:itemIndex + 1 }));
    setBloques(previous => previous.map(block => withOrder.find(item => item.id === block.id || item.client_key === block.client_key) || block));
    const persisted = withOrder.filter(block => block.id);
    if (!persisted.length || !draft?.id) return;
    try {
      const sb = await getSupabaseClient();
      const offset = persisted.map(block => ({ id:block.id, ...blockPayload(block, draft.id, parentId), orden:block.orden + 10000 }));
      const final = persisted.map(block => ({ id:block.id, ...blockPayload(block, draft.id, parentId) }));
      const { error: offsetError } = await sb.from('documento_bloques').upsert(offset);
      if (offsetError) throw offsetError;
      const { error: finalError } = await sb.from('documento_bloques').upsert(final);
      if (finalError) throw finalError;
    } catch (err) { setError(err.message || 'No se pudo reordenar los bloques.'); }
  };

  const publicar = async () => {
    if (!draft) return;
    setPublicando(true); setError('');
    try {
      for (const block of bloques) if (!block.id) await guardarBloque(block);
      const sb = await getSupabaseClient();
      const anteriores = plantillas.filter(row => row.estado === 'publicada' && row.id !== draft.id);
      if (anteriores.length) {
        const { error: archiveError } = await sb.from('plantillas_documento_bloques').update({ estado:'archivada' }).in('id', anteriores.map(row => row.id));
        if (archiveError) throw archiveError;
      }
      const { error: publishError } = await sb.from('plantillas_documento_bloques').update({ estado:'publicada', publicada_at:new Date().toISOString(), publicada_by:authUser?.id || null }).eq('id', draft.id);
      if (publishError) throw publishError;
      addNotificacion?.(`Versión ${draft.version} publicada.`); addToast?.(`Versión ${draft.version} publicada.`, 'success'); await cargar();
    } catch (err) { setError(err.message || 'No se pudo publicar la plantilla.'); }
    finally { setPublicando(false); }
  };

  const decoratedRoots = Object.assign(rootBlocks, { _all:bloques, _savingId:guardandoId, _savedId:guardadoId });
  const childList = parentId => Object.assign(childrenFor(parentId), { _all:bloques, _savingId:guardandoId, _savedId:guardadoId });
  return <div className="card"><div className="card-head"><div><h3>{tipo.nombre}</h3><div className="text-muted">{publicada ? `Vigente: versión ${publicada.version}` : 'Sin versión publicada'}</div></div><div className="row" style={{gap:8}}>{historial.length > 0 && <button type="button" className="btn btn-ghost" onClick={() => setMostrarHistorial(value => !value)}>Ver historial de versiones</button>}{puedeCrear && !draft && <button type="button" className="btn btn-secondary" onClick={() => crearBorrador(publicada)}> {publicada ? 'Editar: crear borrador' : 'Crear borrador'} </button>}{draft && puedeEditar && <button type="button" className="btn btn-primary" onClick={publicar} disabled={publicando}>{publicando ? 'Publicando…' : `Publicar v${draft.version}`}</button>}</div></div><div className="card-body">
    {error && <div className="alert alert-danger">{error}</div>}
    {loading ? <div className="text-muted">Cargando…</div> : draft ? <><div className="alert alert-warning">Editando borrador v{draft.version}. Las versiones publicadas no se modifican.</div><BloquesList blocks={decoratedRoots} parentId={null} depth={0} disabled={!puedeEditar} variables={variables} onChange={updateBlock} onSave={guardarConFeedback} onRemove={retirar} onMove={mover} onAdd={addBlock} /></> : <>{publicada ? <><div className="text-muted" style={{marginBottom:12}}>La versión publicada es de solo lectura. Crea un borrador para editarla.</div><BloquesList blocks={decoratedRoots} parentId={null} depth={0} disabled variables={variables} onChange={() => {}} onSave={() => {}} onRemove={() => {}} onMove={() => {}} onAdd={() => {}} /></> : <div className="text-muted">Crea el primer borrador para agregar bloques.</div>}{mostrarHistorial && <div style={{marginTop:14}}><strong>Historial de versiones</strong><ul>{historial.map(row => <li key={row.id}>Versión {row.version} — archivada</li>)}</ul></div>}</>}
  </div></div>;
}
