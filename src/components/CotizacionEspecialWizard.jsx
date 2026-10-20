import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';
import { DocumentPreviewSheet } from './DocumentPreviewSheet.jsx';
import { NuevaCuentaModal } from './NuevaCuentaModal.jsx';
import { marcarRecepcionActivoClienteCotizada } from '../services/recepcionesActivosClienteService.js';
import { maestrosService } from '../services/maestrosService.js';
import { calcularTerminosEquipo, subtotalItem } from '../lib/terminosEquipo.js';
import { I } from '../icons.jsx';
import { useApp } from '../context.jsx';
import '../cotizacion_especial.css';

const LINEAS_NEGOCIO_ESP = { flota_alquileres:'Flota & Alquileres', maestranza_fab:'Maestranza / Fabricación', transporte_comercial:'Transporte Comercial', venta_repuestos:'Venta de Repuestos' };

const nuevoItem = () => ({ client_key:globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random()}`, descripcion:'', cantidad:1, unidad:'UND', precio_unitario:0 });
const nuevoHito = () => ({ client_key:globalThis.crypto?.randomUUID?.() || `hito-${Date.now()}-${Math.random()}`, concepto:'', porcentaje:0, condicion:'' });
const numero = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const formatMoney = (value, moneda = 'PEN') => new Intl.NumberFormat('es-PE', { style:'currency', currency:moneda || 'PEN', maximumFractionDigits:2 }).format(numero(value));
const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = () => ({
  tipo_documento_id:'', plantilla_documento_id:'', origen_items:'manual', hoja_costeo_id:'', cuenta_id:'', oportunidad_id:'', linea_negocio:'', moneda:'PEN',
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
  ...(Object.hasOwn(item, 'codigo') ? { codigo:item.codigo ?? '' } : {}),
  ...(Object.hasOwn(item, 'nombre_activo') ? { nombre_activo:item.nombre_activo ?? '' } : {}),
  ...(Object.hasOwn(item, 'horas_estimadas') ? { horas_estimadas:item.horas_estimadas ?? null } : {}),
  ...(Object.hasOwn(item, 'marca') ? { marca:item.marca ?? '' } : {}),
  ...(Object.hasOwn(item, 'modelo') ? { modelo:item.modelo ?? '' } : {}),
  ...(Object.hasOwn(item, 'año_fabricacion') ? { año_fabricacion:item.año_fabricacion ?? null } : {}),
  ...(Object.hasOwn(item, 'año_overhaul') ? { año_overhaul:item.año_overhaul ?? null } : {}),
  ...(Object.hasOwn(item, 'horas_minimas_garantizadas') ? { horas_minimas_garantizadas:item.horas_minimas_garantizadas ?? null } : {}),
  ...(Object.hasOwn(item, 'costo_hora') ? { costo_hora:item.costo_hora ?? null } : {}),
  ...(Object.hasOwn(item, 'costo_hora_adicional') ? { costo_hora_adicional:item.costo_hora_adicional ?? null } : {}),
  ...(Object.hasOwn(item, 'duracion_meses') ? { duracion_meses:item.duracion_meses ?? null } : {}),
  ...(Object.hasOwn(item, 'costo_mes') ? { costo_mes:item.costo_mes ?? null } : {}),
  ...(Object.hasOwn(item, 'costo_periodo') ? { costo_periodo:item.costo_periodo ?? null } : {}),
  ...(calcularTerminosEquipo(item) || {}),
  subtotal:subtotalItem(item),
  ...(item.activo_id ? { activo_id:item.activo_id } : {}),
  ...(item.contrato_alquiler_id ? { contrato_alquiler_id:item.contrato_alquiler_id } : {}),
}));
const mismaPartidaOrigen = (items = []) => items.map(({ client_key, ...item }) => item);
const mismosItemsOrigen = (a = [], b = []) => JSON.stringify(mismaPartidaOrigen(a)) === JSON.stringify(mismaPartidaOrigen(b));
const previewTotals = items => {
  const subtotal = serializarItems(items).reduce((sum, item) => sum + item.subtotal, 0);
  // IGV con céntimos, igual que el servidor (migración 20261020160000).
  const igv = Math.round(subtotal * 18) / 100;
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

const esperarSiguientePintado = () => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));

const esperarImagen = imagen => new Promise((resolve, reject) => {
  if (imagen.complete) {
    if (imagen.naturalWidth > 0) resolve();
    else reject(new Error(`No se pudo cargar la imagen ${imagen.currentSrc || imagen.src || ''}.`));
    return;
  }
  imagen.addEventListener('load', () => resolve(), { once:true });
  imagen.addEventListener('error', () => reject(new Error(`No se pudo cargar la imagen ${imagen.currentSrc || imagen.src || ''}.`)), { once:true });
});

const verificarCORSDeImagenes = async imagenes => {
  const externas = imagenes.filter(imagen => {
    const src = imagen.currentSrc || imagen.src || '';
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) return false;
    try { return new URL(src, window.location.href).origin !== window.location.origin; }
    catch { return false; }
  });
  const bloqueadas = (await Promise.all(externas.map(async imagen => {
    const src = imagen.currentSrc || imagen.src;
    try {
      const respuesta = await fetch(src, { mode:'cors', cache:'no-store' });
      return respuesta.ok ? null : src;
    } catch {
      return src;
    }
  }))).filter(Boolean);
  if (bloqueadas.length) throw new Error('No se pudo capturar una imagen porque su servidor no habilita CORS. Revise la configuración del recurso e inténtelo nuevamente.');
};

const esperarRecursosVistaPrevia = async paginas => {
  await document.fonts?.ready;
  const imagenes = paginas
    .flatMap(pagina => [...pagina.querySelectorAll('img')])
    .filter(imagen => !imagen.classList.contains('ProseMirror-separator'));
  await Promise.all(imagenes.map(esperarImagen));
  await verificarCORSDeImagenes(imagenes);
  await esperarSiguientePintado();
};

const nombreArchivoCotizacion = numero => `Cotizacion-${String(numero || 'sin-numero').replace(/[\\/:*?"<>|]/g, '-')}.pdf`;

function ResumenTotales({ totals, moneda, estimado = true }) {
  return <div className="card" style={{padding:14, marginTop:12, background:'var(--bg-subtle)'}}>
    <div className="row" style={{justifyContent:'space-between'}}><span>Subtotal</span><strong>{formatMoney(totals.subtotal, moneda)}</strong></div>
    <div className="row" style={{justifyContent:'space-between'}}><span>IGV (18%)</span><strong>{formatMoney(totals.igv, moneda)}</strong></div>
    <div className="row" style={{justifyContent:'space-between', marginTop:6, paddingTop:8, borderTop:'1px solid var(--border)'}}><strong>Total</strong><strong>{formatMoney(totals.total, moneda)}</strong></div>
    {estimado && <div className="text-muted" style={{fontSize:12, marginTop:8}}>Previsualización estimada. El servidor calcula y valida el importe definitivo al guardar.</div>}
  </div>;
}

function ReferenciaHojaCosteo({ hoja, moneda }) {
  if (!hoja) return null;
  const monedaHoja = hoja.moneda || moneda || 'PEN';
  const margen = hoja.margen_objetivo_pct;
  return <div className="card" style={{padding:14, marginBottom:16, background:'var(--bg-subtle)', border:'1px solid var(--border)'}}>
    <div style={{fontWeight:700, marginBottom:4}}>Referencia de Hoja de Costeo {hoja.numero ? `· ${hoja.numero}` : ''}</div>
    <div className="text-muted" style={{fontSize:12, marginBottom:10}}>Estos valores son informativos; las partidas de esta cotización se pueden ajustar libremente.</div>
    <div className="grid-2" style={{gap:8, fontSize:13}}>
      <div><span className="text-muted">Costo total</span><br/><strong>{formatMoney(hoja.costo_total, monedaHoja)}</strong></div>
      <div><span className="text-muted">Margen objetivo</span><br/><strong>{margen === null || margen === undefined || margen === '' ? '—' : `${numero(margen)}%`}</strong></div>
      <div><span className="text-muted">Precio sugerido sin IGV</span><br/><strong>{formatMoney(hoja.precio_sugerido_sin_igv, monedaHoja)}</strong></div>
      <div><span className="text-muted">Precio sugerido total</span><br/><strong>{formatMoney(hoja.precio_sugerido_total, monedaHoja)}</strong></div>
    </div>
  </div>;
}

function ItemsEditor({ items, moneda, disabled, onChange, unidades = [], mostrarTotales = true }) {
  const totals = previewTotals(items);
  const codigosCatalogo = new Set(unidades.map(unidad => String(unidad.codigo || '').toUpperCase()));
  const unidadesVisibles = [
    ...items
      .map(item => String(item.unidad || '').trim())
      .filter(valor => valor && !codigosCatalogo.has(valor.toUpperCase()))
      .filter((valor, index, valores) => valores.findIndex(actual => actual.toUpperCase() === valor.toUpperCase()) === index)
      .map(valor => ({ id:`legacy-${valor}`, codigo:valor, nombre:'Valor existente' })),
    ...unidades,
  ];
  const patch = (key, field, value) => onChange(items.map(item => {
    if (item.client_key !== key) return item;
    // En ítems con términos de equipo, el precio unitario es el costo por hora.
    const espejo = field === 'precio_unitario' && Object.hasOwn(item, 'costo_hora') ? { costo_hora:value } : {};
    return { ...item, [field]:value, ...espejo };
  }));
  return <>
    <div className="table-wrap"><table className="tbl"><thead><tr><th>Descripción</th><th>Cantidad</th><th>Unidad</th><th>Precio unit.</th><th>Subtotal</th>{!disabled && <th />}</tr></thead><tbody>
      {items.map((item, index) => <tr key={item.client_key || item.id || index}>
        <td><input className="input" value={item.descripcion || ''} disabled={disabled} onChange={event => patch(item.client_key, 'descripcion', event.target.value)} /></td>
        <td><input className="input" type="number" min="0" step="0.01" value={item.cantidad ?? ''} disabled={disabled} onChange={event => patch(item.client_key, 'cantidad', event.target.value)} /></td>
        <td><select className="input" value={item.unidad || ''} disabled={disabled} onChange={event => patch(item.client_key, 'unidad', event.target.value)}><option value="">Seleccione…</option>{unidadesVisibles.map(unidad => <option key={unidad.id || unidad.codigo} value={unidad.codigo}>{unidad.codigo} — {unidad.nombre}</option>)}</select></td>
        <td><input className="input" type="number" min="0" step="0.01" value={item.precio_unitario ?? ''} disabled={disabled} onChange={event => patch(item.client_key, 'precio_unitario', event.target.value)} /></td>
        <td className="num">{formatMoney(subtotalItem(item), moneda)}</td>
        {!disabled && <td><button type="button" className="btn btn-ghost" aria-label="Eliminar ítem" onClick={() => onChange(items.filter(row => row.client_key !== item.client_key))} disabled={items.length <= 1}>×</button></td>}
      </tr>)}
    </tbody></table></div>
    {!disabled && <button type="button" className="btn btn-secondary" style={{marginTop:10}} onClick={() => onChange([...items, nuevoItem()])}>+ Agregar ítem</button>}
    {mostrarTotales && <ResumenTotales totals={totals} moneda={moneda} />}
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
        {!disabled && <td><button type="button" className="btn btn-ghost" aria-label="Eliminar hito" onClick={() => onChange(hitos.filter(row => row.client_key !== hito.client_key))}>×</button></td>}
      </tr>)}</tbody></table></div>
      <div className={Math.abs(suma - 100) <= 0.01 ? 'alert alert-info' : 'alert alert-warning'} style={{marginTop:10}}>Porcentaje acumulado: <strong>{suma}%</strong>. Debe sumar exactamente 100%.</div>
      {!disabled && <button type="button" className="btn btn-secondary" onClick={() => onChange([...hitos, nuevoHito()])}>+ Agregar hito</button>}
    </>}
  </div>;
}

function AceptacionEspecialQR({ token }) {
  const [dataUrl, setDataUrl] = useState('');
  const [copiado, setCopiado] = useState(false);
  const url = (import.meta.env.VITE_APP_URL || window.location.origin) + '/#aceptar-especial/' + token;
  useEffect(() => {
    let activa = true;
    import('qrcode').then(modulo => modulo.default.toDataURL(url, { width:160, margin:1 }))
      .then(valor => { if (activa) setDataUrl(valor); })
      .catch(() => { if (activa) setDataUrl(''); });
    return () => { activa = false; };
  }, [url]);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(url); setCopiado(true); }
    catch { setCopiado(false); }
  };
  return <section className="dx-cotesp-card">
    <div className="dx-cotesp-card-h"><h2>Enviar para aceptación</h2><span className="dx-cotesp-pill is-amber"><i />Pendiente</span></div>
    <div className="dx-cotesp-card-b">
      <div className="dx-cotesp-qr">
        {dataUrl ? <img src={dataUrl} alt="QR de aceptación" width="140" height="140" /> : <div className="dx-cotesp-muted" style={{width:140}}>Generando QR…</div>}
        <div>
          <p className="dx-cotesp-muted">Comparte este enlace con el cliente. El documento ya está congelado y solo podrá registrar su aceptación.</p>
          <div className="dx-cotesp-link">{url}</div>
          <button type="button" className="dx-cotesp-btn is-sm" onClick={copiar}>{I.copy}{copiado ? 'Enlace copiado' : 'Copiar enlace'}</button>
        </div>
      </div>
    </div>
  </section>;
}

function AceptacionManualEspecialModal({ onClose, onConfirmar }) {
  const [nombre, setNombre] = useState('');
  const [dni, setDni] = useState('');
  const [fecha, setFecha] = useState(today());
  const [canal, setCanal] = useState('correo');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const confirmar = async () => {
    if (!nombre.trim() || !fecha || !canal) { setError('Nombre, fecha y canal son obligatorios.'); return; }
    setSaving(true); setError('');
    try { await onConfirmar({ nombre:nombre.trim(), dni:dni.trim(), fecha, canal, notas:notas.trim() }); }
    catch (err) { setError(mensajeError(err)); setSaving(false); }
  };
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" style={{maxWidth:520}} onClick={event => event.stopPropagation()}>
    <div className="modal-head"><h3>Registrar aceptación manual</h3><button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">{I.x}</button></div>
    <div className="modal-body" style={{display:'grid', gap:12}}>
      <div className="input-group"><label>Nombre de quien acepta *</label><input className="input" value={nombre} onChange={event => setNombre(event.target.value)} /></div>
      <div className="grid-2"><div className="input-group"><label>DNI / documento</label><input className="input" value={dni} onChange={event => setDni(event.target.value)} /></div><div className="input-group"><label>Fecha de aceptación *</label><input className="input" type="date" value={fecha} onChange={event => setFecha(event.target.value)} /></div></div>
      <div className="input-group"><label>Canal *</label><select className="input" value={canal} onChange={event => setCanal(event.target.value)}><option value="correo">Correo</option><option value="whatsapp">WhatsApp</option><option value="reunion">Reunión</option><option value="telefono">Teléfono</option><option value="otro">Otro</option></select></div>
      <div className="input-group"><label>Notas</label><textarea className="input" rows="3" value={notas} onChange={event => setNotas(event.target.value)} /></div>
      {error && <div className="alert alert-danger">{error}</div>}
    </div>
    <div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button><button type="button" className="btn btn-primary" onClick={confirmar} disabled={saving}>{saving ? 'Registrando…' : 'Confirmar aceptación'}</button></div>
  </div></div>;
}

export function CotizacionEspecialWizard({ especialId = null, hojaCosteoInicialId = null, lineaNegocioInicial = null, plantillaInicialId = null, tipoDocumentoInicialId = null, cuentaInicialId = null, oportunidadInicialId = null, proyectoInicialId = null, contratoAlquilerInicialId = null, itemsIniciales = [], monedaInicial = null, activoInicialId = null, recepcionInicialId = null, recepcionNumeroInicial = null, activoCodigoInicial = null, activoNombreInicial = null, empresa, empresaConfig, cuentas = [], oportunidades = [], contactos = [], hojasCosteo = [], adaptarHojaCosteo, sociedadIdEscritura, crearCuenta, comercialesAsignables = [], onBack, onCreated, onEmitted, onGenerarOS, onVerOS }) {
  const [tipos, setTipos] = useState([]);
  const [plantillas, setPlantillas] = useState([]);
  const [bloques, setBloques] = useState([]);
  const [contenidoEmitido, setContenidoEmitido] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [unidades, setUnidades] = useState([]);
  const [cuentasLocales, setCuentasLocales] = useState(cuentas);
  const [nuevaCuentaAbierta, setNuevaCuentaAbierta] = useState(false);
  const [cotizacion, setCotizacion] = useState(null);
  const [paso, setPaso] = useState(1);
  const [loading, setLoading] = useState(Boolean(especialId));
  const [saving, setSaving] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [aceptacionManualAbierta, setAceptacionManualAbierta] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);
  const [actualizandoPlantilla, setActualizandoPlantilla] = useState(false);
  const [osVinculada, setOsVinculada] = useState(null);
  const [osVinculadaCargando, setOsVinculadaCargando] = useState(false);
  const [osVinculadaError, setOsVinculadaError] = useState('');
  const [error, setError] = useState('');
  const [plantillaLoading, setPlantillaLoading] = useState(Boolean(especialId));
  const [plantillaError, setPlantillaError] = useState('');
  const [cambiandoPlantilla, setCambiandoPlantilla] = useState(false);
  const { monedasActivas } = useApp();
  const vistaPreviaRef = useRef(null);
  const resumenCotizacionRef = useRef(null);
  const [alturaResumenCotizacion, setAlturaResumenCotizacion] = useState(null);

  useEffect(() => {
    setCuentasLocales(actuales => {
      const porId = new Map(actuales.map(cuenta => [cuenta.id, cuenta]));
      cuentas.forEach(cuenta => porId.set(cuenta.id, cuenta));
      return [...porId.values()];
    });
  }, [cuentas]);

  useEffect(() => {
    let activa = true;
    maestrosService.getUnidadesMedida(empresa?.id).then(data => {
      if (activa) setUnidades(data);
    });
    return () => { activa = false; };
  }, [empresa?.id]);

  useEffect(() => {
    if (!cotizacion) return undefined;
    const resumen = resumenCotizacionRef.current;
    if (!resumen) return undefined;
    const medir = () => {
      const altura = Math.ceil(resumen.getBoundingClientRect().height);
      setAlturaResumenCotizacion(actual => actual === altura ? actual : altura);
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(medir);
    observer.observe(resumen);
    return () => observer.disconnect();
  }, [cotizacion?.id]);

  const opcionesMonedaEsp = useMemo(() => {
    const activas = (monedasActivas || [])
      .map(moneda => ({ codigo:String(moneda.codigo || '').trim().toUpperCase(), nombre:moneda.nombre || '' }))
      .filter((moneda, index, lista) => moneda.codigo && lista.findIndex(item => item.codigo === moneda.codigo) === index);
    const base = activas.length ? activas : [{ codigo:'PEN', nombre:'Sol Peruano' }, { codigo:'USD', nombre:'Dólar' }];
    const actual = String(form.moneda || '').toUpperCase();
    return actual && !base.some(moneda => moneda.codigo === actual) ? [...base, { codigo:actual, nombre:'' }] : base;
  }, [monedasActivas, form.moneda]);
  const tipo = tipos.find(row => row.id === form.tipo_documento_id) || null;
  const tiposVisibles = useMemo(() => empresa?.multisociedad_habilitado
    ? tipos.filter(row => row.sociedad_id === sociedadIdEscritura)
    : tipos.filter(row => !row.sociedad_id), [tipos, empresa?.multisociedad_habilitado, sociedadIdEscritura]);
  const plantilla = plantillas.find(row => row.id === form.plantilla_documento_id) || null;
  const cuenta = cuentasLocales.find(row => row.id === form.cuenta_id) || null;
  const oportunidad = oportunidades.find(row => row.id === form.oportunidad_id) || null;
  const contacto = contactos.find(row => row.id === form.contacto_id) || null;
  const editable = Boolean(cotizacion && cotizacion.estado === 'borrador');
  const readonly = Boolean(cotizacion && cotizacion.estado !== 'borrador');
  const plantillaVistaPrevia = readonly ? contenidoEmitido?.plantilla || null : plantilla;
  const bloquesVistaPrevia = readonly ? contenidoEmitido?.bloques || [] : bloques;
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
  const hojaCosteoReferencia = useMemo(() => hojasCosteo.find(hoja => hoja.id === form.hoja_costeo_id) || null, [hojasCosteo, form.hoja_costeo_id]);
  const activoVinculadoId = cotizacion?.activo_id || activoInicialId || null;
  const recepcionVinculadaId = cotizacion?.recepcion_id || recepcionInicialId || null;
  const [origenEtiquetas, setOrigenEtiquetas] = useState(() => ({
    recepcionNumero: recepcionNumeroInicial || '',
    activoCodigo: activoCodigoInicial || '',
    activoNombre: activoNombreInicial || '',
  }));

  useEffect(() => {
    let activa = true;
    setOrigenEtiquetas({
      recepcionNumero: recepcionNumeroInicial || '',
      activoCodigo: activoCodigoInicial || '',
      activoNombre: activoNombreInicial || '',
    });
    if (!isSupabaseConfigured() || !empresa?.id || (!recepcionVinculadaId && !activoVinculadoId)) {
      return () => { activa = false; };
    }
    const cargarEtiquetasOrigen = async () => {
      try {
        const sb = await getSupabaseClient();
        const [recepcionResult, activoResult] = await Promise.all([
          recepcionVinculadaId && !recepcionNumeroInicial
            ? sb.from('recepciones_activos_cliente').select('numero,activo_id').eq('empresa_id', empresa.id).eq('id', recepcionVinculadaId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          activoVinculadoId && (!activoCodigoInicial || !activoNombreInicial)
            ? sb.from('activos').select('codigo,nombre').eq('empresa_id', empresa.id).eq('id', activoVinculadoId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);
        if (recepcionResult.error) throw recepcionResult.error;
        if (activoResult.error) throw activoResult.error;
        if (!activa) return;
        setOrigenEtiquetas({
          recepcionNumero: recepcionNumeroInicial || recepcionResult.data?.numero || '',
          activoCodigo: activoCodigoInicial || activoResult.data?.codigo || '',
          activoNombre: activoNombreInicial || activoResult.data?.nombre || '',
        });
      } catch (err) {
        if (activa) {
          setOrigenEtiquetas(actual => ({
            ...actual,
            recepcionNumero: actual.recepcionNumero || 'No disponible',
            activoCodigo: actual.activoCodigo || 'No disponible',
          }));
          console.error('[CotizacionEspecialWizard] No se pudieron resolver las etiquetas del origen:', err);
        }
      }
    };
    cargarEtiquetasOrigen();
    return () => { activa = false; };
  }, [empresa?.id, recepcionVinculadaId, activoVinculadoId, recepcionNumeroInicial, activoCodigoInicial, activoNombreInicial]);

  useEffect(() => {
    let activa = true;
    if (cotizacion?.estado !== 'aceptada') {
      setOsVinculada(null);
      setOsVinculadaCargando(false);
      setOsVinculadaError('');
      return () => { activa = false; };
    }
    const cargarOSVinculada = async () => {
      setOsVinculadaCargando(true);
      try {
        const sb = await getSupabaseClient();
        const { data, error: queryError } = await sb
          .from('os_clientes')
          .select('id,numero')
          .eq('cotizacion_especial_id', cotizacion.id)
          .maybeSingle();
        if (queryError) throw queryError;
        if (activa) {
          setOsVinculada(data || null);
          setOsVinculadaCargando(false);
          setOsVinculadaError('');
        }
      } catch (err) {
        if (activa) {
          setOsVinculada(null);
          setOsVinculadaCargando(false);
          setOsVinculadaError(mensajeError(err));
        }
      }
    };
    cargarOSVinculada();
    return () => { activa = false; };
  }, [cotizacion?.id, cotizacion?.estado]);
  const origenBloqueado = recepcionVinculadaId ? <div className="alert alert-info mt-4">
    Origen bloqueado: recepción <strong>{origenEtiquetas.recepcionNumero || 'Cargando…'}</strong> · activo <strong>{origenEtiquetas.activoCodigo || 'Cargando…'}</strong>{origenEtiquetas.activoNombre ? ` · ${origenEtiquetas.activoNombre}` : ''}. Estos vínculos se conservarán al guardar.
  </div> : null;
  const contexto = useMemo(() => {
    if (readonly && cotizacion?.contexto_emitido_json) {
      return {
        ...cotizacion.contexto_emitido_json,
        hoja_costeo:cotizacion.contexto_emitido_json.hoja_costeo || hojaCosteoReferencia || {},
      };
    }
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
      hoja_costeo:hojaCosteoReferencia || {},
      cotizacion:{ id:cotizacion?.id || '', numero:cotizacion?.numero || 'Borrador', fecha:cotizacion?.emitida_at?.slice(0, 10) || today(), moneda:form.moneda, items:readonly ? (cotizacion?.items || []) : serializarItems(form.items), subtotal:totals.subtotal, igv_pct:18, igv:totals.igv, total:totals.total, validez_tipo:form.validez_tipo, validez_dias:form.validez_dias, validez_fecha:form.validez_fecha || null, hitos_activos:form.hitos_activos, hitos_pago:hitosPreview },
      emision:cotizacion?.emitida_at ? { fecha:cotizacion.emitida_at.slice(0, 10), emitida_at:cotizacion.emitida_at, emitida_by:cotizacion.emitida_by } : {},
    };
  }, [readonly, cotizacion, empresa, empresaConfig, cuenta, contacto, oportunidad, form, totals, hitosPreview, hojaCosteoReferencia]);

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
      tipo_documento_id:data.tipo_documento_id, plantilla_documento_id:data.plantilla_documento_id, origen_items:data.origen_items, hoja_costeo_id:data.hoja_costeo_id || '', cuenta_id:data.cuenta_id, oportunidad_id:data.oportunidad_id || '', linea_negocio:data.linea_negocio || '', moneda:data.moneda || 'PEN',
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
    if (especialId || (!plantillaInicialId && !tipoDocumentoInicialId && !cuentaInicialId && !oportunidadInicialId && !proyectoInicialId && !itemsIniciales.length)) return;
    setForm(current => ({
      ...current,
      origen_items: itemsIniciales.length ? 'manual' : current.origen_items,
      tipo_documento_id: tipoDocumentoInicialId || current.tipo_documento_id,
      plantilla_documento_id: plantillaInicialId || current.plantilla_documento_id,
      cuenta_id: cuentaInicialId || current.cuenta_id,
      oportunidad_id: oportunidadInicialId || current.oportunidad_id,
      linea_negocio: lineaNegocioInicial || current.linea_negocio,
      moneda: monedaInicial || current.moneda,
      items: itemsIniciales.length ? conClavesItems(itemsIniciales) : current.items,
    }));
  }, [especialId, plantillaInicialId, tipoDocumentoInicialId, cuentaInicialId, oportunidadInicialId, proyectoInicialId, itemsIniciales, monedaInicial, lineaNegocioInicial]);
  useEffect(() => {
    if (especialId || !hojaCosteoInicialId) return;
    const hoja = hojasCosteo.find(row => row.id === hojaCosteoInicialId);
    if (!hoja) return;
    const oportunidadHC = oportunidades.find(row => row.id === hoja.oportunidad_id);
    const cuentaId = hoja.cuenta_id || oportunidadHC?.cuenta_id || '';
    const itemsHoja = conClavesItems(adaptarHojaCosteo?.(hoja) || []);
    setForm(current => {
      if (current.hoja_costeo_id === hoja.id && current.origen_items === 'hoja_costeo' && mismosItemsOrigen(current.items, itemsHoja)) return current;
      return {
        ...current,
        origen_items:'hoja_costeo',
        hoja_costeo_id:hoja.id,
        cuenta_id:cuentaId,
        oportunidad_id:hoja.oportunidad_id || '',
        linea_negocio:hoja.linea_negocio || lineaNegocioInicial || current.linea_negocio,
        moneda:hoja.moneda || current.moneda,
        items:itemsHoja,
        contacto_id:'',
      };
    });
  }, [especialId, hojaCosteoInicialId, lineaNegocioInicial, hojasCosteo, oportunidades, adaptarHojaCosteo]);
  useEffect(() => {
    if (!readonly) {
      setContenidoEmitido(null);
      return;
    }
    if (!cotizacion?.documento_generado_id) {
      setContenidoEmitido(null);
      setPlantillaLoading(false);
      setPlantillaError('No se encontró el snapshot del documento emitido.');
      return;
    }
    let active = true;
    setContenidoEmitido(null);
    setPlantillaLoading(true);
    setPlantillaError('');
    (async () => {
      try {
        const sb = await getSupabaseClient();
        const { data, error: queryError } = await sb
          .from('documentos_generados')
          .select('contenido_resuelto_json')
          .eq('id', cotizacion.documento_generado_id)
          .single();
        if (queryError) throw queryError;
        const contenido = data?.contenido_resuelto_json;
        if (!contenido?.plantilla || !Array.isArray(contenido.bloques)) {
          throw new Error('El snapshot del documento emitido no tiene una estructura válida.');
        }
        if (active) setContenidoEmitido(contenido);
      } catch (err) {
        if (active) {
          setPlantillaError(mensajeError(err));
          setContenidoEmitido(null);
        }
      } finally { if (active) setPlantillaLoading(false); }
    })();
    return () => { active = false; };
  }, [readonly, cotizacion?.documento_generado_id]);
  useEffect(() => {
    if (readonly) {
      setPlantillas([]);
      return;
    }
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
  }, [especialId, form.tipo_documento_id, form.plantilla_documento_id, readonly]);
  useEffect(() => {
    if (readonly) {
      setBloques([]);
      return;
    }
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
  }, [form.plantilla_documento_id, readonly]);

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
    setForm(current => ({ ...current, origen_items:'hoja_costeo', hoja_costeo_id:hojaCosteoId, cuenta_id:cuentaId, oportunidad_id:hoja?.oportunidad_id || '', linea_negocio:hoja?.linea_negocio || current.linea_negocio, moneda:hoja?.moneda || current.moneda, items:hoja ? conClavesItems(adaptarHojaCosteo?.(hoja) || []) : [] }));
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
    if (recepcionVinculadaId && !activoVinculadoId) return setError('No se pudo cargar el activo de la recepción de origen. Espera un momento e inténtalo nuevamente.');
    setSaving(true); setError('');
    try {
      const sb = await getSupabaseClient();
      const { data, error: rpcError } = await sb.rpc('crear_cotizacion_especial', {
        p_tipo_documento_id:form.tipo_documento_id, p_plantilla_documento_id:form.plantilla_documento_id, p_cuenta_id:form.cuenta_id, p_oportunidad_id:form.oportunidad_id || null,
        p_origen_items:form.origen_items, p_hoja_costeo_id:form.origen_items === 'hoja_costeo' ? form.hoja_costeo_id : null, p_moneda:form.moneda,
        p_items:form.origen_items === 'manual' ? serializarItems(form.items) : null, p_contacto_id:form.contacto_id || null, p_validez_tipo:form.validez_tipo,
        p_validez_dias:form.validez_tipo === 'dias' ? Number(form.validez_dias) : null, p_validez_fecha:form.validez_tipo === 'fecha_exacta' ? form.validez_fecha : null,
        p_hitos_activos:form.hitos_activos, p_hitos_pago:form.hitos_activos ? form.hitos_pago.map(({ concepto, porcentaje, condicion }) => ({ concepto, porcentaje:numero(porcentaje), condicion })) : [],
        p_activo_id:activoVinculadoId, p_recepcion_id:recepcionVinculadaId,
      });
      if (rpcError) throw rpcError;
      const created = Array.isArray(data) ? data[0] : data;
      if (!created?.id) throw new Error('El servidor no devolvió el identificador del borrador creado.');
      if (form.linea_negocio) {
        const { error: lineaError } = await sb
          .from('cotizaciones_especiales')
          .update({ linea_negocio: form.linea_negocio, proyecto_id:proyectoInicialId || null, contrato_alquiler_id:contratoAlquilerInicialId || null })
          .eq('id', created.id);
        if (lineaError) throw lineaError;
      }
      if (recepcionVinculadaId) await marcarRecepcionActivoClienteCotizada(empresa?.id, recepcionVinculadaId);
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

  const enviar = async () => {
    setSending(true); setError('');
    try {
      const sb = await getSupabaseClient();
      const { error: rpcError } = await sb.rpc('enviar_cotizacion_especial', { p_id:cotizacion.id });
      if (rpcError) throw rpcError;
      await cargarCotizacion(cotizacion.id);
    } catch (err) { setError(mensajeError(err)); }
    finally { setSending(false); }
  };

  const registrarAceptacionManual = async datos => {
    const sb = await getSupabaseClient();
    const { error: rpcError } = await sb.rpc('registrar_aceptacion_manual_cotizacion_especial', {
      p_id:cotizacion.id,
      p_nombre:datos.nombre,
      p_dni:datos.dni || null,
      p_fecha:datos.fecha,
      p_canal:datos.canal,
      p_notas:datos.notas || null,
    });
    if (rpcError) throw rpcError;
    await cargarCotizacion(cotizacion.id);
    setAceptacionManualAbierta(false);
  };

  const descargarPDF = async () => {
    if (!['emitido', 'enviada', 'aceptada'].includes(cotizacion?.estado)) return;
    const contenedor = vistaPreviaRef.current;
    const paginas = contenedor
      ? [...contenedor.querySelectorAll('.document-preview-pages > .document-preview-sheet-frame > article.document-preview-sheet')]
      : [];
    if (!paginas.length) {
      setError('La vista previa aún no está lista para generar el PDF. Inténtelo nuevamente en unos segundos.');
      return;
    }
    setGenerandoPDF(true); setError('');
    try {
      await esperarRecursosVistaPrevia(paginas);
      const [{ default:html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const documento = new jsPDF({
        orientation:'portrait',
        unit:'px',
        format:'letter',
        hotfixes:['px_scaling'],
        compress:true,
      });
      for (const [index, pagina] of paginas.entries()) {
        const captura = await html2canvas(pagina, {
          backgroundColor:'#ffffff',
          scale:2,
          useCORS:true,
          allowTaint:false,
          logging:false,
          imageTimeout:15000,
        });
        if (index > 0) documento.addPage('letter', 'portrait');
        documento.addImage(captura.toDataURL('image/png'), 'PNG', 0, 0, 816, 1056, undefined, 'FAST');
      }
      documento.save(nombreArchivoCotizacion(cotizacion.numero));
    } catch (err) {
      const detalle = err?.name === 'SecurityError'
        ? 'No se pudo capturar una imagen por una restricción CORS. Revise el recurso de la plantilla e inténtelo nuevamente.'
        : mensajeError(err);
      setError(`No se pudo generar el PDF: ${detalle}`);
    } finally {
      setGenerandoPDF(false);
    }
  };

  if (loading) return <div className="p-4 text-muted">Cargando Cotización Especial…</div>;
  if (!isSupabaseConfigured()) return <div className="p-4"><div className="alert alert-danger">Supabase no está configurado.</div></div>;

  const selectorDatos = <>
    <div className="grid-2"><div className="input-group"><label>Contacto (opcional)</label><select className="input" value={form.contacto_id} disabled={readonly || !form.cuenta_id} onChange={event => setForm(current => ({ ...current, contacto_id:event.target.value }))}><option value="">Sin contacto</option>{contactosCuenta.map(row => <option key={row.id} value={row.id}>{row.nombre || row.email || row.id}</option>)}</select></div>
      <div className="input-group"><label>Tipo de validez</label><select className="input" value={form.validez_tipo} disabled={readonly} onChange={event => setForm(current => ({ ...current, validez_tipo:event.target.value }))}><option value="dias">Por días</option><option value="fecha_exacta">Fecha exacta</option></select></div></div>
    <div className="input-group" style={{marginTop:10}}>{form.validez_tipo === 'dias' ? <><label>Días de validez</label><input className="input" type="number" min="1" value={form.validez_dias ?? ''} disabled={readonly} onChange={event => setForm(current => ({ ...current, validez_dias:event.target.value }))} /></> : <><label>Válida hasta</label><input className="input" type="date" value={form.validez_fecha || ''} disabled={readonly} onChange={event => setForm(current => ({ ...current, validez_fecha:event.target.value }))} /></>}</div>
  </>;

  const PASOS_WIZARD = ['Plantilla', 'Ítems y cliente', 'Contacto y validez', 'Hitos de pago', 'Revisión'];
  const MESES_ESP = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const fechaEsp = valor => {
    const fecha = valor ? new Date(valor) : null;
    if (!fecha || Number.isNaN(fecha.getTime())) return null;
    return `${String(fecha.getDate()).padStart(2, '0')} ${MESES_ESP[fecha.getMonth()]} ${fecha.getFullYear()}`;
  };
  const fechaHoraEsp = valor => {
    const fecha = valor ? new Date(valor) : null;
    if (!fecha || Number.isNaN(fecha.getTime())) return null;
    return `${fechaEsp(valor)} · ${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`;
  };
  const cuentaNombre = cuenta?.razon_social || cuenta?.nombre_comercial || '';
  const plantillaEtiqueta = plantilla ? `${plantilla.nombre_interno || 'Plantilla'} · v${plantilla.version}` : '';
  const panelTotales = (estimado = true) => (
    <section className="dx-cotesp-card">
      <div className="dx-cotesp-card-h"><h2>Totales</h2><span>{form.moneda} · {estimado ? 'estimado' : 'emitidos'}</span></div>
      <div className="dx-cotesp-card-b">
        <div className="dx-cotesp-tot"><span>Subtotal sin IGV</span><b>{formatMoney(totals.subtotal, form.moneda)}</b></div>
        <div className="dx-cotesp-tot"><span>IGV (18%)</span><b>{formatMoney(totals.igv, form.moneda)}</b></div>
        <div className="dx-cotesp-tot is-big"><span>Total</span><b>{formatMoney(totals.total, form.moneda)}</b></div>
        <p className="dx-cotesp-muted">{estimado ? 'Previsualización estimada. El servidor calcula y valida el importe definitivo al guardar.' : 'Valores guardados al emitir; no se recalculan.'}</p>
      </div>
    </section>
  );
  const notaOrigen = origenBloqueado ? <div className="dx-cotesp-note is-info">{origenBloqueado.props.children}</div> : null;

  if (cotizacion) {
    const ESTADOS_ESP = { borrador:['Borrador', 'is-amber'], emitido:['Emitida', 'is-blue'], enviada:['Enviada', 'is-blue'], aceptada:['Aceptada', 'is-green'], anulado:['Anulada', 'is-red'] };
    const [estadoLabel, estadoClase] = ESTADOS_ESP[cotizacion.estado] || [cotizacion.estado, 'is-gray'];
    const emitida = ['emitido', 'enviada', 'aceptada'].includes(cotizacion.estado);
    const enviadaEsp = ['enviada', 'aceptada'].includes(cotizacion.estado);
    const aceptadaEsp = cotizacion.estado === 'aceptada';
    const pasosCicloEsp = [
      { titulo:'Borrador', hecho:true, detalle:fechaEsp(cotizacion.created_at) },
      { titulo: emitida ? 'Emitida' : 'Emitir', hecho:emitida, detalle: emitida ? fechaHoraEsp(cotizacion.emitida_at) : 'Congela el documento' },
      { titulo: enviadaEsp ? 'Enviada' : 'Enviar al cliente', hecho:enviadaEsp, detalle: enviadaEsp ? fechaHoraEsp(cotizacion.enviada_at) : 'QR o enlace de aceptación' },
      { titulo:'Aceptación del cliente', hecho:aceptadaEsp, detalle: aceptadaEsp ? [fechaEsp(cotizacion.aceptacion_fecha), cotizacion.aceptacion_nombre, cotizacion.aceptacion_tipo === 'digital' ? 'digital' : 'manual'].filter(Boolean).join(' · ') : 'QR o registro manual' },
      { titulo:'Orden de servicio', hecho:Boolean(osVinculada), detalle: osVinculada ? (osVinculada.numero || osVinculada.id) : 'Al aceptar' },
    ];
    const pasoActualEsp = pasosCicloEsp.findIndex(paso => !paso.hecho);
    let accionPrincipal = null;
    if (editable) accionPrincipal = <button type="button" className="dx-cotesp-btn is-primary" disabled={emitting} onClick={emitir}>{I.check}{emitting ? 'Emitiendo…' : 'Emitir'}</button>;
    else if (cotizacion.estado === 'emitido') accionPrincipal = <button type="button" className="dx-cotesp-btn is-primary" disabled={sending} onClick={enviar}>{I.send}{sending ? 'Enviando…' : 'Enviar a cliente'}</button>;
    else if (cotizacion.estado === 'enviada') accionPrincipal = <button type="button" className="dx-cotesp-btn is-primary" onClick={() => setAceptacionManualAbierta(true)}>{I.check}Registrar aceptación manual</button>;
    else if (aceptadaEsp && osVinculadaCargando) accionPrincipal = <button type="button" className="dx-cotesp-btn" disabled>Verificando OS…</button>;
    else if (aceptadaEsp && !osVinculada) accionPrincipal = <button type="button" className="dx-cotesp-btn is-primary" onClick={() => onGenerarOS?.(cotizacion)}>{I.clipboard}Generar OS</button>;
    else if (aceptadaEsp && osVinculada) accionPrincipal = <button type="button" className="dx-cotesp-btn is-primary" onClick={() => onVerOS?.(osVinculada.id)}>{I.clipboard}Ver {osVinculada.numero || 'OS'}</button>;

    return <div className="dx-cotesp">
      <div className="dx-cotesp-in">
        <button type="button" className="dx-cotesp-back" onClick={onBack}>{I.chevLeft}Cotizaciones</button>
        <header className="dx-cotesp-top">
          <div className="dx-cotesp-head">
            <div className="dx-cotesp-eyebrow">Comercial · Cotización especial</div>
            <h1 className="dx-cotesp-title">{cotizacion.numero}<span className="dx-cotesp-pill is-violet">Especial</span><span className={`dx-cotesp-pill ${estadoClase}`}><i />{estadoLabel}</span></h1>
            <p className="dx-cotesp-sub">{cuentaNombre && <strong>{cuentaNombre}</strong>}{cuenta?.ruc && <> · RUC {cuenta.ruc}</>}{oportunidad?.nombre && <> · {oportunidad.nombre}</>}{plantillaVistaPrevia && <> · Plantilla {plantillaVistaPrevia.nombre_interno || ''}{plantillaVistaPrevia.version ? ` v${plantillaVistaPrevia.version}` : ''}</>}</p>
          </div>
          <div className="dx-cotesp-acts">
            {accionPrincipal}
            {emitida && <button type="button" className="dx-cotesp-btn" disabled={generandoPDF || !plantillaVistaPrevia} onClick={descargarPDF} aria-busy={generandoPDF}>{I.download}{generandoPDF ? 'Generando PDF…' : 'PDF'}</button>}
          </div>
        </header>

        <section className="dx-cotesp-card dx-cotesp-flow" aria-label="Ciclo de la cotización">
          {pasosCicloEsp.map((paso, index) => (
            <div key={paso.titulo} className={`dx-cotesp-step ${paso.hecho ? 'is-done' : index === pasoActualEsp ? 'is-now' : 'is-todo'}`}>
              <span className="dx-cotesp-dot">{paso.hecho ? I.check : index + 1}</span>
              <b>{paso.titulo}</b>
              <span className="dx-cotesp-cap">{paso.detalle || '—'}</span>
            </div>
          ))}
        </section>

        {notaOrigen}
        {error && <div className="dx-cotesp-note is-error" role="alert">{error}</div>}
        {osVinculadaError && <div className="dx-cotesp-note is-warn">No se pudo verificar la OS vinculada: {osVinculadaError}</div>}
        {plantillaNuevaDisponible && <div className="dx-cotesp-note is-warn dx-cotesp-note-row"><span>Hay una versión más reciente de esta plantilla (v{plantillaNuevaDisponible.version}).</span><button type="button" className="dx-cotesp-btn is-sm" disabled={actualizandoPlantilla} onClick={actualizarPlantilla}>{actualizandoPlantilla ? 'Actualizando…' : 'Actualizar a la versión más reciente'}</button></div>}
        {readonly && <div className="dx-cotesp-note is-info">Documento emitido: los datos y el documento mostrado son el snapshot guardado al emitir.</div>}

        <div className="dx-cotesp-doc cotizacion-especial-preview-layout" style={{'--cotizacion-preview-height': alturaResumenCotizacion ? `${alturaResumenCotizacion}px` : undefined}}>
          <div ref={resumenCotizacionRef} className="dx-cotesp-col">
            <ReferenciaHojaCosteo hoja={hojaCosteoReferencia} moneda={form.moneda} />
            <section className="dx-cotesp-card">
              <div className="dx-cotesp-card-h"><h2>Ítems</h2>{editable && form.origen_items === 'manual' ? <button type="button" className="dx-cotesp-btn is-sm" disabled={saving} onClick={guardarItems}>{saving ? 'Guardando…' : 'Guardar ítems'}</button> : <span>{form.items.length} {form.items.length === 1 ? 'ítem' : 'ítems'}</span>}</div>
              <div className="dx-cotesp-card-b">
                {form.origen_items === 'hoja_costeo' && <div className="dx-cotesp-note is-info">Ítems vinculados a Hoja de Costeo aprobada; no son editables manualmente.</div>}
                <ItemsEditor items={form.items} unidades={unidades} moneda={form.moneda} disabled={readonly || form.origen_items !== 'manual'} mostrarTotales={false} onChange={items => setForm(current => ({ ...current, items }))} />
              </div>
            </section>
            {panelTotales(!readonly)}
            <section className="dx-cotesp-card">
              <div className="dx-cotesp-card-h"><h2>Contacto, validez y hitos</h2>{editable && <button type="button" className="dx-cotesp-btn is-sm" disabled={saving} onClick={guardarDatos}>{saving ? 'Guardando…' : 'Guardar datos'}</button>}</div>
              <div className="dx-cotesp-card-b">
                {selectorDatos}
                <div className="dx-cotesp-sep" />
                <HitosEditor hitos={form.hitos_pago} activos={form.hitos_activos} total={totals.total} moneda={form.moneda} disabled={readonly} onActivosChange={hitos_activos => setForm(current => ({ ...current, hitos_activos, hitos_pago:hitos_activos && !current.hitos_pago.length ? [nuevoHito()] : current.hitos_pago }))} onChange={hitos_pago => setForm(current => ({ ...current, hitos_pago }))} />
              </div>
            </section>
            {cotizacion.estado === 'enviada' && cotizacion.token_aceptacion && <AceptacionEspecialQR token={cotizacion.token_aceptacion} />}
            {aceptadaEsp && (
              <section className="dx-cotesp-card">
                <div className="dx-cotesp-card-h"><h2>Aceptación registrada</h2><span className="dx-cotesp-pill is-green"><i />{cotizacion.aceptacion_tipo === 'digital' ? 'Digital' : 'Manual'}</span></div>
                <div className="dx-cotesp-card-b">
                  <div className="dx-cotesp-kv"><span>Aceptado por</span><b>{cotizacion.aceptacion_nombre || '—'}</b></div>
                  <div className="dx-cotesp-kv"><span>Fecha</span><b>{fechaEsp(cotizacion.aceptacion_fecha) || '—'}</b></div>
                  {cotizacion.aceptacion_canal && <div className="dx-cotesp-kv"><span>Canal</span><b>{cotizacion.aceptacion_canal}</b></div>}
                </div>
              </section>
            )}
          </div>
          <section className="dx-cotesp-card cotizacion-especial-preview-card">
            <div className="dx-cotesp-card-h"><h2>Vista previa del documento</h2><span>Valores {readonly ? 'emitidos' : 'actuales'}</span></div>
            <div className="dx-cotesp-card-b cotizacion-especial-preview-body">{plantillaVistaPrevia ? <div ref={vistaPreviaRef} className="cotizacion-especial-preview-content"><DocumentPreviewSheet plantilla={plantillaVistaPrevia} bloques={bloquesVistaPrevia} categoria="cotizacion" contexto={contexto} /></div> : plantillaError ? <div className="dx-cotesp-note is-error">{plantillaError}</div> : plantillaLoading ? <div className="dx-cotesp-muted">Cargando {readonly ? 'documento emitido' : 'plantilla'}…</div> : <div className="dx-cotesp-note is-error">No se pudo cargar {readonly ? 'el documento emitido' : 'la plantilla de esta cotización'}.</div>}</div>
          </section>
        </div>
      </div>
      {aceptacionManualAbierta && <AceptacionManualEspecialModal onClose={() => setAceptacionManualAbierta(false)} onConfirmar={registrarAceptacionManual} />}
    </div>;
  }

  const irAPaso = destino => { if (destino < paso) { setError(''); setPaso(destino); } };
  const plantillaResuelta = Boolean(plantilla && form.tipo_documento_id && !cambiandoPlantilla);

  return <div className="dx-cotesp">
    <NuevaCuentaModal open={nuevaCuentaAbierta} empresa={empresa} crearCuenta={crearCuenta} comercialesAsignables={comercialesAsignables} zIndex={1200} onClose={() => setNuevaCuentaAbierta(false)} onCreated={cuenta => { setCuentasLocales(actuales => [cuenta, ...actuales.filter(item => item.id !== cuenta.id)]); setForm(current => ({ ...current, cuenta_id:cuenta.id, contacto_id:'' })); }} />
    <div className="dx-cotesp-in">
      <button type="button" className="dx-cotesp-back" onClick={onBack}>{I.chevLeft}Cotizaciones</button>
      <div className="dx-cotesp-eyebrow">Comercial · Nueva cotización especial</div>
      <h1 className="dx-cotesp-title">Nueva Cotización Especial</h1>
      <p className="dx-cotesp-sub dx-cotesp-sub-paso">Paso {paso} de 5 · {PASOS_WIZARD[paso - 1]}</p>

      <nav className="dx-cotesp-card dx-cotesp-stepper" aria-label="Pasos de la cotización">
        {PASOS_WIZARD.map((titulo, index) => {
          const numeroPaso = index + 1;
          const estado = numeroPaso < paso ? 'is-done' : numeroPaso === paso ? 'is-now' : 'is-todo';
          return (
            <button type="button" key={titulo} className={`dx-cotesp-st ${estado}`} onClick={() => irAPaso(numeroPaso)} disabled={numeroPaso >= paso} aria-current={numeroPaso === paso ? 'step' : undefined} aria-label={`Paso ${numeroPaso}: ${titulo}`}>
              <span className="dx-cotesp-st-d">{numeroPaso < paso ? I.check : numeroPaso}</span>
              <span className="dx-cotesp-st-t"><b>{titulo}</b><small>{numeroPaso < paso ? 'Completo' : numeroPaso === paso ? 'En curso' : 'Pendiente'}</small></span>
            </button>
          );
        })}
      </nav>

      {error && <div className="dx-cotesp-note is-error" role="alert">{error}</div>}
      {notaOrigen}

      <div className="dx-cotesp-grid">
        <div className="dx-cotesp-col">
          {paso === 1 && (
            <section className="dx-cotesp-card">
              <div className="dx-cotesp-card-h"><h2>Plantilla del documento</h2></div>
              <div className="dx-cotesp-card-b">
                {plantillaResuelta
                  ? <div className="dx-cotesp-resolved">
                      <span className="dx-cotesp-resolved-ic">{I.file}</span>
                      <span className="dx-cotesp-resolved-t"><b>{plantillaEtiqueta}</b><small>Tipo: {tipo?.nombre || '—'}{plantillaInicialId && form.plantilla_documento_id === plantillaInicialId ? ' · elegida en "Nueva cotización"' : ''}</small></span>
                      <button type="button" className="dx-cotesp-btn is-sm" onClick={() => setCambiandoPlantilla(true)}>Cambiar</button>
                    </div>
                  : <div className="grid-2">
                      <div className="input-group"><label>Tipo de documento</label><select className="input" value={form.tipo_documento_id} onChange={event => cambiarTipo(event.target.value)}><option value="">Seleccione…</option>{tiposVisibles.map(row => <option key={row.id} value={row.id}>{row.nombre}</option>)}</select></div>
                      <div className="input-group"><label>Plantilla publicada</label><select className="input" value={form.plantilla_documento_id} disabled={!form.tipo_documento_id} onChange={event => { setForm(current => ({ ...current, plantilla_documento_id:event.target.value })); setCambiandoPlantilla(false); }}><option value="">Seleccione…</option>{plantillas.map(row => <option key={row.id} value={row.id}>v{row.version} — {row.nombre_interno}</option>)}</select></div>
                    </div>}
                <p className="dx-cotesp-muted">La plantilla define los bloques y el formato del documento que recibirá el cliente.</p>
              </div>
            </section>
          )}

          {paso === 2 && (
            <>
              <section className="dx-cotesp-card">
                <div className="dx-cotesp-card-h"><h2>Cliente</h2></div>
                <div className="dx-cotesp-card-b">
                  <div className="grid-2">
                    <div className="input-group"><label>Cuenta</label><select className="input" value={form.cuenta_id} disabled={form.origen_items === 'hoja_costeo'} onChange={event => { if (event.target.value === '__crear_nueva__') { setNuevaCuentaAbierta(true); return; } setForm(current => ({ ...current, cuenta_id:event.target.value, contacto_id:'' })); }}><option value="">Seleccione…</option>{cuentasLocales.filter(row => row.empresa_id === empresa?.id).map(row => <option key={row.id} value={row.id}>{row.razon_social || row.nombre_comercial}</option>)}<option value="__crear_nueva__">+ Crear nueva cuenta</option></select></div>
                    <div className="input-group"><label>Oportunidad (opcional)</label><select className="input" value={form.oportunidad_id} disabled={form.origen_items === 'hoja_costeo'} onChange={event => setForm(current => ({ ...current, oportunidad_id:event.target.value }))}><option value="">Sin oportunidad</option>{oportunidades.filter(row => row.empresa_id === empresa?.id && (!form.cuenta_id || row.cuenta_id === form.cuenta_id)).map(row => <option key={row.id} value={row.id}>{row.nombre}</option>)}</select></div>
                    <div className="input-group"><label>Moneda</label><select className="input" value={form.moneda} onChange={event => setForm(current => ({ ...current, moneda:event.target.value }))}>{opcionesMonedaEsp.map(opcion => <option key={opcion.codigo} value={opcion.codigo}>{opcion.codigo}{opcion.nombre ? ` — ${opcion.nombre}` : ''}</option>)}</select></div>
                  </div>
                </div>
              </section>
              <section className="dx-cotesp-card">
                <div className="dx-cotesp-card-h"><h2>Ítems</h2><span>{form.items.length} {form.items.length === 1 ? 'ítem' : 'ítems'}</span></div>
                <div className="dx-cotesp-card-b">
                  <div className="dx-cotesp-seg" role="group" aria-label="Origen de los ítems">
                    <button type="button" className={form.origen_items === 'manual' ? 'is-on' : ''} aria-pressed={form.origen_items === 'manual'} onClick={() => setForm(current => ({ ...current, origen_items:'manual', hoja_costeo_id:'' }))}>Manual</button>
                    <button type="button" className={form.origen_items === 'hoja_costeo' ? 'is-on' : ''} aria-pressed={form.origen_items === 'hoja_costeo'} onClick={() => setForm(current => ({ ...current, origen_items:'hoja_costeo', items:[] }))}>Desde Hoja de Costeo</button>
                  </div>
                  {form.origen_items === 'hoja_costeo' && <div className="input-group"><label>Hoja de Costeo aprobada</label><select className="input" value={form.hoja_costeo_id} onChange={event => seleccionarHC(event.target.value)}><option value="">Seleccione…</option>{hojasDisponibles.map(row => <option key={row.id} value={row.id}>{row.numero || row.id}</option>)}</select></div>}
                  <ItemsEditor items={form.items} unidades={unidades} moneda={form.moneda} disabled={form.origen_items === 'hoja_costeo'} mostrarTotales={false} onChange={items => setForm(current => ({ ...current, items }))} />
                </div>
              </section>
            </>
          )}

          {paso === 3 && (
            <section className="dx-cotesp-card">
              <div className="dx-cotesp-card-h"><h2>Contacto y validez</h2></div>
              <div className="dx-cotesp-card-b">{selectorDatos}</div>
            </section>
          )}

          {paso === 4 && (
            <section className="dx-cotesp-card">
              <div className="dx-cotesp-card-h"><h2>Hitos de pago</h2></div>
              <div className="dx-cotesp-card-b">
                <HitosEditor hitos={form.hitos_pago} activos={form.hitos_activos} total={totals.total} moneda={form.moneda} onActivosChange={hitos_activos => setForm(current => ({ ...current, hitos_activos, hitos_pago:hitos_activos && !current.hitos_pago.length ? [nuevoHito()] : current.hitos_pago }))} onChange={hitos_pago => setForm(current => ({ ...current, hitos_pago }))} />
              </div>
            </section>
          )}

          {paso === 5 && (
            <>
              <section className="dx-cotesp-card">
                <div className="dx-cotesp-card-h"><h2>Revisión</h2></div>
                <div className="dx-cotesp-card-b">
                  <div className="dx-cotesp-kv"><span>Plantilla</span><b>{plantillaEtiqueta || '—'}</b></div>
                  <div className="dx-cotesp-kv"><span>Cliente</span><b>{cuentaNombre || '—'}</b></div>
                  <div className="dx-cotesp-kv"><span>Ítems</span><b>{form.items.length} · {formatMoney(totals.subtotal, form.moneda)} sin IGV</b></div>
                  <div className="dx-cotesp-kv"><span>Validez</span><b>{form.validez_tipo === 'dias' ? `${form.validez_dias || '—'} días` : (form.validez_fecha || '—')}</b></div>
                  <div className="dx-cotesp-kv"><span>Hitos</span><b>{form.hitos_activos ? `${form.hitos_pago.length} hitos` : 'Sin hitos'}</b></div>
                </div>
              </section>
              <section className="dx-cotesp-card">
                <div className="dx-cotesp-card-h"><h2>Vista previa del documento</h2><span>Valores actuales</span></div>
                <div className="dx-cotesp-card-b">{plantilla ? <DocumentPreviewSheet plantilla={plantilla} bloques={bloques} categoria="cotizacion" contexto={contexto} /> : <div className="dx-cotesp-muted">Seleccione una plantilla publicada para ver la composición.</div>}</div>
              </section>
            </>
          )}
        </div>

        <aside className="dx-cotesp-aside">
          {panelTotales(true)}
          <section className="dx-cotesp-card">
            <div className="dx-cotesp-card-h"><h2>Documento</h2></div>
            <div className="dx-cotesp-card-b">
              <div className="dx-cotesp-kv"><span>Plantilla</span><b>{plantillaEtiqueta || 'Sin elegir'}</b></div>
              <div className="dx-cotesp-kv"><span>Cliente</span><b>{cuentaNombre || 'Sin elegir'}</b></div>
              {form.linea_negocio && <div className="dx-cotesp-kv"><span>Línea</span><b>{LINEAS_NEGOCIO_ESP[form.linea_negocio] || String(form.linea_negocio).replace(/_/g, ' ')}</b></div>}
            </div>
          </section>
        </aside>
      </div>
    </div>

    <div className="dx-cotesp-savebar">
      <button type="button" className="dx-cotesp-btn" onClick={paso === 1 ? onBack : volver}>{I.chevLeft}{paso === 1 ? 'Cancelar' : 'Volver'}</button>
      {paso < 5
        ? <button type="button" className="dx-cotesp-btn is-primary" onClick={avanzar}>Continuar</button>
        : <button type="button" className="dx-cotesp-btn is-primary" disabled={saving} onClick={crear}>{saving ? 'Creando…' : 'Crear borrador'}</button>}
    </div>
  </div>;
}
