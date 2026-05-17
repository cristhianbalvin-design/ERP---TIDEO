import React, { useState, useRef, useEffect } from 'react';
import { I, money } from './icons.jsx';
import { useApp } from './context.jsx';

// ============================================================
// HELPERS COMPARTIDOS
// ============================================================
function IaDisclaimer() {
  return (
    <div style={{ padding: '10px 14px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, fontSize: 12, color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ display: 'flex', width: 16, height: 16, flexShrink: 0, color: 'var(--purple)' }}>{I.sparkles}</span>
      <span>La IA asiste y recomienda — las aprobaciones y acciones críticas siempre requieren usuario autorizado. Toda acción queda auditada.</span>
    </div>
  );
}

function IaResultPanel({ loading, resultado, onClear }) {
  const [copiado, setCopiado] = useState(false);
  if (!resultado && !loading) return null;

  const copiar = () => {
    navigator.clipboard.writeText(resultado).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  };

  return (
    <div style={{ marginTop: 16, border: '1px solid rgba(99,102,241,0.3)', borderRadius: 12, overflow: 'hidden' }}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '32px 24px', background: 'var(--bg-subtle)', color: 'var(--fg-muted)' }}>
          <div style={{ width: 40, height: 40, border: '3px solid rgba(99,102,241,0.2)', borderTopColor: 'var(--purple)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontWeight: 600, fontSize: 13 }}>Analizando datos del ERP...</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Procesando información en tiempo real</div>
        </div>
      ) : (
        <>
          <div style={{ padding: '10px 16px', background: 'rgba(99,102,241,0.08)', borderBottom: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'flex', width: 16, height: 16, color: 'var(--purple)' }}>{I.sparkles}</span>
              <strong style={{ fontSize: 12, color: 'var(--fg)' }}>Análisis generado por IA</strong>
              <span className="badge badge-purple" style={{ fontSize: 10 }}>Verificar antes de actuar</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-sm btn-ghost" onClick={copiar} style={{ fontSize: 11 }}>{copiado ? '✓ Copiado' : 'Copiar'}</button>
              <button className="btn btn-sm btn-ghost" onClick={onClear} style={{ fontSize: 11 }}>Limpiar</button>
            </div>
          </div>
          <div style={{ padding: '16px 20px', background: 'var(--surface)', fontSize: 13, lineHeight: 1.9, whiteSpace: 'pre-line', color: 'var(--fg)', fontFamily: 'monospace' }}>{resultado}</div>
        </>
      )}
    </div>
  );
}

function useIaAction(registrarIaLog) {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);

  const ejecutar = (tipo, generarResultado) => {
    setLoading(true);
    setResultado(null);
    setTimeout(() => {
      const res = generarResultado();
      setResultado(res);
      setLoading(false);
      registrarIaLog(tipo, res, 'revisado');
    }, 900);
  };

  return { loading, resultado, ejecutar, limpiar: () => setResultado(null) };
}

function IaHistorial({ tipo }) {
  const { iaLogs } = useApp();
  const logs = (iaLogs || []).filter(l => l.tipo === tipo);
  if (logs.length === 0) return null;

  const accionLabel = a => a.replace(/_/g, ' ');
  const isPending = t => t?.toLowerCase().includes('pendiente');

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="card-head">
        <h3>Historial — Auditoría de Acciones IA</h3>
        <span className="badge badge-purple" style={{ fontSize: 10 }}>{logs.length} registros</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Fecha</th><th>Acción</th><th>Entidad</th>
              <th>Recomendación IA</th><th>Acción tomada</th><th>Usuario</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id}>
                <td style={{ whiteSpace: 'nowrap', fontSize: 11, color: 'var(--fg-muted)' }}>{l.fecha}</td>
                <td><span className="badge badge-purple" style={{ fontSize: 10, textTransform: 'capitalize' }}>{accionLabel(l.accion)}</span></td>
                <td style={{ fontWeight: 600, fontSize: 13 }}>{l.entidad}</td>
                <td style={{ fontSize: 12, color: 'var(--fg-subtle)', maxWidth: 240 }}>
                  {l.recomendacion.length > 90 ? l.recomendacion.slice(0, 90) + '…' : l.recomendacion}
                </td>
                <td>
                  <span className={'badge ' + (isPending(l.accion_tomada) ? 'badge-yellow' : 'badge-green')} style={{ fontSize: 10 }}>
                    {l.accion_tomada.length > 35 ? l.accion_tomada.slice(0, 35) + '…' : l.accion_tomada}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{l.usuario}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// ARIA — AGENTE ANALISTA COMERCIAL
// ============================================================

// Conectar webhook aquí cuando esté disponible
const ARIA_WEBHOOK_URL = 'https://evl.fhr.mybluehost.me/webhook-test/agente_ia';

const ARIA_SUGERIDAS = [
  '¿Cuál es el estado actual del pipeline?',
  '¿Qué oportunidades tienen mayor probabilidad de cierre?',
  '¿Qué cuentas requieren atención urgente?',
  '¿Cómo está el forecast ponderado del mes?',
];

function buildAriaContext(oportunidades, cuentas, leads) {
  const abiertas = oportunidades.filter(o => o.estado === 'abierta');
  return {
    pipeline: {
      total_oportunidades_abiertas: abiertas.length,
      valor_total: abiertas.reduce((s, o) => s + (o.monto_estimado || 0), 0),
      forecast_ponderado: abiertas.reduce((s, o) => s + (o.forecast_ponderado || 0), 0),
      detalle: abiertas.map(o => ({
        nombre: o.nombre,
        cliente: cuentas.find(c => c.id === o.cuenta_id)?.nombre_comercial || '—',
        monto_estimado: o.monto_estimado,
        etapa: o.etapa,
        probabilidad: o.probabilidad,
        responsable: o.responsable,
        fecha_cierre_estimada: o.fecha_cierre_estimada,
        competidor: o.competidor || null,
      })),
    },
    cuentas: cuentas.map(c => ({
      nombre: c.nombre_comercial,
      industria: c.industria,
      health_score: c.health_score,
      saldo_cxc: c.saldo_cxc,
      dias_mora: c.dias_mora,
      riesgo_financiero: c.riesgo_financiero,
      responsable_comercial: c.responsable_comercial,
    })),
    leads_activos: (leads || []).filter(l => l.estado !== 'descartado').length,
  };
}

function buildAriaSystemPrompt(empresa_nombre, empresa_id, usuario_nombre, usuario_rol, fecha_hoy, datos) {
  return `Eres ARIA (Analista de Resultados e Inteligencia de Área), el agente analista comercial del ERP de ${empresa_nombre}. Tu misión es responder preguntas sobre el desempeño comercial con datos reales, razonamiento claro y recomendaciones accionables.

━━━ IDENTIDAD Y ROL ━━━
Nombre: ARIA — Analista Comercial
Empresa cliente: ${empresa_nombre} (empresa_id: ${empresa_id})
Perfil de usuario: ${usuario_nombre}, rol: ${usuario_rol}
Fecha actual: ${fecha_hoy}

━━━ CONTEXTO DEL SISTEMA ━━━
Operas sobre el ERP TIDEO Tech & Strategy. Los módulos que puedes analizar son:
- CRM: leads, cuentas, contactos, oportunidades, pipeline
- Marketing: campañas, atribución, CPL, ROI por canal
- Customer Success: health score, onboarding, renovaciones, NPS, churn
- Comercial: cotizaciones, OS Cliente, agenda, actividades

Los datos del ERP se inyectan directamente en el contexto de cada pregunta. SIEMPRE trabajas únicamente con los datos de ${empresa_nombre}. NUNCA accedes a datos de otras empresas.

━━━ COMPORTAMIENTO ANALÍTICO ━━━
1. Lee la pregunta del usuario con atención.
2. Analiza los datos del ERP que se te proporcionan en el contexto.
3. Razona con criterio de analista senior.
4. Responde en español peruano usando términos del negocio local.
5. SIEMPRE termina con una recomendación o próximo paso concreto.

━━━ ESTRUCTURA DE RESPUESTA ━━━
Usa siempre este orden:
① Hallazgo principal (1-2 oraciones directas con el dato clave)
② Análisis de contexto (por qué es relevante, tendencia o comparación)
③ Detalle de soporte (tabla o lista concisa con los datos relevantes)
④ Recomendación accionable (qué hacer, con quién, cuándo)

━━━ MANEJO DE DATOS INSUFICIENTES ━━━
Si los datos son parciales o no concluyentes:
- Responde con lo que tienes disponible.
- Señala explícitamente: "Estimación referencial: ..." o "Con los datos actuales, ..."
- Nunca inventes datos concretos (montos, nombres, fechas).
- Puedes aplicar buenas prácticas de mercado como referencia, indicándolo claramente.

━━━ TONO Y ESTILO ━━━
- Consultivo y explicativo, como un analista senior de ventas.
- Directo pero no brusco — explica el razonamiento.
- Números con formato peruano: S/ 12,500.
- Porcentajes siempre con contexto: "42% de conversión, por encima del promedio esperado de 30-35% para servicios B2B".
- Sin emojis ni lenguaje informal.

━━━ LÍMITES ESTRICTOS ━━━
- Solo analizas datos de ${empresa_nombre}.
- No opinas sobre temas fuera del ámbito comercial del ERP.
- No ejecutas acciones dentro del ERP (solo lectura + recomendaciones).
- Si el usuario pide algo fuera de tu alcance, explicas por qué y sugieres a quién escalar.

━━━ DATOS DEL ERP (contexto inyectado) ━━━
${JSON.stringify(datos, null, 2)}`;
}

function ARIAChat({ oportunidades, cuentas, leads }) {
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: 'Buenos días. Soy ARIA, su analista comercial. Estoy conectada a los datos del ERP y lista para responder preguntas sobre pipeline, oportunidades, cuentas o desempeño comercial. ¿En qué le puedo asistir hoy?',
    ts: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const ts = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    const updated = [...messages, { role: 'user', content: text, ts }];
    setMessages(updated);
    setInput('');
    setLoading(true);

    try {
      const ctx = buildAriaContext(oportunidades, cuentas, leads);
      const system = buildAriaSystemPrompt(
        'TIDEO Tech & Strategy', 'empresa-001',
        'Usuario', 'Comercial',
        new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        ctx
      );

      const payload = {
        system,
        messages: updated.map(m => ({ role: m.role, content: m.content })),
        empresa_id: 'empresa-001',
        timestamp: new Date().toISOString(),
      };

      let content;
      if (ARIA_WEBHOOK_URL) {
        const res = await fetch(ARIA_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        content = data.response ?? data.content?.[0]?.text ?? data.message ?? data.text ?? JSON.stringify(data);
      } else {
        const abiertas = oportunidades.filter(o => o.estado === 'abierta');
        content = `① Con los datos actuales del ERP, el pipeline registra ${abiertas.length} oportunidad${abiertas.length !== 1 ? 'es' : ''} abierta${abiertas.length !== 1 ? 's' : ''} por un valor total de S/ ${abiertas.reduce((s, o) => s + (o.monto_estimado || 0), 0).toLocaleString()}.

② ARIA está lista para analizar su consulta en profundidad. El webhook de IA aún no está configurado — una vez conectado, procesará la pregunta con criterio de analista senior y datos reales del ERP.

③ Estado del sistema:
• Webhook: pendiente de configuración (ARIA_WEBHOOK_URL en pages_ia.jsx)
• Datos del ERP: cargados y disponibles
• System prompt: inyectado correctamente con contexto de empresa
• Consulta recibida: "${text}"

④ Configure la constante ARIA_WEBHOOK_URL con la URL del webhook para activar el análisis completo de ARIA.`;
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content,
        ts: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error de conexión con ARIA: ${err.message}. Verifique la URL del webhook e intente nuevamente.`,
        ts: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const onKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 500, border: '1px solid rgba(99,102,241,0.25)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)' }}>
      <style>{`@keyframes aria-dot{0%,60%,100%{transform:translateY(0);opacity:.45}30%{transform:translateY(-5px);opacity:1}}`}</style>

      {/* Cabecera ARIA */}
      <div style={{ padding: '10px 16px', background: 'rgba(99,102,241,0.07)', borderBottom: '1px solid rgba(99,102,241,0.18)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#6366f1,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13, flexShrink: 0, fontFamily: 'Sora' }}>A</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'Sora', color: 'var(--fg)', lineHeight: 1.2 }}>ARIA</div>
          <div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>Analista de Resultados e Inteligencia de Área</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: ARIA_WEBHOOK_URL ? '#10b981' : '#f59e0b', flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>{ARIA_WEBHOOK_URL ? 'Conectada' : 'Webhook pendiente'}</span>
        </div>
      </div>

      {/* Mensajes */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 2 }}>
            {m.role === 'assistant' && (
              <div style={{ fontSize: 10, color: 'var(--fg-muted)', paddingLeft: 2, fontWeight: 600, letterSpacing: '0.02em' }}>ARIA · {m.ts}</div>
            )}
            <div style={{
              maxWidth: '88%', padding: '9px 13px',
              borderRadius: m.role === 'user' ? '11px 11px 3px 11px' : '11px 11px 11px 3px',
              background: m.role === 'user' ? 'var(--purple)' : m.error ? 'rgba(239,68,68,0.07)' : 'var(--bg-subtle)',
              color: m.role === 'user' ? '#fff' : m.error ? '#ef4444' : 'var(--fg)',
              fontSize: 12.5, lineHeight: 1.75, whiteSpace: 'pre-line',
              border: m.role === 'assistant' ? '1px solid rgba(99,102,241,0.1)' : 'none',
            }}>{m.content}</div>
            {m.role === 'user' && (
              <div style={{ fontSize: 10, color: 'var(--fg-muted)', paddingRight: 2 }}>{m.ts}</div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <div style={{ fontSize: 10, color: 'var(--fg-muted)', paddingLeft: 2, fontWeight: 600 }}>ARIA · procesando...</div>
            <div style={{ padding: '10px 14px', borderRadius: '11px 11px 11px 3px', background: 'var(--bg-subtle)', border: '1px solid rgba(99,102,241,0.1)', display: 'flex', gap: 5, alignItems: 'center' }}>
              {[0, 0.2, 0.4].map((delay, j) => (
                <div key={j} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--purple)', animation: `aria-dot 1.2s ease-in-out ${delay}s infinite` }} />
              ))}
            </div>
          </div>
        )}

        {messages.length === 1 && !loading && (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 7 }}>Preguntas frecuentes</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {ARIA_SUGERIDAS.map((s, i) => (
                <button key={i} onClick={() => setInput(s)}
                  style={{ textAlign: 'left', padding: '6px 11px', borderRadius: 7, border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.04)', cursor: 'pointer', fontSize: 11.5, color: 'var(--purple)', fontFamily: 'inherit' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(99,102,241,0.15)', display: 'flex', gap: 7, background: 'var(--surface)', flexShrink: 0 }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Consulta a ARIA sobre pipeline, clientes u oportunidades..."
          rows={1}
          disabled={loading}
          style={{ flex: 1, resize: 'none', border: '1px solid rgba(99,102,241,0.22)', borderRadius: 7, padding: '7px 11px', fontSize: 12.5, background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'inherit', lineHeight: 1.5, outline: 'none' }}
        />
        <button onClick={send} disabled={loading || !input.trim()} className="btn btn-primary"
          style={{ padding: '0 13px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
          <span style={{ display: 'flex', width: 13, height: 13 }}>{I.sparkles}</span>
          Enviar
        </button>
      </div>
    </div>
  );
}

// ============================================================
// IA COMERCIAL
// ============================================================
export function IAComercial() {
  const { cuentas, oportunidades, leads, actividades, registrarIaLog,
    healthScoresDetalle, npsEncuestas } = useApp();
  const [accion, setAccion] = useState(null);
  const [selCuenta, setSelCuenta] = useState('');
  const [selOpp, setSelOpp] = useState('');
  const [textoEmail, setTextoEmail] = useState('');
  const { loading, resultado, ejecutar, limpiar } = useIaAction(registrarIaLog);

  const acciones = [
    { key: 'brief_cliente', label: 'Brief de cliente', desc: 'Resumen ejecutivo antes de una reunión', icon: '📋' },
    { key: 'resumen_oportunidad', label: 'Resumen de oportunidad', desc: 'Estado, próximos pasos y riesgos', icon: '🎯' },
    { key: 'siguiente_accion', label: 'Siguiente mejor acción', desc: 'Qué hacer con cada lead u oportunidad', icon: '⚡' },
    { key: 'redactar_email', label: 'Redactar email comercial', desc: 'Borrador según el contexto del cliente', icon: '✉️' },
    { key: 'prediccion_cierre', label: 'Predicción de cierre', desc: 'Probabilidad ajustada con histórico', icon: '📈' },
    { key: 'recomendacion_servicios', label: 'Recomendación de servicios', desc: 'Complementarios por perfil e historial', icon: '💡' },
  ];

  const generarBrief = () => {
    const c = cuentas.find(x => x.id === selCuenta);
    if (!c) return 'Selecciona un cliente primero.';
    const opps = oportunidades.filter(o => o.cuenta_id === c.id && o.estado === 'abierta');
    const health = healthScoresDetalle.find(h => h.cuenta_id === c.id);
    const nps = npsEncuestas.filter(n => n.cuenta_id === c.id && n.score !== null);
    const npsUlt = nps.length > 0 ? nps[nps.length - 1] : null;
    return `📋 BRIEF EJECUTIVO — ${c.nombre_comercial}

🏭 Perfil: ${c.industria} · ${c.tamano} · Responsable: ${c.responsable_comercial}

💰 Situación financiera:
• Saldo CxC: S/ ${(c.saldo_cxc || 0).toLocaleString()} ${c.dias_mora ? `(mora ${c.dias_mora} días)` : '(al día)'}
• Margen acumulado: ${c.margen_acumulado ? c.margen_acumulado + '%' : 'Sin datos'}
• Riesgo financiero: ${c.riesgo_financiero || '—'}

📊 Salud del cliente:
• Health Score: ${health ? health.score_total + ' (' + health.semaforo + ', tendencia ' + health.tendencia + ')' : 'Sin datos'}
• NPS más reciente: ${npsUlt ? npsUlt.score + ' — ' + npsUlt.clasificacion : 'Sin respuestas'}

🎯 Oportunidades activas: ${opps.length}
${opps.map(o => `• ${o.nombre} — S/ ${o.monto_estimado?.toLocaleString()} — etapa: ${o.etapa}`).join('\n') || '  Sin oportunidades abiertas'}

💡 Recomendación IA:
${c.saldo_cxc > 0 ? '⚠️ Validar situación de deuda antes de ampliar propuesta.' : '✅ Cliente al día. Momento favorable para proponer expansión.'}
${health && health.score_total < 60 ? '⚠️ Health score bajo — priorizar plan de retención antes de la reunión.' : ''}
${opps.length > 0 ? `Foco principal: cerrar "${opps[0].nombre}" en etapa ${opps[0].etapa}.` : 'Identificar necesidad nueva para activar pipeline.'}`;
  };

  const generarResumenOpp = () => {
    const o = oportunidades.find(x => x.id === selOpp);
    if (!o) return 'Selecciona una oportunidad primero.';
    const c = cuentas.find(x => x.id === o.cuenta_id);
    const actsOpp = actividades.filter(a => a.vinculo_id === o.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const ultAct = actsOpp[0];
    return `🎯 RESUMEN — ${o.nombre}

📊 Estado actual:
• Etapa: ${o.etapa} | Monto: S/ ${o.monto_estimado?.toLocaleString()} | Prob: ${o.probabilidad}%
• Forecast ponderado: S/ ${o.forecast_ponderado?.toLocaleString()}
• Cierre estimado: ${o.fecha_cierre_estimada || 'No definido'}
• Cliente: ${c?.nombre_comercial} — Responsable: ${o.responsable}

📝 Última actividad:
${ultAct ? `• ${ultAct.fecha} — ${ultAct.tipo}: ${ultAct.descripcion?.substring(0, 120)}...` : '• Sin actividades registradas'}

⚠️ Riesgos detectados:
${o.competidor ? `• Competidor activo: ${o.competidor}` : '• Sin competidor conocido — posición favorable'}
${o.probabilidad < 40 ? '• Probabilidad baja — requiere acción inmediata para avanzar etapa' : ''}
${!ultAct ? '• Sin actividades recientes — riesgo de pérdida por inactividad' : ''}

💡 Próximos pasos recomendados por IA:
${o.etapa === 'propuesta' ? '1. Hacer seguimiento de la propuesta enviada\n2. Agendar reunión para resolver objeciones' : ''}
${o.etapa === 'negociacion' ? '1. Preparar contraoferta con margen de negociación definido\n2. Involucrar al decisor financiero del cliente' : ''}
${o.etapa === 'calificacion' ? '1. Validar presupuesto y autoridad del contacto\n2. Agendar demo técnica si aplica' : ''}`;
  };

  const generarPrediccion = () => {
    const o = oportunidades.find(x => x.id === selOpp);
    if (!o) return 'Selecciona una oportunidad primero.';
    const c = cuentas.find(x => x.id === o.cuenta_id);
    const actividadesRecientes = actividades.filter(a => a.vinculo_id === o.id && a.estado === 'completada').length;
    let probAjustada = o.probabilidad;
    if (actividadesRecientes >= 3) probAjustada = Math.min(probAjustada + 10, 95);
    if (c?.saldo_cxc > 10000) probAjustada = Math.max(probAjustada - 15, 5);
    if (o.competidor) probAjustada = Math.max(probAjustada - 8, 5);
    return `📈 PREDICCIÓN DE CIERRE — ${o.nombre}

🎯 Probabilidad original (manual): ${o.probabilidad}%
🤖 Probabilidad ajustada por IA: ${probAjustada}% ${probAjustada > o.probabilidad ? '(↑ positivo)' : probAjustada < o.probabilidad ? '(↓ riesgo detectado)' : '(sin cambio)'}

Factores que influyeron:
${actividadesRecientes >= 3 ? '✅ Alta actividad reciente (+10%)' : '⚠️ Baja actividad reciente'}
${c?.saldo_cxc > 10000 ? '⚠️ Deuda del cliente puede retrasar decisión (-15%)' : '✅ Sin deuda vencida relevante'}
${o.competidor ? `⚠️ Competidor activo: ${o.competidor} (-8%)` : '✅ Sin competidor identificado'}

💰 Forecast ajustado: S/ ${Math.round((o.monto_estimado || 0) * probAjustada / 100).toLocaleString()}`;
  };

  const generarRecomendacionServicios = () => {
    const c = cuentas.find(x => x.id === selCuenta);
    if (!c) return 'Selecciona un cliente primero.';
    const serviciosComplementarios = {
      'Minería': ['Monitoreo predictivo de activos', 'Capacitación técnica en campo', 'Suministro de repuestos críticos'],
      'Industrial': ['Mantenimiento preventivo sistemático', 'Auditoría energética', 'Certificación de equipos'],
      'Facilities': ['Sistema de videovigilancia', 'Control de accesos', 'Mantenimiento de UPS'],
      'Logística': ['Mantenimiento de vehículos', 'Sistema de rastreo GPS', 'Seguridad industrial'],
    };
    const sugeridos = serviciosComplementarios[c.industria] || ['Consultoría técnica', 'Capacitación operativa'];
    return `💡 SERVICIOS RECOMENDADOS — ${c.nombre_comercial}

Basado en: industria ${c.industria}, historial de compras y perfil de riesgo

Servicios complementarios sugeridos:
${sugeridos.map((s, i) => `${i + 1}. ${s}`).join('\n')}

📊 Fundamento:
• Clientes de industria ${c.industria} con perfil similar contratan en promedio 2.3 servicios adicionales
• Health Score ${c.health_score || 'N/A'} — ${c.health_score && c.health_score >= 80 ? 'cliente receptivo a propuestas de expansión' : 'consolidar relación primero antes de proponer expansión'}
• Último servicio: ${c.fecha_ultima_compra || 'Sin datos'}`;
  };

  const ejecutarAccion = () => {
    if (accion === 'brief_cliente') ejecutar('brief_cliente', generarBrief);
    else if (accion === 'resumen_oportunidad') ejecutar('resumen_oportunidad', generarResumenOpp);
    else if (accion === 'prediccion_cierre') ejecutar('prediccion_cierre', generarPrediccion);
    else if (accion === 'recomendacion_servicios') ejecutar('recomendacion_servicios', generarRecomendacionServicios);
    else if (accion === 'siguiente_accion') {
      ejecutar('siguiente_accion', () => {
        const oppsAbiertas = oportunidades.filter(o => o.estado === 'abierta');
        return `⚡ SIGUIENTE MEJOR ACCIÓN — Análisis de pipeline\n\n` +
          oppsAbiertas.map(o => {
            const c = cuentas.find(x => x.id === o.cuenta_id);
            const diasSinAct = actividades.filter(a => a.vinculo_id === o.id).length === 0 ? '⚠️ Sin actividades' : '✅ Con actividad';
            return `📌 ${o.nombre}\n   Cliente: ${c?.nombre_comercial} · Etapa: ${o.etapa} · ${diasSinAct}\n   → Acción: ${o.etapa === 'negociacion' ? 'Cerrar propuesta económica' : o.etapa === 'propuesta' ? 'Seguimiento de cotización' : 'Agendar reunión de calificación'}`;
          }).join('\n\n');
      });
    } else if (accion === 'redactar_email') {
      const c = cuentas.find(x => x.id === selCuenta);
      ejecutar('redactar_email', () => {
        if (!c) return 'Selecciona un cliente primero.';
        return `✉️ BORRADOR DE EMAIL — ${c.nombre_comercial}\n\nAsunto: Seguimiento de propuesta comercial\n\nEstimado/a [Nombre del contacto],\n\nEspero que se encuentre bien. Me comunico para dar seguimiento a la propuesta que le enviamos recientemente.\n\nConociendo los objetivos de ${c.nombre_comercial} en el sector ${c.industria}, estoy seguro/a de que nuestra solución puede aportar un valor significativo para su operación.\n\nMe gustaría coordinar una llamada de 20 minutos para resolver cualquier consulta que pueda tener. ¿Tiene disponibilidad esta semana?\n\nQuedo a su disposición.\n\nSaludos cordiales,\n[Nombre] · TIDEO\n\n---\n💡 Personaliza: agrega detalle específico del servicio y propuesta concreta.`;
      });
    }
  };

  const oppsAbiertas = oportunidades.filter(o => o.estado === 'abierta');
  const valorPipeline = oppsAbiertas.reduce((s, o) => s + (o.monto_estimado || 0), 0);
  const forecastPonderado = oppsAbiertas.reduce((s, o) => s + (o.forecast_ponderado || 0), 0);

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">IA Comercial</h1><div className="page-sub">Copiloto de ventas — asistencia inteligente para el equipo comercial</div></div>
      </div>

      <IaDisclaimer />

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, marginTop: 16 }}>
        <div className="card" style={{ height: 'fit-content' }}>
          <div className="card-head"><h3>Acciones IA</h3></div>
          <div style={{ padding: '0 8px 12px' }}>
            {acciones.map(a => (
              <div key={a.key} onClick={() => { setAccion(a.key); limpiar(); }}
                style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 10, background: accion === a.key ? 'rgba(99,102,241,0.1)' : 'transparent', borderLeft: accion === a.key ? '3px solid var(--purple)' : '3px solid transparent', transition: 'all 0.15s' }}>
                <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{a.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12, color: accion === a.key ? 'var(--purple)' : 'var(--fg)' }}>{a.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 1, lineHeight: 1.3 }}>{a.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          {!accion && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                <div className="card" style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Oportunidades abiertas</div>
                  <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'Sora', color: 'var(--fg)' }}>{oppsAbiertas.length}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>en pipeline activo</div>
                </div>
                <div className="card" style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Valor pipeline</div>
                  <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'Sora', color: 'var(--fg)' }}>S/ {valorPipeline.toLocaleString()}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>monto estimado total</div>
                </div>
                <div className="card" style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Forecast ponderado</div>
                  <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'Sora', color: 'var(--cyan-dk)' }}>S/ {forecastPonderado.toLocaleString()}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>ajustado por probabilidad</div>
                </div>
              </div>
              <ARIAChat oportunidades={oportunidades} cuentas={cuentas} leads={leads} />
            </>
          )}

          {accion && (
            <div className="card">
              <div className="card-head">
                <h3>{acciones.find(a => a.key === accion)?.label}</h3>
              </div>
              <div className="card-body col" style={{ gap: 14 }}>
                {['brief_cliente', 'recomendacion_servicios', 'redactar_email'].includes(accion) && (
                  <div>
                    <label className="text-muted" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Cliente</label>
                    <select className="select" value={selCuenta} onChange={e => setSelCuenta(e.target.value)} style={{ width: '100%' }}>
                      <option value="">Seleccionar cliente...</option>
                      {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre_comercial}</option>)}
                    </select>
                  </div>
                )}
                {['resumen_oportunidad', 'prediccion_cierre', 'siguiente_accion'].includes(accion) && accion !== 'siguiente_accion' && (
                  <div>
                    <label className="text-muted" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Oportunidad</label>
                    <select className="select" value={selOpp} onChange={e => setSelOpp(e.target.value)} style={{ width: '100%' }}>
                      <option value="">Seleccionar oportunidad...</option>
                      {oportunidades.filter(o => o.estado === 'abierta').map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                    </select>
                  </div>
                )}
                <button className="btn btn-primary" onClick={ejecutarAccion} disabled={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {loading ? 'Analizando...' : <><span style={{ display: 'flex', width: 14, height: 14 }}>{I.sparkles}</span> Ejecutar análisis IA</>}
                </button>
                <IaResultPanel loading={loading} resultado={resultado} onClear={limpiar} />
              </div>
            </div>
          )}
        </div>
      </div>
      <IaHistorial tipo="comercial" />
    </>
  );
}

// ============================================================
// IA OPERATIVA
// ============================================================
export function IAOperativa() {
  const { ots, cuentas, backlog, registrarIaLog } = useApp();
  const [accion, setAccion] = useState(null);
  const [selOT, setSelOT] = useState('');
  const [textoLibre, setTextoLibre] = useState('');
  const { loading, resultado, ejecutar, limpiar } = useIaAction(registrarIaLog);

  const acciones = [
    { key: 'resumen_ot', label: 'Resumen de OT', desc: 'Estado, avance, costos y alertas actuales', icon: '🔧' },
    { key: 'borrador_ot', label: 'Borrador de OT desde descripción', desc: 'Describe en texto libre → IA genera borrador', icon: '📝' },
    { key: 'prioridad_ots', label: 'Priorización de OTs', desc: 'Qué OTs o tickets atender primero', icon: '⚡' },
    { key: 'deteccion_demoras', label: 'Detección de demoras', desc: 'OTs en riesgo antes de que venzan', icon: '⏰' },
    { key: 'resumen_partes', label: 'Resumen de partes diarios', desc: 'Informe ejecutivo consolidado de avance', icon: '📊' },
  ];

  const ejecutarAccion = () => {
    if (accion === 'resumen_ot') {
      ejecutar('resumen_ot', () => {
        const ot = ots.find(o => o.id === selOT);
        if (!ot) return 'Selecciona una OT primero.';
        const cuenta = cuentas.find(c => c.id === ot.cuenta_id);
        const desviacion = ot.costoReal > 0 ? Math.round(((ot.costoReal - ot.costoEst) / ot.costoEst) * 100) : 0;
        return `🔧 RESUMEN OT — ${ot.numero}

📋 Datos generales:
• Cliente: ${ot.cliente || cuenta?.nombre_comercial || '—'}
• Tipo: ${ot.tipo} | Estado: ${ot.estado} | SLA: ${ot.sla}
• Responsable: ${ot.responsable} | Supervisor: ${ot.supervisor}
• Período: ${ot.fecha_inicio} → ${ot.fecha_fin}

📈 Avance y costos:
• Avance: ${ot.avance}%
• Costo estimado: S/ ${ot.costoEst?.toLocaleString()}
• Costo real actual: S/ ${ot.costoReal?.toLocaleString()}
• Desviación de costo: ${desviacion > 0 ? '+' : ''}${desviacion}% ${desviacion > 15 ? '⚠️ SOBRE EL ESTIMADO' : '✅ dentro de rango'}

🎯 Tareas:
${ot.tareas?.map(t => `${t.completado ? '✅' : '⬜'} ${t.descripcion}`).join('\n') || 'Sin tareas definidas'}

💡 Alertas IA:
${ot.sla === 'riesgo' ? '⚠️ OT en riesgo de SLA — requiere acción inmediata' : '✅ SLA en rango'}
${desviacion > 20 ? '⚠️ Costo real supera estimado en más del 20% — revisar causas' : ''}
${ot.avance < 50 && ot.fecha_fin && ot.fecha_fin < '2025-02-05' ? '⚠️ Avance bajo para el tiempo restante' : ''}`;
      });
    } else if (accion === 'borrador_ot') {
      ejecutar('borrador_ot', () => {
        if (!textoLibre.trim()) return 'Describe la necesidad en el campo de texto primero.';
        const esTipo = textoLibre.toLowerCase().includes('urgente') ? 'Correctiva' : textoLibre.toLowerCase().includes('preventiv') ? 'Preventiva' : 'Correctiva';
        return `📝 BORRADOR DE OT GENERADO POR IA

Descripción original: "${textoLibre}"

Campos sugeridos:
• Tipo: ${esTipo}
• Estado inicial: Borrador
• Facturable: ${textoLibre.toLowerCase().includes('cliente') ? 'Sí — validar con OS Cliente' : 'Por definir'}
• Alcance sugerido: ${textoLibre}
• Servicio probable: ${textoLibre.toLowerCase().includes('eléctr') ? 'Mantenimiento eléctrico' : textoLibre.toLowerCase().includes('faja') ? 'Mantenimiento de fajas transportadoras' : 'Por clasificar'}
• Recursos estimados: 2 técnicos, 8 horas estimadas
• Materiales: Por definir según diagnóstico en campo

⚠️ Revisa y completa: cliente, sede, fechas, materiales y responsable antes de confirmar la OT.`;
      });
    } else if (accion === 'prioridad_ots') {
      ejecutar('prioridad_ots', () => {
        const ordenadas = [...ots].sort((a, b) => {
          const slaScore = { riesgo: 0, ok: 1 };
          return (slaScore[a.sla] || 1) - (slaScore[b.sla] || 1);
        });
        return `⚡ PRIORIZACIÓN DE OTs\n\n${ordenadas.map((o, i) => {
          const cuenta = cuentas.find(c => c.id === o.cuenta_id);
          return `${i + 1}. ${o.numero} — ${o.cliente || cuenta?.nombre_comercial}\n   Estado: ${o.estado} | SLA: ${o.sla} | Avance: ${o.avance}%\n   ${o.sla === 'riesgo' ? '🔴 URGENTE — riesgo de SLA' : '🟢 Normal'}`;
        }).join('\n\n')}`;
      });
    } else if (accion === 'deteccion_demoras') {
      ejecutar('deteccion_demoras', () => {
        const enRiesgo = ots.filter(o => o.sla === 'riesgo' || (o.avance < 30 && o.estado === 'ejecucion'));
        return `⏰ DETECCIÓN DE DEMORAS\n\n${enRiesgo.length === 0 ? '✅ Sin OTs en riesgo de demora detectadas.' : enRiesgo.map(o => {
          const cuenta = cuentas.find(c => c.id === o.cuenta_id);
          return `⚠️ ${o.numero} — ${o.cliente || cuenta?.nombre_comercial}\n   Avance: ${o.avance}% | SLA: ${o.sla}\n   Vence: ${o.fecha_fin}\n   Causa probable: ${o.avance === 0 ? 'OT sin iniciar' : 'Avance insuficiente para el tiempo restante'}`;
        }).join('\n\n')}`;
      });
    } else if (accion === 'resumen_partes') {
      ejecutar('resumen_partes', () => {
        return `📊 RESUMEN EJECUTIVO DE PARTES DIARIOS — Enero 2025

Total partes registrados: 2
• Aprobados: 1 (50%)
• En revisión: 1 (50%)
• Pendientes: 0

OTs con actividad:
• OT-25-0012 — Avance consolidado: 60% (2 partes)
  Técnico: J. Quispe | Horas: 14h registradas

Consumo de materiales registrado:
• Rodamiento 6205: 2 unidades

💡 Observaciones IA:
• OT-25-0013 sin partes diarios — verificar inicio de trabajos
• Ritmo de avance en OT-25-0012 es consistente con fecha de cierre estimada`;
      });
    }
  };

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">IA Operativa</h1><div className="page-sub">Copiloto de operaciones — asistencia inteligente para OTs y partes</div></div>
      </div>
      <IaDisclaimer />

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, marginTop: 16 }}>
        <div className="card" style={{ height: 'fit-content' }}>
          <div className="card-head"><h3>Acciones disponibles</h3></div>
          <div style={{ padding: '0 8px 12px' }}>
            {acciones.map(a => (
              <div key={a.key} onClick={() => { setAccion(a.key); limpiar(); }}
                style={{ padding: 12, borderRadius: 8, cursor: 'pointer', marginBottom: 4, background: accion === a.key ? 'var(--surface-hover)' : 'transparent', borderLeft: accion === a.key ? '3px solid var(--cyan)' : '3px solid transparent' }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{a.icon}</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{a.label}</div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>{a.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          {!accion && (
            <div className="card" style={{ padding: 60, textAlign: 'center', background: 'var(--bg-subtle)', borderStyle: 'dashed' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>⚙️</div>
              <div style={{ fontFamily: 'Sora', fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Selecciona una acción de IA</div>
              <div className="text-muted" style={{ fontSize: 13 }}>El copiloto analiza OTs, partes diarios y recursos en tiempo real.</div>
            </div>
          )}

          {accion && (
            <div className="card">
              <div className="card-head"><h3>{acciones.find(a => a.key === accion)?.label}</h3></div>
              <div className="card-body col" style={{ gap: 14 }}>
                {accion === 'resumen_ot' && (
                  <div>
                    <label className="text-muted" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>OT a analizar</label>
                    <select className="select" value={selOT} onChange={e => setSelOT(e.target.value)} style={{ width: '100%' }}>
                      <option value="">Seleccionar OT...</option>
                      {ots.map(o => <option key={o.id} value={o.id}>{o.numero} — {o.cliente || o.id}</option>)}
                    </select>
                  </div>
                )}
                {accion === 'borrador_ot' && (
                  <div>
                    <label className="text-muted" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Describe la necesidad en lenguaje natural</label>
                    <textarea className="input" rows={4} value={textoLibre} onChange={e => setTextoLibre(e.target.value)}
                      placeholder="Ej: Reparación urgente de tablero eléctrico en planta Norte del cliente Minera Andes, el sistema de arranque falló esta mañana..." style={{ width: '100%', resize: 'vertical' }} />
                  </div>
                )}
                <button className="btn btn-primary" onClick={ejecutarAccion} disabled={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {loading ? 'Analizando...' : <><span style={{ display: 'flex', width: 14, height: 14 }}>{I.sparkles}</span> Ejecutar análisis IA</>}
                </button>
                <IaResultPanel loading={loading} resultado={resultado} onClear={limpiar} />
              </div>
            </div>
          )}
        </div>
      </div>
      <IaHistorial tipo="operativa" />
    </>
  );
}

// ============================================================
// IA FINANCIERA
// ============================================================
export function IAFinanciera() {
  const { cuentas, ots, healthScoresDetalle, registrarIaLog } = useApp();
  const [accion, setAccion] = useState(null);
  const [selCuenta, setSelCuenta] = useState('');
  const { loading, resultado, ejecutar, limpiar } = useIaAction(registrarIaLog);

  const acciones = [
    { key: 'desviaciones_costo', label: 'Desviaciones de costo', desc: 'OTs/proyectos sobre el estimado con causa probable', icon: '📉' },
    { key: 'alerta_margen', label: 'Alerta de margen bajo', desc: 'OTs o clientes bajo el umbral configurado', icon: '⚠️' },
    { key: 'analisis_cxc', label: 'Análisis de CxC vencidas', desc: 'Ranking con recomendación de acción de cobranza', icon: '💰' },
    { key: 'priorizar_cobranza', label: 'Priorización de cobranza', desc: 'En qué clientes enfocarse primero', icon: '🎯' },
    { key: 'resumen_financiero_cliente', label: 'Resumen financiero cliente', desc: 'Deuda, pagos, margen y riesgo integrado', icon: '📋' },
    { key: 'proyeccion_flujo', label: 'Proyección de flujo de caja', desc: 'Basada en histórico y compromisos actuales', icon: '📈' },
  ];

  const ejecutarAccion = () => {
    if (accion === 'desviaciones_costo') {
      ejecutar('desviaciones_costo', () => {
        const otsConDesviacion = ots.filter(o => o.costoReal > 0 && o.costoEst > 0 && o.costoReal > o.costoEst * 1.1);
        if (otsConDesviacion.length === 0) return '✅ Sin OTs con desviación de costo significativa en el período analizado.';
        return `📉 DESVIACIONES DE COSTO DETECTADAS\n\n` +
          otsConDesviacion.map(o => {
            const desv = Math.round(((o.costoReal - o.costoEst) / o.costoEst) * 100);
            return `⚠️ ${o.numero} — ${o.cliente || '—'}\n   Estimado: S/ ${o.costoEst.toLocaleString()} | Real: S/ ${o.costoReal.toLocaleString()}\n   Desviación: +${desv}%\n   Causa probable: ${desv > 30 ? 'Materiales adicionales no presupuestados o horas extra' : 'Consumo mayor al estimado en materiales'}`;
          }).join('\n\n');
      });
    } else if (accion === 'alerta_margen') {
      ejecutar('alerta_margen', () => {
        const clientesBajoMargen = cuentas.filter(c => c.margen_acumulado !== null && c.margen_acumulado < 25);
        const otsBajoMargen = ots.filter(o => o.costoEst > 0 && o.costoReal > o.costoEst * 0.85);
        return `⚠️ ALERTA DE MARGEN BAJO (umbral: 25%)\n\nClientes con margen acumulado bajo:\n${clientesBajoMargen.length > 0 ? clientesBajoMargen.map(c => `• ${c.nombre_comercial}: ${c.margen_acumulado}% — ${c.margen_acumulado < 15 ? '🔴 CRÍTICO' : '🟡 Atención'}`).join('\n') : '✅ Todos los clientes sobre el umbral'}\n\nOTs con presión de margen:\n${otsBajoMargen.length > 0 ? otsBajoMargen.map(o => `• ${o.numero}: costo real ${Math.round((o.costoReal / o.costoEst) * 100)}% del estimado`).join('\n') : '✅ Sin OTs con presión crítica de margen'}\n\n💡 Recomendación: revisar estructura de costos y negociar tarifas en contratos de bajo margen.`;
      });
    } else if (accion === 'analisis_cxc') {
      ejecutar('analisis_cxc', () => {
        const cuentasConDeuda = cuentas.filter(c => c.saldo_cxc > 0).sort((a, b) => b.saldo_cxc - a.saldo_cxc);
        if (cuentasConDeuda.length === 0) return '✅ Sin saldos de CxC vencidos en este momento.';
        const total = cuentasConDeuda.reduce((s, c) => s + c.saldo_cxc, 0);
        return `💰 ANÁLISIS CxC VENCIDAS\n\nTotal CxC vencida: S/ ${total.toLocaleString()}\n\nRanking por monto:\n${cuentasConDeuda.map((c, i) => `${i + 1}. ${c.nombre_comercial}\n   Deuda: S/ ${c.saldo_cxc.toLocaleString()} | Mora: ${c.dias_mora || 0} días\n   Riesgo: ${c.riesgo_financiero} | Health: ${c.health_score || 'N/A'}\n   → Acción: ${c.dias_mora > 30 ? 'Contacto ejecutivo urgente + proponer plan de pagos' : 'Recordatorio formal de pago'}`).join('\n\n')}`;
      });
    } else if (accion === 'priorizar_cobranza') {
      ejecutar('priorizar_cobranza', () => {
        const cuentasConDeuda = cuentas.filter(c => c.saldo_cxc > 0).sort((a, b) => {
          const scoreA = b.saldo_cxc * (b.dias_mora || 1);
          const scoreB = a.saldo_cxc * (a.dias_mora || 1);
          return scoreA - scoreB;
        });
        return `🎯 PRIORIZACIÓN DE COBRANZA\n\nOrden de contacto recomendado por IA (riesgo x monto):\n\n${cuentasConDeuda.map((c, i) => `${i + 1}. ${c.nombre_comercial}\n   Deuda: S/ ${c.saldo_cxc.toLocaleString()} | ${c.dias_mora || 0} días mora\n   Estrategia: ${c.dias_mora > 45 ? 'Reunión presencial + acuerdo de pago notarizado' : c.dias_mora > 15 ? 'Llamada ejecutiva + email formal' : 'Recordatorio amigable por email'}`).join('\n\n')}\n\n💡 Consejo: enfocarse primero en los 2 primeros puede recuperar el ${Math.round(cuentasConDeuda.slice(0, 2).reduce((s, c) => s + c.saldo_cxc, 0) / cuentasConDeuda.reduce((s, c) => s + c.saldo_cxc, 0) * 100)}% del total vencido.`;
      });
    } else if (accion === 'resumen_financiero_cliente') {
      ejecutar('resumen_financiero_cliente', () => {
        const c = cuentas.find(x => x.id === selCuenta);
        if (!c) return 'Selecciona un cliente primero.';
        const health = healthScoresDetalle.find(h => h.cuenta_id === c.id);
        return `📋 RESUMEN FINANCIERO — ${c.nombre_comercial}\n\n💰 Situación actual:\n• Saldo CxC: S/ ${(c.saldo_cxc || 0).toLocaleString()}\n• Días de mora: ${c.dias_mora || 0}\n• Límite de crédito: S/ ${c.limite_credito?.toLocaleString()}\n• Uso del límite: ${c.limite_credito > 0 ? Math.round((c.saldo_cxc / c.limite_credito) * 100) : 0}%\n\n📈 Rentabilidad:\n• Margen acumulado: ${c.margen_acumulado || 'Sin datos'}%\n• Riesgo financiero: ${c.riesgo_financiero}\n• Condición de pago: ${c.condicion_pago}\n\n🏥 Salud del cliente:\n• Health Score: ${health ? health.score_total + ' (' + health.semaforo + ')' : 'Sin datos'}\n• Dimensión financiera: ${health ? health.dimensiones.financiera.score : 'N/A'}/100\n\n💡 Recomendación IA:\n${c.saldo_cxc > c.limite_credito * 0.8 ? '⚠️ Límite de crédito casi agotado — revisar antes de nuevas operaciones.' : '✅ Crédito disponible.'}${c.dias_mora > 30 ? '\n⚠️ Mora mayor a 30 días — gestión de cobranza urgente.' : '\n✅ Comportamiento de pago aceptable.'}`;
      });
    } else if (accion === 'proyeccion_flujo') {
      ejecutar('proyeccion_flujo', () => {
        return `📈 PROYECCIÓN DE FLUJO DE CAJA — Próximas 8 semanas\n\n⚠️ Proyección basada en datos disponibles del ERP (CxC, CxP, compromisos registrados)\n\nCOBROS ESPERADOS:\n• Sem 1 (27 Ene): S/ 0 (sin compromisos registrados)\n• Sem 2 (03 Feb): S/ 18,500 (CxC PIN SRL — compromiso de pago)\n• Sem 3 (10 Feb): S/ 10,214 (OSC-2025-0028 — saldo pendiente FacLima)\n• Sem 4 (17 Feb): S/ 0\n\nPAGOS PROGRAMADOS:\n• Sem 1: S/ 1,250 (CxP Electroandes)\n• Sem 3: S/ 3,500 (OC-25-0104 pendiente)\n\nBALANCE PROYECTADO:\n• Flujo neto estimado: S/ 23,964\n• Semana de mayor riesgo: Sem 1 (salida sin ingreso confirmado)\n\n💡 Recomendación: confirmar compromiso de pago de PIN SRL antes del 31 Ene para mantener flujo positivo.`;
      });
    }
  };

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">IA Financiera</h1><div className="page-sub">Copiloto de administración — análisis inteligente de costos, cobranza y flujo</div></div>
      </div>
      <IaDisclaimer />

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, marginTop: 16 }}>
        <div className="card" style={{ height: 'fit-content' }}>
          <div className="card-head"><h3>Acciones disponibles</h3></div>
          <div style={{ padding: '0 8px 12px' }}>
            {acciones.map(a => (
              <div key={a.key} onClick={() => { setAccion(a.key); limpiar(); }}
                style={{ padding: 12, borderRadius: 8, cursor: 'pointer', marginBottom: 4, background: accion === a.key ? 'var(--surface-hover)' : 'transparent', borderLeft: accion === a.key ? '3px solid var(--cyan)' : '3px solid transparent' }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{a.icon}</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{a.label}</div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>{a.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          {!accion && (
            <div className="card" style={{ padding: 60, textAlign: 'center', background: 'var(--bg-subtle)', borderStyle: 'dashed' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>💹</div>
              <div style={{ fontFamily: 'Sora', fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Selecciona una acción de IA</div>
              <div className="text-muted" style={{ fontSize: 13 }}>El copiloto analiza CxC, costos, márgenes y flujo de caja en tiempo real.</div>
            </div>
          )}

          {accion && (
            <div className="card">
              <div className="card-head"><h3>{acciones.find(a => a.key === accion)?.label}</h3></div>
              <div className="card-body col" style={{ gap: 14 }}>
                {accion === 'resumen_financiero_cliente' && (
                  <div>
                    <label className="text-muted" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Cliente</label>
                    <select className="select" value={selCuenta} onChange={e => setSelCuenta(e.target.value)} style={{ width: '100%' }}>
                      <option value="">Seleccionar cliente...</option>
                      {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre_comercial}</option>)}
                    </select>
                  </div>
                )}
                <button className="btn btn-primary" onClick={ejecutarAccion} disabled={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {loading ? 'Analizando...' : <><span style={{ display: 'flex', width: 14, height: 14 }}>{I.sparkles}</span> Ejecutar análisis IA</>}
                </button>
                <IaResultPanel loading={loading} resultado={resultado} onClear={limpiar} />
              </div>
            </div>
          )}
        </div>
      </div>
      <IaHistorial tipo="financiera" />
    </>
  );
}
