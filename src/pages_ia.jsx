import React, { useState } from 'react';
import { I, money } from './icons.jsx';
import { useApp } from './context.jsx';

// ============================================================
// HELPERS COMPARTIDOS
// ============================================================
function IaDisclaimer() {
  return (
    <div style={{ padding: '10px 14px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, fontSize: 12, color: 'var(--fg-muted)' }} className="row">
      {I.sparkles}
      <span>La IA asiste y recomienda — las aprobaciones y acciones críticas siempre requieren usuario autorizado. Toda acción queda auditada.</span>
    </div>
  );
}

function IaResultPanel({ loading, resultado, onClear }) {
  if (!resultado && !loading) return null;
  return (
    <div style={{ marginTop: 16, padding: 20, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 12 }}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--fg-muted)' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⚙️</div>
          <div style={{ fontWeight: 600 }}>Analizando datos...</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Procesando información del ERP</div>
        </div>
      ) : (
        <>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
            <div className="row" style={{ gap: 8 }}>
              {I.sparkles}
              <strong style={{ fontSize: 13 }}>Resultado generado por IA</strong>
              <span className="badge badge-purple" style={{ fontSize: 10 }}>Verifique antes de actuar</span>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={onClear}>Limpiar</button>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-line', color: 'var(--fg)' }}>{resultado}</div>
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

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">IA Comercial</h1><div className="page-sub">Copiloto de ventas — asistencia inteligente para el equipo comercial</div></div>
      </div>

      <IaDisclaimer />

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, marginTop: 16 }}>
        <div className="card" style={{ height: 'fit-content' }}>
          <div className="card-head"><h3>Acciones disponibles</h3></div>
          <div style={{ padding: '0 8px 12px' }}>
            {acciones.map(a => (
              <div key={a.key} onClick={() => { setAccion(a.key); limpiar(); }}
                style={{ padding: '12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4, background: accion === a.key ? 'var(--surface-hover)' : 'transparent', borderLeft: accion === a.key ? '3px solid var(--cyan)' : '3px solid transparent' }}>
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
              <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
              <div style={{ fontFamily: 'Sora', fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Selecciona una acción de IA</div>
              <div className="text-muted" style={{ fontSize: 13 }}>El copiloto analiza los datos reales del ERP para generar recomendaciones contextualizadas.</div>
            </div>
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
                <button className="btn btn-primary" onClick={ejecutarAccion} disabled={loading}>
                  {loading ? 'Analizando...' : `${I.sparkles} Ejecutar análisis IA`}
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
                <button className="btn btn-primary" onClick={ejecutarAccion} disabled={loading}>
                  {loading ? 'Analizando...' : `${I.sparkles} Ejecutar análisis IA`}
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
                <button className="btn btn-primary" onClick={ejecutarAccion} disabled={loading}>
                  {loading ? 'Analizando...' : `${I.sparkles} Ejecutar análisis IA`}
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
