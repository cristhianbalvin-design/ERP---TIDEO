import { CostosPage } from '../pages/pages1.jsx';
import {
  SolicitudesPage,
  DocsPage,
  UsuariosPage,
  ConsolidadoPage,
} from '../pages/pages2_v2.jsx';
import { ClientesContratosPage } from '../pages/ClientesContratosPage.jsx';
import { EquiposPage } from '../pages/EquiposPage.jsx';
import { ProyectosTarifasPage } from '../pages/ProyectosTarifasPage.jsx';
import { ConfiguracionPage } from '../pages/ConfiguracionPage.jsx';
import { PlaceholderPage } from '../components/PlaceholderPage.jsx';
import { AdministrativeAppLinkPage } from '../components/AdministrativeAppLinkPage.jsx';
import { RecepcionOCPage } from '../pages/RecepcionOCPage.jsx';
import { UbicacionesPage } from '../pages/UbicacionesPage.jsx';
import { GemeloAlmacenPage } from '../pages/gemelo/GemeloAlmacenPage.jsx';
import { InventarioKardexPage } from '../pages/InventarioKardexPage.jsx';
import { ReservaRepuestosPage } from '../pages/ReservaRepuestosPage.jsx';
import { MinasProyectosPage } from '../pages/MinasProyectosPage.jsx';
import { DespachosPage } from '../pages/wms/DespachosPage.jsx';
import { StockMinimosPage } from '../pages/wms/StockMinimosPage.jsx';
import { ConteosPage } from '../pages/wms/ConteosPage.jsx';
import { CustodiaPage } from '../pages/wms/CustodiaPage.jsx';
import { ConfiguracionWmsPage } from '../pages/wms/ConfiguracionWmsPage.jsx';

export const supplyAdministrationRouteIds = new Set([
  'solicitudes', 'almacen-inventario', 'almacen-reservas', 'almacen-alertas', 'almacen-ubicaciones', 'almacen-gemelo', 'almacen-minas',
  'almacen-despachos', 'almacen-conteos', 'almacen-custodia', 'almacen-config',
  'compras-proveedores', 'compras-cotizaciones', 'compras-oc',
  'compras-importaciones', 'compras-recepciones',
  'consolidado', 'finanzas-cxc', 'finanzas-cxp', 'finanzas-tesoreria',
  'ots-costos', 'costos', 'clientes', 'equipos', 'proyectos',
  'usuarios', 'configuracion', 'config', 'docs',
  'proveedores',
]);

export function redirigirAlmacenMovimientosObsoleto(hash = globalThis.window?.location?.hash || '') {
  if (String(hash).split('?', 1)[0].replace(/^#\/?/, '') !== 'almacen-movimientos') return false;
  if (globalThis.window?.location) globalThis.window.location.hash = '#/almacen-inventario';
  return true;
}

redirigirAlmacenMovimientosObsoleto();

export function renderSupplyAdministrationRoute(route, context) {
  const { onNavigate, setCurrentOT } = context;

  switch (route) {
    case 'almacen-inventario': return <InventarioKardexPage />;
    case 'solicitudes': return <><AdministrativeAppLinkPage title="Solicitudes SOLPE" adminRoute="solpe" /><SolicitudesPage onNav={onNavigate} /></>;
    case 'almacen-reservas': return <ReservaRepuestosPage />;
    case 'almacen-alertas': return <StockMinimosPage />;
    case 'almacen-despachos': return <DespachosPage />;
    case 'almacen-conteos': return <ConteosPage />;
    case 'almacen-custodia': return <CustodiaPage />;
    case 'almacen-config': return <ConfiguracionWmsPage />;
    case 'almacen-ubicaciones': return <UbicacionesPage />;
    case 'almacen-gemelo': return <GemeloAlmacenPage />;
    case 'almacen-minas': return <MinasProyectosPage />;
    case 'compras-proveedores': return <><AdministrativeAppLinkPage title="Proveedores" adminRoute="proveedores" /><PlaceholderPage title="Proveedores" /></>;
    case 'compras-cotizaciones': return <><AdministrativeAppLinkPage title="Cotizaciones Compra" adminRoute="cot_compras" /><PlaceholderPage title="Cotizaciones Compra" /></>;
    case 'compras-oc': return <><AdministrativeAppLinkPage title="Órdenes de Compra" adminRoute="ordenes_compra" /><PlaceholderPage title="Órdenes de Compra" /></>;
    case 'compras-importaciones': return <PlaceholderPage title="Compras e Importaciones" />;
    case 'compras-recepciones': return <RecepcionOCPage />;

    case 'consolidado': return <ConsolidadoPage />;
    case 'finanzas-cxc': return <><AdministrativeAppLinkPage title="Cuentas por Cobrar" adminRoute="cxc" /><PlaceholderPage title="Cuentas por Cobrar" /></>;
    case 'finanzas-cxp': return <><AdministrativeAppLinkPage title="Cuentas por Pagar" adminRoute="cxp" /><PlaceholderPage title="Cuentas por Pagar" /></>;
    case 'finanzas-tesoreria': return <><AdministrativeAppLinkPage title="Tesorería" adminRoute="tesoreria" /><PlaceholderPage title="Tesorería" /></>;
    case 'ots-costos':
    case 'costos': return <CostosPage onNav={onNavigate} setCurrentOT={setCurrentOT} />;
    case 'clientes': return <ClientesContratosPage />;
    case 'equipos': return <EquiposPage />;
    case 'proyectos': return <ProyectosTarifasPage onNav={onNavigate} />;
    case 'usuarios': return <><AdministrativeAppLinkPage title="Usuarios y Roles" adminRoute="usuarios" /><UsuariosPage /></>;
    case 'configuracion':
    case 'config': return <ConfiguracionPage />;
    case 'docs': return <DocsPage />;
    case 'proveedores': return <PlaceholderPage title="Proveedores" />;
    default: return null;
  }
}
