import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import zahoryStyles from './styles/zahory.css?inline';
import { ZahoryRoutes } from './ZahoryRoutes.jsx';

const shadowZahoryStyles = zahoryStyles
  .replace(':root {', ':host {')
  .replace("[data-theme='dark'] {", ":host([data-theme='dark']) {");

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

export function ZahoryScreenHost({ route, onNavigate }) {
  const hostRef = useRef(null);
  const [shadowRoot, setShadowRoot] = useState(null);

  useEffect(() => {
    if (!hostRef.current) return;
    setShadowRoot(hostRef.current.shadowRoot || hostRef.current.attachShadow({ mode: 'open' }));
  }, []);

  return (
    <div className="ops-zahory-host" ref={hostRef}>
      {shadowRoot && createPortal(
        <>
          <style>{shadowZahoryStyles}</style>
          <style>{integrationStyles}</style>
          <ZahoryRoutes route={route} onNavigate={onNavigate} />
        </>,
        shadowRoot,
      )}
    </div>
  );
}
