import React, { useEffect, useRef, useState } from 'react';
import { mejorarRedaccion } from '../../services/diagnosticoInformeService.js';

export function MejorarRedaccionIA({ diagnosticoId, texto, disabled = false, onApply, compact = false }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const mounted = useRef(true);
  const request = useRef(0);
  const controller = useRef(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current += 1; controller.current?.abort(); };
  }, []);
  useEffect(() => { setProposal(null); setError(''); setShowOriginal(false); }, [texto]);
  const handleImprove = async () => {
    if (loading || disabled || !diagnosticoId || String(texto || '').trim().length < 15) return;
    const current = ++request.current;
    controller.current = new AbortController();
    setLoading(true); setError(''); setProposal(null); setShowOriginal(false);
    try {
      const result = await mejorarRedaccion({ diagnosticoId, texto, signal: controller.current.signal });
      if (!mounted.current || request.current !== current) return;
      setProposal(result);
    } catch (cause) {
      if (mounted.current && request.current === current) setError(cause.message || 'No se pudo mejorar la redacción.');
    } finally {
      if (mounted.current && request.current === current) setLoading(false);
    }
  };
  if (!diagnosticoId) return null;
  const tooShort = String(texto || '').trim().length < 15;
  return <div className="dx-ia-wrap">
    <button type="button" className="dx-ia-trigger" aria-label="Mejorar redacción con IA" disabled={disabled || loading || tooShort} onClick={handleImprove}>{loading ? 'Mejorando…' : compact ? '✨ Mejorar' : '✨ Mejorar redacción'}</button>
    {error && <div className="dx-ia-error" role="alert">{error}</div>}
    {proposal && <section className="dx-ia-proposal" aria-label="Texto propuesto">
      <strong>Texto propuesto</strong>
      {proposal.sin_cambios ? <p role="status">El texto ya está bien redactado</p> : <p>{showOriginal ? proposal.texto_original : proposal.texto_mejorado}</p>}
      {!proposal.sin_cambios && <div className="dx-ia-actions"><button type="button" onClick={() => onApply?.(proposal.texto_mejorado)}>Aplicar</button><button type="button" onClick={() => { setProposal(null); setShowOriginal(false); }}>Descartar</button><button type="button" onClick={() => setShowOriginal(value => !value)}>{showOriginal ? 'Ver propuesta' : 'Ver original'}</button></div>}
      {proposal.sin_cambios && <div className="dx-ia-actions"><button type="button" onClick={() => setProposal(null)}>Cerrar</button></div>}
    </section>}
  </div>;
}
