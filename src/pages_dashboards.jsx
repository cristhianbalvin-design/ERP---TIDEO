import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { I } from './icons.jsx';
import { DASHBOARD_TABS, getVisibleDashboardTabs, resolveDashboardTab } from './dashboardsTabs.js';

const Dashboard = lazy(() => import('./pages_core.jsx').then(m => ({ default: m.Dashboard })));
const BIComercial = lazy(() => import('./pages_core.jsx').then(m => ({ default: m.BIComercial })));
const BIOperativo = lazy(() => import('./pages_core.jsx').then(m => ({ default: m.BIOperativo })));
const BIFinanciero = lazy(() => import('./pages_bi_fin.jsx').then(m => ({ default: m.BIFinanciero })));

const TAB_PANEL_IDS = Object.fromEntries(DASHBOARD_TABS.map(tab => [tab.key, `dashboards-panel-${tab.key}`]));

function DashboardPanelFallback() {
  return <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}><span className="text-muted" style={{ fontSize: 13 }}>Cargando módulo…</span></div>;
}

export default function DashboardsPage({ role, activeParams = {}, onTabChange }) {
  const tabs = getVisibleDashboardTabs(role);
  const requestedRouteKey = activeParams.pestana || '';
  const activeTab = resolveDashboardTab(role, requestedRouteKey);
  const [focusedKey, setFocusedKey] = useState(activeTab?.key || 'dashboard');
  const buttonRefs = useRef({});

  useEffect(() => {
    if (!activeTab) return;
    setFocusedKey(activeTab.key);
    if (activeTab.routeKey !== requestedRouteKey) onTabChange?.(activeTab.routeKey);
  }, [activeTab?.key, activeTab?.routeKey, requestedRouteKey, onTabChange]);

  useEffect(() => {
    const button = buttonRefs.current[activeTab?.key];
    const tablist = button?.closest('.dashboards-tablist');
    if (!button || !tablist) return;

    const buttonRect = button.getBoundingClientRect();
    const tablistRect = tablist.getBoundingClientRect();
    if (buttonRect.left < tablistRect.left) {
      tablist.scrollLeft -= tablistRect.left - buttonRect.left;
    } else if (buttonRect.right > tablistRect.right) {
      tablist.scrollLeft += buttonRect.right - tablistRect.right;
    }
  }, [activeTab?.key]);

  if (!activeTab) return null;

  const activate = tab => {
    setFocusedKey(tab.key);
    onTabChange?.(tab.routeKey);
  };
  const moveFocus = (event, index) => {
    let next = null;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== null) {
      event.preventDefault();
      const tab = tabs[next];
      setFocusedKey(tab.key);
      buttonRefs.current[tab.key]?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate(tabs[index]);
    }
  };

  const Component = activeTab.key === 'dashboard' ? Dashboard
    : activeTab.key === 'bi_comercial' ? BIComercial
      : activeTab.key === 'bi_operativo' ? BIOperativo : BIFinanciero;
  return (
    <div className="dashboards-page">
      {tabs.length > 1 && <div className="dashboards-tablist" role="tablist" aria-label="Dashboards">
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            ref={node => { buttonRefs.current[tab.key] = node; }}
            type="button"
            role="tab"
            id={`dashboards-tab-${tab.key}`}
            aria-selected={activeTab.key === tab.key}
            aria-controls={TAB_PANEL_IDS[tab.key]}
            tabIndex={focusedKey === tab.key ? 0 : -1}
            className={'dashboards-tab ' + (activeTab.key === tab.key ? 'active' : '')}
            onClick={() => activate(tab)}
            onFocus={() => setFocusedKey(tab.key)}
            onKeyDown={event => moveFocus(event, index)}
          >
            <span className="dashboards-tab-icon">{I[tab.icon]}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>}
      {tabs.length > 1 ? tabs.map(tab => <div
        key={tab.key}
        className="dashboards-panel"
        id={TAB_PANEL_IDS[tab.key]}
        role="tabpanel"
        aria-labelledby={`dashboards-tab-${tab.key}`}
        tabIndex={0}
        hidden={activeTab.key !== tab.key}
      >{activeTab.key === tab.key && <Suspense fallback={<DashboardPanelFallback />}>
        {activeTab.key === 'dashboard' ? <Component role={role} /> : <Component />}
      </Suspense>}</div>) : <div className="dashboards-panel">
        <Suspense fallback={<DashboardPanelFallback />}>
          {activeTab.key === 'dashboard' ? <Component role={role} /> : <Component />}
        </Suspense>
      </div>}
    </div>
  );
}
