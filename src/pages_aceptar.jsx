import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { renderTextoComercial } from './lib/textoComercial.js';

const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

const fmtMoney = (n, m = 'PEN') => {
  const s = m === 'USD' ? 'US$' : m === 'EUR' ? '€' : 'S/';
  return s + ' ' + (n != null ? Number(n).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '0');
};

const fmtDt = (iso) => iso ? new Date(iso).toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short' }) : '—';

export function PaginaAceptacion({ token }) {
  const [phase, setPhase]     = useState('loading');
  const [cot, setCot]         = useState(null);
  const [cfg, setCfg]         = useState(null);
  const [cuenta, setCuenta]   = useState(null);
  const [nombre, setNombre]   = useState('');
  const [dni, setDni]         = useState('');
  const [error, setError]     = useState(null);

  useEffect(() => {
    sb.rpc('get_cotizacion_publica', { p_token: token })
      .then(({ data, error: e }) => {
        if (e || !data) { setPhase('invalid'); return; }
        if (data.status === 'token_invalido') { setPhase('invalid'); return; }
        if (data.status === 'ya_aceptada') { setCot(data); setPhase('already'); return; }
        setCot(data.cot);
        setCfg(data.cfg);
        setCuenta(data.cuenta);
        setPhase('ready');
      })
      .catch(() => setPhase('invalid'));
  }, [token]);

  const handleAceptar = async (e) => {
    e.preventDefault();
    setError(null);
    if (!nombre.trim() || !dni.trim()) { setError('Completa todos los campos para continuar.'); return; }
    setPhase('submitting');
    let ip = 'desconocida';
    try { const r = await fetch('https://api.ipify.org?format=json'); ip = (await r.json()).ip; } catch (_) {}

    // 1. Registrar aceptación en BD
    const { data: rpc, error: rpcErr } = await sb.rpc('registrar_aceptacion_cotizacion', {
      p_token: token, p_nombre: nombre.trim(), p_dni: dni.trim(), p_ip: ip,
    });
    if (rpcErr || !rpc?.ok) {
      setError(rpc?.error === 'ya_aceptada' ? 'Esta cotización ya fue aceptada.' : 'Error al registrar la aceptación. Intenta de nuevo.');
      setPhase('ready');
      return;
    }

    // 2. Notificación por email (fire & forget)
    fetch(import.meta.env.VITE_SUPABASE_URL + '/functions/v1/aceptar-cotizacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      body: JSON.stringify({ token, nombre: nombre.trim(), dni: dni.trim(), ip }),
    }).catch(() => {});

    setPhase('done');
  };

  const primary   = cfg?.color_primario   || '#1A2B4A';
  const secondary = cfg?.color_secundario || '#607D8B';

  // ── Pantallas de estado ─────────────────────────────────────────────
  if (phase === 'loading') return (
    <div style={styles.shell}>
      <div style={styles.card}>
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#888' }}>Cargando cotización…</div>
      </div>
    </div>
  );

  if (phase === 'invalid') return (
    <div style={styles.shell}>
      <div style={styles.card}>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Enlace inválido o expirado</div>
          <div style={{ color: '#888', fontSize: 14 }}>El enlace de esta cotización no está disponible.<br />Contacta a tu ejecutivo para obtener uno nuevo.</div>
        </div>
      </div>
    </div>
  );

  if (phase === 'already') return (
    <div style={styles.shell}>
      <div style={styles.card}>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Cotización ya aceptada</div>
          <div style={{ color: '#888', fontSize: 14 }}>
            Esta cotización fue aceptada el {fmtDt(cot?.aceptacion_fecha)}
            {cot?.aceptacion_nombre ? ` por ${cot.aceptacion_nombre}` : ''}.<br />Gracias.
          </div>
        </div>
      </div>
    </div>
  );

  if (phase === 'done') return (
    <div style={styles.shell}>
      <div style={{ ...styles.card, borderTop: `4px solid ${primary}` }}>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: primary, marginBottom: 8 }}>¡Aceptación registrada!</div>
          <div style={{ color: '#555', fontSize: 14, lineHeight: 1.6 }}>
            Tu aceptación de <strong>{cot?.numero}</strong> ha sido registrada con éxito.<br />
            Recibirás confirmación de tu ejecutivo de ventas.
          </div>
        </div>
      </div>
    </div>
  );

  // ── Vista principal ─────────────────────────────────────────────────
  const items = cot?.items || cot?.partidas || [];
  const pRec = items.filter(p => p.tipo === 'recurrente' && !p.incluido);
  const hayRec = pRec.length > 0;
  const validezTexto = cot?.validez_tipo === 'fecha_exacta' && cot?.validez_fecha
    ? `Válida únicamente el ${cot.validez_fecha}`
    : cot?.validez_dias ? `${cot.validez_dias} días` : '—';
  const hayHitos = cot?.hitos_activos && cot?.hitos_pago?.length > 0;
  const textoCtx = { empresa: cfg, cuenta, cliente: cuenta, cotizacion: cot };
  const renderComercial = texto => renderTextoComercial(texto, textoCtx);
  const CONDS = [
    ['cond_forma_pago', 'Forma de pago'],
    ['cond_validez', 'Validez de la oferta'],
    ['cond_penalidad', 'Penalidad por mora'],
    ['cond_inicio_proyecto', 'Inicio del proyecto'],
    ['cond_alcance', 'Alcance y exclusiones'],
    ['cond_integraciones', 'Integraciones externas'],
    ['cond_confidencialidad', 'Confidencialidad'],
  ].filter(([k]) => cot?.[k] || cfg?.[k]);

  return (
    <div style={styles.shell}>
      {/* Barra superior */}
      <div style={{ background: primary, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        {cfg?.logo_url
          ? <img src={cfg.logo_url} alt="Logo" style={{ height: 32, objectFit: 'contain' }} />
          : <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>{cfg?.razon_social || 'EMPRESA'}</span>
        }
        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Cotización para revisión y aceptación</span>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 16px 40px' }}>

        {/* Encabezado cotización */}
        <div style={{ ...styles.card, borderTop: `3px solid ${primary}`, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: secondary, letterSpacing: 1, marginBottom: 4 }}>COTIZACIÓN DE SERVICIOS</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: primary }}>{cot?.numero} <span style={{ fontSize: 14, color: '#888' }}>v{cot?.version || 1}</span></div>
              <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                {cuenta?.razon_social || cuenta?.nombre_comercial || '—'}
                {cuenta?.ruc ? ` · RUC ${cuenta.ruc}` : ''}
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#555', textAlign: 'right' }}>
              <div>Fecha: <strong>{cot?.fecha}</strong></div>
              <div>Validez: <strong>{validezTexto}</strong></div>
              <div>Moneda: <strong>{cot?.moneda}</strong></div>
            </div>
          </div>
          {cot?.descripcion_general && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: '#f5f8ff', borderLeft: `3px solid ${primary}`, borderRadius: 4, fontSize: 13, lineHeight: 1.6, color: '#333' }}>
              {renderComercial(cot.descripcion_general)}
            </div>
          )}
        </div>

        {/* Partidas */}
        <div style={styles.card}>
          <div style={{ fontSize: 11, fontWeight: 700, color: primary, letterSpacing: 0.8, marginBottom: 12 }}>PARTIDAS</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: primary, color: '#fff' }}>
                <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11, width: 32 }}>N°</th>
                <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11 }}>Descripción</th>
                <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, fontSize: 11, width: 90 }}>Precio</th>
                <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, fontSize: 11, width: 90 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p, i) => {
                const isRec = p.tipo === 'recurrente' && !p.incluido;
                const subItems = p.sub_items || p.detalle_items || [];
                const mainDesc = p.nombre || (typeof p.descripcion === 'string' ? p.descripcion.split('\n')[0] : p.descripcion) || '—';
                return (
                  <React.Fragment key={p.id || i}>
                    {isRec && i > 0 && items[i - 1].tipo !== 'recurrente' && (
                      <tr><td colSpan={4} style={{ padding: '6px 10px', background: '#f0f4f8', fontSize: 11, fontWeight: 700, color: secondary }}>Servicios recurrentes</td></tr>
                    )}
                    <tr style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc', borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px 10px', color: '#999' }}>{p.n || i + 1}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ fontWeight: 600 }}>{renderComercial(mainDesc)}</div>
                        {subItems.map((s, si) => (
                          <div key={si} style={{ fontSize: 11.5, color: '#666', marginTop: 2 }}>• {renderComercial(typeof s === 'string' ? s : s.nombre || s)}</div>
                        ))}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: '#555' }}>
                        {p.incluido ? 'Incluido' : fmtMoney(p.precio_unitario || 0, cot?.moneda)}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>
                        {p.incluido ? '—' : fmtMoney(p.total || (Number(p.cantidad || 1) * Number(p.precio_unitario || 0)), cot?.moneda)}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          {/* Totales */}
          <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220, background: '#f5f8fc', borderRadius: 6, padding: 14 }}>
              {hayRec && <div style={{ fontSize: 10, fontWeight: 700, color: secondary, letterSpacing: 0.5, marginBottom: 8 }}>IMPLEMENTACIÓN</div>}
              <div style={styles.totRow}><span style={{ color: '#666' }}>Subtotal s/ IGV</span><span>{fmtMoney(cot?.subtotal_impl ?? cot?.subtotal, cot?.moneda)}</span></div>
              <div style={styles.totRow}><span style={{ color: '#666' }}>IGV ({cot?.igv_pct || 18}%)</span><span>{fmtMoney(cot?.igv_impl ?? cot?.igv, cot?.moneda)}</span></div>
              <div style={{ ...styles.totRow, borderTop: '1px solid #cdd5de', paddingTop: 8, marginTop: 4, fontWeight: 700, fontSize: 15, color: primary }}>
                <span>Total</span><span>{fmtMoney(cot?.total_impl ?? cot?.total, cot?.moneda)}</span>
              </div>
            </div>
            {hayRec && (
              <div style={{ flex: 1, minWidth: 220, background: '#f5f8fc', borderRadius: 6, padding: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: secondary, letterSpacing: 0.5, marginBottom: 8 }}>RECURRENTE MENSUAL</div>
                <div style={styles.totRow}><span style={{ color: '#666' }}>Subtotal s/ IGV</span><span>{fmtMoney(cot?.subtotal_rec, cot?.moneda)}/mes</span></div>
                <div style={styles.totRow}><span style={{ color: '#666' }}>IGV ({cot?.igv_pct || 18}%)</span><span>{fmtMoney(cot?.igv_rec, cot?.moneda)}/mes</span></div>
                <div style={{ ...styles.totRow, borderTop: '1px solid #cdd5de', paddingTop: 8, marginTop: 4, fontWeight: 700, fontSize: 15, color: primary }}>
                  <span>Total mensual</span><span>{fmtMoney(cot?.total_rec, cot?.moneda)}/mes</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Plan de pagos */}
        {hayHitos && (
          <div style={{ ...styles.card, marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: primary, letterSpacing: 0.8, marginBottom: 12 }}>PLAN DE PAGOS</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: primary, color: '#fff' }}>
                  <th style={styles.th}>N°</th>
                  <th style={{ ...styles.th, textAlign: 'left' }}>Concepto</th>
                  <th style={styles.th}>%</th>
                  <th style={styles.th}>Monto</th>
                  <th style={{ ...styles.th, textAlign: 'left' }}>Condición</th>
                </tr>
              </thead>
              <tbody>
                {cot.hitos_pago.map((h, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc', borderBottom: '1px solid #f0f0f0' }}>
                    <td style={styles.td}>{i + 1}</td>
                    <td style={{ ...styles.td, fontWeight: 600, textAlign: 'left' }}>{renderComercial(h.concepto)}</td>
                    <td style={styles.td}>{h.porcentaje}%</td>
                    <td style={{ ...styles.td, fontWeight: 700 }}>{fmtMoney(h.monto, cot.moneda)}</td>
                    <td style={{ ...styles.td, color: '#666', textAlign: 'left' }}>{renderComercial(h.condicion) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(cot.glosa_factura || cfg?.cond_glosa_factura) && (
              <div style={{ marginTop: 10, padding: '8px 12px', background: '#f0f5ff', borderLeft: `3px solid ${primary}`, borderRadius: 4, fontSize: 13, fontStyle: 'italic', color: '#334' }}>
                <span style={{ fontWeight: 700, fontStyle: 'normal', fontSize: 11, color: secondary }}>Glosa recomendada: </span>
                {renderComercial(cot.glosa_factura || cfg?.cond_glosa_factura)}
              </div>
            )}
          </div>
        )}

        {/* Condiciones comerciales */}
        {CONDS.length > 0 && (
          <div style={{ ...styles.card, marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: primary, marginBottom: 14 }}>CONDICIONES COMERCIALES</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px 24px' }}>
              {CONDS.map(([k, label]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: secondary, letterSpacing: 0.5, marginBottom: 3 }}>{label.toUpperCase()}</div>
                  <div style={{ fontSize: 13, color: '#444', lineHeight: 1.55 }}>{renderComercial(cot?.[k] || cfg?.[k])}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Formulario de aceptación */}
        <div style={{ ...styles.card, marginTop: 20, borderTop: `3px solid ${primary}` }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: primary, marginBottom: 4 }}>Aceptar cotización</div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 20, lineHeight: 1.5 }}>
            Al hacer clic confirmas que has leído y aceptas los términos y condiciones de esta cotización.
          </div>
          <form onSubmit={handleAceptar}>
            <div style={{ marginBottom: 14 }}>
              <label style={styles.label}>Nombre completo *</label>
              <input
                style={styles.input}
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Ej: Juan Pérez García"
                autoComplete="name"
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={styles.label}>DNI *</label>
              <input
                style={styles.input}
                value={dni}
                onChange={e => setDni(e.target.value)}
                placeholder="Ej: 12345678"
                inputMode="numeric"
                maxLength={15}
              />
            </div>
            {error && <div style={{ background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: 6, padding: '10px 14px', color: '#c00', fontSize: 13, marginBottom: 14 }}>{error}</div>}
            <button
              type="submit"
              disabled={phase === 'submitting'}
              style={{ width: '100%', padding: '14px', background: phase === 'submitting' ? '#aaa' : primary, color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: phase === 'submitting' ? 'not-allowed' : 'pointer' }}
            >
              {phase === 'submitting' ? 'Registrando…' : 'Acepto esta cotización'}
            </button>
          </form>
        </div>

        {/* Pie */}
        <div style={{ textAlign: 'center', fontSize: 11, color: '#aaa', marginTop: 24 }}>
          {[cfg?.razon_social, cfg?.sitio_web, cfg?.email_comercial].filter(Boolean).join('  ·  ')}
        </div>
      </div>
    </div>
  );
}

export function PaginaConformidadOT({ token }) {
  const [phase, setPhase] = useState('loading');
  const [ot, setOt]       = useState(null);
  const [nombre, setNombre] = useState('');
  const [dni, setDni]     = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    sb.rpc('get_ot_conformidad_publica', { p_token: token })
      .then(({ data, error: e }) => {
        if (e || !data) { setPhase('invalid'); return; }
        if (data.status === 'token_invalido') { setPhase('invalid'); return; }
        if (data.status === 'ya_firmada') { setOt(data); setPhase('already'); return; }
        setOt(data.ot);
        setPhase('ready');
      })
      .catch(() => setPhase('invalid'));
  }, [token]);

  const handleFirmar = async (e) => {
    e.preventDefault();
    setError(null);
    if (!nombre.trim() || !dni.trim()) { setError('Completa todos los campos para continuar.'); return; }
    setPhase('submitting');
    let ip = 'desconocida';
    try { const r = await fetch('https://api.ipify.org?format=json'); ip = (await r.json()).ip; } catch (_) {}
    const { data: rpc, error: rpcErr } = await sb.rpc('registrar_conformidad_ot', {
      p_token: token, p_nombre: nombre.trim(), p_dni: dni.trim(), p_ip: ip,
    });
    if (rpcErr || !rpc?.ok) {
      setError(rpc?.error === 'ya_firmada_o_invalida' ? 'Esta conformidad ya fue registrada.' : 'Error al registrar. Intenta de nuevo.');
      setPhase('ready');
      return;
    }
    setPhase('done');
  };

  if (phase === 'loading') return (
    <div style={styles.shell}><div style={styles.card}><div style={{textAlign:'center',padding:'40px 0',color:'#888'}}>Cargando…</div></div></div>
  );
  if (phase === 'invalid') return (
    <div style={styles.shell}><div style={styles.card}><div style={{textAlign:'center',padding:'40px 0'}}>
      <div style={{fontSize:36,marginBottom:12}}>🔒</div>
      <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Enlace inválido o expirado</div>
      <div style={{color:'#888',fontSize:14}}>Contacta al proveedor del servicio para obtener un nuevo enlace.</div>
    </div></div></div>
  );
  if (phase === 'already') return (
    <div style={styles.shell}><div style={styles.card}><div style={{textAlign:'center',padding:'40px 0'}}>
      <div style={{fontSize:36,marginBottom:12}}>✅</div>
      <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Conformidad ya registrada</div>
      <div style={{color:'#888',fontSize:14}}>Registrada el {fmtDt(ot?.fecha)}{ot?.nombre ? ` por ${ot.nombre}` : ''}.</div>
    </div></div></div>
  );
  if (phase === 'done') return (
    <div style={styles.shell}><div style={{...styles.card,borderTop:'4px solid #1A2B4A'}}><div style={{textAlign:'center',padding:'40px 0'}}>
      <div style={{fontSize:40,marginBottom:12}}>✅</div>
      <div style={{fontSize:20,fontWeight:800,color:'#1A2B4A',marginBottom:8}}>¡Conformidad registrada!</div>
      <div style={{color:'#555',fontSize:14,lineHeight:1.6}}>Tu conformidad para <strong>{ot?.numero}</strong> ha sido registrada con éxito.</div>
    </div></div></div>
  );

  return (
    <div style={styles.shell}>
      <div style={{background:'#1A2B4A',padding:'12px 20px',marginBottom:20}}>
        <span style={{color:'#fff',fontWeight:700,fontSize:16}}>Conformidad de Servicio</span>
      </div>
      <div style={{maxWidth:560,margin:'0 auto',padding:'0 16px 40px'}}>
        <div style={{...styles.card,borderTop:'3px solid #1A2B4A',marginBottom:16}}>
          <div style={{fontSize:11,color:'#607D8B',letterSpacing:1,marginBottom:4}}>ORDEN DE TRABAJO</div>
          <div style={{fontSize:22,fontWeight:800,color:'#1A2B4A',marginBottom:8}}>{ot?.numero}</div>
          {ot?.servicio && <div style={{fontSize:13,color:'#555',marginBottom:4}}><strong>Servicio:</strong> {ot.servicio}</div>}
          {ot?.descripcion_trabajo && <div style={{fontSize:13,color:'#555',marginBottom:4}}><strong>Trabajo realizado:</strong> {ot.descripcion_trabajo}</div>}
          {ot?.fecha_cierre && <div style={{fontSize:13,color:'#555'}}><strong>Fecha de cierre:</strong> {ot.fecha_cierre}</div>}
        </div>
        <div style={{...styles.card,borderTop:'3px solid #1A2B4A'}}>
          <div style={{fontSize:15,fontWeight:800,color:'#1A2B4A',marginBottom:4}}>Confirmar conformidad</div>
          <div style={{fontSize:13,color:'#666',marginBottom:20,lineHeight:1.5}}>Al firmar confirmas que el servicio fue realizado correctamente y de acuerdo a lo acordado.</div>
          <form onSubmit={handleFirmar}>
            <div style={{marginBottom:14}}>
              <label style={styles.label}>Nombre completo *</label>
              <input style={styles.input} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Juan Pérez García" autoComplete="name"/>
            </div>
            <div style={{marginBottom:20}}>
              <label style={styles.label}>DNI *</label>
              <input style={styles.input} value={dni} onChange={e => setDni(e.target.value)} placeholder="Ej: 12345678" inputMode="numeric" maxLength={15}/>
            </div>
            {error && <div style={{background:'#fff0f0',border:'1px solid #ffcccc',borderRadius:6,padding:'10px 14px',color:'#c00',fontSize:13,marginBottom:14}}>{error}</div>}
            <button type="submit" disabled={phase==='submitting'} style={{width:'100%',padding:14,background:phase==='submitting'?'#aaa':'#1A2B4A',color:'#fff',border:'none',borderRadius:8,fontSize:15,fontWeight:700,cursor:phase==='submitting'?'not-allowed':'pointer'}}>
              {phase === 'submitting' ? 'Registrando…' : 'Confirmo conformidad del servicio'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const styles = {
  shell: { minHeight: '100vh', background: '#f0f4f8', fontFamily: 'system-ui, sans-serif' },
  card: { background: '#fff', borderRadius: 10, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
  totRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 },
  th: { padding: '7px 10px', textAlign: 'right', fontWeight: 600, fontSize: 11 },
  td: { padding: '8px 10px', textAlign: 'right', fontSize: 13 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 5 },
  input: { width: '100%', padding: '10px 12px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', outline: 'none' },
};
