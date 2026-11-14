import React, { useEffect, useMemo, useRef, useState } from 'react';
import operaIsotipo from '../../public/opera/opera-isotipo-dark.png';
import { Icon } from './zahory-mock/components/shell.jsx';
import { requestWorkBack } from './workMode.js';
import { leerMenuUsuario, guardarMenuUsuario, alternarFavorito, agregarReciente } from '../../src/menuFavoritos.js';
import {
  buscarModulos,
  construirGruposMenu,
  grupoDeRuta,
  itemActivo,
  modulosBuscables,
} from './menuLateralLogic.js';
import './menu_lateral_operaciones.css';

const CLAVE_COLAPSADO = 'opera_ops_sidebar_collapsed';
const RAIZ = '__root__';

function leerColapsado() {
  try { return window.localStorage.getItem(CLAVE_COLAPSADO) === 'true'; } catch { return false; }
}

function useMedia(query) {
  const [coincide, setCoincide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const actualizar = () => setCoincide(media.matches);
    media.addEventListener?.('change', actualizar);
    return () => media.removeEventListener?.('change', actualizar);
  }, [query]);
  return coincide;
}

// Menú lateral de Operaciones con la misma estructura que el de Administración:
// franja de íconos por grupo, panel con las pantallas del grupo, favoritos y buscador (Ctrl K).
export function MenuLateralOperaciones({
  navegacion,
  route,
  navigate,
  userId,
  adminAppUrl,
  workMode = false,
  workCompact = false,
  navOpen = false,
  onCloseNav,
  workBackLabel,
  footer = null,
}) {
  const grupos = useMemo(() => construirGruposMenu(navegacion), [navegacion]);
  const modulos = useMemo(() => modulosBuscables(grupos), [grupos]);
  const grupoActivo = grupoDeRuta(grupos, route);
  const compact = useMedia('(max-width: 900px)');
  const mobile = useMedia('(max-width: 760px)');
  const [collapsed, setCollapsed] = useState(leerColapsado);
  const [panelKey, setPanelKey] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [tip, setTip] = useState(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const claveUsuario = `ops_${userId || 'anonimo'}`;
  const [menuUsuario, setMenuUsuario] = useState(() => leerMenuUsuario(claveUsuario));
  const sidebarRef = useRef(null);
  const railList = useRef(null);
  const [pillTop, setPillTop] = useState(null);

  const overlay = !workCompact && (collapsed || compact || workMode);
  const showPanel = workCompact || (mobile ? drawer : !overlay || Boolean(panelKey));
  const selectedKey = panelKey === RAIZ ? null : panelKey || grupoActivo;
  const selected = grupos.find(grupo => grupo.key === selectedKey) || null;
  const railKey = showPanel ? (panelKey === RAIZ ? null : selectedKey) : grupoActivo;
  const expanded = compact || workMode ? (mobile ? drawer : Boolean(panelKey)) : !collapsed;

  useEffect(() => { setMenuUsuario(leerMenuUsuario(claveUsuario)); }, [claveUsuario]);
  useEffect(() => { try { window.localStorage.setItem(CLAVE_COLAPSADO, String(collapsed)); } catch {} }, [collapsed]);
  useEffect(() => { setPanelKey(null); setDrawer(false); }, [route, compact, mobile]);
  useEffect(() => {
    const boton = railList.current?.querySelector('[data-selected="true"]');
    setPillTop(boton ? boton.offsetTop : null);
  }, [railKey, grupos, showPanel, drawer]);
  useEffect(() => {
    const onKey = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === 'Escape' && !commandOpen) {
        setPanelKey(null);
        setDrawer(false);
        setTip(null);
      }
    };
    const onCommand = () => setCommandOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('dx-nav-command', onCommand);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('dx-nav-command', onCommand); };
  }, [commandOpen]);
  useEffect(() => {
    if (!overlay || !panelKey || mobile) return undefined;
    const cerrar = event => { if (!sidebarRef.current?.contains(event.target)) setPanelKey(null); };
    document.addEventListener('pointerdown', cerrar);
    return () => document.removeEventListener('pointerdown', cerrar);
  }, [overlay, panelKey, mobile]);

  const actualizarMenu = siguiente => {
    setMenuUsuario(siguiente);
    guardarMenuUsuario(claveUsuario, siguiente);
  };
  const abrirPantalla = id => {
    setPanelKey(null);
    setDrawer(false);
    setCommandOpen(false);
    setTip(null);
    onCloseNav?.();
    actualizarMenu(agregarReciente(menuUsuario, id));
    navigate(id);
  };
  const alternarColapsado = () => {
    if (compact || workMode) {
      if (mobile) {
        setDrawer(!drawer);
        setPanelKey(drawer ? null : RAIZ);
      } else {
        setPanelKey(panelKey ? null : RAIZ);
      }
      return;
    }
    setCollapsed(!collapsed);
    setPanelKey(null);
  };
  const mostrarTip = (event, label) => {
    if (mobile || workCompact) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setTip({ label, top: Math.max(8, Math.min(window.innerHeight - 36, rect.top + rect.height / 2 - 15)), left: rect.right + 8 });
  };
  const tipProps = label => ({
    onMouseEnter: event => mostrarTip(event, label),
    onMouseLeave: () => setTip(null),
    onFocus: event => mostrarTip(event, label),
    onBlur: () => setTip(null),
  });
  const favoritos = menuUsuario.favoritos;
  const esFavorito = id => favoritos.includes(id);

  const fila = (item, { conEstrella = true, sub = false, area = null } = {}) => (
    <div className={`dx-opsnav-row${itemActivo(item, route) ? ' is-active' : ''}${sub ? ' is-sub' : ''}`} key={item.id}>
      <button type="button" className="dx-opsnav-item" onClick={() => abrirPantalla(item.id)} aria-current={itemActivo(item, route) ? 'page' : undefined}>
        {area ? <span className="dx-opsnav-area-dot" style={{ backgroundColor: area }} aria-hidden="true" /> : <Icon name={item.icon || 'report'} size={18} />}
        <span>{item.label}</span>
        {item.badge && <b className={`dx-opsnav-tag${item.badgeColor ? ` is-${item.badgeColor}` : ''}`}>{item.badge}</b>}
      </button>
      {conEstrella && (
        <button
          type="button"
          className={`dx-opsnav-star${esFavorito(item.id) ? ' is-favorite' : ''}`}
          aria-label={`${esFavorito(item.id) ? 'Quitar de favoritos' : 'Añadir a favoritos'}: ${item.label}`}
          aria-pressed={esFavorito(item.id)}
          onClick={() => actualizarMenu(alternarFavorito(menuUsuario, item.id))}
        >★</button>
      )}
    </div>
  );
  const pantallasFavoritas = favoritos
    .map(id => grupos.flatMap(grupo => grupo.pantallas).find(item => item.id === id))
    .filter(Boolean);
  const zonas = grupos.filter(grupo => grupo.zona).reduce((acc, grupo) => {
    const ultima = acc[acc.length - 1];
    if (ultima && ultima.label === grupo.zona) ultima.grupos.push(grupo);
    else acc.push({ label: grupo.zona, grupos: [grupo] });
    return acc;
  }, []);
  const inicioGrupo = grupos.find(grupo => grupo.key === 'inicio');

  const panelGrupo = grupo => {
    const favDelGrupo = grupo.pantallas.filter(item => esFavorito(item.id));
    return <>
      {favDelGrupo.length > 0 && <><h3>Favoritos</h3>{favDelGrupo.map(item => fila(item))}</>}
      {grupo.items.some(item => !esFavorito(item.id)) && <h3>Pantallas</h3>}
      {grupo.items.filter(item => !esFavorito(item.id)).map(item => fila(item))}
      {grupo.areas.length > 0 && <>
        <h3>Áreas productivas</h3>
        {grupo.areas.map(area => <React.Fragment key={area.id}>
          {fila(area, { area: area.areaColor || '#94a3b8' })}
          {(area.subItems || []).filter(item => !esFavorito(item.id)).map(item => fila(item, { sub: true }))}
        </React.Fragment>)}
      </>}
      {grupo.cola.map((item, indice) => item.type === 'divider'
        ? <h3 key={`${grupo.key}-div-${indice}`}>{item.label}</h3>
        : !esFavorito(item.id) && fila(item))}
    </>;
  };

  const panelRaiz = () => <>
    {inicioGrupo?.items.map(item => fila(item, { conEstrella: false }))}
    {pantallasFavoritas.length > 0 && <><h3>Favoritos</h3>{pantallasFavoritas.map(item => fila(item))}</>}
    {zonas.map(zona => <React.Fragment key={zona.label}>
      <h3>{zona.label}</h3>
      {zona.grupos.map(grupo => (
        <div className={`dx-opsnav-row${grupoActivo === grupo.key ? ' is-active' : ''}`} key={grupo.key}>
          <button type="button" className="dx-opsnav-item" onClick={() => setPanelKey(grupo.key)}>
            <Icon name={grupo.icon} size={18} />
            <span>{grupo.label}</span>
            <Icon name="chev" size={14} />
          </button>
        </div>
      ))}
    </React.Fragment>)}
  </>;

  const shellClass = 'dx-opsnav-shell'
    + (workCompact ? ` ops-sidebar is-work-drawer dx-opsnav-cajon${navOpen ? ' is-open' : ''}` : '')
    + (showPanel && !overlay && !workCompact ? ' is-pinned' : '')
    + (drawer ? ' is-drawer-open' : '');

  return <>
    {mobile && drawer && !workCompact && <button type="button" className="dx-opsnav-backdrop" aria-label="Cerrar menú" onClick={() => setDrawer(false)} />}
    <aside
      ref={sidebarRef}
      className={shellClass}
      aria-hidden={workCompact && !navOpen ? 'true' : undefined}
      inert={workCompact && !navOpen ? '' : undefined}
    >
      {workCompact && workBackLabel && <button type="button" className="ops-work-drawer-back" onClick={() => { requestWorkBack(); onCloseNav?.(); }}>← {workBackLabel}</button>}
      <div className="dx-opsnav-cuerpo">
        <nav className="dx-opsnav-rail" aria-label="Grupos de Operaciones">
          <a className="dx-opsnav-brand" href={adminAppUrl} aria-label="Volver al selector de aplicaciones" {...tipProps('Selector de aplicaciones')}>
            <img src={operaIsotipo} alt="OPERA" />
          </a>
          <div className="dx-opsnav-rail-list" ref={railList} onScroll={() => setTip(null)}>
            {pillTop !== null && <span className="dx-opsnav-pill" style={{ transform: `translateY(${pillTop}px)` }} aria-hidden="true" />}
            {grupos.map(grupo => {
              const seleccionado = railKey === grupo.key;
              return (
                <button
                  type="button"
                  key={grupo.key}
                  data-selected={seleccionado || undefined}
                  className={`dx-opsnav-rail-button${seleccionado || grupoActivo === grupo.key ? ' is-active' : ''}`}
                  aria-label={grupo.label}
                  aria-expanded={showPanel && selectedKey === grupo.key}
                  {...tipProps(grupo.label)}
                  onClick={() => {
                    setTip(null);
                    if (overlay && !mobile && panelKey === grupo.key) setPanelKey(null);
                    else setPanelKey(grupo.key);
                  }}
                >
                  <Icon name={grupo.icon} size={19} />
                </button>
              );
            })}
          </div>
          <div className="dx-opsnav-rail-foot">
            <button type="button" className="dx-opsnav-rail-button" aria-label="Buscar pantallas" {...tipProps('Buscar (Ctrl K)')} onClick={() => { setTip(null); setCommandOpen(true); }}>
              <Icon name="search" size={19} />
            </button>
            {!workCompact && (
              <button type="button" className="dx-opsnav-rail-button dx-opsnav-pin" onClick={alternarColapsado} aria-label={expanded ? 'Contraer menú' : 'Expandir menú'} {...tipProps(expanded ? 'Contraer menú' : 'Expandir menú')}>
                <span className={expanded ? 'is-flip' : ''}><Icon name="chev" size={18} /></span>
              </button>
            )}
          </div>
        </nav>
        {showPanel && (
          <nav className={`dx-opsnav-panel${overlay && !mobile ? ' is-overlay' : ''}`} aria-label={selected ? `Pantallas de ${selected.label}` : 'Menú'}>
            <div className="dx-opsnav-panel-title">
              {selected && (
                <button type="button" className="dx-opsnav-panel-back" onClick={() => setPanelKey(RAIZ)} aria-label="Todos los grupos" title="Todos los grupos">
                  <Icon name="back" size={16} />
                </button>
              )}
              <strong>{selected ? selected.label : 'Menú'}</strong>
              {!workCompact && !mobile && (
                <button type="button" className="dx-opsnav-panel-pin" onClick={alternarColapsado} aria-label={expanded ? 'Contraer menú' : 'Expandir menú'} title={expanded ? 'Contraer menú' : 'Expandir menú'}>
                  <span className={expanded ? 'is-flip' : ''}><Icon name="chev" size={16} /></span>
                </button>
              )}
            </div>
            <button type="button" className="dx-opsnav-search" onClick={() => setCommandOpen(true)}>
              <Icon name="search" size={17} /><span>Buscar pantalla</span><kbd>Ctrl K</kbd>
            </button>
            <div className="dx-opsnav-panel-list">
              {selected ? panelGrupo(selected) : panelRaiz()}
            </div>
          </nav>
        )}
      </div>
      {footer}
    </aside>
    {tip && <div className="dx-opsnav-tooltip" role="tooltip" style={{ top: tip.top, left: tip.left }}>{tip.label}</div>}
    {mobile && !workCompact && (
      <nav className="dx-opsnav-bottom" aria-label="Navegación móvil">
        <button type="button" className={route === 'inicio' ? 'is-active' : ''} onClick={() => abrirPantalla('inicio')}><Icon name="home" size={20} /><span>Inicio</span></button>
        <button type="button" onClick={() => setCommandOpen(true)}><Icon name="search" size={20} /><span>Buscar</span></button>
        <button type="button" aria-expanded={drawer} onClick={() => { setDrawer(!drawer); setPanelKey(drawer ? null : RAIZ); }}><Icon name="menu" size={20} /><span>Menú</span></button>
      </nav>
    )}
    {commandOpen && (
      <BuscadorPantallas
        modulos={modulos}
        favoritos={favoritos}
        recientes={menuUsuario.recientes}
        onSelect={abrirPantalla}
        onClose={() => setCommandOpen(false)}
      />
    )}
  </>;
}

// Buscador de pantallas (Ctrl K): lista con teclado (flechas, Enter, Escape).
function BuscadorPantallas({ modulos, favoritos, recientes, onSelect, onClose }) {
  const [consulta, setConsulta] = useState('');
  const [indice, setIndice] = useState(0);
  const inputRef = useRef(null);
  const focoPrevio = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  useEffect(() => {
    inputRef.current?.focus();
    const previo = focoPrevio.current;
    return () => { window.setTimeout(() => previo?.isConnected && previo.focus?.(), 0); };
  }, []);
  const porId = ids => ids.map(id => modulos.find(modulo => modulo.id === id)).filter(Boolean);
  const secciones = consulta.trim()
    ? [{ titulo: 'Resultados', lista: buscarModulos(consulta, modulos) }]
    : [
      { titulo: 'Favoritos', lista: porId(favoritos) },
      { titulo: 'Recientes', lista: porId(recientes.filter(id => !favoritos.includes(id))) },
    ].filter(seccion => seccion.lista.length > 0);
  const planos = secciones.flatMap(seccion => seccion.lista);
  useEffect(() => { setIndice(0); }, [consulta]);
  const onKeyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); setIndice(i => Math.min(planos.length - 1, i + 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setIndice(i => Math.max(0, i - 1)); }
    if (event.key === 'Enter' && planos[indice]) { event.preventDefault(); onSelect(planos[indice].id); }
    if (event.key === 'Tab') event.preventDefault();
  };
  let posicion = -1;
  return <>
    <div className="dx-opsnav-command-overlay" onClick={onClose} aria-hidden="true" />
    <div className="dx-opsnav-command" role="dialog" aria-modal="true" aria-label="Buscar pantallas" onKeyDown={onKeyDown}>
      <input
        ref={inputRef}
        value={consulta}
        onChange={event => setConsulta(event.target.value)}
        placeholder="Buscar pantalla..."
        aria-label="Buscar pantallas"
        role="combobox"
        aria-expanded="true"
        aria-controls="dx-opsnav-command-list"
        aria-activedescendant={planos[indice] ? `dx-opsnav-op-${planos[indice].id}` : undefined}
      />
      <div className="dx-opsnav-command-list" id="dx-opsnav-command-list" role="listbox" aria-label="Pantallas">
        {secciones.map(seccion => (
          <div role="group" aria-label={seccion.titulo} key={seccion.titulo}>
            <div className="dx-opsnav-command-heading">{seccion.titulo}</div>
            {seccion.lista.map(modulo => {
              posicion += 1;
              const actual = posicion;
              return (
                <div
                  key={`${seccion.titulo}-${modulo.id}`}
                  id={`dx-opsnav-op-${modulo.id}`}
                  role="option"
                  aria-selected={actual === indice}
                  className={`dx-opsnav-command-item${actual === indice ? ' is-selected' : ''}`}
                  onMouseEnter={() => setIndice(actual)}
                  onClick={() => onSelect(modulo.id)}
                >
                  <Icon name={modulo.icon} size={18} /><span>{modulo.label}</span><small>{modulo.seccion}</small>
                </div>
              );
            })}
          </div>
        ))}
        {consulta.trim() && planos.length === 0 && <div className="dx-opsnav-command-empty">No encontramos una pantalla con ese nombre.</div>}
        {!consulta.trim() && planos.length === 0 && <div className="dx-opsnav-command-empty">Escribe el nombre de una pantalla. Las que marques con ★ aparecerán aquí.</div>}
      </div>
    </div>
  </>;
}
