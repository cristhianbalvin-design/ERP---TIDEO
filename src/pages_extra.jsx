import React, { useState, useEffect, useRef, useMemo } from 'react';
import BarcodeScanner from './components/BarcodeScanner.jsx';
import { I, money, moneyD } from './icons.jsx';
import { MOCK } from './data.js';
import { useApp } from './context.jsx';
import { getAssignableUsers, canUserSeeOwner, canUserApproveOwner } from './lib/hierarchy.js';
import { renderTextoComercial } from './lib/textoComercial.js';
import { SmartTextField } from './components/SmartTextField.jsx';
import { SociedadBadge, SociedadFormField, SociedadReadOnlyField } from './components/SociedadFormField.jsx';
import { resolverFiltroSociedadesVista } from './services/sociedadesService.js';
import { resolverSociedadDestino } from './services/sociedadDestinoService.js';
import { resolverIdentidadEmisora } from './services/identidadEmisoraService.js';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabaseClient.js';

const filtrarOpcionesPorSociedadEscritura = (opciones = [], sociedadIdEscritura) => (
  sociedadIdEscritura
    ? opciones.filter(opcion => opcion?.sociedad_id === sociedadIdEscritura)
    : opciones
);
const normalizeCurrencyCode = (m = 'PEN') => String(m || 'PEN').trim().toUpperCase();
const currencySymbol = (m = 'PEN') => {
  const code = normalizeCurrencyCode(m);
  if (code === 'USD') return 'US$';
  if (code === 'EUR') return '€';
  if (code === 'PEN') return 'S/';
  return code;
};
const moneyCurrency = (value, moneda = 'PEN') => money(value, currencySymbol(moneda));
const EMPRESA_ASSETS_BUCKET = 'empresa-assets';

const toCotNumber = (value, fallback = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (value == null || value === '') return fallback;
  let clean = String(value).trim().replace(/[^\d,.-]/g, '');
  if (!clean) return fallback;
  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    clean = lastComma > lastDot ? clean.replace(/\./g, '').replace(',', '.') : clean.replace(/,/g, '');
  } else if (lastComma > -1) {
    const parts = clean.split(',');
    clean = parts[parts.length - 1]?.length === 3 ? clean.replace(/,/g, '') : clean.replace(',', '.');
  } else if (lastDot > -1) {
    const parts = clean.split('.');
    clean = parts[parts.length - 1]?.length === 3 ? clean.replace(/\./g, '') : clean;
  }
  const num = Number(clean);
  return Number.isFinite(num) ? num : fallback;
};

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const rasterizeImageForPdf = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => {
    const maxWidth = 900;
    const maxHeight = 360;
    const width = img.naturalWidth || img.width || 1;
    const height = img.naturalHeight || img.height || 1;
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    resolve(canvas.toDataURL('image/png'));
  };
  img.onerror = reject;
  img.src = src;
});

const pdfReadyDataUrl = async (dataUrl) => {
  if (!dataUrl || /^data:image\/(?:png|jpe?g);/i.test(dataUrl)) return dataUrl;
  try {
    return await rasterizeImageForPdf(dataUrl);
  } catch {
    return dataUrl;
  }
};

const blobToPdfReadyDataUrl = async (blob) => {
  const dataUrl = await blobToDataUrl(blob);
  return pdfReadyDataUrl(dataUrl);
};

const empresaAssetPathFromUrl = (url) => {
  if (!url) return null;
  const clean = String(url).split('?')[0].split('#')[0];
  const markers = [
    `/storage/v1/object/public/${EMPRESA_ASSETS_BUCKET}/`,
    `/storage/v1/object/sign/${EMPRESA_ASSETS_BUCKET}/`,
  ];
  const marker = markers.find(m => clean.includes(m));
  if (!marker) return null;
  return decodeURIComponent(clean.slice(clean.indexOf(marker) + marker.length));
};

const pdfAssetSource = async ({ url, path }) => {
  const directUrl = typeof url === 'string' ? url.trim() : '';
  if (directUrl.startsWith('data:')) return pdfReadyDataUrl(directUrl);

  const storagePath = path || empresaAssetPathFromUrl(directUrl);
  if (storagePath && isSupabaseConfigured()) {
    try {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.storage.from(EMPRESA_ASSETS_BUCKET).download(storagePath);
      if (!error && data) return await blobToPdfReadyDataUrl(data);
    } catch {
      // Fallback to the public URL below.
    }
  }

  if (!directUrl) return null;
  try {
    const res = await fetch(directUrl, { cache: 'reload' });
    if (res.ok) return await blobToPdfReadyDataUrl(await res.blob());
  } catch {
    // React-PDF still gets a chance with the original URL.
  }
  return directUrl;
};

const construirPartidasDesdeHC = (hc) => {
  const margen = Math.min(Math.max(toCotNumber(hc.margen_objetivo_pct, 35), 0), 95) / 100;
  const divisor = 1 - margen;
  const descripcionItemHC = i => String(i?.descripcion || i?.nombre || i?.concepto || i?.item || '').trim();
  const esItemRealHC = i => {
    const desc = descripcionItemHC(i);
    if (!desc) return false;
    const meta = String(i?.tipo || i?.categoria || i?.seccion || i?.key || '').toLowerCase();
    return !['resumen', 'resumen_costeo', 'metadata', 'costo_total', 'subtotal', 'total'].includes(meta);
  };
  return [
    ...(hc.mano_obra || []),
    ...(hc.materiales || []),
    ...(hc.servicios_terceros || []),
    ...(hc.logistica || []),
  ].filter(esItemRealHC).map((i, idx) => {
    const cantidad = toCotNumber(i.cantidad);
    const costoUnitario = toCotNumber(i.costo_unitario ?? i.precio_unitario);
    const precioUnitario = divisor > 0 ? Math.round(costoUnitario / divisor) : costoUnitario;
    return {
      id: i.id || idx + 1,
      descripcion: descripcionItemHC(i),
      tipo: i.tipo === 'material' ? 'material' : 'servicio',
      cantidad,
      unidad: i.unidad || 'und',
      precio_unitario: precioUnitario,
      subtotal: cantidad * precioUnitario,
    };
  }).filter(p => p.cantidad > 0 || p.precio_unitario > 0);
};

// ============ COTIZACIONES ============

const COT_BADGE = e =>
  e === 'aprobada' || e === 'ganada' ? 'badge-green' :
  e === 'enviada' ? 'badge-cyan' :
  e === 'pendiente_aprobacion' ? 'badge-orange' :
  e === 'en_negociacion' ? 'badge-orange' :
  e === 'perdida' ? 'badge-red' :
  e === 'convertida' ? 'badge-navy' :
  'badge-gray';

function CotizacionesInner() {
  const {
    cotizaciones, oportunidades, cuentas, contactos, usuarios, osClientes, hojasCosteo, activeParams,
    navigate, crearCotizacion, actualizarCotizacion, aprobarCotizacion, aprobarCotizacionInterna, registrarAprobacionManual,
    crearOSCliente, vincularCotizacionOS, subirVersionCotizacion, searchQuery, empresaConfig, diccionarioComercial = [], addNotificacion,
    authUser, roles, empresa, perfilSociedad, sociedadesIdsAlcance, sociedadActiva, sociedadesDisponibles
  } = useApp();
  const [osModal, setOsModal] = useState(null);
  const [generandoPDF, setGenerandoPDF] = useState(false);
  const [filtros, setFiltros] = useState({ cliente: '', oportunidad: '', estado: '', fechaDesde: '', fechaHasta: '' });
  const modoVistaSociedadCotizaciones = resolverFiltroSociedadesVista({
    multisociedadHabilitado: empresa?.multisociedad_habilitado,
    perfilSociedad,
    sociedadActiva,
    sociedadesIdsAlcance,
    sociedadesDisponibles,
  });
  const mostrarBadgeSociedadCotizaciones = Boolean(
    empresa?.multisociedad_habilitado
    && !modoVistaSociedadCotizaciones.permiteEscritura
    && (modoVistaSociedadCotizaciones.sinFiltro || modoVistaSociedadCotizaciones.sociedadesIds.length > 0)
  );
  const sociedadesIdsVistaCotizacionesKey = modoVistaSociedadCotizaciones.sociedadesIds.join('|');
  const cotizacionesAlcance = useMemo(() => {
    if (modoVistaSociedadCotizaciones.sinFiltro) return cotizaciones;
    const permitidas = new Set(modoVistaSociedadCotizaciones.sociedadesIds);
    return cotizaciones.filter(cotizacion => cotizacion.sociedad_id && permitidas.has(cotizacion.sociedad_id));
  }, [cotizaciones, modoVistaSociedadCotizaciones.sinFiltro, sociedadesIdsVistaCotizacionesKey]);

  useEffect(() => {
    if (activeParams?.crear_os && activeParams?.detail) {
      const c = cotizacionesAlcance.find(x => x.id === activeParams.detail);
      if (c && c.estado === 'aprobada') setOsModal(c);
    }
  }, [activeParams?.crear_os, activeParams?.detail, cotizacionesAlcance]);

  const getOpp    = id => oportunidades.find(o => o.id === id);
  const getCuenta = id => cuentas.find(c => c.id === id);
  const getCuentaNombre = id => { const c = getCuenta(id); return c?.razon_social || c?.nombre_comercial || id || 'N/A'; };
  const getContacto = id => contactos?.find(c => c.id === id);

  // ── Nueva cotización ───────────────────────────────────────────────
  if (activeParams?.active_tab === 'nueva' && activeParams?.opp) {
    const opp = getOpp(activeParams.opp);
    if (!opp) return <div className="p-4">Oportunidad no encontrada</div>;
    if (!modoVistaSociedadCotizaciones.permiteEscritura) {
      const mensaje = 'Selecciona una sociedad concreta en el selector superior para crear una cotización desde una oportunidad.';
      return <div className="p-4"><div className="alert alert-warning">{mensaje}</div><button className="btn btn-secondary mt-4" onClick={() => navigate('pipeline', { panel: opp.id })}>Volver a la oportunidad</button></div>;
    }
    const hcBase = activeParams.hc_id ? (hojasCosteo || []).find(h => h.id === activeParams.hc_id) : null;
    const itemsHC = hcBase ? construirPartidasDesdeHC(hcBase) : [];
    const subtotalHC = itemsHC.reduce((s, p) => s + toCotNumber(p.subtotal ?? (toCotNumber(p.cantidad) * toCotNumber(p.precio_unitario))), 0);
    const igvHC = Math.round(subtotalHC * 18 / 100);
    const cotBaseDeHC = hcBase ? {
      moneda: opp.moneda || hcBase.moneda,
      igv_pct: 18,
      oportunidad_id: opp.id,
      cuenta_id: opp.cuenta_id,
      hoja_costeo_id: hcBase.id,
      subtotal: subtotalHC,
      base_imponible: subtotalHC,
      igv: igvHC,
      total: subtotalHC + igvHC,
      subtotal_impl: subtotalHC,
      igv_impl: igvHC,
      total_impl: subtotalHC + igvHC,
      items: itemsHC,
    } : null;
    return (
      <EditorCotizacion
        opp={opp}
        cuenta={getCuenta(opp.cuenta_id)}
        cotizacionBase={cotBaseDeHC}
        sociedadIdEscritura={modoVistaSociedadCotizaciones.sociedadIdEscritura}
        contactos={(contactos || []).filter(c => c.cuenta_id === opp.cuenta_id)}
        empresaConfig={empresaConfig}
        diccionarioComercial={diccionarioComercial}
        onSave={async (data) => { await crearCotizacion(data); navigate('cotizaciones'); }}
        onCancel={() => navigate('pipeline', { panel: opp.id })}
      />
    );
  }

  // ── Editar borrador ────────────────────────────────────────────────
  if (activeParams?.detail && activeParams?.edit) {
    const cot = cotizacionesAlcance.find(c => c.id === activeParams.detail);
    if (!cot) return <div className="p-4">Cotización no encontrada</div>;
    const opp = getOpp(cot.oportunidad_id);
    const cuentaId = cot.cuenta_id || opp?.cuenta_id;
    return (
      <EditorCotizacion
        opp={opp}
        cuenta={getCuenta(cuentaId)}
        cotizacionBase={cot}
        sociedadIdEscritura={modoVistaSociedadCotizaciones.sociedadIdEscritura}
        contactos={(contactos || []).filter(c => c.cuenta_id === cuentaId)}
        empresaConfig={empresaConfig}
        diccionarioComercial={diccionarioComercial}
        onSave={async (data) => { await actualizarCotizacion(cot.id, data); navigate('cotizaciones', { detail: cot.id }); }}
        onCancel={() => navigate('cotizaciones', { detail: cot.id })}
      />
    );
  }

  // ── Detalle ────────────────────────────────────────────────────────
  if (activeParams?.detail) {
    const cot = cotizacionesAlcance.find(c => c.id === activeParams.detail);
    if (!cot) return <div className="p-4">Cotización no encontrada</div>;
    const opp     = getOpp(cot.oportunidad_id);
    const cuenta  = getCuenta(cot.cuenta_id || opp?.cuenta_id);
    const contacto = getContacto(cot.contacto_id || opp?.contacto_id);

    const handleDescargarPDF = async () => {
      setGenerandoPDF(true);
      try {
        let token = cot.token_aceptacion;
        if (!token) {
          token = crypto.randomUUID();
          actualizarCotizacion(cot.id, { token_aceptacion: token, token_activo: true });
        }
        const sociedadCotizacion = cot.sociedad_id
          ? sociedadesDisponibles.find(sociedad => sociedad.id === cot.sociedad_id) || null
          : null;
        const cfg = resolverIdentidadEmisora({
          empresaConfig,
          sociedad: sociedadCotizacion,
          multisociedadHabilitado: empresa?.multisociedad_habilitado,
        });
        const [logoDataUrl, firmaDataUrl, QRCode] = await Promise.all([
          pdfAssetSource({ url: cfg.logo_url, path: cfg.logo_path }),
          pdfAssetSource({ url: cfg.firma_url, path: cfg.firma_path }),
          import('qrcode').then(m => m.default),
        ]);
        const aceptarUrl = (import.meta.env.VITE_APP_URL || window.location.origin) + '/#aceptar/' + token;
        const qrDataUrl = await QRCode.toDataURL(aceptarUrl, { width: 200, margin: 1 });
        const { pdf } = await import('@react-pdf/renderer');
        const { CotizacionPDF } = await import('./pages_pdf.jsx');
        const cfgPDF = {
          ...cfg,
          logo_url: logoDataUrl || cfg.logo_url || undefined,
          firma_url: firmaDataUrl || cfg.firma_url || undefined,
        };
        const blob = await pdf(
          <CotizacionPDF cot={cot} cuenta={cuenta} contacto={contacto} opp={opp} cfg={cfgPDF} qrDataUrl={qrDataUrl} />
        ).toBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${cot.numero}-v${cot.version || 1}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('[PDF]', err);
        addNotificacion('Error al generar el PDF: ' + (err?.message || err));
      } finally {
        setGenerandoPDF(false);
      }
    };

    return (
      <>
        <DetalleCotizacion
          cot={cot} opp={opp} cuenta={cuenta} contacto={contacto} usuarios={usuarios}
          empresaConfig={empresaConfig}
          onBack={() => navigate('cotizaciones')}
          onEdit={() => navigate('cotizaciones', { detail: cot.id, edit: true })}
          onRevertirBorrador={() => actualizarCotizacion(cot.id, { estado: 'borrador' })}
          onCrearVersion={async () => { await subirVersionCotizacion(cot.id); }}
          onEnviar={() => actualizarCotizacion(cot.id, { estado: 'enviada', fecha_envio: new Date().toISOString() })}
          onAprobarInterna={() => aprobarCotizacionInterna(cot.id)}
          onSolicitarAprobacion={() => actualizarCotizacion(cot.id, { estado: 'pendiente_aprobacion' })}
          onCancelarSolicitud={() => actualizarCotizacion(cot.id, { estado: 'borrador' })}
          onAprobar={() => { aprobarCotizacion(cot.id); setOsModal(cot); }}
          onAprobacionManual={async (datos) => { await registrarAprobacionManual(cot.id, datos); }}
          onGenerarOS={() => setOsModal(cot)}
          onDescargarPDF={handleDescargarPDF}
          generandoPDF={generandoPDF}
        />
        {osModal && (
          <CrearOSModal
            cot={osModal}
            opp={oportunidades.find(o => o.id === osModal.oportunidad_id)}
            osClientes={osClientes || []}
            cuentas={cuentas}
            sociedadIdEscritura={modoVistaSociedadCotizaciones.sociedadIdEscritura}
            onClose={() => setOsModal(null)}
            onCrearNueva={async (datos) => { await crearOSCliente(osModal.id, datos); setOsModal(null); }}
            onVincularExistente={async (osId) => { await vincularCotizacionOS(osModal.id, osId); setOsModal(null); }}
          />
        )}
      </>
    );
  }

  // ── Lista ──────────────────────────────────────────────────────────
  const query = searchQuery.toLowerCase();
  const latestPorNumero = Object.values(
    cotizacionesAlcance.reduce((acc, c) => {
      if (!acc[c.numero] || c.version > acc[c.numero].version) acc[c.numero] = c;
      return acc;
    }, {})
  ).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  const filtered = latestPorNumero.filter(c => {
    const opp = getOpp(c.oportunidad_id);
    const ownerUserId = c.responsable_id || opp?.responsable_id || null;
    const ownerName = opp?.responsable || null;
    if (!canUserSeeOwner({ viewer: authUser, ownerUserId, ownerName, users: usuarios, roles })) return false;
    const cliente = getCuentaNombre(c.cuenta_id || opp?.cuenta_id);
    if (query && !c.numero.toLowerCase().includes(query) && !cliente.toLowerCase().includes(query) && !(opp?.nombre || '').toLowerCase().includes(query)) return false;
    if (filtros.cliente && !cliente.toLowerCase().includes(filtros.cliente.toLowerCase())) return false;
    if (filtros.oportunidad && !(opp?.nombre || '').toLowerCase().includes(filtros.oportunidad.toLowerCase())) return false;
    if (filtros.estado && c.estado !== filtros.estado) return false;
    if (filtros.fechaDesde && (c.fecha || '') < filtros.fechaDesde) return false;
    if (filtros.fechaHasta && (c.fecha || '') > filtros.fechaHasta) return false;
    return true;
  });
  const filtrosActivos = Object.values(filtros).some(v => v !== '');

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cotizaciones</h1>
          <div className="page-sub">{latestPorNumero.length} cotizaciones registradas</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto auto', gap: 8, marginBottom: 16 }}>
        <input className="input" placeholder="Buscar por cliente…" value={filtros.cliente} onChange={e => setFiltros(f => ({...f, cliente: e.target.value}))} />
        <input className="input" placeholder="Buscar por oportunidad…" value={filtros.oportunidad} onChange={e => setFiltros(f => ({...f, oportunidad: e.target.value}))} />
        <select className="select" value={filtros.estado} onChange={e => setFiltros(f => ({...f, estado: e.target.value}))}>
          <option value="">Todos los estados</option>
          <option value="borrador">Borrador</option>
          <option value="enviada">Enviada</option>
          <option value="pendiente_aprobacion">Pendiente aprobación</option>
          <option value="aprobada">Aprobada</option>
          <option value="aceptada">Aceptada</option>
          <option value="convertida">Convertida</option>
          <option value="perdida">Perdida</option>
        </select>
        <input type="date" className="input" value={filtros.fechaDesde} onChange={e => setFiltros(f => ({...f, fechaDesde: e.target.value}))} />
        <input type="date" className="input" value={filtros.fechaHasta} onChange={e => setFiltros(f => ({...f, fechaHasta: e.target.value}))} />
        {filtrosActivos && (
          <button className="btn btn-secondary" onClick={() => setFiltros({ cliente: '', oportunidad: '', estado: '', fechaDesde: '', fechaHasta: '' })}>Limpiar</button>
        )}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Número</th>{mostrarBadgeSociedadCotizaciones && <th>Sociedad</th>}<th>Cliente</th><th>Oportunidad</th><th>Implementación</th><th>Recurrente/mes</th><th>Fecha</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const opp = getOpp(r.oportunidad_id);
                const cliente = getCuentaNombre(r.cuenta_id || opp?.cuenta_id);
                const impl = r.total_impl || r.total || 0;
                const rec  = r.total_rec || 0;
                return (
                  <tr key={r.id} onClick={() => navigate('cotizaciones', { detail: r.id })} className="hover-row" style={{cursor:'pointer'}}>
                    <td className="mono" style={{fontWeight:600}}>
                      {r.numero}
                      {r.version > 1 && <span className="badge badge-gray" style={{marginLeft:6, fontSize:10, verticalAlign:'middle'}}>v{r.version}</span>}
                    </td>
                    {mostrarBadgeSociedadCotizaciones && <td><SociedadBadge sociedadId={r.sociedad_id} /></td>}
                    <td><strong>{cliente}</strong></td>
                    <td className="text-muted">{opp?.nombre || '—'}</td>
                    <td className="num"><strong>{money(impl, currencySymbol(r.moneda))}</strong></td>
                    <td className="num text-muted">{rec > 0 ? money(rec, currencySymbol(r.moneda)) : '—'}</td>
                    <td className="text-muted">{r.fecha}</td>
                    <td><span className={'badge ' + COT_BADGE(r.estado)}>{r.estado?.replace('_', ' ')}</span></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={mostrarBadgeSociedadCotizaciones ? 8 : 7} style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>
                  {query ? `No se encontraron resultados para "${query}"` : 'No hay cotizaciones registradas.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── QR de aceptación ───────────────────────────────────────────────────
function QRBlock({ token }) {
  const [dataUrl, setDataUrl] = useState(null);
  useEffect(() => {
    if (!token) return;
    const url = (import.meta.env.VITE_APP_URL || window.location.origin) + '/#aceptar/' + token;
    import('qrcode').then(m => m.default.toDataURL(url, { width: 140, margin: 1 })).then(setDataUrl);
  }, [token]);
  return (
    <div style={{textAlign:'center'}}>
      {dataUrl
        ? <img src={dataUrl} alt="QR aceptación" style={{width:120, height:120, border:'1px solid var(--border)', borderRadius:8}}/>
        : <div style={{width:120, height:120, background:'var(--bg-subtle)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'var(--fg-muted)'}}>Generando QR…</div>
      }
      <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:6}}>Escanear para aceptar</div>
    </div>
  );
}

// ── Modal aprobación manual ─────────────────────────────────────────────
const CANALES_APROBACION = [
  'Aprobado por email',
  'Aprobado por WhatsApp',
  'Aprobado en reunión',
  'Aprobado con firma física',
  'Otro',
];

const EVIDENCIA_APROBACION_MIMES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const EVIDENCIA_APROBACION_EXTS = ['.pdf', '.jpg', '.jpeg', '.png'];
const EVIDENCIA_APROBACION_ACCEPT = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
].join(',');
const EVIDENCIA_APROBACION_MAX_BYTES = 10 * 1024 * 1024;

const esEvidenciaAprobacionPermitida = (file) => {
  const tipo = String(file?.type || '').toLowerCase();
  const nombre = String(file?.name || '').toLowerCase();
  return EVIDENCIA_APROBACION_MIMES.includes(tipo) ||
    EVIDENCIA_APROBACION_EXTS.some(ext => nombre.endsWith(ext));
};

const esCanalAprobacionReunion = canal =>
  String(canal || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'aprobado en reunion';

function AprobacionManualModal({ onClose, onConfirmar }) {
  const hoy = new Date().toISOString().split('T')[0];
  const [canal, setCanal]     = useState('');
  const [fecha, setFecha]     = useState(hoy);
  const [notas, setNotas]     = useState('');
  const [archivos, setArchivos] = useState([]);
  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(false);

  const agregarArchivos = (e) => {
    const seleccionados = Array.from(e.target.files || []);
    const validos = seleccionados.filter(file =>
      esEvidenciaAprobacionPermitida(file) &&
      Number(file.size || 0) <= EVIDENCIA_APROBACION_MAX_BYTES
    );
    const noPermitidos = seleccionados.filter(file => !esEvidenciaAprobacionPermitida(file));
    const muyPesados = seleccionados.filter(file =>
      esEvidenciaAprobacionPermitida(file) &&
      Number(file.size || 0) > EVIDENCIA_APROBACION_MAX_BYTES
    );

    if (validos.length) setArchivos(prev => [...prev, ...validos]);
    if (noPermitidos.length || muyPesados.length) {
      const partes = [];
      if (noPermitidos.length) partes.push('Solo se permiten archivos PDF, JPG, JPEG o PNG.');
      if (muyPesados.length) partes.push('Cada archivo debe pesar como maximo 10 MB.');
      setError(partes.join(' '));
    } else if (validos.length) {
      setError(null);
    }
    e.target.value = '';
  };
  const quitarArchivo = (i) => setArchivos(prev => prev.filter((_, idx) => idx !== i));

  const handleConfirmar = async () => {
    const canalEsReunion = esCanalAprobacionReunion(canal);
    const notasTrim = notas.trim();
    if (!canal) { setError('Selecciona el canal de aprobación.'); return; }
    if (!fecha) { setError('Indica la fecha de aprobación del cliente.'); return; }
    if (canalEsReunion && !notasTrim) { setError('Ingresa notas adicionales para una aprobacion en reunion.'); return; }
    if (!canalEsReunion && !archivos.length) { setError('Adjunta la evidencia de aprobacion del cliente.'); return; }
    if (archivos.some(file => !esEvidenciaAprobacionPermitida(file))) {
      setError('Solo se permiten archivos PDF, JPG, JPEG o PNG.');
      return;
    }
    if (archivos.some(file => Number(file.size || 0) > EVIDENCIA_APROBACION_MAX_BYTES)) {
      setError('Cada archivo debe pesar como maximo 10 MB.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onConfirmar({ canal, fecha_cliente: fecha, notas: notasTrim || null, archivos });
    } catch (err) {
      setError(err?.message || 'No se pudo registrar la aprobacion.');
    } finally {
      setLoading(false);
    }
  };

  const canalEsReunion = esCanalAprobacionReunion(canal);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{maxWidth:540, width:'100%'}} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2 style={{fontSize:16}}>Registrar aprobación del cliente</h2>
          <button className="icon-btn" onClick={onClose}>{I.x}</button>
        </div>
        <div className="modal-body" style={{display:'flex', flexDirection:'column', gap:16}}>
          <div className="input-group" style={{margin:0}}>
            <label>Canal de aprobación *</label>
            <select className="input" value={canal} onChange={e => { setCanal(e.target.value); setError(null); }}>
              <option value="">Selecciona un canal…</option>
              {CANALES_APROBACION.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="input-group" style={{margin:0}}>
            <label>Fecha de aprobación del cliente *</label>
            <input type="date" className="input" value={fecha} max={hoy}
              onChange={e => { setFecha(e.target.value); setError(null); }} />
          </div>
          <div className="input-group" style={{margin:0}}>
            <label>Notas adicionales{canalEsReunion ? ' *' : ''}</label>
            <textarea className="input" rows={3} value={notas} onChange={e => { setNotas(e.target.value); setError(null); }}
              placeholder="Contexto sobre cómo se dio la aprobación…" />
          </div>
          <div className="input-group" style={{margin:0}}>
            <label>Adjuntar sustento{canalEsReunion ? ' (opcional)' : ' *'}</label>
            <label style={{display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:6, border:'1px dashed var(--border)', cursor:'pointer', fontSize:13, color:'var(--fg-muted)', background:'var(--bg-subtle)'}}>
              {I.file} Seleccionar archivos (PDF, JPG o PNG)
              <input type="file" multiple accept={EVIDENCIA_APROBACION_ACCEPT} onChange={agregarArchivos} style={{display:'none'}} />
            </label>
            {archivos.length > 0 && (
              <div style={{marginTop:8, display:'flex', flexDirection:'column', gap:5}}>
                {archivos.map((f, i) => (
                  <div key={i} style={{display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:'var(--bg-subtle)', borderRadius:6, fontSize:13}}>
                    <span style={{flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{f.name}</span>
                    <span style={{fontSize:11, color:'var(--fg-muted)', flexShrink:0}}>{(f.size/1024).toFixed(0)} KB</span>
                    <button onClick={() => quitarArchivo(i)} style={{background:'none', border:'none', cursor:'pointer', color:'var(--danger)', padding:0, lineHeight:1, fontSize:16}}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {error && <div style={{color:'var(--danger)', fontSize:13, padding:'8px 12px', background:'#fff0f0', borderRadius:6}}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleConfirmar} disabled={loading}>
            {loading ? 'Registrando…' : 'Confirmar aprobación'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detalle (lectura) ──────────────────────────────────────────────────
function DetalleCotizacion({ cot, opp, cuenta, contacto, usuarios, empresaConfig, onBack, onEdit, onRevertirBorrador, onCrearVersion, onEnviar, onAprobarInterna, onSolicitarAprobacion, onCancelarSolicitud, onAprobacionManual, onGenerarOS, onDescargarPDF, generandoPDF }) {
  const partidas = cot.items || cot.partidas || [];
  const hayRecurrente = partidas.some(p => !p.incluido && p.tipo === 'recurrente');
  const [seccionesOpen, setSeccionesOpen] = useState({});
  const toggleSeccion = k => setSeccionesOpen(p => ({ ...p, [k]: !p[k] }));
  const [confirmEnviar, setConfirmEnviar] = useState(false);
  const [showAprobModal, setShowAprobModal] = useState(false);
  const sym = currencySymbol(cot.moneda);
  const calcDetalleTotal = p => toCotNumber(p.total) || (toCotNumber(p.cantidad) * toCotNumber(p.precio_unitario));
  const subtotalDetalleImpl = partidas
    .filter(p => !p.incluido && p.tipo !== 'recurrente')
    .reduce((s, p) => s + calcDetalleTotal(p), 0);
  const subtotalDetalleRec = partidas
    .filter(p => !p.incluido && p.tipo === 'recurrente')
    .reduce((s, p) => s + calcDetalleTotal(p), 0);
  const usarTotalesPartidasHC = !!cot.hoja_costeo_id && subtotalDetalleImpl > 0 && (
    toCotNumber(cot.subtotal_impl ?? cot.subtotal) <= 0 || toCotNumber(cot.total_impl ?? cot.total) <= 0
  );
  const usarTotalesRecPartidasHC = !!cot.hoja_costeo_id && subtotalDetalleRec > 0 && (
    toCotNumber(cot.subtotal_rec) <= 0 || toCotNumber(cot.total_rec) <= 0
  );
  const subtotalImplDetalle = usarTotalesPartidasHC ? subtotalDetalleImpl : (cot.subtotal_impl ?? cot.subtotal);
  const igvImplDetalle = usarTotalesPartidasHC ? Math.round(subtotalDetalleImpl * toCotNumber(cot.igv_pct || 18) / 100) : (cot.igv_impl ?? cot.igv);
  const totalImplDetalle = usarTotalesPartidasHC ? subtotalImplDetalle + igvImplDetalle : (cot.total_impl ?? cot.total);
  const subtotalRecDetalle = usarTotalesRecPartidasHC ? subtotalDetalleRec : cot.subtotal_rec;
  const igvRecDetalle = usarTotalesRecPartidasHC ? Math.round(subtotalDetalleRec * toCotNumber(cot.igv_pct || 18) / 100) : cot.igv_rec;
  const totalRecDetalle = usarTotalesRecPartidasHC ? subtotalRecDetalle + igvRecDetalle : cot.total_rec;

  const { authUser, role } = useApp();
  const cfg = empresaConfig || {};
  const textoCtx = { empresa: cfg, cuenta, cliente: cuenta, contacto, cotizacion: cot, oportunidad: opp };
  const renderComercial = texto => renderTextoComercial(texto, textoCtx);

  const puedeAprobarCot     = role?.permisos?.todo || role?.permisos?.aprobar_descuentos || false;
  const aprobadaInterna     = !!cot.aprobada_interna_por;
  const esBorrador          = cot.estado === 'borrador';
  const esPendiente         = cot.estado === 'pendiente_aprobacion';
  const puedeEditar         = esBorrador && (puedeAprobarCot || !aprobadaInterna);
  const puedeEnviar         = esBorrador && (puedeAprobarCot || aprobadaInterna);
  const mostrarAprobarBtn   = puedeAprobarCot && (esBorrador || esPendiente) && !aprobadaInterna;
  const mostrarSolicitarBtn = !puedeAprobarCot && esBorrador && !aprobadaInterna;

  const vendedor = opp?.responsable_id
    ? (usuarios || []).find(u => u.id === opp.responsable_id)
    : null;
  const vendedorNombre = vendedor?.nombre || opp?.responsable || '—';
  // Fallback: si el responsable es el usuario logueado y no está en la lista (ej. asesor sin permiso de listar usuarios)
  const vendedorEmail = vendedor?.email || (opp?.responsable_id === authUser?.id ? authUser?.email : null) || null;

  const validezTexto = () => {
    if (cot.validez_tipo === 'fecha_exacta' && cot.validez_fecha)
      return `Válida únicamente el día de hoy — ${cot.validez_fecha}`;
    if (cot.validez_dias) return `${cot.validez_dias} días`;
    return cot.validez || '—';
  };

  const COND_SECTIONS = [
    ['cond_forma_pago', 'Forma de pago y datos bancarios'],
    ['cond_validez', 'Validez de la oferta'],
    ['cond_penalidad', 'Penalidad por mora'],
    ['cond_inicio_proyecto', 'Inicio del proyecto'],
    ['cond_alcance', 'Alcance y exclusiones'],
    ['cond_integraciones', 'Integraciones externas'],
    ['cond_confidencialidad', 'Confidencialidad'],
  ].filter(([k]) => cot[k] || cfg[k]);

  const historial = cot.historial_versiones || [];

  return (
    <>
      <div className="page-header" style={{borderBottom:'none', paddingBottom:0}}>
        <div>
          <button className="btn btn-ghost" onClick={onBack} style={{marginBottom:10, padding:0, color:'var(--cyan)'}}>← Volver a lista</button>
          <h1 className="page-title row" style={{gap:10, alignItems:'center'}}>
            {cot.numero}
            <span className="badge badge-gray" style={{fontSize:12}}>v{cot.version || 1}</span>
            <span className={'badge ' + COT_BADGE(cot.estado)}>{cot.estado?.replace('_', ' ')}</span>
          </h1>
          <div className="page-sub">
            {opp?.nombre && <>Oportunidad: <strong>{opp.nombre}</strong> · </>}
            Cliente: <strong>{cuenta?.razon_social || cuenta?.nombre_comercial || '—'}</strong>
            {cuenta?.ruc && <> · RUC: {cuenta.ruc}</>}
          </div>
        </div>
        <div className="row">
          {puedeEditar && <button className="btn btn-secondary" onClick={onEdit}>{I.edit} Editar</button>}
          {mostrarSolicitarBtn && (
            <button className="btn btn-secondary" onClick={onSolicitarAprobacion} style={{color:'var(--orange)', borderColor:'var(--orange)'}}>
              ⏫ Solicitar aprobación
            </button>
          )}
          {esPendiente && !puedeAprobarCot && (
            <button className="btn btn-ghost" onClick={onCancelarSolicitud} style={{color:'var(--fg-muted)'}}>
              ✕ Cancelar solicitud
            </button>
          )}
          {mostrarAprobarBtn && (
            <button className="btn btn-secondary" onClick={onAprobarInterna} style={{color:'var(--cyan)', borderColor:'var(--cyan)'}}>
              ✓ Aprobar para envío
            </button>
          )}
          {esBorrador && (
            <button
              className="btn btn-primary"
              onClick={() => setConfirmEnviar(true)}
              disabled={!puedeEnviar}
              title={!puedeEnviar ? 'Pendiente de aprobación del jefe comercial' : ''}
              style={!puedeEnviar ? {opacity:0.45, cursor:'not-allowed'} : {}}
            >
              {I.send} Enviar a cliente
            </button>
          )}
          {cot.estado === 'enviada' && puedeAprobarCot && <button className="btn btn-ghost" onClick={onRevertirBorrador} style={{color:'var(--text-muted)'}}>↩ Revertir a borrador</button>}
          {cot.estado === 'enviada' && <button className="btn btn-secondary" onClick={() => setShowAprobModal(true)}>{I.check} Aprobar manualmente</button>}
          {cot.estado === 'aprobada' && <button className="btn btn-primary" onClick={onGenerarOS}>{I.clipboard} Generar OS</button>}
          {puedeAprobarCot && <button className="btn btn-secondary" onClick={onCrearVersion}>{I.plus} Nueva versión</button>}
          <button className="btn btn-secondary" onClick={onDescargarPDF} disabled={generandoPDF}>{I.download} {generandoPDF ? 'Generando…' : 'PDF'}</button>
        </div>
      </div>

      {/* Bloque 1 — Encabezado */}
      <div className="card mt-6">
        <div className="card-body">
          {/* Fila 1: datos del documento */}
          <div className="grid-4" style={{marginBottom:16}}>
            <div><div className="eyebrow">Fecha emisión</div><div style={{fontWeight:600, marginTop:4}}>{cot.fecha}</div></div>
            <div><div className="eyebrow">Moneda</div><div style={{fontWeight:600, marginTop:4}}>{cot.moneda}</div></div>
            <div><div className="eyebrow">Validez</div><div style={{fontWeight:600, marginTop:4}}>{validezTexto()}</div></div>
            <div><div className="eyebrow">Attn. (contacto cliente)</div><div style={{fontWeight:600, marginTop:4}}>{contacto?.nombre || '—'}</div></div>
          </div>
          {/* Fila 2: datos internos */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, paddingTop:14, borderTop:'1px solid var(--border)'}}>
            <div>
              <div className="eyebrow">Vendedor responsable</div>
              <div style={{fontWeight:600, marginTop:4}}>{vendedorNombre}</div>
            </div>
            <div>
              <div className="eyebrow">Email vendedor</div>
              <div style={{marginTop:4}}>
                {vendedorEmail
                  ? <a href={`mailto:${vendedorEmail}`} style={{color:'var(--cyan)', textDecoration:'none', fontWeight:600}}>{vendedorEmail}</a>
                  : <span style={{color:'var(--fg-muted)'}}>—</span>}
              </div>
            </div>
            <div>
              <div className="eyebrow">Enviada al cliente</div>
              <div style={{fontWeight:600, marginTop:4}}>
                {cot.fecha_envio ? new Date(cot.fecha_envio).toLocaleString('es-PE') : <span style={{color:'var(--fg-muted)'}}>—</span>}
              </div>
            </div>
          </div>
          {esBorrador && !aprobadaInterna && !puedeAprobarCot && (
            <div style={{marginTop:14, padding:'10px 14px', background:'#fff8e1', borderRadius:8, borderLeft:'3px solid #f59e0b', fontSize:13, color:'#92400e', display:'flex', alignItems:'center', gap:8}}>
              ⏳ <span>Usa <strong>Solicitar aprobación</strong> para que la jefatura comercial revise esta cotización antes de enviarla al cliente.</span>
            </div>
          )}
          {esPendiente && (
            <div style={{marginTop:14, padding:'10px 14px', background:'#fff7ed', borderRadius:8, borderLeft:'3px solid var(--orange)', fontSize:13, color:'#9a3412', display:'flex', alignItems:'center', gap:8}}>
              ⏳ <span><strong>Pendiente de revisión</strong> — la jefatura comercial debe aprobar esta cotización para que puedas enviarla al cliente.{puedeAprobarCot ? ' Usa el botón "Aprobar para envío" de arriba.' : ''}</span>
            </div>
          )}
          {aprobadaInterna && (
            <div style={{marginTop:14, padding:'10px 14px', background:'#f0fdf4', borderRadius:8, borderLeft:'3px solid var(--green)', fontSize:13, color:'#166534', display:'flex', alignItems:'center', gap:8}}>
              ✓ <span>Aprobada para envío por <strong>{cot.aprobada_interna_por}</strong>{cot.aprobada_interna_at ? ` · ${new Date(cot.aprobada_interna_at).toLocaleDateString('es-PE')}` : ''}</span>
            </div>
          )}
          {cot.descripcion_general && (
            <div style={{marginTop:16, padding:'12px 16px', background:'var(--bg-subtle)', borderRadius:8, borderLeft:'3px solid var(--cyan)', fontSize:14, lineHeight:'1.6'}}>
              {renderComercial(cot.descripcion_general)}
            </div>
          )}
        </div>
      </div>

      {/* Bloque 2 — Partidas */}
      <div className="card mt-4">
        <div className="card-body">
          <h3 style={{marginBottom:16, paddingBottom:8, borderBottom:'1px solid var(--border)'}}>Partidas</h3>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th style={{width:36}}>N°</th><th>Descripción</th><th>Tipo</th><th style={{width:70}}>Cant.</th><th style={{width:110}}>Det. cant.</th><th style={{width:130}}>P. Unit.</th><th style={{width:120}}>Total</th></tr>
              </thead>
              <tbody>
                {partidas.map((p, i) => (
                  <tr key={p.id || i}>
                    <td className="num text-muted">{p.n || i + 1}</td>
                    <td>
                      <div style={{fontWeight:600}}>{renderComercial(p.descripcion) || 'Sin descripción'}</div>
                      {(Array.isArray(p.detalle_items) ? p.detalle_items : []).length > 0 && (
                        <ul style={{margin:'4px 0 0 16px', padding:0, fontSize:12, color:'var(--fg-muted)', lineHeight:'1.5'}}>
                          {p.detalle_items.map((d, j) => <li key={j}>{renderComercial(d)}</li>)}
                        </ul>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${p.tipo==='recurrente'?'badge-purple':p.tipo==='bien'?'badge-orange':'badge-cyan'}`}>
                        {p.tipo || 'servicio'}
                      </span>
                    </td>
                    <td className="num">{p.cantidad}</td>
                    <td className="text-muted" style={{fontSize:12}}>{renderComercial(p.detalle_cantidad) || '—'}</td>
                    <td className="num">{p.incluido ? <span className="badge badge-gray">Incluido</span> : money(p.precio_unitario || 0, sym)}</td>
                    <td className="num" style={{fontWeight:600}}>{p.incluido ? '—' : money(p.total || (p.cantidad * p.precio_unitario), sym)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bloque 3 — Totales */}
      <div className="card mt-4">
        <div className="card-body">
          <div className={hayRecurrente ? 'grid-2' : ''} style={{gap:24, maxWidth: hayRecurrente ? '100%' : 380, marginLeft:'auto'}}>
            <div>
              {hayRecurrente && <div className="eyebrow" style={{marginBottom:12}}>Implementación</div>}
              <TotalesBox subtotal={subtotalImplDetalle} igvPct={cot.igv_pct || 18} igv={igvImplDetalle} total={totalImplDetalle} sym={sym} />
            </div>
            {hayRecurrente && (
              <div>
                <div className="eyebrow" style={{marginBottom:12}}>Recurrente mensual</div>
                <TotalesBox subtotal={subtotalRecDetalle} igvPct={cot.igv_pct || 18} igv={igvRecDetalle} total={totalRecDetalle} suffix="/mes" sym={sym} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bloque 4 — Hitos de pago */}
      {cot.hitos_activos && (cot.hitos_pago || []).length > 0 && (
        <div className="card mt-4">
          <div className="card-body">
            <h3 style={{marginBottom:16, paddingBottom:8, borderBottom:'1px solid var(--border)'}}>Hitos de pago</h3>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>N°</th><th>Concepto</th><th>%</th><th>Monto</th><th>Condición / vencimiento</th></tr></thead>
                <tbody>
                  {cot.hitos_pago.map((h, i) => (
                    <tr key={h.id || i}>
                      <td className="num text-muted">{i + 1}</td>
                      <td style={{fontWeight:600}}>{renderComercial(h.concepto)}</td>
                      <td className="num">{h.porcentaje}%</td>
                      <td className="num" style={{fontWeight:600}}>{money(h.monto, sym)}</td>
                      <td className="text-muted" style={{fontSize:13}}>{renderComercial(h.condicion) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cot.glosa_factura && (
              <div style={{marginTop:16, padding:'10px 14px', background:'var(--bg-subtle)', borderRadius:8, fontSize:13}}>
                <div className="eyebrow" style={{marginBottom:4}}>Glosa recomendada para facturas</div>
                {renderComercial(cot.glosa_factura)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bloque 5 — Condiciones comerciales */}
      {COND_SECTIONS.length > 0 && (
        <div className="card mt-4">
          <div className="card-body">
            <h3 style={{marginBottom:16, paddingBottom:8, borderBottom:'1px solid var(--border)'}}>Condiciones comerciales</h3>
            {COND_SECTIONS.map(([key, label]) => {
              const texto = renderComercial(cot[key] || cfg[key]);
              if (!texto) return null;
              const open = seccionesOpen[key] !== false;
              return (
                <div key={key} style={{marginBottom:10, border:'1px solid var(--border)', borderRadius:8, overflow:'hidden'}}>
                  <button type="button"
                    style={{width:'100%', textAlign:'left', padding:'10px 14px', background:'var(--bg-subtle)', border:'none', cursor:'pointer', fontWeight:600, fontSize:14, display:'flex', justifyContent:'space-between'}}
                    onClick={() => toggleSeccion(key)}>
                    {label}<span style={{color:'var(--fg-muted)', fontSize:12}}>{open ? '▲' : '▼'}</span>
                  </button>
                  {open && <div style={{padding:'10px 14px', fontSize:13, lineHeight:'1.6', whiteSpace:'pre-wrap'}}>{texto}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bloque 6 — Firmas */}
      <div className="card mt-4">
        <div className="card-body">
          <h3 style={{marginBottom:16, paddingBottom:8, borderBottom:'1px solid var(--border)'}}>Página de cierre — Firmas</h3>
          <div className="grid-2" style={{gap:40}}>
            <div style={{textAlign:'center', padding:20, border:'1px dashed var(--border)', borderRadius:8}}>
              <div className="eyebrow" style={{marginBottom:12}}>Por {cfg.razon_social || 'TIDEO'}</div>
              {cfg.firma_url && <img src={cfg.firma_url} alt="Firma" style={{maxHeight:60, marginBottom:8, display:'block', margin:'0 auto 8px'}} />}
              <div style={{borderTop:'1px solid var(--border-strong)', paddingTop:8, fontWeight:600}}>{cfg.firmante || '(sin configurar)'}</div>
              <div style={{fontSize:12, color:'var(--fg-muted)'}}>{cfg.cargo_firmante}</div>
              <div style={{fontSize:12, color:'var(--fg-muted)'}}>{cfg.email_comercial}</div>
            </div>
            <div style={{textAlign:'center', padding:20, border:'1px dashed var(--border)', borderRadius:8}}>
              <div className="eyebrow" style={{marginBottom:12}}>Por {cuenta?.razon_social || cuenta?.nombre_comercial || 'Cliente'}</div>
              <div style={{height:60, display:'flex', alignItems:'flex-end', justifyContent:'center'}}>
                <div style={{width:'80%', borderBottom:'1px solid var(--border-strong)'}}></div>
              </div>
              <div style={{paddingTop:8, fontWeight:600}}>{contacto?.nombre || '—'}</div>
              <div style={{fontSize:12, color:'var(--fg-muted)'}}>Sello y firma</div>
              <div style={{marginTop:8, width:'50%', margin:'8px auto 0', borderBottom:'1px solid var(--border)', paddingBottom:4, fontSize:12, color:'var(--fg-muted)'}}>Fecha</div>
            </div>
          </div>
        </div>
      </div>

      {/* QR de aceptación digital */}
      {cot.token_aceptacion && cot.token_activo !== false && !cot.aceptacion_fecha && (
        <div className="card mt-4">
          <div className="card-body row" style={{gap:24, alignItems:'flex-start', flexWrap:'wrap'}}>
            <div style={{flex:1, minWidth:220}}>
              <h3 style={{marginBottom:6}}>Aceptación digital</h3>
              <div className="text-muted" style={{fontSize:13, lineHeight:1.6}}>
                El cliente puede escanear el código QR para revisar y aceptar la cotización digitalmente desde su dispositivo. No necesita cuenta en el sistema.
              </div>
              <div style={{marginTop:12, padding:'8px 12px', background:'var(--bg-subtle)', borderRadius:6, fontSize:12, fontFamily:'monospace', wordBreak:'break-all', color:'var(--fg-muted)'}}>
                {window.location.origin}/#aceptar/{cot.token_aceptacion}
              </div>
            </div>
            <QRBlock token={cot.token_aceptacion} />
          </div>
        </div>
      )}

      {/* Bloque: Aprobación digital (vía QR) */}
      {cot.aceptacion_fecha && (
        <div className="card mt-4" style={{borderLeft:'4px solid var(--green)'}}>
          <div className="card-body">
            <div className="row" style={{alignItems:'center', gap:10, marginBottom:12}}>
              <h3 style={{margin:0, color:'var(--green)'}}>✓ Aprobación registrada</h3>
              <span className="badge badge-green">Aprobación digital</span>
            </div>
            <div className="grid-4" style={{fontSize:13}}>
              <div><div className="eyebrow">Aceptado por</div><div style={{fontWeight:600, marginTop:4}}>{cot.aceptacion_nombre || '—'}</div></div>
              <div><div className="eyebrow">DNI</div><div style={{fontWeight:600, marginTop:4}}>{cot.aceptacion_dni || '—'}</div></div>
              <div><div className="eyebrow">Fecha y hora</div><div style={{fontWeight:600, marginTop:4}}>{new Date(cot.aceptacion_fecha).toLocaleString('es-PE')}</div></div>
              <div><div className="eyebrow">IP registrada</div><div style={{fontWeight:600, marginTop:4, fontSize:11, fontFamily:'monospace'}}>{cot.aceptacion_ip || '—'}</div></div>
            </div>
          </div>
        </div>
      )}

      {/* Bloque: Aprobación manual (registrada por vendedor) */}
      {cot.aprobacion_tipo === 'manual' && (
        <div className="card mt-4" style={{borderLeft:'4px solid var(--green)'}}>
          <div className="card-body">
            <div className="row" style={{alignItems:'center', gap:10, marginBottom:16}}>
              <h3 style={{margin:0, color:'var(--green)'}}>✓ Aprobación registrada</h3>
              <span className="badge badge-cyan">Aprobación manual</span>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, fontSize:13}}>
              <div><div className="eyebrow">Canal</div><div style={{fontWeight:600, marginTop:4}}>{cot.aprobacion_canal || '—'}</div></div>
              <div><div className="eyebrow">Fecha aprobación cliente</div><div style={{fontWeight:600, marginTop:4}}>{cot.aprobacion_fecha_cliente || '—'}</div></div>
              <div><div className="eyebrow">Registrado por</div><div style={{fontWeight:600, marginTop:4}}>{cot.aprobacion_registrada_por || '—'}</div></div>
              <div><div className="eyebrow">Fecha y hora de registro</div><div style={{fontWeight:600, marginTop:4}}>{cot.aprobacion_registrada_at ? new Date(cot.aprobacion_registrada_at).toLocaleString('es-PE') : '—'}</div></div>
              {cot.aprobacion_notas && (
                <div style={{gridColumn:'span 2'}}><div className="eyebrow">Notas</div><div style={{marginTop:4}}>{cot.aprobacion_notas}</div></div>
              )}
            </div>
            {(cot.aprobacion_archivos || []).length > 0 && (
              <div style={{marginTop:14}}>
                <div className="eyebrow" style={{marginBottom:8}}>Archivos adjuntos</div>
                <div style={{display:'flex', flexDirection:'column', gap:6}}>
                  {(cot.aprobacion_archivos || []).map((a, i) => (
                    <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                      style={{display:'flex', alignItems:'center', gap:8, padding:'7px 12px', background:'var(--bg-subtle)', borderRadius:6, fontSize:13, textDecoration:'none', color:'var(--cyan)'}}>
                      {I.download}
                      <span style={{flex:1}}>{a.nombre}</span>
                      <span style={{fontSize:11, color:'var(--fg-muted)'}}>{a.tamanio ? (a.tamanio/1024).toFixed(0)+' KB' : ''}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Aprobar manualmente */}
      {showAprobModal && (
        <AprobacionManualModal
          onClose={() => setShowAprobModal(false)}
          onConfirmar={async (datos) => {
            await onAprobacionManual(datos);
            setShowAprobModal(false);
          }}
        />
      )}

      {/* Historial de versiones */}
      {historial.length > 0 && (
        <div className="card mt-4">
          <div className="card-body">
            <h3 style={{marginBottom:12, paddingBottom:8, borderBottom:'1px solid var(--border)'}}>Historial de versiones</h3>
            {historial.map((h, i) => (
              <div key={i} className="row" style={{justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border-subtle)', fontSize:13}}>
                <span className="badge badge-gray">v{h.version}</span>
                <span className="text-muted">{h.fecha}</span>
                <span className="num">{money(h.total, sym)}</span>
                <span className="text-muted mono" style={{fontSize:11}}>{h.cotizacion_id}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal confirmación envío */}
      {confirmEnviar && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:460}}>
            <div className="modal-head">
              <h2>Enviar cotización</h2>
              <button className="icon-btn" onClick={() => setConfirmEnviar(false)}>{I.x}</button>
            </div>
            <div className="modal-body col" style={{gap:20}}>
              <p style={{margin:0, lineHeight:'1.6'}}>¿Confirmas que esta cotización fue enviada al cliente? A partir de este momento quedará bloqueada para edición.</p>
              <div className="row" style={{gap:8, justifyContent:'flex-end'}}>
                <button className="btn btn-secondary" onClick={() => setConfirmEnviar(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={() => { onEnviar(); setConfirmEnviar(false); }}>Confirmar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Totales helper ──────────────────────────────────────────────────────
function TotalesBox({ subtotal, igvPct, igv, total, suffix = '', sym = 'S/' }) {
  return (
    <div style={{padding:16, background:'var(--bg-subtle)', borderRadius:8, border:'1px solid var(--border)'}}>
      <div className="row" style={{justifyContent:'space-between', marginBottom:8}}>
        <span className="text-muted">Subtotal s/ IGV</span><span className="num">{money(subtotal || 0, sym)}{suffix}</span>
      </div>
      <div className="row" style={{justifyContent:'space-between', marginBottom:8}}>
        <span className="text-muted">IGV ({igvPct}%)</span><span className="num">{money(igv || 0, sym)}{suffix}</span>
      </div>
      <div className="row" style={{justifyContent:'space-between', paddingTop:8, borderTop:'1px solid var(--border)', fontWeight:700, fontSize:16, fontFamily:'Sora'}}>
        <span>Total{suffix === '/mes' ? ' mensual' : ''}</span><span className="num">{money(total || 0, sym)}{suffix}</span>
      </div>
    </div>
  );
}

// ── Editor (crear o editar borrador) ───────────────────────────────────
function EditorCotizacion({ opp, cuenta, cotizacionBase, sociedadIdEscritura, contactos, empresaConfig, diccionarioComercial = [], onSave, onCancel }) {
  const { centrosBeneficio, monedasActivas, empresa } = useApp();
  const cfg     = empresaConfig || {};
  const isEdit  = !!(cotizacionBase?.id);
  const cebesActivos = filtrarOpcionesPorSociedadEscritura(
    (centrosBeneficio || []).filter(c => c.estado === 'activo'),
    sociedadIdEscritura,
  );
  const contactosCuenta = contactos || [];
  const contactoPrincipalCuenta = contactosCuenta.find(c => c.principal || c.es_principal);
  const contactosOrdenados = [...contactosCuenta].sort((a, b) => {
    const aPrincipal = a.principal || a.es_principal ? 1 : 0;
    const bPrincipal = b.principal || b.es_principal ? 1 : 0;
    if (aPrincipal !== bPrincipal) return bPrincipal - aPrincipal;
    return String(a.nombre || '').localeCompare(String(b.nombre || ''));
  });

  // ── Bloque 1 ────────────────────────────────────────────────────────
  const [numeroCot,   setNumeroCot]   = useState(cotizacionBase?.numero      || '');
  const [moneda,      setMoneda]      = useState(() => normalizeCurrencyCode(cotizacionBase?.moneda || opp?.moneda || 'PEN'));
  const [igvPct,      setIgvPct]      = useState(cotizacionBase?.igv_pct     || 18);
  const [validezTipo, setValidezTipo] = useState(cotizacionBase?.validez_tipo  || 'dias');
  const [validezDias, setValidezDias] = useState(cotizacionBase?.validez_dias  || 30);
  const [validezFecha,setValidezFecha]= useState(cotizacionBase?.validez_fecha || '');
  const [contactoId,  setContactoId]  = useState(cotizacionBase?.contacto_id || contactoPrincipalCuenta?.id || opp?.contacto_id || contactosCuenta[0]?.id || '');
  const [cebeId,      setCebeId]      = useState(cotizacionBase?.centro_beneficio_id || '');
  const [sociedadId,  setSociedadId]  = useState(cotizacionBase?.sociedad_id || '');
  const [descripcion, setDescripcion] = useState(cotizacionBase?.descripcion_general || '');
  const opcionesMoneda = (monedasActivas || [])
    .map(m => ({ ...m, codigo: normalizeCurrencyCode(m.codigo) }))
    .filter((m, idx, arr) => m.codigo && arr.findIndex(x => x.codigo === m.codigo) === idx);
  const monedaNormalizada = normalizeCurrencyCode(moneda);
  const monedaActual = opcionesMoneda.some(m => m.codigo === monedaNormalizada)
    ? monedaNormalizada
    : (opcionesMoneda[0]?.codigo || monedaNormalizada);

  useEffect(() => {
    if (isEdit || contactoId || !contactoPrincipalCuenta?.id) return;
    setContactoId(contactoPrincipalCuenta.id);
  }, [isEdit, contactoId, contactoPrincipalCuenta?.id]);

  // ── Bloque 2: partidas ───────────────────────────────────────────────
  const normalizeTipoPartida = p => ['material', 'servicio', 'bien', 'recurrente'].includes(String(p?.tipo || p?.tipo_partida || '').toLowerCase())
    ? String(p?.tipo || p?.tipo_partida || '').toLowerCase()
    : 'servicio';
  const emptyPartida = () => ({ id: Date.now() + Math.random(), descripcion: '', detalle_items_txt: '', tipo: 'servicio', detalle_cantidad: '', cantidad: 1, precio_unitario: '', incluido: false });

  const [partidas, setPartidas] = useState(() => {
    if (cotizacionBase?.items?.length) {
      return cotizacionBase.items.map(p => ({
        ...p,
        tipo: normalizeTipoPartida(p),
        cantidad: toCotNumber(p.cantidad),
        precio_unitario: toCotNumber(p.precio_unitario),
        detalle_items_txt: Array.isArray(p.detalle_items) ? p.detalle_items.join('\n') : (p.detalle || '')
      }));
    }
    return [{ ...emptyPartida(), descripcion: opp?.servicio_interes || opp?.nombre || '', precio_unitario: Number(opp?.monto_estimado || 0) }];
  });

  const addPartida     = () => setPartidas(p => [...p, emptyPartida()]);
  const removePartida  = id => setPartidas(p => p.filter(x => x.id !== id));
  const updatePartida  = (id, field, value) => setPartidas(p => p.map(x => x.id === id ? { ...x, [field]: value } : x));
  const movePartida    = (idx, dir) => setPartidas(prev => {
    const arr = [...prev]; [arr[idx], arr[idx + dir]] = [arr[idx + dir], arr[idx]]; return arr;
  });
  const addFromCatalogo = srv => setPartidas(prev => [...prev, {
    ...emptyPartida(), id: Date.now(),
    descripcion: srv.descripcion,
    detalle_items_txt: (srv.entregables || []).join('\n'),
    precio_unitario: srv.precio || 0,
    incluido: srv.precio_incluido || false,
  }]);

  // ── Bloque 3: cálculos ───────────────────────────────────────────────
  const pImpl = partidas.filter(p => !p.incluido && p.tipo !== 'recurrente');
  const pRec  = partidas.filter(p => !p.incluido && p.tipo === 'recurrente');
  const calcPartidaTotal = p => toCotNumber(p.cantidad) * toCotNumber(p.precio_unitario);
  const subtImpl  = pImpl.reduce((s, p) => s + calcPartidaTotal(p), 0);
  const igvImpl   = Math.round(subtImpl * toCotNumber(igvPct) / 100);
  const totalImpl = subtImpl + igvImpl;
  const subtRec   = pRec.reduce((s, p) => s + calcPartidaTotal(p), 0);
  const igvRec    = Math.round(subtRec * toCotNumber(igvPct) / 100);
  const totalRec  = subtRec + igvRec;

  // ── Bloque 4: hitos ─────────────────────────────────────────────────
  const [hitosActivos, setHitosActivos] = useState(cotizacionBase?.hitos_activos || false);
  const [hitos, setHitos]               = useState(cotizacionBase?.hitos_pago   || []);
  const [glosa, setGlosa]               = useState(cotizacionBase?.glosa_factura ?? cfg.cond_glosa_factura ?? '');
  const sumPct = hitos.reduce((s, h) => s + Number(h.porcentaje || 0), 0);

  const addHito    = () => setHitos(p => [...p, { id: Date.now(), concepto: '', porcentaje: 0, condicion: '' }]);
  const removeHito = id => setHitos(p => p.filter(h => h.id !== id));
  const updateHito = (id, f, v) => setHitos(p => p.map(h => h.id === id ? { ...h, [f]: v } : h));

  // ── Bloque 5: condiciones ────────────────────────────────────────────
  const [conds, setConds] = useState({
    forma_pago:       cotizacionBase?.cond_forma_pago       ?? cfg.cond_forma_pago       ?? '',
    validez:          cotizacionBase?.cond_validez          ?? cfg.cond_validez          ?? '',
    penalidad:        cotizacionBase?.cond_penalidad        ?? cfg.cond_penalidad        ?? '',
    inicio_proyecto:  cotizacionBase?.cond_inicio_proyecto  ?? cfg.cond_inicio_proyecto  ?? '',
    alcance:          cotizacionBase?.cond_alcance          ?? cfg.cond_alcance          ?? '',
    integraciones:    cotizacionBase?.cond_integraciones    ?? cfg.cond_integraciones    ?? '',
    confidencialidad: cotizacionBase?.cond_confidencialidad ?? cfg.cond_confidencialidad ?? '',
  });
  const setCond = (k, v) => setConds(p => ({ ...p, [k]: v }));

  const COND_LABELS = [
    ['forma_pago',       'Forma de pago y datos bancarios'],
    ['validez',          'Validez de la oferta'],
    ['penalidad',        'Penalidad por mora'],
    ['inicio_proyecto',  'Inicio del proyecto'],
    ['alcance',          'Alcance y exclusiones'],
    ['integraciones',    'Integraciones externas'],
    ['confidencialidad', 'Confidencialidad'],
  ];

  // ── Guardar ──────────────────────────────────────────────────────────
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');

  const handleSave = async () => {
    if (empresa?.multisociedad_habilitado && !sociedadId) {
      alert('Selecciona una sociedad para la cotización.');
      return;
    }
    if (hitosActivos && Math.abs(sumPct - 100) > 0.01) {
      alert(`Los porcentajes de hitos suman ${sumPct.toFixed(1)}%. Deben sumar exactamente 100%.`);
      return;
    }
    setGuardando(true);
    setErrorGuardar('');
    const items = partidas.map((p, i) => ({
      id: p.id, n: i + 1,
      descripcion: p.descripcion,
      detalle_items: (p.detalle_items_txt || '').split('\n').map(s => s.trim()).filter(Boolean),
      tipo: p.tipo,
      detalle_cantidad: p.detalle_cantidad || '',
      cantidad: toCotNumber(p.cantidad),
      precio_unitario: p.incluido ? 0 : toCotNumber(p.precio_unitario),
      total: p.incluido ? 0 : calcPartidaTotal(p),
      incluido: p.incluido || false,
    }));
    try {
      await onSave({
        oportunidad_id: cotizacionBase?.oportunidad_id || opp?.id,
        cuenta_id:      cotizacionBase?.cuenta_id      || opp?.cuenta_id,
        contacto_id:    contactoId || null,
        centro_beneficio_id: cebeId || null,
        sociedad_id: empresa?.multisociedad_habilitado ? sociedadId : null,
        ...(isEdit && numeroCot ? { numero: numeroCot.trim() } : {}),
        moneda: monedaActual, igv_pct: toCotNumber(igvPct),
        validez_tipo: validezTipo,
        validez_dias: Number(validezDias),
        validez_fecha: validezTipo === 'fecha_exacta' ? validezFecha : null,
        descripcion_general: descripcion,
        hoja_costeo_id: cotizacionBase?.hoja_costeo_id || null,
        items,
        subtotal: subtImpl + subtRec, base_imponible: subtImpl,
        igv: igvImpl, total: totalImpl,
        subtotal_impl: subtImpl, igv_impl: igvImpl, total_impl: totalImpl,
        subtotal_rec: subtRec,   igv_rec: igvRec,   total_rec: totalRec,
        hitos_activos: hitosActivos,
        hitos_pago: hitosActivos ? hitos.map(h => ({ ...h, monto: Math.round(totalImpl * Number(h.porcentaje || 0) / 100) })) : [],
        glosa_factura:         glosa || null,
        cond_forma_pago:       conds.forma_pago       || null,
        cond_validez:          conds.validez          || null,
        cond_penalidad:        conds.penalidad        || null,
        cond_inicio_proyecto:  conds.inicio_proyecto  || null,
        cond_alcance:          conds.alcance          || null,
        cond_integraciones:    conds.integraciones    || null,
        cond_confidencialidad: conds.confidencialidad || null,
      });
    } catch (err) {
      setErrorGuardar(err?.message || 'No se pudo guardar la cotización. Verifica tus permisos.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div className="page-header" style={{borderBottom:'none', paddingBottom:0}}>
        <div>
          <button className="btn btn-ghost" onClick={onCancel} style={{marginBottom:10, padding:0, color:'var(--cyan)'}}>← Volver</button>
          <h1 className="page-title">{isEdit ? `Editar ${cotizacionBase.numero} v${cotizacionBase.version}` : 'Nueva Cotización'}</h1>
          <div className="page-sub">
            {opp && <>Oportunidad: <strong>{opp.nombre}</strong> · </>}
            Cliente: <strong>{cuenta?.razon_social || cuenta?.nombre_comercial || '—'}</strong>
            {cuenta?.ruc && <> · RUC: {cuenta.ruc}</>}
          </div>
        </div>
        <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8}}>
          <div className="row">
            <button className="btn btn-secondary" onClick={onCancel} disabled={guardando}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={guardando}>
              {guardando ? 'Guardando…' : <>{I.save} Guardar cotización</>}
            </button>
          </div>
          {errorGuardar && <span style={{fontSize:12, color:'var(--red)', maxWidth:320, textAlign:'right'}}>{errorGuardar}</span>}
        </div>
      </div>

      {/* ── Bloque 1: encabezado ──────────────────────────────────────── */}
      <div className="card mt-6">
        <div className="card-body">
          <div className="eyebrow" style={{marginBottom:16}}>Encabezado</div>
          {isEdit && (
            <div className="input-group" style={{marginBottom:16, maxWidth:280}}>
              <label>Número de cotización</label>
              <input className="input mono" value={numeroCot} onChange={e => setNumeroCot(e.target.value)} placeholder="Ej. COT-2026-0502" />
            </div>
          )}
          <div className="grid-3" style={{gap:16, marginBottom:16}}>
            <div className="input-group">
              <label>Moneda</label>
              <select className="select" value={monedaActual} onChange={e => setMoneda(normalizeCurrencyCode(e.target.value))}>
                {opcionesMoneda.map(m => <option key={m.codigo} value={m.codigo}>{m.codigo} — {m.nombre}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>IGV (%)</label>
              <input type="number" className="input" value={igvPct} min="0" max="30" step="0.1" onChange={e => setIgvPct(e.target.value)} />
            </div>
            <div className="input-group">
              <label>Attn. (contacto)</label>
              <select className="select" value={contactoId} onChange={e => setContactoId(e.target.value)}>
                <option value="">Sin contacto específico</option>
                {contactosOrdenados.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.cargo ? ` (${c.cargo})` : ''}{(c.principal || c.es_principal) ? ' - Principal' : ''}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>CEBE</label>
              <select className="select" value={cebeId} onChange={e => setCebeId(e.target.value)}>
                <option value="">Sin CEBE asociado</option>
                {cebesActivos.map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} - ` : ''}{c.nombre}{c.tipo ? ` (${c.tipo})` : ''}</option>)}
              </select>
            </div>
            <SociedadFormField value={sociedadId} onChange={setSociedadId} />
          </div>
          <div className="grid-2" style={{gap:16, marginBottom:16}}>
            <div className="input-group">
              <label>Tipo de validez</label>
              <select className="select" value={validezTipo} onChange={e => setValidezTipo(e.target.value)}>
                <option value="dias">Número de días</option>
                <option value="fecha_exacta">Fecha exacta ("válida solo hoy")</option>
              </select>
            </div>
            <div className="input-group">
              {validezTipo === 'dias' ? (
                <>
                  <label>Días de validez</label>
                  <select className="select" value={validezDias} onChange={e => setValidezDias(e.target.value)}>
                    <option value={15}>15 días</option>
                    <option value={30}>30 días</option>
                    <option value={45}>45 días</option>
                    <option value={60}>60 días</option>
                  </select>
                </>
              ) : (
                <>
                  <label>Fecha exacta de validez</label>
                  <input type="date" className="input" value={validezFecha} onChange={e => setValidezFecha(e.target.value)} />
                </>
              )}
            </div>
          </div>
          <div className="input-group">
            <label>Descripción general del servicio</label>
            <SmartTextField
              value={descripcion}
              onChange={setDescripcion}
              diccionario={diccionarioComercial}
              rows={3}
              placeholder="Describe el alcance general en un párrafo. Aparece antes de la tabla de partidas en el PDF."
            />
          </div>
        </div>
      </div>

      {/* ── Bloque 2: partidas ────────────────────────────────────────── */}
      <div className="card mt-4">
        <div className="card-body">
          <div className="row" style={{justifyContent:'space-between', alignItems:'center', marginBottom:16, paddingBottom:8, borderBottom:'1px solid var(--border)'}}>
            <h3>Partidas</h3>
            <div className="row" style={{gap:8}}>
              <button className="btn btn-secondary btn-sm" onClick={addPartida}>{I.plus} Agregar línea</button>
              <select className="select" style={{fontSize:13, padding:'4px 10px', height:32}} defaultValue=""
                onChange={e => { if (!e.target.value) return; const s = MOCK.servicios?.find(x => x.id === e.target.value); if (s) addFromCatalogo(s); e.target.value = ''; }}>
                <option value="">Del catálogo ▾</option>
                {(MOCK.servicios || []).filter(s => s.estado === 'activo').map(s => <option key={s.id} value={s.id}>{s.descripcion}</option>)}
              </select>
            </div>
          </div>

          {partidas.map((p, idx) => (
            <div key={p.id} style={{marginBottom:12, padding:'14px 16px', background:'var(--bg-subtle)', borderRadius:8, border:'1px solid var(--border)'}}>
              {/* Fila 1: descripción + tipo + acciones */}
              <div className="row" style={{gap:10, marginBottom:10, alignItems:'flex-end'}}>
                <span style={{fontWeight:600, fontSize:11, color:'var(--fg-muted)', minWidth:60, paddingBottom:8}}>Partida {idx + 1}</span>
                <div className="input-group" style={{margin:0, flex:3}}>
                  <label style={{fontSize:11}}>Descripción</label>
                  <SmartTextField
                    value={p.descripcion}
                    onChange={value => updatePartida(p.id, 'descripcion', value)}
                    diccionario={diccionarioComercial}
                    multiline={false}
                    placeholder="Nombre del servicio o bien"
                  />
                </div>
                <div className="input-group" style={{margin:0, flex:1, minWidth:140}}>
                  <label style={{fontSize:11}}>Tipo</label>
                  <select className="select" value={p.tipo} onChange={e => updatePartida(p.id, 'tipo', e.target.value)}>
                    <option value="material">Material</option>
                    <option value="servicio">Servicio</option>
                    <option value="bien">Bien</option>
                    <option value="recurrente">Recurrente (mensual)</option>
                  </select>
                </div>
                <div className="row" style={{gap:4, paddingBottom:2}}>
                  {idx > 0 && <button type="button" className="icon-btn" onClick={() => movePartida(idx, -1)} title="Subir">↑</button>}
                  {idx < partidas.length - 1 && <button type="button" className="icon-btn" onClick={() => movePartida(idx, 1)} title="Bajar">↓</button>}
                  <button type="button" className="icon-btn text-danger" onClick={() => removePartida(p.id)}>{I.x}</button>
                </div>
              </div>
              {/* Fila 2: cantidad + precio + total */}
              <div className="row" style={{gap:10, marginBottom:10, alignItems:'flex-end'}}>
                <div className="input-group" style={{margin:0, width:110}}>
                  <label style={{fontSize:11}}>Cantidad</label>
                  <input type="number" className="input num" min="0" step="0.01" value={p.cantidad} onChange={e => updatePartida(p.id, 'cantidad', e.target.value)} />
                </div>
                <div className="input-group" style={{margin:0, flex:1}}>
                  <label style={{fontSize:11}}>Precio unitario</label>
                  {p.incluido
                    ? <div className="row" style={{gap:6, alignItems:'center'}}>
                        <span className="badge badge-gray" style={{flex:1, textAlign:'center', height:36, lineHeight:'36px'}}>Incluido</span>
                        <button type="button" className="icon-btn" style={{fontSize:11}} title="Quitar" onClick={() => updatePartida(p.id, 'incluido', false)}>{I.x}</button>
                      </div>
                    : <div className="row" style={{gap:4, alignItems:'center'}}>
                        <input type="number" className="input num" min="0" value={p.precio_unitario} onChange={e => updatePartida(p.id, 'precio_unitario', e.target.value)} />
                        <button type="button" className="icon-btn" style={{fontSize:11, color:'var(--fg-muted)', flexShrink:0}} title="Marcar como Incluido" onClick={() => updatePartida(p.id, 'incluido', true)}>∅</button>
                      </div>
                  }
                </div>
                <div className="input-group" style={{margin:0, flex:2}}>
                  <label style={{fontSize:11}}>Detalle de cantidad</label>
                  <SmartTextField
                    value={p.detalle_cantidad}
                    onChange={value => updatePartida(p.id, 'detalle_cantidad', value)}
                    diccionario={diccionarioComercial}
                    multiline={false}
                    placeholder="1 proyecto, 2 meses…"
                  />
                </div>
                <div style={{textAlign:'right', minWidth:120, paddingBottom:2}}>
                  <div style={{fontSize:11, color:'var(--fg-muted)', marginBottom:4}}>Total partida</div>
                  <div style={{fontWeight:700, fontSize:16, fontFamily:'Sora', color:'var(--cyan)'}}>
                    {p.incluido ? <span className="text-muted">Incluido</span> : moneyCurrency(calcPartidaTotal(p), monedaActual)}
                  </div>
                </div>
              </div>
              {/* Fila 3: sub-ítems (opcional, compacto) */}
              <div className="input-group" style={{margin:0}}>
                <label style={{fontSize:11}}>Sub-ítems / entregables (una línea = viñeta en PDF)</label>
                <SmartTextField
                  value={p.detalle_items_txt}
                  onChange={value => updatePartida(p.id, 'detalle_items_txt', value)}
                  diccionario={diccionarioComercial}
                  rows={2}
                  placeholder="Entregable 1&#10;Entregable 2"
                  inputStyle={{fontSize:12}}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bloque 3: totales ─────────────────────────────────────────── */}
      <div className="card mt-4">
        <div className="card-body">
          <h3 style={{marginBottom:16, paddingBottom:8, borderBottom:'1px solid var(--border)'}}>Resumen de totales</h3>
          <div className={pRec.length > 0 ? 'grid-2' : ''} style={{gap:24, maxWidth: pRec.length > 0 ? '100%' : 380, marginLeft:'auto'}}>
            <div>
              {pRec.length > 0 && <div className="eyebrow" style={{marginBottom:12}}>Implementación</div>}
              <TotalesBox subtotal={subtImpl} igvPct={igvPct} igv={igvImpl} total={totalImpl} sym={currencySymbol(monedaActual)} />
            </div>
            {pRec.length > 0 && (
              <div>
                <div className="eyebrow" style={{marginBottom:12}}>Recurrente mensual</div>
                <TotalesBox subtotal={subtRec} igvPct={igvPct} igv={igvRec} total={totalRec} suffix="/mes" sym={currencySymbol(monedaActual)} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bloque 4: hitos de pago ───────────────────────────────────── */}
      <div className="card mt-4">
        <div className="card-body">
          <div className="row" style={{justifyContent:'space-between', alignItems:'center', marginBottom: hitosActivos ? 16 : 0}}>
            <h3>Hitos de pago</h3>
            <label className="row" style={{gap:8, cursor:'pointer', fontWeight:400, fontSize:14}}>
              <input type="checkbox" checked={hitosActivos} onChange={e => setHitosActivos(e.target.checked)} />
              Agregar hitos de pago
            </label>
          </div>
          {hitosActivos && (
            <>
              <div className="table-wrap" style={{marginBottom:12}}>
                <table className="tbl">
                  <thead>
                    <tr><th>N°</th><th>Concepto</th><th style={{width:110}}>% del total</th><th style={{width:140}}>Monto (auto)</th><th>Condición / vencimiento</th><th style={{width:36}}></th></tr>
                  </thead>
                  <tbody>
                    {hitos.map((h, i) => (
                      <tr key={h.id}>
                        <td className="num text-muted">{i + 1}</td>
                        <td>
                          <SmartTextField
                            value={h.concepto}
                            onChange={value => updateHito(h.id, 'concepto', value)}
                            diccionario={diccionarioComercial}
                            multiline={false}
                            placeholder="Ej: Anticipo"
                          />
                        </td>
                        <td><input type="number" className="input num" min="0" max="100" value={h.porcentaje} onChange={e => updateHito(h.id, 'porcentaje', e.target.value)} /></td>
                        <td className="num" style={{fontWeight:600}}>{moneyCurrency(Math.round(totalImpl * Number(h.porcentaje || 0) / 100), monedaActual)}</td>
                        <td>
                          <SmartTextField
                            value={h.condicion}
                            onChange={value => updateHito(h.id, 'condicion', value)}
                            diccionario={diccionarioComercial}
                            multiline={false}
                            placeholder="Al inicio del trabajo"
                          />
                        </td>
                        <td><button className="icon-btn text-danger" onClick={() => removeHito(h.id)}>{I.x}</button></td>
                      </tr>
                    ))}
                    {hitos.length === 0 && <tr><td colSpan="6" style={{textAlign:'center', padding:20, color:'var(--fg-muted)', fontSize:13}}>Sin hitos. Agrega uno.</td></tr>}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="2"></td>
                      <td className="num" style={{fontWeight:700, color: Math.abs(sumPct - 100) < 0.01 ? 'var(--green)' : 'var(--danger)'}}>
                        {sumPct.toFixed(1)}%
                      </td>
                      <td colSpan="3" style={{fontSize:12, color: Math.abs(sumPct - 100) < 0.01 ? 'var(--green)' : 'var(--danger)'}}>
                        {Math.abs(sumPct - 100) < 0.01 ? '✓ Suma correcta' : `Debe sumar 100% (faltan ${(100 - sumPct).toFixed(1)}%)`}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={addHito}>{I.plus} Agregar hito</button>
              <div className="input-group" style={{marginTop:16}}>
                <label>Glosa recomendada para las facturas</label>
                <SmartTextField
                  value={glosa}
                  onChange={setGlosa}
                  diccionario={diccionarioComercial}
                  rows={2}
                  placeholder="Texto que irá en las facturas…"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Bloque 5: condiciones comerciales ────────────────────────── */}
      <div className="card mt-4">
        <div className="card-body">
          <div className="eyebrow" style={{marginBottom:4}}>Condiciones comerciales</div>
          <div className="text-muted" style={{fontSize:12, marginBottom:16}}>Pre-cargadas desde Parámetros Generales. Edita aquí para esta cotización sin afectar la plantilla general.</div>
          {COND_LABELS.map(([key, label]) => (
            <div className="input-group" key={key}>
              <label style={{fontSize:13}}>{label}</label>
              <SmartTextField
                value={conds[key]}
                onChange={value => setCond(key, value)}
                diccionario={diccionarioComercial}
                rows={3}
                placeholder={label + '…'}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Bloque 6: preview de firmas ───────────────────────────────── */}
      <div className="card mt-4" style={{marginBottom:40}}>
        <div className="card-body">
          <div className="eyebrow" style={{marginBottom:16}}>Página de cierre — Preview</div>
          <div className="grid-2" style={{gap:40}}>
            <div style={{textAlign:'center', padding:20, border:'1px dashed var(--border)', borderRadius:8}}>
              <div className="eyebrow" style={{marginBottom:12}}>Por {cfg.razon_social || 'TIDEO'}</div>
              {cfg.firma_url && <img src={cfg.firma_url} alt="Firma" style={{maxHeight:60, marginBottom:8, display:'block', margin:'0 auto 8px'}} />}
              <div style={{borderTop:'1px solid var(--border-strong)', paddingTop:8, fontWeight:600}}>{cfg.firmante || '(configurar en Parámetros)'}</div>
              <div style={{fontSize:12, color:'var(--fg-muted)'}}>{cfg.cargo_firmante}</div>
              <div style={{fontSize:12, color:'var(--fg-muted)'}}>{cfg.email_comercial}</div>
            </div>
            <div style={{textAlign:'center', padding:20, border:'1px dashed var(--border)', borderRadius:8}}>
              <div className="eyebrow" style={{marginBottom:12}}>Por {cuenta?.razon_social || cuenta?.nombre_comercial || 'Cliente'}</div>
              <div style={{height:60, display:'flex', alignItems:'flex-end', justifyContent:'center'}}>
                <div style={{width:'80%', borderBottom:'1px solid var(--border-strong)'}}></div>
              </div>
              <div style={{paddingTop:8, fontWeight:600, color:'var(--fg-muted)'}}>
                {(contactos || []).find(c => c.id === contactoId)?.nombre || '(selecciona un contacto arriba)'}
              </div>
              <div style={{fontSize:12, color:'var(--fg-muted)'}}>Sello y firma</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const CONDICIONES_PAGO = ['Contado', '30 días', '45 días', '60 días', '90 días', '120 días', 'Anticipado', 'Contra entrega'];

function CrearOSModal({ cot, opp, osClientes, cuentas, sociedadIdEscritura, onClose, onCrearNueva, onVincularExistente }) {
  const { usuarios, centrosBeneficio } = useApp();
  const getNombre = id => (cuentas || []).find(c => c.id === id)?.razon_social || id;
  const cuenta = (cuentas || []).find(c => c.id === cot.cuenta_id);
  const osExistentes = filtrarOpcionesPorSociedadEscritura(osClientes || [], sociedadIdEscritura).filter(os =>
    os.cuenta_id === cot.cuenta_id && !['cerrada', 'anulada'].includes(os.estado)
  );
  const today = new Date().toISOString().split('T')[0];
  const cebesActivos = filtrarOpcionesPorSociedadEscritura(
    (centrosBeneficio || []).filter(c => c.estado === 'activo'),
    sociedadIdEscritura,
  );
  const cebeVinculadoCuenta = cebesActivos.find(c => c.tipo === 'cliente' && c.cuenta_id === cot.cuenta_id);
  const cebesOrdenados = [...cebesActivos].sort((a, b) => Number(b.tipo === 'cliente' && b.cuenta_id === cot.cuenta_id) - Number(a.tipo === 'cliente' && a.cuenta_id === cot.cuenta_id));
  const condPagoInicial = cot.condicion_pago || cuenta?.condicion_pago || '30 días';
  const [modo, setModo] = useState(osExistentes.length > 0 ? null : 'nueva');
  const [osSeleccionada, setOsSeleccionada] = useState('');
  const [paso, setPaso] = useState(1);
  const [tieneNumero, setTieneNumero] = useState(null);
  const [form, setForm] = useState({
    numero_doc_cliente: '',
    nombre: opp?.nombre || opp?.servicio_interes || '',
    responsable_comercial_id: opp?.responsable_id || '',
    moneda: cot.moneda || 'PEN',
    fecha_inicio: today,
    fecha_fin: '',
    observaciones: '',
    condicion_pago: condPagoInicial,
    sla: 'estandar',
    centro_beneficio_id: cot.centro_beneficio_id || cebeVinculadoCuenta?.id || '',
  });
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const optStyle = { display:'flex', alignItems:'center', gap:10, padding:'10px 14px', border:'1px solid var(--border)', borderRadius:8, cursor:'pointer', transition:'background 0.15s' };
  const infoBox = { padding:'10px 14px', background:'var(--bg-subtle)', borderRadius:8, border:'1px solid var(--border)', fontSize:13 };

  if (modo === null) {
    return (
      <div className="modal-backdrop">
        <div className="modal" style={{maxWidth:480}}>
          <div className="modal-head">
            <h2>Crear OS Cliente</h2>
            <button className="icon-btn" onClick={onClose}>{I.x}</button>
          </div>
          <div className="modal-body col" style={{gap:14}}>
            <div style={infoBox}>
              <div className="eyebrow">Cotización aprobada</div>
              <strong>{cot.numero}</strong> · {money(cot.total_impl || cot.total, currencySymbol(cot.moneda))} · {getNombre(cot.cuenta_id)}
            </div>
            <div style={{fontWeight:500, fontSize:14}}>Se detectaron OS activas para este cliente. ¿Esta cotización corresponde a una OS existente o es una OS nueva?</div>
            <div className="col" style={{gap:8}}>
              {osExistentes.map(os => (
                <label key={os.id} style={{...optStyle, background: osSeleccionada === os.id ? 'var(--cyan-lt)' : 'transparent'}}>
                  <input type="radio" name="os_existente" style={{accentColor:'var(--cyan-dk)'}} checked={osSeleccionada === os.id} onChange={() => setOsSeleccionada(os.id)} />
                  <div>
                    <div style={{fontWeight:600, fontSize:13}}>{os.numero}{os.nombre ? ` — ${os.nombre}` : ''}</div>
                    <div style={{fontSize:12, color:'var(--fg-muted)'}}>{money(os.monto_aprobado, currencySymbol(os.moneda))} · {os.estado}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={() => setModo('nueva')}>Crear nueva OS</button>
            <button className="btn btn-primary" disabled={!osSeleccionada} onClick={() => onVincularExistente(osSeleccionada)}>Agregar a OS existente</button>
          </div>
        </div>
      </div>
    );
  }

  if (paso === 1) {
    return (
      <div className="modal-backdrop">
        <div className="modal" style={{maxWidth:480}}>
          <div className="modal-head">
            <div>
              <div className="eyebrow" style={{marginBottom:2}}>Paso 1 de 2 — Número de OS</div>
              <h2>Crear OS Cliente</h2>
            </div>
            <button className="icon-btn" onClick={onClose}>{I.x}</button>
          </div>
          <div className="modal-body col" style={{gap:16}}>
            <div style={infoBox}><strong>{cot.numero}</strong> · {money(cot.total_impl || cot.total, currencySymbol(cot.moneda))}</div>
            <div style={{fontWeight:500}}>¿El cliente proporcionó un número de OS?</div>
            <div className="col" style={{gap:8}}>
              <label style={{...optStyle, background: tieneNumero === true ? 'var(--cyan-lt)' : 'transparent'}}>
                <input type="radio" name="tiene_num" style={{accentColor:'var(--cyan-dk)'}} checked={tieneNumero === true} onChange={() => setTieneNumero(true)} />
                <span>Sí — el cliente proporcionó su número de OS</span>
              </label>
              <label style={{...optStyle, background: tieneNumero === false ? 'var(--cyan-lt)' : 'transparent'}}>
                <input type="radio" name="tiene_num" style={{accentColor:'var(--cyan-dk)'}} checked={tieneNumero === false} onChange={() => setTieneNumero(false)} />
                <span>No / Aún no — generar número interno automático</span>
              </label>
            </div>
            {tieneNumero === true && (
              <div className="input-group">
                <label>Número OS del cliente</label>
                <input className="input" value={form.numero_doc_cliente} onChange={e => upd('numero_doc_cliente', e.target.value)} placeholder="Ej. OS-2026-001" autoFocus />
              </div>
            )}
          </div>
          <div className="modal-foot">
            <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary"
              disabled={tieneNumero === null || (tieneNumero === true && !form.numero_doc_cliente.trim())}
              onClick={() => setPaso(2)}>
              Siguiente →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{maxWidth:560}}>
        <div className="modal-head">
          <div>
            <div className="eyebrow" style={{marginBottom:2}}>Paso 2 de 2 — Datos de la OS</div>
            <h2>Crear OS Cliente</h2>
          </div>
          <button className="icon-btn" onClick={onClose}>{I.x}</button>
        </div>
        <form className="modal-body col" style={{gap:14}} onSubmit={e => { e.preventDefault(); onCrearNueva(form); }}>
          <div style={infoBox}>
            <strong>{cot.numero}</strong> · {money(cot.total_impl || cot.total, currencySymbol(cot.moneda))}
            {tieneNumero && form.numero_doc_cliente && <> · OS cliente: <strong>{form.numero_doc_cliente}</strong></>}
          </div>
          <div className="input-group">
            <label>Nombre de la OS <span style={{color:'var(--danger)'}}>*</span></label>
            <input className="input" value={form.nombre} onChange={e => upd('nombre', e.target.value)} required />
          </div>
          <div className="input-group">
            <label>CEBE <span style={{color:'var(--danger)'}}>*</span></label>
            <select className="select" value={form.centro_beneficio_id} onChange={e => upd('centro_beneficio_id', e.target.value)} required>
              <option value="">Seleccionar CEBE...</option>
              {cebesOrdenados.map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} - ` : ''}{c.nombre}{c.tipo ? ` (${c.tipo})` : ''}</option>)}
            </select>
          </div>
          <div className="grid-2">
            <div className="input-group">
              <label>Moneda</label>
              <input className="input" value={form.moneda} readOnly style={{opacity:0.65, cursor:'not-allowed'}} />
            </div>
            <div className="input-group">
              <label>Responsable comercial</label>
              <select className="select" value={form.responsable_comercial_id} onChange={e => upd('responsable_comercial_id', e.target.value)}>
                <option value="">Sin asignar</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="input-group">
              <label>Fecha inicio servicio <span style={{color:'var(--danger)'}}>*</span></label>
              <input className="input" type="date" value={form.fecha_inicio} onChange={e => upd('fecha_inicio', e.target.value)} required />
            </div>
            <div className="input-group">
              <label>Fecha estimada de cierre</label>
              <input className="input" type="date" value={form.fecha_fin} onChange={e => upd('fecha_fin', e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="input-group">
              <label>Condición de pago</label>
              <select className="select" value={form.condicion_pago} onChange={e => upd('condicion_pago', e.target.value)}>
                {CONDICIONES_PAGO.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>SLA</label>
              <select className="select" value={form.sla} onChange={e => upd('sla', e.target.value)}>
                <option value="estandar">Estándar</option>
                <option value="estricto">Estricto</option>
                <option value="critico">Crítico</option>
              </select>
            </div>
          </div>
          <div className="input-group">
            <label>Observaciones</label>
            <textarea className="input" rows="2" value={form.observaciones} onChange={e => upd('observaciones', e.target.value)} placeholder="Notas internas..." />
          </div>
          <SociedadReadOnlyField
            sociedadId={cot.sociedad_id || null}
            emptyMessage="La cotización de origen no tiene sociedad. La OS Cliente quedará sin sociedad."
          />
          <div className="modal-foot mt-2">
            <button type="button" className="btn btn-secondary" onClick={() => setPaso(1)}>← Volver</button>
            <button type="submit" className="btn btn-primary">{I.check} Crear OS Cliente</button>
          </div>
        </form>
      </div>
    </div>
  );
}

class CotizacionesErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) return (
      <div className="p-8">
        <h3 className="text-danger">Error en Cotizaciones</h3>
        <pre style={{fontSize:12}}>{this.state.error?.stack || this.state.error?.message}</pre>
      </div>
    );
    return this.props.children;
  }
}

function Cotizaciones() {
  return <CotizacionesErrorBoundary><CotizacionesInner /></CotizacionesErrorBoundary>;
}

const MESES_VAL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MODELO_LABELS = { avance_pct: 'Por avance %', costo_real: 'Por costo real', hitos_pago: 'Por hitos de pago' };

function Valorizacion({ role }) {
  const { valorizaciones, osClientes, cuentas, cotizaciones, partes, generarValorizacion, aprobarValorizacion, anularValorizacion, actualizarDatosValorizacion, emitirFacturaDesdeValorizacion, ots, cierresTecnicos, navigate, searchQuery, personalOperativo, personalAdmin, empresa, perfilSociedad, sociedadesIdsAlcance, sociedadActiva, sociedadesDisponibles } = useApp();
  const modoVistaSociedadValorizaciones = resolverFiltroSociedadesVista({
    multisociedadHabilitado: empresa?.multisociedad_habilitado,
    perfilSociedad,
    sociedadActiva,
    sociedadesIdsAlcance,
    sociedadesDisponibles,
  });
  const mostrarBadgeSociedadValorizaciones = Boolean(
    empresa?.multisociedad_habilitado
    && !modoVistaSociedadValorizaciones.permiteEscritura
    && (modoVistaSociedadValorizaciones.sinFiltro || modoVistaSociedadValorizaciones.sociedadesIds.length > 0)
  );
  const sociedadesIdsVistaValorizacionesKey = modoVistaSociedadValorizaciones.sociedadesIds.join('|');
  const valorizacionesVista = useMemo(() => {
    if (modoVistaSociedadValorizaciones.sinFiltro) return valorizaciones;
    const permitidas = new Set(modoVistaSociedadValorizaciones.sociedadesIds);
    return valorizaciones.filter(valorizacion => valorizacion.sociedad_id && permitidas.has(valorizacion.sociedad_id));
  }, [valorizaciones, modoVistaSociedadValorizaciones.sinFiltro, sociedadesIdsVistaValorizacionesKey]);
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState(1);
  const [selVal, setSelVal] = useState(null);

  // Paso 1 state
  const [selOs, setSelOs] = useState('');
  const [periodoMes, setPeriodoMes] = useState(new Date().getMonth());
  const [periodoAnio, setPeriodoAnio] = useState(new Date().getFullYear());
  const [modelo, setModelo] = useState('');

  // Paso 2 state
  const [otSeleccionadas, setOtSeleccionadas] = useState([]);

  // Paso 3-4 state
  const [partidas, setPartidas] = useState([]);
  const [igvPct, setIgvPct] = useState(18);
  const [notas, setNotas] = useState('');

  // Ficha state
  const [fichaTab, setFichaTab] = useState('partidas');
  const [modalAnular, setModalAnular] = useState(false);
  const [motivoAnular, setMotivoAnular] = useState('');
  const [editingValId, setEditingValId] = useState(null);
  const [confirmarExceso, setConfirmarExceso] = useState(false);

  // List filter states
  const [filterCliente, setFilterCliente] = useState('');
  const [filterOs, setFilterOs] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterMoneda, setFilterMoneda] = useState('');
  const [filterPeriodo, setFilterPeriodo] = useState('');
  const [filterModelo, setFilterModelo] = useState('');

  const periodo = `${MESES_VAL[periodoMes]} ${periodoAnio}`;

  // ── Helpers ──────────────────────────────────────────────────────────
  const conformidadCompleta = otId => {
    const c = cierresTecnicos.find(ct => ct.ot_id === otId);
    return ['digital', 'fisico'].includes(c?.conformidad_cliente?.tipo);
  };
  // OTs en ejecucion no tienen cierre técnico aún: la conformidad se gestiona externamente para avance parcial
  const conformidadOK = ot => ot.estado === 'ejecucion' || conformidadCompleta(ot.id);
  const getOs = id => osClientes.find(o => o.id === id);
  const destinoValorizacion = resolverSociedadDestino({
    sociedades: sociedadesDisponibles,
    origenes: [{ seleccionado: Boolean(selOs), sociedadId: getOs(selOs)?.sociedad_id || null, label: `La OS Cliente ${getOs(selOs)?.numero || selOs || ''}`.trim() }],
    mensajeSinOrigen: 'Selecciona una OS Cliente para resolver la sociedad destino de la valorización.',
  });
  const monedaOs = getOs(selOs)?.moneda || 'PEN';
  const getCot = osId => (cotizaciones || []).find(c => c.id === getOs(osId)?.cotizacion_id);
  const getClienteNombre = osId => {
    const c = (cuentas || []).find(x => x.id === getOs(osId)?.cuenta_id);
    return c?.razon_social || c?.nombre_comercial || '—';
  };
  const getClienteId = osId => getOs(osId)?.cuenta_id;

  // OTs for editing
  const ESTADOS_VALORIZABLES = ['ejecucion', 'cerrada'];
  const osConOts = filtrarOpcionesPorSociedadEscritura(
    osClientes,
    modoVistaSociedadValorizaciones.sociedadIdEscritura,
  ).filter(os => ots.some(ot => ot.os_cliente_id === os.id && ESTADOS_VALORIZABLES.includes(ot.estado) && conformidadOK(ot)));

  // ── PARTE 5: Validation helpers ───────────────────────────────────────
  // Duplicate OS+periodo in borrador/aprobada (excluding the one being edited)
  const valDuplicada = selOs && periodo
    ? valorizaciones.find(v =>
        v.os_cliente_id === selOs &&
        v.periodo === periodo &&
        ['borrador', 'aprobada'].includes(v.estado) &&
        v.id !== editingValId
      )
    : null;

  // Solo bloquear OTs en borradores sin aprobar (evitar doble selección simultánea)
  const otIdsEnBorrador = new Set(
    valorizaciones
      .filter(v => v.estado === 'borrador' && v.id !== editingValId)
      .flatMap(v => v.ot_ids || [])
  );

  const otsDisponibles = selOs ? ots.filter(ot =>
    ot.os_cliente_id === selOs &&
    ESTADOS_VALORIZABLES.includes(ot.estado) &&
    conformidadOK(ot) &&
    !otIdsEnBorrador.has(ot.id)
  ) : [];
  const otsConformidadPend = selOs ? ots.filter(ot =>
    ot.os_cliente_id === selOs &&
    ESTADOS_VALORIZABLES.includes(ot.estado) &&
    !conformidadOK(ot)
  ) : [];
  const otsBloqueadasBorrador = selOs ? ots.filter(ot =>
    ot.os_cliente_id === selOs &&
    ESTADOS_VALORIZABLES.includes(ot.estado) &&
    conformidadOK(ot) &&
    otIdsEnBorrador.has(ot.id)
  ) : [];

  // Partida editors ───────────────────────────────────────────────────
  const addPartida = () => setPartidas(prev => [...prev, { id: Date.now(), descripcion: '', cantidad: 1, precio_unitario: '' }]);
  const removePartida = id => setPartidas(prev => prev.filter(p => p.id !== id));
  const updatePartida = (id, field, value) => setPartidas(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  const updateMargen = (id, newMargen) => setPartidas(prev => prev.map(p => {
    if (p.id !== id) return p;
    const costo = p._costo_real || 0;
    return { ...p, _margen_pct: newMargen, precio_unitario: Math.round(costo * (1 + newMargen / 100) * 100) / 100 };
  }));

  // ── Compute partidas from model ───────────────────────────────────────
  const computePartidas = otIds => {
    const os = getOs(selOs);
    const cot = getCot(selOs);
    const montoBase = cot?.base_imponible || (os?.monto_aprobado ? os.monto_aprobado / 1.18 : 0);

    if (modelo === 'avance_pct') {
      const basePerOt = otIds.length > 0 ? montoBase / otIds.length : 0;
      return otIds.map(otId => {
        const ot = ots.find(o => o.id === otId);
        const ct = cierresTecnicos.find(c => c.ot_id === otId);
        const avance = ct?.avance_final ?? ot?.avance ?? 100;
        const yaVal = valorizaciones
          .filter(v => (v.ot_ids || []).includes(otId))
          .reduce((s, v) => s + Number((v.items || []).find(i => i.ot_id === otId)?.precio_unitario || 0), 0);
        const montoCalc = basePerOt * avance / 100;
        return {
          id: `p_${otId}`, ot_id: otId,
          descripcion: `${ot?.numero || 'OT'} — ${ot?.descripcion || 'Avance de obra'}`,
          cantidad: 1,
          precio_unitario: Math.round(Math.max(0, montoCalc - yaVal) * 100) / 100,
          _avance_pct: avance,
          _monto_base: Math.round(basePerOt * 100) / 100,
          _ya_valorizado: yaVal,
        };
      });
    }

    if (modelo === 'costo_real') {
      const allPersonal = [...(personalOperativo || []), ...(personalAdmin || [])];
      const calcCostoHora = (personaId, ot) => {
        const moItem = ((ot?.realDetalle?.mano_obra?.length ? ot.realDetalle : ot?.est_detalle)?.mano_obra || [])
          .find(m => m.tecnico_id === personaId);
        if (moItem?.costo_hora > 0) return moItem.costo_hora;
        const p = allPersonal.find(x => x.id === personaId);
        const explicit = Number(p?.costo_hora_real ?? p?.costo ?? p?.costo_hora ?? 0);
        if (explicit > 0) return explicit;
        const rem = Number(p?.remuneracion ?? 0);
        return rem > 0 ? Math.round(rem / 240 * 100) / 100 : 0;
      };
      const costoRealTodas = otIds.reduce((s, id) => s + Number(ots.find(o => o.id === id)?.costoReal || 0), 0);
      const defaultMargen = costoRealTodas > 0 && montoBase > 0
        ? Math.max(5, Math.min(100, Math.round((montoBase / costoRealTodas - 1) * 100)))
        : 25;
      return otIds.map(otId => {
        const ot = ots.find(o => o.id === otId);
        const ct = cierresTecnicos.find(c => c.ot_id === otId);
        const partesOt = (partes || []).filter(p => p.ot_id === otId && p.estado === 'aprobado');
        const costoMO = partesOt.reduce((s, p) => s + Number(p.horas || 0) * calcCostoHora(p.tecnico_id, ot), 0);
        const costoMateriales = partesOt.reduce((s, p) =>
          s + (p.materiales_usados || []).reduce((sm, m) => sm + (m.costo_unitario || 0) * (m.cantidad || 0), 0), 0);
        const costoTerceros = partesOt.reduce((s, p) =>
          s + (p.terceros_lineas || []).reduce((sm, l) => sm + Number(l.monto || 0), 0), 0)
          + Number(ct?.costo_terceros || 0);
        const costoLogistica = partesOt.reduce((s, p) =>
          s + (p.logistica_lineas || []).reduce((sm, l) => sm + Number(l.monto || 0), 0), 0)
          + Number(ct?.costo_logistica || 0);
        const costoReal = costoMO + costoMateriales + costoTerceros + costoLogistica;
        const margenPct = defaultMargen;
        return {
          id: `p_${otId}`, ot_id: otId,
          descripcion: `${ot?.numero || 'OT'} — ${ot?.descripcion || 'Servicio ejecutado'}`,
          cantidad: 1,
          precio_unitario: Math.round(costoReal * (1 + margenPct / 100) * 100) / 100,
          _costo_mo: Math.round(costoMO * 100) / 100,
          _costo_materiales: Math.round(costoMateriales * 100) / 100,
          _costo_terceros: Math.round(costoTerceros * 100) / 100,
          _costo_logistica: Math.round(costoLogistica * 100) / 100,
          _costo_real: Math.round(costoReal * 100) / 100,
          _margen_pct: margenPct,
        };
      });
    }

    if (modelo === 'hitos_pago') {
      const cot = getCot(selOs);
      const hitos = cot?.hitos_pago || [];
      // h.monto viene de totalImpl (subtotal + IGV) en la cotización; extraer el neto
      const cotIgvPct = Number(cot?.igv_pct || 18);
      if (hitos.length === 0) {
        return [{ id: `h_${Date.now()}`, descripcion: 'Hito — ingrese descripción', cantidad: 1, precio_unitario: 0 }];
      }
      return hitos.map((h, i) => ({
        id: `h_${h.id || i}`, descripcion: h.concepto || `Hito ${i + 1}`,
        cantidad: 1, precio_unitario: Math.round(Number(h.monto || 0) / (1 + cotIgvPct / 100) * 100) / 100,
        _hito_numero: i + 1, _hito_estado: h.estado || 'pendiente',
      }));
    }
    return [];
  };

  // ── Totals ────────────────────────────────────────────────────────────
  const subtotalVal = partidas.reduce((s, p) => s + Number(p.cantidad || 0) * Number(p.precio_unitario || 0), 0);
  const igvAmount = Math.round(subtotalVal * (igvPct / 100) * 100) / 100;
  const totalVal = subtotalVal + igvAmount;

  // ── Step transitions ──────────────────────────────────────────────────
  const handleSelOs = osId => {
    setSelOs(osId);
    const dis = osId ? ots.filter(ot => ot.os_cliente_id === osId && ESTADOS_VALORIZABLES.includes(ot.estado) && conformidadOK(ot)) : [];
    setOtSeleccionadas(dis.map(ot => ot.id));
  };
  const advanceToStep3 = () => { setPartidas(computePartidas(otSeleccionadas)); setStep(3); };
  const resetForm = () => {
    setStep(1); setSelOs(''); setPeriodoMes(new Date().getMonth()); setPeriodoAnio(new Date().getFullYear());
    setModelo(''); setOtSeleccionadas([]); setPartidas([]); setIgvPct(18); setNotas('');
    setEditingValId(null); setConfirmarExceso(false);
  };
  const resetAndClose = () => { resetForm(); setEditing(false); };

  // ── Edit existing borrador ────────────────────────────────────────────
  const editarBorrador = v => {
    const os = getOs(v.os_cliente_id);
    const [mesStr, anioStr] = (v.periodo || '').split(' ');
    const mesIdx = MESES_VAL.indexOf(mesStr);
    setEditingValId(v.id);
    setSelOs(v.os_cliente_id);
    setPeriodoMes(mesIdx >= 0 ? mesIdx : new Date().getMonth());
    setPeriodoAnio(anioStr ? Number(anioStr) : new Date().getFullYear());
    setModelo(v.modelo_calculo || '');
    setOtSeleccionadas(v.ot_ids || []);
    setPartidas((v.items || []).map((item, i) => ({ ...item, id: item.id || `e_${i}` })));
    setIgvPct(v.subtotal > 0 ? Math.round(((v.igv || 0) / v.subtotal) * 100) : 18);
    setNotas(v.notas || '');
    setStep(4);
    setSelVal(null);
    setEditing(true);
  };

  // ── Save ──────────────────────────────────────────────────────────────
  const handleSave = (estadoFinal = 'aprobada') => {
    if (!selOs) { alert('Debe seleccionar una OS Cliente.'); return; }
    const items = partidas.map(p => ({ ot_id: p.ot_id || null, descripcion: p.descripcion, cantidad: Number(p.cantidad || 0), precio_unitario: Number(p.precio_unitario || 0) }));
    if (editingValId) {
      actualizarDatosValorizacion(editingValId, {
        os_cliente_id: selOs, subtotal: subtotalVal, igv: igvAmount, total: totalVal,
        periodo, modelo_calculo: modelo, notas, items, ot_ids: otSeleccionadas, estadoFinal,
      });
    } else {
      generarValorizacion(selOs, subtotalVal, igvAmount, totalVal, periodo, {
        otIds: otSeleccionadas, items, modelo_calculo: modelo, notas, estadoFinal,
      });
    }
    resetAndClose();
  };

  const nextNumero = `VAL-${new Date().getFullYear()}-${String(valorizaciones.length + 1).padStart(3, '0')}`;

  // ── Ficha detail view ─────────────────────────────────────────────────
  let fichaVal = null;
  if (selVal) {
    const v = valorizacionesVista.find(x => x.id === selVal);
    if (v) {
    const os = getOs(v.os_cliente_id);
    const clienteNombre = getClienteNombre(v.os_cliente_id);
    const badgeC = e => ({ aprobada: 'badge-green', facturada: 'badge-navy', anulada: 'badge-red' }[e] || 'badge-gray');
    const badgeL = e => ({ borrador: 'Borrador', aprobada: 'Aprobada', facturada: 'Facturada', anulada: 'Anulada' }[e] || (e || '—'));
    const items = v.items || [];
    const otsIncluidas = (v.ot_ids || []).map(id => ots.find(o => o.id === id)).filter(Boolean);
    const historial = v.historial || [];
    const TABS = [{ id: 'partidas', label: 'Partidas' }, { id: 'ots', label: `OTs incluidas (${otsIncluidas.length})` }, { id: 'historial', label: 'Historial' }];

    fichaVal = (
      <>
        {/* Modal anular */}
        {modalAnular && (
          <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center'}}>
            <div className="card" style={{width:440, padding:28}}>
              <h3 style={{margin:'0 0 8px'}}>Anular Valorización</h3>
              <div style={{fontSize:13, color:'var(--fg-muted)', marginBottom:16}}>
                Esta acción es irreversible. Si la valorización está aprobada, se revertirán los saldos de la OS y el estado de las OTs.
              </div>
              <div className="input-group">
                <label>Motivo de anulación <span style={{color:'var(--danger)'}}>*</span></label>
                <textarea className="input" rows={3} value={motivoAnular} onChange={e => setMotivoAnular(e.target.value)}
                  placeholder="Describe el motivo de la anulación..." autoFocus />
              </div>
              <div style={{display:'flex', gap:10, marginTop:20, justifyContent:'flex-end'}}>
                <button className="btn btn-secondary" onClick={() => { setModalAnular(false); setMotivoAnular(''); }}>Cancelar</button>
                <button className="btn btn-danger" disabled={!motivoAnular.trim()}
                  onClick={() => { anularValorizacion(v.id, motivoAnular.trim()); setModalAnular(false); setMotivoAnular(''); setSelVal(null); }}>
                  Confirmar anulación
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="side-panel-backdrop" onClick={() => setSelVal(null)} />
        <div className="side-panel">
        <div className="side-panel-head">
          <div>
            <div style={{fontSize:11,color:'var(--fg-muted)',marginBottom:2}}>{clienteNombre} · {os?.numero || '—'} · {v.periodo || '—'}</div>
            <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <strong style={{fontSize:16}}>{v.numero}</strong>
              <span className={'badge ' + badgeC(v.estado)}>{badgeL(v.estado)}</span>
              {mostrarBadgeSociedadValorizaciones && <SociedadBadge sociedadId={v.sociedad_id} />}
              {v.tipo === 'avance' && <span style={{fontSize:10,fontWeight:700,padding:'2px 6px',borderRadius:4,background:'color-mix(in srgb,var(--orange) 15%,transparent)',color:'var(--orange)'}}>Avance</span>}
              {v.tipo === 'final' && <span style={{fontSize:10,fontWeight:700,padding:'2px 6px',borderRadius:4,background:'color-mix(in srgb,var(--green) 15%,transparent)',color:'var(--green)'}}>Final</span>}
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {v.estado === 'borrador' && <button className="btn btn-primary btn-sm" onClick={() => { aprobarValorizacion(v.id); setSelVal(null); }}>{I.check} Aprobar</button>}
            {v.estado === 'aprobada' && <button className="btn btn-primary btn-sm" style={{background:'var(--green)'}} onClick={() => navigate('facturacion', { valSel: v.id, mode: 'val' })}>{I.plus} Factura</button>}
            <button className="icon-btn" onClick={() => setSelVal(null)}>{I.x}</button>
          </div>
        </div>
        <div className="side-panel-body">
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
            {v.estado === 'borrador' && <button className="btn btn-secondary btn-sm" onClick={() => editarBorrador(v)}>{I.edit} Editar</button>}
            {v.estado === 'aprobada' && <button className="btn btn-secondary btn-sm" style={{color:'var(--danger)',borderColor:'var(--danger)'}} onClick={() => setModalAnular(true)}>Anular</button>}
          </div>
          {/* Info cards */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:16}}>
          <div className="card" style={{padding:'14px 18px'}}>
            <div style={{fontSize:11, color:'var(--fg-muted)', marginBottom:4}}>OS Cliente</div>
            <div style={{fontWeight:600}}>{os?.numero || '—'}</div>
            <div style={{fontSize:12, color:'var(--fg-muted)'}}>{clienteNombre}</div>
          </div>
          <div className="card" style={{padding:'14px 18px'}}>
            <div style={{fontSize:11, color:'var(--fg-muted)', marginBottom:4}}>Período</div>
            <div style={{fontWeight:600}}>{v.periodo || '—'}</div>
            <div style={{fontSize:12, color:'var(--fg-muted)'}}>Fecha: {v.fecha || '—'}</div>
          </div>
          <div className="card" style={{padding:'14px 18px'}}>
            <div style={{fontSize:11, color:'var(--fg-muted)', marginBottom:4}}>Modelo</div>
            <div style={{fontWeight:600, fontSize:12}}>{MODELO_LABELS[v.modelo_calculo] || v.modelo_calculo || '—'}</div>
          </div>
          <div className="card" style={{padding:'14px 18px'}}>
            <div style={{fontSize:11, color:'var(--fg-muted)', marginBottom:4}}>Total</div>
            <div style={{fontWeight:700, fontSize:16, fontFamily:'Sora', color:'var(--cyan)'}}>{moneyCurrency(v.total, v.moneda)}</div>
            <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:2}}>Subtotal: {moneyCurrency(v.subtotal, v.moneda)} + IGV: {moneyCurrency(v.igv, v.moneda)}</div>
          </div>
        </div>

        {v.estado === 'anulada' && v.motivo_anulacion && (
          <div style={{marginBottom:16, padding:'12px 16px', borderRadius:8, border:'1px solid var(--danger)', background:'color-mix(in srgb, var(--danger) 6%, transparent)'}}>
            <div style={{fontWeight:600, fontSize:13, color:'var(--danger)', marginBottom:4}}>Motivo de anulación</div>
            <div style={{fontSize:13}}>{v.motivo_anulacion}</div>
          </div>
        )}

        {/* Tabs */}
        <div style={{display:'flex', borderBottom:'2px solid var(--border)', marginBottom:16, gap:0}}>
          {TABS.map(t => (
            <button key={t.id} className="btn btn-ghost"
              onClick={() => setFichaTab(t.id)}
              style={{
                borderRadius:0, padding:'10px 20px', fontWeight: fichaTab === t.id ? 700 : 400,
                borderBottom: fichaTab === t.id ? '2px solid var(--cyan)' : '2px solid transparent',
                marginBottom:-2, color: fichaTab === t.id ? 'var(--cyan)' : 'var(--fg-muted)',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab: Partidas */}
        {fichaTab === 'partidas' && (
          <div className="card">
            {items.length > 0 ? (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th style={{width:80}} className="num">Cant.</th>
                      <th style={{width:140}} className="num">P. Unitario</th>
                      <th style={{width:140}} className="num">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => (
                      <tr key={i}>
                        <td>{item.descripcion || '—'}</td>
                        <td className="num">{item.cantidad}</td>
                        <td className="num">{moneyCurrency(item.precio_unitario, v.moneda)}</td>
                        <td className="num" style={{fontWeight:600}}>{moneyCurrency(Number(item.cantidad) * Number(item.precio_unitario), v.moneda)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="card-body" style={{textAlign:'center', color:'var(--fg-muted)', fontSize:13}}>
                Sin detalle de partidas registradas.
              </div>
            )}
            <div style={{padding:'12px 16px', borderTop:'1px solid var(--border)'}}>
              <div style={{width:280, marginLeft:'auto'}}>
                <div className="row" style={{justifyContent:'space-between', marginBottom:6}}>
                  <span className="text-muted" style={{fontSize:13}}>Subtotal</span>
                  <span className="num">{moneyCurrency(v.subtotal, v.moneda)}</span>
                </div>
                <div className="row" style={{justifyContent:'space-between', marginBottom:6}}>
                  <span className="text-muted" style={{fontSize:13}}>IGV</span>
                  <span className="num">{moneyCurrency(v.igv, v.moneda)}</span>
                </div>
                <div className="row" style={{justifyContent:'space-between', paddingTop:6, borderTop:'1px solid var(--border)', fontWeight:700, fontSize:15, fontFamily:'Sora'}}>
                  <span>Total</span>
                  <span className="num">{moneyCurrency(v.total, v.moneda)}</span>
                </div>
              </div>
            </div>
            {v.notas && (
              <div style={{padding:'12px 16px', borderTop:'1px solid var(--border)'}}>
                <div style={{fontSize:11, color:'var(--fg-muted)', marginBottom:4}}>Notas</div>
                <div style={{fontSize:13, whiteSpace:'pre-wrap'}}>{v.notas}</div>
              </div>
            )}
          </div>
        )}

        {/* Tab: OTs incluidas */}
        {fichaTab === 'ots' && (
          <div className="card card-body">
            {otsIncluidas.length === 0 ? (
              <div style={{textAlign:'center', color:'var(--fg-muted)', fontSize:13, padding:24}}>
                No hay OTs registradas en esta valorización.
              </div>
            ) : otsIncluidas.map(ot => {
              const ct = cierresTecnicos.find(c => c.ot_id === ot.id);
              return (
                <div key={ot.id} style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, padding:'12px 14px', marginBottom:8, borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-card)'}}>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontWeight:600, fontSize:13}}>{ot.numero}</div>
                    <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:2}}>{ot.descripcion || '—'}</div>
                    <div style={{display:'flex', gap:20, marginTop:6, fontSize:11, color:'var(--fg-muted)', flexWrap:'wrap'}}>
                      <span>Avance: <strong style={{color:'var(--cyan)'}}>{ct?.avance_final ?? ot.avance ?? '—'}%</strong></span>
                      <span>Cierre: <strong style={{color:'var(--fg)'}}>{ct?.fecha || ot.fecha_fin || '—'}</strong></span>
                      <span>Costo real: <strong style={{color:'var(--fg)'}}>{moneyCurrency(ot.costoReal || 0, monedaOs)}</strong></span>
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm" style={{fontSize:11, whiteSpace:'nowrap'}}
                    onClick={() => navigate('cierre', { detail: ot.id })}>
                    Ver cierre
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab: Historial */}
        {fichaTab === 'historial' && (
          <div className="card card-body">
            {historial.length === 0 ? (
              <div style={{textAlign:'center', color:'var(--fg-muted)', fontSize:13, padding:24}}>
                Sin historial de cambios registrado.
              </div>
            ) : [...historial].reverse().map((h, i) => (
              <div key={i} style={{display:'flex', gap:14, padding:'10px 0', borderBottom: i < historial.length - 1 ? '1px solid var(--border)' : 'none'}}>
                <div style={{
                  width:8, height:8, borderRadius:'50%', marginTop:5, flexShrink:0,
                  background: h.estado === 'aprobada' ? 'var(--green)' : h.estado === 'anulada' ? 'var(--danger)' : h.estado === 'facturada' ? 'var(--blue)' : 'var(--fg-muted)',
                }} />
                <div style={{flex:1}}>
                  <div style={{fontWeight:600, fontSize:13}}>{h.accion || h.estado || '—'}</div>
                  <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:2}}>
                    {h.fecha ? new Date(h.fecha).toLocaleString('es-PE', { dateStyle:'medium', timeStyle:'short' }) : '—'}
                    {h.usuario && <span style={{marginLeft:8}}>· {h.usuario}</span>}
                  </div>
                  {h.motivo && <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:4, fontStyle:'italic'}}>{h.motivo}</div>}
                </div>
                <span className={'badge ' + badgeC(h.estado)}>{badgeL(h.estado)}</span>
              </div>
            ))}
          </div>
        )}
        </div>{/* end side-panel-body */}
        </div>{/* end side-panel */}
      </>
    );
    } // end if (v)
  } // end if (selVal)

  // ── Editing view (4-step wizard) ──────────────────────────────────────
  if (editing) {
    const stepLabels = ['Datos generales', 'OTs incluidas', 'Partidas', 'Resumen'];
    return (
      <>
        {/* Header */}
        <div className="page-header" style={{borderBottom:'none', paddingBottom:0}}>
          <div>
            <button className="btn btn-ghost" onClick={resetAndClose} style={{marginBottom:10, padding:0, color:'var(--cyan)'}}>← Volver a Valorizaciones</button>
            <h1 className="page-title">{editingValId ? 'Editar Valorización' : 'Generar Valorización'}</h1>
            <div className="page-sub">
              {selOs ? `${getOs(selOs)?.numero} — ${getClienteNombre(selOs)}` : 'Complete los pasos para crear la valorización'}
            </div>
          </div>
          <div className="row">
            {step > 1 && <button className="btn btn-secondary" onClick={() => setStep(s => s - 1)}>← Anterior</button>}
            {step < 4 && (
              <button className="btn btn-primary"
                disabled={(step === 1 && (!selOs || !modelo || !!valDuplicada)) || (step === 2 && otSeleccionadas.length === 0)}
                onClick={step === 2 ? advanceToStep3 : () => setStep(s => s + 1)}>
                Siguiente →
              </button>
            )}
            {step === 4 && (() => {
              const os4 = getOs(selOs);
              const saldo4 = Number(os4?.saldo_por_valorizar || 0);
              const excede4 = saldo4 > 0 && totalVal > saldo4;
              return <>
                <button className="btn btn-secondary" onClick={() => handleSave('borrador')}>{I.save} Guardar borrador</button>
                <button className="btn btn-primary" disabled={partidas.length === 0 || (excede4 && !confirmarExceso)} onClick={() => handleSave('aprobada')}>{I.check} Aprobar Valorización</button>
              </>;
            })()}
          </div>
        </div>

        {/* Step indicator */}
        <div style={{display:'flex', gap:0, margin:'16px 0', borderRadius:8, overflow:'hidden', border:'1px solid var(--border)'}}>
          {stepLabels.map((label, i) => (
            <div key={i} style={{
              flex:1, padding:'10px 12px', textAlign:'center', fontSize:12,
              fontWeight: step === i+1 ? 700 : 400,
              color: step > i ? 'var(--green)' : step === i+1 ? 'var(--fg)' : 'var(--fg-muted)',
              borderBottom: `2px solid ${step === i+1 ? 'var(--cyan)' : step > i ? 'var(--green)' : 'transparent'}`,
              background: step === i+1 ? 'color-mix(in srgb, var(--cyan) 6%, transparent)' : 'var(--bg-card)',
              borderRight: i < 3 ? '1px solid var(--border)' : 'none',
            }}>
              <span style={{
                display:'inline-flex', alignItems:'center', justifyContent:'center',
                width:18, height:18, borderRadius:'50%', marginRight:5,
                background: step > i ? 'var(--green)' : step === i+1 ? 'var(--cyan)' : 'var(--border)',
                color: step >= i+1 ? '#fff' : 'var(--fg-muted)',
                fontSize:10, fontWeight:700,
              }}>
                {step > i ? '✓' : i+1}
              </span>
              {label}
            </div>
          ))}
        </div>

        {/* ─── PASO 1 — Datos generales ─── */}
        {step === 1 && (
          <div className="card">
            <div className="card-body">
              <div className="grid-2" style={{gap:24}}>
                <div className="input-group">
                  <label>N° Valorización</label>
                  <input className="input" value={nextNumero} readOnly style={{color:'var(--fg-muted)', cursor:'default'}} />
                </div>
                <div className="input-group">
                  <label>Período de ejecución</label>
                  <div style={{display:'flex', gap:8}}>
                    <select className="select" style={{flex:2}} value={periodoMes} onChange={e => setPeriodoMes(Number(e.target.value))}>
                      {MESES_VAL.map((m, i) => <option key={i} value={i}>{m}</option>)}
                    </select>
                    <select className="select" style={{flex:1}} value={periodoAnio} onChange={e => setPeriodoAnio(Number(e.target.value))}>
                      {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>OS Cliente asociada <span style={{color:'var(--danger)'}}>*</span></label>
                  <select className="select" value={selOs} onChange={e => handleSelOs(e.target.value)}>
                    <option value="">Seleccione OS Cliente...</option>
                    {osConOts.map(os => (
                      <option key={os.id} value={os.id}>
                        {os.numero} — {getClienteNombre(os.id)} — Saldo: {moneyCurrency(os.saldo_por_valorizar || 0, os.moneda)}
                      </option>
                    ))}
                  </select>
                  {osConOts.length === 0 && (
                    <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:6}}>
                      No hay OS con OTs en ejecución o cerradas con conformidad registrada.
                    </div>
                  )}
                  {valDuplicada && (
                    <div style={{marginTop:8, padding:'10px 12px', borderRadius:6, fontSize:12, color:'var(--danger)', border:'1px solid var(--danger)', background:'color-mix(in srgb, var(--danger) 6%, transparent)'}}>
                      Ya existe una valorización en estado <strong>{valDuplicada.estado}</strong> para esta OS en el período <strong>{periodo}</strong> ({valDuplicada.numero}). Cambia el período o anula la existente.
                    </div>
                  )}
                </div>
                <SociedadReadOnlyField {...destinoValorizacion} style={{gridColumn:'1/-1'}} />
                <div className="input-group" style={{gridColumn:'1/-1'}}>
                  <label>Modelo de cálculo <span style={{color:'var(--danger)'}}>*</span></label>
                  <select className="select" value={modelo} onChange={e => setModelo(e.target.value)}>
                    <option value="">Seleccione modelo...</option>
                    <option value="avance_pct">Por avance %</option>
                    <option value="costo_real">Por costo real</option>
                    <option value="hitos_pago">Por hitos de pago</option>
                  </select>
                  {modelo && (
                    <div style={{marginTop:8, padding:'10px 12px', borderRadius:6, fontSize:12, color:'var(--fg-muted)', background:'var(--bg-subtle)'}}>
                      {modelo === 'avance_pct' && '% de avance de cada OT aplicado sobre el monto de cotización, descontando lo ya valorizado.'}
                      {modelo === 'costo_real' && 'Costo real de ejecución (MO + materiales + terceros + logística) más el margen definido.'}
                      {modelo === 'hitos_pago' && 'Hitos de pago definidos en la cotización. Selecciona los completados en el período.'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── PASO 2 — OTs incluidas ─── */}
        {step === 2 && (
          <div className="card">
            <div className="card-body">
              <div style={{marginBottom:16}}>
                <h3 style={{margin:0}}>OTs disponibles para valorizar</h3>
                <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:4}}>
                  OTs en ejecución o cerradas con conformidad del cliente. Las valorizaciones parciales mantienen la ejecución; al llegar al 100% de la OS, la OT pasa a Pendiente cierre.
                </div>
              </div>
              {otsDisponibles.length === 0 ? (
                <div style={{textAlign:'center', padding:32, color:'var(--fg-muted)'}}>
                  No hay OTs disponibles para esta OS.
                </div>
              ) : otsDisponibles.map(ot => {
                const ct = cierresTecnicos.find(c => c.ot_id === ot.id);
                const checked = otSeleccionadas.includes(ot.id);
                const esEjecucion = ot.estado === 'ejecucion';
                return (
                  <div key={ot.id} style={{
                    display:'flex', alignItems:'flex-start', gap:12, padding:'12px 14px',
                    marginBottom:8, borderRadius:6, cursor:'pointer',
                    border: checked ? '1px solid var(--cyan)' : '1px solid var(--border)',
                    background: checked ? 'color-mix(in srgb, var(--cyan) 5%, transparent)' : 'var(--bg-card)',
                  }} onClick={() => setOtSeleccionadas(prev => prev.includes(ot.id) ? prev.filter(id => id !== ot.id) : [...prev, ot.id])}>
                    <input type="checkbox" checked={checked} readOnly style={{marginTop:3, pointerEvents:'none'}} />
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{display:'flex', alignItems:'center', gap:8}}>
                        <span style={{fontWeight:600, fontSize:13}}>{ot.numero}</span>
                        <span style={{
                          fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:4,
                          background: esEjecucion ? 'color-mix(in srgb, var(--orange) 15%, transparent)' : 'color-mix(in srgb, var(--green) 15%, transparent)',
                          color: esEjecucion ? 'var(--orange)' : 'var(--green)',
                        }}>
                          {esEjecucion ? 'En ejecución' : 'Cerrada'}
                        </span>
                      </div>
                      <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                        {ot.descripcion || '—'}
                      </div>
                      <div style={{display:'flex', gap:20, marginTop:6, fontSize:11, color:'var(--fg-muted)', flexWrap:'wrap'}}>
                        {!esEjecucion && <span>Cierre: <strong style={{color:'var(--fg)'}}>{ct?.fecha || ot.fecha_fin || '—'}</strong></span>}
                        <span>Avance: <strong style={{color:'var(--cyan)'}}>{ct?.avance_final ?? ot.avance ?? '—'}%</strong></span>
                        <span>Horas: <strong style={{color:'var(--fg)'}}>{ct?.horas_total || '—'}</strong></span>
                        <span>Costo real: <strong style={{color:'var(--fg)'}}>{moneyCurrency(ot.costoReal || 0, monedaOs)}</strong></span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {otsConformidadPend.length > 0 && (
                <div style={{marginTop:16, padding:'12px 14px', borderRadius:6, border:'1px solid var(--orange)', background:'color-mix(in srgb, var(--orange) 8%, transparent)'}}>
                  <div style={{fontWeight:600, fontSize:13, color:'var(--orange)', marginBottom:8}}>
                    {otsConformidadPend.length} OT{otsConformidadPend.length !== 1 ? 's' : ''} con conformidad pendiente — no disponibles para valorizar
                  </div>
                  {otsConformidadPend.map(ot => (
                    <div key={ot.id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:12, marginTop:6}}>
                      <span style={{fontWeight:500}}>{ot.numero} <span style={{color:'var(--fg-muted)', fontWeight:400}}>— {ot.responsable || ''}</span></span>
                      <button className="btn btn-secondary btn-sm" style={{fontSize:11}} onClick={() => navigate('cierre')}>Registrar conformidad</button>
                    </div>
                  ))}
                </div>
              )}
              {otsBloqueadasBorrador.length > 0 && (
                <div style={{marginTop:12, padding:'12px 14px', borderRadius:6, border:'1px solid var(--fg-muted)', background:'var(--bg-subtle)'}}>
                  <div style={{fontWeight:600, fontSize:13, color:'var(--fg-muted)', marginBottom:6}}>
                    {otsBloqueadasBorrador.length} OT{otsBloqueadasBorrador.length !== 1 ? 's' : ''} en borrador sin aprobar — no disponibles
                  </div>
                  {otsBloqueadasBorrador.map(ot => (
                    <div key={ot.id} style={{fontSize:12, color:'var(--fg-muted)', marginTop:4}}>
                      {ot.numero} — {ot.descripcion || ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── PASO 3 — Partidas según modelo ─── */}
        {step === 3 && (
          <div className="card">
            <div className="card-body">
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, paddingBottom:8, borderBottom:'1px solid var(--border)'}}>
                <div>
                  <h3 style={{margin:0}}>Partidas — {MODELO_LABELS[modelo]}</h3>
                  <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:4}}>
                    {modelo === 'avance_pct' && 'Montos calculados. Puedes ajustar el importe a valorizar.'}
                    {modelo === 'costo_real' && 'Costos tomados de partes aprobados y cierre técnico. Ajusta el margen por OT.'}
                    {modelo === 'hitos_pago' && 'Incluye los hitos o conceptos a valorizar en este período.'}
                  </div>
                </div>
                {modelo === 'hitos_pago' && (
                  <button className="btn btn-secondary btn-sm" onClick={addPartida}>{I.plus} Agregar línea</button>
                )}
              </div>

              {/* Referencia OS Cliente */}
              {(() => {
                const osRef = getOs(selOs);
                if (!osRef) return null;
                const aprobado = Number(osRef.monto_aprobado || 0);
                const saldo    = Number(osRef.saldo_por_valorizar ?? aprobado);
                const yaVal    = aprobado - saldo;
                return (
                  <div style={{display:'flex', gap:24, padding:'10px 14px', borderRadius:6, background:'var(--bg-subtle)', border:'1px solid var(--border)', marginBottom:16, fontSize:13}}>
                    <div>
                      <span style={{color:'var(--fg-muted)', marginRight:6}}>Monto aprobado OS:</span>
                      <strong>{moneyCurrency(aprobado, monedaOs)}</strong>
                    </div>
                    <div>
                      <span style={{color:'var(--fg-muted)', marginRight:6}}>Ya valorizado:</span>
                      <strong>{moneyCurrency(yaVal, monedaOs)}</strong>
                    </div>
                    <div>
                      <span style={{color:'var(--fg-muted)', marginRight:6}}>Saldo pendiente:</span>
                      <strong style={{color: saldo < 0 ? 'var(--danger)' : 'var(--green)'}}>{moneyCurrency(saldo, monedaOs)}</strong>
                    </div>
                  </div>
                );
              })()}

              {/* Modelo A — Por avance % */}
              {modelo === 'avance_pct' && (
                <div className="table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>OT / Descripción</th>
                        <th style={{width:90}}>Avance</th>
                        <th style={{width:140}} className="num">Monto Base</th>
                        <th style={{width:140}} className="num">Ya Valorizado</th>
                        <th style={{width:160}} className="num">A Valorizar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {partidas.map(p => (
                        <tr key={p.id}>
                          <td style={{fontSize:12}}>{p.descripcion}</td>
                          <td className="num" style={{fontWeight:700, color:'var(--cyan)'}}>{p._avance_pct}%</td>
                          <td className="num text-muted">{moneyCurrency(p._monto_base || 0, monedaOs)}</td>
                          <td className="num text-muted">{moneyCurrency(p._ya_valorizado || 0, monedaOs)}</td>
                          <td>
                            <input type="number" className="input num" min="0" value={p.precio_unitario}
                              onChange={e => updatePartida(p.id, 'precio_unitario', Number(e.target.value))} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Modelo B — Por costo real */}
              {modelo === 'costo_real' && (
                <div className="table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>OT / Descripción</th>
                        <th style={{width:100}} className="num">M.O.</th>
                        <th style={{width:100}} className="num">Materiales</th>
                        <th style={{width:100}} className="num">Terceros</th>
                        <th style={{width:90}} className="num">Logística</th>
                        <th style={{width:120}} className="num">Costo Real</th>
                        <th style={{width:110}}>Margen %</th>
                        <th style={{width:130}} className="num">A Valorizar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {partidas.map(p => (
                        <tr key={p.id}>
                          <td style={{fontSize:12}}>{p.descripcion}</td>
                          <td className="num text-muted">{moneyCurrency(p._costo_mo || 0, monedaOs)}</td>
                          <td className="num text-muted">{moneyCurrency(p._costo_materiales || 0, monedaOs)}</td>
                          <td className="num text-muted">{moneyCurrency(p._costo_terceros || 0, monedaOs)}</td>
                          <td className="num text-muted">{moneyCurrency(p._costo_logistica || 0, monedaOs)}</td>
                          <td className="num" style={{fontWeight:600}}>{moneyCurrency(p._costo_real || 0, monedaOs)}</td>
                          <td>
                            <div style={{display:'flex', alignItems:'center', gap:4}}>
                              <input type="number" className="input num" min="0" max="200" style={{width:64}}
                                value={p._margen_pct ?? 25}
                                onChange={e => updateMargen(p.id, Number(e.target.value))} />
                              <span style={{fontSize:12, color:'var(--fg-muted)'}}>%</span>
                            </div>
                          </td>
                          <td className="num" style={{fontWeight:700, color:'var(--green)'}}>{moneyCurrency(p.precio_unitario, monedaOs)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{borderTop:'2px solid var(--border)'}}>
                        <td style={{fontWeight:700, fontSize:13}}>Total a valorizar</td>
                        <td className="num" style={{fontWeight:600, color:'var(--fg-muted)'}}>{moneyCurrency(partidas.reduce((s,p) => s + (p._costo_mo||0), 0), monedaOs)}</td>
                        <td className="num" style={{fontWeight:600, color:'var(--fg-muted)'}}>{moneyCurrency(partidas.reduce((s,p) => s + (p._costo_materiales||0), 0), monedaOs)}</td>
                        <td className="num" style={{fontWeight:600, color:'var(--fg-muted)'}}>{moneyCurrency(partidas.reduce((s,p) => s + (p._costo_terceros||0), 0), monedaOs)}</td>
                        <td className="num" style={{fontWeight:600, color:'var(--fg-muted)'}}>{moneyCurrency(partidas.reduce((s,p) => s + (p._costo_logistica||0), 0), monedaOs)}</td>
                        <td className="num" style={{fontWeight:700}}>{moneyCurrency(partidas.reduce((s,p) => s + (p._costo_real||0), 0), monedaOs)}</td>
                        <td />
                        <td className="num" style={{fontWeight:700, fontSize:14, color:'var(--green)'}}>{moneyCurrency(partidas.reduce((s,p) => s + (Number(p.precio_unitario)||0), 0), monedaOs)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Modelo C — Por hitos de pago */}
              {modelo === 'hitos_pago' && (
                <>
                  {!getCot(selOs)?.hitos_pago?.length && (
                    <div style={{padding:'10px 12px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-subtle)', marginBottom:16, fontSize:12, color:'var(--fg-muted)'}}>
                      No se encontraron hitos en la cotización vinculada. Ingresa las partidas manualmente.
                    </div>
                  )}
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Concepto / Hito</th>
                          <th style={{width:90}}>Cant.</th>
                          <th style={{width:140}}>Monto</th>
                          <th style={{width:40}}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {partidas.map(p => (
                          <tr key={p.id}>
                            <td><input type="text" className="input" value={p.descripcion} onChange={e => updatePartida(p.id, 'descripcion', e.target.value)} /></td>
                            <td><input type="number" className="input num" min="1" value={p.cantidad} onChange={e => updatePartida(p.id, 'cantidad', Number(e.target.value))} /></td>
                            <td><input type="number" className="input num" min="0" value={p.precio_unitario} onChange={e => updatePartida(p.id, 'precio_unitario', Number(e.target.value))} /></td>
                            <td><button className="icon-btn text-danger" onClick={() => removePartida(p.id)}>{I.x}</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ─── PASO 4 — Resumen y ajustes finales ─── */}
        {step === 4 && (
          <div className="card">
            <div className="card-body">
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, paddingBottom:8, borderBottom:'1px solid var(--border)'}}>
                <div>
                  <h3 style={{margin:0}}>Partidas de la valorización</h3>
                  <div style={{fontSize:12, color:'var(--fg-muted)', marginTop:4}}>
                    Modelo: <strong>{MODELO_LABELS[modelo]}</strong> · Período: <strong>{periodo}</strong>
                  </div>
                </div>
                {modelo === 'hitos_pago' && (
                  <button className="btn btn-secondary btn-sm" onClick={addPartida}>{I.plus} Agregar línea</button>
                )}
              </div>

              {/* Referencia OS Cliente — simulando impacto de esta valorización */}
              {(() => {
                const osRef = getOs(selOs);
                if (!osRef) return null;
                const aprobado      = Number(osRef.monto_aprobado || 0);
                const saldo         = Number(osRef.saldo_por_valorizar ?? aprobado);
                const yaVal         = aprobado - saldo;
                const saldoFinal    = saldo - totalVal;
                return (
                  <div style={{display:'flex', gap:24, padding:'10px 14px', borderRadius:6, background:'var(--bg-subtle)', border:'1px solid var(--border)', marginBottom:16, fontSize:13, flexWrap:'wrap'}}>
                    <div>
                      <span style={{color:'var(--fg-muted)', marginRight:6}}>Monto aprobado OS:</span>
                      <strong>{moneyCurrency(aprobado, monedaOs)}</strong>
                    </div>
                    <div>
                      <span style={{color:'var(--fg-muted)', marginRight:6}}>Ya valorizado:</span>
                      <strong>{moneyCurrency(yaVal, monedaOs)}</strong>
                    </div>
                    <div>
                      <span style={{color:'var(--fg-muted)', marginRight:6}}>Esta valorización:</span>
                      <strong style={{color:'var(--cyan)'}}>{moneyCurrency(totalVal, monedaOs)}</strong>
                    </div>
                    <div>
                      <span style={{color:'var(--fg-muted)', marginRight:6}}>Saldo resultante:</span>
                      <strong style={{color: saldoFinal < 0 ? 'var(--danger)' : 'var(--green)'}}>{moneyCurrency(saldoFinal, monedaOs)}</strong>
                    </div>
                  </div>
                );
              })()}

              {modelo !== 'hitos_pago' && (
                <div style={{marginBottom:12, padding:'8px 12px', borderRadius:6, background:'color-mix(in srgb, var(--cyan) 8%, transparent)', border:'1px solid color-mix(in srgb, var(--cyan) 30%, transparent)', fontSize:12, color:'var(--fg-muted)'}}>
                  Para ajustar los montos, regresa al paso <strong>Partidas</strong> y modifica el margen por OT.
                </div>
              )}
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th style={{width:90}}>Cant.</th>
                      <th style={{width:130}} className="num">P. Unitario</th>
                      <th style={{width:130}} className="num">Subtotal</th>
                      {modelo === 'hitos_pago' && <th style={{width:40}}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {partidas.map(p => (
                      <tr key={p.id}>
                        {modelo === 'hitos_pago' ? (
                          <>
                            <td><input type="text" className="input" value={p.descripcion} onChange={e => updatePartida(p.id, 'descripcion', e.target.value)} /></td>
                            <td><input type="number" className="input num" min="1" value={p.cantidad} onChange={e => updatePartida(p.id, 'cantidad', e.target.value)} /></td>
                            <td><input type="number" className="input num" min="0" value={p.precio_unitario} onChange={e => updatePartida(p.id, 'precio_unitario', e.target.value)} /></td>
                            <td className="num" style={{fontWeight:600}}>{moneyCurrency(Number(p.cantidad) * Number(p.precio_unitario), monedaOs)}</td>
                            <td><button className="icon-btn text-danger" onClick={() => removePartida(p.id)}>{I.x}</button></td>
                          </>
                        ) : (
                          <>
                            <td style={{fontSize:12}}>{p.descripcion}</td>
                            <td className="num text-muted">{p.cantidad}</td>
                            <td className="num">{moneyCurrency(Number(p.precio_unitario), monedaOs)}</td>
                            <td className="num" style={{fontWeight:600}}>{moneyCurrency(Number(p.cantidad) * Number(p.precio_unitario), monedaOs)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                    {partidas.length === 0 && (
                      <tr><td colSpan={modelo === 'hitos_pago' ? 5 : 4} style={{textAlign:'center', padding:24, color:'var(--fg-muted)'}}>
                        Sin partidas — agrega al menos una línea.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div style={{display:'flex', justifyContent:'flex-end', marginTop:24}}>
                <div style={{width:320, padding:'16px 20px', background:'var(--bg-subtle)', borderRadius:8}}>
                  <div className="row" style={{justifyContent:'space-between', marginBottom:10}}>
                    <span className="text-muted">Subtotal</span>
                    <span className="num">{moneyCurrency(subtotalVal, monedaOs)}</span>
                  </div>
                  <div className="row" style={{justifyContent:'space-between', marginBottom:10, alignItems:'center'}}>
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <span className="text-muted">IGV</span>
                      <input type="number" className="input num" min="0" max="100"
                        style={{width:60, padding:'3px 6px', fontSize:12}}
                        value={igvPct} onChange={e => setIgvPct(Number(e.target.value))} />
                      <span style={{fontSize:12, color:'var(--fg-muted)'}}>%</span>
                    </div>
                    <span className="num">{moneyCurrency(igvAmount, monedaOs)}</span>
                  </div>
                  <div className="row" style={{justifyContent:'space-between', paddingTop:10, borderTop:'1px solid var(--border)', fontWeight:700, fontSize:16, fontFamily:'Sora'}}>
                    <span>Total a Valorizar</span>
                    <span className="num">{moneyCurrency(totalVal, monedaOs)}</span>
                  </div>
                </div>
              </div>

              {/* Banner retención SUNAT */}
              {(() => {
                const cuentaOs = (cuentas || []).find(x => x.id === getOs(selOs)?.cuenta_id);
                if (!cuentaOs?.agente_retencion_sunat) return null;
                const tasaRet = Number(cuentaOs.tasa_retencion_sunat || 3);
                const montoRet = Math.round(totalVal * (tasaRet / 100) * 100) / 100;
                const netoEst = totalVal - montoRet;
                return (
                  <div style={{marginTop:20, padding:'12px 16px', borderRadius:8, border:'1px solid rgba(251,191,36,0.4)', background:'rgba(251,191,36,0.06)', display:'flex', flexDirection:'column', gap:6}}>
                    <div style={{fontWeight:700, fontSize:13, color:'var(--warning)'}}>
                      ⚠ {cuentaOs.razon_social || cuentaOs.nombre_comercial} es Agente de Retención SUNAT ({tasaRet}%)
                    </div>
                    <div style={{fontSize:12, color:'var(--fg-muted)'}}>
                      Al facturar esta valorización se calculará automáticamente la retención. Estimado sobre el subtotal:
                    </div>
                    <div style={{display:'flex', gap:24, fontSize:12, flexWrap:'wrap'}}>
                      <span>Retención estimada: <strong style={{color:'var(--warning)'}}>- {moneyCurrency(montoRet, monedaOs)}</strong></span>
                      <span>Neto a cobrar estimado: <strong style={{color:'var(--cyan)'}}>{moneyCurrency(netoEst, monedaOs)}</strong></span>
                    </div>
                  </div>
                );
              })()}

              {/* Saldo warning */}
              {(() => {
                const os = getOs(selOs);
                const saldo = Number(os?.saldo_por_valorizar || 0);
                const excede = saldo > 0 && totalVal > saldo;
                if (!excede) return null;
                return (
                  <div style={{marginTop:20, padding:'14px 16px', borderRadius:8, border:'1px solid var(--orange)', background:'color-mix(in srgb, var(--orange) 8%, transparent)'}}>
                    <div style={{fontWeight:600, fontSize:13, color:'var(--orange)', marginBottom:4}}>
                      Total excede el saldo por valorizar
                    </div>
                    <div style={{fontSize:12, marginBottom:10}}>
                      Esta valorización ({moneyCurrency(totalVal, monedaOs)}) supera el saldo disponible de la OS ({moneyCurrency(saldo, monedaOs)}).
                      Solo confirma si tienes autorización para exceder el monto aprobado.
                    </div>
                    <label style={{display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer'}}>
                      <input type="checkbox" checked={confirmarExceso} onChange={e => setConfirmarExceso(e.target.checked)} />
                      Confirmo que estoy autorizado a exceder el saldo de la OS
                    </label>
                  </div>
                );
              })()}

              {/* Notas */}
              <div className="input-group" style={{marginTop:24}}>
                <label>Notas <span style={{color:'var(--fg-muted)', fontWeight:400}}>(opcional)</span></label>
                <textarea className="input" rows={3} value={notas} onChange={e => setNotas(e.target.value)}
                  placeholder="Observaciones, aclaraciones o condiciones adicionales..." />
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  const badgeClass = e => ({ aprobada: 'badge-green', facturada: 'badge-navy', anulada: 'badge-red' }[e] || 'badge-gray');
  const badgeLabel = e => ({ borrador: 'Borrador', aprobada: 'Aprobada', facturada: 'Facturada', anulada: 'Anulada' }[e] || (e || '—'));

  // KPIs
  const hoy = new Date();
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const valMes = valorizacionesVista.filter(v => (v.fecha || '').startsWith(mesActual)).length;
  const montoPendientePEN = valorizacionesVista.filter(v => v.estado === 'aprobada' && (v.moneda || 'PEN') === 'PEN').reduce((s, v) => s + Number(v.total || 0), 0);
  const montoPendienteUSD = valorizacionesVista.filter(v => v.estado === 'aprobada' && v.moneda === 'USD').reduce((s, v) => s + Number(v.total || 0), 0);
  const montoFacturadoPEN = valorizacionesVista.filter(v => v.estado === 'facturada' && (v.moneda || 'PEN') === 'PEN').reduce((s, v) => s + Number(v.total || 0), 0);
  const montoFacturadoUSD = valorizacionesVista.filter(v => v.estado === 'facturada' && v.moneda === 'USD').reduce((s, v) => s + Number(v.total || 0), 0);
  const otsListasCount = ots.filter(ot => ESTADOS_VALORIZABLES.includes(ot.estado) && conformidadOK(ot)).length;

  // Unique filter options from data
  const clienteOpts = [...new Map(valorizacionesVista.map(v => {
    const cId = getClienteId(v.os_cliente_id);
    return [cId, getClienteNombre(v.os_cliente_id)];
  })).entries()].filter(([k]) => k);
  const osOpts = [...new Map(valorizacionesVista.map(v => [v.os_cliente_id, getOs(v.os_cliente_id)?.numero || v.os_cliente_id])).entries()];
  const periodoOpts = [...new Set(valorizacionesVista.map(v => v.periodo).filter(Boolean))];
  const modeloOpts = [...new Set(valorizacionesVista.map(v => v.modelo_calculo).filter(Boolean))];

  // Filtering
  const query = searchQuery.toLowerCase();
  const filtered = valorizacionesVista.filter(v => {
    if (filterCliente && getClienteId(v.os_cliente_id) !== filterCliente) return false;
    if (filterOs && v.os_cliente_id !== filterOs) return false;
    if (filterEstado && v.estado !== filterEstado) return false;
    if (filterMoneda && (v.moneda || 'PEN') !== filterMoneda) return false;
    if (filterPeriodo && (v.periodo || '') !== filterPeriodo) return false;
    if (filterModelo && (v.modelo_calculo || '') !== filterModelo) return false;
    if (query) {
      return (v.numero || '').toLowerCase().includes(query) ||
        (getOs(v.os_cliente_id)?.numero || '').toLowerCase().includes(query) ||
        getClienteNombre(v.os_cliente_id).toLowerCase().includes(query) ||
        (v.periodo || '').toLowerCase().includes(query);
    }
    return true;
  });

  const hasFilters = filterCliente || filterOs || filterEstado || filterMoneda || filterPeriodo || filterModelo;

  return (
    <>
      {fichaVal}
      <div className="page-header">
        <div>
          <h1 className="page-title">Valorizaciones</h1>
          <div className="page-sub">{valorizacionesVista.length} valorizaciones registradas</div>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing(true)}>{I.plus} Generar Valorización</button>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi-card">
          <div className="kpi-label">Valorizaciones este mes</div>
          <div className="kpi-value" style={{marginTop:12}}>{valMes}</div>
          <div className="kpi-icon cyan">{I.clipboard}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Pendiente de facturar</div>
          <div className="kpi-value" style={{fontSize:20, display:'flex', flexDirection:'column', gap:4, marginTop:12}}>
            <span>{money(montoPendientePEN)}</span>
            {montoPendienteUSD > 0 && <span style={{fontSize:16, color:'var(--fg-muted)'}}>{moneyCurrency(montoPendienteUSD, 'USD')}</span>}
          </div>
          <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:4}}>Estado aprobada</div>
          <div className="kpi-icon orange">{I.clock}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total facturado</div>
          <div className="kpi-value" style={{fontSize:20, display:'flex', flexDirection:'column', gap:4, marginTop:12}}>
            <span>{money(montoFacturadoPEN)}</span>
            {montoFacturadoUSD > 0 && <span style={{fontSize:16, color:'var(--fg-muted)'}}>{moneyCurrency(montoFacturadoUSD, 'USD')}</span>}
          </div>
          <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:4}}>Estado facturada</div>
          <div className="kpi-icon green">{I.check}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">OTs listas para valorizar</div>
          <div className="kpi-value" style={{marginTop:12}}>{otsListasCount}</div>
          <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:4}}>Con conformidad registrada</div>
          <div className="kpi-icon cyan">{I.warehouse}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card" style={{marginBottom:8}}>
        <div style={{padding:'12px 16px', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center'}}>
          <select className="select" style={{flex:'1 1 160px', minWidth:140}} value={filterCliente} onChange={e => setFilterCliente(e.target.value)}>
            <option value="">Todos los clientes</option>
            {clienteOpts.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
          <select className="select" style={{flex:'1 1 160px', minWidth:140}} value={filterOs} onChange={e => setFilterOs(e.target.value)}>
            <option value="">Todas las OS</option>
            {osOpts.map(([id, num]) => <option key={id} value={id}>{num}</option>)}
          </select>
          <select className="select" style={{flex:'1 1 140px', minWidth:120}} value={filterEstado} onChange={e => setFilterEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="borrador">Borrador</option>
            <option value="aprobada">Aprobada</option>
            <option value="facturada">Facturada</option>
            <option value="anulada">Anulada</option>
          </select>
          <select className="select" style={{flex:'1 1 140px', minWidth:120}} value={filterPeriodo} onChange={e => setFilterPeriodo(e.target.value)}>
            <option value="">Todos los períodos</option>
            {periodoOpts.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="select" style={{flex:'1 1 160px', minWidth:140}} value={filterModelo} onChange={e => setFilterModelo(e.target.value)}>
            <option value="">Todos los modelos</option>
            {modeloOpts.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="select" style={{flex:'1 1 110px', minWidth:100}} value={filterMoneda} onChange={e => setFilterMoneda(e.target.value)}>
            <option value="">Todas las monedas</option>
            <option value="PEN">S/ Soles (PEN)</option>
            <option value="USD">US$ Dólares (USD)</option>
          </select>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFilterCliente(''); setFilterOs(''); setFilterEstado(''); setFilterMoneda(''); setFilterPeriodo(''); setFilterModelo(''); }}>
              {I.x} Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>N° Valorización</th>
                {mostrarBadgeSociedadValorizaciones && <th>Sociedad</th>}
                <th>OS Cliente</th>
                <th>Cliente</th>
                <th>Período</th>
                <th>Modelo</th>
                <th className="num">Subtotal</th>
                <th className="num">IGV</th>
                <th className="num">Total</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id} className="hover-row" style={{cursor:'pointer'}} onClick={() => setSelVal(v.id)}>
                  <td className="mono" style={{fontWeight:600}}>{v.numero}</td>
                  {mostrarBadgeSociedadValorizaciones && <td><SociedadBadge sociedadId={v.sociedad_id} /></td>}
                  <td className="mono text-muted">{getOs(v.os_cliente_id)?.numero || '—'}</td>
                  <td style={{maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{getClienteNombre(v.os_cliente_id)}</td>
                  <td className="text-muted">{v.periodo || '—'}</td>
                  <td className="text-muted" style={{fontSize:12}}>{MODELO_LABELS[v.modelo_calculo] || v.modelo_calculo || '—'}</td>
                  <td className="num">{moneyCurrency(v.subtotal, v.moneda)}</td>
                  <td className="num">{moneyCurrency(v.igv, v.moneda)}</td>
                  <td className="num" style={{fontWeight:600}}>{moneyCurrency(v.total, v.moneda)}</td>
                  <td>
                    <div style={{display:'flex', gap:6, alignItems:'center', flexWrap:'wrap'}}>
                      <span className={'badge ' + badgeClass(v.estado)}>{badgeLabel(v.estado)}</span>
                      {v.tipo === 'avance' && <span style={{fontSize:10, fontWeight:700, padding:'2px 5px', borderRadius:3, background:'color-mix(in srgb, var(--orange) 15%, transparent)', color:'var(--orange)'}}>Avance</span>}
                      {v.tipo === 'final' && <span style={{fontSize:10, fontWeight:700, padding:'2px 5px', borderRadius:3, background:'color-mix(in srgb, var(--green) 15%, transparent)', color:'var(--green)'}}>Final</span>}
                    </div>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    {v.estado === 'aprobada' && (
                      <button className="btn btn-secondary btn-sm" style={{fontSize:11, whiteSpace:'nowrap'}} onClick={() => navigate('facturacion', { valSel: v.id, mode: 'val' })}>
                        Facturar
                      </button>
                    )}
                    {v.estado === 'borrador' && (
                      <button className="btn btn-primary btn-sm" style={{fontSize:11, whiteSpace:'nowrap'}} onClick={() => aprobarValorizacion(v.id)}>
                        {I.check} Aprobar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={mostrarBadgeSociedadValorizaciones ? 11 : 10} style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>
                  {query || hasFilters ? 'No se encontraron resultados' : 'No hay valorizaciones registradas'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ─── Modal Entrada Manual ──────────────────────────────────────────────────────
function ModalEntradaManual({ materiales, almacenes, ordenesCompra = [], recepciones = [], entradasOcPendientes = [], sociedadIdEscritura, permiteEscritura, sociedadesDisponibles = [], filtroSociedades, onClose, onSave }) {
  // '' = auto-crear ALM-001 (cuando la empresa no tiene almacenes aún)
  const [form, setForm] = useState({ motivo: 'saldo_inicial', cantidad: '', costo_unitario: '', moneda: 'PEN', material_id: '', almacen_id: almacenes[0]?.id || '', lote: '', serie: '', vencimiento: '', nro_documento: '', observacion: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const mat = materiales.find(m => m.id === form.material_id);
  const esLlegadaOC = form.motivo === 'oc_pendiente_factura';
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const sinAlmacenes = almacenes.length === 0;
  const sociedadesPermitidas = new Set(filtroSociedades?.sociedadesIds || []);
  const ordenesCompraAlcance = filtroSociedades?.sinFiltro
    ? ordenesCompra
    : ordenesCompra.filter(oc => oc.sociedad_id && sociedadesPermitidas.has(oc.sociedad_id));
  const entradasOcPendientesAlcance = filtroSociedades?.sinFiltro
    ? entradasOcPendientes
    : entradasOcPendientes.filter(entrada => entrada.sociedad_id && sociedadesPermitidas.has(entrada.sociedad_id));

  const MOTIVOS = [
    { value: 'saldo_inicial', label: 'Saldo Inicial / Migración' },
    { value: 'ajuste_positivo', label: 'Ajuste Positivo' },
    { value: 'devolucion_ot', label: 'Devolución desde OT' },
    { value: 'compra_directa_sin_oc', label: 'Compra Directa sin OC' },
    { value: 'oc_pendiente_factura', label: 'Llegada de OC pendiente factura' },
  ];

  const ocElegibles = useMemo(() => {
    return filtrarOpcionesPorSociedadEscritura(ordenesCompraAlcance || [], sociedadIdEscritura).filter(oc =>
      ['confirmada', 'en_transito', 'emitida', 'recibida_parcial'].includes(oc.estado) &&
      (oc.items || []).some((item, idx) => {
        const recibidoRecepciones = (recepciones || [])
          .filter(r => String(r.orden_compra_id || r.oc_id || '') === String(oc.id))
          .reduce((sum, r) => {
            const rec = (r.items_recibidos || []).find(i =>
              (item.material_id && i.material_id === item.material_id) || i.descripcion === item.descripcion
            );
            return sum + Number(rec?.recibido || 0);
          }, 0);
        const recibidoAlmacen = (entradasOcPendientesAlcance || [])
          .filter(e => String(e.orden_compra_id || e.referencia_id || '') === String(oc.id))
          .filter(e => (e.orden_compra_item_idx !== null && e.orden_compra_item_idx !== undefined) ? Number(e.orden_compra_item_idx) === idx : (item.material_id && e.material_id === item.material_id))
          .reduce((sum, e) => sum + Number(e.cantidad || 0), 0);
        return Number(item.cantidad || 0) - recibidoRecepciones - recibidoAlmacen > 0;
      })
    );
  }, [ordenesCompra, recepciones, entradasOcPendientes, sociedadIdEscritura, filtroSociedades?.sinFiltro, (filtroSociedades?.sociedadesIds || []).join('|')]);

  const ocSeleccionada = ocElegibles.find(oc => oc.id === form.orden_compra_id) || null;
  const destinoEntrada = resolverSociedadDestino({
    sociedades: sociedadesDisponibles,
    origenes: [{ seleccionado: Boolean(form.orden_compra_id), sociedadId: ocSeleccionada?.sociedad_id || null, label: `La OC ${ocSeleccionada?.codigo || form.orden_compra_id || ''}`.trim() }],
    mensajeSinOrigen: 'Selecciona una OC para resolver la sociedad destino de la entrada.',
  });
  const mensajeEntradaManual = 'Selecciona una sociedad concreta en el selector superior para registrar una entrada manual de inventario.';

  const lineasOc = useMemo(() => {
    if (!ocSeleccionada) return [];
    return (ocSeleccionada.items || []).map((item, idx) => {
      const recibidoRecepciones = (recepciones || [])
        .filter(r => String(r.orden_compra_id || r.oc_id || '') === String(ocSeleccionada.id))
        .reduce((sum, r) => {
          const rec = (r.items_recibidos || []).find(i =>
            (item.material_id && i.material_id === item.material_id) || i.descripcion === item.descripcion
          );
          return sum + Number(rec?.recibido || 0);
        }, 0);
      const recibidoAlmacen = (entradasOcPendientesAlcance || [])
        .filter(e => String(e.orden_compra_id || e.referencia_id || '') === String(ocSeleccionada.id))
        .filter(e => (e.orden_compra_item_idx !== null && e.orden_compra_item_idx !== undefined) ? Number(e.orden_compra_item_idx) === idx : (item.material_id && e.material_id === item.material_id))
        .reduce((sum, e) => sum + Number(e.cantidad || 0), 0);
      const pendiente = Math.max(0, Number(item.cantidad || 0) - recibidoRecepciones - recibidoAlmacen);
      return { ...item, index: idx, pendiente };
    }).filter(item => item.pendiente > 0);
  }, [ocSeleccionada, recepciones, entradasOcPendientes, filtroSociedades?.sinFiltro, (filtroSociedades?.sociedadesIds || []).join('|')]);

  useEffect(() => {
    if (!esLlegadaOC || !ocSeleccionada) return;
    setForm(p => ({
      ...p,
      lineas: lineasOc.map(item => ({
        index: item.index,
        material_id: item.material_id || null,
        codigo: item.codigo || null,
        descripcion: item.descripcion,
        unidad: item.unidad,
        cantidad_pedida: item.cantidad,
        cantidad_pendiente: item.pendiente,
        cantidad_recibida: String(item.pendiente),
        precio_unitario_oc: Number(item.precio_unitario || 0),
        oc_codigo: ocSeleccionada.codigo || ocSeleccionada.id,
      })),
    }));
  }, [esLlegadaOC, ocSeleccionada?.id, lineasOc]);

  const handleSave = async () => {
    setErr('');
    if (esLlegadaOC) {
      if (!form.orden_compra_id) { setErr('Selecciona una OC'); return; }
      if (!form.almacen_id && !sinAlmacenes) { setErr('Selecciona un almacén'); return; }
      const lineas = (form.lineas || []).filter(l => Number(l.cantidad_recibida || 0) > 0);
      if (!lineas.length) { setErr('Ingresa al menos una cantidad fisica recibida'); return; }
      setSaving(true);
      try { await onSave({ ...form, lineas, proveedor_id: ocSeleccionada?.proveedor_id || null, moneda: ocSeleccionada?.moneda || 'PEN', sociedad_id: ocSeleccionada?.sociedad_id || null }); onClose(); }
      catch (e) { setErr(e.message); }
      finally { setSaving(false); }
      return;
    }
    if (!permiteEscritura) { setErr(mensajeEntradaManual); return; }
    if (!form.material_id) { setErr('Selecciona un material'); return; }
    // almacen_id vacío = auto ALM-001 via resolverAlmacen; solo bloqueamos si hay lista y no se eligió
    if (!form.almacen_id && !sinAlmacenes) { setErr('Selecciona un almacén'); return; }
    if (!form.cantidad || Number(form.cantidad) <= 0) { setErr('Cantidad debe ser mayor a cero'); return; }
    // Costo obligatorio solo en compra directa (los demás usan el costo promedio vigente)
    if (form.motivo === 'compra_directa_sin_oc' && (!form.costo_unitario || Number(form.costo_unitario) <= 0)) {
      setErr('El costo unitario es obligatorio para Compra Directa sin OC');
      return;
    }
    if (mat?.tipo_control === 'serie' && Number(form.cantidad) !== 1) { setErr('Artículos por serie: cantidad debe ser 1'); return; }
    if (mat?.tipo_control === 'lote' && !form.lote) { setErr('Este artículo requiere número de lote'); return; }
    if (mat?.tipo_control === 'serie' && !form.serie) { setErr('Este artículo requiere número de serie'); return; }
    setSaving(true);
    try { await onSave({ ...form, sociedad_id: sociedadIdEscritura || null }); onClose(); }
    catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="side-panel-backdrop" onClick={onClose}/>
      <div className="side-panel" style={{width:'min(520px,96vw)'}}>
        <div className="side-panel-head"><h2>Registrar Entrada</h2><button className="icon-btn" onClick={onClose}>{I.x}</button></div>
        <div className="side-panel-body" style={{display:'flex',flexDirection:'column',gap:14}}>
          <div>
            <label className="label">Motivo *</label>
            <select className="select" value={form.motivo} onChange={e => setForm(p => ({ ...p, motivo: e.target.value, orden_compra_id: '', lineas: [] }))}>
              {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          {esLlegadaOC && (
            <>
              <div>
                <label className="label">OC *</label>
                <select className="select" value={form.orden_compra_id || ''} onChange={e => setF('orden_compra_id', e.target.value)}>
                  <option value="">Seleccionar OC...</option>
                  {ocElegibles.map(oc => <option key={oc.id} value={oc.id}>{oc.codigo || oc.id}</option>)}
                </select>
              </div>
              <SociedadReadOnlyField {...destinoEntrada} />
              <div>
                <label className="label">Almacen *</label>
                <select className="select" value={form.almacen_id} onChange={e => setF('almacen_id', e.target.value)}>
                  {sinAlmacenes
                    ? <option value="">Almacen Principal (se creara automaticamente)</option>
                    : <>{almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}</>
                  }
                </select>
              </div>
              {ocSeleccionada && (
                <div className="table-wrap">
                  <table className="tbl" style={{fontSize:12}}>
                    <thead><tr><th>Item</th><th className="num">Pendiente</th><th className="num">Cantidad fisica</th></tr></thead>
                    <tbody>{(form.lineas || []).map((linea, idx) => (
                      <tr key={`${linea.index}-${linea.descripcion}`}>
                        <td>{linea.descripcion}<div className="text-muted" style={{fontSize:11}}>{linea.unidad || ''}</div></td>
                        <td className="num">{linea.cantidad_pendiente}</td>
                        <td className="num" style={{width:140}}>
                          <input className="input" type="number" min="0" step="any" value={linea.cantidad_recibida} onChange={e => setForm(p => ({ ...p, lineas: (p.lineas || []).map((l, i) => i === idx ? { ...l, cantidad_recibida: e.target.value } : l) }))} style={{textAlign:'right'}} />
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {!esLlegadaOC && !permiteEscritura && <div className="alert alert-warning">{mensajeEntradaManual}</div>}
          {!esLlegadaOC && <div className="grid-2" style={{gap:12}}>
            <div>
              <label className="label">Material *</label>
              <select className="select" value={form.material_id} onChange={e => setF('material_id', e.target.value)}>
                <option value="">— Seleccionar —</option>
                {materiales.map(m => <option key={m.id} value={m.id}>{m.codigo} · {m.descripcion}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Almacén *</label>
              <select className="select" value={form.almacen_id} onChange={e => setF('almacen_id', e.target.value)}>
                {sinAlmacenes
                  ? <option value="">Almacén Principal (se creará automáticamente)</option>
                  : <>{almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}</>
                }
              </select>
            </div>
          </div>}
          {!esLlegadaOC && <div className="grid-2" style={{gap:12}}>
            <div>
              <label className="label">Cantidad *{mat?.tipo_control === 'serie' ? ' (máx. 1)' : ''}</label>
              <input className="input" type="number" min="0.001" step="any" value={form.cantidad} onChange={e => setF('cantidad', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="label">Costo Unitario</label>
              <div className="row" style={{gap:6}}>
                <select className="select" style={{width:72,flexShrink:0}} value={form.moneda} onChange={e => setF('moneda', e.target.value)}>
                  <option value="PEN">PEN</option><option value="USD">USD</option>
                </select>
                <input className="input" type="number" min="0" step="any" value={form.costo_unitario} onChange={e => setF('costo_unitario', e.target.value)} placeholder="0.00" />
              </div>
            </div>
          </div>}
          {!esLlegadaOC && mat?.tipo_control !== 'sin_control' && (
            <div className="grid-2" style={{gap:12}}>
              {mat?.tipo_control === 'lote' && <>
                <div><label className="label">Número de Lote *</label><input className="input" value={form.lote} onChange={e => setF('lote', e.target.value)} /></div>
                <div><label className="label">Vencimiento</label><input className="input" type="date" value={form.vencimiento} onChange={e => setF('vencimiento', e.target.value)} /></div>
              </>}
              {mat?.tipo_control === 'serie' && (
                <div><label className="label">Número de Serie *</label><input className="input" value={form.serie} onChange={e => setF('serie', e.target.value)} /></div>
              )}
            </div>
          )}
          {form.motivo === 'compra_directa_sin_oc' && (
            <div><label className="label">Nro. Documento / Factura</label><input className="input" value={form.nro_documento} onChange={e => setF('nro_documento', e.target.value)} placeholder="FAC-001" /></div>
          )}
          <div><label className="label">Observación</label><input className="input" value={form.observacion} onChange={e => setF('observacion', e.target.value)} /></div>
          {err && <div className="alert alert-danger">{err}</div>}
          <div className="row mt-6" style={{justifyContent:'flex-end',gap:8}}>
            <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || (!esLlegadaOC && !permiteEscritura)} title={!esLlegadaOC && !permiteEscritura ? mensajeEntradaManual : undefined}>{saving ? 'Guardando...' : <>{I.plus} Registrar Entrada</>}</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Modal Transferencia ──────────────────────────────────────────────────────
function ModalTransferencia({ sku, almacenes, onClose, onSave }) {
  const [form, setForm] = useState({ almacen_origen_id: sku.almacen_id || '', almacen_destino_id: '', cantidad: '', observacion: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setErr('');
    if (!form.almacen_destino_id) { setErr('Selecciona almacén destino'); return; }
    if (form.almacen_origen_id === form.almacen_destino_id) { setErr('Origen y destino no pueden ser el mismo'); return; }
    if (!form.cantidad || Number(form.cantidad) <= 0) { setErr('Cantidad debe ser mayor a cero'); return; }
    if (Number(form.cantidad) > sku.disponible) { setErr(`Stock disponible insuficiente (${sku.disponible} ${sku.unidad})`); return; }
    setSaving(true);
    try { await onSave({ ...form, material_id: sku.material_id, lote: sku.lote, serie: sku.serie, sociedad_origen_id: sku.sociedad_id || null, sociedad_destino_id: sku.sociedad_id || null }); onClose(); }
    catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="side-panel-backdrop" onClick={onClose}/>
      <div className="side-panel" style={{width:'min(480px,96vw)'}}>
        <div className="side-panel-head"><h2>Transferencia Interna</h2><button className="icon-btn" onClick={onClose}>{I.x}</button></div>
        <div className="side-panel-body" style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{padding:'10px 14px',background:'var(--bg-subtle)',borderRadius:8}}>
            <div className="eyebrow">Material</div>
            <div style={{fontWeight:600}}>{sku.sku} · {sku.nombre}</div>
            <div style={{fontSize:12,color:'var(--fg-muted)'}}>Disponible: {sku.disponible} {sku.unidad}</div>
          </div>
          <div className="grid-2" style={{gap:12}}>
            <div>
              <label className="label">Almacén Origen</label>
              <select className="select" value={form.almacen_origen_id} onChange={e => setF('almacen_origen_id', e.target.value)}>
                {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Almacén Destino *</label>
              <select className="select" value={form.almacen_destino_id} onChange={e => setF('almacen_destino_id', e.target.value)}>
                <option value="">— Seleccionar —</option>
                {almacenes.filter(a => a.id !== form.almacen_origen_id).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Cantidad *</label>
            <input className="input" type="number" min="0.001" max={sku.disponible} step="any" value={form.cantidad} onChange={e => setF('cantidad', e.target.value)} />
          </div>
          <div><label className="label">Observación</label><input className="input" value={form.observacion} onChange={e => setF('observacion', e.target.value)} /></div>
          {err && <div className="alert alert-danger">{err}</div>}
          <div className="row mt-6" style={{justifyContent:'flex-end',gap:8}}>
            <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Transferir'}</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Modal Ajuste ─────────────────────────────────────────────────────────────
function ModalAjuste({ sku, onClose, onSave }) {
  const [form, setForm] = useState({ cantidad_fisica: sku.fisico ?? sku.disponible, motivo: 'ajuste_manual', observacion: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const delta = Number(form.cantidad_fisica) - Number(sku.fisico ?? sku.disponible);

  const MOTIVOS_AJUSTE = [
    { value: 'ajuste_manual', label: 'Ajuste manual' },
    { value: 'merma', label: 'Merma / Pérdida' },
    { value: 'robo', label: 'Robo / Extravío' },
    { value: 'error_ingreso', label: 'Corrección de error de ingreso' },
    { value: 'ajuste_conteo', label: 'Resultado de conteo físico' },
  ];

  const handleSave = async () => {
    setErr('');
    if (form.cantidad_fisica === '' || form.cantidad_fisica === null) { setErr('Ingresa la cantidad física contada'); return; }
    if (Number(form.cantidad_fisica) < 0) { setErr('La cantidad no puede ser negativa'); return; }
    if (delta === 0) { setErr('Sin diferencia. No se registrará movimiento.'); return; }
    if (!form.observacion.trim()) { setErr('Ingresa un motivo/observación'); return; }
    setSaving(true);
    try {
      await onSave({ material_id: sku.material_id, almacen_id: sku.almacen_id, cantidad_teorica: sku.fisico ?? sku.disponible, cantidad_fisica: Number(form.cantidad_fisica), motivo: form.motivo, observacion: form.observacion, lote: sku.lote, serie: sku.serie, sociedad_id: sku.sociedad_id || null });
      onClose();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="side-panel-backdrop" onClick={onClose}/>
      <div className="side-panel" style={{width:'min(480px,96vw)'}}>
        <div className="side-panel-head"><h2>Ajuste de Inventario</h2><button className="icon-btn" onClick={onClose}>{I.x}</button></div>
        <div className="side-panel-body" style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{padding:'10px 14px',background:'var(--bg-subtle)',borderRadius:8}}>
            <div style={{fontWeight:600}}>{sku.sku} · {sku.nombre}</div>
            <div style={{fontSize:12,color:'var(--fg-muted)'}}>Físico actual: {sku.fisico ?? sku.disponible} {sku.unidad}</div>
          </div>
          <div>
            <label className="label">Cantidad física contada *</label>
            <input className="input" type="number" min="0" step="any" value={form.cantidad_fisica} onChange={e => setF('cantidad_fisica', e.target.value)} />
          </div>
          {delta !== 0 && (
            <div style={{padding:'8px 12px',borderRadius:6,background:delta > 0 ? 'rgba(22,163,74,0.08)' : 'rgba(239,68,68,0.08)',color:delta > 0 ? 'var(--green)' : 'var(--danger)',fontSize:13,fontWeight:600}}>
              Diferencia: {delta > 0 ? '+' : ''}{delta} {sku.unidad} → {delta > 0 ? 'Entrada' : 'Salida'} de ajuste
            </div>
          )}
          <div>
            <label className="label">Tipo de ajuste</label>
            <select className="select" value={form.motivo} onChange={e => setF('motivo', e.target.value)}>
              {MOTIVOS_AJUSTE.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div><label className="label">Observación / Descripción *</label><textarea className="input" rows={2} value={form.observacion} onChange={e => setF('observacion', e.target.value)} /></div>
          {err && <div className="alert alert-danger">{err}</div>}
          <div className="row mt-6" style={{justifyContent:'flex-end',gap:8}}>
            <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Registrar Ajuste'}</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Panel Kardex ─────────────────────────────────────────────────────────────
function PanelKardex({ sku, almacenes, onClose, onTransferencia, onAjuste, onSolpe, getKardexMaterialCtx, filtroSociedades, mostrarSociedad }) {
  const [kardex, setKardex] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('kardex');
  const [selectedLote, setSelectedLote] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }
    setLoading(true);
    getKardexMaterialCtx(sku.material_id, sku.almacen_id, filtroSociedades)
      .then(data => { setKardex(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [sku.material_id, sku.almacen_id, filtroSociedades?.sinFiltro, (filtroSociedades?.sociedadesIds || []).join('|')]);

  const fmtFecha = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts);
    const hoy = new Date();
    const diff = Math.floor((hoy - d) / 86400000);
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    if (diff < 7) return `Hace ${diff} días`;
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
  };

  const badgeTipo = (tipo) => {
    if (tipo === 'entrada' || tipo === 'transferencia_entrada') return 'badge-green';
    if (tipo === 'salida' || tipo === 'transferencia_salida') return 'badge-orange';
    return 'badge-gray';
  };

  const labelTipo = (tipo, motivo) => {
    const labels = { entrada: 'ENTRADA', salida: 'SALIDA', ajuste: 'AJUSTE', transferencia_entrada: 'TRANSFER IN', transferencia_salida: 'TRANSFER OUT' };
    return labels[tipo] || tipo.toUpperCase();
  };

  const puntoReordenBase = Number(sku.punto_reorden || sku.stock_minimo || 0);
  const stockSeguridad = Number(sku.stock_seguridad || 0);
  const puntoReordenEfectivo = puntoReordenBase + stockSeguridad;
  const disponibleColor = sku.disponible === 0 ? 'var(--danger)' : sku.disponible <= (puntoReordenEfectivo || 5) ? 'var(--orange)' : 'var(--cyan)';
  const bajoPuntReorden = sku.disponible <= puntoReordenEfectivo && puntoReordenEfectivo > 0;

  return (
    <>
      <div className="side-panel-backdrop" onClick={onClose} />
      <div className="side-panel" style={{width:620}}>
        <div className="side-panel-head">
          <div>
            <div className="eyebrow">Kardex · Almacén {sku.almacen}</div>
            <div className="font-display mono" style={{fontSize:20,fontWeight:700,marginTop:2}}>{sku.sku}</div>
          </div>
          <button className="icon-btn" onClick={onClose}>{I.x}</button>
        </div>
        <div className="side-panel-body">
          <div className="grid-2" style={{gap:14,marginBottom:20}}>
            <div><div className="eyebrow">Descripción</div><div style={{fontWeight:600}}>{sku.nombre}</div><div style={{fontSize:12,color:'var(--fg-muted)'}}>{sku.categoria}</div></div>
            <div><div className="eyebrow">Control</div><div style={{fontSize:12}}>{sku.tipo_control === 'lote' ? '📦 Por lote' : sku.tipo_control === 'serie' ? '🔢 Por serie' : 'Sin control'}</div>{sku.lote && <div style={{fontSize:11,color:'var(--fg-muted)'}}>Lote: {sku.lote}</div>}</div>
            <div>
              <div className="eyebrow">Stock Físico / Disponible / Reservado</div>
              <div style={{fontSize:22,fontWeight:700,color:disponibleColor}}>{sku.disponible} <span style={{fontSize:13,fontWeight:400}}>{sku.unidad}</span></div>
              <div style={{fontSize:11,color:'var(--fg-muted)'}}>Fisico: {sku.fisico ?? sku.disponible} - Reservado: {sku.reservado ?? 0} - Min: {sku.stock_minimo} - Reorden: {sku.punto_reorden} - Seguridad: {sku.stock_seguridad || 0}</div>
              {bajoPuntReorden && <div style={{fontSize:11,color:'var(--orange)',fontWeight:600,marginTop:4}}>Por debajo del punto de reorden efectivo ({puntoReordenEfectivo} {sku.unidad})</div>}
            </div>
            <div><div className="eyebrow">Costo Promedio</div><div style={{fontSize:22,fontWeight:700}}>{moneyD(sku.costo_promedio)}</div><div style={{fontSize:11,color:'var(--fg-muted)'}}>Valor total: {moneyD(sku.disponible * sku.costo_promedio)}</div></div>
          </div>

          <div className="row" style={{marginBottom:20,gap:8,flexWrap:'wrap'}}>
            <button className="btn btn-sm btn-secondary" onClick={onTransferencia}>{I.truck} Transferir</button>
            <button className="btn btn-sm btn-secondary" onClick={onAjuste}>{I.edit} Ajustar</button>
            {bajoPuntReorden && <button className="btn btn-sm btn-primary" onClick={onSolpe}>{I.alert} Generar SOLPE</button>}
          </div>

          <div className="tabs" style={{marginBottom:12}}>
            {[['kardex','Movimientos KARDEX'],['trazabilidad','Trazabilidad por Lote'],['detalles','Detalles']].map(([t,label]) => (
              <button key={t} className={`tab${tab===t?' active':''}`} onClick={() => setTab(t)}>{label}</button>
            ))}
          </div>

          {tab === 'kardex' && (
            loading ? (
              <div style={{textAlign:'center',padding:40,color:'var(--fg-muted)'}}>Cargando movimientos...</div>
            ) : kardex.length === 0 ? (
              <div style={{textAlign:'center',padding:40,color:'var(--fg-muted)'}}>
                {isSupabaseConfigured() ? 'Sin movimientos registrados aún.' : 'Conecta Supabase para ver el kardex real.'}
              </div>
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Fecha</th>{mostrarSociedad && <th>Sociedad</th>}<th>Tipo</th><th>Motivo</th><th>Ref.</th><th>Cant.</th><th>Costo U.</th><th>Saldo</th></tr></thead>
                  <tbody>
                    {kardex.map(k => (
                      <tr key={k.id} style={{opacity: k.anulado ? 0.4 : 1}}>
                        <td className="text-muted" style={{whiteSpace:'nowrap'}}>{fmtFecha(k.created_at)}</td>
                        {mostrarSociedad && <td><SociedadBadge sociedadId={k.sociedad_id} /></td>}
                        <td><span className={`badge ${badgeTipo(k.tipo)}`}>{labelTipo(k.tipo, k.motivo)}</span></td>
                        <td style={{fontSize:12,color:'var(--fg-muted)'}}>{k.motivo || '—'}</td>
                        <td className="mono" style={{fontSize:11}}>{k.referencia_id ? k.referencia_id.slice(0,12) + '...' : '—'}</td>
                        <td className="num" style={{color: (k.tipo === 'entrada' || k.tipo === 'transferencia_entrada') ? 'var(--green)' : 'var(--danger)', fontWeight:600}}>
                          {(k.tipo === 'entrada' || k.tipo === 'transferencia_entrada') ? '+' : '-'}{k.cantidad}
                        </td>
                        <td className="num">{moneyD(k.costo_unitario)}</td>
                        <td className="num">{k.saldo_cantidad ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === 'trazabilidad' && (() => {
            const lotesKardex = [...new Set(kardex.map(k => k.lote).filter(Boolean))];
            const kardexLote = selectedLote ? kardex.filter(k => k.lote === selectedLote) : [];
            return (
              <div className="col" style={{gap:12}}>
                <div>
                  <div className="eyebrow" style={{marginBottom:6}}>Seleccionar lote / serie</div>
                  {loading ? (
                    <div style={{color:'var(--fg-muted)',fontSize:13}}>Cargando...</div>
                  ) : lotesKardex.length === 0 ? (
                    <div style={{color:'var(--fg-muted)',fontSize:13}}>Sin movimientos con lote registrado para este material.</div>
                  ) : (
                    <select className="input" value={selectedLote} onChange={e => setSelectedLote(e.target.value)}>
                      <option value="">-- Seleccionar lote --</option>
                      {lotesKardex.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  )}
                </div>
                {selectedLote && (
                  <div className="col" style={{gap:8}}>
                    <div className="eyebrow">Cadena de trazabilidad - {selectedLote}</div>
                    {kardexLote.length === 0 ? (
                      <div style={{color:'var(--fg-muted)',fontSize:13}}>Sin movimientos para este lote.</div>
                    ) : (
                      <div className="table-wrap">
                        <table className="tbl">
                          <thead>
                            <tr><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Referencia</th><th className="num">Cant.</th></tr>
                          </thead>
                          <tbody>
                            {kardexLote.map(k => (
                              <tr key={k.id} style={{opacity: k.anulado ? 0.4 : 1}}>
                                <td className="text-muted" style={{whiteSpace:'nowrap'}}>{fmtFecha(k.created_at)}</td>
                                <td><span className={`badge ${badgeTipo(k.tipo)}`}>{labelTipo(k.tipo, k.motivo)}</span></td>
                                <td style={{fontSize:12,color:'var(--fg-muted)'}}>{k.motivo || '-'}</td>
                                <td className="mono" style={{fontSize:11}}>
                                  {k.referencia_tipo ? `${k.referencia_tipo}: ` : ''}{k.referencia_id ? k.referencia_id.slice(0,14) + '...' : '-'}
                                </td>
                                <td className="num" style={{color:(k.tipo==='entrada'||k.tipo==='transferencia_entrada')?'var(--green)':'var(--danger)',fontWeight:600}}>
                                  {(k.tipo==='entrada'||k.tipo==='transferencia_entrada')?'+':'-'}{k.cantidad}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {tab === 'detalles' && (
            <div className="col" style={{gap:12}}>
              <div className="grid-2" style={{gap:12}}>
                <div style={{padding:'10px 14px',background:'var(--bg-subtle)',borderRadius:8}}>
                  <div className="eyebrow">Stock Mínimo</div><div style={{fontWeight:600}}>{sku.stock_minimo} {sku.unidad}</div>
                </div>
                <div style={{padding:'10px 14px',background:'var(--bg-subtle)',borderRadius:8}}>
                  <div className="eyebrow">Stock Máximo</div><div style={{fontWeight:600}}>{sku.stock_maximo || '—'} {sku.unidad}</div>
                </div>
                <div style={{padding:'10px 14px',background:'var(--bg-subtle)',borderRadius:8}}>
                  <div className="eyebrow">Punto de Reorden</div><div style={{fontWeight:600}}>{sku.punto_reorden || '—'} {sku.unidad}</div>
                </div>
                <div style={{padding:'10px 14px',background:'var(--bg-subtle)',borderRadius:8}}>
                  <div className="eyebrow">Stock de Seguridad</div><div style={{fontWeight:600}}>{sku.stock_seguridad || 0} {sku.unidad}</div>
                </div>
                <div style={{padding:'10px 14px',background:'var(--bg-subtle)',borderRadius:8}}>
                  <div className="eyebrow">Reorden Efectivo</div><div style={{fontWeight:600}}>{puntoReordenEfectivo || '-'} {sku.unidad}</div>
                </div>
                <div style={{padding:'10px 14px',background:'var(--bg-subtle)',borderRadius:8}}>
                  <div className="eyebrow">Código de Barras</div><div style={{fontWeight:600,fontFamily:'monospace'}}>{sku.codigo_barras || '—'}</div>
                </div>
              </div>
              {sku.vencimiento && (
                <div style={{padding:'10px 14px',background:'rgba(245,158,11,0.08)',borderRadius:8,border:'1px solid var(--orange)'}}>
                  <div className="eyebrow">Vencimiento</div>
                  <div style={{fontWeight:600,color:'var(--orange)'}}>{new Date(sku.vencimiento).toLocaleDateString('es-PE')}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Componente principal Inventario ──────────────────────────────────────────
function fmtDateShort(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' }); }
  catch { return '—'; }
}

const pctText = (n) => `${Math.round(Number(n || 0) * 100)}%`;
const qtyText = (n) => Number(n || 0).toLocaleString('es-PE', { maximumFractionDigits: 2 });
const rotText = (n) => Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ModalIniciarConteo({ almacenes, sociedadIdEscritura, onClose, onStart }) {
  const [form, setForm] = useState({ nombre: `Conteo fisico ${new Date().toLocaleDateString('es-PE')}`, tipo: 'total', almacen_id: '', zona: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const handleStart = async () => {
    setErr('');
    if (!form.nombre.trim()) { setErr('Ingresa un nombre para el conteo'); return; }
    setSaving(true);
    try { await onStart({ ...form, nombre: form.nombre.trim(), sociedad_id: sociedadIdEscritura || null }); onClose(); }
    catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:520}} onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h2>Iniciar Conteo</h2><button className="icon-btn" onClick={onClose}>{I.x}</button></div>
        <div className="modal-body" style={{display:'grid', gap:14}}>
          <div><label className="label">Nombre *</label><input className="input" value={form.nombre} onChange={e => setF('nombre', e.target.value)} autoFocus /></div>
          <div className="grid-2" style={{gap:12}}>
            <div>
              <label className="label">Tipo</label>
              <select className="select" value={form.tipo} onChange={e => setF('tipo', e.target.value)}>
                <option value="total">Total</option>
                <option value="ciclico">Filtrado / cíclico</option>
              </select>
            </div>
            <div>
              <label className="label">Almacén</label>
              <select className="select" value={form.almacen_id} onChange={e => setF('almacen_id', e.target.value)}>
                <option value="">Todos</option>
                {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre || a.codigo}</option>)}
              </select>
            </div>
          </div>
          <div><label className="label">Zona / ubicación</label><input className="input" value={form.zona} onChange={e => setF('zona', e.target.value)} placeholder="Opcional" /></div>
          {err && <div className="alert alert-danger">{err}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleStart} disabled={saving}>{saving ? 'Iniciando...' : <>{I.play} Iniciar Conteo</>}</button>
        </div>
      </div>
    </div>
  );
}

function ConteoFisicoTab({ inventario, almacenes, conteos, iniciarConteoCtx, guardarAvanceConteoCtx, cerrarConteoCtx, recargarConteosInventarioCtx, mostrarToast, mostrarBadgeSociedad, permiteEscritura, sociedadIdEscritura, mensajeSeleccionSociedad, filtroSociedades }) {
  const [modalInicio, setModalInicio] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const inputRefs = useRef(new Map());

  const invMap = new Map(inventario.map(i => [`${i.material_id}::${i.almacen_id}::${i.lote || ''}::${i.serie || ''}`, i]));
  const conteoSel = conteos.find(c => c.id === selectedId) || conteos.find(c => c.estado !== 'cerrado') || conteos[0] || null;

  useEffect(() => {
    if (!conteoSel) { setSelectedId(''); setItems([]); return; }
    if (selectedId !== conteoSel.id) setSelectedId(conteoSel.id);
    setItems((conteoSel.items || []).map(it => {
      const inv = invMap.get(`${it.material_id}::${it.almacen_id}::${it.lote || ''}::${it.serie || ''}`) || {};
      return { ...it, sku: it.sku || inv.sku, nombre: it.nombre || inv.nombre, categoria: it.categoria || inv.categoria, unidad: it.unidad || inv.unidad, almacen: it.almacen || inv.almacen, tipo_control: it.tipo_control || inv.tipo_control || 'sin_control', vencimiento: it.vencimiento || inv.vencimiento || null, codigo_barras: it.codigo_barras || inv.codigo_barras || null };
    }));
  }, [conteoSel?.id, conteos.length, inventario.length]);

  useEffect(() => {
    if (!permiteEscritura) setModalInicio(false);
  }, [permiteEscritura]);

  const contados = items.filter(it => it.fisico !== null && it.fisico !== undefined && it.fisico !== '').length;
  const total = items.length;
  const cerrado = conteoSel?.estado === 'cerrado';
  const allCounted = total > 0 && contados === total;
  const diferencias = items.filter(it => Number(it.fisico ?? it.teorico) - Number(it.teorico || 0) !== 0).length;

  const updateFisico = (idx, value) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      let fisico = value;
      if (it.tipo_control === 'serie' && value !== '') fisico = Math.min(1, Math.max(0, Number(value)));
      return { ...it, fisico };
    }));
  };

  const handleStart = async (form) => {
    if (!permiteEscritura) throw new Error(mensajeSeleccionSociedad);
    const nuevo = await iniciarConteoCtx(form);
    setSelectedId(nuevo.id);
    mostrarToast('Conteo iniciado');
  };

  const handleScanConteo = (codigo) => {
    setScannerOpen(false);
    const idx = items.findIndex(it => it.codigo_barras && it.codigo_barras === codigo);
    if (idx === -1) {
      mostrarToast(`Codigo ${codigo} no encontrado en este conteo`);
      return;
    }
    const input = inputRefs.current.get(idx);
    if (input) { input.scrollIntoView({ block: 'center', behavior: 'smooth' }); input.focus(); input.select(); }
  };

  const handleGuardar = async () => {
    if (!conteoSel) return;
    setErr('');
    setSaving(true);
    try {
      await guardarAvanceConteoCtx(conteoSel.id, items);
      mostrarToast('Avance guardado');
      await recargarConteosInventarioCtx?.(filtroSociedades);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const handleCerrar = async () => {
    if (!conteoSel || !allCounted) return;
    setErr('');
    setSaving(true);
    try {
      await cerrarConteoCtx(conteoSel.id, items.map(it => ({ ...it, fisico: Number(it.fisico || 0) })), filtroSociedades);
      mostrarToast('Conteo cerrado y ajustes generados');
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{display:'grid', gap:16}}>
      <div className="row" style={{justifyContent:'space-between', gap:12, flexWrap:'wrap'}}>
        <div><div className="eyebrow">Conteo físico</div><div style={{fontSize:18, fontWeight:800, fontFamily:'Sora'}}>Control por SKU, lote y serie</div></div>
        <div className="row" style={{gap:8, flexWrap:'wrap', justifyContent:'flex-end'}}>
          {!permiteEscritura && <span className="text-muted" style={{fontSize:12}}>{mensajeSeleccionSociedad}</span>}
          <button className="btn btn-primary" disabled={!permiteEscritura} title={!permiteEscritura ? mensajeSeleccionSociedad : 'Iniciar conteo físico'} onClick={() => setModalInicio(true)}>{I.play} Iniciar Conteo</button>
        </div>
      </div>

      <div className="grid-2" style={{gap:16, alignItems:'start'}}>
        <div className="card" style={{margin:0}}>
          <div className="row" style={{justifyContent:'space-between', marginBottom:12, gap:8}}>
            <div>
              <div className="eyebrow">Conteo activo</div>
              <select className="select" value={conteoSel?.id || ''} onChange={e => setSelectedId(e.target.value)} style={{marginTop:6, minWidth:260}}>
                {conteos.length === 0 && <option value="">Sin conteos</option>}
                {conteos.map(c => <option key={c.id} value={c.id}>{c.codigo || c.id} · {c.nombre}</option>)}
              </select>
            </div>
            {conteoSel && <span className={`badge ${cerrado ? 'badge-green' : 'badge-cyan'}`}>{cerrado ? 'cerrado' : 'en proceso'}</span>}
          </div>

          {!conteoSel ? (
            <div style={{textAlign:'center', padding:44, color:'var(--fg-muted)'}}>No hay conteos registrados. Inicia uno para cargar el stock teórico actual.</div>
          ) : (
            <>
              <div className="kpi-grid" style={{gridTemplateColumns:'repeat(3,1fr)', marginBottom:16}}>
                <div className="kpi-card"><div className="kpi-label">Progreso</div><div className="kpi-value">{contados}/{total}</div></div>
                <div className="kpi-card"><div className="kpi-label">Diferencias</div><div className="kpi-value" style={{color:diferencias ? 'var(--orange)' : 'var(--green)'}}>{diferencias}</div></div>
                <div className="kpi-card"><div className="kpi-label">Ajustes</div><div className="kpi-value">{conteoSel.ajustes_generados ? 'Sí' : 'No'}</div></div>
              </div>
              <div style={{height:8, background:'var(--bg-subtle)', borderRadius:999, overflow:'hidden', marginBottom:14}}>
                <div style={{height:'100%', width:`${total ? Math.round((contados / total) * 100) : 0}%`, background:'var(--cyan)', transition:'width .2s'}} />
              </div>
              {err && <div className="alert alert-danger" style={{marginBottom:12}}>{err}</div>}
              {scannerOpen && !cerrado && (
                <div style={{marginBottom:12}}>
                  <BarcodeScanner onScan={handleScanConteo} onClose={() => setScannerOpen(false)} />
                </div>
              )}
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>SKU</th><th>Descripción</th><th>Almacén</th><th>Lote/Serie</th><th className="num">Teórico</th><th className="num">Físico</th><th className="num">Dif.</th></tr></thead>
                  <tbody>
                    {items.map((it, idx) => {
                      const fisicoNum = it.fisico === '' || it.fisico == null ? null : Number(it.fisico);
                      const dif = fisicoNum == null ? null : fisicoNum - Number(it.teorico || 0);
                      return (
                        <tr key={`${it.material_id}-${it.almacen_id}-${it.lote || ''}-${it.serie || ''}-${idx}`}>
                          <td className="mono" style={{fontWeight:700}}>{it.sku || it.material_id}</td>
                          <td><strong>{it.nombre || it.material_id}</strong><div className="text-muted" style={{fontSize:11}}>{it.categoria || 'General'} · {it.unidad || 'und'}{it.vencimiento ? ` · Vence ${fmtDateShort(it.vencimiento)}` : ''}</div></td>
                          <td className="text-muted">{it.almacen || it.almacen_id}</td>
                          <td className="mono" style={{fontSize:11}}>{it.serie ? `Serie ${it.serie}` : it.lote ? `Lote ${it.lote}` : '—'}</td>
                          <td className="num">{qtyText(it.teorico)}</td>
                          <td className="num" style={{minWidth:110}}>
                            {cerrado ? qtyText(it.fisico) : <input className="input num" type="number" min="0" max={it.tipo_control === 'serie' ? 1 : undefined} step={it.tipo_control === 'serie' ? 1 : 'any'} value={it.fisico ?? ''} onChange={e => updateFisico(idx, e.target.value)} style={{height:32, maxWidth:96}} ref={el => { if (el) inputRefs.current.set(idx, el); else inputRefs.current.delete(idx); }} />}
                          </td>
                          <td className="num" style={{fontWeight:700, color:dif > 0 ? 'var(--green)' : dif < 0 ? 'var(--danger)' : 'var(--fg-muted)'}}>{dif == null ? '—' : `${dif > 0 ? '+' : ''}${qtyText(dif)}`}</td>
                        </tr>
                      );
                    })}
                    {items.length === 0 && <tr><td colSpan="7" style={{textAlign:'center', padding:36, color:'var(--fg-muted)'}}>El conteo no tiene SKUs. Revisa el filtro de almacén o registra stock antes de iniciar.</td></tr>}
                  </tbody>
                </table>
              </div>
              {!cerrado && (
                <div className="row" style={{justifyContent:'flex-end', gap:8, marginTop:14}}>
                  <button className="btn btn-secondary" onClick={() => setScannerOpen(v => !v)}>{I.camera} Escanear</button>
                  <button className="btn btn-secondary" onClick={handleGuardar} disabled={saving}>{I.save} Guardar avance</button>
                  <button className="btn btn-primary" onClick={handleCerrar} disabled={saving || !allCounted}>{I.check} Cerrar Conteo</button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="card" style={{margin:0}}>
          <div className="eyebrow">Historial</div>
          <div className="table-wrap" style={{marginTop:10}}>
            <table className="tbl">
              <thead><tr><th>Fecha</th>{mostrarBadgeSociedad && <th>Sociedad</th>}<th>Código</th><th>Tipo</th><th>SKUs</th><th>Estado</th></tr></thead>
              <tbody>
                {conteos.map(c => {
                  const ajustados = (c.items || []).filter(it => Number(it.diferencia || 0) !== 0).length;
                  return (
                    <tr key={c.id} className="hover-row" style={{cursor:'pointer'}} onClick={() => setSelectedId(c.id)}>
                      <td className="text-muted">{fmtDateShort(c.created_at)}</td>
                      {mostrarBadgeSociedad && <td><SociedadBadge sociedadId={c.sociedad_id} /></td>}
                      <td className="mono">{c.codigo || c.id}</td>
                      <td>{c.tipo || 'total'}</td>
                      <td>{(c.items || []).length}{c.estado === 'cerrado' ? ` · ${ajustados} ajust.` : ''}</td>
                      <td><span className={`badge ${c.estado === 'cerrado' ? 'badge-green' : 'badge-cyan'}`}>{c.estado || 'en_proceso'}</span></td>
                    </tr>
                  );
                })}
                {conteos.length === 0 && <tr><td colSpan={mostrarBadgeSociedad ? 6 : 5} style={{textAlign:'center', padding:30, color:'var(--fg-muted)'}}>Sin historial de conteos.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modalInicio && permiteEscritura && <ModalIniciarConteo almacenes={almacenes} sociedadIdEscritura={sociedadIdEscritura} onClose={() => setModalInicio(false)} onStart={handleStart} />}
    </div>
  );
}

function ParetoChart({ rows }) {
  const data = rows.slice(0, 10);
  const max = Math.max(...data.map(r => Number(r.valor_salidas || 0)), 1);
  if (!data.length) return null;
  return (
    <div style={{height:190, display:'flex', alignItems:'end', gap:8, padding:'18px 8px 4px', border:'1px solid var(--border)', borderRadius:8, background:'var(--surface)'}}>
      {data.map(r => (
        <div key={r.material_id} style={{flex:1, minWidth:34, display:'flex', flexDirection:'column', alignItems:'center', gap:6}}>
          <div className="text-muted" style={{fontSize:10}}>{pctText(r.pct_acumulado)}</div>
          <div title={`${r.sku} · ${money(r.valor_salidas)}`} style={{width:'100%', maxWidth:42, height:`${Math.max(8, (Number(r.valor_salidas || 0) / max) * 120)}px`, borderRadius:'5px 5px 2px 2px', background:r.clase === 'A' ? 'var(--green)' : r.clase === 'B' ? 'var(--orange)' : 'var(--slate-300)'}} />
          <div className="mono" style={{fontSize:10, maxWidth:54, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.sku}</div>
        </div>
      ))}
    </div>
  );
}

function AnaliticaInventarioTab({ almacenes, getAnaliticaInventarioCtx, filtroSociedades, mostrarSociedad }) {
  const [periodo, setPeriodo] = useState('trimestre');
  const [almacenId, setAlmacenId] = useState('');
  const [dias, setDias] = useState(90);
  const [tab, setTab] = useState('abc');
  const [data, setData] = useState({ abc: [], rotacion: [], stockMuerto: [], meta: {} });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr('');
    getAnaliticaInventarioCtx({ periodo, almacen_id: almacenId, dias_sin_actividad: dias, filtroSociedades })
      .then(res => { if (alive) setData(res || { abc: [], rotacion: [], stockMuerto: [], meta: {} }); })
      .catch(e => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [periodo, almacenId, dias, filtroSociedades?.sinFiltro, (filtroSociedades?.sociedadesIds || []).join('|')]);

  const meta = data.meta || {};
  return (
    <div style={{display:'grid', gap:16}}>
      <div className="row" style={{justifyContent:'space-between', gap:12, flexWrap:'wrap'}}>
        <div><div className="eyebrow">Analítica WMS</div><div style={{fontSize:18, fontWeight:800, fontFamily:'Sora'}}>ABC, rotación y stock muerto</div></div>
        <div className="row" style={{gap:8, flexWrap:'wrap'}}>
          <select className="select" value={periodo} onChange={e => setPeriodo(e.target.value)} style={{width:150}}>
            <option value="mes">Último mes</option>
            <option value="trimestre">Trimestre</option>
            <option value="anio">Año</option>
          </select>
          <select className="select" value={almacenId} onChange={e => setAlmacenId(e.target.value)} style={{width:190}}>
            <option value="">Todos los almacenes</option>
            {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre || a.codigo}</option>)}
          </select>
          <input className="input num" type="number" min="1" value={dias} onChange={e => setDias(e.target.value)} title="Días sin actividad" style={{width:86}} />
        </div>
      </div>

      {err && <div className="alert alert-danger">{err}</div>}
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi-card"><div className="kpi-label">Movimientos período</div><div className="kpi-value">{loading ? '...' : Number(meta.movimientosPeriodo || 0)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Salidas valorizadas</div><div className="kpi-value">{loading ? '...' : money(meta.totalSalidasValor || 0)}</div></div>
        <div className="kpi-card"><div className="kpi-label">SKUs stock muerto</div><div className="kpi-value" style={{color:'var(--orange)'}}>{loading ? '...' : data.stockMuerto.length}</div></div>
        <div className="kpi-card"><div className="kpi-label">Valor inmovilizado</div><div className="kpi-value" style={{color:'var(--orange)'}}>{loading ? '...' : money(meta.valorInmovilizado || 0)}</div></div>
      </div>

      <div className="tabs">{[['abc', 'ABC'], ['rotacion', 'Rotación'], ['muerto', 'Stock muerto']].map(([id, label]) => <button key={id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{label}</button>)}</div>

      <div className="card" style={{margin:0}}>
        {loading ? (
          <div style={{textAlign:'center', padding:44, color:'var(--fg-muted)'}}>Calculando analítica...</div>
        ) : tab === 'abc' ? (
          data.abc.length === 0 ? <div style={{textAlign:'center', padding:44, color:'var(--fg-muted)'}}>No hay salidas en el período seleccionado. El ABC necesita movimientos de salida para clasificar artículos.</div> : <>
            {!mostrarSociedad && <ParetoChart rows={data.abc} />}
            <div className="table-wrap" style={{marginTop:16}}>
              <table className="tbl"><thead><tr>{mostrarSociedad && <th>Sociedad</th>}<th>SKU</th><th>Descripción</th><th className="num">Valor salidas</th><th className="num">% total</th><th className="num">% acum.</th><th>ABC</th></tr></thead><tbody>
                {data.abc.map(r => <tr key={r.key || `${r.sociedad_id || 'sin'}-${r.material_id}`}>{mostrarSociedad && <td><SociedadBadge sociedadId={r.sociedad_id} /></td>}<td className="mono" style={{fontWeight:700}}>{r.sku}</td><td>{r.nombre}</td><td className="num">{money(r.valor_salidas)}</td><td className="num">{pctText(r.pct_total)}</td><td className="num">{pctText(r.pct_acumulado)}</td><td><span className={`badge ${r.clase === 'A' ? 'badge-green' : r.clase === 'B' ? 'badge-orange' : 'badge-gray'}`}>{r.clase}</span></td></tr>)}
              </tbody></table>
            </div>
          </>
        ) : tab === 'rotacion' ? (
          data.rotacion.length === 0 || Number(meta.movimientosPeriodo || 0) === 0 ? <div style={{textAlign:'center', padding:44, color:'var(--fg-muted)'}}>No hay movimientos suficientes para calcular rotación en el período.</div> : (
            <div className="table-wrap"><table className="tbl"><thead><tr>{mostrarSociedad && <th>Sociedad</th>}<th>SKU</th><th>Descripción</th><th>Almacén</th><th className="num">Salidas</th><th className="num">Stock prom.</th><th className="num">Rotación</th></tr></thead><tbody>
              {data.rotacion.map(r => <tr key={r.key}>{mostrarSociedad && <td><SociedadBadge sociedadId={r.sociedad_id} /></td>}<td className="mono" style={{fontWeight:700}}>{r.sku}</td><td>{r.nombre || r.material_id}</td><td>{r.almacen || '—'}</td><td className="num">{qtyText(r.salidas_periodo)}</td><td className="num">{qtyText(r.stock_promedio)}</td><td className="num" style={{fontWeight:700}}>{rotText(r.rotacion)}</td></tr>)}
            </tbody></table></div>
          )
        ) : (
          data.stockMuerto.length === 0 ? <div style={{textAlign:'center', padding:44, color:'var(--fg-muted)'}}>No se detectó stock sin salidas para el umbral seleccionado.</div> : (
            <div className="table-wrap"><table className="tbl"><thead><tr>{mostrarSociedad && <th>Sociedad</th>}<th>SKU</th><th>Descripción</th><th>Almacén</th><th className="num">Stock</th><th>Última salida</th><th className="num">Días sin actividad</th><th className="num">Valor inmovilizado</th></tr></thead><tbody>
              {data.stockMuerto.map(r => <tr key={`${r.sociedad_id || 'sin'}-${r.material_id}-${r.almacen_id}`}>{mostrarSociedad && <td><SociedadBadge sociedadId={r.sociedad_id} /></td>}<td className="mono" style={{fontWeight:700}}>{r.sku}</td><td>{r.nombre}</td><td>{r.almacen}</td><td className="num">{qtyText(r.stock_actual)}</td><td>{r.ultima_salida ? fmtDateShort(r.ultima_salida) : 'Sin salidas registradas'}</td><td className="num">{r.dias_sin_actividad == null ? `>${dias}` : r.dias_sin_actividad}</td><td className="num" style={{fontWeight:700}}>{money(r.valor_inmovilizado)}</td></tr>)}
            </tbody></table></div>
          )
        )}
      </div>
    </div>
  );
}

function Inventario() {
  const { inventario, inventarioConteos = [], almacenes, materiales: catalogoMateriales = [], ordenesCompra = [], recepciones = [], entradasOcPendientes = [], searchQuery, registrarEntradaManualCtx, registrarTransferenciaCtx, registrarAjusteCtx, getKardexMaterialCtx, crearSOLPE, recargarInventario, recargarEntradasOcPendientes, iniciarConteoCtx, guardarAvanceConteoCtx, cerrarConteoCtx, recargarConteosInventarioCtx, getAnaliticaInventarioCtx, empresa, perfilSociedad, sociedadesIdsAlcance, sociedadActiva, sociedadesDisponibles } = useApp();
  const modoVistaSociedadInventario = resolverFiltroSociedadesVista({
    multisociedadHabilitado: empresa?.multisociedad_habilitado,
    perfilSociedad,
    sociedadActiva,
    sociedadesIdsAlcance,
    sociedadesDisponibles,
  });
  const mensajeSeleccionSociedadConteo = 'Selecciona una sociedad concreta en el selector superior para iniciar un conteo físico.';
  const mostrarBadgeSociedadInventario = Boolean(
    empresa?.multisociedad_habilitado
    && !modoVistaSociedadInventario.permiteEscritura
    && (modoVistaSociedadInventario.sinFiltro || modoVistaSociedadInventario.sociedadesIds.length > 0)
  );
  const sociedadesIdsVistaInventarioKey = modoVistaSociedadInventario.sociedadesIds.join('|');
  const filtroSociedadesInventario = {
    sinFiltro: modoVistaSociedadInventario.sinFiltro,
    sociedadesIds: modoVistaSociedadInventario.sociedadesIds,
  };
  const inventarioVista = useMemo(() => {
    if (modoVistaSociedadInventario.sinFiltro) return inventario;
    const permitidas = new Set(modoVistaSociedadInventario.sociedadesIds);
    return inventario.filter(item => item.sociedad_id && permitidas.has(item.sociedad_id));
  }, [inventario, modoVistaSociedadInventario.sinFiltro, sociedadesIdsVistaInventarioKey]);
  const conteosVista = useMemo(() => {
    if (modoVistaSociedadInventario.sinFiltro) return inventarioConteos;
    const permitidas = new Set(modoVistaSociedadInventario.sociedadesIds);
    return inventarioConteos.filter(conteo => conteo.sociedad_id && permitidas.has(conteo.sociedad_id));
  }, [inventarioConteos, modoVistaSociedadInventario.sinFiltro, sociedadesIdsVistaInventarioKey]);
  const ordenesCompraVista = useMemo(() => {
    if (modoVistaSociedadInventario.sinFiltro) return ordenesCompra;
    const permitidas = new Set(modoVistaSociedadInventario.sociedadesIds);
    return ordenesCompra.filter(oc => oc.sociedad_id && permitidas.has(oc.sociedad_id));
  }, [ordenesCompra, modoVistaSociedadInventario.sinFiltro, sociedadesIdsVistaInventarioKey]);
  const entradasOcPendientesVista = useMemo(() => {
    if (modoVistaSociedadInventario.sinFiltro) return entradasOcPendientes;
    const permitidas = new Set(modoVistaSociedadInventario.sociedadesIds);
    return entradasOcPendientes.filter(entrada => entrada.sociedad_id && permitidas.has(entrada.sociedad_id));
  }, [entradasOcPendientes, modoVistaSociedadInventario.sinFiltro, sociedadesIdsVistaInventarioKey]);
  const [selSku, setSelSku] = useState(null);
  const [modalEntrada, setModalEntrada] = useState(false);
  const [modalTransf, setModalTransf] = useState(false);
  const [modalAjuste, setModalAjuste] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [toast, setToast] = useState('');
  const [mainTab, setMainTab] = useState('stock');

  const mostrarToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    setCargando(true);
    Promise.all([
      recargarInventario?.(filtroSociedadesInventario),
      recargarEntradasOcPendientes?.(filtroSociedadesInventario),
      recargarConteosInventarioCtx?.(filtroSociedadesInventario),
    ]).finally(() => setCargando(false));
  }, [modoVistaSociedadInventario.sinFiltro, sociedadesIdsVistaInventarioKey]);

  const query = searchQuery.toLowerCase();
  const filteredInv = inventarioVista.filter(i =>
    (i.sku || '').toLowerCase().includes(query) ||
    (i.nombre || '').toLowerCase().includes(query) ||
    (i.categoria || '').toLowerCase().includes(query) ||
    (i.almacen || '').toLowerCase().includes(query)
  );

  // KPIs con umbrales reales
  const totalValor = filteredInv.reduce((s, i) => s + ((i.disponible ?? i.stock_actual ?? 0) * (i.costo_promedio ?? 0)), 0);
  const stockCritico = filteredInv.filter(i => (i.disponible ?? i.stock_actual ?? 0) === 0).length;
  const stockBajo = filteredInv.filter(i => {
    const disp = i.disponible ?? i.stock_actual ?? 0;
    const umbral = Number(i.punto_reorden || i.stock_minimo || 0) + Number(i.stock_seguridad || 0);
    return disp > 0 && umbral > 0 && disp <= umbral;
  }).length;

  const handleEntrada = async (form) => {
    await registrarEntradaManualCtx(form, filtroSociedadesInventario);
    mostrarToast('Entrada registrada correctamente');
  };

  const handleTransferencia = async (form) => {
    await registrarTransferenciaCtx(form, filtroSociedadesInventario);
    mostrarToast('Transferencia registrada');
    setSelSku(null);
  };

  const handleAjuste = async (form) => {
    await registrarAjusteCtx(form, filtroSociedadesInventario);
    mostrarToast('Ajuste registrado');
    setSelSku(null);
  };

  const handleSolpe = () => {
    if (selSku && crearSOLPE) {
      const puntoReordenEfectivo = Number(selSku.punto_reorden || selSku.stock_minimo || 0) + Number(selSku.stock_seguridad || 0);
      crearSOLPE({
        descripcion: `Reposicion de ${selSku.nombre} (${selSku.sku})`,
        tipo: 'bien',
        prioridad: 'alta',
        origen: 'manual',
        origen_tipo: 'inventario',
        origen_id: selSku.material_id,
        material_id: selSku.material_id,
        cantidad_solicitada: selSku.stock_maximo ? Math.max(Number(selSku.stock_maximo || 0) - Number(selSku.disponible || 0), 0) : Math.max(puntoReordenEfectivo * 2, 0),
        items: [{ nombre: selSku.nombre, material_id: selSku.material_id, cantidad: selSku.stock_maximo ? Math.max(Number(selSku.stock_maximo || 0) - Number(selSku.disponible || 0), 0) : Math.max(puntoReordenEfectivo * 2, 0), unidad: selSku.unidad }]
      });
      mostrarToast('SOLPE generada y enviada a Compras');
    }
    setSelSku(null);
  };

  const coloresFila = (r) => {
    const disp = r.disponible ?? r.stock_actual ?? 0;
    const umbral = Number(r.punto_reorden || r.stock_minimo || 0) + Number(r.stock_seguridad || 0);
    if (disp === 0) return 'var(--danger)';
    if (umbral > 0 && disp <= umbral) return 'var(--orange)';
    return 'var(--fg)';
  };

  return (
    <>
      {toast && <div style={{position:'fixed',top:20,right:24,zIndex:9999,background:'var(--green)',color:'white',padding:'10px 20px',borderRadius:8,fontWeight:600,boxShadow:'0 4px 12px rgba(0,0,0,0.2)'}}>{toast}</div>}

      <div className="page-header">
        <div>
          <h1 className="page-title">Almacenes e Inventario</h1>
          <div className="page-sub">{inventarioVista.length} SKUs · {almacenes.length} almacén(es)</div>
        </div>
        <div className="row" style={{gap:8}}>
          {cargando && <span style={{fontSize:12,color:'var(--fg-muted)',alignSelf:'center'}}>Actualizando...</span>}
          {mainTab === 'stock' && <button className="btn btn-primary" onClick={() => setModalEntrada(true)}>{I.plus} Registrar Entrada</button>}
          {mainTab === 'conteo' && <button className="btn btn-secondary" onClick={() => recargarConteosInventarioCtx?.(filtroSociedadesInventario)}>{I.refresh} Actualizar</button>}
        </div>
      </div>

      <div className="tabs" style={{marginBottom:16}}>
        {[
          ['stock', 'Stock'],
          ['conteo', 'Conteo físico'],
          ['analitica', 'Analítica'],
        ].map(([id, label]) => <button key={id} className={`tab${mainTab === id ? ' active' : ''}`} onClick={() => setMainTab(id)}>{label}</button>)}
      </div>

      {mainTab === 'stock' && <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
          <div className="kpi-card"><div className="kpi-label">Valor inventario</div><div className="kpi-value">{moneyD(totalValor)}</div><div className="kpi-icon cyan">{I.package}</div></div>
          <div className="kpi-card"><div className="kpi-label">SKUs activos</div><div className="kpi-value">{filteredInv.length}</div><div className="kpi-icon purple">{I.warehouse}</div></div>
          <div className="kpi-card"><div className="kpi-label">Bajo reorden</div><div className="kpi-value" style={{color:'var(--orange)'}}>{stockBajo}</div><div className="kpi-icon orange">{I.alert}</div></div>
          <div className="kpi-card"><div className="kpi-label">Stock agotado</div><div className="kpi-value" style={{color:'var(--danger)'}}>{stockCritico}</div><div className="kpi-icon danger">{I.alert}</div></div>
        </div>}

      {mainTab === 'stock' && <div className="card mt-6">
        {inventarioVista.length === 0 && !cargando && (
          <div style={{textAlign:'center',padding:60,color:'var(--fg-muted)'}}>
            <div style={{fontSize:40,marginBottom:12}}>📦</div>
            <div style={{fontWeight:600,fontSize:16,marginBottom:8}}>Sin stock registrado</div>
            <div style={{fontSize:13,marginBottom:20}}>Registra una entrada manual o confirma una recepción de compras.</div>
            <button className="btn btn-primary" onClick={() => setModalEntrada(true)}>{I.plus} Primera Entrada</button>
          </div>
        )}
        {(inventarioVista.length > 0 || cargando) && (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>SKU</th>{mostrarBadgeSociedadInventario && <th>Sociedad</th>}<th>Descripción</th><th>Categoría</th><th>Almacén</th><th>Unidad</th>
                  <th className="num">Físico</th><th className="num">Disponible</th><th className="num">Reservado</th>
                  <th className="num">Costo Prom.</th><th className="num">Valor Total</th><th>Control</th>
                </tr>
              </thead>
              <tbody>
                {filteredInv.map(r => (
                  <tr key={r.id} onClick={() => setSelSku(r)} className="hover-row" style={{cursor:'pointer'}}>
                    <td className="mono" style={{fontWeight:600}}>{r.sku}</td>
                    {mostrarBadgeSociedadInventario && <td><SociedadBadge sociedadId={r.sociedad_id} /></td>}
                    <td><strong>{r.nombre}</strong></td>
                    <td>{r.categoria}</td>
                    <td>{r.almacen}</td>
                    <td className="text-muted">{r.unidad}</td>
                    <td className="num">{r.fisico ?? r.disponible ?? 0}</td>
                    <td className="num" style={{fontWeight:600,color:coloresFila(r)}}>{r.disponible ?? r.stock_actual ?? 0}</td>
                    <td className="num" style={{color:'var(--fg-muted)'}}>{r.reservado ?? 0}</td>
                    <td className="num">{moneyD(r.costo_promedio)}</td>
                    <td className="num">{moneyD((r.disponible ?? r.stock_actual ?? 0) * (r.costo_promedio ?? 0))}</td>
                    <td><span className="badge badge-gray" style={{fontSize:10}}>{r.tipo_control === 'lote' ? 'LOTE' : r.tipo_control === 'serie' ? 'SERIE' : '—'}</span></td>
                  </tr>
                ))}
                {filteredInv.length === 0 && !cargando && (
                  <tr><td colSpan={mostrarBadgeSociedadInventario ? 12 : 11} style={{textAlign:'center',padding:40,color:'var(--fg-muted)'}}>No se encontraron materiales para la búsqueda</td></tr>
                )}
                {cargando && (
                  <tr><td colSpan={mostrarBadgeSociedadInventario ? 12 : 11} style={{textAlign:'center',padding:30,color:'var(--fg-muted)'}}>Cargando inventario...</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>}

      {mainTab === 'conteo' && (
        <ConteoFisicoTab
          inventario={inventarioVista}
          almacenes={almacenes.filter(a => !a.estado || a.estado === 'activo')}
          conteos={conteosVista}
          iniciarConteoCtx={iniciarConteoCtx}
          guardarAvanceConteoCtx={guardarAvanceConteoCtx}
          cerrarConteoCtx={cerrarConteoCtx}
          recargarConteosInventarioCtx={recargarConteosInventarioCtx}
          mostrarToast={mostrarToast}
          mostrarBadgeSociedad={mostrarBadgeSociedadInventario}
          permiteEscritura={modoVistaSociedadInventario.permiteEscritura}
          sociedadIdEscritura={modoVistaSociedadInventario.sociedadIdEscritura}
          mensajeSeleccionSociedad={mensajeSeleccionSociedadConteo}
          filtroSociedades={filtroSociedadesInventario}
        />
      )}

      {mainTab === 'analitica' && (
        <AnaliticaInventarioTab
          almacenes={almacenes.filter(a => !a.estado || a.estado === 'activo')}
          getAnaliticaInventarioCtx={getAnaliticaInventarioCtx}
          filtroSociedades={filtroSociedadesInventario}
          mostrarSociedad={mostrarBadgeSociedadInventario}
        />
      )}

      {modalEntrada && (
        <ModalEntradaManual
          materiales={catalogoMateriales.filter(m => m.estado !== 'inactivo')}
          almacenes={almacenes.filter(a => !a.estado || a.estado === 'activo')}
          ordenesCompra={ordenesCompraVista}
          recepciones={recepciones}
          entradasOcPendientes={entradasOcPendientesVista}
          sociedadIdEscritura={modoVistaSociedadInventario.sociedadIdEscritura}
          permiteEscritura={modoVistaSociedadInventario.permiteEscritura}
          sociedadesDisponibles={sociedadesDisponibles}
          filtroSociedades={filtroSociedadesInventario}
          onClose={() => setModalEntrada(false)}
          onSave={handleEntrada}
        />
      )}

      {selSku && !modalTransf && !modalAjuste && (
        <PanelKardex
          sku={selSku}
          almacenes={almacenes}
          onClose={() => setSelSku(null)}
          onTransferencia={() => setModalTransf(true)}
          onAjuste={() => setModalAjuste(true)}
          onSolpe={handleSolpe}
          getKardexMaterialCtx={getKardexMaterialCtx}
          filtroSociedades={filtroSociedadesInventario}
          mostrarSociedad={mostrarBadgeSociedadInventario}
        />
      )}

      {selSku && modalTransf && (
        <ModalTransferencia
          sku={selSku}
          almacenes={almacenes.filter(a => !a.estado || a.estado === 'activo')}
          onClose={() => setModalTransf(false)}
          onSave={handleTransferencia}
        />
      )}

      {selSku && modalAjuste && (
        <ModalAjuste
          sku={selSku}
          onClose={() => setModalAjuste(false)}
          onSave={handleAjuste}
        />
      )}

    </>
  );
}

// ============ HOJA DE COSTEO ============
function HojaCosteo() {
  const { hojasCosteo, oportunidades, cuentas, activeParams, navigate, crearHojaCosteo, actualizarHojaCosteo, aprobarHojaCosteo, searchQuery, empresa, perfilSociedad, sociedadesIdsAlcance, sociedadActiva, sociedadesDisponibles } = useApp();

  const getOpp = id => oportunidades.find(o => o.id === id);
  const getCuentaNombre = id => { const c = cuentas.find(x => x.id === id); return c?.razon_social || c?.nombre_comercial || id || 'N/A'; };
  const estadoHC = e => e || 'borrador';
  const labelEstadoHC = e => String(estadoHC(e)).replace('_', ' ');
  const badgeHC = e => estadoHC(e) === 'aprobada' ? 'badge-green' : estadoHC(e) === 'en_revision' ? 'badge-orange' : 'badge-gray';

  const modoVistaSociedadHC = resolverFiltroSociedadesVista({
    multisociedadHabilitado: empresa?.multisociedad_habilitado,
    perfilSociedad,
    sociedadActiva,
    sociedadesIdsAlcance,
    sociedadesDisponibles,
  });
  const mostrarBadgeSociedadHC = Boolean(
    empresa?.multisociedad_habilitado
    && !modoVistaSociedadHC.permiteEscritura
    && (modoVistaSociedadHC.sinFiltro || modoVistaSociedadHC.sociedadesIds.length > 0)
  );
  const sociedadesIdsVistaHCKey = modoVistaSociedadHC.sociedadesIds.join('|');
  const hojasCosteoAlcance = useMemo(() => {
    if (modoVistaSociedadHC.sinFiltro) return hojasCosteo;
    const permitidas = new Set(modoVistaSociedadHC.sociedadesIds);
    return hojasCosteo.filter(hoja => hoja.sociedad_id && permitidas.has(hoja.sociedad_id));
  }, [hojasCosteo, modoVistaSociedadHC.sinFiltro, sociedadesIdsVistaHCKey]);
  const query = searchQuery.toLowerCase();
  const filteredHC = hojasCosteoAlcance.filter(hc => {
    const opp = getOpp(hc.oportunidad_id);
    const cliente = getCuentaNombre(hc.cuenta_id);
    return !query ||
      hc.numero.toLowerCase().includes(query) ||
      cliente.toLowerCase().includes(query) ||
      (opp?.nombre || '').toLowerCase().includes(query);
  });

  if (activeParams?.detail) {
    const hc = hojasCosteoAlcance.find(h => h.id === activeParams.detail);
    if (!hc) return <div className="p-4">Hoja de Costeo no encontrada</div>;
    return <DetalleHC hc={hc} getOpp={getOpp} getCuentaNombre={getCuentaNombre} badgeHC={badgeHC} actualizarHojaCosteo={actualizarHojaCosteo} aprobarHojaCosteo={aprobarHojaCosteo} navigate={navigate} mostrarBadgeSociedad={mostrarBadgeSociedadHC} />;
  }

  if (activeParams?.nueva) {
    const opp = getOpp(activeParams.opp);
    if (!opp) return <div className="p-4">Oportunidad no encontrada</div>;
    return (
      <EditorHC
        opp={opp}
        getCuentaNombre={getCuentaNombre}
        onSave={async datos => { const id = await crearHojaCosteo(datos); navigate('hoja_costeo', { detail: id }); }}
        onCancel={() => navigate('pipeline', { panel: opp.id })}
      />
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Hojas de Costeo</h1>
          <div className="page-sub">{hojasCosteoAlcance.length} documentos · documento interno previo a cotización</div>
        </div>
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Número</th>{mostrarBadgeSociedadHC && <th>Sociedad</th>}<th>Oportunidad</th><th>Cliente</th><th>Costo Total</th><th>Precio Sugerido</th><th>Margen obj.</th><th>Responsable</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {filteredHC.map(hc => {
                const opp = getOpp(hc.oportunidad_id);
                return (
                  <tr key={hc.id} className="hover-row" style={{cursor:'pointer'}} onClick={() => navigate('hoja_costeo', { detail: hc.id })}>
                    <td className="mono" style={{fontWeight:600}}>{hc.numero}</td>
                    {mostrarBadgeSociedadHC && <td><SociedadBadge sociedadId={hc.sociedad_id} /></td>}
                    <td>{opp?.nombre || '—'}</td>
                    <td><strong>{getCuentaNombre(hc.cuenta_id)}</strong></td>
                    <td className="num">{moneyCurrency(hc.costo_total, opp?.moneda || hc.moneda)}</td>
                    <td className="num" style={{fontWeight:600}}>{moneyCurrency(hc.precio_sugerido_total, opp?.moneda || hc.moneda)}</td>
                    <td className="num">{hc.margen_objetivo_pct}%</td>
                    <td className="text-muted">{hc.responsable_costeo || '—'}</td>
                    <td><span className={'badge ' + badgeHC(hc.estado)}>{labelEstadoHC(hc.estado)}</span></td>
                  </tr>
                );
              })}
              {filteredHC.length === 0 && <tr><td colSpan={mostrarBadgeSociedadHC ? 9 : 8} style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>{query ? 'Sin resultados para la búsqueda' : 'No hay hojas de costeo. Créalas desde el Pipeline.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function SeccionCosto({ titulo, badge, items, onChange, readOnly, sugerido, catalogoOpciones, moneda = 'PEN' }) {
  const safeItems = Array.isArray(items) ? items : [];
  const calcSubtotal = list => list.reduce((s, i) => s + (Number(i.cantidad || 0) * Number(i.costo_unitario || 0)), 0);

  const addItem = () => onChange([...safeItems, { id: Date.now(), descripcion: sugerido || '', cantidad: 1, unidad: 'und', costo_unitario: '' }]);
  const removeItem = id => onChange(safeItems.filter(i => i.id !== id));
  const updateItem = (id, field, value) => onChange(safeItems.map(i => i.id === id ? { ...i, [field]: value } : i));
  const selectFromCatalogo = (id, srvDescripcion) => {
    const srv = catalogoOpciones?.find(s => s.descripcion === srvDescripcion);
    onChange(safeItems.map(i => i.id === id ? { ...i, descripcion: srvDescripcion, costo_unitario: srv ? srv.costo : i.costo_unitario } : i));
  };

  return (
    <section className="cost-section">
      <div className="cost-section-head">
        <div className="row" style={{gap:10, alignItems:'center'}}>
          <h3>{titulo}</h3>
          <span className={'badge ' + badge}>{moneyCurrency(calcSubtotal(safeItems), moneda)}</span>
        </div>
        {!readOnly && <button className="btn btn-secondary btn-sm" onClick={addItem}>{I.plus} Agregar línea</button>}
      </div>
      {safeItems.length === 0 && !readOnly && (
        <div style={{padding:'12px 16px', background:'var(--bg-subtle)', borderRadius:6, color:'var(--fg-muted)', fontSize:13}}>
          Sin ítems — usa "Agregar línea" para comenzar.
        </div>
      )}
      {safeItems.length > 0 && (
        <div className="table-wrap cost-table-wrap">
          <table className="tbl cost-table">
            <thead><tr><th>Descripción</th><th style={{width:100}}>Cant.</th><th style={{width:100}}>Unidad</th><th style={{width:130}}>Costo unit. ({currencySymbol(moneda)})</th><th style={{width:120}}>Subtotal</th>{!readOnly && <th style={{width:36}}></th>}</tr></thead>
            <tbody>
              {safeItems.map(item => (
                <tr key={item.id}>
                  <td data-label="Descripcion">{readOnly
                    ? item.descripcion
                    : catalogoOpciones
                      ? <select className="select" value={item.descripcion} onChange={e => selectFromCatalogo(item.id, e.target.value)}>
                          <option value="">Seleccionar servicio...</option>
                          {catalogoOpciones.map(s => <option key={s.id} value={s.descripcion}>{s.descripcion}</option>)}
                        </select>
                      : <input className="input" value={item.descripcion} onChange={e => updateItem(item.id, 'descripcion', e.target.value)} placeholder="Concepto del costo" />
                  }</td>
                  <td data-label="Cant.">{readOnly ? <span className="num">{item.cantidad}</span> : <input type="number" className="input num" min="0" step="0.01" value={item.cantidad} onChange={e => updateItem(item.id, 'cantidad', e.target.value)} />}</td>
                  <td data-label="Unidad">{readOnly ? <span className="text-muted">{item.unidad}</span> : <input className="input" value={item.unidad} onChange={e => updateItem(item.id, 'unidad', e.target.value)} />}</td>
                  <td data-label="Costo unit.">{readOnly ? <span className="num">{moneyCurrency(item.costo_unitario, moneda)}</span> : <input type="number" className="input num" min="0" step="0.01" value={item.costo_unitario} onChange={e => updateItem(item.id, 'costo_unitario', e.target.value)} />}</td>
                  <td data-label="Subtotal" className="num" style={{fontWeight:600}}>{moneyCurrency(Number(item.cantidad || 0) * Number(item.costo_unitario || 0), moneda)}</td>
                  {!readOnly && <td className="cost-row-action"><button type="button" className="icon-btn text-danger" onClick={() => removeItem(item.id)} title="Eliminar linea">{I.x}</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ResumenCostos({ hc, moneda = 'PEN' }) {
  const margen = Number(hc.margen_objetivo_pct || 35);
  const totalManoObra = hc.total_mano_obra ?? calcSub(hc.mano_obra);
  const totalMateriales = hc.total_materiales ?? calcSub(hc.materiales);
  const totalServicios = hc.total_servicios_terceros ?? calcSub(hc.servicios_terceros);
  const totalLogistica = hc.total_logistica ?? calcSub(hc.logistica);
  const costo = hc.costo_total ?? (totalManoObra + totalMateriales + totalServicios + totalLogistica);
  const sinIgv = hc.precio_sugerido_sin_igv ?? calcPrecio(hc);
  const conIgv = hc.precio_sugerido_total ?? (sinIgv * 1.18);
  const margenReal = sinIgv > 0 ? Math.round((sinIgv - costo) / sinIgv * 100) : 0;

  return (
    <div style={{background:'var(--bg-subtle)', borderRadius:10, padding:20, border:'1px solid var(--border)'}}>
      <div className="eyebrow" style={{marginBottom:16}}>Resumen económico</div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 24px', marginBottom:16}}>
        {[
          ['Mano de obra', totalManoObra],
          ['Materiales', totalMateriales],
          ['Servicios terceros', totalServicios],
          ['Logística', totalLogistica],
        ].map(([label, val]) => (
          <div key={label} className="row" style={{justifyContent:'space-between'}}>
            <span className="text-muted" style={{fontSize:13}}>{label}</span>
            <span className="num" style={{fontSize:13}}>{moneyCurrency(val || 0, moneda)}</span>
          </div>
        ))}
      </div>
      <div style={{borderTop:'2px solid var(--border)', paddingTop:12, marginBottom:8}}>
        <div className="row" style={{justifyContent:'space-between', marginBottom:6}}>
          <span style={{fontWeight:600}}>Costo total estimado</span>
          <span className="num" style={{fontWeight:700}}>{moneyCurrency(costo, moneda)}</span>
        </div>
        <div className="row" style={{justifyContent:'space-between', marginBottom:6}}>
          <span className="text-muted" style={{fontSize:13}}>Margen objetivo: {margen}% → precio sin IGV</span>
          <span className="num" style={{fontSize:13}}>{moneyCurrency(sinIgv, moneda)}</span>
        </div>
        <div className="row" style={{justifyContent:'space-between', paddingTop:8, borderTop:'1px solid var(--border)'}}>
          <span style={{fontWeight:700, fontFamily:'Sora', fontSize:16}}>Precio sugerido al cliente (c/ IGV)</span>
          <span className="num" style={{fontWeight:700, fontFamily:'Sora', fontSize:18, color:'var(--cyan)'}}>{moneyCurrency(conIgv, moneda)}</span>
        </div>
      </div>
      <div style={{marginTop:8, padding:'6px 10px', background: margenReal >= margen ? 'rgba(76,175,80,0.1)' : 'rgba(255,152,0,0.1)', borderRadius:6, textAlign:'center', fontSize:13}}>
        Margen real calculado: <strong>{margenReal}%</strong> {margenReal >= margen ? '✓' : '↓ bajo objetivo'}
      </div>
    </div>
  );
}

function DetalleHC({ hc, getOpp, getCuentaNombre, badgeHC, actualizarHojaCosteo, aprobarHojaCosteo, navigate, mostrarBadgeSociedad }) {
  const { usuarios, roles, empresa, authUser, role, cuentas, empresaConfig, addNotificacion } = useApp();
  const comercialesAsignables = getAssignableUsers({ users: usuarios, roles, categories: ['comercial'], includeAdmins: true, empresaId: empresa?.id, viewer: authUser });
  const opp = getOpp(hc.oportunidad_id);
  const hcMoneda = opp?.moneda || hc.moneda || 'PEN';
  const estado = hc.estado || 'borrador';
  const estadoLabel = String(estado).replace('_',' ');
  const viewer = (usuarios || []).find(u =>
    u.id === authUser?.id ||
    u.auth_user_id === authUser?.id ||
    (u.email && authUser?.email && String(u.email).toLowerCase() === String(authUser.email).toLowerCase())
  ) || authUser;
  const ownerUserId = opp?.responsable_id || null;
  const ownerName = opp?.responsable || hc.responsable_costeo || null;
  const rolActual = roles?.[authUser?.rol_id || authUser?.rol] || {};
  const permisosActivos = role?.permisos || {};
  const permisosRolActual = rolActual?.permisos || {};
  const tienePermisoAprobarHC = Boolean(
    permisosActivos.todo ||
    permisosActivos.tenant_admin ||
    permisosActivos.aprobar?.includes?.('hoja_costeo') ||
    permisosRolActual.aprobar?.includes?.('hoja_costeo')
  );
  const esResponsableHC = Boolean(
    (ownerUserId && ownerUserId === authUser?.id) ||
    (!ownerUserId && ownerName && String(ownerName).trim() === String(viewer?.nombre || '').trim())
  );
  const puedeAprobarHC = tienePermisoAprobarHC && canUserApproveOwner({
    viewer,
    ownerUserId,
    ownerName,
    users: usuarios,
    roles,
  });
  const [editMode, setEditMode] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);
  const [form, setForm] = useState({
    mano_obra: Array.isArray(hc.mano_obra) ? hc.mano_obra : [],
    materiales: Array.isArray(hc.materiales) ? hc.materiales : [],
    servicios_terceros: Array.isArray(hc.servicios_terceros) ? hc.servicios_terceros : [],
    logistica: Array.isArray(hc.logistica) ? hc.logistica : [],
    margen_objetivo_pct: hc.margen_objetivo_pct,
    responsable_costeo: hc.responsable_costeo || '',
    notas: hc.notas || ''
  });

  const puedeEditar = estado === 'borrador' || (estado === 'en_revision' && puedeAprobarHC);
  const readOnly = !puedeEditar || !editMode;

  const handleSave = async () => {
    await actualizarHojaCosteo(hc.id, form);
    setEditMode(false);
  };

  const handleEnviarRevision = async () => {
    await actualizarHojaCosteo(hc.id, editMode ? { ...form, estado: 'en_revision' } : { estado: 'en_revision' });
    setEditMode(false);
  };

  const handleVolverBorrador = async () => {
    await actualizarHojaCosteo(hc.id, editMode ? { ...form, estado: 'borrador' } : { estado: 'borrador' });
    setEditMode(false);
  };

  const handleAprobar = async () => {
    if (editMode) await handleSave();
    await aprobarHojaCosteo(hc.id);
  };

  const handleDescargarPDF = async () => {
    setGenerandoPDF(true);
    try {
      const cfg = empresaConfig || {};
      const logoDataUrl = await pdfAssetSource({ url: cfg.logo_url, path: cfg.logo_path });
      const { pdf } = await import('@react-pdf/renderer');
      const { HojaCostooPDF } = await import('./pages_pdf.jsx');
      const cuenta = (cuentas || []).find(c => c.id === hc.cuenta_id) || null;
      const cfgPDF = { ...cfg, logo_url: logoDataUrl || cfg.logo_url || undefined };
      const blob = await pdf(
        <HojaCostooPDF hc={{ ...hc, ...form }} opp={opp} cuenta={cuenta} cfg={cfgPDF} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${hc.numero}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[PDF HC]', err);
      addNotificacion('Error al generar el PDF: ' + (err?.message || err));
    } finally {
      setGenerandoPDF(false);
    }
  };

  return (
    <>
      <div className="page-header" style={{borderBottom:'none', paddingBottom:0}}>
        <div>
          <button className="btn btn-ghost" onClick={() => navigate('hoja_costeo')} style={{marginBottom:10, padding:0, color:'var(--cyan)'}}>← Volver a lista</button>
          <h1 className="page-title row" style={{gap:10}}>{hc.numero} <span className={'badge ' + badgeHC(estado)} style={{fontSize:12, textTransform:'uppercase'}}>{estadoLabel}</span><span className="badge badge-gray" style={{fontSize:11}}>{currencySymbol(hcMoneda)}</span>{mostrarBadgeSociedad && <SociedadBadge sociedadId={hc.sociedad_id} />}</h1>
          <div className="page-sub">Oportunidad: {opp?.nombre || '—'} · Cliente: <strong>{getCuentaNombre(hc.cuenta_id)}</strong></div>
        </div>
        <div className="row">
          {puedeEditar && (
            <button className={`btn ${editMode?'btn-primary':'btn-secondary'}`} onClick={() => editMode ? handleSave() : setEditMode(true)}>
              {editMode ? <>{I.save} Guardar cambios</> : <>{I.edit} Editar costeo</>}
            </button>
          )}
          {estado === 'borrador' && (
            <button className="btn btn-primary" onClick={handleEnviarRevision}>{I.send} Enviar a revision</button>
          )}
          {estado === 'en_revision' && (puedeAprobarHC || esResponsableHC) && (
            <button className="btn btn-secondary" onClick={handleVolverBorrador}>{I.edit} Volver a borrador</button>
          )}
          {estado === 'en_revision' && puedeAprobarHC && (
            <button className="btn btn-primary" style={{background:'var(--green)'}} onClick={handleAprobar}>{I.check} Aprobar Costeo</button>
          )}
          {estado === 'aprobada' && (
            <button className="btn btn-primary" onClick={() => navigate('cotizaciones', { active_tab: 'nueva', opp: hc.oportunidad_id, hc_id: hc.id })}>{I.plus} Generar Cotización</button>
          )}
          <button className="btn btn-secondary" onClick={handleDescargarPDF} disabled={generandoPDF}>{I.download} {generandoPDF ? 'Generando…' : 'PDF'}</button>
        </div>
      </div>

      {opp && (
        <div style={{ margin: '0 0 0', padding: '12px 32px 0' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Referencia de la oportunidad — no se editan desde aquí</div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Monto estimado</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{moneyCurrency(opp.monto_estimado || 0, opp.moneda || 'PEN')}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Etapa</div>
                <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{(opp.etapa || '—').replace('_', ' ')}</div>
              </div>
              {opp.servicio_interes && (
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Servicio de interés</div>
                  <div>{opp.servicio_interes}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {estado === 'en_revision' && !puedeAprobarHC && (
        <div style={{ margin: '12px 32px 0', padding: '10px 14px', background: '#fff7ed', borderRadius: 8, borderLeft: '3px solid var(--orange)', fontSize: 13, color: '#9a3412' }}>
          Pendiente de revision: la jefatura comercial o un nivel superior debe aprobar esta Hoja de Costeo para generar la cotizacion.
        </div>
      )}

      <div className="cost-editor-shell">
        <div className="cost-editor-grid">
          <div className="cost-lines">
            <SeccionCosto titulo="Mano de Obra" badge="badge-cyan" items={form.mano_obra} readOnly={readOnly} onChange={val => setForm(p=>({...p, mano_obra: val}))} moneda={hcMoneda} />
            <SeccionCosto titulo="Materiales e Insumos" badge="badge-purple" items={form.materiales} readOnly={readOnly} onChange={val => setForm(p=>({...p, materiales: val}))} moneda={hcMoneda} />
            <SeccionCosto titulo="Servicios Terceros / Alquileres" badge="badge-orange" items={form.servicios_terceros} readOnly={readOnly} onChange={val => setForm(p=>({...p, servicios_terceros: val}))} moneda={hcMoneda} />
            <SeccionCosto titulo="Logística y Viáticos" badge="badge-gray" items={form.logistica} readOnly={readOnly} onChange={val => setForm(p=>({...p, logistica: val}))} moneda={hcMoneda} />
          </div>
          <aside className="cost-sidebar">
            <ResumenCostos hc={{ ...hc, ...form, costo_total: (calcSub(form.mano_obra)+calcSub(form.materiales)+calcSub(form.servicios_terceros)+calcSub(form.logistica)), precio_sugerido_sin_igv: calcPrecio(form), precio_sugerido_total: calcPrecio(form)*1.18 }} moneda={hcMoneda} />

            <div className="card mt-6" style={{padding:20}}>
              <div className="eyebrow" style={{marginBottom:16}}>Configuración y Notas</div>
              <div className="input-group">
                <label>Margen objetivo (%)</label>
                {readOnly ? <div>{form.margen_objetivo_pct}%</div> : <input type="number" className="input" value={form.margen_objetivo_pct} onChange={e => setForm(p=>({...p, margen_objetivo_pct: Number(e.target.value)}))} />}
              </div>
              <div className="input-group">
                <label>Responsable</label>
                {readOnly ? <div>{form.responsable_costeo || '—'}</div> : (
                  <select className="select" value={form.responsable_costeo} onChange={e => setForm(p=>({...p, responsable_costeo: e.target.value}))}>
                    <option value="">Sin asignar</option>
                    {comercialesAsignables.map(u => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                  </select>
                )}
              </div>
              <div className="input-group">
                <label>Notas internas</label>
                {readOnly ? <div className="text-muted" style={{fontSize:13}}>{form.notas || 'Sin notas'}</div> : <textarea className="input" rows="3" value={form.notas} onChange={e => setForm(p=>({...p, notas: e.target.value}))} />}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

const calcSub = list => (list||[]).reduce((s,i)=>s+(Number(i.cantidad || 0)*Number(i.costo_unitario || 0)),0);
const calcPrecio = f => {
  const c = calcSub(f.mano_obra)+calcSub(f.materiales)+calcSub(f.servicios_terceros)+calcSub(f.logistica);
  const margen = Math.min(Math.max(Number(f.margen_objetivo_pct || 35), 0), 95);
  const m = margen / 100;
  return c / (1 - m);
};

// Subcomponente Editor Hoja de Costeo
function EditorHC({ opp, getCuentaNombre, onSave, onCancel }) {
  const {
    usuarios, roles, empresa, authUser, addToast, perfilSociedad, sociedadesIdsAlcance,
    sociedadActiva, sociedadesDisponibles,
  } = useApp();
  const modoVistaSociedadHC = resolverFiltroSociedadesVista({
    multisociedadHabilitado: empresa?.multisociedad_habilitado,
    perfilSociedad,
    sociedadActiva,
    sociedadesIdsAlcance,
    sociedadesDisponibles,
  });
  const mensajeSeleccionSociedad = 'Selecciona una sociedad concreta en el selector superior para crear una Hoja de Costeo.';
  const comercialesAsignables = getAssignableUsers({ users: usuarios, roles, categories: ['comercial'], includeAdmins: true, empresaId: empresa?.id, viewer: authUser });
  const [form, setForm] = useState({
    oportunidad_id: opp.id,
    cuenta_id: opp.cuenta_id,
    moneda: opp.moneda || 'PEN',
    numero: `HC-${Date.now().toString().slice(-6)}`,
    mano_obra: [{ id: 1, descripcion: 'Técnico Especialista', cantidad: 1, unidad: 'hh', costo_unitario: 80 }],
    materiales: [],
    servicios_terceros: [],
    logistica: [],
    margen_objetivo_pct: 35,
    responsable_costeo: 'Admin',
    notas: '',
    sociedad_id: empresa?.multisociedad_habilitado ? (modoVistaSociedadHC.sociedadIdEscritura || '') : null,
  });

  const totalCosto = calcSub(form.mano_obra) + calcSub(form.materiales) + calcSub(form.servicios_terceros) + calcSub(form.logistica);
  const precioSinIgv = calcPrecio(form);
  const guardarHojaCosteo = () => {
    if (!modoVistaSociedadHC.permiteEscritura) {
      addToast(mensajeSeleccionSociedad, 'error');
      return;
    }
    onSave({ ...form, costo_total: totalCosto, precio_sugerido_sin_igv: precioSinIgv, precio_sugerido_total: precioSinIgv * 1.18 });
  };

  return (
    <>
      <div className="page-header" style={{borderBottom:'none', paddingBottom:0}}>
        <div>
          <button className="btn btn-ghost" onClick={onCancel} style={{marginBottom:10, padding:0, color:'var(--cyan)'}}>← Volver</button>
          <h1 className="page-title row" style={{gap:10}}>Nueva Hoja de Costeo <span className="badge badge-gray" style={{fontSize:11}}>{currencySymbol(form.moneda)}</span></h1>
          <div className="page-sub">Oportunidad: {opp.nombre} · Cliente: <strong>{getCuentaNombre(opp.cuenta_id)}</strong></div>
        </div>
        <div className="row">
          <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" title={!modoVistaSociedadHC.permiteEscritura ? mensajeSeleccionSociedad : 'Guardar Hoja de Costeo'} disabled={!modoVistaSociedadHC.permiteEscritura || (empresa?.multisociedad_habilitado && !form.sociedad_id)} onClick={guardarHojaCosteo}>{I.save} Guardar y Continuar</button>
        </div>
      </div>

      {!modoVistaSociedadHC.permiteEscritura && (
        <div style={{margin:'12px 32px 0', padding:'10px 14px', borderRadius:8, background:'rgba(245,158,11,0.10)', color:'var(--orange)', fontSize:13}}>
          {mensajeSeleccionSociedad}
        </div>
      )}

      <div style={{ padding: '12px 32px 0' }}>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Referencia de la oportunidad — no se editan desde aquí</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Monto estimado</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{moneyCurrency(opp.monto_estimado || 0, opp.moneda || 'PEN')}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Etapa</div>
              <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{(opp.etapa || '—').replace('_', ' ')}</div>
            </div>
            {opp.servicio_interes && (
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Servicio de interés</div>
                <div>{opp.servicio_interes}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="cost-editor-shell">
        <div className="cost-editor-grid">
          <div className="cost-lines">
            <SeccionCosto titulo="Mano de Obra" badge="badge-cyan" items={form.mano_obra} onChange={val => setForm(p=>({...p, mano_obra: val}))} moneda={form.moneda} />
            <SeccionCosto titulo="Materiales e Insumos" badge="badge-purple" items={form.materiales} onChange={val => setForm(p=>({...p, materiales: val}))} moneda={form.moneda} />
            <SeccionCosto titulo="Servicios Terceros / Alquileres" badge="badge-orange" items={form.servicios_terceros} onChange={val => setForm(p=>({...p, servicios_terceros: val}))} moneda={form.moneda} />
            <SeccionCosto titulo="Logistica y Viaticos" badge="badge-gray" items={form.logistica} onChange={val => setForm(p=>({...p, logistica: val}))} moneda={form.moneda} />
          </div>
          <aside className="cost-sidebar">
             <ResumenCostos hc={{ ...form, costo_total: totalCosto, precio_sugerido_sin_igv: precioSinIgv, precio_sugerido_total: precioSinIgv * 1.18 }} moneda={form.moneda} />
             <div className="card mt-6" style={{padding:20}}>
              <div className="eyebrow" style={{marginBottom:16}}>Configuracion y notas</div>
              <SociedadFormField value={form.sociedad_id || ''} onChange={sociedad_id => setForm(p => ({ ...p, sociedad_id }))} />
              <div className="input-group">
                <label>Margen objetivo (%)</label>
                <input type="number" className="input" value={form.margen_objetivo_pct} onChange={e => setForm(p=>({...p, margen_objetivo_pct: Number(e.target.value)}))} />
              </div>
              <div className="input-group">
                <label>Responsable del costeo</label>
                <select className="select" value={form.responsable_costeo} onChange={e => setForm(p=>({...p, responsable_costeo: e.target.value}))}>
                  <option value="">Sin asignar</option>
                  {comercialesAsignables.map(u => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>Notas internas</label>
                <textarea className="input" rows="3" value={form.notas} onChange={e => setForm(p=>({...p, notas: e.target.value}))} />
              </div>
             </div>
          </aside>
        </div>
      </div>
    </>
  );
}

export { Cotizaciones, Valorizacion, Inventario, HojaCosteo };
