import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';
import { DocumentPreviewSheet } from './DocumentPreviewSheet.jsx';

const nuevoItem = () => ({ client_key:globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random()}`, descripcion:'', cantidad:1, unidad:'und', precio_unitario:0 });
const nuevoHito = () => ({ client_key:globalThis.crypto?.randomUUID?.() || `hito-${Date.now()}-${Math.random()}`, concepto:'', porcentaje:0, condicion:'' });
const numero = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const formatMoney = (value, moneda = 'PEN') => new Intl.NumberFormat('es-PE', { style:'currency', currency:moneda || 'PEN', maximumFractionDigits:2 }).format(numero(value));
const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = () => ({
  tipo_documento_id:'', plantilla_documento_id:'', origen_items:'manual', hoja_costeo_id:'', cuenta_id:'', oportunidad_id:'', moneda:'PEN',
  items:[nuevoItem()], contacto_id:'', validez_tipo:'dias', validez_dias:30, validez_fecha:'', hitos_activos:false, hitos_pago:[],
});
const conClavesItems = (items = []) => items.map((item, index) => ({ ...item, client_key:item.client_key || `item-${item.id || index}-${globalThis.crypto?.randomUUID?.() || Math.random()}` }));
const conClavesHitos = (hitos = []) => hitos.map((hito, index) => ({ ...hito, client_key:hito.client_key || `hito-${hito.id || index}-${globalThis.crypto?.randomUUID?.() || Math.random()}` }));

const serializarItems = items => items.map((item, index) => ({
  id:index + 1,
  descripcion:String(item.descripcion || '').trim(),
  cantidad:numero(item.cantidad),
  unidad:String(item.unidad || '').trim(),
  precio_unitario:numero(item.precio_unitario),
}));
const previewTotals = items => {
  const subtotal = serializarItems(items).reduce((sum, item) => sum + item.cantidad * item.precio_unitario, 0);
  const igv = Math.round(subtotal * 0.18);
  return { subtotal:Math.round(subtotal * 100) / 100, igv, total:Math.round((subtotal + igv) * 100) / 100 };
};
const normalizarHitosPreview = (hitos, total) => hitos.map((hito, index) => ({
  id:index + 1,
  concepto:hito.concepto || '',
  porcentaje:numero(hito.porcentaje),
  condicion:hito.condicion || '',
  monto:Math.round(numero(total) * numero(hito.porcentaje)) / 100,
}));
const mensajeError = error => error?.message || String(error || 'No se pudo completar la operación.');

function ResumenTotales({ totals, moneda, estimado = true }) {
  return <div className="card" style={{padding:14, marginTop:12, background:'var(--bg-subtle)'}}>
    <div className="row" style={{justifyContent:'space-between'}}><span>Subtotal</span><strong>{formatMoney(totals.subtotal, moneda)}</strong></div>
    <div className="row" style={{justifyContent:'space-between'}}><span>IGV (18%)</span><strong>{formatMoney(totals.igv, moneda)}</strong></div>
    <div className="row" style={{justifyContent:'space-between', marginTop:6, paddingTop:8, borderTop:'1px solid var(--border)'}}><strong>Total</strong><strong>{formatMoney(totals.total, moneda)}</strong></div>
    {estimado && <div className="text-muted" style={{fontSize:12, marginTop:8}}>Previsualización estimada. El servidor calcula y valida el importe definitivo al guardar.</div>}
  </div>;
}

function ItemsEditor({ items, moneda, disabled, onChange }) {
  const totals = previewTotals(items);
  const patch = (key, field, value) => onChange(items.map(item => item.client_key === key ? { ...item, [field]:value } : item));
  return <>
    <div className="table-wrap"><table className="tbl"><thead><tr><th>Descripción</th><th>Cantidad</th><th>Unidad</th><th>Precio unit.</th><th>Subtotal</th>{!disabled && <th />}</tr></thead><tbody>
      {items.map((item, index) => <tr key={item.client_key || item.id || index}>
        <td><input className="input" value={item.descripcion || ''} disabled={disabled} onChange={event => patch(item.client_key, 'descripcion', event.target.value)} /></td>
        <td><input className="input" type="number" min="0" step="0.01" value={item.cantidad ?? ''} disabled={disabled} onChange={event => patch(item.client_key, 'cantidad', event.target.value)} /></td>
        <td><input className="input" value={item.unidad || ''} disabled={disabled} onChange={event => patch(item.client_key, 'unidad', event.target.value)} /></td>
        <td><input className="input" type="number" min="0" step="0.01" value={item.precio_unitario ?? ''} disabled={disabled} onChange={event => patch(item.client_key, 'precio_unitario', event.target.value)} /></td>
        <td className="num">{formatMoney(numero(item.cantidad) * numero(item.precio_unitario), moneda)}</td>
        {!disabled && <td><button type="button" className="btn btn-ghost" onClick={() => onChange(items.filter(row => row.client_key !== item.client_key))} disabled={items.length <= 1}>×</button></td>}
      </tr>)}
    </tbody></table></div>
    {!disabled && <button type="button" className="btn btn-secondary" style={{marginTop:10}} onClick={() => onChange([...items, nuevoItem()])}>+ Agregar ítem</button>}
    <ResumenTotales totals={totals} moneda={moneda} />
  </>;
}

function HitosEditor({ hitos, activos, total, moneda, disabled, onActivosChange, onChange }) {
  const suma = hitos.reduce((sum, hito) => sum + numero(hito.porcentaje), 0);
  const patch = (key, field, value) => onChange(hitos.map(hito => hito.client_key === key ? { ...hito, [field]:value } : hito));
  return <div>
    <label className="row" style={{gap:8, marginBottom:12}}><input type="checkbox" checked={activos} disabled={disabled} onChange={event => onActivosChange(event.target.checked)} /> Usar hitos de pago</label>
    {activos && <>
      <div className="table-wrap"><table className="tbl"><thead><tr><th>Concepto</th><th>%</th><th>Condición</th><th>Monto estimado</th>{!disabled && <th />}</tr></thead><tbody>{hitos.map((hito, index) => <tr key={hito.client_key || hito.id || index}>
        <td><input className="input" value={hito.concepto || ''} disabled={disabled} onChange={event => patch(hito.client_key, 'concepto', event.target.value)} /></td>
        <td><input className="input" type="number" min="0" max="100" step="0.01" value={hito.porcentaje ?? ''} disabled={disabled} onChange={event => patch(hito.client_key, 'porcentaje', event.target.value)} /></td>
        <td><input className="input" value={hito.condicion || ''} disabled={disabled} onChange={event => patch(hito.client_key, 'condicion', event.target.value)} /></td>
        <td className="num">{formatMoney(numero(total) * numero(hito.porcentaje) / 100, moneda)}</td>
        {!disabled && <td><button type="button" className="btn btn-ghost" onClick={() => onChange(hitos.filter(row => row.client_key !== hito.client_key))}>×</button></td>}
      </tr>)}</tbody></table></div>
      <div className={Math.abs(suma - 100) <= 0.01 ? 'alert alert-info' : 'alert alert-warning'} style={{marginTop:10}}>Porcentaje acumulado: <strong>{suma}%</strong>. Debe sumar exactamente 100%.</div>
      {!disabled && <button type="button" className="btn btn-secondary" onClick={() => onChange([...hitos, nuevoHito()])}>+ Agregar hito</button>}
    </>}
  </div>;
}

export function CotizacionEspecialWizard({ especialId = null, hojaCosteoInicialId = null, empresa, empresaConfig, cuentas = [], oportunidades = [], contactos = [], hojasCosteo = [], adaptarHojaCosteo, sociedadIdEscritura, onBack, onCreated, onEmitted }) {
  const [tipos, setTipos] = useState([]);
  const [plantillas, setPlantillas] = useState([]);
  const [bloques, setBloques] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [cotizacion, setCotizacion] = useState(null);
  const [paso, setPaso] = useState(1);
  const [loading, setLoading] = useState(Boolean(especialId));
  const [saving, setSaving] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [actualizandoPlantilla, setActualizandoPlantilla] = useState(false);
  const [error, setError] = useState('');
  const [plantillaLoading, setPlantillaLoading] = useState(Boolean(especialId));
  const [plantillaError, setPlantillaError] = useState('');

  const tipo = tipos.find(row => row.id === form.tipo_documento_id) || null;
  const tiposVisibles = useMemo(() => empresa?.multisociedad_habilitado
    ? tipos.filter(row => row.sociedad_id === sociedadIdEscritura)
    : tipos.filter(row => !row.sociedad_id), [tipos, empresa?.multisociedad_habilitado, sociedadIdEscritura]);
  const plantilla = plantillas.find(row => row.id === form.plantilla_documento_id) || null;
  const cuenta = cuentas.find(row => row.id === form.cuenta_id) || null;
  const oportunidad = oportunidades.find(row => row.id === form.oportunidad_id) || null;
  const contacto = contactos.find(row => row.id === form.contacto_id) || null;
  const editable = Boolean(cotizacion && cotizacion.estado === 'borrador');
  const readonly = Boolean(cotizacion && cotizacion.estado !== 'borrador');
  const plantillaNuevaDisponible = useMemo(() => {
    if (!editable || !plantilla) return null;
    return plantillas
      .filter(row => row.estado === 'publicada' && Number(row.version) > Number(plantilla.version))
      .sort((a, b) => Number(b.version) - Number(a.version))[0] || null;
  }, [editable, plantilla, plantillas]);
  const totals = useMemo(() => readonly && cotizacion
    ? { subtotal:numero(cotizacion.subtotal), igv:numero(cotizacion.igv), total:numero(cotizacion.total) }
    : previewTotals(form.items), [readonly, cotizacion, form.items]);
  const hitosPreview = useMemo(() => normalizarHitosPreview(form.hitos_pago, totals.total), [form.hitos_pago, totals.total]);
  const contactosCuenta = useMemo(() => contactos.filter(row => row.cuenta_id === form.cuenta_id), [contactos, form.cuenta_id]);
  const hojasDisponibles = useMemo(() => hojasCosteo.filter(hoja => hoja.estado === 'aprobada' && hoja.empresa_id === empresa?.id && (!tipo || hoja.sociedad_id === tipo.sociedad_id)), [hojasCosteo, empresa?.id, tipo?.id, tipo?.sociedad_id]);
  const contexto = useMemo(() => {
    if (readonly && cotizacion?.contexto_emitido_json) return cotizacion.contexto_emitido_json;
    const empresaContexto = {
      id:empresa?.id,
      razon_social:empresaConfig?.razon_social || empresa?.razon_social,
      nombre_comercial:empresa?.nombre_comercial,
      ruc:empresaConfig?.ruc || empresa?.ruc,
      email_comercial:empresaConfig?.email_comercial,
      direccion:empresaConfig?.direccion,
      firmante:empresaConfig?.firmante,
      moneda_base:empresa?.moneda_base,
    };
    const cuentaContexto = cuenta ? { id:cuenta.id, razon_social:cuenta.razon_social, nombre_comercial:cuenta.nombre_comercial, ruc:cuenta.ruc, direccion:cuenta.direccion, moneda:cuenta.moneda } : {};
    return {
      empresa:empresaContexto,
      cliente:cuentaContexto,
      cuenta:cuentaContexto,
      contacto:contacto ? { id:contacto.id, nombre:contacto.nombre, cargo:contacto.cargo, email:contacto.email } : {},
      oportunidad:oportunidad ? { id:oportunidad.id, nombre:oportunidad.nombre, servicio_interes:oportunidad.servicio_interes, monto_estimado:oportunidad.monto_estimado, moneda:oportunidad.moneda } : {},
      cotizacion:{ id:cotizacion?.id || '', numero:cotizacion?.numero || 'Borrador', fecha:cotizacion?.emitida_at?.slice(0, 10) || today(), moneda:form.moneda, items:readonly ? (cotizacion?.items || []) : serializarItems(form.items), subtotal:totals.subtotal, igv_pct:18, igv:totals.igv, total:totals.total, validez_tipo:form.validez_tipo, validez_dias:form.validez_dias, validez_fecha:form.validez_fecha || null, hitos_activos:form.hitos_activos, hitos_pago:hitosPreview },
      emision:cotizacion?.emitida_at ? { fecha:cotizacion.emitida_at.slice(0, 10), emitida_at:cotizacion.emitida_at, emitida_by:cotizacion.emitida_by } : {},
    };
  }, [readonly, cotizacion, empresa, empresaConfig, cuenta, contacto, oportunidad, form, totals, hitosPreview]);

  const cargarTipos = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const sb = await getSupabaseClient();
    const { data, error: queryError } = await sb.from('tipos_documento_electronico').select('id,nombre,codigo,categoria_base,sociedad_id,activo,motor_contenido').eq('categoria_base', 'cotizacion').eq('activo', true).order('nombre');
    if (queryError) throw queryError;
    setTipos(data || []);
  }, []);

  const cargarCotizacion = useCallback(async id => {
    const sb = await getSupabaseClient();
    const { data, error: queryError } = await sb.from('cotizaciones_especiales').select('*').eq('id', id).single();
    if (queryError) throw queryError;
    setCotizacion(data);
    setForm({
      tipo_documento_id:data.tipo_documento_id, plantilla_documento_id:data.plantilla_documento_id, origen_items:data.origen_items, hoja_costeo_id:data.hoja_costeo_id || '', cuenta_id:data.cuenta_id, oportunidad_id:data.oportunidad_id || '', moneda:data.moneda || 'PEN',
      items:conClavesItems(data.items || []), contacto_id:data.contacto_id || '', validez_tipo:data.validez_tipo || 'dias', validez_dias:data.validez_dias ?? 30, validez_fecha:data.validez_fecha || '', hitos_activos:Boolean(data.hitos_activos), hitos_pago:conClavesHitos(data.hitos_pago || []),
    });
  }, []);

  useEffect(() => { cargarTipos().catch(err => setError(mensajeError(err))); }, [cargarTipos]);
  useEffect(() => {
    if (!especialId) { setCotizacion(null); setForm(emptyForm()); setPaso(1); return; }
    setLoading(true); setError('');
    cargarCotizacion(especialId).catch(err => setError(mensajeError(err))).finally(() => setLoading(false));
  }, [especialId, cargarCotizacion]);
  useEffect(() => {
    if (especialId || !hojaCosteoInicialId) return;
    const hoja = hojasCosteo.find(row => row.id === hojaCosteoInicialId);
    if (!hoja) return;
    const oportunidadHC = oportunidades.find(row => row.id === hoja.oportunidad_id);
    const cuentaId = hoja.cuenta_id || oportunidadHC?.cuenta_id || '';
    setForm(current => {
      if (current.hoja_costeo_id === hoja.id && current.origen_items === 'hoja_costeo') return current;
      return {
        ...current,
        origen_items:'hoja_costeo',
        hoja_costeo_id:hoja.id,
        cuenta_id:cuentaId,
        oportunidad_id:hoja.oportunidad_id || '',
        moneda:hoja.moneda || current.moneda,
        items:conClavesItems(adaptarHojaCosteo?.(hoja) || []),
        contacto_id:'',
      };
    });
  }, [especialId, hojaCosteoInicialId, hojasCosteo, oportunidades, adaptarHojaCosteo]);
  useEffect(() => {
    if (!form.tipo_documento_id) {
      setPlantillas([]);
      setPlantillaLoading(false);
      setPlantillaError('');
      return;
    }
    let active = true;
    const cargarPlantillaVinculada = Boolean(especialId && form.plantilla_documento_id);
    setPlantillaLoading(true);
    setPlantillaError('');
    (async () => {
      try {
        const sb = await getSupabaseClient();
        let query = sb.from('plantillas_documento_bloques').select('*').eq('tipo_documento_id', form.tipo_documento_id);
        query = cargarPlantillaVinculada
          ? query.or(`estado.eq.publicada,id.eq.${form.plantilla_documento_id}`).order('version', { ascending:false })
          : query.eq('estado', 'publicada').order('version', { ascending:false });
        const { data, error: queryError } = await query;
        if (queryError) throw queryError;
        if (cargarPlantillaVinculada && !(data || []).some(row => row.id === form.plantilla_documento_id)) {
          throw new Error('No se pudo cargar la plantilla de esta cotización.');
        }
        if (active) setPlantillas(data || []);
      } catch (err) {
        if (active) {
          setError(mensajeError(err));
          if (cargarPlantillaVinculada) setPlantillaError('No se pudo cargar la plantilla de esta cotización.');
        }
      } finally { if (active) setPlantillaLoading(false); }
    })();
    return () => { active = false; };
  }, [especialId, form.tipo_documento_id, form.plantilla_documento_id]);
  useEffect(() => {
    if (!form.plantilla_documento_id) { setBloques([]); return; }
    let active = true;
    (async () => {
      try {
        const sb = await getSupabaseClient();
        const { data, error: queryError } = await sb.from('documento_bloques').select('*').eq('plantilla_documento_id', form.plantilla_documento_id).eq('activo', true).order('orden');
        if (queryError) throw queryError;
        if (active) setBloques(data || []);
      } catch (err) { if (active) setError(mensajeError(err)); }
    })();
    return () => { active = false; };
  }, [form.plantilla_documento_id]);

  const cambiarTipo = tipoDocumentoId => setForm(current => ({
    ...current,
    tipo_documento_id:tipoDocumentoId,
    plantilla_documento_id:'',
    ...(current.origen_items === 'hoja_costeo' && current.hoja_costeo_id
      ? {}
      : { hoja_costeo_id:'', origen_items:'manual' }),
  }));
  const seleccionarHC = hojaCosteoId => {
    const hoja = hojasDisponibles.find(row => row.id === hojaCosteoId);
    const oppHC = oportunidades.find(row => row.id === hoja?.oportunidad_id);
    const cuentaId = hoja?.cuenta_id || oppHC?.cuenta_id || '';
    setForm(current => ({ ...current, origen_items:'hoja_costeo', hoja_costeo_id:hojaCosteoId, cuenta_id:cuentaId, oportunidad_id:hoja?.oportunidad_id || '', moneda:hoja?.moneda || current.moneda, items:hoja ? conClavesItems(adaptarHojaCosteo?.(hoja) || []) : [] }));
  };
  const validarPaso = target => {
    if (target > 1 && (!form.tipo_documento_id || !form.plantilla_documento_id)) return 'Seleccione un tipo y una plantilla publicada.';
    if (target > 2 && !form.cuenta_id) return 'Seleccione una cuenta.';
    if (target > 2 && form.origen_items === 'hoja_costeo' && !form.hoja_costeo_id) return 'Seleccione una Hoja de Costeo aprobada.';
    if (target > 2 && form.origen_items === 'manual' && !serializarItems(form.items).some(item => item.descripcion && item.cantidad > 0 && item.precio_unitario >= 0)) return 'Agregue al menos un ítem válido.';
    if (target > 4 && form.validez_tipo === 'dias' && numero(form.validez_dias) < 1) return 'Ingrese al menos un día de validez.';
    if (target > 4 && form.validez_tipo === 'fecha_exacta' && !form.validez_fecha) return 'Seleccione la fecha de validez.';
    if (target > 4 && form.hitos_activos && Math.abs(form.hitos_pago.reduce((sum, hito) => sum + numero(hito.porcentaje), 0) - 100) > 0.01) return 'Los porcentajes de hitos deben sumar exactamente 100%.';
    return '';
  };
  const avanzar = () => { const validation = validarPaso(paso + 1); if (validation) return setError(validation); setError(''); setPaso(current => Math.min(5, current + 1)); };
  const volver = () => { setError(''); setPaso(current => Math.max(1, current - 1)); };

  const crear = async () => {
    const validation = validarPaso(5);
    if (validation) return setError(validation);
    setSaving(true); setError('');
    try {
      const sb = await getSupabaseClient();
      const { data, error: rpcError } = await sb.rpc('crear_cotizacion_especial', {
        p_tipo_documento_id:form.tipo_documento_id, p_plantilla_documento_id:form.plantilla_documento_id, p_cuenta_id:form.cuenta_id, p_oportunidad_id:form.oportunidad_id || null,
        p_origen_items:form.origen_items, p_hoja_costeo_id:form.origen_items === 'hoja_costeo' ? form.hoja_costeo_id : null, p_moneda:form.moneda,
        p_items:form.origen_items === 'manual' ? serializarItems(form.items) : null, p_contacto_id:form.contacto_id || null, p_validez_tipo:form.validez_tipo,
        p_validez_dias:form.validez_tipo === 'dias' ? Number(form.validez_dias) : null, p_validez_fecha:form.validez_tipo === 'fecha_exacta' ? form.validez_fecha : null,
        p_hitos_activos:form.hitos_activos, p_hitos_pago:form.hitos_activos ? form.hitos_pago.map(({ concepto, porcentaje, condicion }) => ({ concepto, porcentaje:numero(porcentaje), condicion })) : [],
      });
      if (rpcError) throw rpcError;
      const created = Array.isArray(data) ? data[0] : data;
      if (!created?.id) throw new Error('El servidor no devolvió el identificador del borrador creado.');
      onCreated?.(created.id);
    } catch (err) { setError(mensajeError(err)); }
    finally { setSaving(false); }
  };

  const guardarItems = async () => {
    setSaving(true); setError('');
    try {
      const sb = await getSupabaseClient();
      const { error: rpcError } = await sb.rpc('actualizar_items_cotizacion_especial', { p_id:cotizacion.id, p_items:serializarItems(form.items) });
      if (rpcError) throw rpcError;
      await cargarCotizacion(cotizacion.id);
    } catch (err) { setError(mensajeError(err)); }
    finally { setSaving(false); }
  };
  const guardarDatos = async () => {
    if (form.hitos_activos && Math.abs(form.hitos_pago.reduce((sum, hito) => sum + numero(hito.porcentaje), 0) - 100) > 0.01) return setError('Los porcentajes de hitos deben sumar exactamente 100%.');
    setSaving(true); setError('');
    try {
      const sb = await getSupabaseClient();
      const { error: rpcError } = await sb.rpc('actualizar_datos_cotizacion_especial', {
        p_id:cotizacion.id, p_contacto_id:form.contacto_id || null, p_validez_tipo:form.validez_tipo,
        p_validez_dias:form.validez_tipo === 'dias' ? Number(form.validez_dias) : null, p_validez_fecha:form.validez_tipo === 'fecha_exacta' ? form.validez_fecha : null,
        p_hitos_activos:form.hitos_activos, p_hitos_pago:form.hitos_activos ? form.hitos_pago.map(({ concepto, porcentaje, condicion }) => ({ concepto, porcentaje:numero(porcentaje), condicion })) : [],
      });
      if (rpcError) throw rpcError;
      await cargarCotizacion(cotizacion.id);
    } catch (err) { setError(mensajeError(err)); }
    finally { setSaving(false); }
  };
  const actualizarPlantilla = async () => {
    if (!cotizacion?.id || !plantillaNuevaDisponible) return;
    setActualizandoPlantilla(true); setError('');
    try {
      const sb = await getSupabaseClient();
      const { error: rpcError } = await sb.rpc('actualizar_plantilla_cotizacion_especial', {
        p_id:cotizacion.id,
        p_plantilla_documento_id:plantillaNuevaDisponible.id,
      });
      if (rpcError) throw rpcError;
      await cargarCotizacion(cotizacion.id);
    } catch (err) { setError(mensajeError(err)); }
    finally { setActualizandoPlantilla(false); }
  };
  const emitir = async () => {
    setEmitting(true); setError('');
    try {
      const sb = await getSupabaseClient();
      const { data, error: rpcError } = await sb.rpc('emitir_cotizacion_especial', { p_id:cotizacion.id });
      if (rpcError) throw rpcError;
      const emitted = Array.isArray(data) ? data[0] : data;
      await cargarCotizacion(emitted?.id || cotizacion.id);
      onEmitted?.(emitted?.id || cotizacion.id);
    } catch (err) { setError(mensajeError(err)); }
    finally { setEmitting(false); }
  };

  if (loading) return <div className="p-4 text-muted">Cargando Cotización Especial…</div>;
  if (!isSupabaseConfigured()) return <div className="p-4"><div className="alert alert-danger">Supabase no está configurado.</div></div>;

  const selectorDatos = <>
    <div className="grid-2"><div className="input-group"><label>Contacto (opcional)</label><select className="input" value={form.contacto_id} disabled={readonly || !form.cuenta_id} onChange={event => setForm(current => ({ ...current, contacto_id:event.target.value }))}><option value="">Sin contacto</option>{contactosCuenta.map(row => <option key={row.id} value={row.id}>{row.nombre || row.email || row.id}</option>)}</select></div>
      <div className="input-group"><label>Tipo de validez</label><select className="input" value={form.validez_tipo} disabled={readonly} onChange={event => setForm(current => ({ ...current, validez_tipo:event.target.value }))}><option value="dias">Por días</option><option value="fecha_exacta">Fecha exacta</option></select></div></div>
    <div className="input-group" style={{marginTop:10}}>{form.validez_tipo === 'dias' ? <><label>Días de validez</label><input className="input" type="number" min="1" value={form.validez_dias ?? ''} disabled={readonly} onChange={event => setForm(current => ({ ...current, validez_dias:event.target.value }))} /></> : <><label>Válida hasta</label><input className="input" type="date" value={form.validez_fecha || ''} disabled={readonly} onChange={event => setForm(current => ({ ...current, validez_fecha:event.target.value }))} /></>}</div>
  </>;

  if (cotizacion) return <div className="page-content"><div className="page-header"><div><button type="button" className="btn btn-ghost" onClick={onBack}>← Cotizaciones</button><h1 className="page-title">Cotización Especial {cotizacion.numero}</h1><div className="page-sub">Estado: <span className="badge badge-cyan">{cotizacion.estado}</span></div></div>{editable && <button type="button" className="btn btn-primary" disabled={emitting} onClick={emitir}>{emitting ? 'Emitiendo…' : 'Emitir'}</button>}</div>
    {error && <div className="alert alert-danger">{error}</div>}
    {plantillaNuevaDisponible && <div className="alert alert-warning row" style={{justifyContent:'space-between', gap:12, alignItems:'center'}}><span>Hay una versión más reciente de esta plantilla (v{plantillaNuevaDisponible.version}).</span><button type="button" className="btn btn-secondary" disabled={actualizandoPlantilla} onClick={actualizarPlantilla}>{actualizandoPlantilla ? 'Actualizando…' : 'Actualizar a la versión más reciente'}</button></div>}
    {readonly && <div className="alert alert-info">Documento emitido: los datos y el contexto mostrado son el snapshot persistido.</div>}
    <div className="grid-2" style={{alignItems:'start'}}><div style={{display:'grid', gap:16}}>
      <section className="card"><div className="card-head"><h3>Ítems</h3>{editable && form.origen_items === 'manual' && <button type="button" className="btn btn-secondary" disabled={saving} onClick={guardarItems}>{saving ? 'Guardando…' : 'Guardar ítems'}</button>}</div><div className="card-body">{form.origen_items === 'hoja_costeo' && <div className="alert alert-info">Ítems vinculados a Hoja de Costeo aprobada; no son editables manualmente.</div>}<ItemsEditor items={form.items} moneda={form.moneda} disabled={readonly || form.origen_items !== 'manual'} onChange={items => setForm(current => ({ ...current, items }))} /></div></section>
      <section className="card"><div className="card-head"><h3>Contacto, validez y hitos</h3>{editable && <button type="button" className="btn btn-secondary" disabled={saving} onClick={guardarDatos}>{saving ? 'Guardando…' : 'Guardar datos'}</button>}</div><div className="card-body">{selectorDatos}<hr style={{border:0, borderTop:'1px solid var(--border)', margin:'18px 0'}} /><HitosEditor hitos={form.hitos_pago} activos={form.hitos_activos} total={totals.total} moneda={form.moneda} disabled={readonly} onActivosChange={hitos_activos => setForm(current => ({ ...current, hitos_activos, hitos_pago:hitos_activos && !current.hitos_pago.length ? [nuevoHito()] : current.hitos_pago }))} onChange={hitos_pago => setForm(current => ({ ...current, hitos_pago }))} /></div></section>
    </div><section className="card"><div className="card-head"><h3>Vista previa</h3><span className="text-muted">Valores {readonly ? 'emitidos' : 'actuales'}</span></div><div className="card-body">{plantilla ? <DocumentPreviewSheet plantilla={plantilla} bloques={bloques} categoria="cotizacion" contexto={contexto} /> : plantillaError ? <div className="alert alert-danger">{plantillaError}</div> : plantillaLoading ? <div className="text-muted">Cargando plantilla…</div> : <div className="alert alert-danger">No se pudo cargar la plantilla de esta cotización.</div>}</div></section></div></div>;

  return <div className="page-content"><div className="page-header"><div><button type="button" className="btn btn-ghost" onClick={onBack}>← Cotizaciones</button><h1 className="page-title">Nueva Cotización Especial</h1><div className="page-sub">Paso {paso} de 5</div></div></div>{error && <div className="alert alert-danger">{error}</div>}
    <div className="card"><div className="card-body">
      {paso === 1 && <><h3>1. Tipo y plantilla</h3><div className="grid-2"><div className="input-group"><label>Tipo de documento</label><select className="input" value={form.tipo_documento_id} onChange={event => cambiarTipo(event.target.value)}><option value="">Seleccione…</option>{tiposVisibles.map(row => <option key={row.id} value={row.id}>{row.nombre}</option>)}</select></div><div className="input-group"><label>Plantilla publicada</label><select className="input" value={form.plantilla_documento_id} disabled={!form.tipo_documento_id} onChange={event => setForm(current => ({ ...current, plantilla_documento_id:event.target.value }))}><option value="">Seleccione…</option>{plantillas.map(row => <option key={row.id} value={row.id}>v{row.version} — {row.nombre_interno}</option>)}</select></div></div></>}
      {paso === 2 && <><h3>2. Origen de ítems</h3><div className="row" style={{gap:12, marginBottom:14}}><label><input type="radio" checked={form.origen_items === 'manual'} onChange={() => setForm(current => ({ ...current, origen_items:'manual', hoja_costeo_id:'' }))} /> Manual</label><label><input type="radio" checked={form.origen_items === 'hoja_costeo'} onChange={() => setForm(current => ({ ...current, origen_items:'hoja_costeo', items:[] }))} /> Hoja de Costeo</label></div>{form.origen_items === 'hoja_costeo' ? <div className="input-group"><label>Hoja de Costeo aprobada</label><select className="input" value={form.hoja_costeo_id} onChange={event => seleccionarHC(event.target.value)}><option value="">Seleccione…</option>{hojasDisponibles.map(row => <option key={row.id} value={row.id}>{row.numero || row.id}</option>)}</select></div> : null}<div className="grid-2" style={{marginTop:14}}><div className="input-group"><label>Cuenta</label><select className="input" value={form.cuenta_id} disabled={form.origen_items === 'hoja_costeo'} onChange={event => setForm(current => ({ ...current, cuenta_id:event.target.value, contacto_id:'' }))}><option value="">Seleccione…</option>{cuentas.filter(row => row.empresa_id === empresa?.id).map(row => <option key={row.id} value={row.id}>{row.razon_social || row.nombre_comercial}</option>)}</select></div><div className="input-group"><label>Oportunidad (opcional)</label><select className="input" value={form.oportunidad_id} disabled={form.origen_items === 'hoja_costeo'} onChange={event => setForm(current => ({ ...current, oportunidad_id:event.target.value }))}><option value="">Sin oportunidad</option>{oportunidades.filter(row => row.empresa_id === empresa?.id && (!form.cuenta_id || row.cuenta_id === form.cuenta_id)).map(row => <option key={row.id} value={row.id}>{row.nombre}</option>)}</select></div></div><div className="input-group" style={{marginTop:14}}><label>Moneda</label><select className="input" value={form.moneda} onChange={event => setForm(current => ({ ...current, moneda:event.target.value }))}><option value="PEN">PEN</option><option value="USD">USD</option><option value="EUR">EUR</option></select></div><div style={{marginTop:16}}><ItemsEditor items={form.items} moneda={form.moneda} disabled={form.origen_items === 'hoja_costeo'} onChange={items => setForm(current => ({ ...current, items }))} /></div></>}
      {paso === 3 && <><h3>3. Contacto y validez</h3>{selectorDatos}</>}
      {paso === 4 && <><h3>4. Hitos de pago</h3><HitosEditor hitos={form.hitos_pago} activos={form.hitos_activos} total={totals.total} moneda={form.moneda} onActivosChange={hitos_activos => setForm(current => ({ ...current, hitos_activos, hitos_pago:hitos_activos && !current.hitos_pago.length ? [nuevoHito()] : current.hitos_pago }))} onChange={hitos_pago => setForm(current => ({ ...current, hitos_pago }))} /></>}
      {paso === 5 && <><h3>5. Revisión y creación</h3><div className="alert alert-info">La vista previa usa los valores actuales. El servidor seguirá siendo la fuente de verdad al crear el borrador.</div><ResumenTotales totals={totals} moneda={form.moneda} /><div style={{marginTop:16}}>{plantilla ? <DocumentPreviewSheet plantilla={plantilla} bloques={bloques} categoria="cotizacion" contexto={contexto} /> : <div className="text-muted">Seleccione una plantilla publicada para ver la composición.</div>}</div></>}
      <div className="row" style={{justifyContent:'space-between', marginTop:22}}><button type="button" className="btn btn-secondary" onClick={paso === 1 ? onBack : volver}>← {paso === 1 ? 'Cancelar' : 'Volver'}</button>{paso < 5 ? <button type="button" className="btn btn-primary" onClick={avanzar}>Continuar →</button> : <button type="button" className="btn btn-primary" disabled={saving} onClick={crear}>{saving ? 'Creando…' : 'Crear borrador'}</button>}</div>
    </div></div>
  </div>;
}
