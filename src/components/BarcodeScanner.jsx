import React, { useState, useEffect, useRef } from 'react';

const SCAN_DEBOUNCE_MS = 2000;
const FORMATS = ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code'];

// Injected once per page load
let styleInjected = false;
function injectScanLineStyle() {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  const s = document.createElement('style');
  s.textContent = `
@keyframes barcode-scan {
  0%   { top: 10%; }
  50%  { top: 85%; }
  100% { top: 10%; }
}
.barcode-scan-line {
  position: absolute;
  left: 8%;
  right: 8%;
  height: 2px;
  background: var(--cyan, #00e5ff);
  box-shadow: 0 0 8px var(--cyan, #00e5ff);
  animation: barcode-scan 2s linear infinite;
  border-radius: 1px;
}
.barcode-viewfinder-corner {
  position: absolute;
  width: 20px;
  height: 20px;
  border-color: var(--cyan, #00e5ff);
  border-style: solid;
  opacity: 0.8;
}
`;
  document.head.appendChild(s);
}

export default function BarcodeScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const zxingControlsRef = useRef(null);
  const scanLockRef = useRef(false);

  const [manualMode, setManualMode] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [lastCode, setLastCode] = useState('');
  const [manualCode, setManualCode] = useState('');

  injectScanLineStyle();

  const stopCamera = () => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    if (zxingControlsRef.current) { try { zxingControlsRef.current.stop(); } catch {} zxingControlsRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  };

  const handleDetected = (code) => {
    if (!code || scanLockRef.current) return;
    scanLockRef.current = true;
    setLastCode(code);
    onScan(code);
    setTimeout(() => { scanLockRef.current = false; }, SCAN_DEBOUNCE_MS);
  };

  const startNative = (stream) => {
    const detector = new window.BarcodeDetector({ formats: FORMATS });
    const loop = async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(loop);
        return;
      }
      try {
        const hits = await detector.detect(videoRef.current);
        if (hits.length > 0) handleDetected(hits[0].rawValue);
      } catch { /* frame decode error, ignore */ }
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
  };

  const startZXing = async (stream) => {
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromStream(stream, videoRef.current, (result) => {
        if (result) handleDetected(result.getText());
      });
      zxingControlsRef.current = controls;
    } catch (e) {
      console.error('ZXing init error:', e);
    }
  };

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setManualMode(true);
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        if ('BarcodeDetector' in window) {
          startNative(stream);
        } else {
          startZXing(stream);
        }
      })
      .catch(err => {
        // NotFoundError / DevicesNotFoundError → no camera hardware → silent manual mode
        const silent = ['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError'].includes(err.name);
        if (!silent) setPermissionError('No se pudo acceder a la cámara. Ingresa el código manualmente.');
        setManualMode(true);
      });
    return () => stopCamera();
  }, []);

  const handleClose = () => { stopCamera(); onClose(); };

  const submitManual = () => {
    const code = manualCode.trim();
    if (!code) return;
    handleDetected(code);
    setManualCode('');
  };

  if (manualMode) {
    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, background: 'var(--bg-2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {permissionError && (
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', background: 'var(--bg-subtle)', padding: '8px 12px', borderRadius: 6 }}>
            {permissionError}
          </div>
        )}
        <div style={{ fontWeight: 600, fontSize: 13 }}>Ingresar código manualmente</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            value={manualCode}
            onChange={e => setManualCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitManual()}
            placeholder="Escanea o escribe el código..."
            autoFocus
          />
          <button className="btn btn-primary" onClick={submitManual} disabled={!manualCode.trim()}>OK</button>
        </div>
        {lastCode && <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--cyan)' }}>Último: {lastCode}</div>}
        <button className="btn btn-secondary" style={{ width: '100%' }} onClick={handleClose}>Cerrar</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      {/* Viewfinder */}
      <div style={{ position: 'relative', width: '100%', maxWidth: 360, aspectRatio: '1 / 1', borderRadius: 8, overflow: 'hidden', background: '#000' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        {/* Animated scan line */}
        <div className="barcode-scan-line" />
        {/* Corner markers */}
        <div className="barcode-viewfinder-corner" style={{ top: 12, left: 12, borderWidth: '2px 0 0 2px', borderRadius: '4px 0 0 0' }} />
        <div className="barcode-viewfinder-corner" style={{ top: 12, right: 12, borderWidth: '2px 2px 0 0', borderRadius: '0 4px 0 0' }} />
        <div className="barcode-viewfinder-corner" style={{ bottom: 12, left: 12, borderWidth: '0 0 2px 2px', borderRadius: '0 0 0 4px' }} />
        <div className="barcode-viewfinder-corner" style={{ bottom: 12, right: 12, borderWidth: '0 2px 2px 0', borderRadius: '0 0 4px 0' }} />
      </div>
      {lastCode && (
        <div style={{ fontFamily: 'monospace', fontSize: 14, color: 'var(--cyan)', background: 'var(--bg-2)', padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)' }}>
          {lastCode}
        </div>
      )}
      <button className="btn btn-secondary" style={{ width: '100%', maxWidth: 360 }} onClick={handleClose}>Cerrar</button>
    </div>
  );
}
