import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import zahoryStyles from './styles/zahory.css?inline';
import { ZahoryRoutes } from './ZahoryRoutes.jsx';

export const transformShadowZahoryStyles = css => String(css || '')
  .replace(/:root\s*\{/g, ':host {')
  .replace(/\[data-theme\s*=\s*(?:"dark"|'dark'|dark)\]/g, ':host([data-theme="dark"])');

export function syncZahoryHostTheme(host, documentElement = globalThis.document?.documentElement) {
  if (!host || !documentElement) return;
  if (documentElement.classList.contains('dark')) host.setAttribute('data-theme', 'dark');
  else host.removeAttribute('data-theme');
}

export function observeZahoryHostTheme(host, documentElement = globalThis.document?.documentElement) {
  if (!host || !documentElement) return () => {};
  syncZahoryHostTheme(host, documentElement);
  if (typeof globalThis.MutationObserver !== 'function') return () => {};
  const observer = new MutationObserver(() => syncZahoryHostTheme(host, documentElement));
  observer.observe(documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => {
    observer.disconnect();
    host.removeAttribute('data-theme');
  };
}

// Modo trabajo en celular/tablet: OperationalApp marca <html data-dx-work-compact="true"> y aquí
// se copia al host (data-work-compact) para que el CSS del shadow root pueda usar :host([data-work-compact]).
export function syncZahoryHostWorkCompact(host, documentElement = globalThis.document?.documentElement) {
  if (!host || !documentElement) return;
  if (documentElement.dataset?.dxWorkCompact === 'true') host.setAttribute('data-work-compact', '');
  else host.removeAttribute('data-work-compact');
}

export function observeZahoryHostWorkCompact(host, documentElement = globalThis.document?.documentElement) {
  if (!host || !documentElement) return () => {};
  syncZahoryHostWorkCompact(host, documentElement);
  if (typeof globalThis.MutationObserver !== 'function') return () => {};
  const observer = new MutationObserver(() => syncZahoryHostWorkCompact(host, documentElement));
  observer.observe(documentElement, { attributes: true, attributeFilter: ['data-dx-work-compact'] });
  return () => {
    observer.disconnect();
    host.removeAttribute('data-work-compact');
  };
}

const shadowZahoryStyles = transformShadowZahoryStyles(zahoryStyles);

const integrationStyles = `
  :host { display: block; min-width: 0; color: var(--text); }
  .zahory-mock-root {
    min-width: 0;
    min-height: calc(100vh - 64px);
    background: var(--bg);
    color: var(--text);
    font: 14px 'Inter', 'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif;
  }
  .zahory-mock-banner {
    position: sticky;
    top: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 8px;
    width: max-content;
    margin: 12px 20px 0 auto;
    padding: 7px 11px;
    border: 1px solid var(--cyan);
    border-radius: var(--radius-sm, 6px);
    background: var(--cyan-lt);
    color: var(--cyan-dk);
    font: 700 12px 'DM Sans', sans-serif;
    box-shadow: var(--shadow-sm);
  }
  .zahory-mock-banner-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--cyan);
  }
`;

export function ZahoryScreenHost({ route, routeParams, onNavigate }) {
  const hostRef = useRef(null);
  const [shadowRoot, setShadowRoot] = useState(null);

  useEffect(() => {
    if (!hostRef.current) return;
    setShadowRoot(hostRef.current.shadowRoot || hostRef.current.attachShadow({ mode: 'open' }));
  }, []);

  useEffect(() => observeZahoryHostTheme(hostRef.current), []);
  useEffect(() => observeZahoryHostWorkCompact(hostRef.current), []);

  return (
    <div className="ops-zahory-host" ref={hostRef}>
      {shadowRoot && createPortal(
        <>
          <style>{shadowZahoryStyles}</style>
          <style>{integrationStyles}</style>
          <ZahoryRoutes route={route} routeParams={routeParams} onNavigate={onNavigate} />
        </>,
        shadowRoot,
      )}
    </div>
  );
}
