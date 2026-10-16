import React, { useEffect, useState } from 'react';
import { contratoFirmaService } from './contratoFirmaService.js';

const mensajesEstado = {
  expirado: 'Este enlace venció. Contacta con Recursos Humanos para solicitar uno nuevo.',
  anulado: 'Esta solicitud fue anulada. Contacta con Recursos Humanos.',
  firmado: 'Este contrato ya fue firmado electrónicamente.',
};

export default function PaginaFirmarContrato({ token }) {
  const [info, setInfo] = useState(null);
  const [canal, setCanal] = useState('whatsapp');
  const [otp, setOtp] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [paso, setPaso] = useState('cargando');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [pdfFirmado, setPdfFirmado] = useState('');
  const cargar = async () => {
    try {
      const data = await contratoFirmaService.info(token); setInfo(data);
      if (data.estado === 'firmado') { setPdfFirmado(data.pdf_firmado_url || ''); setPaso('final'); }
      else if (mensajesEstado[data.estado]) setPaso(data.estado); else setPaso('contrato');
      if (!data.canales?.includes(canal)) setCanal(data.canales?.[0] || 'email');
    } catch { setPaso('error'); }
  };
  useEffect(() => { cargar(); }, [token]);
  const pedirCodigo = async () => {
    setOcupado(true); setError('');
    try { await contratoFirmaService.enviarOtp(token, canal); setPaso('otp'); }
    catch (e) { setError(e.message); }
    finally { setOcupado(false); }
  };
  const firmar = async () => {
    if (!acepta) { setError('Debes aceptar expresamente el contrato para firmar.'); return; }
    setOcupado(true); setError('');
    try { const result = await contratoFirmaService.firmar(token, otp, canal, true); setPdfFirmado(result.pdf_url || ''); setPaso('final'); }
    catch (e) { setError(e.message); }
    finally { setOcupado(false); }
  };
  const shell = { minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', padding: '24px 14px', fontFamily: 'inherit' };
  const card = { width: 'min(720px, 100%)', margin: '0 auto', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, boxShadow: 'var(--shadow-sm)' };
  const button = { width: '100%', padding: '12px 16px', marginTop: 12 };
  return <main style={shell}><section style={card}>
    <style>{`.firma-pdf-desktop { display: none; } @media (min-width: 768px) { .firma-pdf-desktop { display: block; } }`}</style>
    <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 8 }}>{info?.empresa_nombre || 'EMPRESA'} · Firma de contrato</div>
    <h1 style={{ fontSize: 22, margin: '0 0 16px' }}>Renovación de contrato</h1>
    {paso === 'cargando' && <p>Cargando solicitud segura…</p>}
    {paso === 'error' && <div className="alert alert-danger">No se pudo encontrar o procesar esta solicitud. Verifica el enlace o contacta con Recursos Humanos.</div>}
    {mensajesEstado[paso] && <div className={`alert ${paso === 'firmado' ? 'alert-success' : 'alert-warning'}`}>{mensajesEstado[paso]}</div>}
    {['contrato', 'otp'].includes(paso) && <>
      <p className="text-muted" style={{ lineHeight: 1.5 }}>Revisa el documento completo. Para firmar, confirma tu aceptación y valida el código que enviaremos a un canal registrado.</p>
      {info?.pdf_url && <><a className="btn btn-primary" href={info.pdf_url} target="_blank" rel="noreferrer" style={button}>Leer contrato completo</a><div className="firma-pdf-desktop" style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', margin: '14px 0' }}><iframe title="Contrato para revisar" src={info.pdf_url} style={{ display: 'block', width: '100%', height: 'min(65vh, 700px)', border: 0 }} /></div></>}
      <div className="text-muted" style={{ fontSize: 12 }}>Enlace válido hasta {info?.expira_en ? new Date(info.expira_en).toLocaleString('es-PE') : '—'}</div>
      {!info?.canales?.length && <div className="alert alert-warning" style={{ marginTop: 14 }}>Esta solicitud no tiene canales disponibles para enviar el código. Contacta con Recursos Humanos para recibir ayuda.</div>}
      {paso === 'contrato' && info?.canales?.length ? <>
        <label className="input-group" style={{ display: 'block', marginTop: 18 }}><span>Enviar código por</span><select className="select" value={canal} onChange={e => setCanal(e.target.value)} style={{ width: '100%', marginTop: 6 }}>
          {info?.canales?.includes('whatsapp') && <option value="whatsapp">WhatsApp · {info.destino_telefono_mask}</option>}
          {info?.canales?.includes('email') && <option value="email">Correo · {info.destino_email_mask}</option>}
        </select></label>
        <button className="btn btn-primary" style={button} disabled={ocupado || !canal} onClick={pedirCodigo}>{ocupado ? 'Enviando código…' : 'Solicitar código'}</button>
      </> : paso === 'otp' && info?.canales?.length ? <>
        <label className="input-group" style={{ display: 'block', marginTop: 18 }}>Código de seis dígitos<input className="input" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} style={{ width: '100%', marginTop: 6, letterSpacing: 6, fontSize: 20 }} /></label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, fontSize: 13, lineHeight: 1.5 }}><input type="checkbox" checked={acepta} onChange={e => setAcepta(e.target.checked)} /><span>He leído el contrato completo y acepto expresamente sus términos. Entiendo que esta acción constituye mi firma electrónica mediante enlace personal y código de un solo uso.</span></label>
        <button className="btn btn-primary" style={button} disabled={ocupado || otp.length !== 6} onClick={firmar}>{ocupado ? 'Firmando…' : 'Firmar contrato'}</button>
        <button className="btn btn-ghost" style={button} disabled={ocupado} onClick={pedirCodigo}>Solicitar otro código</button>
      </> : null}
    </>}
    {paso === 'final' && <div className="alert alert-success"><strong>Firma completada.</strong><p>Tu contrato quedó firmado electrónicamente. Descarga una copia para tus archivos.</p>{pdfFirmado && <a className="btn btn-primary" href={pdfFirmado} target="_blank" rel="noreferrer">Descargar contrato firmado</a>}</div>}
    {error && <div className="alert alert-danger" role="alert" style={{ marginTop: 14 }}>{error}</div>}
  </section></main>;
}
