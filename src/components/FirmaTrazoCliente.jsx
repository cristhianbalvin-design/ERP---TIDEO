import { useCallback, useEffect, useRef, useState } from 'react';
// Copia del lienzo de firma de operaciones-app (FirmaTrazo.jsx) para la app principal:
// las dos apps tienen su propio React y no comparten componentes.

const TINTA = '#1A2B4A';
const LARGO_MINIMO_PX = 24;

// Una firma vale si algún trazo recorre al menos 24 px: descarta toques sueltos sin depender
// de cuántos eventos de puntero entregue el dispositivo.
export const largoTrazo = trazo => trazo.reduce((total, [x, y], i) => (i ? total + Math.hypot(x - trazo[i - 1][0], y - trazo[i - 1][1]) : 0), 0);
export const firmaValida = trazos => trazos.some(trazo => largoTrazo(trazo) >= LARGO_MINIMO_PX);

// Lienzo de firma con el dedo o el mouse. Exporta PNG con fondo blanco para que
// la firma sea legible en el PDF y en modo oscuro. onChange recibe el dataURL o null.
export function FirmaTrazoCliente({ etiqueta, valor = null, onChange, deshabilitado = false }) {
  const canvasRef = useRef(null);
  const trazosRef = useRef([]);
  const actualRef = useRef(null);
  const previaRef = useRef(null);
  const [conTinta, setConTinta] = useState(Boolean(valor));

  const dibujar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = globalThis.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = TINTA;
    // Firma ya hecha (al volver a este paso): se muestra hasta que se limpie o se firme encima.
    if (!trazosRef.current.length && previaRef.current?.complete && previaRef.current.naturalWidth) {
      const img = previaRef.current;
      const escala = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
      ctx.drawImage(img, (rect.width - img.naturalWidth * escala) / 2, (rect.height - img.naturalHeight * escala) / 2, img.naturalWidth * escala, img.naturalHeight * escala);
    }
    trazosRef.current.forEach(trazo => {
      ctx.beginPath();
      trazo.forEach(([x, y], indice) => (indice ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (trazo.length === 1) ctx.lineTo(trazo[0][0] + 0.1, trazo[0][1] + 0.1);
      ctx.stroke();
    });
  }, []);

  useEffect(() => {
    if (!valor || trazosRef.current.length || typeof Image === 'undefined') return;
    const img = new Image();
    img.onload = () => dibujar();
    img.src = valor;
    previaRef.current = img;
  // Solo al montar: la firma previa se carga una vez.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    dibujar();
    const alCambiar = () => dibujar();
    globalThis.addEventListener?.('resize', alCambiar);
    return () => globalThis.removeEventListener?.('resize', alCambiar);
  }, [dibujar]);

  const punto = evento => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [evento.clientX - rect.left, evento.clientY - rect.top];
  };

  const emitir = () => {
    const valida = firmaValida(trazosRef.current);
    setConTinta(trazosRef.current.length > 0);
    onChange?.(valida ? canvasRef.current.toDataURL('image/png') : null);
  };

  const alBajar = evento => {
    if (deshabilitado) return;
    evento.preventDefault();
    try { canvasRef.current.setPointerCapture?.(evento.pointerId); } catch { /* puntero no capturable: se sigue dibujando igual */ }
    if (previaRef.current && !trazosRef.current.length) previaRef.current = null;
    actualRef.current = [punto(evento)];
    trazosRef.current.push(actualRef.current);
    dibujar();
  };
  const alMover = evento => {
    if (!actualRef.current) return;
    evento.preventDefault();
    actualRef.current.push(punto(evento));
    dibujar();
  };
  const alSoltar = () => {
    if (!actualRef.current) return;
    actualRef.current = null;
    emitir();
  };
  const limpiar = () => {
    previaRef.current = null;
    trazosRef.current = [];
    actualRef.current = null;
    dibujar();
    setConTinta(false);
    onChange?.(null);
  };

  return (
    <div className="dx-conf-sign-wrap">
      <div className={`dx-conf-sign${conTinta ? ' has-ink' : ''}`}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={etiqueta}
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
          onPointerLeave={alSoltar}
        />
        <span className="dx-conf-sign-line" aria-hidden="true" />
        <span className="dx-conf-sign-hint" aria-hidden="true">Firma aquí con el dedo</span>
      </div>
      <div className="dx-conf-sign-tools">
        <span className="dx-conf-hint">Se registran la fecha, la hora, la IP y los datos de este dispositivo.</span>
        <button type="button" className="dx-conf-btn" onClick={limpiar} disabled={deshabilitado || !conTinta}>Limpiar</button>
      </div>
    </div>
  );
}
