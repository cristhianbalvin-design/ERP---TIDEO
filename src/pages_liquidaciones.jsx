import React, { useMemo, useRef, useState } from 'react';
import { I } from './icons.jsx';
import { useApp } from './context.jsx';
import { FileUpload } from './components/FileUpload.jsx';
import {
  calcularConceptos,
  sugerirFechaUltimoDepositoCTS,
  TIPOS_CESE_LABELS,
} from './services/liquidacionesCeseService.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate  = v => v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—';
const fmtMoney = v => `S/ ${Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const norm     = v => String(v || '').toLowerCase();

const ESTADO_BADGE = {
  borrador:   'badge-gray',
  calculada:  'badge-orange',
  confirmada: 'badge-green',
  anulada:    'badge-red',
};
const ESTADO_LABEL = {
  borrador:   'Borrador',
  calculada:  'Calculada',
  confirmada: 'Confirmada',
  anulada:    'Anulada',
};
const TIPOS_CESE_DESC = {
  renuncia_voluntaria:  'El trabajador decide retirarse',
  despido_arbitrario:   'La empresa decide sin causa justificada — genera indemnización',
  despido_falta_grave:  'Despido justificado por falta grave - no genera indemnizacion',
  mutuo_acuerdo:        'Ambas partes acuerdan el cese',
  vencimiento_contrato: 'Fin del plazo pactado en el contrato',
  fallecimiento:        'Se liquida a los herederos o beneficiarios',
};
const CONCEPTO_NOMBRE = {
  remuneracion_pendiente:   'Remuneración pendiente',
  vacaciones_truncas:       'Vacaciones truncas',
  cts_proporcional:         'CTS proporcional',
  gratificacion_proporcional: 'Gratificación proporcional',
  indemnizacion:            'Indemnización por despido arbitrario',
  otros:                    'Otros conceptos',
};
const REGIMEN_LABEL = {
  general:       'Régimen General',
  pequena_empresa: 'Pequeña Empresa',
  mype_pequena:  'Pequeña Empresa',
  microempresa:  'Microempresa',
};

const DISCLAIMER = 'Los montos son referenciales. Valida con tu asesor legal o contador antes de procesar el pago.';

// ─── Tarjeta de concepto ──────────────────────────────────────────────────────

function ConceptoRow({ concepto }) {
  return (
    <div style={{
      border: '1px solid var(--border-subtle)',
      borderRadius: 8,
      padding: '12px 16px',
      background: concepto.aplica ? 'var(--bg)' : 'var(--bg-subtle)',
      opacity: concepto.aplica ? 1 : 0.7,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{CONCEPTO_NOMBRE[concepto.concepto] || concepto.concepto}</span>
            {concepto.aplica
              ? <span className="badge badge-green" style={{ fontSize: 10 }}>Aplica</span>
              : <span className="badge badge-gray"  style={{ fontSize: 10 }}>No aplica</span>}
          </div>
          <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
            {concepto.aplica ? concepto.descripcion_calculo : (concepto.motivo_no_aplica || 'No aplica para este tipo de cese')}
          </div>
        </div>
        <div style={{ fontWeight: 800, fontSize: 15, fontVariantNumeric: 'tabular-nums', color: concepto.aplica ? 'var(--fg)' : 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
          {concepto.aplica ? fmtMoney(concepto.monto) : '—'}
        </div>
      </div>
    </div>
  );
}

// ─── Selección de persona ─────────────────────────────────────────────────────

function PersonaSelector({ value, onChange, personalOperativo = [], personalAdmin = [], liquidacionesCese = [] }) {
  const [query, setQuery] = useState('');

  const activosIds = new Set(
    liquidacionesCese
      .filter(l => l.estado !== 'anulada')
      .map(l => l.personal_id)
  );

  const opciones = useMemo(() => {
    const ops = [
      ...personalOperativo.filter(p => !['inactivo','cesado','baja'].includes(norm(p.estado)) && norm(p.estado_laboral) !== 'cesado')
        .map(p => ({ ...p, _tipo: 'operativo', _label: `${p.nombre} — ${p.cargo || 'Operativo'} (${p.area || ''})` })),
      ...personalAdmin.filter(p => !['inactivo','cesado','baja'].includes(norm(p.estado)) && norm(p.estado_laboral) !== 'cesado')
        .map(p => ({ ...p, _tipo: 'administrativo', _label: `${p.nombre} — ${p.cargo || 'Administrativo'} (${p.area || ''})` })),
    ];
    const q = norm(query);
    return q ? ops.filter(p => norm(p._label).includes(q) || norm(p.dni || '').includes(q)) : ops;
  }, [personalOperativo, personalAdmin, query]);

  return (
    <div>
      <input
        className="input"
        placeholder="Buscar por nombre, cargo o área…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
        {opciones.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
            No hay personal activo disponible
          </div>
        )}
        {opciones.map(p => {
          const tieneActiva = activosIds.has(p.id);
          const isSelected  = value?.id === p.id;
          return (
            <div
              key={p.id}
              onClick={() => !tieneActiva && onChange(p)}
              style={{
                padding: '10px 14px',
                cursor: tieneActiva ? 'not-allowed' : 'pointer',
                background: isSelected ? 'var(--primary-subtle)' : 'transparent',
                borderBottom: '1px solid var(--border-subtle)',
                opacity: tieneActiva ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.nombre}</div>
                <div className="text-muted" style={{ fontSize: 11 }}>
                  {p.cargo || p._tipo} · {p.area || ''} · {p._tipo === 'operativo' ? 'Operativo' : 'Administrativo'}
                </div>
              </div>
              {tieneActiva && <span className="badge badge-orange" style={{ fontSize: 10 }}>Liquidación activa</span>}
              {isSelected   && <span className="badge badge-cyan"  style={{ fontSize: 10 }}>Seleccionado</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Wizard de creación ───────────────────────────────────────────────────────

function WizardLiquidacion({ onClose, onCreated }) {
  const {
    empresa, empresaConfig, personalOperativo, personalAdmin,
    liquidacionesCese, authUser, addToast, navigate,
    crearLiquidacionCtx, confirmarLiquidacionCtx,
  } = useApp();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // Paso 1
  const [persona,   setPersona]   = useState(null);
  const [tipoCese,  setTipoCese]  = useState('');
  const [fechaCese, setFechaCese] = useState('');
  const [benefNombre, setBenefNombre] = useState('');
  const [benefDni,    setBenefDni]    = useState('');
  const [motivoFaltaGrave, setMotivoFaltaGrave] = useState('');
  const evidenciaRef = useRef(null);
  const evidenciaEntityId = useRef(`liq_cese_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  // Paso 2 — parámetros ajustables
  const [asigFam,   setAsigFam]   = useState(0);
  const [ultGrat,   setUltGrat]   = useState(0);
  const [diasVac,   setDiasVac]   = useState(0);
  const [fechaDep,  setFechaDep]  = useState('');
  const [calculo,   setCalculo]   = useState(null);

  // Paso 3
  const [obs,       setObs]       = useState('');
  const [checked,   setChecked]   = useState(false);

  const regimen = empresaConfig?.regimen_laboral_empresa || 'general';
  const moneda  = 'PEN'; // La liquidación siempre se calcula en Soles en la interfaz actual

  // fecha_ingreso es la única fecha de la ficha que usa Liquidación — las fechas de contrato viven en personal_documentos.
  const fechaIngreso = persona?.fecha_ingreso || '';
  const sueldoBase   = Number(persona?.sueldo_base || persona?.remuneracion || 0);

  // Calcular al ir a paso 2
  const irAPaso2 = () => {
    setError('');
    if (!persona)   return setError('Selecciona un colaborador.');
    if (!tipoCese)  return setError('Selecciona el tipo de cese.');
    if (!fechaCese) return setError('Ingresa la fecha de cese.');
    if (fechaIngreso && fechaCese < fechaIngreso) return setError('La fecha de cese no puede ser anterior a la fecha de ingreso.');
    if (!fechaIngreso) return setError('El colaborador no tiene fecha de ingreso registrada. Actualiza su ficha en RRHH primero.');
    if (tipoCese === 'fallecimiento' && (!benefNombre.trim() || !benefDni.trim())) return setError('Ingresa nombre y DNI del beneficiario.');
    if (tipoCese === 'despido_falta_grave' && !motivoFaltaGrave.trim()) return setError('Ingresa el motivo especifico de la falta grave.');

    const fdep = sugerirFechaUltimoDepositoCTS(fechaCese);
    setFechaDep(fdep);

    const resultado = calcularConceptos({
      fechaIngreso, fechaCese, sueldoBase,
      asignacionFamiliar: asigFam, ultimaGratificacionMensual: ultGrat,
      regimen, tipoCese, diasVacacionesGozadas: diasVac, fechaUltimoDepositoCTS: fdep,
    });
    setCalculo(resultado);
    setStep(2);
  };

  const recalcular = () => {
    const resultado = calcularConceptos({
      fechaIngreso, fechaCese, sueldoBase,
      asignacionFamiliar: Number(asigFam) || 0,
      ultimaGratificacionMensual: Number(ultGrat) || 0,
      regimen, tipoCese,
      diasVacacionesGozadas: Number(diasVac) || 0,
      fechaUltimoDepositoCTS: fechaDep || sugerirFechaUltimoDepositoCTS(fechaCese),
    });
    setCalculo(resultado);
  };

  const confirmar = async () => {
    if (!checked) return setError('Debes marcar la casilla de confirmación.');
    if (!obs.trim()) return setError('El campo de observaciones es obligatorio.');
    setLoading(true);
    setError('');
    try {
      const evidenciaAdjuntos = tipoCese === 'despido_falta_grave'
        ? await (evidenciaRef.current?.uploadPendingFiles?.() || Promise.resolve([]))
        : [];
      const evidenciaUrl = evidenciaAdjuntos[0]?.url || evidenciaAdjuntos[0]?.storage_path || evidenciaAdjuntos[0]?.path || null;
      const payload = {
        personal_id:      persona.id,
        personal_nombre:  persona.nombre,
        personal_tipo:    persona._tipo,
        tipo_cese:        tipoCese,
        fecha_cese:       fechaCese,
        fecha_ingreso:    fechaIngreso,
        beneficiario_nombre: benefNombre || null,
        beneficiario_dni:    benefDni    || null,
        motivo_falta_grave:  tipoCese === 'despido_falta_grave' ? motivoFaltaGrave.trim() : null,
        evidencia_url:       evidenciaUrl,
        parametros: {
          fechaIngreso, fechaCese, sueldoBase,
          asignacionFamiliar: Number(asigFam) || 0,
          ultimaGratificacionMensual: Number(ultGrat) || 0,
          regimen, tipoCese,
          diasVacacionesGozadas: Number(diasVac) || 0,
          fechaUltimoDepositoCTS: fechaDep || sugerirFechaUltimoDepositoCTS(fechaCese),
        },
      };
      const { liquidacion } = await crearLiquidacionCtx(payload);
      const { cxp } = await confirmarLiquidacionCtx(liquidacion.id, { observaciones: obs, moneda });
      addToast(
        `Liquidación confirmada. CxP generada por ${fmtMoney(liquidacion.monto_total)} y acceso al sistema bloqueado.`,
        'success',
        { modulo: 'cxp', label: 'Ver CxP' }
      );
      onCreated();
    } catch (err) {
      setError(err.message || 'Error al confirmar la liquidación.');
    } finally {
      setLoading(false);
    }
  };

  const pasos = ['Datos del cese', 'Revisión del cálculo', 'Confirmación'];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'var(--bg)', borderRadius: 16, width: '100%', maxWidth: 720,
        maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="eyebrow">Nueva liquidación</div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Liquidación por Cese</div>
          </div>
          <button className="icon-btn" style={{ color: 'var(--fg-muted)' }} onClick={onClose}>{I.x}</button>
        </div>

        {/* Stepper */}
        <div style={{ display: 'flex', padding: '16px 24px', gap: 0, borderBottom: '1px solid var(--border-subtle)' }}>
          {pasos.map((p, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 999, flexShrink: 0,
                background: step > i + 1 ? 'var(--green)' : step === i + 1 ? 'var(--primary)' : 'var(--bg-subtle)',
                color: step >= i + 1 ? '#fff' : 'var(--fg-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800,
              }}>
                {step > i + 1 ? I.check : i + 1}
              </div>
              <span style={{ marginLeft: 8, fontSize: 12, fontWeight: step === i + 1 ? 700 : 400, color: step === i + 1 ? 'var(--fg)' : 'var(--fg-muted)' }}>
                {p}
              </span>
              {i < pasos.length - 1 && <div style={{ flex: 1, height: 1, background: 'var(--border)', margin: '0 12px' }} />}
            </div>
          ))}
        </div>

        {/* Contenido */}
        <div style={{ padding: '24px' }}>
          {error && <div className="badge badge-red" style={{ marginBottom: 16, display: 'block', padding: '8px 12px', fontSize: 13, borderRadius: 8 }}>{error}</div>}

          {/* ── Paso 1 ──────────────────────────────────────────────────────────── */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label className="label">Colaborador</label>
                <PersonaSelector
                  value={persona}
                  onChange={p => { setPersona(p); setAsigFam(0); setUltGrat(0); }}
                  personalOperativo={personalOperativo}
                  personalAdmin={personalAdmin}
                  liquidacionesCese={liquidacionesCese}
                />
              </div>

              {persona && (
                <>
                  <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 12 }}>
                    <span className="text-muted">Cargo</span>         <strong>{persona.cargo || '—'}</strong>
                    <span className="text-muted">Área</span>          <strong>{persona.area || '—'}</strong>
                    <span className="text-muted">Fecha de ingreso</span> <strong>{fmtDate(fechaIngreso) || <span style={{color:'var(--danger)'}}>No registrada</span>}</strong>
                    <span className="text-muted">Sueldo base</span>   <strong>{fmtMoney(sueldoBase)}</strong>
                    <span className="text-muted">Tipo</span>          <strong>{persona._tipo === 'operativo' ? 'Operativo' : 'Administrativo'}</strong>
                  </div>
                  <div className="alert alert-warning" style={{ fontSize: 13 }}>
                    ⚠️ Al crear esta liquidación, el acceso del colaborador al sistema será bloqueado automáticamente. Esta acción es reversible solo si la liquidación es anulada.
                  </div>
                </>
              )}

              <div>
                <label className="label">Tipo de cese</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(TIPOS_CESE_LABELS).map(([key, label]) => (
                    <label key={key} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '10px 14px', border: `2px solid ${tipoCese === key ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 8, cursor: 'pointer', background: tipoCese === key ? 'var(--primary-subtle)' : 'transparent',
                    }}>
                      <input type="radio" name="tipo_cese" value={key} checked={tipoCese === key} onChange={() => setTipoCese(key)} style={{ marginTop: 2 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{label}</div>
                        <div className="text-muted" style={{ fontSize: 12 }}>{TIPOS_CESE_DESC[key]}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Fecha de cese</label>
                <input
                  type="date"
                  className="input"
                  value={fechaCese}
                  min={fechaIngreso || undefined}
                  onChange={e => setFechaCese(e.target.value)}
                />
              </div>

              {tipoCese === 'fallecimiento' && (
                <div style={{ background: 'var(--bg-subtle)', padding: 16, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="eyebrow" style={{ color: 'var(--fg-muted)' }}>Datos del beneficiario</div>
                  <div>
                    <label className="label">Nombre del beneficiario</label>
                    <input className="input" value={benefNombre} onChange={e => setBenefNombre(e.target.value)} placeholder="Nombre completo del beneficiario" />
                  </div>
                  <div>
                    <label className="label">DNI del beneficiario</label>
                    <input className="input" value={benefDni} onChange={e => setBenefDni(e.target.value)} placeholder="00000000" maxLength={8} />
                  </div>
                </div>
              )}

              {tipoCese === 'despido_falta_grave' && (
                <div style={{ background: 'var(--bg-subtle)', padding: 16, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="alert alert-warning" style={{fontSize:13}}>
                    Este tipo de cese activara automaticamente el flag "No recontratar" en la ficha del colaborador.
                  </div>
                  <div>
                    <label className="label">Motivo especifico *</label>
                    <textarea
                      className="input"
                      rows={4}
                      value={motivoFaltaGrave}
                      onChange={e => setMotivoFaltaGrave(e.target.value)}
                      placeholder="Ej: robo de materiales, inasistencias reiteradas, incumplimiento del reglamento interno..."
                    />
                  </div>
                  <div>
                    <label className="label">Evidencia documental</label>
                    <div className="text-muted" style={{fontSize:12, marginBottom:8}}>Opcional pero recomendado para sustentar el cese.</div>
                    <FileUpload
                      ref={evidenciaRef}
                      entidadTipo="liquidaciones_cese"
                      entidadId={evidenciaEntityId.current}
                      empresaId={empresa?.id}
                      categoria="evidencia_falta_grave"
                      deferUpload
                      descripcion="Evidencia documental de despido por falta grave"
                      subidoPor={authUser?.id || null}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Paso 2 ──────────────────────────────────────────────────────────── */}
          {step === 2 && calculo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Aviso */}
              <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#92400e' }}>
                <strong>⚠️ Revisa cada concepto antes de confirmar.</strong> Una vez confirmada, la liquidación genera una CxP y no puede editarse — solo anularse.
              </div>

              {/* Disclaimer */}
              <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--fg-muted)', fontStyle: 'italic', borderLeft: '3px solid var(--border)' }}>
                {DISCLAIMER}
              </div>

              {/* Parámetros ajustables */}
              <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Parámetros del cálculo</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="label" style={{ fontSize: 11 }}>Asignación familiar (S/)</label>
                    <input type="number" className="input" min={0} value={asigFam} onChange={e => setAsigFam(e.target.value)} />
                  </div>
                  <div>
                    <label className="label" style={{ fontSize: 11 }}>Última gratif. mensual equiv. (S/)</label>
                    <input type="number" className="input" min={0} value={ultGrat} onChange={e => setUltGrat(e.target.value)} />
                  </div>
                  <div>
                    <label className="label" style={{ fontSize: 11 }}>Días vacaciones gozadas (año en curso)</label>
                    <input type="number" className="input" min={0} value={diasVac} onChange={e => setDiasVac(e.target.value)} />
                  </div>
                  <div>
                    <label className="label" style={{ fontSize: 11 }}>Fecha último depósito CTS</label>
                    <input type="date" className="input" value={fechaDep} onChange={e => setFechaDep(e.target.value)} />
                  </div>
                </div>
                <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={recalcular}>
                  {I.refresh || '↻'} Recalcular
                </button>
              </div>

              {/* Info de tiempo de servicio */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {[
                  { label: 'Tiempo de servicio', value: `${calculo.anios}a ${calculo.meses}m ${calculo.dias}d` },
                  { label: 'Rem. computable', value: fmtMoney(calculo.remComputable) },
                  { label: 'Régimen', value: REGIMEN_LABEL[regimen] || regimen },
                ].map(({ label, value }) => (
                  <div key={label} style={{ flex: 1, minWidth: 140, background: 'var(--bg-subtle)', borderRadius: 8, padding: '10px 14px' }}>
                    <div className="text-muted" style={{ fontSize: 11 }}>{label}</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Conceptos */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {calculo.conceptos.map((c, i) => <ConceptoRow key={i} concepto={c} />)}
              </div>

              {/* Total */}
              <div style={{ background: 'var(--primary)', borderRadius: 10, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Total liquidación</span>
                <span style={{ color: '#fff', fontWeight: 900, fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(calculo.montoTotal)}</span>
              </div>
            </div>
          )}

          {/* ── Paso 3 ──────────────────────────────────────────────────────────── */}
          {step === 3 && calculo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Resumen */}
              <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Resumen de la liquidación</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 13 }}>
                  <span className="text-muted">Colaborador</span>     <strong>{persona?.nombre}</strong>
                  <span className="text-muted">Tipo de cese</span>    <strong>{TIPOS_CESE_LABELS[tipoCese]}</strong>
                  <span className="text-muted">Fecha de ingreso</span><strong>{fmtDate(fechaIngreso)}</strong>
                  <span className="text-muted">Fecha de cese</span>   <strong>{fmtDate(fechaCese)}</strong>
                  <span className="text-muted">Tiempo de servicio</span><strong>{calculo.anios}a {calculo.meses}m {calculo.dias}d</strong>
                  {tipoCese === 'fallecimiento' && <>
                    <span className="text-muted">Beneficiario</span>  <strong>{benefNombre} — {benefDni}</strong>
                  </>}
                </div>
              </div>

              {/* Conceptos que aplican */}
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Conceptos que aplican</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {calculo.conceptos.filter(c => c.aplica).map((c, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 6, fontSize: 13 }}>
                      <span>{CONCEPTO_NOMBRE[c.concepto] || c.concepto}</span>
                      <strong>{fmtMoney(c.monto)}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: 'var(--primary)', borderRadius: 10, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#fff', fontWeight: 700 }}>Total a pagar</span>
                <span style={{ color: '#fff', fontWeight: 900, fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(calculo.montoTotal)}</span>
              </div>

              <div>
                <label className="label">Observaciones / motivo adicional *</label>
                <textarea className="input" rows={3} value={obs} onChange={e => setObs(e.target.value)} placeholder="Describe el contexto, acuerdos o información relevante para el registro interno." />
              </div>

              <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: '12px 16px', fontSize: 12, fontStyle: 'italic', color: 'var(--fg-muted)', borderLeft: '3px solid var(--border)' }}>
                {DISCLAIMER}
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
                <span style={{ fontSize: 13, lineHeight: 1.5 }}>
                  He revisado los montos con el área contable o legal y confirmo la liquidación. Entiendo que esta acción marca al colaborador como cesado y genera una CxP en estado pendiente.
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <button className="btn" onClick={step === 1 ? onClose : () => setStep(s => s - 1)}>
            {step === 1 ? 'Cancelar' : '← Anterior'}
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            {step < 3 && (
              <button className="btn btn-primary" onClick={step === 1 ? irAPaso2 : () => setStep(3)}>
                Siguiente →
              </button>
            )}
            {step === 3 && (
              <button className="btn btn-primary" onClick={confirmar} disabled={loading}>
                {loading ? 'Procesando…' : 'Confirmar liquidación'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de anulación ───────────────────────────────────────────────────────

function ModalAnular({ liquidacion, onClose, onAnulada }) {
  const { anularLiquidacionCtx } = useApp();
  const [motivo,  setMotivo]  = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const anular = async () => {
    if (!motivo.trim()) return setError('El motivo es obligatorio.');
    setLoading(true);
    try {
      await anularLiquidacionCtx(liquidacion.id, motivo);
      onAnulada();
    } catch (err) {
      setError(err.message || 'Error al anular.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 480, boxShadow: '0 16px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Anular liquidación</div>
        <div style={{ color: 'var(--fg-muted)', fontSize: 13, marginBottom: 16 }}>
          Se anulará la liquidación de <strong>{liquidacion.personal_nombre}</strong>.
          {liquidacion.estado === 'confirmada' && ' El colaborador volverá a estado activo y la CxP asociada quedará anulada.'}
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <label className="label">Motivo de anulación *</label>
        <textarea className="input" rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Describe el motivo de la anulación." />
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn" style={{ background: 'var(--danger)', color: '#fff' }} onClick={anular} disabled={loading}>
            {loading ? 'Anulando…' : 'Confirmar anulación'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detalle de liquidación ───────────────────────────────────────────────────

function DetalleLiquidacion({ liquidacion, conceptos, onClose }) {
  const { navigate, confirmarLiquidacionCtx, empresa, addToast } = useApp();
  const [anularOpen,  setAnularOpen]  = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [cerrado,     setCerrado]     = useState(false);
  const misConceptos = conceptos.filter(c => c.liquidacion_id === liquidacion.id).sort((a, b) => a.orden - b.orden);

  const confirmar = async () => {
    setLoading(true);
    try {
      await confirmarLiquidacionCtx(liquidacion.id, { moneda: 'PEN' });
      addToast('Liquidación confirmada. CxP generada y acceso al sistema bloqueado.', 'success', { modulo: 'cxp', label: 'Ver CxP' });
      onClose();
    } catch (err) {
      addToast(err.message || 'Error al confirmar.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ background: 'var(--bg)', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>
          {/* Header */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{liquidacion.personal_nombre}</div>
                <span className={`badge ${ESTADO_BADGE[liquidacion.estado] || 'badge-gray'}`}>{ESTADO_LABEL[liquidacion.estado]}</span>
                <span className="badge badge-gray">{TIPOS_CESE_LABELS[liquidacion.tipo_cese]}</span>
              </div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                {fmtDate(liquidacion.fecha_ingreso)} → {fmtDate(liquidacion.fecha_cese)} · {liquidacion.anios_servicio}a {liquidacion.meses_servicio}m {liquidacion.dias_servicio}d de servicio
              </div>
            </div>
            <button className="icon-btn" style={{ color: 'var(--fg-muted)' }} onClick={onClose}>{I.x}</button>
          </div>

          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Disclaimer */}
            <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--fg-muted)', fontStyle: 'italic', borderLeft: '3px solid var(--border)' }}>
              {DISCLAIMER}
            </div>

            {/* Info general */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 13, background: 'var(--bg-subtle)', padding: 14, borderRadius: 8 }}>
              <span className="text-muted">Tipo de personal</span> <strong>{liquidacion.personal_tipo === 'operativo' ? 'Operativo' : 'Administrativo'}</strong>
              <span className="text-muted">Rem. computable</span>  <strong>{fmtMoney(liquidacion.remuneracion_computable)}</strong>
              {liquidacion.beneficiario_nombre && <>
                <span className="text-muted">Beneficiario</span>   <strong>{liquidacion.beneficiario_nombre} — {liquidacion.beneficiario_dni}</strong>
              </>}
            </div>

            {/* Conceptos */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Detalle de conceptos</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {misConceptos.map((c, i) => <ConceptoRow key={i} concepto={c} />)}
              </div>
            </div>

            {/* Total */}
            <div style={{ background: 'var(--primary)', borderRadius: 10, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Total liquidación</span>
              <span style={{ color: '#fff', fontWeight: 900, fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(liquidacion.monto_total)}</span>
            </div>

            {/* Trazabilidad */}
            <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: 16, fontSize: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Trazabilidad</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
                <span className="text-muted">Estado</span>          <strong><span className={`badge ${ESTADO_BADGE[liquidacion.estado]}`}>{ESTADO_LABEL[liquidacion.estado]}</span></strong>
                <span className="text-muted">Creado</span>          <strong>{fmtDate(liquidacion.created_at)}</strong>
                {liquidacion.confirmado_en && <><span className="text-muted">Confirmado</span> <strong>{fmtDate(liquidacion.confirmado_en)}</strong></>}
                {liquidacion.anulado_en    && <><span className="text-muted">Anulado</span>    <strong>{fmtDate(liquidacion.anulado_en)}</strong></>}
                {liquidacion.motivo_falta_grave && <><span className="text-muted">Motivo falta grave</span> <strong style={{ whiteSpace: 'pre-wrap' }}>{liquidacion.motivo_falta_grave}</strong></>}
                {liquidacion.evidencia_url && <><span className="text-muted">Evidencia</span> <strong><a href={liquidacion.evidencia_url} target="_blank" rel="noreferrer">Ver evidencia</a></strong></>}
                {liquidacion.observaciones && <><span className="text-muted">Observaciones</span> <strong style={{ whiteSpace: 'pre-wrap' }}>{liquidacion.observaciones}</strong></>}
                {liquidacion.motivo_anulacion && <><span className="text-muted">Motivo anulación</span> <strong style={{ color: 'var(--danger)' }}>{liquidacion.motivo_anulacion}</strong></>}
              </div>
              {liquidacion.cxp_id && (
                <button
                  className="btn btn-sm"
                  style={{ marginTop: 10 }}
                  onClick={() => { navigate('cxp'); onClose(); }}
                >
                  {I.dollar} Ver CxP generada
                </button>
              )}
            </div>
          </div>

          {/* Acciones */}
          {liquidacion.estado !== 'anulada' && (
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="btn"
                style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                onClick={() => setAnularOpen(true)}
              >
                Anular
              </button>
              {['borrador','calculada'].includes(liquidacion.estado) && (
                <button className="btn btn-primary" onClick={confirmar} disabled={loading}>
                  {loading ? 'Procesando…' : 'Confirmar liquidación'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {anularOpen && (
        <ModalAnular
          liquidacion={liquidacion}
          onClose={() => setAnularOpen(false)}
          onAnulada={() => { setAnularOpen(false); onClose(); }}
        />
      )}
    </>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export function LiquidacionesCese() {
  const {
    liquidacionesCese    = [],
    liquidacionesConceptos = [],
    role,
    navigate,
  } = useApp();

  const [wizardOpen,    setWizardOpen]    = useState(false);
  const [detalle,       setDetalle]       = useState(null);
  const [filtroEstado,  setFiltroEstado]  = useState('');
  const [filtroTipo,    setFiltroTipo]    = useState('');
  const [filtroPeriodo, setFiltroPeriodo] = useState('');

  const puedeGestionar = role?.permisos?.todo ||
    (role?.permisos?.crear || []).includes('liquidaciones_cese') ||
    (role?.permisos?.editar || []).includes('liquidaciones_cese');

  // KPIs
  const anioActual = new Date().getFullYear();
  const liqAnio    = liquidacionesCese.filter(l => String(l.fecha_cese || '').startsWith(anioActual));
  const montoAnio  = liqAnio.filter(l => l.estado === 'confirmada').reduce((s, l) => s + Number(l.monto_total || 0), 0);
  const pendientes = liquidacionesCese.filter(l => ['borrador','calculada'].includes(l.estado)).length;

  // Lista filtrada
  const filtered = useMemo(() => {
    return liquidacionesCese
      .filter(l => {
        if (filtroEstado  && l.estado    !== filtroEstado)  return false;
        if (filtroTipo    && l.tipo_cese !== filtroTipo)    return false;
        if (filtroPeriodo && !String(l.fecha_cese || '').startsWith(filtroPeriodo)) return false;
        return true;
      })
      .slice(0, 200);
  }, [liquidacionesCese, filtroEstado, filtroTipo, filtroPeriodo]);

  const periodos = useMemo(() => {
    const years = new Set(liquidacionesCese.map(l => String(l.fecha_cese || '').slice(0, 4)).filter(Boolean));
    return [...years].sort().reverse();
  }, [liquidacionesCese]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {[
          { label: 'Liquidaciones del año', value: liqAnio.length, sub: `${anioActual}` },
          { label: 'Monto total pagado', value: fmtMoney(montoAnio), sub: 'Solo confirmadas' },
          { label: 'Pendientes de confirmar', value: pendientes, sub: 'Borrador o calculada', alert: pendientes > 0 },
        ].map(({ label, value, sub, alert }) => (
          <div key={label} className="card" style={{ padding: '14px 18px' }}>
            <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>{label}</div>
            <div style={{ fontWeight: 800, fontSize: 22, color: alert ? 'var(--warning)' : 'var(--fg)' }}>{value}</div>
            <div className="text-muted" style={{ fontSize: 11 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="eyebrow" style={{ flex: 1 }}>Liquidaciones por cese</div>

        <select className="input" style={{ width: 'auto' }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select className="input" style={{ width: 'auto' }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS_CESE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select className="input" style={{ width: 'auto' }} value={filtroPeriodo} onChange={e => setFiltroPeriodo(e.target.value)}>
          <option value="">Todos los períodos</option>
          {periodos.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {puedeGestionar && (
          <button className="btn btn-primary" onClick={() => setWizardOpen(true)}>
            + Nueva liquidación
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              {['Colaborador','Tipo de cese','Fecha cese','Años servicio','Monto total','Estado','CxP'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: 'var(--fg-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--fg-muted)' }}>
                  {liquidacionesCese.length === 0 ? 'No hay liquidaciones registradas. Crea la primera con "+ Nueva liquidación".' : 'Sin resultados para los filtros aplicados.'}
                </td>
              </tr>
            )}
            {filtered.map(l => (
              <tr
                key={l.id}
                style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', transition: 'background 0.15s' }}
                onClick={() => setDetalle(l)}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-subtle)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                  {l.personal_nombre}
                  <div className="text-muted" style={{ fontSize: 11, fontWeight: 400 }}>{l.personal_tipo === 'operativo' ? 'Operativo' : 'Administrativo'}</div>
                </td>
                <td style={{ padding: '10px 14px' }}>{TIPOS_CESE_LABELS[l.tipo_cese] || l.tipo_cese}</td>
                <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums' }}>{fmtDate(l.fecha_cese)}</td>
                <td style={{ padding: '10px 14px' }}>{l.anios_servicio}a {l.meses_servicio}m</td>
                <td style={{ padding: '10px 14px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(l.monto_total)}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span className={`badge ${ESTADO_BADGE[l.estado] || 'badge-gray'}`}>{ESTADO_LABEL[l.estado] || l.estado}</span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {l.cxp_id
                    ? <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={e => { e.stopPropagation(); navigate('cxp'); }}>Ver CxP</button>
                    : <span className="text-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Wizard */}
      {wizardOpen && (
        <WizardLiquidacion
          onClose={() => setWizardOpen(false)}
          onCreated={() => setWizardOpen(false)}
        />
      )}

      {/* Detalle */}
      {detalle && (
        <DetalleLiquidacion
          liquidacion={detalle}
          conceptos={liquidacionesConceptos}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}
