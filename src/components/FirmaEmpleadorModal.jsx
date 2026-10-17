import React, { useEffect, useState } from 'react';
import { contratoFirmaService } from '../contratoFirmaService.js';

export default function FirmaEmpleadorModal({ firmaId, onClose, onComplete }) {
  const [info, setInfo] = useState(null); const [otp, setOtp] = useState(''); const [acepto, setAcepto] = useState(false);
  const [enviando, setEnviando] = useState(false); const [firmando, setFirmando] = useState(false); const [error, setError] = useState(''); const [aviso, setAviso] = useState('');
  useEffect(() => { let mounted = true; contratoFirmaService.infoFirmaEmpresa(firmaId).then(data => { if (mounted) setInfo(data.firma); }).catch(e => { if (mounted) setError(e.message); }); return () => { mounted = false; }; }, [firmaId]);
  const enviarOtp = async () => { setEnviando(true); setError(''); try { await contratoFirmaService.enviarOtpEmpresa(firmaId); setAviso('Enviamos un código de seis dígitos al correo de tu cuenta.'); } catch (e) { setError(e.message); } finally { setEnviando(false); } };
  const firmar = async () => { setFirmando(true); setError(''); try { await contratoFirmaService.firmarComoEmpresa({ id: firmaId, otp, acepto }); let resultado; try { resultado = await contratoFirmaService.crearSolicitud({ documentoId: info.documento_id, empresaId: info.empresa_id, canales: info.canales_trabajador?.length ? info.canales_trabajador : ['whatsapp', 'email'] }); } catch (e) { resultado = { ok: false, aviso: `La empresa firmó el contrato, pero no se pudo enviar al trabajador: ${e.message || 'error desconocido'}. Puedes reintentarlo con «Enviar a firma del trabajador».` }; } await onComplete?.(resultado); onClose?.(); } catch (e) { setError(e.message); } finally { setFirmando(false); } };
  return <div className="modal-backdrop" role="presentation" style={{ zIndex: 11000 }}><section className="modal" role="dialog" aria-modal="true" style={{ width: 'min(620px,100%)', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
    <div className="modal-head"><h2>Firma electrónica de la empresa</h2></div><div className="modal-body" style={{ display: 'grid', gap: 12 }}>
      {info ? <><p>Representante: <strong>{info.firmante_nombre}</strong> · {info.firmante_documento} · {info.firmante_cargo}</p><a href={info.pdf_url} target="_blank" rel="noreferrer">Leer contrato completo</a>
        <button className="btn btn-secondary" disabled={enviando} onClick={enviarOtp}>{enviando ? 'Enviando…' : 'Enviar código a mi correo'}</button>
        <label className="input-group">Código de seis dígitos<input className="input" inputMode="numeric" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><input type="checkbox" checked={acepto} onChange={e => setAcepto(e.target.checked)} />Acepto firmar electrónicamente este contrato como representante de la empresa.</label></> : <p>Cargando el contrato…</p>}
      {aviso && <div className="alert alert-info">{aviso}</div>}{error && <div className="alert alert-danger">{error}</div>}
    </div><div className="modal-foot"><div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><button className="btn btn-ghost" onClick={onClose}>Cerrar</button><button className="btn btn-primary" disabled={!info || otp.length !== 6 || !acepto || firmando} onClick={firmar}>{firmando ? 'Firmando…' : 'Firmar como empresa'}</button></div></div>
  </section></div>;
}
