import { useEffect, useRef } from 'react';
import { WORK_COMPACT_QUERY, setWorkMode } from './workMode.js';

// Activa el modo trabajo solo en celular y tablet (WORK_COMPACT_QUERY): sin header, con el menú
// en un cajón ☰. En escritorio la pantalla se ve igual que siempre. Al salir de la pantalla se apaga.
// backLabel + onBack: botón «←» en el cajón (null lo oculta, p. ej. en una bandeja).
export function useCompactWorkMode(enabled = true, { backLabel = null, onBack } = {}) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia(WORK_COMPACT_QUERY);
    const update = () => setWorkMode(media.matches, { backLabel });
    const back = () => onBackRef.current?.();
    update();
    media.addEventListener?.('change', update);
    window.addEventListener?.('dx-work-back', back);
    return () => {
      media.removeEventListener?.('change', update);
      window.removeEventListener?.('dx-work-back', back);
      setWorkMode(false);
    };
  }, [enabled, backLabel]);
}
