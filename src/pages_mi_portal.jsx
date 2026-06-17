import React, { useMemo, useState } from 'react';
import { I } from './icons.jsx';
import { useApp } from './context.jsx';
import { construirAutoservicioLocal } from './services/autoservicioEmpleadoService.js';
import { isSupabaseConfigured } from './lib/supabaseClient.js';
import { autoservicioEmpleadoService } from './services/autoservicioEmpleadoService.js';
import * as personalDocumentosService from './services/personalDocumentosService.js';

const minToHours = min => `${Math.round(Number(min || 0) / 60 * 10) / 10} h`;
const estadoContratoLabel = c => c?.estado === 'por_vencer' ? `Por vencer (${c.dias} dias)` : c?.estado === 'sin_contrato' ? 'Sin contrato digital' : c?.estado || 'Sin contrato digital';
const estadoContratoBadge = (estado, ficha) => estado === 'vencido' ? 'badge-red' : estado === 'por_vencer' ? 'badge-orange' : estado === 'sin_contrato' ? (ficha?.cargo_confianza ? 'badge-gray' : 'badge-red') : 'badge-green';
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

function PortalResumen({ data, onEvaluaciones, onContratos }) {
  const contratoEstado = data.resumen?.contrato?.estado;
  const contratoFecha = data.resumen?.contrato?.contrato?.fecha_vencimiento;
  const cards = [
    {
      label: 'Contrato',
      value: contratoFecha ? `Vence ${contratoFecha}` : (contratoEstado === 'sin_contrato' ? 'Sin contrato' : 'Sin fecha de vencimiento'),
      icon: I.file,
      badge: contratoEstado,
      onCta: onContratos,
      ctaLabel: ['por_vencer', 'vencido'].includes(contratoEstado) ? 'Cargar contrato firmado →' : 'Ver en Mis contratos →',
    },
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
            {c.badge && <span className={'badge ' + estadoContratoBadge(c.badge, data.ficha)} style={{ marginTop: 8 }}>{estadoContratoLabel({ estado: c.badge, dias: data.resumen?.contrato?.dias })}</span>}
            {c.badge === 'sin_contrato' && !data.ficha?.cargo_confianza && <div style={{fontSize:11, color:'var(--danger)', marginTop:4}}>Tu asistencia está bloqueada. Consulta con RRHH.</div>}
            {c.onCta && <button onClick={c.onCta} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: 'var(--cyan)', cursor: 'pointer', marginTop: 8, display: 'block' }}>{c.ctaLabel}</button>}
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
    setAmonestacionesPersonal, subirDocumentoPersonalCtx, subirDocumentoFirmadoPortalCtx, subirContratoFirmadoAprobadoCtx, navigate, addNotificacion,
    evaluacionPlantillas, evaluacionEvaluaciones, empresaConfig = {}, portalDatosSolicitudes = [],
    portalConstanciasTrabajo = [], portalBoletaAcuses = [], portalBoletaVisualizaciones = [], portalFirmaRegistros = [],
    crearSolicitudDatosPortalCtx, crearConstanciaPortalCtx,
    registrarAcuseBoletaPortalCtx, registrarVisualizacionBoletaPortalCtx, iniciarOtpFirmaPortalCtx,
    validarOtpFirmaPortalCtx, guardarOnboardingFirmaPortalCtx,
    tiposDocumento = [],
  } = app;
  const [tab, setTab] = useState('resumen');
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7));
  const [uploading, setUploading] = useState('');
  const [datoForm, setDatoForm] = useState({ campo: 'telefono_personal', valor: '' });
  const [constanciaProposito, setConstanciaProposito] = useState('');
  const [firmaForm, setFirmaForm] = useState({ telefono_personal: '', celular_personal: '', email_personal: '', firma_otp_canal: 'email_personal', consentimiento_entrega_electronica: false });
  const [otpActivo, setOtpActivo] = useState(null);
  const [otpCodigo, setOtpCodigo] = useState('');
  const [modalSubirContrato, setModalSubirContrato] = useState(null);
  const [fileSubir, setFileSubir] = useState(null);

  const tiposDocumentoContratoIds = useMemo(() => (tiposDocumento || []).filter(t => t.captura_snapshot_laboral).map(t => t.id), [tiposDocumento]);

  const data = useMemo(() => construirAutoservicioLocal({
    authUser, usuarios, personalAdmin, personalOperativo, personalDocumentos, solicitudesRRHH,
    registrosAsistencia, periodosNomina, trabajadoresDatosNomina, amonestaciones: amonestacionesPersonal,
    notificaciones: app.notificaciones, periodo, evaluacionPlantillas, evaluacionEvaluaciones,
    portalDatosSolicitudes, portalConstanciasTrabajo, portalBoletaAcuses, portalBoletaVisualizaciones, portalFirmaRegistros,
    tiposDocumentoContratoIds,
  }), [authUser, usuarios, personalAdmin, personalOperativo, personalDocumentos, solicitudesRRHH, registrosAsistencia, periodosNomina, trabajadoresDatosNomina, amonestacionesPersonal, app.notificaciones, periodo, evaluacionPlantillas, evaluacionEvaluaciones, portalDatosSolicitudes, portalConstanciasTrabajo, portalBoletaAcuses, portalBoletaVisualizaciones, portalFirmaRegistros, tiposDocumentoContratoIds]);

  const ficha = data.ficha;
  const camposPermitidos = empresaConfig?.portal_datos_campos_permitidos || ['telefono_personal', 'celular_personal', 'email_personal', 'direccion', 'contacto_emergencia', 'datos_bancarios'];

  const docsPendientesFirma = useMemo(() =>
    [...(data.contratos || []), ...(data.documentos || [])].filter(d => d.estado_firma === 'pendiente_trabajador')
  , [data.contratos, data.documentos]);

  const getNombreDoc = (d) => {
    if (!d) return 'Documento';
    const tInfo = (tiposDocumento || []).find(t => t.id === d.tipo_documento_id || t.id === d.tipo_doc);
    return tInfo?.nombre || d.tipo_documento_nombre || d.tipo_doc || 'Documento';
  };

  const abrirDoc = async (doc) => {
    try {
      const ref = doc.storage_path || doc.archivo_url;
      if (!ref) return;
      const url = await personalDocumentosService.renovarUrlDocumento(ref);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      if (doc.archivo_url) window.open(doc.archivo_url, '_blank', 'noopener,noreferrer');
    }
  };

  const confirmarSubidaContrato = async () => {
    if (!fileSubir || !modalSubirContrato || !ficha) return;
    if (fileSubir.size === 0) {
      addNotificacion('El archivo no puede estar vacío.', 'error');
      return;
    }
    setUploading('contrato');
    try {
      await subirContratoFirmadoAprobadoCtx({ file: fileSubir, docOriginal: modalSubirContrato });
      addNotificacion('Contrato firmado subido con éxito. Queda en revisión por RRHH.');
      if (modalSubirContrato) {
        modalSubirContrato.estado_validacion = 'pendiente';
        modalSubirContrato.subido_desde = 'mobile';
        modalSubirContrato.creado_en = new Date().toISOString();
      }
      setModalSubirContrato(null);
      setFileSubir(null);
    } catch (err) {
      addNotificacion(`Error al subir contrato: ${err?.message || err}`, 'error');
    } finally {
      setUploading('');
    }
  };

  const subirDocumentoFirmado = async (file, docOriginal) => {
    if (!file || !ficha) return;
    setUploading(docOriginal.id);
    try {
      await subirDocumentoFirmadoPortalCtx({
        personalId: ficha.id,
        personalTipo: ficha.personal_tipo,
        tipoDoc: docOriginal.tipo_doc || docOriginal.tipo_documento_id || 'contrato',
        tipoDocumentoId: docOriginal.tipo_documento_id || null,
        file,
        documentoEnviadoAFirmaId: docOriginal.id,
        nombreColaborador: ficha.nombre,
      });
      addNotificacion('Documento firmado cargado. RRHH lo validara pronto.');
      docOriginal.estado_validacion = 'pendiente';
      docOriginal.subido_desde = 'mobile';
      docOriginal.creado_en = new Date().toISOString();
    } catch (err) {
      addNotificacion(err?.message || 'No se pudo cargar el documento.');
    } finally {
      setUploading('');
    }
  };

  const subirDocumento = async (file, tipoDoc = 'contrato') => {
    if (!file || !ficha) return;

    let docIdToUpload = tipoDoc;
    let tipoDocumentoId = null;

    if (tipoDoc === 'contrato') {
      const tipoContrato = (tiposDocumento || []).find(t => t.nombre === 'Contrato Laboral' && t.estado === 'activo');
      if (!tipoContrato) {
        addNotificacion('Configuración de tipos de documento incompleta. Contacta a RRHH.', 'error');
        return;
      }
      docIdToUpload = tipoContrato.id;
      tipoDocumentoId = tipoContrato.id;
    }

    setUploading(tipoDoc);
    try {
      await subirDocumentoPersonalCtx({
        personalId: ficha.id,
        personalTipo: ficha.personal_tipo,
        tipoDoc: docIdToUpload,
        tipoDocumentoId,
        file,
        fechaVencimiento: null,
        notas: tipoDoc === 'contrato' ? 'Contrato firmado cargado desde Mi portal' : 'Renovacion cargada desde Mi portal',
        origen: 'portal_empleado',
      });
      addNotificacion('Documento cargado para validacion de RRHH.');
    } catch (err) {
      addNotificacion(err.message || 'No se pudo cargar el documento.', 'error');
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
      </div>

      {!ficha ? <EmptyPortal /> : (
        <>
          <div className="tabs" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
            {tabs.map(([k, label, icon]) => <button key={k} className={'tab ' + (tab === k ? 'active' : '')} onClick={() => setTab(k)}>{icon} {label}</button>)}
          </div>

          {tab === 'resumen' && (
            <>
              {docsPendientesFirma.length > 0 && (
                <div className="card" style={{ padding: 16, marginBottom: 14, borderColor: 'var(--orange)', borderWidth: 2 }}>
                  <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <strong>Tienes {docsPendientesFirma.length === 1 ? 'un documento pendiente de firma' : `${docsPendientesFirma.length} documentos pendientes de firma`}</strong>
                      <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>{getNombreDoc(docsPendientesFirma[0])} — enviado por RRHH. Revisa el tab "Firma y consentimiento".</div>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => setTab('firma')}>Revisar y firmar →</button>
                  </div>
                </div>
              )}
              <PortalResumen data={data} onEvaluaciones={() => setTab('evaluaciones')} onContratos={() => setTab('contratos')} />
              <div className="card" style={{ marginTop: 14 }}>
                <div className="card-head"><h3>Notificaciones laborales</h3></div>
                <div className="card-body" style={{ padding: '0 16px 16px' }}>
                  {(data.notificaciones || []).filter(n => n.tipo).slice(0, 5).map(n => <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>{n.title && <strong>{n.title}: </strong>}{n.text}</div>)}
                  {!(data.notificaciones || []).filter(n => n.tipo).length && <div className="text-muted" style={{ padding: '16px 0' }}>Sin notificaciones activas.</div>}
                </div>
              </div>
              <div className="card" style={{ marginTop: 14 }}>
                <div className="card-head"><h3>Acciones rápidas</h3></div>
                <div className="card-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 12, paddingBottom: 16 }}>
                  <button className="btn btn-secondary" onClick={() => navigate('solicitudes_rrhh')}>Pedir vacaciones</button>
                  <button className="btn btn-secondary" onClick={() => navigate('solicitudes_rrhh')}>Pedir permiso</button>
                  <button className="btn btn-secondary" onClick={() => setTab('constancias')}>Solicitar constancia</button>
                </div>
              </div>
            </>
          )}

          {tab === 'evaluaciones' && (
            <div className="card">
              <div className="card-head"><h3>Autoevaluaciones pendientes</h3><span className="badge badge-orange">{data.evaluacionesPendientes.length} pendientes</span></div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Evaluación</th><th>Fecha Límite</th><th style={{ textAlign: 'right' }}>Acción</th></tr></thead>
                  <tbody>
                    {data.evaluacionesPendientes.map(e => <tr key={e.id}>
                      <td style={{ fontWeight: 600 }}>{e.plantilla?.nombre || 'Evaluación'}</td>
                      <td>{e.plantilla?.fecha_limite_autoevaluacion || '-'}</td>
                      <td style={{ textAlign: 'right' }}><button className="btn btn-primary btn-sm" onClick={() => navigate('evaluaciones_desempeno', { auto: e.id })}>Responder</button></td>
                    </tr>)}
                    {!data.evaluacionesPendientes.length && <tr><td colSpan="3" className="text-muted" style={{ padding: 16, textAlign: 'center' }}>No tienes autoevaluaciones pendientes.</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="card-head" style={{ borderTop: '1px solid var(--border)' }}><h3>Resultados cerrados</h3></div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Evaluación</th><th>Score Final</th><th style={{ textAlign: 'right' }}>Acción</th></tr></thead>
                  <tbody>
                    {data.evaluacionesCerradas.map(e => <tr key={e.id}>
                      <td style={{ fontWeight: 600 }}>{e.plantilla?.nombre || 'Evaluación'}</td>
                      <td><span className="badge badge-cyan">{e.score_final ?? '-'}</span></td>
                      <td style={{ textAlign: 'right' }}><button className="btn btn-secondary btn-sm" onClick={() => navigate('evaluaciones_desempeno', { resultado: e.id })}>Ver resultados</button></td>
                    </tr>)}
                    {!data.evaluacionesCerradas.length && <tr><td colSpan="3" className="text-muted" style={{ padding: 16, textAlign: 'center' }}>Sin resultados cerrados publicados.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'datos' && (
            <div className="card">
              <div className="card-head"><h3>Datos registrados</h3></div>
              <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                {Object.entries(campoLabels).map(([k, label]) => (
                  <div key={k} className="input-group">
                    <label>{label}</label>
                    <div style={{ fontWeight: 600, fontSize: 14, minHeight: 34, display: 'flex', alignItems: 'center' }}>{campoValor(data.misDatos?.[k])}</div>
                  </div>
                ))}
              </div>
              <div className="card-body" style={{ paddingTop: 0 }}>
                <div className="text-muted" style={{ fontSize: 12 }}>Los cambios sensibles, como datos bancarios, quedan sujetos a aprobación de RRHH.</div>
              </div>

              <div className="card-head" style={{ borderTop: '1px solid var(--border)' }}><h3>Proponer actualización</h3></div>
              <div className="card-body" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="input-group" style={{ flex: 1, minWidth: 200 }}><label>Campo</label><select className="select" value={datoForm.campo} onChange={e => setDatoForm(v => ({ ...v, campo: e.target.value }))}>{camposPermitidos.map(c => <option key={c} value={c}>{campoLabels[c] || c}</option>)}</select></div>
                <div className="input-group" style={{ flex: 2, minWidth: 240 }}><label>Nuevo valor</label><input className="input" value={datoForm.valor} onChange={e => setDatoForm(v => ({ ...v, valor: e.target.value }))} /></div>
                <div className="input-group"><button className="btn btn-primary" style={{ height: 36 }} onClick={enviarDato}>Enviar a RRHH</button></div>
              </div>
              {datoForm.campo === 'datos_bancarios' && <div style={{ padding: '0 16px 16px' }}><div className="alert alert-warning" style={{ fontSize: 12, margin: 0 }}>Campo sensible: RRHH debe validar la evidencia antes de aplicar el cambio.</div></div>}

              <div className="card-head" style={{ borderTop: '1px solid var(--border)' }}><h3>Mis solicitudes de actualización</h3></div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Campo</th><th>Valor anterior</th><th>Valor propuesto</th><th>Estado</th></tr></thead>
                  <tbody>
                    {data.datosSolicitudes.map(s => <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{campoLabels[s.campo] || s.campo}</td>
                      <td className="text-muted">{campoValor(s.valor_anterior)}</td>
                      <td>{campoValor(s.valor_propuesto)}</td>
                      <td><span className={'badge ' + (s.estado === 'aprobado' ? 'badge-green' : s.estado === 'rechazado' ? 'badge-red' : 'badge-orange')}>{s.estado}</span></td>
                    </tr>)}
                    {!data.datosSolicitudes.length && <tr><td colSpan="4" className="text-muted" style={{ padding: 16, textAlign: 'center' }}>Sin solicitudes enviadas.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'constancias' && (
            <div className="card">
              <div className="card-head"><h3>Solicitar constancia</h3><span className="badge badge-gray">{empresaConfig?.portal_constancia_emision_directa ? 'Emisión directa' : 'Con aprobación'}</span></div>
              <div className="card-body" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="input-group" style={{ flex: 1 }}><label>Propósito opcional (ej: Banco, alquiler, trámite interno)</label><input className="input" value={constanciaProposito} onChange={e => setConstanciaProposito(e.target.value)} placeholder="Escribe el propósito..." /></div>
                <div className="input-group"><button className="btn btn-primary" style={{ height: 36 }} onClick={solicitarConstancia}>Solicitar constancia</button></div>
              </div>

              <div className="card-head" style={{ borderTop: '1px solid var(--border)' }}><h3>Historial de constancias</h3></div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Propósito</th><th>Hash del Documento</th><th>Estado</th><th style={{ textAlign: 'right' }}>Acción</th></tr></thead>
                  <tbody>
                    {data.constancias.map(c => {
                      const href = constanciaHref(c);
                      return <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.proposito || 'Constancia de trabajo'}</td>
                        <td className="mono text-muted">{c.documento_hash || '-'}</td>
                        <td><span className={'badge ' + (c.estado === 'emitida' ? 'badge-green' : c.estado === 'rechazada' ? 'badge-red' : 'badge-orange')}>{c.estado}</span></td>
                        <td style={{ textAlign: 'right' }}>{href ? <a className="btn btn-secondary btn-sm" href={href} target="_blank" rel="noreferrer">Abrir</a> : '-'}</td>
                      </tr>;
                    })}
                    {!data.constancias.length && <tr><td colSpan="4" className="text-muted" style={{ padding: 16, textAlign: 'center' }}>Sin constancias solicitadas.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'boletas' && (
            <div className="card">
              <div className="card-head"><h3>Mis boletas</h3></div>
              <div className="card-body" style={{ padding: '0 16px 16px' }}>
                <div className="text-muted" style={{ fontSize: 12 }}>La confirmación de recepción deja constancia de entrega electrónica y no implica aceptación del contenido de la boleta.</div>
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Periodo</th><th>Estado</th><th>Acuse</th><th>Neto</th><th style={{ textAlign: 'right' }}>Acción</th></tr></thead>
                  <tbody>
                    {data.boletas.map(b => <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>{b.periodo}</td>
                      <td><span className="badge badge-green">Cerrado</span></td>
                      <td>{b.acuse ? <span className="badge badge-green">Acusada</span> : <span className="badge badge-orange">Pendiente</span>}</td>
                      <td className="mono">{money(b.detalle?.neto)}</td>
                      <td style={{ textAlign: 'right' }}><button className="btn btn-secondary btn-sm" onClick={() => abrirBoleta(b)}>{b.acuse ? 'Abrir' : 'Reautenticar y abrir'}</button></td>
                    </tr>)}
                    {!data.boletas.length && <tr><td colSpan="5" className="text-muted" style={{ padding: 16, textAlign: 'center' }}>Sin boletas disponibles.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'contratos' && (
            <div className="card">
              <div className="card-head"><h3>Contratos vigentes / requeridos</h3></div>
              <div className="card-body">
                {data.resumen?.contrato?.estado === 'sin_contrato' && !data.ficha?.cargo_confianza && (
                  <div className="alert alert-danger" style={{ fontSize: 12, marginBottom: 12, padding: '10px 14px' }}>Tu asistencia está bloqueada hasta que RRHH registre tu contrato digital. Consulta con RRHH.</div>
                )}
                <div className="text-muted" style={{ fontSize: 12, marginBottom: 16 }}>La firma electrónica avanzada queda disponible cuando RRHH active el parámetro del tenant y exista contrato pendiente.</div>
                
                {docsPendientesFirma.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>Tienes documentos pendientes de firma enviados por RRHH.</div>
                    <button className="btn btn-primary" onClick={() => setTab('firma')}>Ir a Firma y consentimiento →</button>
                  </div>
                )}

                {(() => {
                  const contratosAMostrar = data.contratos.filter(c => c.activo || c.estado_validacion === 'pendiente' || c.estado_validacion === 'rechazado' || c.estado_validacion === 'aprobado');
                  
                  if (contratosAMostrar.length === 0) {
                    return (
                      <div className="alert alert-info" style={{ fontSize: 12, padding: '10px 14px' }}>
                        Tu contrato será cargado por RRHH. Recibirás una notificación cuando esté disponible para que puedas revisarlo y firmarlo.
                      </div>
                    );
                  }

                  // Separar Primigenio y Laboral
                  const primigenios = contratosAMostrar.filter(c => {
                    const tInfo = tiposDocumento?.find(t => t.id === c.tipo_documento_id || t.nombre === c.tipo_doc || t.codigo === c.tipo_doc);
                    return tInfo && !!tInfo.tipo_sucesor_id; // Es predecesor = Primigenio
                  });

                  const laborales = contratosAMostrar.filter(c => {
                    const tInfo = tiposDocumento?.find(t => t.id === c.tipo_documento_id || t.nombre === c.tipo_doc || t.codigo === c.tipo_doc);
                    return !tInfo || !tInfo.tipo_sucesor_id; // No es predecesor = Laboral
                  });

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {primigenios.map(primigenio => (
                        <div key={primigenio.id} className="card" style={{ padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ fontWeight: 600 }}>Contrato Original</div>
                            <span className="badge badge-gray">Contrato original</span>
                          </div>
                          <div className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
                            Documento histórico que establece las condiciones iniciales de tu relación laboral.
                          </div>
                          <div className="row" style={{ gap: 8 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => verDocumento(primigenio)}>Ver</button>
                            {primigenio.archivo_url && (
                              <a href={primigenio.archivo_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">Descargar</a>
                            )}
                          </div>
                        </div>
                      ))}

                      {laborales.map(laboral => (
                        <div key={laboral.id} className="card" style={{ padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ fontWeight: 600 }}>Renovación de Contrato</div>
                            {laboral.estado_validacion === 'aprobado' ? (
                              <span className="badge badge-green">Renovación vigente</span>
                            ) : laboral.estado_validacion === 'pendiente' ? (
                              <span className="badge badge-orange">En revisión</span>
                            ) : laboral.estado_validacion === 'rechazado' ? (
                              <span className="badge badge-red">Rechazado</span>
                            ) : (
                              <span className="badge badge-gray">{laboral.estado_validacion}</span>
                            )}
                          </div>

                          {laboral.estado_validacion === 'pendiente' && (
                            <div className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
                              Tu contrato está siendo revisado por RRHH.
                            </div>
                          )}
                          {laboral.estado_validacion === 'rechazado' && (
                            <div className="alert alert-danger" style={{ fontSize: 12, padding: '8px 12px', marginBottom: 12 }}>
                              RRHH rechazó el documento. Espera instrucciones.
                            </div>
                          )}

                          <div className="row" style={{ gap: 8 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => verDocumento(laboral)}>Ver</button>
                            {laboral.archivo_url && (
                              <a href={laboral.archivo_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">Descargar</a>
                            )}
                            {laboral.estado_validacion === 'aprobado' && (
                              <label className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                                {uploading === 'contrato' ? 'Subiendo...' : <span style={{display:'flex',gap:6,alignItems:'center'}}><span style={{width:14,height:14}}>{I.upload}</span> Subir versión firmada</span>}
                                <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => subirDocumento(e.target.files?.[0], 'contrato')} />
                              </label>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="card-head" style={{ borderTop: '1px solid var(--border)' }}><h3>Historial de contratos</h3></div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Documento</th><th>Fecha de vencimiento</th><th>Estado validación</th><th style={{ textAlign: 'right' }}>Acción</th></tr></thead>
                  <tbody>
                    {(() => {
                      const visibleContratos = data.contratos.filter(d => {
                        const tInfo = tiposDocumento?.find(t => t.id === d.tipo_documento_id || t.nombre === d.tipo_doc || t.codigo === d.tipo_doc);
                        const isPredecesor = tInfo && !!tInfo.tipo_sucesor_id;
                        if (isPredecesor && d.estado_validacion !== 'aprobado' && d.estado_validacion !== 'vigente') {
                          return false;
                        }
                        return true;
                      });

                      const periodosMap = {};
                      const sinGrupo = [];
                      visibleContratos.forEach(d => {
                        if (!d.periodo_grupo_id) {
                          sinGrupo.push(d);
                          return;
                        }
                        if (!periodosMap[d.periodo_grupo_id]) {
                          periodosMap[d.periodo_grupo_id] = { id: d.periodo_grupo_id, docs: [], activo: false, fechaInicio: d.fecha_emision || 'Sin fecha', fechaFin: d.fecha_vencimiento || 'Sin fecha' };
                        }
                        periodosMap[d.periodo_grupo_id].docs.push(d);
                        if (d.activo) periodosMap[d.periodo_grupo_id].activo = true;
                        if (!periodosMap[d.periodo_grupo_id].docRepresentativo || (d.version > (periodosMap[d.periodo_grupo_id].docRepresentativo.version || 0))) {
                          periodosMap[d.periodo_grupo_id].docRepresentativo = d;
                          periodosMap[d.periodo_grupo_id].fechaInicio = d.fecha_emision || periodosMap[d.periodo_grupo_id].fechaInicio;
                          periodosMap[d.periodo_grupo_id].fechaFin = d.fecha_vencimiento || periodosMap[d.periodo_grupo_id].fechaFin;
                        }
                      });

                      const hoyStr = new Date().toISOString().slice(0, 10);
                      Object.values(periodosMap).forEach(g => {
                        const tieneActivoAprobado = g.docs.some(v => v.activo && v.estado_validacion === 'aprobado');
                        const fVenc = g.fechaFin !== 'Sin fecha' ? g.fechaFin : null;
                        const fIni = g.fechaInicio !== 'Sin fecha' ? g.fechaInicio : null;

                        if (fIni && fIni > hoyStr) {
                          g.badge_color = 'badge-cyan';
                          g.badge_texto = `Futuro · inicia ${fIni}`;
                        } else if (fVenc && fVenc < hoyStr && !g.activo) {
                          g.badge_color = 'badge-gray';
                          g.badge_texto = 'Archivado';
                        } else if ((!fVenc || fVenc >= hoyStr) && tieneActivoAprobado) {
                          g.badge_color = 'badge-green';
                          g.badge_texto = 'Período activo';
                        } else {
                          g.badge_color = 'badge-orange';
                          g.badge_texto = 'Pendiente de activación';
                        }
                      });

                      const periodos = Object.values(periodosMap).sort((a, b) => {
                        if (a.activo && !b.activo) return -1;
                        if (b.activo && !a.activo) return 1;
                        return (b.fechaInicio || '').localeCompare(a.fechaInicio || '');
                      });

                      const renderDocRow = (d) => {
                        const tInfo = tiposDocumento?.find(t => t.id === d.tipo_documento_id || t.nombre === d.tipo_doc || t.codigo === d.tipo_doc);
                        const isPredecesor = tInfo && !!tInfo.tipo_sucesor_id;
                        const isSucesor = tInfo && tiposDocumento.some(t => t.tipo_sucesor_id === tInfo.id);

                        let isPendienteFirma = (d.estado_validacion === 'pendiente_firma' || d.estado_firma === 'pendiente_trabajador') || (d.estado_validacion === 'pendiente' && d.subido_desde === 'backoffice');
                        let isPendienteValidacion = d.estado_validacion === 'pendiente' && d.subido_desde === 'mobile';
                        let isEnRevision = d.estado_validacion === 'en_revision' || (d.estado_validacion === 'pendiente' && d.subido_desde !== 'mobile' && d.subido_desde !== 'backoffice');
                        let isAprobado = d.estado_validacion === 'aprobado' || d.estado_validacion === 'vigente';
                        let isRechazado = d.estado_validacion === 'rechazado';
                        let yaSubioFirmado = isAprobado && (personalDocumentos || []).some(pd =>
                          pd.personal_id === ficha?.id &&
                          (pd.tipo_documento_id === d.tipo_documento_id || pd.tipo_doc === d.tipo_doc) &&
                          pd.estado_validacion === 'pendiente' && pd.subido_desde === 'mobile' && pd.activo === false
                        );
                        
                        let subtext = d.estado_validacion || 'registrado';
                        let badgeClass = 'badge-gray';
                        let extraAyuda = null;

                        if (isPredecesor) {
                          subtext = 'Contrato original';
                          badgeClass = 'badge-gray';
                          extraAyuda = 'Documento histórico. No requiere acción.';
                          isPendienteFirma = false;
                          isAprobado = false; // Hide Subir firmado
                        } else if (isSucesor) {
                          if (isAprobado) {
                            subtext = 'Renovación vigente';
                            badgeClass = 'badge-cyan';
                          } else if (isEnRevision || isPendienteFirma || isPendienteValidacion) {
                            subtext = 'En revisión';
                            badgeClass = 'badge-orange';
                            isPendienteFirma = false; // Disable signing
                            extraAyuda = 'Tu contrato está siendo revisado por RRHH.';
                          } else if (isRechazado) {
                            subtext = 'Rechazado';
                            badgeClass = 'badge-red';
                          }
                        } else {
                          if (isPendienteFirma) { subtext = 'Esperando tu firma'; badgeClass = 'badge-orange'; }
                          else if (isPendienteValidacion) { subtext = 'Pendiente de validación'; badgeClass = 'badge-orange'; }
                          else if (isEnRevision) { subtext = 'En revisión por RRHH'; badgeClass = 'badge-cyan'; }
                          else if (isAprobado) { subtext = 'Vigente'; badgeClass = 'badge-green'; }
                          else if (isRechazado) { subtext = 'Rechazado'; badgeClass = 'badge-red'; }
                        }

                        const badgeStr = d.version ? `v${d.version}` : '';

                        return (
                          <tr key={d.id}>
                            <td style={{ fontWeight: 600 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {getNombreDoc(d)} {badgeStr && <span className="badge badge-gray" style={{ fontSize: 10 }}>{badgeStr}</span>}
                              </div>
                              {isPendienteValidacion && d.creado_en && (
                                <div className="text-muted" style={{ fontSize: 11, marginTop: 4, fontWeight: 400 }}>
                                  Enviado el {new Date(d.creado_en).toLocaleString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                                </div>
                              )}
                              {isRechazado && d.motivo_rechazo && (
                                <div className="text-muted" style={{ fontSize: 11, marginTop: 4, fontWeight: 400 }}>
                                  {d.motivo_rechazo}
                                </div>
                              )}
                              {extraAyuda && (
                                <div className="text-muted" style={{ fontSize: 11, marginTop: 4, fontWeight: 400 }}>
                                  {extraAyuda}
                                </div>
                              )}
                            </td>
                            <td>{d.fecha_vencimiento || 'Sin vencimiento'}</td>
                            <td><span className={`badge ${badgeClass}`}>{subtext}</span></td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => abrirDoc(d)}>Ver</button>
                                {isAprobado && !yaSubioFirmado && (
                                  <button className="btn btn-primary btn-sm" onClick={() => setModalSubirContrato(d)}>Subir firmado</button>
                                )}
                                {isAprobado && yaSubioFirmado && (
                                  <span className="badge badge-orange">Pendiente de validación</span>
                                )}
                                {isPendienteFirma && (
                                  <button className="btn btn-primary btn-sm" onClick={() => setModalSubirContrato(d)}>Subir firmado</button>
                                )}
                                {isRechazado && (
                                  <button className="btn btn-primary btn-sm" onClick={() => setModalSubirContrato(d)}>Subir nueva versión</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      };

                      if (data.contratos.length === 0) return <tr><td colSpan="4" className="text-muted" style={{ padding: 16, textAlign: 'center' }}>Sin contratos registrados.</td></tr>;

                      return (
                        <>
                          {periodos.map(periodo => (
                            <React.Fragment key={periodo.id}>
                              <tr style={{ background: 'var(--bg-subtle)' }}>
                                <td colSpan="4" style={{ padding: '8px 12px', fontWeight: 600, fontSize: 12, color: 'var(--fg-muted)', textTransform: 'uppercase' }}>
                                  {periodo.badge_texto || (periodo.activo ? 'Período activo' : 'Período archivado')} ({periodo.fechaInicio} → {periodo.fechaFin})
                                </td>
                              </tr>
                              {periodo.docs.sort((a, b) => (b.version || 0) - (a.version || 0)).map(d => renderDocRow(d))}
                            </React.Fragment>
                          ))}
                          {sinGrupo.length > 0 && (
                            <React.Fragment>
                              <tr style={{ background: 'var(--bg-subtle)' }}>
                                <td colSpan="4" style={{ padding: '8px 12px', fontWeight: 600, fontSize: 12, color: 'var(--fg-muted)', textTransform: 'uppercase' }}>
                                  Documentos anteriores
                                </td>
                              </tr>
                              {sinGrupo.sort((a, b) => String(b.fecha_emision || b.creado_en || '').localeCompare(String(a.fecha_emision || a.creado_en || ''))).map(d => renderDocRow(d))}
                            </React.Fragment>
                          )}
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'firma' && (
            <>
            {docsPendientesFirma.length > 0 && (
              <div className="card" style={{ marginBottom: 14 }}>
                <div className="card-head"><h3>Documentos pendientes de firma</h3><span className="badge badge-orange">{docsPendientesFirma.length} pendiente{docsPendientesFirma.length !== 1 ? 's' : ''}</span></div>
                <div className="card-body" style={{ padding: '0 16px 16px' }}>
                  <div className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
                    RRHH ha enviado estos documentos para tu firma. Descarga el PDF, firmalo fisicamente, escanea o fotografía y cargalo con el boton "Subir firmado".
                  </div>
                  {docsPendientesFirma.map(d => (
                    <div key={d.id} style={{ padding: '12px 0', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontWeight: 600 }}>{getNombreDoc(d)}</div>
                        <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {d.enviado_a_firma_en ? `Enviado el ${d.enviado_a_firma_en.slice(0, 10)}` : 'Enviado por RRHH'}
                          {d.enviado_a_firma_mensaje ? ` · "${d.enviado_a_firma_mensaje}"` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
                        {d.archivo_url && (
                          <button onClick={() => abrirDoc(d)} className="btn btn-sm btn-secondary">Ver documento</button>
                        )}
                        {ficha.firma_onboarding_completo
                          ? <button className="btn btn-sm btn-ghost" style={{ color: 'var(--fg-muted)', cursor: 'default' }} disabled title="La firma electronica avanzada se habilitara en una proxima version">Firma electronica (proximamente)</button>
                          : (
                            <label className="btn btn-sm btn-primary" style={{ cursor: 'pointer' }}>
                              {uploading === d.id ? 'Subiendo...' : 'Subir firmado'}
                              <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
                                onChange={e => subirDocumentoFirmado(e.target.files?.[0], d)} />
                            </label>
                          )
                        }
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="card">
              <div className="card-head"><h3>Consentimiento y canal OTP</h3><span className={'badge ' + (ficha.firma_onboarding_completo ? 'badge-green' : 'badge-orange')}>{ficha.firma_onboarding_completo ? 'Completo' : 'Pendiente'}</span></div>
              <div className="card-body">
                {!empresaConfig?.portal_firma_contratos_activa && <div className="alert alert-warning" style={{ fontSize: 12, marginBottom: 16, padding: '10px 14px' }}>La firma de contratos está apagada por parámetro del tenant.</div>}
                <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                  <div className="input-group"><label>Teléfono personal</label><input className="input" value={firmaForm.telefono_personal} placeholder={ficha.telefono_personal || ficha.telefono || ''} onChange={e => setFirmaForm(v => ({ ...v, telefono_personal: e.target.value }))} /></div>
                  <div className="input-group"><label>Celular personal (WhatsApp)</label><input className="input" value={firmaForm.celular_personal} placeholder={ficha.celular_personal || ficha.telefono_personal || ficha.telefono || ''} onChange={e => setFirmaForm(v => ({ ...v, celular_personal: e.target.value }))} /></div>
                  <div className="input-group"><label>Email personal</label><input className="input" value={firmaForm.email_personal} placeholder={ficha.email_personal || ficha.email || ''} onChange={e => setFirmaForm(v => ({ ...v, email_personal: e.target.value }))} /></div>
                  <div className="input-group"><label>Canal OTP</label><select className="select" value={firmaForm.firma_otp_canal} onChange={e => setFirmaForm(v => ({ ...v, firma_otp_canal: e.target.value }))}><option value="email_personal">Email personal</option><option value="telefono_personal">SMS/WhatsApp</option></select></div>
                </div>
                <label className="row" style={{ gap: 10, marginTop: 12, fontSize: 13, cursor: 'pointer', background: 'var(--bg-subtle)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <input type="checkbox" checked={firmaForm.consentimiento_entrega_electronica} onChange={e => setFirmaForm(v => ({ ...v, consentimiento_entrega_electronica: e.target.checked }))} style={{ width: 16, height: 16 }} /> 
                  <strong>Acepto entrega electrónica de boletas y uso de evidencias de firma.</strong>
                </label>
                <div className="row" style={{ gap: 8, marginTop: 16 }}>
                  <button className="btn btn-secondary" onClick={guardarFirma}>Guardar</button>
                  <button className="btn btn-primary" onClick={enviarOtpFirma}>Enviar OTP</button>
                </div>
                {otpActivo && <div className="row" style={{ gap: 8, marginTop: 16, background: 'var(--cyan-lt)', padding: 12, borderRadius: 8, border: '1px solid rgba(0,178,198,0.22)' }}>
                  <input className="input" value={otpCodigo} onChange={e => setOtpCodigo(e.target.value)} placeholder="Código OTP" style={{ maxWidth: 180, background: '#fff' }} />
                  <button className="btn btn-primary" onClick={validarOtp}>Validar OTP</button>
                </div>}
              </div>

              <div className="card-head" style={{ borderTop: '1px solid var(--border)' }}><h3>Evidencias de firma</h3></div>
              <div className="card-body" style={{ padding: '0 16px 16px' }}>
                <div className="text-muted" style={{ fontSize: 12 }}>Los registros de firma son append-only e incluyen hash original, hash firmado, canal OTP y estado TSA.</div>
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Documento / Autorización</th><th>Hash firmado</th><th>TSA Estado</th></tr></thead>
                  <tbody>
                    {data.firmaRegistros.map(f => <tr key={f.id}>
                      <td style={{ fontWeight: 600 }}>{f.contrato_documento_id || 'Autorización/firma'}</td>
                      <td className="mono text-muted">{f.hash_firmado || '-'}</td>
                      <td><span className="badge badge-gray">{f.tsa_estado || '-'}</span></td>
                    </tr>)}
                    {!data.firmaRegistros.length && <tr><td colSpan="3" className="text-muted" style={{ padding: 16, textAlign: 'center' }}>Sin evidencias de firma registradas.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            </>
          )}

          {tab === 'asistencia' && (
            <div className="card">
              <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Mi asistencia mensual</h3>
                <input className="input" type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} style={{ maxWidth: 180 }} />
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Tardanza</th><th>HE</th><th>Estado</th></tr></thead>
                  <tbody>
                    {data.asistencia.map(r => <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.fecha}</td>
                      <td>{r.hora_entrada || '-'}</td>
                      <td>{r.hora_salida || '-'}</td>
                      <td>{r.tardanza_min || r.tardanza_minutos || 0} min</td>
                      <td>{minToHours(r.horas_extra_min || Number(r.horas_extra || 0) * 60)} {r.he_autorizada ? <span className="badge badge-green">Aut.</span> : ''}</td>
                      <td>{r.estado || '-'}</td>
                    </tr>)}
                    {!data.asistencia.length && <tr><td colSpan="6" className="text-muted" style={{ padding: 16, textAlign: 'center' }}>Sin registros de asistencia para este periodo.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'solicitudes' && (
            <div className="card">
              <div className="card-head">
                <h3>Mis solicitudes</h3>
                <button className="btn btn-primary btn-sm" onClick={() => navigate('solicitudes_rrhh')}>Nueva solicitud</button>
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Tipo</th><th>Fechas</th><th>Días hábiles</th><th>Estado</th></tr></thead>
                  <tbody>
                    {data.solicitudes.map(s => <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{s.tipo}</td>
                      <td>{s.fecha_inicio} al {s.fecha_fin}</td>
                      <td>{s.dias_habiles || '-'}</td>
                      <td><span className="badge badge-cyan" style={{ textTransform: 'capitalize' }}>{String(s.estado || '').replace(/_/g, ' ')}</span></td>
                    </tr>)}
                    {!data.solicitudes.length && <tr><td colSpan="4" className="text-muted" style={{ padding: 16, textAlign: 'center' }}>Sin solicitudes registradas.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'he' && (
            <div className="card">
              <div className="card-head"><h3>Mis horas extra</h3></div>
              <div className="card-body" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div className="font-display" style={{ fontSize: 48, fontWeight: 900, color: 'var(--navy)' }}>{minToHours(data.resumen?.he_pendiente_minutos)}</div>
                <div className="text-muted" style={{ marginTop: 8 }}>Saldo pendiente de compensación desde la misma fuente de nómina.</div>
              </div>
            </div>
          )}

          {tab === 'documentos' && (
            <div className="card">
              <div className="card-head"><h3>Mis documentos personales</h3></div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Documento</th><th>Vencimiento</th><th>Estado validación</th><th style={{ textAlign: 'right' }}>Acción</th></tr></thead>
                  <tbody>
                    {data.documentos.map(d => <tr key={d.id}>
                      <td style={{ fontWeight: 600 }}>{getNombreDoc(d)}</td>
                      <td>{d.fecha_vencimiento || 'No aplica'}</td>
                      <td><span className="badge badge-gray">{d.estado_validacion || 'registrado'}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        <label className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', margin: 0, cursor: 'pointer' }}>
                          Renovar
                          <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={e => subirDocumento(e.target.files?.[0], d.tipo_doc || 'documento')} />
                        </label>
                      </td>
                    </tr>)}
                    {!data.documentos.length && <tr><td colSpan="4" className="text-muted" style={{ padding: 16, textAlign: 'center' }}>Sin documentos personales registrados.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'prestamos' && (
            <div className="card">
              <div className="card-head"><h3>Mis préstamos y adelantos</h3></div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Concepto</th><th>Saldo</th><th>Cuotas Pagadas</th><th>Estado</th></tr></thead>
                  <tbody>
                    {data.prestamos.map(p => <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.concepto || p.motivo}</td>
                      <td className="mono">{money(p.saldo || 0)}</td>
                      <td>{p.cuotas_pagadas || 0} / {p.cuotas || '-'}</td>
                      <td><span className="badge badge-cyan" style={{ textTransform: 'capitalize' }}>{p.estado}</span></td>
                    </tr>)}
                    {!data.prestamos.length && <tr><td colSpan="4" className="text-muted" style={{ padding: 16, textAlign: 'center' }}>Sin préstamos registrados.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'amonestaciones' && (
            <div className="card">
              <div className="card-head"><h3>Mis amonestaciones</h3></div>
              <div className="card-body" style={{ padding: '0 16px 16px' }}>
                <div className="text-muted" style={{ fontSize: 12 }}>El acuse deja constancia de notificación en el sistema; no implica aceptación del contenido de la amonestación.</div>
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Tipo</th><th>Gravedad</th><th>Descripción / Motivo</th><th>Acuse de Recibo</th><th style={{ textAlign: 'right' }}>Acción</th></tr></thead>
                  <tbody>
                    {data.amonestaciones.map(a => <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{a.tipo || 'Amonestación'}</td>
                      <td><span className="badge badge-orange">{a.gravedad || 'Activa'}</span></td>
                      <td style={{ maxWidth: 300, whiteSpace: 'normal', lineHeight: 1.4 }}>{a.descripcion || a.motivo}</td>
                      <td>{a.acusado_en ? <span className="badge badge-green">Acusado el {(a.acusado_en || '').slice(0, 10)}</span> : <span className="badge badge-orange">Pendiente</span>}</td>
                      <td style={{ textAlign: 'right' }}>
                        {!a.acusado_en ? <button className="btn btn-primary btn-sm" onClick={() => acusarAmonestacion(a)}>Me doy por enterado</button> : '-'}
                      </td>
                    </tr>)}
                    {!data.amonestaciones.length && <tr><td colSpan="5" className="text-muted" style={{ padding: 16, textAlign: 'center' }}>Sin amonestaciones activas.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {modalSubirContrato && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { setModalSubirContrato(null); setFileSubir(null); }}>
          <div className="card" style={{ width: '100%', maxWidth: 450, padding: 24, margin: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Subir contrato firmado</div>
            <div className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>Por favor, sube una copia escaneada o foto legible de tu contrato firmado ({getNombreDoc(modalSubirContrato)}).</div>
            
            <label className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginBottom: 12, padding: 14 }}>
              {fileSubir ? fileSubir.name : 'Seleccionar archivo (PDF, JPG, PNG)'}
              <input type="file" accept="application/pdf,image/*" capture="environment" style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f && f.size > 20 * 1024 * 1024) { addNotificacion('El archivo excede los 20MB', 'error'); return; }
                  setFileSubir(f);
                }} />
            </label>
            
            <div className="row" style={{ gap: 12, marginTop: 24 }}>
              <button className="btn btn-ghost flex-1" onClick={() => { setModalSubirContrato(null); setFileSubir(null); }}>Cancelar</button>
              <button className="btn btn-primary flex-1" onClick={confirmarSubidaContrato} disabled={!fileSubir || uploading === 'contrato'}>{uploading === 'contrato' ? 'Subiendo...' : 'Confirmar subida'}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
