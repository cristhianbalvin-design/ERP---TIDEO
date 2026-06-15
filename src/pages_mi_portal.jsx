import React, { useMemo, useState } from 'react';
import { I } from './icons.jsx';
import { useApp } from './context.jsx';
import { construirAutoservicioLocal } from './services/autoservicioEmpleadoService.js';
import { isSupabaseConfigured } from './lib/supabaseClient.js';
import { autoservicioEmpleadoService } from './services/autoservicioEmpleadoService.js';

const minToHours = min => `${Math.round(Number(min || 0) / 60 * 10) / 10} h`;
const estadoContratoLabel = c => c?.estado === 'por_vencer' ? `Por vencer (${c.dias} dias)` : c?.estado || 'Sin contrato';
const money = n => `S/ ${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const campoLabels = {
  telefono_personal: 'Telefono personal',
  celular_personal: 'Celular personal (WhatsApp)',
  email_personal: 'Email personal',
  direccion: 'Direccion',
  contacto_emergencia: 'Contacto de emergencia',
  datos_bancarios: 'Datos bancarios',
};

const campoValor = (value) => {
  if (value == null || value === '') return '-';
  if (typeof value === 'object') return Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(' · ');
  return String(value);
};

function EmptyPortal() {
  return (
    <div className="card" style={{ padding: 28, textAlign: 'center' }}>
      <div style={{ width: 48, height: 48, margin: '0 auto 12px', color: 'var(--cyan)' }}>{I.userCheck}</div>
      <h2 className="font-display" style={{ margin: 0 }}>Sin ficha vinculada</h2>
      <p className="text-muted" style={{ marginTop: 8 }}>Tu usuario aun no esta asociado a una ficha de Personal Operativo o Administrativo.</p>
    </div>
  );
}

function PortalResumen({ data, onEvaluaciones }) {
  const cards = [
    { label: 'Contrato', value: estadoContratoLabel(data.resumen?.contrato), icon: I.file, badge: data.resumen?.contrato?.estado },
    { label: 'Ultima boleta', value: data.resumen?.ultima_boleta?.periodo || 'Sin boletas', icon: I.receipt },
    { label: 'Vacaciones', value: `${data.resumen?.vacaciones || 0} dias`, icon: I.calendar },
    { label: 'HE pendiente', value: minToHours(data.resumen?.he_pendiente_minutos), icon: I.clock },
  ];
  return (
    <>
      {data.evaluacionesPendientes?.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 14, borderColor: 'var(--orange)' }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
            <div>
              <strong>Autoevaluacion pendiente</strong>
              <div className="text-muted" style={{ fontSize: 12 }}>{data.evaluacionesPendientes[0].plantilla?.nombre || 'Evaluacion de desempeno'} espera tu respuesta.</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={onEvaluaciones}>Responder</button>
          </div>
        </div>
      )}
      <div className="grid cols-4">
        {cards.map(c => (
          <div className="card" key={c.label} style={{ padding: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="text-muted" style={{ fontSize: 12 }}>{c.label}</div>
              <span style={{ width: 18, height: 18, color: 'var(--cyan)' }}>{c.icon}</span>
            </div>
            <div className="font-display" style={{ fontWeight: 800, fontSize: 20, marginTop: 8 }}>{c.value}</div>
            {c.badge && <span className={'badge ' + (c.badge === 'vencido' ? 'badge-red' : c.badge === 'por_vencer' ? 'badge-orange' : 'badge-green')} style={{ marginTop: 8 }}>{c.badge}</span>}
          </div>
        ))}
        {data.resumen?.ciclo_minero && (
          <div className="card" style={{ padding: 16 }}>
            <div className="text-muted" style={{ fontSize: 12 }}>Ciclo minero</div>
            <div className="font-display" style={{ fontWeight: 800, fontSize: 20, marginTop: 8 }}>{data.resumen.ciclo_minero.regimen}</div>
            <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>Proxima bajada: {data.resumen.ciclo_minero.proxima_bajada || '-'}</div>
          </div>
        )}
      </div>
    </>
  );
}

function constanciaHref(row) {
  if (row.documento_url) return row.documento_url;
  if (!row.plantilla_html) return null;
  return `data:text/html;charset=utf-8,${encodeURIComponent(row.plantilla_html)}`;
}

export function MiPortal() {
  const app = useApp();
  const {
    authUser, usuarios, personalAdmin, personalOperativo, personalDocumentos, solicitudesRRHH,
    registrosAsistencia, periodosNomina, trabajadoresDatosNomina, amonestacionesPersonal,
    setAmonestacionesPersonal, subirDocumentoPersonalCtx, navigate, addNotificacion,
    evaluacionPlantillas, evaluacionEvaluaciones, empresaConfig = {}, portalDatosSolicitudes = [],
    portalConstanciasTrabajo = [], portalBoletaAcuses = [], portalBoletaVisualizaciones = [], portalFirmaRegistros = [],
    crearSolicitudDatosPortalCtx, resolverSolicitudDatosPortalCtx, crearConstanciaPortalCtx, resolverConstanciaPortalCtx,
    registrarAcuseBoletaPortalCtx, registrarVisualizacionBoletaPortalCtx, iniciarOtpFirmaPortalCtx,
    validarOtpFirmaPortalCtx, guardarOnboardingFirmaPortalCtx,
  } = app;
  const [tab, setTab] = useState('resumen');
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7));
  const [uploading, setUploading] = useState('');
  const [datoForm, setDatoForm] = useState({ campo: 'telefono_personal', valor: '' });
  const [constanciaProposito, setConstanciaProposito] = useState('');
  const [firmaForm, setFirmaForm] = useState({ telefono_personal: '', celular_personal: '', email_personal: '', firma_otp_canal: 'email_personal', consentimiento_entrega_electronica: false });
  const [otpActivo, setOtpActivo] = useState(null);
  const [otpCodigo, setOtpCodigo] = useState('');

  const data = useMemo(() => construirAutoservicioLocal({
    authUser, usuarios, personalAdmin, personalOperativo, personalDocumentos, solicitudesRRHH,
    registrosAsistencia, periodosNomina, trabajadoresDatosNomina, amonestaciones: amonestacionesPersonal,
    notificaciones: app.notificaciones, periodo, evaluacionPlantillas, evaluacionEvaluaciones,
    portalDatosSolicitudes, portalConstanciasTrabajo, portalBoletaAcuses, portalBoletaVisualizaciones, portalFirmaRegistros,
  }), [authUser, usuarios, personalAdmin, personalOperativo, personalDocumentos, solicitudesRRHH, registrosAsistencia, periodosNomina, trabajadoresDatosNomina, amonestacionesPersonal, app.notificaciones, periodo, evaluacionPlantillas, evaluacionEvaluaciones, portalDatosSolicitudes, portalConstanciasTrabajo, portalBoletaAcuses, portalBoletaVisualizaciones, portalFirmaRegistros]);

  const ficha = data.ficha;
  const camposPermitidos = empresaConfig?.portal_datos_campos_permitidos || ['telefono_personal', 'celular_personal', 'email_personal', 'direccion', 'contacto_emergencia', 'datos_bancarios'];
  const puedeRRHH = Boolean(app.role?.permisos?.todo || app.role?.permisos?.rrhh || app.role?.permisos?.rrhh_operativo || app.role?.permisos?.ver_rrhh);
  const solicitudesDatosPendientes = portalDatosSolicitudes.filter(s => s.estado === 'pendiente');
  const constanciasPendientes = portalConstanciasTrabajo.filter(c => c.estado === 'solicitada');

  const subirDocumento = async (file, tipoDoc = 'contrato') => {
    if (!file || !ficha) return;
    setUploading(tipoDoc);
    try {
      await subirDocumentoPersonalCtx({
        personalId: ficha.id,
        personalTipo: ficha.personal_tipo,
        tipoDoc,
        file,
        fechaVencimiento: ficha.fecha_fin_contrato || null,
        notas: tipoDoc === 'contrato' ? 'Contrato firmado cargado desde Mi portal' : 'Renovacion cargada desde Mi portal',
      });
      addNotificacion('Documento cargado para validacion de RRHH.');
    } catch (err) {
      addNotificacion(err.message || 'No se pudo cargar el documento.');
    } finally {
      setUploading('');
    }
  };

  const acusarAmonestacion = async (amonestacion) => {
    try {
      let actualizado = { ...amonestacion, acusado_en: new Date().toISOString(), acusado_por_user_id: authUser?.id || null };
      if (isSupabaseConfigured()) actualizado = await autoservicioEmpleadoService.acusarAmonestacion(amonestacion.id);
      setAmonestacionesPersonal(prev => prev.map(a => a.id === amonestacion.id ? actualizado : a));
      addNotificacion('Acuse registrado.');
    } catch (err) {
      addNotificacion(err.message || 'No se pudo registrar el acuse.');
    }
  };

  const abrirBoleta = async (boleta) => {
    if (!ficha?.consentimiento_entrega_electronica) {
      addNotificacion('Debes registrar consentimiento de entrega electronica antes de abrir boletas.');
      setTab('firma');
      return;
    }
    if (!boleta.acuse) {
      const password = window.prompt('Reautenticacion requerida. Ingresa tu clave para abrir la boleta por primera vez:');
      if (!password) return;
      await registrarAcuseBoletaPortalCtx({
        boleta_id: boleta.id,
        periodo_id: boleta.periodo_id,
        personal_id: ficha.id,
        personal_tipo: ficha.personal_tipo,
        detalle: boleta.detalle || boleta,
      });
    } else {
      await registrarVisualizacionBoletaPortalCtx({
        boleta_id: boleta.id,
        periodo_id: boleta.periodo_id,
        personal_id: ficha.id,
        personal_tipo: ficha.personal_tipo,
        detalle: boleta.detalle || boleta,
      });
    }
    if (boleta.archivo_url) window.open(boleta.archivo_url, '_blank', 'noopener,noreferrer');
    addNotificacion('Apertura de boleta registrada.');
  };

  const enviarDato = async () => {
    if (!datoForm.valor.trim()) {
      addNotificacion('Ingresa el nuevo valor propuesto.');
      return;
    }
    await crearSolicitudDatosPortalCtx({
      personal_id: ficha.id,
      personal_tipo: ficha.personal_tipo,
      campo: datoForm.campo,
      valor_anterior: { [datoForm.campo]: data.misDatos?.[datoForm.campo] || ficha?.[datoForm.campo] || null },
      valor_propuesto: { [datoForm.campo]: datoForm.valor.trim() },
      campo_critico: ['datos_bancarios'].includes(datoForm.campo),
    });
    setDatoForm(prev => ({ ...prev, valor: '' }));
  };

  const solicitarConstancia = async () => {
    await crearConstanciaPortalCtx({
      ficha,
      personal_id: ficha.id,
      personal_tipo: ficha.personal_tipo,
      proposito: constanciaProposito,
    });
    setConstanciaProposito('');
  };

  const guardarFirma = async () => {
    await guardarOnboardingFirmaPortalCtx(ficha, {
      ...firmaForm,
      telefono_personal: firmaForm.telefono_personal || ficha.telefono_personal || ficha.telefono,
      celular_personal: firmaForm.celular_personal || ficha.celular_personal || firmaForm.telefono_personal || ficha.telefono_personal || ficha.telefono,
      email_personal: firmaForm.email_personal || ficha.email_personal || ficha.email,
      firma_onboarding_completo: Boolean(firmaForm.consentimiento_entrega_electronica),
    });
  };

  const enviarOtpFirma = async () => {
    const canal = firmaForm.firma_otp_canal || empresaConfig?.portal_firma_otp_canal_default || 'email_personal';
    const destino = canal === 'telefono_personal'
      ? (firmaForm.celular_personal || ficha.celular_personal || firmaForm.telefono_personal || ficha.telefono_personal || ficha.telefono)
      : (firmaForm.email_personal || ficha.email_personal || ficha.email);
    const otp = await iniciarOtpFirmaPortalCtx({
      personal_id: ficha.id,
      personal_tipo: ficha.personal_tipo,
      canal,
      destino,
      proposito: 'onboarding_firma',
    });
    setOtpActivo(otp);
  };

  const validarOtp = async () => {
    await validarOtpFirmaPortalCtx(otpActivo.id, otpCodigo, {
      rubrica_url: ficha.firma_rubrica_url,
      autorizacion_documento_id: ficha.firma_autorizacion_doc_id,
      contrato: { tipo: 'autorizacion_firma', personal_id: ficha.id },
    });
    await guardarOnboardingFirmaPortalCtx(ficha, { ...firmaForm, firma_otp_verificado_en: new Date().toISOString(), firma_onboarding_completo: true, consentimiento_entrega_electronica: true });
    setOtpActivo(null);
    setOtpCodigo('');
  };

  const tabs = [
    ['resumen', 'Resumen', I.dashboard],
    ['evaluaciones', 'Mis evaluaciones', I.clipboard],
    ['datos', 'Mis datos', I.userCheck],
    ['constancias', 'Constancias', I.file],
    ['boletas', 'Mis boletas', I.receipt],
    ['contratos', 'Mis contratos', I.file],
    ['firma', 'Firma y consentimiento', I.pen || I.file],
    ['asistencia', 'Mi asistencia', I.clock],
    ['solicitudes', 'Mis solicitudes', I.clipboard],
    ['he', 'Mis horas extra', I.clock],
    ['documentos', 'Mis documentos', I.file],
    ['prestamos', 'Mis prestamos', I.userCheck],
    ['amonestaciones', 'Mis amonestaciones', I.alert],
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Mi portal</h1>
          <div className="page-sub">{ficha ? `${ficha.nombre} · ${ficha.cargo || ficha.area || ''}` : 'Informacion laboral propia'}</div>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('solicitudes_rrhh')}>{I.plus} Nueva solicitud</button>
      </div>

      {!ficha ? <EmptyPortal /> : (
        <>
          {puedeRRHH && (solicitudesDatosPendientes.length > 0 || constanciasPendientes.length > 0) && (
            <div className="card" style={{ padding: 16, marginBottom: 14 }}>
              <div className="card-head"><h3>Bandeja RRHH portal</h3><span className="badge badge-orange">{solicitudesDatosPendientes.length + constanciasPendientes.length} pendientes</span></div>
              {solicitudesDatosPendientes.slice(0, 4).map(s => <div key={s.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div><strong>{campoLabels[s.campo] || s.campo}</strong><div className="text-muted" style={{ fontSize: 12 }}>{campoValor(s.valor_anterior)} → {campoValor(s.valor_propuesto)}</div></div>
                <div className="row" style={{ gap: 6 }}><button className="btn btn-secondary btn-sm" onClick={() => resolverSolicitudDatosPortalCtx(s.id, 'aprobado')}>Aprobar</button><button className="btn btn-secondary btn-sm" onClick={() => resolverSolicitudDatosPortalCtx(s.id, 'rechazado')}>Rechazar</button></div>
              </div>)}
              {constanciasPendientes.slice(0, 4).map(c => <div key={c.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div><strong>Constancia de trabajo</strong><div className="text-muted" style={{ fontSize: 12 }}>{c.proposito || 'Sin proposito declarado'}</div></div>
                <div className="row" style={{ gap: 6 }}><button className="btn btn-secondary btn-sm" onClick={() => resolverConstanciaPortalCtx(c.id, 'aprobada')}>Emitir</button><button className="btn btn-secondary btn-sm" onClick={() => resolverConstanciaPortalCtx(c.id, 'rechazada')}>Rechazar</button></div>
              </div>)}
            </div>
          )}

          <div className="tabs" style={{ flexWrap: 'wrap' }}>
            {tabs.map(([k, label, icon]) => <button key={k} className={'tab ' + (tab === k ? 'active' : '')} onClick={() => setTab(k)}>{icon} {label}</button>)}
          </div>

          {tab === 'resumen' && (
            <>
              <PortalResumen data={data} onEvaluaciones={() => setTab('evaluaciones')} />
              <div className="card" style={{ padding: 16, marginTop: 14 }}>
                <div className="card-head"><h3>Notificaciones laborales</h3></div>
                {(data.notificaciones || []).slice(0, 5).map(n => <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>{n.title && <strong>{n.title}: </strong>}{n.text}</div>)}
                {!data.notificaciones?.length && <div className="text-muted">Sin notificaciones activas.</div>}
              </div>
            </>
          )}

          {tab === 'evaluaciones' && (
            <div className="grid cols-2">
              <div className="card" style={{ padding: 16 }}>
                <div className="card-head"><h3>Autoevaluaciones pendientes</h3><span className="badge badge-orange">{data.evaluacionesPendientes.length}</span></div>
                {data.evaluacionesPendientes.map(e => <div key={e.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <strong>{e.plantilla?.nombre || 'Evaluacion'}</strong>
                  <div className="text-muted" style={{ fontSize: 12 }}>Limite: {e.plantilla?.fecha_limite_autoevaluacion || '-'}</div>
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => navigate('evaluaciones_desempeno', { auto: e.id })}>Responder</button>
                </div>)}
                {!data.evaluacionesPendientes.length && <div className="text-muted">No tienes autoevaluaciones pendientes.</div>}
              </div>
              <div className="card" style={{ padding: 16 }}>
                <div className="card-head"><h3>Resultados cerrados</h3></div>
                {data.evaluacionesCerradas.map(e => <div key={e.id} className="row" style={{ justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div><strong>{e.plantilla?.nombre || 'Evaluacion'}</strong><div className="text-muted" style={{ fontSize: 12 }}>Score final: {e.score_final ?? '-'}</div></div>
                  <button className="btn btn-secondary btn-sm" onClick={() => navigate('evaluaciones_desempeno', { resultado: e.id })}>Ver</button>
                </div>)}
                {!data.evaluacionesCerradas.length && <div className="text-muted">Sin resultados cerrados publicados.</div>}
              </div>
            </div>
          )}

          {tab === 'datos' && (
            <div className="grid cols-2">
              <div className="card" style={{ padding: 16 }}>
                <div className="card-head"><h3>Datos registrados</h3></div>
                {Object.entries(campoLabels).map(([k, label]) => <div key={k} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}><span>{label}</span><strong style={{ textAlign: 'right' }}>{campoValor(data.misDatos?.[k])}</strong></div>)}
                <div className="text-muted" style={{ fontSize: 12, marginTop: 12 }}>Los cambios sensibles, como datos bancarios, quedan sujetos a aprobacion de RRHH.</div>
              </div>
              <div className="card" style={{ padding: 16 }}>
                <div className="card-head"><h3>Proponer actualizacion</h3></div>
                <div className="grid-2" style={{ gap: 12 }}>
                  <div className="input-group"><label>Campo</label><select className="select" value={datoForm.campo} onChange={e => setDatoForm(v => ({ ...v, campo: e.target.value }))}>{camposPermitidos.map(c => <option key={c} value={c}>{campoLabels[c] || c}</option>)}</select></div>
                  <div className="input-group"><label>Nuevo valor</label><input className="input" value={datoForm.valor} onChange={e => setDatoForm(v => ({ ...v, valor: e.target.value }))} /></div>
                </div>
                {datoForm.campo === 'datos_bancarios' && <div className="alert alert-warning" style={{ marginTop: 12, fontSize: 12 }}>Campo sensible: RRHH debe validar la evidencia antes de aplicar el cambio.</div>}
                <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={enviarDato}>Enviar a RRHH</button>
                <div style={{ marginTop: 18 }}>
                  <strong>Mis solicitudes</strong>
                  {data.datosSolicitudes.slice(0, 5).map(s => <div key={s.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}><span>{campoLabels[s.campo] || s.campo}</span><span className={'badge ' + (s.estado === 'aprobado' ? 'badge-green' : s.estado === 'rechazado' ? 'badge-red' : 'badge-orange')}>{s.estado}</span></div>)}
                </div>
              </div>
            </div>
          )}

          {tab === 'constancias' && (
            <div className="grid cols-2">
              <div className="card" style={{ padding: 16 }}>
                <div className="card-head"><h3>Solicitar constancia</h3><span className="badge badge-gray">{empresaConfig?.portal_constancia_emision_directa ? 'Emision directa' : 'Con aprobacion'}</span></div>
                <div className="input-group"><label>Proposito opcional</label><input className="input" value={constanciaProposito} onChange={e => setConstanciaProposito(e.target.value)} placeholder="Banco, alquiler, tramite interno" /></div>
                <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={solicitarConstancia}>Solicitar</button>
              </div>
              <div className="card" style={{ padding: 16 }}>
                <div className="card-head"><h3>Historial</h3></div>
                {data.constancias.map(c => {
                  const href = constanciaHref(c);
                  return <div key={c.id} className="row" style={{ justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div><strong>{c.proposito || 'Constancia de trabajo'}</strong><div className="text-muted" style={{ fontSize: 12 }}>Hash: {c.documento_hash || '-'}</div></div>
                    {href ? <a className="btn btn-secondary btn-sm" href={href} target="_blank" rel="noreferrer">Abrir</a> : <span className="badge badge-orange">{c.estado}</span>}
                  </div>;
                })}
                {!data.constancias.length && <div className="text-muted">Sin constancias solicitadas.</div>}
              </div>
            </div>
          )}

          {tab === 'boletas' && (
            <div className="card p-0">
              <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }} className="text-muted">
                La confirmacion de recepcion deja constancia de entrega electronica y no implica aceptacion del contenido de la boleta.
              </div>
              <table className="table"><thead><tr><th>Periodo</th><th>Estado</th><th>Acuse</th><th>Neto</th><th>Accion</th></tr></thead><tbody>
                {data.boletas.map(b => <tr key={b.id}><td>{b.periodo}</td><td><span className="badge badge-green">Cerrado</span></td><td>{b.acuse ? <span className="badge badge-green">Acusada</span> : <span className="badge badge-orange">Pendiente</span>}</td><td>{money(b.detalle?.neto)}</td><td><button className="btn btn-secondary btn-sm" onClick={() => abrirBoleta(b)}>{b.acuse ? 'Abrir' : 'Reautenticar y abrir'}</button></td></tr>)}
                {!data.boletas.length && <tr><td colSpan={5} className="text-muted" style={{ padding: 16 }}>Sin boletas disponibles.</td></tr>}
              </tbody></table>
            </div>
          )}

          {tab === 'contratos' && (
            <div className="grid cols-2">
              <div className="card" style={{ padding: 16 }}>
                <div className="card-head"><h3>Contrato vigente</h3><span className="badge badge-cyan">{estadoContratoLabel(data.resumen?.contrato)}</span></div>
                <div className="text-muted">La firma electronica avanzada queda disponible cuando RRHH active el parametro del tenant y exista contrato pendiente.</div>
                <label className="btn btn-primary" style={{ marginTop: 14, display: 'inline-flex' }}>
                  {uploading === 'contrato' ? 'Subiendo...' : <>{I.upload} Cargar contrato firmado</>}
                  <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => subirDocumento(e.target.files?.[0], 'contrato')} />
                </label>
              </div>
              <div className="card" style={{ padding: 16 }}>
                <div className="card-head"><h3>Historial</h3></div>
                {data.contratos.map(d => <div key={d.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>{d.tipo_doc || 'Contrato'} · {d.fecha_vencimiento || 'Sin vencimiento'} · <span className="badge badge-gray">{d.estado_validacion || 'registrado'}</span></div>)}
                {!data.contratos.length && <div className="text-muted">Sin contratos registrados.</div>}
              </div>
            </div>
          )}

          {tab === 'firma' && (
            <div className="grid cols-2">
              <div className="card" style={{ padding: 16 }}>
                <div className="card-head"><h3>Consentimiento y canal OTP</h3><span className={'badge ' + (ficha.firma_onboarding_completo ? 'badge-green' : 'badge-orange')}>{ficha.firma_onboarding_completo ? 'Completo' : 'Pendiente'}</span></div>
                {!empresaConfig?.portal_firma_contratos_activa && <div className="alert alert-warning" style={{ fontSize: 12, marginBottom: 12 }}>La firma de contratos esta apagada por parametro del tenant.</div>}
                <div className="grid-2" style={{ gap: 12 }}>
                  <div className="input-group"><label>Telefono personal</label><input className="input" value={firmaForm.telefono_personal} placeholder={ficha.telefono_personal || ficha.telefono || ''} onChange={e => setFirmaForm(v => ({ ...v, telefono_personal: e.target.value }))} /></div>
                  <div className="input-group"><label>Celular personal (WhatsApp)</label><input className="input" value={firmaForm.celular_personal} placeholder={ficha.celular_personal || ficha.telefono_personal || ficha.telefono || ''} onChange={e => setFirmaForm(v => ({ ...v, celular_personal: e.target.value }))} /></div>
                  <div className="input-group"><label>Email personal</label><input className="input" value={firmaForm.email_personal} placeholder={ficha.email_personal || ficha.email || ''} onChange={e => setFirmaForm(v => ({ ...v, email_personal: e.target.value }))} /></div>
                  <div className="input-group"><label>Canal OTP</label><select className="select" value={firmaForm.firma_otp_canal} onChange={e => setFirmaForm(v => ({ ...v, firma_otp_canal: e.target.value }))}><option value="email_personal">Email personal</option><option value="telefono_personal">SMS/WhatsApp</option></select></div>
                </div>
                <label className="row" style={{ gap: 8, marginTop: 12 }}><input type="checkbox" checked={firmaForm.consentimiento_entrega_electronica} onChange={e => setFirmaForm(v => ({ ...v, consentimiento_entrega_electronica: e.target.checked }))} /> Acepto entrega electronica de boletas y uso de evidencias de firma.</label>
                <div className="row" style={{ gap: 8, marginTop: 12 }}><button className="btn btn-secondary" onClick={guardarFirma}>Guardar</button><button className="btn btn-primary" onClick={enviarOtpFirma}>Enviar OTP</button></div>
                {otpActivo && <div className="row" style={{ gap: 8, marginTop: 12 }}><input className="input" value={otpCodigo} onChange={e => setOtpCodigo(e.target.value)} placeholder="Codigo OTP" style={{ maxWidth: 180 }} /><button className="btn btn-primary" onClick={validarOtp}>Validar</button></div>}
              </div>
              <div className="card" style={{ padding: 16 }}>
                <div className="card-head"><h3>Evidencias</h3></div>
                <div className="text-muted" style={{ fontSize: 12 }}>Los registros de firma son append-only e incluyen hash original, hash firmado, canal OTP y estado TSA.</div>
                {data.firmaRegistros.map(f => <div key={f.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}><strong>{f.contrato_documento_id || 'Autorizacion/firma'}</strong><div className="text-muted" style={{ fontSize: 12 }}>Hash firmado: {f.hash_firmado || '-'} · TSA: {f.tsa_estado || '-'}</div></div>)}
                {!data.firmaRegistros.length && <div className="text-muted" style={{ marginTop: 12 }}>Sin evidencias de firma registradas.</div>}
              </div>
            </div>
          )}

          {tab === 'asistencia' && (
            <div className="card" style={{ padding: 16 }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>Asistencia mensual</h3>
                <input className="input" type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} style={{ maxWidth: 180 }} />
              </div>
              <table className="table"><thead><tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Tardanza</th><th>HE</th><th>Estado</th></tr></thead><tbody>
                {data.asistencia.map(r => <tr key={r.id}><td>{r.fecha}</td><td>{r.hora_entrada || '-'}</td><td>{r.hora_salida || '-'}</td><td>{r.tardanza_min || r.tardanza_minutos || 0} min</td><td>{minToHours(r.horas_extra_min || Number(r.horas_extra || 0) * 60)} {r.he_autorizada ? <span className="badge badge-green">Aut.</span> : ''}</td><td>{r.estado || '-'}</td></tr>)}
              </tbody></table>
            </div>
          )}

          {tab === 'solicitudes' && (
            <div className="card p-0">
              <table className="table"><thead><tr><th>Tipo</th><th>Fechas</th><th>Dias</th><th>Estado</th></tr></thead><tbody>
                {data.solicitudes.map(s => <tr key={s.id}><td>{s.tipo}</td><td>{s.fecha_inicio} - {s.fecha_fin}</td><td>{s.dias_habiles || '-'}</td><td><span className="badge badge-cyan">{String(s.estado || '').replace(/_/g, ' ')}</span></td></tr>)}
              </tbody></table>
            </div>
          )}

          {tab === 'he' && (
            <div className="card" style={{ padding: 16 }}>
              <div className="font-display" style={{ fontSize: 28, fontWeight: 800 }}>{minToHours(data.resumen?.he_pendiente_minutos)}</div>
              <div className="text-muted">Saldo pendiente desde la misma fuente de nomina.</div>
            </div>
          )}

          {tab === 'documentos' && (
            <div className="grid cols-3">
              {data.documentos.map(d => <div className="card" key={d.id} style={{ padding: 14 }}>
                <div style={{ fontWeight: 700 }}>{d.tipo_doc || d.tipo_documento_nombre || 'Documento'}</div>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>Vence: {d.fecha_vencimiento || 'No aplica'}</div>
                <span className="badge badge-gray" style={{ marginTop: 8 }}>{d.estado_validacion || 'registrado'}</span>
                <label className="btn btn-secondary btn-sm" style={{ marginTop: 12, width: '100%', justifyContent: 'center' }}>
                  Renovar
                  <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={e => subirDocumento(e.target.files?.[0], d.tipo_doc || 'documento')} />
                </label>
              </div>)}
              {!data.documentos.length && <div className="text-muted">Sin documentos personales registrados.</div>}
            </div>
          )}

          {tab === 'prestamos' && (
            <div className="card p-0">
              <table className="table"><thead><tr><th>Concepto</th><th>Saldo</th><th>Cuotas</th><th>Estado</th></tr></thead><tbody>
                {data.prestamos.map(p => <tr key={p.id}><td>{p.concepto || p.motivo}</td><td>{p.saldo || 0}</td><td>{p.cuotas_pagadas || 0}/{p.cuotas || '-'}</td><td>{p.estado}</td></tr>)}
              </tbody></table>
              {!data.prestamos.length && <div className="text-muted" style={{ padding: 16 }}>Sin prestamos registrados.</div>}
            </div>
          )}

          {tab === 'amonestaciones' && (
            <div className="grid cols-2">
              {data.amonestaciones.map(a => <div className="card" key={a.id} style={{ padding: 16 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}><strong>{a.tipo || 'Amonestacion'}</strong><span className="badge badge-orange">{a.gravedad || 'activa'}</span></div>
                <p style={{ marginTop: 10 }}>{a.descripcion || a.motivo}</p>
                <div className="text-muted" style={{ fontSize: 12 }}>El acuse deja constancia de notificacion; no implica aceptacion del contenido.</div>
                {a.acusado_en ? <span className="badge badge-green" style={{ marginTop: 12 }}>Notificado y acusado {(a.acusado_en || '').slice(0, 10)}</span> : <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => acusarAmonestacion(a)}>Me doy por enterado</button>}
              </div>)}
              {!data.amonestaciones.length && <div className="text-muted">Sin amonestaciones activas.</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
