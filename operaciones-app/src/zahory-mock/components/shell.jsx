import { useState, useEffect } from 'react';

// ─── Icons ────────────────────────────────────────────────────────────────────
export const Icon = ({ name, size = 16, stroke = 2 }) => {
  const s = { width: size, height: size, fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></>,
    orders: <><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
    mine: <><path d="M2 20h20" /><path d="M4 20l4-10 4 4 4-8 4 14" /></>,
    workshop: <><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9L6.6 21a2.1 2.1 0 1 1-3-3l6.6-7.1a6 6 0 0 1 7.9-7.9l-3.7 3.7z" /></>,
    chart: <><path d="M3 3v18h18" /><path d="M7 14l4-4 4 4 5-5" /></>,
    report: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></>,
    clients: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    box: <><path d="M21 8V21H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></>,
    parts: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    cog: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
    equipment: <><rect x="2" y="7" width="20" height="12" rx="2" /><path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" /><circle cx="7" cy="19" r="2" /><circle cx="17" cy="19" r="2" /></>,
    rates: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
    bell: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    arrow: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
    back: <><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></>,
    filter: <><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
    chev: <><path d="m9 18 6-6-6-6" /></>,
    chevDown: <><path d="m6 9 6 6 6-6" /></>,
    mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M19 10a7 7 0 0 1-14 0" /><path d="M12 19v3" /></>,
    camera: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></>,
    check: <><path d="M20 6 9 17l-5-5" /></>,
    x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
    edit: <><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></>,
    pdf: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
    alert: <><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></>,
    menu: <><path d="M3 12h18" /><path d="M3 6h18" /><path d="M3 18h18" /></>,
    sun: <><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></>,
    moon: <><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></>,
    // DDD group icons
    briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><path d="M8 14h8" /></>,
    activity: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></>,
    package: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>,
    map: <><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
  };
  return <svg {...s} viewBox="0 0 24 24">{paths[name] || null}</svg>;
};

// ─── Formatters ───────────────────────────────────────────────────────────────
export const fmt = (n, currency = "USD", fx = 3.745) => {
  const v = currency === "PEN" ? n * fx : n;
  const sym = currency === "USD" ? "$" : "S/ ";
  return sym + v.toLocaleString("en-US", { maximumFractionDigits: 0, minimumFractionDigits: 0 });
};
export const fmt2 = (n, currency = "USD", fx = 3.745) => {
  const v = currency === "PEN" ? n * fx : n;
  const sym = currency === "USD" ? "$" : "S/ ";
  return sym + v.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
};

// ─── Sidebar Zones — v6 Flujo Operativo Zahory SAC ───────────────────────────
// type 'flat'           → etiqueta de sección + ítems directos sin acordeón
// type 'business-lines' → etiqueta de sección + grupos colapsables (acordeón L1)
//                         Producción soporta L2 (áreas) y L3 (procesos)
export const SIDEBAR_ZONES = [
  // ── INICIO ──────────────────────────────────────────────────────────────────
  {
    id: 'inicio', label: 'INICIO', type: 'flat',
    roles: ['gerente', 'supervisor', 'tecnico', 'hse', 'almacenero'],
    items: [
      { id: 'dashboard',    label: 'Dashboard Gerencial', icon: 'dashboard', roles: ['gerente', 'supervisor', 'hse', 'almacenero'] },
      { id: 'mis-ots-hoy', label: 'Mis OTs del día',     icon: 'orders',    roles: ['gerente', 'supervisor', 'tecnico'], badge: 'HOY', badgeColor: 'amber' },
      { id: 'mapa-campo',  label: 'Mapa de Campo',        icon: 'map',       roles: ['gerente', 'supervisor'] },
    ],
  },

  // ── LÍNEAS DE NEGOCIO ────────────────────────────────────────────────────────
  {
    id: 'lineas', label: 'LÍNEAS DE NEGOCIO', type: 'business-lines',
    roles: ['gerente', 'tecnico'],
    groups: [
      {
        id: 'flota-alquileres', label: 'Flota & Alquileres', emoji: '🚜',
        roles: ['gerente'], groupBadge: 'CORE',
        items: [
          { id: 'flota',                    label: 'Panel de Flota',             icon: 'equipment' },
          { id: 'contratos-rental',         label: 'Contratos Rental',           icon: 'report' },
          { id: 'checkout',                 label: 'Actas & Despachos',          icon: 'check' },
          { id: 'liquidacion',              label: 'Liquidación & DMR',          icon: 'chart' },
          { id: 'pasaporte-equipos',        label: 'Pasaporte de Equipos',       icon: 'report' },
          { id: 'gestion-garantias',        label: 'Gestión de Garantías',       icon: 'check' },
          { id: 'certificaciones-activo',   label: 'Certificaciones del Activo', icon: 'lock' },
          { id: 'monitoreo-equipos',        label: 'Monitoreo Equipos',          icon: 'activity',  badge: 'NUEVO',   badgeColor: 'green' },
        ],
      },
      {
        id: 'transporte', label: 'Transporte Comercial', emoji: '🚚',
        roles: ['gerente'],
        items: [
          { id: 'transporte-viajes',       label: 'Monitor de Viajes',  icon: 'mine' },
          { id: 'transporte-ruta',         label: 'Hoja de Ruta',       icon: 'arrow' },
          { id: 'transporte-tarifas',      label: 'Maestro de Rutas',   icon: 'rates' },
          { id: 'transporte-tarifas-config', label: 'Tarifas Transporte', icon: 'rates' },
        ],
      },
      {
        id: 'produccion', label: 'Producción', emoji: '🏭',
        roles: ['gerente', 'tecnico'],
        items: [
          { id: 'dashboard-produccion', label: 'Dashboard Producción',   icon: 'dashboard', roles: ['gerente'] },
          { id: 'maestranza-of',        label: 'Órdenes de Fab. (OF)',   icon: 'parts', altIds: ['produccion-crear-of', 'produccion-detalle-of'], roles: ['gerente'] },
          { id: 'of-planificacion',     label: 'Planificación de OF',    icon: 'rates', roles: ['gerente'] },
          { id: 'maestranza-piso',      label: 'Control de Producción',  icon: 'activity', roles: ['gerente'], badge: 'MES' },
          { id: 'of-tiempos-mtm',       label: 'Tiempos y MTM',          icon: 'rates',    roles: ['gerente'], badge: 'MES' },
          { id: 'of-oee',               label: 'OEE y Rendimiento',      icon: 'chart',    roles: ['gerente'], badge: 'MES' },
          { id: 'of-no-conformidades',  label: 'No Conformidades',       icon: 'alert',    roles: ['gerente'], badge: 'MES' },
        ],
        areaItems: [
          {
            id: 'area-ingenieria', label: 'Ingeniería y Diseño', areaColor: '#8b5cf6',
            roles: ['gerente', 'tecnico'],
            altIds: ['ing-planos', 'maestranza-bom', 'ing-tiempos'],
            subItems: [
              { id: 'ing-planos',     label: 'Planos y Especificaciones' },
              { id: 'maestranza-bom', label: 'Lista de Materiales (BOM)' },
              { id: 'ing-tiempos',    label: 'Estimación de Tiempos' },
            ],
          },
          {
            id: 'area-maestranza', label: 'Maestranza', areaColor: '#64748b',
            roles: ['gerente', 'tecnico'],
            altIds: ['mae-torneado', 'mae-fresado', 'mae-rectificado', 'mae-taladrado', 'mae-cromado', 'mae-recuperacion'],
            subItems: [
              { id: 'mae-torneado',    label: 'Torneado' },
              { id: 'mae-fresado',     label: 'Fresado' },
              { id: 'mae-rectificado', label: 'Rectificado' },
              { id: 'mae-taladrado',   label: 'Taladrado / Mandrinado' },
              { id: 'mae-cromado',     label: 'Cromado Industrial' },
              { id: 'mae-recuperacion', label: 'Recuperación de Piezas' },
            ],
          },
          {
            id: 'area-soldadura', label: 'Soldadura', areaColor: '#f97316',
            roles: ['gerente', 'tecnico'],
            altIds: ['sol-mig-tig', 'sol-recargue', 'sol-corte', 'sol-estructural'],
            subItems: [
              { id: 'sol-mig-tig',    label: 'MIG / TIG / SMAW' },
              { id: 'sol-recargue',   label: 'Recargue y Recuperación' },
              { id: 'sol-corte',      label: 'Corte Térmico' },
              { id: 'sol-estructural', label: 'Soldadura Estructural' },
            ],
          },
          {
            id: 'area-fabricacion', label: 'Fabricación y Ensamble', areaColor: '#06b6d4',
            roles: ['gerente', 'tecnico'],
            altIds: ['fab-piezas', 'fab-estructuras', 'fab-ensamble', 'fab-pruebas'],
            subItems: [
              { id: 'fab-piezas',      label: 'Fabricación de Piezas' },
              { id: 'fab-estructuras', label: 'Fabricación de Estructuras' },
              { id: 'fab-ensamble',    label: 'Ensamble de Componentes' },
              { id: 'fab-pruebas',     label: 'Pruebas y Control de Calidad' },
            ],
          },
        ],
        tailItems: [
          { type: 'divider', label: 'CALIDAD Y TRAZABILIDAD' },
          { id: 'of-calidad',      label: 'Control de Calidad',      icon: 'check',  roles: ['gerente'] },
          { id: 'of-trazabilidad', label: 'Trazabilidad de OF',      icon: 'report', roles: ['gerente'] },
          { id: 'of-informes',     label: 'Informes y Certificados', icon: 'pdf',    roles: ['gerente'] },
        ],
      },
      {
        id: 'venta-repuestos', label: 'Venta de Repuestos', emoji: '🛒',
        roles: ['gerente'],
        items: [
          { id: 'catalogo',               label: 'Catálogo CAT',        icon: 'box' },
          { id: 'repuestos-cotizaciones', label: 'Cotizaciones Venta',  icon: 'report' },
          { id: 'repuestos-ordenes',      label: 'Órdenes de Venta',    icon: 'orders' },
          { id: 'repuestos-despachos',    label: 'Guías & Despachos',   icon: 'download' },
        ],
      },
    ],
  },

  // ── TALLER & OPERACIONES ────────────────────────────────────────────────────
  {
    id: 'taller-ops', label: 'TALLER & OPERACIONES', type: 'business-lines',
    roles: ['gerente', 'supervisor', 'tecnico', 'hse'],
    groups: [
      {
        id: 'ordenes-trabajo', label: 'Órdenes de Trabajo', emoji: '🔧',
        roles: ['gerente', 'supervisor', 'tecnico'], groupBadge: 'DIARIO',
        items: [
          { id: 'ots',                label: 'Bandeja Maestra',      icon: 'orders',   roles: ['gerente', 'supervisor', 'tecnico'] },
          { id: 'crear-ot',           label: 'Nueva OT · DBS',       icon: 'plus',     roles: ['gerente', 'supervisor', 'tecnico'] },
          { id: 'taller',             label: 'Partes Taller',         icon: 'workshop', roles: ['gerente', 'supervisor', 'tecnico'] },
          { id: 'partes-mina',        label: 'Reportes Mina',         icon: 'mine',     roles: ['gerente', 'supervisor', 'tecnico'] },
          { id: 'cierre-conformidad', label: 'Cierre & Conformidad',  icon: 'check',    roles: ['gerente', 'supervisor'] },
          { id: 'scheduler-despacho', label: 'Scheduler · Despacho',  icon: 'calendar', roles: ['gerente', 'supervisor'] },
        ],
      },
      {
        id: 'hse-grp', label: 'HSE — SEGURIDAD', emoji: '🛡️',
        roles: ['gerente', 'supervisor', 'tecnico', 'hse'],
        groupBadge: 'HSE', groupBadgeClass: 'group-badge-hse',
        items: [
          { id: 'hse-dashboard',       label: 'Dashboard HSE',            icon: 'shield',    roles: ['gerente', 'supervisor', 'hse'] },
          { id: 'permisos-trabajo',    label: 'Permisos de Trabajo',      icon: 'shield',    roles: ['gerente', 'supervisor', 'tecnico', 'hse'] },
          { id: 'registro-incidentes', label: 'Registro de Incidentes',   icon: 'alert',     roles: ['gerente', 'supervisor', 'hse'] },
          { id: 'epp-certificaciones', label: 'EPP & Certificaciones',    icon: 'users',     roles: ['gerente', 'supervisor', 'tecnico', 'hse'] },
          { id: 'analisis-riesgo-ats', label: 'Análisis de Riesgo (ATS)', icon: 'report',    roles: ['gerente', 'supervisor', 'hse'] },
          { id: 'protocolo-loto',      label: 'Protocolo LOTO',           icon: 'lock',      roles: ['gerente', 'supervisor', 'hse'] },
        ],
      },
      {
        id: 'confiabilidad-grp', label: 'Confiabilidad', emoji: '📊',
        roles: ['gerente', 'supervisor'],
        items: [
          { id: 'backlog',                  label: 'Backlog Operativo',      icon: 'orders' },
          { id: 'sos-telemetria',           label: 'Análisis SOS',           icon: 'activity' },
          { id: 'confiabilidad',            label: 'KPIs de Confiabilidad',  icon: 'chart' },
          { id: 'programacion-pm',          label: 'Programación PM',        icon: 'rates' },
          { id: 'disponibilidad-mecanica',  label: 'Disponibilidad Mecánica', icon: 'chart' },
        ],
      },
    ],
  },

  // ── SUPPLY CHAIN ────────────────────────────────────────────────────────────
  {
    id: 'supply-chain', label: 'SUPPLY CHAIN', type: 'business-lines',
    roles: ['gerente', 'almacenero'],
    groups: [
      {
        id: 'almacen', label: 'Almacén & Repuestos', emoji: '📦',
        roles: ['gerente', 'almacenero'],
        items: [
          { id: 'catalogo',            label: 'Inventario & Kardex',     icon: 'box' },
          { id: 'solicitudes',         label: 'Solicitudes SOLPE',       icon: 'parts' },
          { id: 'almacen-reservas',    label: 'Reserva de Repuestos',    icon: 'lock',     badge: 'PRÓXIMO', badgeColor: 'proximo' },
          { id: 'almacen-movimientos', label: 'Entradas & Salidas',      icon: 'download' },
          { id: 'almacen-alertas',     label: 'Stock Mínimos & Alertas', icon: 'alert' },
        ],
      },
      {
        id: 'compras', label: 'Compras & Importación', emoji: '🌐',
        roles: ['gerente'],
        items: [
          { id: 'compras-proveedores',   label: 'Proveedores',           icon: 'clients' },
          { id: 'compras-cotizaciones',  label: 'Cotizaciones Compra',   icon: 'report' },
          { id: 'compras-oc',            label: 'Órdenes de Compra',     icon: 'orders' },
          { id: 'compras-importaciones', label: 'Importaciones & DUA',   icon: 'download' },
          { id: 'compras-recepciones',   label: 'Recepciones',           icon: 'check' },
        ],
      },
    ],
  },

  // ── ADMINISTRACIÓN ──────────────────────────────────────────────────────────
  {
    id: 'admin', label: 'ADMINISTRACIÓN', type: 'business-lines',
    roles: ['gerente'],
    groups: [
      {
        id: 'finanzas', label: 'Finanzas & Facturación', emoji: '💰',
        roles: ['gerente'],
        items: [
          { id: 'consolidado',       label: 'Consolidado Facturación', icon: 'report' },
          { id: 'finanzas-cxc',      label: 'Cuentas por Cobrar',      icon: 'chart' },
          { id: 'finanzas-cxp',      label: 'Cuentas por Pagar',       icon: 'chart' },
          { id: 'finanzas-tesoreria', label: 'Tesorería',              icon: 'rates' },
          { id: 'ots-costos',        label: 'Costos & Rentabilidad',   icon: 'chart' },
        ],
      },
      {
        id: 'clientes-activos', label: 'Clientes & Activos', emoji: '👥',
        roles: ['gerente'],
        items: [
          { id: 'clientes',  label: 'Clientes & Contratos', icon: 'clients' },
          { id: 'equipos',   label: 'Equipos & Activos',    icon: 'equipment' },
          { id: 'proyectos', label: 'Proyectos & Tarifas',  icon: 'rates' },
        ],
      },
      {
        id: 'config-grp', label: 'Configuración', emoji: '⚙️',
        roles: ['gerente'],
        items: [
          { id: 'usuarios',      label: 'Usuarios & Roles',    icon: 'users' },
          { id: 'configuracion', label: 'Parámetros Globales', icon: 'cog' },
        ],
      },
    ],
  },
];

const DEFAULT_TECNICO_AREA_ID = 'area-soldadura';

const getTecnicoAreaId = () => {
  try {
    return localStorage.getItem("difesmaq_tecnico_area") || DEFAULT_TECNICO_AREA_ID;
  } catch {
    return DEFAULT_TECNICO_AREA_ID;
  }
};

const getGroupNavItems = (group) => [
  ...(group.items || []),
  ...(group.areaItems || []),
  ...(group.tailItems || []),
];

const itemMatchesPage = (item, pageId) =>
  item.id === pageId ||
  item.altIds?.includes(pageId) ||
  item.subItems?.some(si => si.id === pageId);

const findGroupForPage = (pageId) => {
  for (const zone of SIDEBAR_ZONES) {
    if (zone.type === 'business-lines' && zone.groups) {
      for (const g of zone.groups) {
        if (getGroupNavItems(g).some(it => itemMatchesPage(it, pageId))) return g.id;
      }
    }
  }
  return null;
};

const findAreaForPage = (pageId) => {
  const production = SIDEBAR_ZONES
    .find(z => z.id === 'lineas')
    ?.groups.find(g => g.id === 'produccion');
  return production?.areaItems?.find(area => itemMatchesPage(area, pageId)) || null;
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export const Sidebar = ({ current, onNav, role }) => {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("difesmaq_sidebar_collapsed") === "true");
  const [openLines, setOpenLines] = useState(() => {
    const s = new Set(['flota-alquileres']);
    const grp = findGroupForPage(current);
    if (grp) s.add(grp);
    return s;
  });

  useEffect(() => {
    localStorage.setItem("difesmaq_sidebar_collapsed", String(collapsed));
    document.documentElement.style.setProperty("--sidebar-w", collapsed ? "72px" : "248px");
  }, [collapsed]);

  useEffect(() => {
    const grp = findGroupForPage(current);
    if (grp) setOpenLines(prev => { const s = new Set(prev); s.add(grp); return s; });
  }, [current]);

  const [openAreaId, setOpenAreaId] = useState(() => findAreaForPage(current)?.id || null);

  useEffect(() => {
    const area = findAreaForPage(current);
    if (area) setOpenAreaId(area.id);
  }, [current]);

  const toggleLine = (id) => setOpenLines(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  const roleStr = role;
  const tecnicoAreaId = roleStr === 'tecnico' ? getTecnicoAreaId() : null;
  const canSee = (roles) => !roles || roles.includes(roleStr);
  const canSeeArea = (area) => roleStr !== 'tecnico' || area.id === tecnicoAreaId;
  const isActive = (it) => itemMatchesPage(it, current);
  const handleAreaClick = (area) => {
    if (openAreaId === area.id) {
      setOpenAreaId(null);
      return;
    }
    setOpenAreaId(area.id);
    onNav(area.id);
  };
  const handleProcessClick = (areaId, processId) => {
    setOpenAreaId(areaId);
    onNav(processId);
  };

  return (
    <aside className={"sidebar" + (collapsed ? " collapsed" : "")}>

      <div className="sidebar-logo">
        <div className="mark">Z</div>
        <div className="wordmark">TIDEO<small>ERP Activos Intensivos</small></div>
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(v => !v)}
          title={collapsed ? "Expandir menu" : "Colapsar menu"}
          aria-label={collapsed ? "Expandir menu" : "Colapsar menu"}
        >
          <Icon name={collapsed ? "chev" : "menu"} size={15} />
        </button>
      </div>

      <div className="sidebar-scroll">
        {SIDEBAR_ZONES.filter(z => canSee(z.roles)).map(zone => {

          // ── Flat zone ────────────────────────────────────────────────────
          if (zone.type === 'flat') {
            const vis = zone.items.filter(it => canSee(it.roles));
            if (!vis.length) return null;
            return (
              <div key={zone.id}>
                <div className="nav-section-label" title={zone.label}><span className="dot" /><span className="label">{zone.label}</span></div>
                {vis.map(it => (
                  <button key={it.id} title={it.label} className={"nav-item" + (isActive(it) ? " active" : "")} onClick={() => onNav(it.id)}>
                    <Icon name={it.icon} size={14} /><span className="label">{it.label}</span>
                    {it.badge && <span className={`badge-new${it.badgeColor ? ` badge-${it.badgeColor}` : ''}`}>{it.badge}</span>}
                  </button>
                ))}
              </div>
            );
          }

          // ── Business-lines zone (accordion sub-groups) ───────────────────
          if (zone.type === 'business-lines') {
            const visibleGroups = zone.groups.filter(g => canSee(g.roles));
            if (!visibleGroups.length) return null;

            return (
              <div key={zone.id}>
                <div className="nav-section-label" title={zone.label}><span className="dot" /><span className="label">{zone.label}</span></div>
                {visibleGroups.map(g => {
                  const visibleItems = (g.items || []).filter(it => canSee(it.roles));
                  const visibleAreaItems = (g.areaItems || []).filter(it => canSee(it.roles) && canSeeArea(it));
                  const visibleTailItems = (g.tailItems || []).filter(it => canSee(it.roles));
                  if (!visibleItems.length && !visibleAreaItems.length && !visibleTailItems.length) return null;

                  const isOpen = openLines.has(g.id);
                  const hasActive = [...visibleItems, ...visibleAreaItems, ...visibleTailItems].some(it => isActive(it));
                  const renderNavEntry = (it, idx, prefix = 'item') => {
                    if (it.type === 'divider') {
                      return <div key={`${prefix}-divider-${idx}`} className="nav-area-separator"><span>{it.label}</span></div>;
                    }
                    return (
                      <button key={it.id} title={it.label} className={"nav-item" + (isActive(it) ? " active" : "")} onClick={() => onNav(it.id)}>
                        <Icon name={it.icon} size={14} /><span className="label">{it.label}</span>
                        {it.badge && <span className={`badge-new${it.badgeColor ? ` badge-${it.badgeColor}` : ''}`}>{it.badge}</span>}
                      </button>
                    );
                  };
                  return (
                    <div key={g.id} className={"nav-group" + (isOpen ? " open" : "")}>
                      <button
                        className={"nav-group-head" + (hasActive ? " has-active" : "")}
                        onClick={() => toggleLine(g.id)}
                        title={g.label}
                      >
                        <span className="g-icon" style={{ fontSize: 13 }}>{g.emoji}</span>
                        <span className="g-label">{g.label}</span>
                        {g.groupBadge && <span className={`group-badge${g.groupBadgeClass ? ' ' + g.groupBadgeClass : ''}`}>{g.groupBadge}</span>}
                        <span className="g-chev"><Icon name="chev" size={11} /></span>
                      </button>
                      <div className="nav-group-body">
                        {visibleItems.map((it, idx) => renderNavEntry(it, idx, 'head'))}

                        {visibleAreaItems.length > 0 && (
                          <>
                            <div className="nav-area-separator"><span>ÁREAS PRODUCTIVAS</span></div>
                            {visibleAreaItems.map(area => {
                              const areaOpen = openAreaId === area.id;
                              const areaActive = isActive(area);
                              return (
                                <div key={area.id} className={"nav-area" + (areaOpen ? " open" : "")}>
                                  <button
                                    title={area.label}
                                    className={"nav-item nav-area-head" + (areaActive ? " active" : "")}
                                    style={{ "--area-color": area.areaColor }}
                                    onClick={() => handleAreaClick(area)}
                                  >
                                    <span className="area-dot" />
                                    <span className="label">{area.label}</span>
                                    <span className="area-chev"><Icon name="chev" size={10} /></span>
                                  </button>
                                  {areaOpen && (
                                    <div className="nav-area-processes">
                                      {area.subItems.map(si => (
                                        <button
                                          key={si.id}
                                          title={si.label}
                                          className={"nav-item nav-area-process" + (si.id === current ? " active" : "")}
                                          onClick={() => handleProcessClick(area.id, si.id)}
                                        >
                                          <span className="label">{si.label}</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </>
                        )}
                        {visibleTailItems.map((it, idx) => renderNavEntry(it, idx, 'tail'))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }

          // ── Shared-resources zone (always-visible labeled sub-groups) ────
          if (zone.type === 'shared-resources') {
            const visGroups = zone.groups.filter(g => canSee(g.roles));
            if (!visGroups.length) return null;
            return (
              <div key={zone.id}>
                <div className="nav-section-label" title={zone.label}><span className="dot" /><span className="label">{zone.label}</span></div>
                {visGroups.map(g => {
                  const visItems = g.items.filter(it => canSee(it.roles));
                  if (!visItems.length) return null;
                  return (
                    <div key={g.id}>
                      <div className="nav-subsection-label" title={g.label}>
                        {g.label}
                      </div>
                      {visItems.map(it => (
                        <button key={it.id} title={it.label} className={"nav-item nav-item-indented" + (isActive(it) ? " active" : "")} onClick={() => onNav(it.id)}>
                          <Icon name={it.icon} size={14} /><span className="label">{it.label}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          }

          return null;
        })}
      </div>

      <div className="sidebar-footer">
        <button
          className="logout sidebar-footer-toggle"
          onClick={() => setCollapsed(v => !v)}
          title={collapsed ? "Expandir menu" : "Colapsar menu"}
        >
          <Icon name={collapsed ? "chev" : "back"} size={15} />
        </button>
      </div>

    </aside>
  );
};

// ─── TopBar ───────────────────────────────────────────────────────────────────
export const TopBar = ({ title, crumb, role, onRoleSwap, onLogout, theme, onToggleTheme }) => {
  const user = role === 'tecnico'
    ? { name: 'Miranda Barra, S.', role: 'Técnico de Mina', initials: 'MB' }
    : { name: 'C. Balvín', role: 'Gerente de Operaciones', initials: 'CB' };

  return (
    <div className="topbar">
      <div>
        <div className="crumb">{crumb}</div>
        <div className="title">{title}</div>
      </div>
      <div className="spacer" />
      <input className="search" placeholder="Buscar OTs, equipos, técnicos..." />
      <button className="icon-btn" onClick={onToggleTheme} title="Cambiar tema">
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
      </button>
      <button className="role-pill" onClick={onRoleSwap} title="Cambiar rol">
        <Icon name="users" size={12} />
        {role === "gerente" ? "Gerente" : "Técnico"}
      </button>
      <div className="header-profile">
        <div className="header-avatar">{user.initials}</div>
        <div className="header-profile-meta">
          <div className="header-profile-name">{user.name}</div>
          <div className="header-profile-role">{user.role}</div>
        </div>
        <button className="profile-logout" onClick={onLogout} title="Cerrar sesión">
          <Icon name="logout" size={13} />
        </button>
      </div>
      <button className="icon-btn" title="Notificaciones">
        <Icon name="bell" size={17} />
      </button>
    </div>
  );
};

export const FooterBrand = () => (
  <div className="footer-brand">Desarrollado por TIDEO Tech & Strategy · TIDEO Platform v2 · 2026</div>
);
