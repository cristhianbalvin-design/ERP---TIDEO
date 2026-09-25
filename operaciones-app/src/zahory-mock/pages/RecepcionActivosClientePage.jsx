import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon, FooterBrand } from '../components/shell.jsx';
import { getSupabaseClient } from '../../lib/supabaseClient.js';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';
import { subirAdjunto } from '../../../../src/services/storageService.js';
import {
  ESTADOS_CUSTODIA,
  actualizarEstadoCustodia,
  crearRecepcion,
  listarActivosCliente,
  listarAlmacenes,
  listarClientes,
  listarRecepciones,
} from '../../services/recepcionesActivosClienteService.js';

const today = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);

const CHECKLIST_ITEMS = [
  ['integridad_exterior', 'Integridad exterior verificada'],
  ['sin_danos_visibles', 'Sin daños visibles adicionales'],
  ['accesorios_completos', 'Accesorios/documentación completos'],
  ['placa_serie_legible', 'Placa o número de serie legible'],
];

const ESTADO_LABELS = {
  recibido: 'Recibido',
  en_diagnostico: 'En diagnóstico',
  en_reparacion: 'En reparación',
  listo_entrega: 'Listo para entrega',
  entregado: 'Entregado',
};

const emptyForm = sociedadId => ({
  cliente_id: '',
  activo_id: '',
  fecha_ingreso: today(),
  hora_ingreso: nowTime(),
  guia_ingreso: '',
  almacen_id: '',
  observaciones: '',
  checklist: Object.fromEntries(CHECKLIST_ITEMS.map(([key]) => [key, false])),
  sociedad_id: sociedadId || '',
});

const nombreCliente = cliente => cliente?.razon_social || cliente?.nombre_comercial || cliente?.ruc || 'Cliente sin nombre';
const nombreActivo = activo => [activo?.codigo, activo?.nombre, activo?.marca, activo?.modelo, activo?.placa_serie].filter(Boolean).join(' · ');

const serializarObservaciones = (observaciones, checklist) => {
  const resumen = CHECKLIST_ITEMS
    .map(([key, label]) => `${label}: ${checklist?.[key] ? 'Sí' : 'No registrado'}`)
    .join(' | ');
  return [String(observaciones || '').trim(), `Checklist de condición: ${resumen}`].filter(Boolean).join('\n');
};

const badgeClass = estado => ({
  recibido: 'chip orange',
  en_diagnostico: 'chip cyan',
  en_reparacion: 'chip amber',
  listo_entrega: 'chip green',
  entregado: 'chip gray',
}[estado] || 'chip gray');

export function RecepcionActivosClientePage() {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const sociedadId = sesion.sociedadId;
  const [activos, setActivos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [recepciones, setRecepciones] = useState([]);
  const [form, setForm] = useState(() => emptyForm(sociedadId));
  const [assetSearch, setAssetSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [puedeCrear, setPuedeCrear] = useState(false);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [fotos, setFotos] = useState([]);

  const showToast = message => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3500);
  };

  const cargar = useCallback(async () => {
    if (!empresaId || !sociedadId || sesion.estado !== 'listo') {
      setActivos([]);
      setClientes([]);
      setAlmacenes([]);
      setRecepciones([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [activosData, clientesData, almacenesData, recepcionesData] = await Promise.all([
        listarActivosCliente(empresaId, sociedadId),
        listarClientes(empresaId),
        listarAlmacenes(empresaId, sociedadId),
        listarRecepciones(empresaId, sociedadId),
      ]);
      setActivos(activosData);
      setClientes(clientesData);
      setAlmacenes(almacenesData);
      setRecepciones(recepcionesData);
    } catch (cargaError) {
      setError(cargaError?.message || 'No se pudo cargar la recepción de activos.');
    } finally {
      setLoading(false);
    }
  }, [empresaId, sociedadId, sesion.estado]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (sesion.estado !== 'listo' || !empresaId) return undefined;
    let vigente = true;
    const cargarPermisos = async () => {
      const supabase = getSupabaseClient();
      const [crear, editar] = await Promise.all([
        supabase.rpc('usuario_puede', { target_empresa_id: empresaId, target_pantalla: 'recepcion_activos_cliente', target_accion: 'crear' }),
        supabase.rpc('usuario_puede', { target_empresa_id: empresaId, target_pantalla: 'recepcion_activos_cliente', target_accion: 'editar' }),
      ]);
      if (!vigente) return;
      setPuedeCrear(!crear.error && Boolean(crear.data));
      setPuedeEditar(!editar.error && Boolean(editar.data));
    };
    cargarPermisos().catch(permissionError => {
      if (vigente) setError(permissionError?.message || 'No se pudieron verificar los permisos.');
    });
    return () => { vigente = false; };
  }, [empresaId, sesion.estado]);

  useEffect(() => {
    if (sociedadId && form.sociedad_id !== sociedadId) setForm(actual => ({ ...actual, sociedad_id: sociedadId }));
  }, [sociedadId, form.sociedad_id]);

  const activosVisibles = useMemo(() => {
    const termino = assetSearch.trim().toLowerCase();
    return activos.filter(activo => {
      if (form.cliente_id && activo.cliente_propietario_id !== form.cliente_id) return false;
      if (!termino) return true;
      return nombreActivo(activo).toLowerCase().includes(termino);
    }).slice(0, 50);
  }, [activos, assetSearch, form.cliente_id]);

  const activosPorId = useMemo(() => new Map(activos.map(activo => [activo.id, activo])), [activos]);
  const clientesPorId = useMemo(() => new Map(clientes.map(cliente => [cliente.id, cliente])), [clientes]);
  const almacenesPorId = useMemo(() => new Map(almacenes.map(almacen => [almacen.id, almacen])), [almacenes]);

  const actualizarForm = (campo, valor) => setForm(actual => ({ ...actual, [campo]: valor }));

  const seleccionarActivo = activo => {
    setForm(actual => ({
      ...actual,
      activo_id: activo.id,
      cliente_id: activo.cliente_propietario_id || '',
    }));
    setAssetSearch(nombreActivo(activo));
  };

  const abrirNuevaRecepcion = () => {
    setForm(emptyForm(sociedadId));
    setAssetSearch('');
    setFotos([]);
    setError('');
  };

  const seleccionarFotos = event => {
    const nuevas = [...(event.target.files || [])];
    setFotos(actuales => [...actuales, ...nuevas].slice(0, 8));
    event.currentTarget.value = '';
  };

  const quitarFoto = foto => setFotos(actuales => actuales.filter(item => item !== foto));

  const guardar = async event => {
    event.preventDefault();
    if (!puedeCrear || !sesion.permiteEscritura) {
      setError('Tu rol o la sociedad activa no permiten registrar recepciones.');
      return;
    }
    const activo = activosPorId.get(form.activo_id);
    if (!activo) { setError('Selecciona un activo de cliente válido.'); return; }
    if (activo.cliente_propietario_id !== form.cliente_id) { setError('El activo seleccionado no corresponde al cliente elegido.'); return; }

    setSaving(true);
    setError('');
    try {
      const recepcion = await crearRecepcion(empresaId, {
        ...form,
        observaciones: serializarObservaciones(form.observaciones, form.checklist),
      });
      const erroresFotos = [];
      for (const foto of fotos) {
        try {
          await subirAdjunto({
            empresaId,
            entidadTipo: 'recepciones_activos_cliente',
            entidadId: recepcion.id,
            file: foto,
            categoria: 'condicion_activo',
            descripcion: `Evidencia de condición de ${activo.codigo || activo.id}`,
            subidoPor: sesion.usuario?.id || null,
          });
        } catch (fotoError) {
          erroresFotos.push(`${foto.name}: ${fotoError?.message || 'error de carga'}`);
        }
      }
      setRecepciones(actuales => [recepcion, ...actuales]);
      abrirNuevaRecepcion();
      showToast(erroresFotos.length ? `Recepción ${recepcion.numero} creada; algunas fotos fallaron.` : `Recepción ${recepcion.numero} registrada.`);
      if (erroresFotos.length) setError(`La recepción se creó, pero no se cargaron: ${erroresFotos.join('; ')}`);
    } catch (saveError) {
      setError(saveError?.message || 'No se pudo registrar la recepción.');
    } finally {
      setSaving(false);
    }
  };

  const cambiarEstado = async (recepcionId, nuevoEstado) => {
    if (!puedeEditar || !sesion.permiteEscritura) {
      setError('Tu rol o la sociedad activa no permiten editar recepciones.');
      return;
    }
    try {
      const actualizada = await actualizarEstadoCustodia(empresaId, recepcionId, nuevoEstado);
      setRecepciones(actuales => actuales.map(item => item.id === recepcionId ? { ...item, ...actualizada } : item));
      showToast(`Estado actualizado a ${ESTADO_LABELS[nuevoEstado] || nuevoEstado}.`);
    } catch (stateError) {
      setError(stateError?.message || 'No se pudo actualizar el estado de custodia.');
    }
  };

  const sociedadBloqueada = !sociedadId || !sesion.permiteEscritura;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="eyebrow">Taller · Almacén</div>
          <h1>Recepción de activos de cliente</h1>
          <div className="sub">Ingreso, custodia y condición inicial del activo recibido.</div>
        </div>
        <button className="btn btn-primary" type="button" onClick={abrirNuevaRecepcion} disabled={!puedeCrear || sociedadBloqueada}>
          <Icon name="plus" size={14} /> Nueva recepción
        </button>
      </div>

      {!sociedadId && <div className="card" style={{ marginBottom: 12, color: '#b45309' }}>Selecciona una sociedad operativa para cargar activos, almacenes y recepciones.</div>}
      {!sesion.permiteEscritura && sociedadId && <div className="card" style={{ marginBottom: 12, color: '#b45309' }}>Vista consolidada o de solo lectura: no se permite crear ni editar recepciones.</div>}
      {!puedeCrear && sesion.estado === 'listo' && <div className="card" style={{ marginBottom: 12, color: '#b91c1c' }}>No tienes permiso para crear recepciones de activos de cliente.</div>}
      {error && <div className="card" style={{ marginBottom: 12, color: '#b91c1c', borderColor: '#fecaca' }}>{error}</div>}

      <form className="card" onSubmit={guardar} style={{ marginBottom: 16 }}>
        <div className="card-header"><h3>Nueva recepción</h3><span className="hint">El número y el número de caso se asignan al guardar.</span></div>
        <div className="card-body">
          <div className="grid-2">
            <div className="field">
              <label>Cliente propietario *</label>
              <select className="select" value={form.cliente_id} disabled={sociedadBloqueada || saving} onChange={event => setForm(actual => ({ ...actual, cliente_id: event.target.value, activo_id: '' }))}>
                <option value="">Seleccionar cliente</option>
                {clientes.map(cliente => <option key={cliente.id} value={cliente.id}>{nombreCliente(cliente)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Almacén de custodia *</label>
              <select className="select" value={form.almacen_id} disabled={sociedadBloqueada || saving} onChange={event => actualizarForm('almacen_id', event.target.value)}>
                <option value="">Seleccionar almacén</option>
                {almacenes.map(almacen => <option key={almacen.id} value={almacen.id}>{almacen.codigo ? `${almacen.codigo} · ` : ''}{almacen.nombre}</option>)}
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Buscar activo del cliente *</label>
              <input className="input" value={assetSearch} disabled={sociedadBloqueada || saving} onChange={event => { setAssetSearch(event.target.value); setForm(actual => ({ ...actual, activo_id: '' })); }} placeholder="Código, nombre, marca, modelo o serie" />
              {assetSearch && !form.activo_id && <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginTop: 6, maxHeight: 180, overflow: 'auto' }}>
                {activosVisibles.map(activo => <button key={activo.id} type="button" onClick={() => seleccionarActivo(activo)} style={{ display: 'block', width: '100%', border: 0, borderBottom: '1px solid var(--border)', background: 'transparent', padding: '9px 10px', textAlign: 'left', cursor: 'pointer' }}><strong className="mono">{activo.codigo}</strong> · {activo.nombre}{activo.modelo ? ` · ${activo.modelo}` : ''}</button>)}
                {!activosVisibles.length && <div className="hint" style={{ padding: 10 }}>No hay activos de cliente para la sociedad activa.</div>}
              </div>}
              {form.activo_id && <div className="hint" style={{ marginTop: 6 }}>Seleccionado: {nombreActivo(activosPorId.get(form.activo_id))}</div>}
            </div>
            <div className="field"><label>Fecha de ingreso *</label><input className="input" type="date" value={form.fecha_ingreso} disabled={sociedadBloqueada || saving} onChange={event => actualizarForm('fecha_ingreso', event.target.value)} required /></div>
            <div className="field"><label>Hora de ingreso</label><input className="input" type="time" value={form.hora_ingreso} disabled={sociedadBloqueada || saving} onChange={event => actualizarForm('hora_ingreso', event.target.value)} /></div>
            <div className="field"><label>Guía de ingreso</label><input className="input" value={form.guia_ingreso} disabled={sociedadBloqueada || saving} onChange={event => actualizarForm('guia_ingreso', event.target.value)} placeholder="N.° de guía o documento" /></div>
            <div className="field"><label>Sociedad</label><input className="input" value={sesion.sociedadActiva?.nombre || sesion.sociedadActiva?.codigo || sociedadId || 'Sin sociedad'} readOnly /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Observaciones</label><textarea className="input" rows="3" value={form.observaciones} disabled={sociedadBloqueada || saving} onChange={event => actualizarForm('observaciones', event.target.value)} /></div>
          </div>

          <div className="card" style={{ marginTop: 14, border: '1px solid var(--card-border)' }}>
            <div className="card-header"><h3>Checklist de condición inicial</h3><span className="hint">Se conserva dentro de observaciones.</span></div>
            <div className="card-body"><div className="grid-2">
              {CHECKLIST_ITEMS.map(([key, label]) => <label key={key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={Boolean(form.checklist[key])} disabled={sociedadBloqueada || saving} onChange={event => setForm(actual => ({ ...actual, checklist: { ...actual.checklist, [key]: event.target.checked } }))} />{label}</label>)}
            </div></div>
          </div>

          <div className="card" style={{ marginTop: 14, border: '1px solid var(--card-border)' }}>
            <div className="card-header"><h3>Evidencia fotográfica</h3><span className="hint">Máximo 8 imágenes; se cargan después de crear la recepción.</span></div>
            <div className="card-body">
              <input className="input" type="file" accept="image/*" capture="environment" multiple disabled={sociedadBloqueada || saving} onChange={seleccionarFotos} />
              {fotos.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>{fotos.map(foto => <div key={`${foto.name}-${foto.lastModified}`} className="chip" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{foto.name}<button type="button" onClick={() => quitarFoto(foto)} disabled={saving} style={{ border: 0, background: 'transparent', cursor: 'pointer' }}>×</button></div>)}</div>}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}><button className="btn btn-primary" type="submit" disabled={saving || sociedadBloqueada || !puedeCrear}>{saving ? 'Guardando...' : 'Registrar recepción'}</button></div>
        </div>
      </form>

      <div className="card">
        <div className="card-header"><h3>Recepciones de la sociedad activa</h3><span className="hint">{loading ? 'Cargando...' : `${recepciones.length} recepción(es)`}</span></div>
        <div className="card-body" style={{ overflowX: 'auto' }}>
          <table className="tbl" style={{ minWidth: 920 }}><thead><tr><th>Recepción</th><th>Activo</th><th>Cliente</th><th>Ingreso</th><th>Almacén</th><th>Custodia</th><th>Acción</th></tr></thead><tbody>
            {recepciones.map(recepcion => {
              const activo = activosPorId.get(recepcion.activo_id);
              return <tr key={recepcion.id}>
                <td className="mono"><strong>{recepcion.numero || recepcion.id}</strong><div className="hint">Caso {recepcion.numero_caso || '—'}</div></td>
                <td>{activo ? nombreActivo(activo) : recepcion.activo_id}</td>
                <td>{nombreCliente(clientesPorId.get(activo?.cliente_propietario_id))}</td>
                <td>{recepcion.fecha_ingreso || '—'}{recepcion.hora_ingreso ? ` ${String(recepcion.hora_ingreso).slice(0, 5)}` : ''}</td>
                <td>{almacenesPorId.get(recepcion.almacen_id)?.nombre || recepcion.almacen_id || '—'}</td>
                <td><span className={badgeClass(recepcion.estado_custodia)}>{ESTADO_LABELS[recepcion.estado_custodia] || recepcion.estado_custodia || 'Recibido'}</span></td>
                <td><select className="select" value={recepcion.estado_custodia || 'recibido'} disabled={!puedeEditar || !sesion.permiteEscritura} onChange={event => cambiarEstado(recepcion.id, event.target.value)}>{ESTADOS_CUSTODIA.map(estado => <option key={estado} value={estado}>{ESTADO_LABELS[estado]}</option>)}</select></td>
              </tr>;
            })}
            {!recepciones.length && <tr><td colSpan="7" className="text-center text-muted" style={{ padding: 24 }}>{loading ? 'Cargando recepciones...' : 'No hay recepciones para la sociedad activa.'}</td></tr>}
          </tbody></table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 12 }}><strong>Tipo de activo pendiente:</strong> no existe la columna <code>activos.tipo_activo</code> en el esquema disponible; esta versión no muestra ese selector.</div>

      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1A2B4A', color: '#f8fafc', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, zIndex: 500, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>{toast}</div>}
      <FooterBrand />
    </div>
  );
}
