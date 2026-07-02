import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context.jsx';
import { I } from '../icons.jsx';
import { FileUpload } from './FileUpload.jsx';
import { finanzasService } from '../services/finanzasService.js';
import { cajaChicaService } from '../services/cajaChicaService.js';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';
import { getTipoCambioHoy, getTipoCambioPorFecha, convertirMonto } from '../services/tipoCambioService.js';
import { prepararVinculacionMovimientoCuenta } from '../services/tesoreriaService.js';

// ── Datos por defecto si el admin no configuró tipos ──────────────────────────
const TIPOS_GASTO_DEFECTO = [
  { id: 'def_1', nombre: 'Materiales e insumos',   categoria_er: 'Materiales',           icono: 'package'   },
  { id: 'def_2', nombre: 'Servicio de tercero',     categoria_er: 'Servicios terceros',   icono: 'wrench'    },
  { id: 'def_3', nombre: 'Gasto administrativo',   categoria_er: 'Administrativos',      icono: 'building'  },
  { id: 'def_4', nombre: 'Gasto de campo/OT',      categoria_er: 'Materiales',           icono: 'truck'     },
  { id: 'def_5', nombre: 'Servicio básico',         categoria_er: 'Administrativos',      icono: 'receipt'   },
  { id: 'def_6', nombre: 'Logística/transporte',   categoria_er: 'Logística',            icono: 'truck'     },
  { id: 'def_7', nombre: 'Activo Fijo',             categoria_er: 'Inversiones / Activos', icono: 'package', es_capitalizacion: true },
];

const ACTIVO_TIPOS_WIZ = [
  { value: 'equipo',      label: 'Equipo' },
  { value: 'vehiculo',    label: 'Vehículo' },
  { value: 'herramienta', label: 'Herramienta' },
  { value: 'inmueble',    label: 'Inmueble' },
  { value: 'intangible',  label: 'Intangible' },
  { value: 'otro',        label: 'Otro' },
];

const METODOS_PAGO = ['Transferencia bancaria', 'Caja chica', 'Tarjeta empresa', 'Efectivo', 'Otro'];
const TIPOS_COMP   = ['Factura', 'Boleta', 'Recibo honorarios', 'Ticket', 'Sin comprobante'];

const normTexto = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Coincide si cada palabra escrita es el inicio de alguna palabra del texto (nombre + categoría ER)
const matchIniciales = (texto, busqueda) => {
  const palabrasBusqueda = normTexto(busqueda).split(/\s+/).filter(Boolean);
  if (!palabrasBusqueda.length) return true;
  const palabrasTexto = normTexto(texto).split(/\s+/).filter(Boolean);
  return palabrasBusqueda.every(pb => palabrasTexto.some(pt => pt.startsWith(pb)));
};

const sv = (d) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const TIPO_GASTO_ICONOS = {
  // Operaciones y campo
  tools:     I.wrench,
  hammer:    sv(<><path d="M15 12l-8.5 8.5c-.83.83-2.17.83-3 0s-.83-2.17 0-3L12 9"/><path d="M13.5 7.5l3 3M20 4l-3 3"/></>),
  drill:     sv(<><path d="M5 8h6a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5V8z"/><path d="M3 8v8M13 10h2l4-3M13 14h2l4 3"/></>),
  helmet:    sv(<><path d="M12 3a9 9 0 0 1 9 9v2H3v-2a9 9 0 0 1 9-9z"/><path d="M3 14a9 9 0 0 0 18 0"/></>),
  bolt:      sv(<path d="M13 3L4 14h8l-1 7 9-11h-8z"/>),
  flame:     sv(<path d="M12 12c2-2.96 0-7-1-8-1 2-4.81 5.08-4 8 .57 2.1 2.27 3.62 5 4-2.5 0-4-1.57-4-3.37C8 9.91 12 6 12 6c0 0 4 3.91 4 6.63A4.35 4.35 0 0 1 12 17c2-1.5 2.5-4 0-5z"/>),
  droplet:   sv(<path d="M12 2C6.5 9.5 5 13 5 16a7 7 0 0 0 14 0c0-3-1.5-6.5-7-14z"/>),
  antenna:   sv(<><circle cx="12" cy="11" r="1" fill="currentColor"/><path d="M9.5 8.5a4 4 0 0 1 5 0M7 6a7 7 0 0 1 10 0M4.5 3.5a11 11 0 0 1 15 0M12 12v9"/></>),
  cpu:       sv(<><rect x="7" y="7" width="10" height="10" rx="1"/><path d="M9 7V4M12 7V4M15 7V4M9 20v-3M12 20v-3M15 20v-3M4 9h3M4 12h3M4 15h3M17 9h3M17 12h3M17 15h3"/></>),
  server:    sv(<><rect x="3" y="3" width="18" height="6" rx="1"/><rect x="3" y="13" width="18" height="6" rx="1"/><circle cx="7" cy="6" r=".5" fill="currentColor"/><circle cx="7" cy="16" r=".5" fill="currentColor"/></>),
  // Compras y materiales
  package:   I.package,
  box:       sv(<><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5M12 21V13M21 8l-9 5"/></>),
  cart:      I.cart,
  barcode:   sv(<path d="M3 5v14M7 5v14M11 5v14M13 5v14M17 5v14M21 5v14M3 5h2M3 19h2M11 5h2M11 19h2M17 5h4M17 19h4"/>),
  clipboard: I.clipboard,
  archive:   sv(<><rect x="2" y="4" width="20" height="4" rx="1"/><path d="M4 8v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></>),
  stack:     sv(<><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 12l10 5 10-5M2 17l10 5 10-5"/></>),
  // Servicios y personas
  users:     I.users,
  userCheck: I.userCheck,
  briefcase: sv(<><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M12 12v2M8 12h8"/></>),
  headset:   sv(<><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><path d="M5 15h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1zM17 15h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z"/></>),
  school:    sv(<><path d="M22 9L12 5 2 9l10 4 10-4z"/><path d="M6 11v5a6 6 0 0 0 12 0v-5"/><path d="M22 9v6"/></>),
  certificate: sv(<><circle cx="15" cy="15" r="4"/><path d="M13 22v-3.5l2 1.5 2-1.5V22"/><path d="M10 19H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v9"/><path d="M6 8h6M6 12h4"/></>),
  chartBar:  sv(<path d="M3 21h18M5 21V14h4v7M10 21V9h4v12M15 21V4h4v17"/>),
  // Finanzas y administración
  cash:      sv(<><rect x="2" y="7" width="20" height="10" rx="1"/><circle cx="12" cy="12" r="2"/><path d="M6 7V5M18 7V5M6 19v-2M18 19v-2"/></>),
  coin:      sv(<><circle cx="12" cy="12" r="9"/><path d="M14.5 9a2.5 2.5 0 0 0-2.5-2h-1a2.5 2.5 0 0 0 0 5h2a2.5 2.5 0 0 1 0 5h-1a2.5 2.5 0 0 1-2.5-2M12 7v2M12 15v2"/></>),
  card:      I.card,
  receipt:   I.receipt,
  fileInvoice: sv(<><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 13h6M9 17h4"/></>),
  bank:      I.bank,
  percent:   I.percent,
  calculator: sv(<><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></>),
  // Logística y transporte
  truck:     I.truck,
  car:       sv(<><path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/><path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/><path d="M5 17H3v-6l2-5h12l2 5v6h-2M5 11h14"/></>),
  plane:     sv(<path d="M16 10h4a2 2 0 0 1 0 4h-4l-4 7H9l2-7H7l-2 3H2l2-5-2-5h3l2 3h4L9 3h3l4 7z"/>),
  mapPin:    I.mapPin,
  route:     sv(<><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M12 18h4.5a3.5 3.5 0 0 0 0-7h-8a3.5 3.5 0 0 1 0-7H12"/></>),
  forklift:  sv(<><path d="M5 17H3V5h9v12"/><circle cx="7" cy="18" r="1" fill="currentColor"/><circle cx="17" cy="18" r="1" fill="currentColor"/><path d="M12 7h4v8M12 9h3M18 13v5"/></>),
  // Tecnología
  cloud:     sv(<path d="M6.5 19h11a4.5 4.5 0 0 0 0-9h-.5A6 6 0 1 0 6.5 19z"/>),
  laptop:    sv(<><path d="M5 5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v9H5V5z"/><path d="M2 18h20M9 18l1 2M14 18l-1 2"/></>),
  code:      sv(<path d="M7 8L3 12l4 4M17 8l4 4-4 4M14 4l-4 16"/>),
  wifi:      sv(<><circle cx="12" cy="19" r="1" fill="currentColor"/><path d="M8.5 15.5a6 6 0 0 1 7 0M5 12a10 10 0 0 1 14 0M2 8.5a14.5 14.5 0 0 1 20 0"/></>),
  github:    sv(<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>),
  plug:      sv(<><path d="M9 7v-4M15 7v-4M9 7h6v5a3 3 0 0 1-6 0V7z"/><path d="M12 12v4M10 16h4"/></>),
  // General
  star:      sv(<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>),
  heart:     sv(<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>),
  flag:      sv(<><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></>),
  tag:       sv(<><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1" fill="currentColor"/></>),
  pin:       sv(<><path d="M9 4v6l-2 4h10l-2-4V4"/><path d="M12 14v7M8 4h8"/></>),
  bookmark:  sv(<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>),
};

const ICONOS_GRUPOS = [
  { grupo: 'Operaciones y campo',        iconos: ['tools','hammer','drill','helmet','bolt','flame','droplet','antenna','cpu','server'] },
  { grupo: 'Compras y materiales',       iconos: ['package','box','cart','barcode','clipboard','archive','stack'] },
  { grupo: 'Servicios y personas',       iconos: ['users','userCheck','briefcase','headset','school','certificate','chartBar'] },
  { grupo: 'Finanzas y administración',  iconos: ['cash','coin','card','receipt','fileInvoice','bank','percent','calculator'] },
  { grupo: 'Logística y transporte',     iconos: ['truck','car','plane','mapPin','route','forklift'] },
  { grupo: 'Tecnología',                 iconos: ['cloud','laptop','code','wifi','github','plug'] },
  { grupo: 'General',                    iconos: ['star','heart','flag','tag','pin','bookmark'] },
];

const FORM_VACIO = {
  fecha:            '',
  concepto:         '',
  monto:            '',
  moneda:           'PEN',
  centro_costo_id:  '',
  ot_vinc_id:       '',
  ya_pagado:        false,
  metodo_pago:      'Transferencia bancaria',
  referencia_pago:  '',
  fecha_pago:       '',
  cuenta_bancaria_id: '',
  fondo_caja_chica_id: '',
  fecha_vencimiento:'',
  proveedor_id:     '',
  proveedor_texto:  '',
  num_comprobante:  '',
  tipo_comprobante: 'Factura',
};

function icono(name) {
  return TIPO_GASTO_ICONOS[name] || TIPO_GASTO_ICONOS.receipt;
}

const fmtCaja = (value, moneda = 'PEN') =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(value || 0));

const DRAFT_KEY = 'nuevo_egreso_draft';

function loadDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ── Componente principal ──────────────────────────────────────────────────────
// preconfig: { paso, tipoSel, form } — permite abrir directamente en paso 2
// pre-cargado (ej. desde Caja Chica con metodo_pago='Caja chica' ya_pagado=true).
export function NuevoEgreso({ onClose, onSaved, origen = 'compras_gastos', preconfig = null }) {
  const {
    empresa, authUser, centrosCosto, ots, proveedores, cuentasBancarias,
    setComprasGastos, setCajaChica, setCxp, setCxpPagos, setMovimientosTesoreria,
    addNotificacion,
  } = useApp();

  // Pre-generamos el ID del gasto para poder enlazarlo a FileUpload antes de guardar
  const gastoId = useMemo(
    () => `gasto_${Math.random().toString(36).slice(2, 14)}`,
    [],
  );
  const fileRef = useRef(null);

  const today = new Date().toISOString().split('T')[0];

  const draft = useMemo(() => preconfig ? null : loadDraft(), []);

  const [paso, setPaso]           = useState(draft?.paso || preconfig?.paso || 1);
  const [tipoSel, setTipoSel]     = useState(draft?.tipoSel || preconfig?.tipoSel || null);
  const [tiposGasto, setTiposGasto] = useState([]);
  const [buscarTipo, setBuscarTipo] = useState('');
  const [tc, setTc]               = useState(null);
  const [archivoUrl, setArchivoUrl] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errCeco, setErrCeco]     = useState(false);
  const [errVence, setErrVence]   = useState(false);
  const [errFecha, setErrFecha]   = useState(false);
  const [errFondo, setErrFondo]   = useState(false);
  const [errFechaPago, setErrFechaPago] = useState(false);
  const [errCuentaPago, setErrCuentaPago] = useState(false);
  // Campos de activo fijo (solo cuando es_capitalizacion = true)
  const [activoTipo, setActivoTipo]         = useState('equipo');
  const [activoSerie, setActivoSerie]       = useState('');
  const [activoVidaUtil, setActivoVidaUtil] = useState('');
  const [errActivoVidaUtil, setErrActivoVidaUtil] = useState(false);
  const [fondosCaja, setFondosCaja] = useState([]);
  const [loadingFondosCaja, setLoadingFondosCaja] = useState(false);
  const [form, setForm]           = useState({ ...FORM_VACIO, fecha: today, ...(preconfig?.form || {}), ...(draft?.form || {}) });

  // Persistir borrador en sessionStorage mientras el usuario llena el formulario
  useEffect(() => {
    if (preconfig) return;
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ paso, tipoSel, form })); } catch { /* quota */ }
  }, [paso, tipoSel, form]);

  const setF = (k, v) => {
    setForm(p => {
      const next = { ...p, [k]: v };
      if (k === 'metodo_pago' && v !== 'Caja chica') next.fondo_caja_chica_id = '';
      if (k === 'ya_pagado' && !v) next.fondo_caja_chica_id = '';
      if (k === 'ya_pagado' && v && !next.fecha_pago) next.fecha_pago = next.fecha || today;
      if (k === 'fecha' && !next.fecha_pago) next.fecha_pago = v;
      return next;
    });
    if (k === 'centro_costo_id') setErrCeco(false);
    if (k === 'fecha_vencimiento') setErrVence(false);
    if (k === 'fecha') setErrFecha(false);
    if (k === 'fondo_caja_chica_id' || k === 'metodo_pago' || k === 'ya_pagado') setErrFondo(false);
    if (k === 'fecha_pago' || k === 'ya_pagado') setErrFechaPago(false);
    if (k === 'cuenta_bancaria_id' || k === 'metodo_pago' || k === 'ya_pagado') setErrCuentaPago(false);
  };

  const cecos       = (centrosCosto || []).filter(c => c.estado === 'activo');
  const otsActivas  = (ots || []).filter(o => !['cerrada', 'anulada'].includes(o.estado));
  const provsActivos = (proveedores || []).filter(p => p.estado !== 'inactivo');
  const cuentasBancariasActivas = (cuentasBancarias || []).filter(c => !['inactivo', 'eliminado'].includes(String(c.estado || '').toLowerCase()));

  const esCapitalizacion = !!tipoSel?.es_capitalizacion;

  // Cargar tipos de gasto y tipo de cambio al montar
  useEffect(() => {
    const load = async () => {
      if (isSupabaseConfigured() && empresa?.id) {
        try {
          const sb = await getSupabaseClient();
          const [tiposData, { data: catsData }] = await Promise.all([
            finanzasService.getTiposGasto(empresa.id),
            sb.from('er_categorias').select('nombre, es_capitalizacion').eq('empresa_id', empresa.id).eq('activo', true),
          ]);
          const capMap = Object.fromEntries((catsData || []).map(c => [c.nombre, !!c.es_capitalizacion]));
          const tipos = (tiposData.length ? tiposData : TIPOS_GASTO_DEFECTO).map(t => ({
            ...t,
            es_capitalizacion: capMap[t.categoria_er] ?? (t.categoria_er === 'Inversiones / Activos'),
          }));
          setTiposGasto(tipos);
        } catch {
          setTiposGasto(TIPOS_GASTO_DEFECTO);
        }
      } else {
        setTiposGasto(TIPOS_GASTO_DEFECTO);
      }
      try {
        const sb = isSupabaseConfigured() ? await getSupabaseClient() : null;
        const tipoCambio = await getTipoCambioHoy(sb);
        setTc(tipoCambio);
      } catch { /* TC no disponible — formulario sigue funcionando */ }
    };
    load();
  }, [empresa?.id]);

  useEffect(() => {
    let mounted = true;
    const loadFondos = async () => {
      if (!isSupabaseConfigured() || !empresa?.id) {
        setFondosCaja([{ id: 'mock_fondo_general', nombre: 'Caja Chica General', saldo_disponible: 999999, moneda: empresa?.moneda || 'PEN' }]);
        return;
      }
      setLoadingFondosCaja(true);
      try {
        const data = await cajaChicaService.listarFondosActivosConSaldo(empresa.id);
        if (mounted) setFondosCaja(data || []);
      } catch (error) {
        console.warn('[NuevoEgreso] fondos caja chica:', error?.message || error);
        if (mounted) setFondosCaja([]);
      } finally {
        if (mounted) setLoadingFondosCaja(false);
      }
    };
    loadFondos();
    return () => { mounted = false; };
  }, [empresa?.id]);

  // Equivalente PEN cuando la moneda es distinta
  const montoPEN = useMemo(() => {
    const m = parseFloat(form.monto) || 0;
    if (form.moneda === 'PEN' || !tc) return m;
    return convertirMonto(m, form.moneda, 'PEN', tc);
  }, [form.monto, form.moneda, tc]);

  // ── Paso 1: selección de tipo ─────────────────────────────────────────────
  const tiposGastoFiltrados = useMemo(
    () => tiposGasto.filter(t => matchIniciales(`${t.nombre} ${t.categoria_er}`, buscarTipo)),
    [tiposGasto, buscarTipo]
  );

  const seleccionarTipo = t => {
    setTipoSel(t);
    // Prellena el concepto con el nombre del tipo (editable); no pisa un concepto que el usuario ya haya escrito.
    setForm(p => (p.concepto.trim() ? p : { ...p, concepto: t.nombre }));
    setPaso(2);
  };

  const renderPaso1 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
        Selecciona el tipo de gasto. La categoría ER se asignará automáticamente.
      </div>

      <input
        type="text"
        className="input"
        placeholder="Buscar por tipo de gasto o categoría ER..."
        value={buscarTipo}
        onChange={e => setBuscarTipo(e.target.value)}
      />

      {tiposGastoFiltrados.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--fg-muted)', textAlign: 'center', padding: '20px 0' }}>
          Ningún tipo de gasto coincide con "{buscarTipo}".
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        {tiposGastoFiltrados.map(t => {
          const activo = tipoSel?.id === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => seleccionarTipo(t)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                padding: '16px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                border: `2px solid ${activo ? 'var(--cyan)' : 'var(--border)'}`,
                background: activo ? 'color-mix(in srgb, var(--cyan) 8%, var(--surface))' : 'var(--surface)',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <span style={{ width: 22, height: 22, color: activo ? 'var(--cyan)' : 'var(--fg-muted)' }}>
                {icono(t.icono)}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{t.nombre}</span>
              <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>{t.categoria_er}</span>
            </button>
          );
        })}
      </div>
      )}
    </div>
  );

  // ── Paso 2: detalle y pago ────────────────────────────────────────────────
  const renderPaso2 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Aviso capitalización */}
      {esCapitalizacion && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, fontSize: 13,
          background: 'color-mix(in srgb, var(--orange) 8%, var(--surface))',
          border: '1px solid color-mix(in srgb, var(--orange) 35%, var(--border))',
          display: 'flex', gap: 10,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>📦</span>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Este egreso se capitalizará como activo fijo</div>
            <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>
              No aparecerá como gasto en el ER del período. Su depreciación mensual se registrará desde el módulo Activos Fijos.
            </div>
          </div>
        </div>
      )}

      {/* Campos de activo fijo */}
      {esCapitalizacion && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="input-group">
              <label>Tipo de activo <span style={{ color: 'var(--danger)' }}>*</span></label>
              <select className="select" value={activoTipo} onChange={e => setActivoTipo(e.target.value)}>
                {ACTIVO_TIPOS_WIZ.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>N° de serie o placa <span style={{ color: 'var(--fg-muted)', fontWeight: 400, fontSize: 11 }}>(opcional)</span></label>
              <input
                className="input"
                value={activoSerie}
                onChange={e => setActivoSerie(e.target.value)}
                placeholder="Ej: ABC-123, SN-987654"
              />
            </div>
          </div>
          <div className="input-group">
            <label>Vida útil en años <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input
              className={`input${errActivoVidaUtil ? ' input-error' : ''}`}
              type="number" min="1" step="1"
              value={activoVidaUtil}
              onChange={e => { setActivoVidaUtil(e.target.value); setErrActivoVidaUtil(false); }}
              placeholder="Ej: 5"
            />
            {errActivoVidaUtil && (
              <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
                La vida útil es obligatoria para registrar el activo.
              </div>
            )}
          </div>
          <div style={{ height: 1, background: 'var(--border-subtle)' }} />
        </>
      )}

      {/* Concepto */}
      <div className="input-group">
        <label>Concepto / descripción <span style={{ color: 'var(--danger)' }}>*</span></label>
        <input
          className="input" value={form.concepto}
          onChange={e => setF('concepto', e.target.value)}
          placeholder="Ej: Materiales para OT-045, Servicio de limpieza..."
        />
      </div>

      {/* Fecha del gasto */}
      <div className="input-group">
        <label>Fecha del gasto <span style={{ color: 'var(--danger)' }}>*</span></label>
        <input
          className={`input${errFecha ? ' input-error' : ''}`}
          type="date"
          max={today}
          value={form.fecha}
          onChange={e => setF('fecha', e.target.value)}
        />
        {errFecha && (
          <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
            La fecha no puede ser posterior a hoy.
          </div>
        )}
      </div>

      {/* Monto + Moneda */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <div className="input-group">
          <label>Monto <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input
            className="input" type="number" min="0.01" step="0.01"
            value={form.monto} onChange={e => setF('monto', e.target.value)} placeholder="0.00"
          />
        </div>
        <div className="input-group">
          <label>Moneda</label>
          <select className="select" value={form.moneda} onChange={e => setF('moneda', e.target.value)}>
            <option value="PEN">PEN</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
      </div>

      {/* Equivalente PEN si moneda != PEN */}
      {form.moneda !== 'PEN' && form.monto && (
        <div style={{
          fontSize: 12, color: 'var(--fg-muted)', padding: '8px 12px',
          background: 'var(--bg-alt)', borderRadius: 6,
        }}>
          Equivalente: <strong>S/ {montoPEN.toFixed(2)}</strong>
          {tc ? <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>TC automático</span>
               : <span style={{ marginLeft: 6, color: 'var(--orange)' }}>Sin TC disponible</span>}
        </div>
      )}

      {/* CECO (obligatorio) */}
      <div className="input-group">
        <label>Centro de Costo <span style={{ color: 'var(--danger)' }}>*</span></label>
        <select
          className={`select${errCeco ? ' input-error' : ''}`}
          value={form.centro_costo_id}
          onChange={e => setF('centro_costo_id', e.target.value)}
        >
          <option value="">— Seleccionar CECO —</option>
          {cecos.map(c => (
            <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} — ` : ''}{c.nombre}</option>
          ))}
        </select>
        {errCeco && (
          <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
            El CECO es obligatorio.
          </div>
        )}
      </div>

      {/* OT vinculada (opcional) */}
      <div className="input-group">
        <label>OT vinculada <span style={{ color: 'var(--fg-muted)', fontWeight: 400, fontSize: 11 }}>(opcional)</span></label>
        <select className="select" value={form.ot_vinc_id} onChange={e => setF('ot_vinc_id', e.target.value)}>
          <option value="">— Sin OT —</option>
          {otsActivas.map(o => (
            <option key={o.id} value={o.id}>{o.codigo || o.id} {o.descripcion ? `— ${o.descripcion}` : ''}</option>
          ))}
        </select>
      </div>

      {/* Toggle: ¿ya fue pagado? */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', borderRadius: 8,
        background: form.ya_pagado
          ? 'color-mix(in srgb, var(--green) 8%, var(--surface))'
          : 'color-mix(in srgb, var(--orange) 6%, var(--surface))',
        border: `1px solid ${form.ya_pagado ? 'color-mix(in srgb, var(--green) 25%, var(--border))' : 'color-mix(in srgb, var(--orange) 25%, var(--border))'}`,
      }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>¿Este gasto ya fue pagado?</div>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
            {form.ya_pagado ? 'Sí — se registra como pagado' : 'No — quedará pendiente de pago (CxP)'}
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{form.ya_pagado ? 'Sí' : 'No'}</span>
          <div
            onClick={() => setF('ya_pagado', !form.ya_pagado)}
            style={{
              width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
              background: form.ya_pagado ? 'var(--green)' : 'var(--border)',
              position: 'relative', transition: 'background 0.2s',
            }}
          >
            <div style={{
              position: 'absolute', top: 3, left: form.ya_pagado ? 21 : 3,
              width: 16, height: 16, borderRadius: '50%', background: '#fff',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </div>
        </label>
      </div>

      {/* Campos condicionales: pagado */}
      {form.ya_pagado && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="input-group">
              <label>Método de pago</label>
              <select className="select" value={form.metodo_pago} onChange={e => setF('metodo_pago', e.target.value)}>
                {METODOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>Referencia / N° operación</label>
              <input className="input" value={form.referencia_pago}
                onChange={e => setF('referencia_pago', e.target.value)}
                placeholder="N° transferencia, voucher..."
              />
            </div>
          </div>
          {form.metodo_pago !== 'Caja chica' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label>Fecha de pago <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  className={`input${errFechaPago ? ' input-error' : ''}`}
                  type="date"
                  max={today}
                  value={form.fecha_pago || form.fecha}
                  onChange={e => setF('fecha_pago', e.target.value)}
                />
                {errFechaPago && (
                  <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
                    La fecha de pago es obligatoria.
                  </div>
                )}
              </div>
              <div className="input-group">
                <label>Cuenta bancaria <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select
                  className={`select${errCuentaPago ? ' input-error' : ''}`}
                  value={form.cuenta_bancaria_id}
                  onChange={e => setF('cuenta_bancaria_id', e.target.value)}
                >
                  <option value="">- Seleccionar cuenta -</option>
                  {cuentasBancariasActivas.map(c => (
                    <option key={c.id} value={c.id}>
                      {(c.alias || c.nombre || c.banco || c.id)} ({c.moneda || 'PEN'})
                    </option>
                  ))}
                </select>
                {errCuentaPago && (
                  <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
                    Seleccione la cuenta bancaria del pago.
                  </div>
                )}
              </div>
            </div>
          )}
          {form.metodo_pago === 'Caja chica' && (
            <div className="input-group">
              <label>Fondo de caja chica <span style={{ color: 'var(--danger)' }}>*</span></label>
              {loadingFondosCaja ? (
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', padding: '8px 0' }}>Cargando fondos...</div>
              ) : fondosCaja.length > 0 ? (
                <>
                  <select
                    className={`select${errFondo ? ' input-error' : ''}`}
                    value={form.fondo_caja_chica_id}
                    onChange={e => setF('fondo_caja_chica_id', e.target.value)}
                  >
                    <option value="">- Seleccionar fondo -</option>
                    {fondosCaja.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.nombre} - disponible {fmtCaja(f.saldo_disponible, f.moneda)}
                      </option>
                    ))}
                  </select>
                  {errFondo && (
                    <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
                      Seleccione el fondo que asumira este egreso.
                    </div>
                  )}
                </>
              ) : (
                <div style={{
                  fontSize: 12,
                  color: 'var(--orange)',
                  padding: '9px 12px',
                  border: '1px solid color-mix(in srgb, var(--orange) 35%, var(--border))',
                  borderRadius: 8,
                  background: 'color-mix(in srgb, var(--orange) 8%, var(--surface))',
                }}>
                  No hay fondos activos con saldo disponible. Cree un fondo en Caja Chica antes de registrar este pago.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {form.ya_pagado && <div className="input-group">
        <label>Proveedor o beneficiario{form.ya_pagado ? ' (opcional)' : ''}</label>
        <select className="select" value={form.proveedor_id} onChange={e => setF('proveedor_id', e.target.value)}>
          <option value="">- Ingreso libre -</option>
          {provsActivos.map(p => (
            <option key={p.id} value={p.id}>{p.razon_social || p.nombre_comercial || p.id}</option>
          ))}
        </select>
        {!form.proveedor_id && (
          <input
            className="input" style={{ marginTop: 6 }}
            placeholder="Nombre si no esta en el catalogo"
            value={form.proveedor_texto}
            onChange={e => setF('proveedor_texto', e.target.value)}
          />
        )}
      </div>}

      {/* Campos condicionales: pendiente */}
      {!form.ya_pagado && (
        <>
          <div className="input-group">
            <label>Fecha de vencimiento <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input
              className={`input${errVence ? ' input-error' : ''}`}
              type="date" value={form.fecha_vencimiento}
              onChange={e => setF('fecha_vencimiento', e.target.value)}
            />
            {errVence && (
              <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
                La fecha de vencimiento es obligatoria.
              </div>
            )}
          </div>
          <div className="input-group">
            <label>Proveedor o beneficiario</label>
            <select className="select" value={form.proveedor_id} onChange={e => setF('proveedor_id', e.target.value)}>
              <option value="">— Ingreso libre —</option>
              {provsActivos.map(p => (
                <option key={p.id} value={p.id}>{p.razon_social || p.nombre_comercial || p.id}</option>
              ))}
            </select>
            {!form.proveedor_id && (
              <input
                className="input" style={{ marginTop: 6 }}
                placeholder="Nombre si no está en el catálogo"
                value={form.proveedor_texto}
                onChange={e => setF('proveedor_texto', e.target.value)}
              />
            )}
          </div>
        </>
      )}

      {/* Comprobante */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="input-group">
          <label>N° comprobante</label>
          <input className="input" value={form.num_comprobante}
            onChange={e => setF('num_comprobante', e.target.value)}
            placeholder="F001-000123"
          />
        </div>
        <div className="input-group">
          <label>Tipo de comprobante</label>
          <select className="select" value={form.tipo_comprobante} onChange={e => setF('tipo_comprobante', e.target.value)}>
            {TIPOS_COMP.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Adjuntar comprobante */}
      <div className="input-group">
        <label>Adjuntar comprobante</label>
        <FileUpload
          ref={fileRef}
          entidadTipo="compras_gastos"
          entidadId={gastoId}
          empresaId={empresa?.id}
          categoria="comprobante"
          deferUpload={false}
          onUploaded={(adjuntos) => {
            const url = adjuntos?.[0]?.url || '';
            setArchivoUrl(url);
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
        <button className="btn btn-secondary" type="button" onClick={() => setPaso(1)}>← Atrás</button>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => {
            let ok = true;
            if (!form.centro_costo_id) { setErrCeco(true); ok = false; }
            if (!form.ya_pagado && !form.fecha_vencimiento) { setErrVence(true); ok = false; }
            if (!form.fecha || form.fecha > today) { setErrFecha(true); ok = false; }
            if (form.ya_pagado && form.metodo_pago === 'Caja chica' && !form.fondo_caja_chica_id) { setErrFondo(true); ok = false; }
            if (form.ya_pagado && form.metodo_pago !== 'Caja chica' && !(form.fecha_pago || form.fecha)) { setErrFechaPago(true); ok = false; }
            if (form.ya_pagado && form.metodo_pago !== 'Caja chica' && !form.cuenta_bancaria_id) { setErrCuentaPago(true); ok = false; }
            if (esCapitalizacion && !activoVidaUtil) { setErrActivoVidaUtil(true); ok = false; }
            if (!form.concepto.trim() || !parseFloat(form.monto)) return;
            if (ok) setPaso(3);
          }}
        >
          Revisar →
        </button>
      </div>
    </div>
  );

  // ── Paso 3: confirmar ─────────────────────────────────────────────────────
  const renderPaso3 = () => {
    const monto    = parseFloat(form.monto) || 0;
    const categoria = tipoSel?.categoria_er || 'Administrativos';
    const cecoNombre = cecos.find(c => c.id === form.centro_costo_id)?.nombre || '—';
    const fondoCajaSel = fondosCaja.find(f => f.id === form.fondo_caja_chica_id);
    const cuentaPagoSel = cuentasBancariasActivas.find(c => c.id === form.cuenta_bancaria_id);
    const provNombre = form.proveedor_id
      ? (provsActivos.find(p => p.id === form.proveedor_id)?.razon_social || form.proveedor_id)
      : (form.proveedor_texto || '—');

    const filas = [
      ['Tipo de gasto',  tipoSel?.nombre || '—'],
      ['Categoría ER',   esCapitalizacion
        ? <><strong>{categoria}</strong> <span className="badge badge-orange" style={{fontSize:10}}>Capitalización</span></>
        : <><strong>{categoria}</strong> <span className="badge badge-cyan" style={{fontSize:10}}>automático</span></>],
      esCapitalizacion ? ['Tipo de activo', ACTIVO_TIPOS_WIZ.find(t => t.value === activoTipo)?.label || activoTipo] : null,
      esCapitalizacion && activoSerie ? ['N° serie / placa', activoSerie] : null,
      esCapitalizacion ? ['Vida útil', `${activoVidaUtil} años`] : null,
      ['Concepto',       form.concepto],
      ['Fecha',          form.fecha],
      ['Monto',          `${form.moneda} ${monto.toFixed(2)}${form.moneda !== 'PEN' ? ` (S/ ${montoPEN.toFixed(2)})` : ''}`],
      ['CECO',           cecoNombre],
      form.ot_vinc_id ? ['OT vinculada', otsActivas.find(o => o.id === form.ot_vinc_id)?.codigo || form.ot_vinc_id] : null,
      ['Estado pago',    form.ya_pagado ? 'Pagado' : 'Pendiente'],
      form.ya_pagado ? ['Método',    form.metodo_pago] : null,
      form.ya_pagado && form.metodo_pago !== 'Caja chica' ? ['Fecha de pago', form.fecha_pago || form.fecha] : null,
      form.ya_pagado && form.metodo_pago !== 'Caja chica' ? ['Cuenta bancaria', cuentaPagoSel ? `${cuentaPagoSel.alias || cuentaPagoSel.nombre || cuentaPagoSel.banco || cuentaPagoSel.id} (${cuentaPagoSel.moneda || 'PEN'})` : '-'] : null,
      form.ya_pagado && form.metodo_pago === 'Caja chica' ? ['Fondo caja chica', fondoCajaSel ? `${fondoCajaSel.nombre} (${fmtCaja(fondoCajaSel.saldo_disponible, fondoCajaSel.moneda)})` : 'â€”'] : null,
      form.ya_pagado && form.referencia_pago ? ['Referencia', form.referencia_pago] : null,
      !form.ya_pagado ? ['Vencimiento', form.fecha_vencimiento] : null,
      ['Proveedor / beneficiario', provNombre],
      form.num_comprobante ? ['Comprobante', `${form.tipo_comprobante} ${form.num_comprobante}`] : null,
      archivoUrl ? ['Archivo', '✓ Adjunto cargado'] : null,
    ].filter(Boolean);

    const destinoFinal = form.ya_pagado
      ? (form.metodo_pago === 'Caja chica'
          ? 'Gasto en compras_gastos + registro en caja_chica'
          : 'Gasto registrado + CxP pagada + movimiento de tesoreria')
      : 'Gasto registrado en compras_gastos + CxP pendiente creada';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{
          padding: '12px 16px', borderRadius: 8, fontSize: 13,
          background: 'color-mix(in srgb, var(--cyan) 8%, var(--surface))',
          border: '1px solid color-mix(in srgb, var(--cyan) 25%, var(--border))',
          fontWeight: 600,
        }}>
          {destinoFinal}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {filas.map(([k, v]) => (
              <tr key={k} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '7px 0', color: 'var(--fg-muted)', width: '42%', verticalAlign: 'top' }}>{k}</td>
                <td style={{ padding: '7px 0', fontWeight: 500, verticalAlign: 'top' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
          <button className="btn btn-secondary" type="button" onClick={() => setPaso(2)}>← Atrás</button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={guardando}
            onClick={handleGuardar}
          >
            {guardando ? 'Guardando...' : <>{I.save} Guardar egreso</>}
          </button>
        </div>
      </div>
    );
  };

  // ── Lógica de persistencia ────────────────────────────────────────────────
  const handleGuardar = async () => {
    if (!form.centro_costo_id) { setErrCeco(true); setPaso(2); return; }
    if (!form.ya_pagado && !form.fecha_vencimiento) { setErrVence(true); setPaso(2); return; }
    if (form.ya_pagado && form.metodo_pago === 'Caja chica' && !form.fondo_caja_chica_id) {
      setErrFondo(true);
      setPaso(2);
      return;
    }
    if (esCapitalizacion && !activoVidaUtil) { setErrActivoVidaUtil(true); setPaso(2); return; }

    setGuardando(true);
    let gastoPersistidoSupabase = false;
    try {
      const monto     = parseFloat(form.monto) || 0;
      const categoria = tipoSel?.categoria_er || 'Administrativos';
      const tcVal     = form.moneda !== 'PEN' && tc
        ? (form.moneda === 'USD' ? tc.usd : tc.eur)
        : null;
      const proveedorSel = form.proveedor_id
        ? provsActivos.find(p => p.id === form.proveedor_id)
        : null;
      const proveedorNombre = proveedorSel
        ? (proveedorSel.razon_social || proveedorSel.nombre_comercial || proveedorSel.id)
        : (form.proveedor_texto || null);

      // ── 1. Siempre crear compras_gastos ───────────────────────────────
      const gastoBase = {
        id:                 gastoId,
        empresa_id:         empresa.id,
        tipo:               'gasto',
        descripcion:        form.concepto.trim(),
        categoria,
        categoria_er:       categoria,
        monto,
        moneda:             form.moneda,
        ...(tcVal ? { tipo_cambio: tcVal, moneda_original: form.moneda, monto_original: monto } : {}),
        fecha:              form.fecha,
        centro_costo_id:    form.centro_costo_id,
        ot_vinc_id:         form.ot_vinc_id || null,
        tipo_comprobante:   form.tipo_comprobante,
        num_comprobante:    form.num_comprobante || null,
        proveedor:          proveedorNombre,
        proveedor_referencia: proveedorNombre,
        archivo_factura_url: archivoUrl || null,
        origen_registro:    'backoffice',
        estado:             'registrado',
        estado_pago:        form.ya_pagado ? 'pagado' : 'pendiente',
        referencia_pago:    form.ya_pagado ? (form.referencia_pago || null) : null,
        creado_por:         authUser?.id || null,
        created_at:         new Date().toISOString(),
        // Activo fijo
        es_activo_fijo:     esCapitalizacion,
        ...(esCapitalizacion ? {
          activo_tipo:       activoTipo,
          numero_serie:      activoSerie || null,
          vida_util_anos:    Number(activoVidaUtil) || null,
          activo_estado:     'activo',
        } : {}),
      };

      if (isSupabaseConfigured()) {
        const sb = await getSupabaseClient();
        // Payload con solo columnas que existen en el schema de compras_gastos.
        // gastoBase puede tener campos extra para el estado local (categoria_er, etc.)
        // pero enviarlos a Supabase provoca que el loop de retry se agote silenciosamente.
        const gastoPayload = {
          id:               gastoId,
          empresa_id:       empresa.id,
          tipo:             'gasto',
          descripcion:      form.concepto.trim(),
          categoria,
          monto,
          moneda:           form.moneda,
          fecha:            form.fecha,
          origen_registro:  'backoffice',
          estado:           'registrado',
          estado_pago:      form.ya_pagado ? 'pagado' : 'pendiente',
          referencia_pago:  form.ya_pagado ? (form.referencia_pago || null) : null,
          centro_costo_id:  form.centro_costo_id,
          ...(form.ot_vinc_id ? { ot_vinc_id: form.ot_vinc_id } : {}),
          proveedor_referencia: proveedorNombre || null,
          archivo_url:      archivoUrl || null,
          // Activo fijo
          es_activo_fijo:   esCapitalizacion,
          ...(esCapitalizacion ? {
            activo_tipo:    activoTipo,
            numero_serie:   activoSerie || null,
            vida_util_anos: Number(activoVidaUtil) || null,
            activo_estado:  'activo',
          } : {}),
        };
        let gp = { ...gastoPayload };
        let ok = false;
        for (let i = 0; i < 8; i++) {
          const { error } = await sb.from('compras_gastos').insert([gp]).select().single();
          if (!error) { ok = true; break; }
          const col = error.message?.match(/column "([^"]+)" of relation/)?.[1]
            || error.message?.match(/'([^']+)' column/)?.[1];
          if (!col || !(col in gp)) throw error;
          delete gp[col];
        }
        if (!ok) {
          const { error } = await sb.from('compras_gastos').insert([gp]).select().single();
          if (error) throw error;
        }
        gastoPersistidoSupabase = true;
      }
      setComprasGastos(prev => [gastoBase, ...prev]);

      let toastMsg = 'Gasto registrado en compras_gastos';

      // ── 2a. Caja chica: gasto pagado vía caja chica ───────────────────
      if (form.ya_pagado && form.metodo_pago === 'Caja chica') {
        const ccId = `cc_${Math.random().toString(36).slice(2, 14)}`;
        const ccRecord = {
          id:                ccId,
          empresa_id:        empresa.id,
          fecha:             form.fecha,
          concepto:          form.concepto.trim(),
          monto,
          moneda:            form.moneda,
          responsable_id:    authUser?.id   || null,
          responsable_nombre: authUser?.email || null,
          fondo_id:          form.fondo_caja_chica_id || null,
          ceco_id:           form.centro_costo_id,
          categoria,
          num_comprobante:   form.num_comprobante || null,
          comprobante_url:   archivoUrl || null,
          estado:            'registrado',
          origen_registro:   'backoffice',
          gasto_id:          gastoId,
          creado_por:        authUser?.id || null,
          creado_en:         new Date().toISOString(),
        };
        if (isSupabaseConfigured()) {
          await cajaChicaService.registrarEgresoFondo(ccRecord).catch(err =>
            console.warn('[NuevoEgreso] caja_chica insert:', err?.message),
          );
        }
        setCajaChica(prev => [ccRecord, ...prev]);
        toastMsg = 'Gasto registrado en compras_gastos + Caja chica';

      // ── 2b. CxP: gasto pendiente ──────────────────────────────────────
      } else if (form.ya_pagado) {
        const fechaPago = form.fecha_pago || form.fecha;
        const cuentaPago = cuentasBancariasActivas.find(c => c.id === form.cuenta_bancaria_id);
        if (!cuentaPago) throw new Error('Cuenta bancaria requerida para registrar el pago.');

        const cxpId = `cxp_${Math.random().toString(36).slice(2, 14)}`;
        const pagoId = `cxpp_${Math.random().toString(36).slice(2, 14)}`;
        const movId = `tes_${Math.random().toString(36).slice(2, 14)}`;
        const sbTc = isSupabaseConfigured() ? await getSupabaseClient() : null;
        const tcPago = await getTipoCambioPorFecha(fechaPago, sbTc).catch(() => tc);
        const cuentaNombre = cuentaPago.alias || cuentaPago.nombre || cuentaPago.banco || cuentaPago.id;
        const cxpRecord = {
          id:                cxpId,
          empresa_id:        empresa.id,
          proveedor_id:      form.proveedor_id || null,
          nombre_emisor:     !form.proveedor_id ? (form.proveedor_texto || null) : null,
          tipo_beneficiario: 'proveedor',
          concepto:          form.concepto.trim(),
          monto_total:       monto,
          monto_pagado:      monto,
          saldo:             0,
          moneda:            form.moneda,
          ...(tcVal ? { tipo_cambio: tcVal, moneda_original: form.moneda, monto_original: monto } : {}),
          fecha_emision:     form.fecha,
          fecha_vencimiento: fechaPago,
          tipo_comprobante:  form.tipo_comprobante,
          factura_numero:    form.num_comprobante || null,
          archivo_factura_url: archivoUrl || null,
          categoria_er:      categoria,
          centro_costo_id:   form.centro_costo_id,
          ot_vinc_id:        form.ot_vinc_id || null,
          gasto_id:          gastoId,
          origen:            'auto_gasto',
          no_devengar_er:    true,
          estado:            'pagada',
          created_at:        new Date().toISOString(),
        };
        const pagoRecord = {
          id:                pagoId,
          empresa_id:        empresa.id,
          cxp_id:            cxpId,
          fecha_pago:        fechaPago,
          monto,
          cuenta_bancaria:   cuentaNombre,
          cuenta_bancaria_id: cuentaPago.id,
          referencia:        form.referencia_pago || null,
          registrado_por:    authUser?.id || null,
          creado_en:         new Date().toISOString(),
        };
        const movimientoBase = {
          id:                movId,
          empresa_id:        empresa.id,
          tipo:              'egreso',
          descripcion:       `Pago ${form.concepto.trim()}`,
          monto,
          moneda:            form.moneda,
          fecha:             fechaPago,
          cuenta_bancaria:   cuentaNombre,
          cuenta_bancaria_id: cuentaPago.id,
          referencia:        form.referencia_pago || form.num_comprobante || '',
          vinculo_tipo:      'cxp',
          vinculo_id:        cxpId,
          gasto_id:          gastoId,
          estado:            'registrado',
          es_manual:         false,
          created_at:        new Date().toISOString(),
        };
        const movimiento = {
          ...movimientoBase,
          ...prepararVinculacionMovimientoCuenta(movimientoBase, cuentaPago, tcPago),
        };

        let saved = null;
        if (isSupabaseConfigured()) {
          saved = await finanzasService.registrarGastoPagadoAutomatico({
            cxp: cxpRecord,
            pago: pagoRecord,
            movimiento,
            gastoId,
          });
        }

        const cxpFinal = saved?.cxp || cxpRecord;
        const pagoFinal = saved?.pago || pagoRecord;
        const movFinal = saved?.movimiento || movimiento;
        setComprasGastos(prev => prev.map(g => g.id === gastoId ? { ...g, cxp_id: cxpFinal.id, estado_pago: 'pagado' } : g));
        setCxp(prev => [cxpFinal, ...prev]);
        setCxpPagos(prev => [pagoFinal, ...prev]);
        setMovimientosTesoreria(prev => [movFinal, ...prev]);
        toastMsg = 'Gasto registrado + CxP pagada + movimiento en Tesoreria';

      } else if (!form.ya_pagado) {
        const cxpId = `cxp_${Math.random().toString(36).slice(2, 14)}`;
        const cxpRecord = {
          id:                cxpId,
          empresa_id:        empresa.id,
          proveedor_id:      form.proveedor_id || null,
          nombre_emisor:     !form.proveedor_id ? (form.proveedor_texto || null) : null,
          tipo_beneficiario: 'proveedor',
          concepto:          form.concepto.trim(),
          monto_total:       monto,
          moneda:            form.moneda,
          ...(tcVal ? { tipo_cambio: tcVal, moneda_original: form.moneda, monto_original: monto } : {}),
          fecha_emision:     form.fecha,
          fecha_vencimiento: form.fecha_vencimiento,
          tipo_comprobante:  form.tipo_comprobante,
          factura_numero:    form.num_comprobante || null,
          archivo_factura_url: archivoUrl || null,
          categoria_er:      categoria,
          centro_costo_id:   form.centro_costo_id,
          ot_vinc_id:        form.ot_vinc_id || null,
          gasto_id:          gastoId,
          origen:            'gasto',
          estado:            'por_pagar',
          monto_pagado:      0,
          saldo:             monto,
          created_at:        new Date().toISOString(),
        };
        if (isSupabaseConfigured()) {
          await finanzasService.generarCxP(cxpRecord).catch(err =>
            console.warn('[NuevoEgreso] cxp insert:', err?.message),
          );
        }
        setCxp(prev => [cxpRecord, ...prev]);
        toastMsg = 'Gasto registrado + CxP pendiente creada';
      }

      sessionStorage.removeItem(DRAFT_KEY);
      addNotificacion(toastMsg);
      onSaved?.({ gastoId, toastMsg });
    } catch (err) {
      console.error('[NuevoEgreso] handleGuardar:', err);
      if (gastoPersistidoSupabase && form.ya_pagado && form.metodo_pago !== 'Caja chica') {
        try {
          const sb = await getSupabaseClient();
          await sb.from('compras_gastos').delete().eq('id', gastoId);
        } catch (_) {}
      }
      setComprasGastos(prev => prev.filter(g => g.id !== gastoId));
      addNotificacion('Error al guardar el egreso. Intente nuevamente.');
    } finally {
      setGuardando(false);
    }
  };

  // ── Indicador de pasos ────────────────────────────────────────────────────
  const pasoLabels = ['Tipo de gasto', 'Detalle y pago', 'Confirmar'];

  return (
    <>
      <div className="side-panel-backdrop" onClick={onClose} />
      <div className="side-panel" style={{ width: 'min(620px, 96vw)' }}>
        <div className="side-panel-head">
          <div>
            <div className="eyebrow">Nuevo egreso</div>
            <div className="font-display" style={{ fontSize: 20, fontWeight: 700 }}>
              {pasoLabels[paso - 1]}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}>{I.x}</button>
        </div>

        {/* Stepper */}
        <div style={{
          display: 'flex', padding: '10px 22px', gap: 0,
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-alt)',
        }}>
          {pasoLabels.map((label, idx) => {
            const num    = idx + 1;
            const activo = num === paso;
            const hecho  = num < paso;
            return (
              <div
                key={num}
                style={{ display: 'flex', alignItems: 'center', flex: 1, position: 'relative' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: hecho ? 'var(--green)' : activo ? 'var(--cyan)' : 'var(--border)',
                    color: (hecho || activo) ? '#fff' : 'var(--fg-muted)',
                    flexShrink: 0,
                  }}>
                    {hecho ? '✓' : num}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: activo ? 600 : 400, color: activo ? 'var(--fg)' : 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                </div>
                {idx < pasoLabels.length - 1 && (
                  <div style={{ flex: 1, height: 1, background: 'var(--border)', margin: '0 8px' }} />
                )}
              </div>
            );
          })}
        </div>

        <div className="side-panel-body">
          {paso === 1 && renderPaso1()}
          {paso === 2 && renderPaso2()}
          {paso === 3 && renderPaso3()}
        </div>
      </div>
    </>
  );
}

// ── Sub-componente para la sección admin de tipos de gasto ────────────────────
const CATS_ER_FALLBACK = ['Mano de obra', 'Materiales', 'Servicios terceros', 'Logística', 'Administrativos', 'Comerciales', 'Gastos financieros'];

export function TiposGastoAdmin() {
  const { empresa, addNotificacion } = useApp();
  const [tipos, setTipos]     = useState([]);
  const [erCats, setErCats]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel]     = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm]       = useState({ nombre: '', categoria_er: '', icono: 'receipt', activo: true, orden: 0 });
  const [guardando, setGuardando] = useState(false);
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const cargar = async () => {
    if (!isSupabaseConfigured() || !empresa?.id) {
      setTipos(TIPOS_GASTO_DEFECTO.map((t, i) => ({ ...t, orden: i, activo: true })));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const sb = await getSupabaseClient();
      const [tiposR, catsR] = await Promise.all([
        sb.from('tipos_gasto_empresa').select('*').eq('empresa_id', empresa.id).order('orden'),
        sb.from('er_categorias').select('id, nombre, es_capitalizacion').eq('empresa_id', empresa.id).eq('activo', true).order('orden'),
      ]);
      setTipos(tiposR.data || []);
      setErCats(catsR.data || []);
    } catch { setTipos([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { cargar(); }, [empresa?.id]);

  const catOpts = erCats.length ? erCats.map(c => c.nombre) : CATS_ER_FALLBACK;
  const capMap  = Object.fromEntries((erCats || []).map(c => [c.nombre, !!c.es_capitalizacion]));

  const abrirNuevo = () => {
    setEditando(null);
    setForm({ nombre: '', categoria_er: catOpts[0] || '', icono: 'receipt', activo: true, orden: tipos.length });
    setPanel(true);
  };

  const abrirEditar = (t) => {
    setEditando(t);
    setForm({ nombre: t.nombre, categoria_er: t.categoria_er, icono: t.icono, activo: t.activo, orden: t.orden });
    setPanel(true);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) return;
    setGuardando(true);
    try {
      if (!isSupabaseConfigured()) {
        addNotificacion('Solo disponible con Supabase configurado.');
        return;
      }
      if (editando) {
        const updated = await finanzasService.actualizarTipoGasto(editando.id, form);
        setTipos(prev => prev.map(t => t.id === editando.id ? updated : t));
        addNotificacion('Tipo de gasto actualizado.');
      } else {
        const nuevo = await finanzasService.insertarTipoGasto({ ...form, empresa_id: empresa.id });
        setTipos(prev => [...prev, nuevo]);
        addNotificacion('Tipo de gasto creado.');
      }
      setPanel(false);
    } catch (err) {
      addNotificacion(`Error: ${err?.message || 'No se pudo guardar.'}`);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (t) => {
    if (!window.confirm(`¿Eliminar "${t.nombre}"?`)) return;
    try {
      await finanzasService.eliminarTipoGasto(t.id);
      setTipos(prev => prev.filter(x => x.id !== t.id));
      addNotificacion('Tipo de gasto eliminado.');
    } catch (err) {
      addNotificacion(`Error: ${err?.message}`);
    }
  };

  return (
    <div className="card params-card mb-6">
      <div className="card-head">
        <h3>Tipos de Gasto</h3>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={abrirNuevo}>{I.plus} Nuevo tipo</button>
      </div>
      <div className="card-body" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--fg-muted)' }}>Cargando...</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Categoría ER</th>
                <th>Ícono</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tipos.length ? tipos.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.nombre}</td>
                  <td>
                    <span className="badge badge-cyan">{t.categoria_er}</span>
                    {capMap[t.categoria_er] && (
                      <span className="badge badge-orange" style={{ marginLeft: 6, fontSize: 10 }}>Capitalización</span>
                    )}
                  </td>
                  <td><span style={{ width: 18, height: 18, display: 'inline-block' }}>{icono(t.icono)}</span></td>
                  <td>
                    <span className={`badge ${t.activo ? 'badge-green' : 'badge-gray'}`}>
                      {t.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => abrirEditar(t)}>{I.edit}</button>
                    <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--danger)' }} onClick={() => eliminar(t)}>{I.trash}</button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="5" style={{ padding: 24, textAlign: 'center', color: 'var(--fg-muted)' }}>
                  No hay tipos configurados. Se usarán los valores por defecto.
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {panel && (
        <>
          <div className="side-panel-backdrop" onClick={() => setPanel(false)} />
          <div className="side-panel" style={{ width: 'min(440px, 96vw)' }}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">Parámetros · Egresos</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{editando ? 'Editar tipo' : 'Nuevo tipo de gasto'}</div>
              </div>
              <button className="icon-btn" onClick={() => setPanel(false)}>{I.x}</button>
            </div>
            <div className="side-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="input-group">
                <label>Nombre visible <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input className="input" value={form.nombre} onChange={e => setF('nombre', e.target.value)} placeholder="Ej: Materiales e insumos" />
              </div>
              <div className="input-group">
                <label>Categoría ER</label>
                <select className="select" value={form.categoria_er} onChange={e => setF('categoria_er', e.target.value)}>
                  {catOpts.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {capMap[form.categoria_er] && (
                  <div style={{
                    marginTop: 8, fontSize: 12, padding: '9px 12px', borderRadius: 7,
                    background: 'color-mix(in srgb, var(--orange) 8%, var(--surface))',
                    border: '1px solid color-mix(in srgb, var(--orange) 30%, var(--border))',
                    color: 'var(--fg)',
                  }}>
                    Los egresos de este tipo no aparecen como gasto en el ER. Se capitalizan como activo y su depreciación se registra mensualmente.
                  </div>
                )}
              </div>
              <div className="input-group">
                <label>Ícono</label>
                <div style={{ maxHeight: 260, overflowY: 'auto', paddingRight: 2 }}>
                  {ICONOS_GRUPOS.map(({ grupo, iconos }) => (
                    <div key={grupo}>
                      <div style={{ fontSize: 10, color: 'var(--fg-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 10, marginBottom: 5 }}>{grupo}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {iconos.map(name => (
                          <button
                            key={name} type="button" title={name}
                            onClick={() => setF('icono', name)}
                            style={{
                              width: 34, height: 34, borderRadius: 8, display: 'flex', flexShrink: 0,
                              alignItems: 'center', justifyContent: 'center',
                              border: `2px solid ${form.icono === name ? 'var(--cyan)' : 'var(--border)'}`,
                              background: form.icono === name ? 'color-mix(in srgb, var(--cyan) 12%, var(--surface))' : 'var(--surface)',
                            }}
                          >
                            <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icono(name)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="input-group">
                  <label>Orden</label>
                  <input className="input" type="number" min="0" value={form.orden} onChange={e => setF('orden', Number(e.target.value))} />
                </div>
                <div className="input-group">
                  <label>Estado</label>
                  <select className="select" value={form.activo ? 'activo' : 'inactivo'} onChange={e => setF('activo', e.target.value === 'activo')}>
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
                <button className="btn btn-secondary" type="button" onClick={() => setPanel(false)}>Cancelar</button>
                <button className="btn btn-primary" type="button" disabled={guardando || !form.nombre.trim()} onClick={guardar}>
                  {guardando ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
