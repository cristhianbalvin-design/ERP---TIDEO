import React, { useState, useEffect } from 'react';
import { I, money } from './icons.jsx';
import { MOCK } from './data.js';
import { useApp } from './context.jsx';

const currencySymbol = (m = 'PEN') => m === 'USD' ? 'US$' : m === 'EUR' ? '€' : 'S/';

// ============ COTIZACIONES ============

const COT_BADGE = e =>
  e === 'aprobada' || e === 'ganada' ? 'badge-green' :
  e === 'enviada' ? 'badge-cyan' :
  e === 'en_negociacion' ? 'badge-orange' :
  e === 'perdida' ? 'badge-red' :
  e === 'convertida' ? 'badge-navy' :
  'badge-gray';

function CotizacionesInner() {
  const {
    cotizaciones, oportunidades, cuentas, contactos, activeParams,
    navigate, crearCotizacion, actualizarCotizacion, aprobarCotizacion,
    crearOSCliente, subirVersionCotizacion, searchQuery, empresaConfig, addNotificacion
  } = useApp();
  const [osModal, setOsModal] = useState(null);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  const getOpp    = id => oportunidades.find(o => o.id === id);
  const getCuenta = id => cuentas.find(c => c.id === id);
  const getCuentaNombre = id => { const c = getCuenta(id); return c?.razon_social || c?.nombre_comercial || id || 'N/A'; };
  const getContacto = id => contactos?.find(c => c.id === id);

  // ── Nueva cotización ───────────────────────────────────────────────
  if (activeParams?.active_tab === 'nueva' && activeParams?.opp) {
    const opp = getOpp(activeParams.opp);
    if (!opp) return <div className="p-4">Oportunidad no encontrada</div>;
    return (
      <EditorCotizacion
        opp={opp}
        cuenta={getCuenta(opp.cuenta_id)}
        contactos={(contactos || []).filter(c => c.cuenta_id === opp.cuenta_id)}
        empresaConfig={empresaConfig}
        onSave={async (data) => { await crearCotizacion(data); navigate('cotizaciones'); }}
        onCancel={() => navigate('pipeline', { panel: opp.id })}
      />
    );
  }

  // ── Editar borrador ────────────────────────────────────────────────
  if (activeParams?.detail && activeParams?.edit) {
    const cot = cotizaciones.find(c => c.id === activeParams.detail);
    if (!cot) return <div className="p-4">Cotización no encontrada</div>;
    const opp = getOpp(cot.oportunidad_id);
    const cuentaId = cot.cuenta_id || opp?.cuenta_id;
    return (
      <EditorCotizacion
        opp={opp}
        cuenta={getCuenta(cuentaId)}
        cotizacionBase={cot}
        contactos={(contactos || []).filter(c => c.cuenta_id === cuentaId)}
        empresaConfig={empresaConfig}
        onSave={async (data) => { await actualizarCotizacion(cot.id, data); navigate('cotizaciones', { detail: cot.id }); }}
        onCancel={() => navigate('cotizaciones', { detail: cot.id })}
      />
    );
  }

  // ── Detalle ────────────────────────────────────────────────────────
  if (activeParams?.detail) {
    const cot = cotizaciones.find(c => c.id === activeParams.detail);
    if (!cot) return <div className="p-4">Cotización no encontrada</div>;
    const opp     = getOpp(cot.oportunidad_id);
    const cuenta  = getCuenta(cot.cuenta_id || opp?.cuenta_id);
    const contacto = getContacto(cot.contacto_id || opp?.contacto_id);

    const handleDescargarPDF = async () => {
      setGenerandoPDF(true);
      try {
        // Si la cotización no tiene token, lo generamos y guardamos ahora
        let token = cot.token_aceptacion;
        if (!token) {
          token = crypto.randomUUID();
          await actualizarCotizacion(cot.id, { token_aceptacion: token, token_activo: true });
        }
        const QRCode = (await import('qrcode')).default;
        const aceptarUrl = (import.meta.env.VITE_APP_URL || window.location.origin) + '/#aceptar/' + token;
        const qrDataUrl = await QRCode.toDataURL(aceptarUrl, { width: 200, margin: 1 });
        const { pdf } = await import('@react-pdf/renderer');
        const { CotizacionPDF } = await import('./pages_pdf.jsx');
        const blob = await pdf(
          <CotizacionPDF cot={cot} cuenta={cuenta} contacto={contacto} cfg={empresaConfig} qrDataUrl={qrDataUrl} />
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
          cot={cot} opp={opp} cuenta={cuenta} contacto={contacto}
          empresaConfig={empresaConfig}
          onBack={() => navigate('cotizaciones')}
          onEdit={() => navigate('cotizaciones', { detail: cot.id, edit: true })}
          onCrearVersion={async () => { await subirVersionCotizacion(cot.id); }}
          onEnviar={() => actualizarCotizacion(cot.id, { estado: 'enviada', fecha_envio: new Date().toISOString() })}
          onAprobar={() => { aprobarCotizacion(cot.id); setOsModal(cot); }}
          onGenerarOS={() => setOsModal(cot)}
          onDescargarPDF={handleDescargarPDF}
          generandoPDF={generandoPDF}
        />
        {osModal && (
          <GenerarOSModal
            cot={osModal}
            onClose={() => setOsModal(null)}
            onConfirm={async (datos) => { await crearOSCliente(osModal.id, datos); setOsModal(null); }}
          />
        )}
      </>
    );
  }

  // ── Lista ──────────────────────────────────────────────────────────
  const query = searchQuery.toLowerCase();
  const latestPorNumero = Object.values(
    cotizaciones.reduce((acc, c) => {
      if (!acc[c.numero] || c.version > acc[c.numero].version) acc[c.numero] = c;
      return acc;
    }, {})
  ).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  const filtered = latestPorNumero.filter(c => {
    const opp = getOpp(c.oportunidad_id);
    const cliente = getCuentaNombre(c.cuenta_id || opp?.cuenta_id);
    return !query ||
      c.numero.toLowerCase().includes(query) ||
      cliente.toLowerCase().includes(query) ||
      (opp?.nombre || '').toLowerCase().includes(query);
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cotizaciones</h1>
          <div className="page-sub">{latestPorNumero.length} cotizaciones registradas</div>
        </div>
        <div className="row"><button className="btn btn-secondary">{I.filter} Filtrar</button></div>
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Número</th><th>Cliente</th><th>Oportunidad</th><th>Implementación</th><th>Recurrente/mes</th><th>Fecha</th><th>Estado</th></tr>
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
                <tr><td colSpan="7" style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>
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

// ── Detalle (lectura) ──────────────────────────────────────────────────
function DetalleCotizacion({ cot, opp, cuenta, contacto, empresaConfig, onBack, onEdit, onCrearVersion, onEnviar, onAprobar, onGenerarOS, onDescargarPDF, generandoPDF }) {
  const partidas = cot.items || cot.partidas || [];
  const hayRecurrente = partidas.some(p => !p.incluido && p.tipo === 'recurrente');
  const [seccionesOpen, setSeccionesOpen] = useState({});
  const toggleSeccion = k => setSeccionesOpen(p => ({ ...p, [k]: !p[k] }));
  const [confirmEnviar, setConfirmEnviar] = useState(false);
  const sym = currencySymbol(cot.moneda);

  const cfg = empresaConfig || {};

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
          {cot.estado === 'borrador' && <button className="btn btn-secondary" onClick={onEdit}>{I.edit} Editar</button>}
          {cot.estado === 'borrador' && <button className="btn btn-primary" onClick={() => setConfirmEnviar(true)}>{I.send} Enviar a cliente</button>}
          {cot.estado === 'enviada'  && <button className="btn btn-primary" onClick={onAprobar}>{I.check} Marcar aprobada</button>}
          {cot.estado === 'aprobada' && <button className="btn btn-primary" onClick={onGenerarOS}>{I.clipboard} Generar OS</button>}
          <button className="btn btn-secondary" onClick={onCrearVersion}>{I.plus} Nueva versión</button>
          <button className="btn btn-secondary" onClick={onDescargarPDF} disabled={generandoPDF}>{I.download} {generandoPDF ? 'Generando…' : 'PDF'}</button>
        </div>
      </div>

      {/* Bloque 1 — Encabezado */}
      <div className="card mt-6">
        <div className="card-body">
          <div className="grid-4" style={{marginBottom:20}}>
            <div><div className="eyebrow">Fecha emisión</div><div style={{fontWeight:600, marginTop:4}}>{cot.fecha}</div></div>
            <div><div className="eyebrow">Moneda</div><div style={{fontWeight:600, marginTop:4}}>{cot.moneda}</div></div>
            <div><div className="eyebrow">Validez</div><div style={{fontWeight:600, marginTop:4}}>{validezTexto()}</div></div>
            <div><div className="eyebrow">Attn.</div><div style={{fontWeight:600, marginTop:4}}>{contacto?.nombre || '—'}</div></div>
            {cot.fecha_envio && (
              <div><div className="eyebrow">Enviada al cliente</div><div style={{fontWeight:600, marginTop:4}}>{new Date(cot.fecha_envio).toLocaleString('es-PE')}</div></div>
            )}
          </div>
          {cot.descripcion_general && (
            <div style={{padding:'12px 16px', background:'var(--bg-subtle)', borderRadius:8, borderLeft:'3px solid var(--cyan)', fontSize:14, lineHeight:'1.6'}}>
              {cot.descripcion_general}
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
                      <div style={{fontWeight:600}}>{p.descripcion || 'Sin descripción'}</div>
                      {(Array.isArray(p.detalle_items) ? p.detalle_items : []).length > 0 && (
                        <ul style={{margin:'4px 0 0 16px', padding:0, fontSize:12, color:'var(--fg-muted)', lineHeight:'1.5'}}>
                          {p.detalle_items.map((d, j) => <li key={j}>{d}</li>)}
                        </ul>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${p.tipo==='recurrente'?'badge-purple':p.tipo==='bien'?'badge-orange':'badge-cyan'}`}>
                        {p.tipo || 'servicio'}
                      </span>
                    </td>
                    <td className="num">{p.cantidad}</td>
                    <td className="text-muted" style={{fontSize:12}}>{p.detalle_cantidad || '—'}</td>
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
              <TotalesBox subtotal={cot.subtotal_impl ?? cot.subtotal} igvPct={cot.igv_pct || 18} igv={cot.igv_impl ?? cot.igv} total={cot.total_impl ?? cot.total} sym={sym} />
            </div>
            {hayRecurrente && (
              <div>
                <div className="eyebrow" style={{marginBottom:12}}>Recurrente mensual</div>
                <TotalesBox subtotal={cot.subtotal_rec} igvPct={cot.igv_pct || 18} igv={cot.igv_rec} total={cot.total_rec} suffix="/mes" sym={sym} />
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
                      <td style={{fontWeight:600}}>{h.concepto}</td>
                      <td className="num">{h.porcentaje}%</td>
                      <td className="num" style={{fontWeight:600}}>{money(h.monto, sym)}</td>
                      <td className="text-muted" style={{fontSize:13}}>{h.condicion || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cot.glosa_factura && (
              <div style={{marginTop:16, padding:'10px 14px', background:'var(--bg-subtle)', borderRadius:8, fontSize:13}}>
                <div className="eyebrow" style={{marginBottom:4}}>Glosa recomendada para facturas</div>
                {cot.glosa_factura}
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
              const texto = cot[key] || cfg[key];
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

      {/* Bloque: Aceptación registrada */}
      {cot.aceptacion_fecha && (
        <div className="card mt-4" style={{borderLeft:'4px solid var(--green)'}}>
          <div className="card-body">
            <h3 style={{marginBottom:12, color:'var(--green)'}}>✓ Aceptación digital registrada</h3>
            <div className="grid-4" style={{fontSize:13}}>
              <div><div className="eyebrow">Aceptado por</div><div style={{fontWeight:600, marginTop:4}}>{cot.aceptacion_nombre || '—'}</div></div>
              <div><div className="eyebrow">DNI</div><div style={{fontWeight:600, marginTop:4}}>{cot.aceptacion_dni || '—'}</div></div>
              <div><div className="eyebrow">Fecha y hora</div><div style={{fontWeight:600, marginTop:4}}>{new Date(cot.aceptacion_fecha).toLocaleString('es-PE')}</div></div>
              <div><div className="eyebrow">IP registrada</div><div style={{fontWeight:600, marginTop:4, fontSize:11, fontFamily:'monospace'}}>{cot.aceptacion_ip || '—'}</div></div>
            </div>
          </div>
        </div>
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
function EditorCotizacion({ opp, cuenta, cotizacionBase, contactos, empresaConfig, onSave, onCancel }) {
  const cfg     = empresaConfig || {};
  const isEdit  = !!cotizacionBase;

  // ── Bloque 1 ────────────────────────────────────────────────────────
  const [moneda,      setMoneda]      = useState(cotizacionBase?.moneda      || opp?.moneda || 'PEN');
  const [igvPct,      setIgvPct]      = useState(cotizacionBase?.igv_pct     || 18);
  const [validezTipo, setValidezTipo] = useState(cotizacionBase?.validez_tipo  || 'dias');
  const [validezDias, setValidezDias] = useState(cotizacionBase?.validez_dias  || 30);
  const [validezFecha,setValidezFecha]= useState(cotizacionBase?.validez_fecha || '');
  const [contactoId,  setContactoId]  = useState(cotizacionBase?.contacto_id  || opp?.contacto_id || '');
  const [descripcion, setDescripcion] = useState(cotizacionBase?.descripcion_general || '');

  // ── Bloque 2: partidas ───────────────────────────────────────────────
  const emptyPartida = () => ({ id: Date.now() + Math.random(), descripcion: '', detalle_items_txt: '', tipo: 'servicio', detalle_cantidad: '', cantidad: 1, precio_unitario: 0, incluido: false });

  const [partidas, setPartidas] = useState(() => {
    if (cotizacionBase?.items?.length) {
      return cotizacionBase.items.map(p => ({
        ...p,
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
  const subtImpl  = pImpl.reduce((s, p) => s + Number(p.cantidad || 0) * Number(p.precio_unitario || 0), 0);
  const igvImpl   = Math.round(subtImpl * Number(igvPct) / 100);
  const totalImpl = subtImpl + igvImpl;
  const subtRec   = pRec.reduce((s, p) => s + Number(p.cantidad || 0) * Number(p.precio_unitario || 0), 0);
  const igvRec    = Math.round(subtRec * Number(igvPct) / 100);
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
  const handleSave = () => {
    if (hitosActivos && Math.abs(sumPct - 100) > 0.01) {
      alert(`Los porcentajes de hitos suman ${sumPct.toFixed(1)}%. Deben sumar exactamente 100%.`);
      return;
    }
    const items = partidas.map((p, i) => ({
      id: p.id, n: i + 1,
      descripcion: p.descripcion,
      detalle_items: (p.detalle_items_txt || '').split('\n').map(s => s.trim()).filter(Boolean),
      tipo: p.tipo,
      detalle_cantidad: p.detalle_cantidad || '',
      cantidad: Number(p.cantidad),
      precio_unitario: p.incluido ? 0 : Number(p.precio_unitario),
      total: p.incluido ? 0 : Number(p.cantidad) * Number(p.precio_unitario),
      incluido: p.incluido || false,
    }));
    onSave({
      oportunidad_id: cotizacionBase?.oportunidad_id || opp?.id,
      cuenta_id:      cotizacionBase?.cuenta_id      || opp?.cuenta_id,
      contacto_id:    contactoId || null,
      moneda, igv_pct: Number(igvPct),
      validez_tipo: validezTipo,
      validez_dias: Number(validezDias),
      validez_fecha: validezTipo === 'fecha_exacta' ? validezFecha : null,
      descripcion_general: descripcion,
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
        <div className="row">
          <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave}>{I.save} Guardar cotización</button>
        </div>
      </div>

      {/* ── Bloque 1: encabezado ──────────────────────────────────────── */}
      <div className="card mt-6">
        <div className="card-body">
          <div className="eyebrow" style={{marginBottom:16}}>Encabezado</div>
          <div className="grid-3" style={{gap:16, marginBottom:16}}>
            <div className="input-group">
              <label>Moneda</label>
              <select className="select" value={moneda} onChange={e => setMoneda(e.target.value)}>
                <option value="PEN">PEN — Soles</option>
                <option value="USD">USD — Dólares</option>
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
                {(contactos || []).map(c => <option key={c.id} value={c.id}>{c.nombre}{c.cargo ? ` (${c.cargo})` : ''}</option>)}
              </select>
            </div>
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
            <textarea className="input" rows="3" value={descripcion} onChange={e => setDescripcion(e.target.value)}
              placeholder="Describe el alcance general en un párrafo. Aparece antes de la tabla de partidas en el PDF." />
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
            <div key={p.id} style={{marginBottom:16, padding:16, background:'var(--bg-subtle)', borderRadius:8, border:'1px solid var(--border)'}}>
              <div className="row" style={{justifyContent:'space-between', marginBottom:12}}>
                <span style={{fontWeight:600, fontSize:13, color:'var(--fg-muted)'}}>Partida {idx + 1}</span>
                <div className="row" style={{gap:4}}>
                  {idx > 0 && <button type="button" className="icon-btn" onClick={() => movePartida(idx, -1)} title="Subir">↑</button>}
                  {idx < partidas.length - 1 && <button type="button" className="icon-btn" onClick={() => movePartida(idx, 1)} title="Bajar">↓</button>}
                  <button type="button" className="icon-btn text-danger" onClick={() => removePartida(p.id)}>{I.x}</button>
                </div>
              </div>
              <div className="grid-2" style={{gap:12, marginBottom:12}}>
                <div className="input-group" style={{margin:0}}>
                  <label style={{fontSize:12}}>Descripción</label>
                  <input className="input" value={p.descripcion} onChange={e => updatePartida(p.id, 'descripcion', e.target.value)} placeholder="Nombre del servicio o bien" />
                </div>
                <div className="input-group" style={{margin:0}}>
                  <label style={{fontSize:12}}>Tipo</label>
                  <select className="select" value={p.tipo} onChange={e => updatePartida(p.id, 'tipo', e.target.value)}>
                    <option value="servicio">Servicio</option>
                    <option value="bien">Bien</option>
                    <option value="recurrente">Recurrente (mensual)</option>
                  </select>
                </div>
              </div>
              <div className="input-group" style={{marginBottom:12}}>
                <label style={{fontSize:12}}>Detalle / sub-ítems (una línea = una viñeta en el PDF)</label>
                <textarea className="input" rows="2" value={p.detalle_items_txt}
                  onChange={e => updatePartida(p.id, 'detalle_items_txt', e.target.value)}
                  placeholder="Entregable 1&#10;Entregable 2" />
              </div>
              <div className="grid-4" style={{gap:12, alignItems:'flex-end'}}>
                <div className="input-group" style={{margin:0}}>
                  <label style={{fontSize:12}}>Detalle de cantidad</label>
                  <input className="input" value={p.detalle_cantidad} onChange={e => updatePartida(p.id, 'detalle_cantidad', e.target.value)} placeholder="1 proyecto, 2 meses…" />
                </div>
                <div className="input-group" style={{margin:0}}>
                  <label style={{fontSize:12}}>Cantidad</label>
                  <input type="number" className="input num" min="0" step="0.01" value={p.cantidad} onChange={e => updatePartida(p.id, 'cantidad', e.target.value)} />
                </div>
                <div className="input-group" style={{margin:0}}>
                  <label style={{fontSize:12}}>Precio unitario</label>
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
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:11, color:'var(--fg-muted)', marginBottom:4}}>Total partida</div>
                  <div style={{fontWeight:700, fontSize:16, fontFamily:'Sora'}}>
                    {p.incluido ? <span className="text-muted">—</span> : money(Number(p.cantidad || 0) * Number(p.precio_unitario || 0))}
                  </div>
                </div>
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
              <TotalesBox subtotal={subtImpl} igvPct={igvPct} igv={igvImpl} total={totalImpl} sym={currencySymbol(moneda)} />
            </div>
            {pRec.length > 0 && (
              <div>
                <div className="eyebrow" style={{marginBottom:12}}>Recurrente mensual</div>
                <TotalesBox subtotal={subtRec} igvPct={igvPct} igv={igvRec} total={totalRec} suffix="/mes" sym={currencySymbol(moneda)} />
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
                        <td><input className="input" value={h.concepto} onChange={e => updateHito(h.id, 'concepto', e.target.value)} placeholder="Ej: Anticipo" /></td>
                        <td><input type="number" className="input num" min="0" max="100" value={h.porcentaje} onChange={e => updateHito(h.id, 'porcentaje', e.target.value)} /></td>
                        <td className="num" style={{fontWeight:600}}>{money(Math.round(totalImpl * Number(h.porcentaje || 0) / 100))}</td>
                        <td><input className="input" value={h.condicion} onChange={e => updateHito(h.id, 'condicion', e.target.value)} placeholder="Al inicio del trabajo" /></td>
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
                <textarea className="input" rows="2" value={glosa} onChange={e => setGlosa(e.target.value)} placeholder="Texto que irá en las facturas…" />
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
              <textarea className="input" rows="3" value={conds[key]} onChange={e => setCond(key, e.target.value)} placeholder={label + '…'} />
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

function GenerarOSModal({ cot, onClose, onConfirm }) {
  const today = new Date().toISOString().split('T')[0];
  const nextMonth = new Date(); nextMonth.setMonth(nextMonth.getMonth() + 1);
  const defaultEnd = nextMonth.toISOString().split('T')[0];
  const [form, setForm] = useState({
    numero_doc_cliente: '',
    condicion_pago: cot.condicion_pago || '30 dias',
    fecha_inicio: today,
    fecha_fin: defaultEnd,
    sla: 'estandar',
  });
  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{maxWidth:520}}>
        <div className="modal-head">
          <h2>Generar OS Cliente</h2>
          <button className="icon-btn" onClick={onClose}>{I.x}</button>
        </div>
        <form className="modal-body col" style={{gap:16}} onSubmit={e => { e.preventDefault(); onConfirm(form); }}>
          <div style={{padding:'10px 14px', background:'var(--bg-subtle)', borderRadius:8, border:'1px solid var(--border)', fontSize:13}}>
            <div className="eyebrow">Cotización aprobada</div>
            <strong>{cot.numero}</strong> · {money(cot.total_impl || cot.total, currencySymbol(cot.moneda))}
          </div>
          <div className="input-group">
            <label>OC / pedido cliente</label>
            <input className="input" value={form.numero_doc_cliente} onChange={e => update('numero_doc_cliente', e.target.value)} placeholder="Ej. OC-2026-001" />
          </div>
          <div className="grid-2">
            <div className="input-group">
              <label>Fecha inicio</label>
              <input className="input" type="date" value={form.fecha_inicio} onChange={e => update('fecha_inicio', e.target.value)} required />
            </div>
            <div className="input-group">
              <label>Fecha fin</label>
              <input className="input" type="date" value={form.fecha_fin} onChange={e => update('fecha_fin', e.target.value)} required />
            </div>
          </div>
          <div className="grid-2">
            <div className="input-group">
              <label>Condición de pago</label>
              <input className="input" value={form.condicion_pago} onChange={e => update('condicion_pago', e.target.value)} />
            </div>
            <div className="input-group">
              <label>SLA</label>
              <select className="select" value={form.sla} onChange={e => update('sla', e.target.value)}>
                <option value="estandar">Estándar</option>
                <option value="estricto">Estricto</option>
                <option value="critico">Crítico</option>
              </select>
            </div>
          </div>
          <div className="modal-foot mt-4">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary">{I.check} Crear OS</button>
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

function Valorizacion({ role }) {
  const { valorizaciones, osClientes, generarValorizacion, ots, searchQuery } = useApp();
  const canCost = role.permisos.ver_costos || role.permisos.todo;
  const [editing, setEditing] = useState(false);

  // Editor states
  const [selOs, setSelOs] = useState('');
  const [partidas, setPartidas] = useState([{ id: 1, descripcion: 'Avance de obra', cantidad: 1, precio_unitario: 0 }]);
  const [periodo, setPeriodo] = useState('Mes actual');

  const addPartida = () => setPartidas(prev => [...prev, { id: Date.now(), descripcion: '', cantidad: 1, precio_unitario: 0 }]);
  const removePartida = (id) => setPartidas(prev => prev.filter(p => p.id !== id));
  const updatePartida = (id, field, value) => {
    setPartidas(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const subtotal = partidas.reduce((acc, p) => acc + (p.cantidad * p.precio_unitario), 0);
  const igv = subtotal * 0.18;
  const total = subtotal + igv;

  const otsValorizables = selOs ? ots.filter(ot => ot.os_cliente_id === selOs && ot.estado === 'cerrada') : [];

  const handleSave = () => {
    if (!selOs) {
      alert('Debe seleccionar una OS Cliente válida.');
      return;
    }
    generarValorizacion(selOs, subtotal, igv, total, periodo, {
      otIds: otsValorizables.map(ot => ot.id),
      items: partidas.map(p => ({
        ot_id: p.ot_id || null,
        descripcion: p.descripcion,
        cantidad: Number(p.cantidad || 0),
        precio_unitario: Number(p.precio_unitario || 0)
      }))
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <>
        <div className="page-header" style={{borderBottom:'none', paddingBottom:0}}>
          <div>
            <button className="btn btn-ghost" onClick={()=>setEditing(false)} style={{marginBottom:10, padding:0, color:'var(--cyan)'}}>← Volver a Valorizaciones</button>
            <h1 className="page-title">Generar Valorización</h1>
            <div className="page-sub">Cálculo de avance y pre-factura</div>
          </div>
          <div className="row">
            <button className="btn btn-secondary" onClick={()=>setEditing(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave}>{I.save} Aprobar Valorización</button>
          </div>
        </div>

        <div className="card mt-6">
          <div className="card-body">
            <div className="grid-2" style={{marginBottom:32}}>
              <div className="input-group">
                <label>OS Cliente Asociada</label>
                <select className="select" value={selOs} onChange={e => setSelOs(e.target.value)}>
                  <option value="">Seleccione OS Cliente...</option>
                  {osClientes.map(os => (
                    <option key={os.id} value={os.id}>{os.numero} - Saldo: {money(os.saldo_por_valorizar)}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label>Período de Ejecución</label>
                <input type="text" className="input" value={periodo} onChange={e=>setPeriodo(e.target.value)} placeholder="Ej. Enero 2025" />
              </div>
            </div>

            {selOs && (
              <div className="card" style={{padding:14, marginBottom:20, borderLeft:'3px solid var(--cyan)'}}>
                <strong>{otsValorizables.length}</strong> OT cerradas pendientes de valorizar para esta OS.
                {otsValorizables.length === 0 && <span className="text-muted"> Se usara el saldo pendiente de la OS como referencia manual.</span>}
              </div>
            )}

            <div className="row" style={{justifyContent:'space-between', alignItems:'center', marginBottom:16, paddingBottom:8, borderBottom:'1px solid var(--border)'}}>
              <h3>Partidas a Valorizar</h3>
              <button className="btn btn-secondary btn-sm" onClick={addPartida}>{I.plus} Agregar línea</button>
            </div>
            
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Descripción</th><th style={{width:100}}>Cant.</th><th style={{width:120}}>P. Unitario</th><th style={{width:120}}>Subtotal</th><th style={{width:40}}></th></tr></thead>
                <tbody>
                  {partidas.map(p => (
                    <tr key={p.id}>
                      <td><input type="text" className="input" placeholder="Descripción de avance" value={p.descripcion} onChange={e => updatePartida(p.id, 'descripcion', e.target.value)} /></td>
                      <td><input type="number" className="input num" min="1" value={p.cantidad} onChange={e => updatePartida(p.id, 'cantidad', e.target.value)} /></td>
                      <td><input type="number" className="input num" min="0" value={p.precio_unitario} onChange={e => updatePartida(p.id, 'precio_unitario', e.target.value)} /></td>
                      <td className="num" style={{fontWeight:600, paddingRight:16}}>{money(p.cantidad * p.precio_unitario)}</td>
                      <td><button className="icon-btn text-danger" onClick={() => removePartida(p.id)}>{I.x}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{marginTop:24, padding:16, background:'var(--bg-subtle)', borderRadius:8, width:300, marginLeft:'auto'}}>
              <div className="row" style={{justifyContent:'space-between', marginBottom:8}}><span className="text-muted">Subtotal</span><span className="num">{money(subtotal)}</span></div>
              <div className="row" style={{justifyContent:'space-between', marginBottom:8}}><span className="text-muted">IGV (18%)</span><span className="num">{money(igv)}</span></div>
              <div className="row" style={{justifyContent:'space-between', paddingTop:8, borderTop:'1px solid var(--border)', fontWeight:700, fontSize:16, fontFamily:'Sora'}}><span>Total a Valorizar</span><span className="num">{money(total)}</span></div>
            </div>
          </div>
        </div>
      </>
    );
  }

  const badge = e => e==='aprobada'?'badge-green':e==='facturada'?'badge-navy':e==='revision'?'badge-orange':'badge-gray';
  const getOSNumero = (id) => osClientes.find(o => o.id === id)?.numero || id;

  const query = searchQuery.toLowerCase();
  const filteredValorizaciones = valorizaciones.filter(v => 
    v.numero.toLowerCase().includes(query) ||
    getOSNumero(v.os_cliente_id).toLowerCase().includes(query) ||
    (v.periodo || '').toLowerCase().includes(query)
  );

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Valorizaciones</h1><div className="page-sub">{valorizaciones.length} valorizaciones registradas</div></div>
        <button className="btn btn-primary" onClick={()=>setEditing(true)}>{I.plus} Generar Valorización</button>
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Valorización</th><th>OS Cliente</th><th>Período</th><th>Subtotal</th><th>IGV</th><th>Total</th><th>Estado</th></tr></thead>
            <tbody>{filteredValorizaciones.map(r=>(
              <tr key={r.id} className="hover-row">
                <td className="mono" style={{fontWeight:600}}>{r.numero}</td>
                <td className="mono text-muted">{getOSNumero(r.os_cliente_id)}</td>
                <td className="text-muted">{r.periodo}</td>
                <td className="num">{money(r.subtotal)}</td>
                <td className="num">{money(r.igv)}</td>
                <td className="num" style={{fontWeight:600}}>{money(r.total)}</td>
                <td><span className={'badge '+badge(r.estado)}>{r.estado.toUpperCase()}</span></td>
              </tr>
            ))}
            {filteredValorizaciones.length === 0 && <tr><td colSpan="7" style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>{query ? 'No se encontraron resultados' : 'No hay valorizaciones'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Inventario() {
  const { inventario, searchQuery } = useApp();
  const [selSku, setSelSku] = useState(null);

  const query = searchQuery.toLowerCase();
  const filteredInv = inventario.filter(i => 
    i.sku.toLowerCase().includes(query) ||
    i.nombre.toLowerCase().includes(query) ||
    i.categoria.toLowerCase().includes(query) ||
    i.almacen.toLowerCase().includes(query)
  );

  const totalValor = filteredInv.reduce((acc, curr) => acc + (curr.stock_actual * curr.costo_promedio), 0);
  const stockCritico = filteredInv.filter(i => i.stock_actual === 0).length;
  const stockBajo = filteredInv.filter(i => i.stock_actual > 0 && i.stock_actual <= 5).length;

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Almacenes e Inventario</h1><div className="page-sub">Almacén principal · {inventario.length} SKUs registrados</div></div>
        <div className="row"><button className="btn btn-primary">{I.plus} Registrar Entrada</button></div>
      </div>
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi-card"><div className="kpi-label">Valor inventario</div><div className="kpi-value">{money(totalValor)}</div><div className="kpi-icon cyan">{I.package}</div></div>
        <div className="kpi-card"><div className="kpi-label">SKUs activos</div><div className="kpi-value">{filteredInv.length}</div><div className="kpi-icon purple">{I.warehouse}</div></div>
        <div className="kpi-card"><div className="kpi-label">Stock bajo ({"<="}5)</div><div className="kpi-value" style={{color:'var(--orange)'}}>{stockBajo}</div><div className="kpi-icon orange">{I.alert}</div></div>
        <div className="kpi-card"><div className="kpi-label">Stock crítico (0)</div><div className="kpi-value" style={{color:'var(--danger)'}}>{stockCritico}</div><div className="kpi-icon danger">{I.alert}</div></div>
      </div>
      
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>SKU</th><th>Descripción</th><th>Categoría</th><th>Almacén</th><th>Unidad</th><th>Stock</th><th>Costo Prom.</th><th>Valor Total</th></tr></thead>
            <tbody>{filteredInv.map(r=>(
              <tr key={r.id} onClick={() => setSelSku(r)} className="hover-row" style={{cursor:'pointer'}}>
                <td className="mono" style={{fontWeight:600}}>{r.sku}</td>
                <td><strong>{r.nombre}</strong></td>
                <td>{r.categoria}</td>
                <td>{r.almacen}</td>
                <td className="text-muted">{r.unidad}</td>
                <td className="num" style={{fontWeight:600,color:r.stock_actual===0?'var(--danger)':r.stock_actual<=5?'var(--orange)':'var(--fg)'}}>{r.stock_actual}</td>
                <td className="num">{money(r.costo_promedio)}</td>
                <td className="num">{money(r.stock_actual * r.costo_promedio)}</td>
              </tr>
            ))}
            {filteredInv.length === 0 && <tr><td colSpan="8" style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>No se encontraron materiales</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selSku && (
        <>
          <div className="side-panel-backdrop" onClick={() => setSelSku(null)}/>
          <div className="side-panel" style={{width: 600}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">KARDEX y Detalles de SKU</div>
                <div className="font-display mono" style={{fontSize:20, fontWeight:700, marginTop:2}}>{selSku.sku}</div>
              </div>
              <button className="icon-btn" onClick={() => setSelSku(null)}>{I.x}</button>
            </div>
            <div className="side-panel-body">
              <div className="grid-2" style={{gap:16, marginBottom:24}}>
                <div><div className="eyebrow">Descripción</div><div style={{fontWeight:600, fontSize:16}}>{selSku.nombre}</div></div>
                <div><div className="eyebrow">Categoría</div><div>{selSku.categoria}</div></div>
                <div>
                  <div className="eyebrow">Stock Actual</div>
                  <div style={{fontSize:24, fontWeight:700, color:selSku.stock_actual===0?'var(--danger)':selSku.stock_actual<=5?'var(--orange)':'var(--cyan)'}}>
                    {selSku.stock_actual} {selSku.unidad}
                  </div>
                  <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:4}}>Min: 5 | Max: 100</div>
                </div>
                <div><div className="eyebrow">Costo Promedio</div><div style={{fontSize:24, fontWeight:700}}>{money(selSku.costo_promedio)}</div></div>
              </div>

              <div className="row" style={{marginBottom:24, gap:10}}>
                <button className="btn btn-secondary flex-1">{I.plus} Transferencia Interna</button>
                <button className="btn btn-secondary flex-1">Ajuste de Inventario</button>
                {selSku.stock_actual <= 5 && <button className="btn btn-primary flex-1">Generar SOLPE Automática</button>}
              </div>

              <h3 style={{marginBottom:16}}>Movimientos Recientes (KARDEX)</h3>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Fecha</th><th>Operación</th><th>OT/Doc</th><th>Cant.</th><th>Saldo</th></tr></thead>
                  <tbody>
                    <tr>
                      <td className="text-muted">Hoy</td>
                      <td><span className="badge badge-orange">SALIDA</span> (Consumo)</td>
                      <td className="mono text-muted">OT-25-0012</td>
                      <td className="num" style={{color:'var(--danger)'}}>-2</td>
                      <td className="num">{selSku.stock_actual}</td>
                    </tr>
                    <tr>
                      <td className="text-muted">Hace 5 días</td>
                      <td><span className="badge badge-green">ENTRADA</span> (Compra)</td>
                      <td className="mono text-muted">OC-25-0104</td>
                      <td className="num" style={{color:'var(--green)'}}>+20</td>
                      <td className="num">{selSku.stock_actual + 2}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ============ HOJA DE COSTEO ============
function HojaCosteo() {
  const { hojasCosteo, oportunidades, cuentas, activeParams, navigate, crearHojaCosteo, actualizarHojaCosteo, aprobarHojaCosteo, searchQuery } = useApp();

  const getOpp = id => oportunidades.find(o => o.id === id);
  const getCuentaNombre = id => { const c = cuentas.find(x => x.id === id); return c?.razon_social || c?.nombre_comercial || id || 'N/A'; };
  const estadoHC = e => e || 'borrador';
  const labelEstadoHC = e => String(estadoHC(e)).replace('_', ' ');
  const badgeHC = e => estadoHC(e) === 'aprobada' ? 'badge-green' : estadoHC(e) === 'en_revision' ? 'badge-orange' : 'badge-gray';

  const query = searchQuery.toLowerCase();
  const filteredHC = hojasCosteo.filter(hc => {
    const opp = getOpp(hc.oportunidad_id);
    const cliente = getCuentaNombre(hc.cuenta_id);
    return !query ||
      hc.numero.toLowerCase().includes(query) ||
      cliente.toLowerCase().includes(query) ||
      (opp?.nombre || '').toLowerCase().includes(query);
  });

  if (activeParams?.detail) {
    const hc = hojasCosteo.find(h => h.id === activeParams.detail);
    if (!hc) return <div className="p-4">Hoja de Costeo no encontrada</div>;
    return <DetalleHC hc={hc} getOpp={getOpp} getCuentaNombre={getCuentaNombre} badgeHC={badgeHC} actualizarHojaCosteo={actualizarHojaCosteo} aprobarHojaCosteo={aprobarHojaCosteo} navigate={navigate} />;
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
          <div className="page-sub">{hojasCosteo.length} documentos · documento interno previo a cotización</div>
        </div>
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Número</th><th>Oportunidad</th><th>Cliente</th><th>Costo Total</th><th>Precio Sugerido</th><th>Margen obj.</th><th>Responsable</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {filteredHC.map(hc => {
                const opp = getOpp(hc.oportunidad_id);
                return (
                  <tr key={hc.id} className="hover-row" style={{cursor:'pointer'}} onClick={() => navigate('hoja_costeo', { detail: hc.id })}>
                    <td className="mono" style={{fontWeight:600}}>{hc.numero}</td>
                    <td>{opp?.nombre || '—'}</td>
                    <td><strong>{getCuentaNombre(hc.cuenta_id)}</strong></td>
                    <td className="num">{money(hc.costo_total)}</td>
                    <td className="num" style={{fontWeight:600}}>{money(hc.precio_sugerido_total)}</td>
                    <td className="num">{hc.margen_objetivo_pct}%</td>
                    <td className="text-muted">{hc.responsable_costeo || '—'}</td>
                    <td><span className={'badge ' + badgeHC(hc.estado)}>{labelEstadoHC(hc.estado)}</span></td>
                  </tr>
                );
              })}
              {filteredHC.length === 0 && <tr><td colSpan="8" style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>{query ? 'Sin resultados para la búsqueda' : 'No hay hojas de costeo. Créalas desde el Pipeline.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function SeccionCosto({ titulo, badge, items, onChange, readOnly, sugerido, catalogoOpciones }) {
  const safeItems = Array.isArray(items) ? items : [];
  const calcSubtotal = list => list.reduce((s, i) => s + (Number(i.cantidad || 0) * Number(i.costo_unitario || 0)), 0);

  const addItem = () => onChange([...safeItems, { id: Date.now(), descripcion: sugerido || '', cantidad: 1, unidad: 'und', costo_unitario: 0 }]);
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
          <span className={'badge ' + badge}>{money(calcSubtotal(safeItems))}</span>
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
            <thead><tr><th>Descripción</th><th style={{width:100}}>Cant.</th><th style={{width:100}}>Unidad</th><th style={{width:130}}>Costo unit.</th><th style={{width:120}}>Subtotal</th>{!readOnly && <th style={{width:36}}></th>}</tr></thead>
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
                  <td data-label="Costo unit.">{readOnly ? <span className="num">{money(item.costo_unitario)}</span> : <input type="number" className="input num" min="0" step="0.01" value={item.costo_unitario} onChange={e => updateItem(item.id, 'costo_unitario', e.target.value)} />}</td>
                  <td data-label="Subtotal" className="num" style={{fontWeight:600}}>{money(Number(item.cantidad || 0) * Number(item.costo_unitario || 0))}</td>
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

function ResumenCostos({ hc }) {
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
            <span className="num" style={{fontSize:13}}>{money(val || 0)}</span>
          </div>
        ))}
      </div>
      <div style={{borderTop:'2px solid var(--border)', paddingTop:12, marginBottom:8}}>
        <div className="row" style={{justifyContent:'space-between', marginBottom:6}}>
          <span style={{fontWeight:600}}>Costo total estimado</span>
          <span className="num" style={{fontWeight:700}}>{money(costo)}</span>
        </div>
        <div className="row" style={{justifyContent:'space-between', marginBottom:6}}>
          <span className="text-muted" style={{fontSize:13}}>Margen objetivo: {margen}% → precio sin IGV</span>
          <span className="num" style={{fontSize:13}}>{money(sinIgv)}</span>
        </div>
        <div className="row" style={{justifyContent:'space-between', paddingTop:8, borderTop:'1px solid var(--border)'}}>
          <span style={{fontWeight:700, fontFamily:'Sora', fontSize:16}}>Precio sugerido al cliente (c/ IGV)</span>
          <span className="num" style={{fontWeight:700, fontFamily:'Sora', fontSize:18, color:'var(--cyan)'}}>{money(conIgv)}</span>
        </div>
      </div>
      <div style={{marginTop:8, padding:'6px 10px', background: margenReal >= margen ? 'rgba(76,175,80,0.1)' : 'rgba(255,152,0,0.1)', borderRadius:6, textAlign:'center', fontSize:13}}>
        Margen real calculado: <strong>{margenReal}%</strong> {margenReal >= margen ? '✓' : '↓ bajo objetivo'}
      </div>
    </div>
  );
}

function DetalleHC({ hc, getOpp, getCuentaNombre, badgeHC, actualizarHojaCosteo, aprobarHojaCosteo, navigate }) {
  const opp = getOpp(hc.oportunidad_id);
  const estado = hc.estado || 'borrador';
  const estadoLabel = String(estado).replace('_',' ');
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({
    mano_obra: Array.isArray(hc.mano_obra) ? hc.mano_obra : [],
    materiales: Array.isArray(hc.materiales) ? hc.materiales : [],
    servicios_terceros: Array.isArray(hc.servicios_terceros) ? hc.servicios_terceros : [],
    logistica: Array.isArray(hc.logistica) ? hc.logistica : [],
    margen_objetivo_pct: hc.margen_objetivo_pct,
    responsable_costeo: hc.responsable_costeo || '',
    notas: hc.notas || ''
  });

  const puedeEditar = estado !== 'aprobada';
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

  return (
    <>
      <div className="page-header" style={{borderBottom:'none', paddingBottom:0}}>
        <div>
          <button className="btn btn-ghost" onClick={() => navigate('hoja_costeo')} style={{marginBottom:10, padding:0, color:'var(--cyan)'}}>← Volver a lista</button>
          <h1 className="page-title row" style={{gap:10}}>{hc.numero} <span className={'badge ' + badgeHC(estado)} style={{fontSize:12, textTransform:'uppercase'}}>{estadoLabel}</span></h1>
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
          {estado === 'en_revision' && puedeEditar && (
            <button className="btn btn-secondary" onClick={handleVolverBorrador}>{I.edit} Volver a borrador</button>
          )}
          {estado === 'en_revision' && (
            <button className="btn btn-primary" style={{background:'var(--green)'}} onClick={handleAprobar}>{I.check} Aprobar Costeo</button>
          )}
          {estado === 'aprobada' && (
            <button className="btn btn-primary" onClick={() => navigate('cotizaciones', { active_tab: 'nueva', opp: hc.oportunidad_id })}>{I.plus} Generar Cotización</button>
          )}
          <button className="btn btn-secondary">{I.download} PDF</button>
        </div>
      </div>

      <div className="cost-editor-shell">
        <div className="cost-editor-grid">
          <div className="cost-lines">
            <SeccionCosto titulo="Mano de Obra" badge="badge-cyan" items={form.mano_obra} readOnly={readOnly} onChange={val => setForm(p=>({...p, mano_obra: val}))} />
            <SeccionCosto titulo="Materiales e Insumos" badge="badge-purple" items={form.materiales} readOnly={readOnly} onChange={val => setForm(p=>({...p, materiales: val}))} />
            <SeccionCosto titulo="Servicios Terceros / Alquileres" badge="badge-orange" items={form.servicios_terceros} readOnly={readOnly} onChange={val => setForm(p=>({...p, servicios_terceros: val}))} catalogoOpciones={MOCK.servicios.filter(s => s.estado === 'activo')} />
            <SeccionCosto titulo="Logística y Viáticos" badge="badge-gray" items={form.logistica} readOnly={readOnly} onChange={val => setForm(p=>({...p, logistica: val}))} />
          </div>
          <aside className="cost-sidebar">
            <ResumenCostos hc={{ ...hc, ...form, costo_total: (calcSub(form.mano_obra)+calcSub(form.materiales)+calcSub(form.servicios_terceros)+calcSub(form.logistica)), precio_sugerido_sin_igv: calcPrecio(form), precio_sugerido_total: calcPrecio(form)*1.18 }} />
            
            <div className="card mt-6" style={{padding:20}}>
              <div className="eyebrow" style={{marginBottom:16}}>Configuración y Notas</div>
              <div className="input-group">
                <label>Margen objetivo (%)</label>
                {readOnly ? <div>{form.margen_objetivo_pct}%</div> : <input type="number" className="input" value={form.margen_objetivo_pct} onChange={e => setForm(p=>({...p, margen_objetivo_pct: Number(e.target.value)}))} />}
              </div>
              <div className="input-group">
                <label>Responsable</label>
                {readOnly ? <div>{form.responsable_costeo}</div> : <input className="input" value={form.responsable_costeo} onChange={e => setForm(p=>({...p, responsable_costeo: e.target.value}))} />}
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
  const [form, setForm] = useState({
    oportunidad_id: opp.id,
    cuenta_id: opp.cuenta_id,
    numero: `HC-${Date.now().toString().slice(-6)}`,
    mano_obra: [{ id: 1, descripcion: 'Técnico Especialista', cantidad: 1, unidad: 'hh', costo_unitario: 80 }],
    materiales: [],
    servicios_terceros: [],
    logistica: [],
    margen_objetivo_pct: 35,
    responsable_costeo: 'Admin',
    notas: ''
  });

  const totalCosto = calcSub(form.mano_obra) + calcSub(form.materiales) + calcSub(form.servicios_terceros) + calcSub(form.logistica);
  const precioSinIgv = calcPrecio(form);

  return (
    <>
      <div className="page-header" style={{borderBottom:'none', paddingBottom:0}}>
        <div>
          <button className="btn btn-ghost" onClick={onCancel} style={{marginBottom:10, padding:0, color:'var(--cyan)'}}>← Volver</button>
          <h1 className="page-title">Nueva Hoja de Costeo</h1>
          <div className="page-sub">Oportunidad: {opp.nombre} · Cliente: <strong>{getCuentaNombre(opp.cuenta_id)}</strong></div>
        </div>
        <div className="row">
          <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave({ ...form, costo_total: totalCosto, precio_sugerido_sin_igv: precioSinIgv, precio_sugerido_total: precioSinIgv * 1.18 })}>{I.save} Guardar y Continuar</button>
        </div>
      </div>
      <div className="cost-editor-shell">
        <div className="cost-editor-grid">
          <div className="cost-lines">
            <SeccionCosto titulo="Mano de Obra" badge="badge-cyan" items={form.mano_obra} onChange={val => setForm(p=>({...p, mano_obra: val}))} />
            <SeccionCosto titulo="Materiales e Insumos" badge="badge-purple" items={form.materiales} onChange={val => setForm(p=>({...p, materiales: val}))} />
            <SeccionCosto titulo="Servicios Terceros / Alquileres" badge="badge-orange" items={form.servicios_terceros} onChange={val => setForm(p=>({...p, servicios_terceros: val}))} catalogoOpciones={MOCK.servicios.filter(s => s.estado === 'activo')} />
            <SeccionCosto titulo="Logistica y Viaticos" badge="badge-gray" items={form.logistica} onChange={val => setForm(p=>({...p, logistica: val}))} />
          </div>
          <aside className="cost-sidebar">
             <ResumenCostos hc={{ ...form, costo_total: totalCosto, precio_sugerido_sin_igv: precioSinIgv, precio_sugerido_total: precioSinIgv * 1.18 }} />
             <div className="card mt-6" style={{padding:20}}>
              <div className="eyebrow" style={{marginBottom:16}}>Configuracion y notas</div>
              <div className="input-group">
                <label>Margen objetivo (%)</label>
                <input type="number" className="input" value={form.margen_objetivo_pct} onChange={e => setForm(p=>({...p, margen_objetivo_pct: Number(e.target.value)}))} />
              </div>
              <div className="input-group">
                <label>Responsable del costeo</label>
                <input className="input" value={form.responsable_costeo} onChange={e => setForm(p=>({...p, responsable_costeo: e.target.value}))} />
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
