import React, { useMemo, useState } from 'react';
import { I } from './icons.jsx';
import { useApp } from './context.jsx';
import { construirAutoservicioLocal } from './services/autoservicioEmpleadoService.js';
import { isSupabaseConfigured } from './lib/supabaseClient.js';
import { autoservicioEmpleadoService } from './services/autoservicioEmpleadoService.js';

const minToHours = min => `${Math.round(Number(min || 0) / 60 * 10) / 10} h`;
const estadoContratoLabel = c => c?.estado === 'por_vencer' ? `Por vencer (${c.dias} dias)` : c?.estado || 'Sin contrato';

function EmptyPortal() {
  return (
    <div className="card" style={{ padding: 28, textAlign: 'center' }}>
      <div style={{ width: 48, height: 48, margin: '0 auto 12px', color: 'var(--cyan)' }}>{I.userCheck}</div>
      <h2 className="font-display" style={{ margin: 0 }}>Sin ficha vinculada</h2>
      <p className="text-muted" style={{ marginTop: 8 }}>Tu usuario aun no esta asociado a una ficha de Personal Operativo o Administrativo.</p>
    </div>
  );
}

function PortalResumen({ data }) {
  const cards = [
    { label: 'Contrato', value: estadoContratoLabel(data.resumen?.contrato), icon: I.file, badge: data.resumen?.contrato?.estado },
    { label: 'Ultima boleta', value: data.resumen?.ultima_boleta?.periodo || 'Sin boletas', icon: I.receipt },
    { label: 'Vacaciones', value: `${data.resumen?.vacaciones || 0} dias`, icon: I.calendar },
    { label: 'HE pendiente', value: minToHours(data.resumen?.he_pendiente_minutos), icon: I.clock },
  ];
  return (
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
  );
}

export function MiPortal() {
  const app = useApp();
  const {
    authUser, usuarios, personalAdmin, personalOperativo, personalDocumentos, solicitudesRRHH,
    registrosAsistencia, periodosNomina, trabajadoresDatosNomina, amonestacionesPersonal,
    setAmonestacionesPersonal, subirDocumentoPersonalCtx, navigate, addNotificacion,
  } = app;
  const [tab, setTab] = useState('resumen');
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7));
  const [uploading, setUploading] = useState('');

  const data = useMemo(() => construirAutoservicioLocal({
    authUser, usuarios, personalAdmin, personalOperativo, personalDocumentos, solicitudesRRHH,
    registrosAsistencia, periodosNomina, trabajadoresDatosNomina, amonestaciones: amonestacionesPersonal,
    notificaciones: app.notificaciones, periodo,
  }), [authUser, usuarios, personalAdmin, personalOperativo, personalDocumentos, solicitudesRRHH, registrosAsistencia, periodosNomina, trabajadoresDatosNomina, amonestacionesPersonal, app.notificaciones, periodo]);

  const ficha = data.ficha;

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

  const acusar = async (amonestacion) => {
    try {
      let actualizado = { ...amonestacion, acusado_en: new Date().toISOString(), acusado_por_user_id: authUser?.id || null };
      if (isSupabaseConfigured()) actualizado = await autoservicioEmpleadoService.acusarAmonestacion(amonestacion.id);
      setAmonestacionesPersonal(prev => prev.map(a => a.id === amonestacion.id ? actualizado : a));
      addNotificacion('Acuse registrado.');
    } catch (err) {
      addNotificacion(err.message || 'No se pudo registrar el acuse.');
    }
  };

  const tabs = [
    ['resumen', 'Resumen', I.dashboard],
    ['boletas', 'Mis boletas', I.receipt],
    ['contratos', 'Mis contratos', I.file],
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
          <div className="tabs" style={{ flexWrap: 'wrap' }}>
            {tabs.map(([k, label, icon]) => <button key={k} className={'tab ' + (tab === k ? 'active' : '')} onClick={() => setTab(k)}>{icon} {label}</button>)}
          </div>

          {tab === 'resumen' && (
            <>
              <PortalResumen data={data} />
              <div className="card" style={{ padding: 16, marginTop: 14 }}>
                <div className="card-head"><h3>Notificaciones laborales</h3></div>
                {(data.notificaciones || []).slice(0, 5).map(n => <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>{n.title && <strong>{n.title}: </strong>}{n.text}</div>)}
                {!data.notificaciones?.length && <div className="text-muted">Sin notificaciones activas.</div>}
              </div>
            </>
          )}

          {tab === 'boletas' && (
            <div className="card p-0">
              <table className="table"><thead><tr><th>Periodo</th><th>Estado</th><th>Descarga</th></tr></thead><tbody>
                {data.boletas.map(b => <tr key={b.id}><td>{b.periodo}</td><td><span className="badge badge-green">Cerrado</span></td><td>{b.archivo_url ? <a className="btn btn-secondary btn-sm" href={b.archivo_url} target="_blank">Descargar</a> : <button className="btn btn-secondary btn-sm">Generar PDF</button>}</td></tr>)}
              </tbody></table>
            </div>
          )}

          {tab === 'contratos' && (
            <div className="grid cols-2">
              <div className="card" style={{ padding: 16 }}>
                <div className="card-head"><h3>Contrato vigente</h3><span className="badge badge-cyan">{estadoContratoLabel(data.resumen?.contrato)}</span></div>
                <div className="text-muted">La firma digital se integrara en GAP-18. Aqui queda el punto para la accion Firmar junto al contrato pendiente.</div>
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
                {a.acusado_en ? <span className="badge badge-green" style={{ marginTop: 12 }}>Notificado y acusado {(a.acusado_en || '').slice(0, 10)}</span> : <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => acusar(a)}>Me doy por enterado</button>}
              </div>)}
              {!data.amonestaciones.length && <div className="text-muted">Sin amonestaciones activas.</div>}
            </div>
          )}
        </>
      )}

      {/* Backlog Fase 2:
        - Boletas: acuse por re-autenticacion, hash SHA-256 del PDF, consentimiento de entrega electronica y retencion minima 5 anios.
        - Contratos: firma electronica avanzada propia para renovaciones/adendas, OTP a canal personal, rubrica digitalizada, certificado de evidencias y sello TSA.
        - Mis datos: propuestas de actualizacion con aprobacion RRHH.
        - Constancias de trabajo, evaluaciones, directorio/organigrama y encuestas de clima.
      */}
    </div>
  );
}
