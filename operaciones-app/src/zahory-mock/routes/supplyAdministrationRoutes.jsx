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

export const supplyAdministrationRouteIds = new Set([
  'solicitudes', 'almacen-reservas', 'almacen-movimientos', 'almacen-alertas',
  'compras-proveedores', 'compras-cotizaciones', 'compras-oc',
  'compras-importaciones', 'compras-recepciones',
  'consolidado', 'finanzas-cxc', 'finanzas-cxp', 'finanzas-tesoreria',
  'ots-costos', 'costos', 'clientes', 'equipos', 'proyectos',
  'usuarios', 'configuracion', 'config', 'docs',
  'proveedores',
]);

export function renderSupplyAdministrationRoute(route, context) {
  const { onNavigate, setCurrentOT } = context;

  switch (route) {
    case 'solicitudes': return <AdministrativeAppLinkPage title="Solicitudes SOLPE" adminRoute="solpe" />;
    case 'almacen-reservas': return <PlaceholderPage title="Reserva de Repuestos" subtitle="Reserva de ítems de stock vinculados a una OT específica. Bloquea el ítem hasta consumo o liberación." />;
    case 'almacen-movimientos': return <AdministrativeAppLinkPage title="Entradas y Salidas" adminRoute="inventario" />;
    case 'almacen-alertas': return <AdministrativeAppLinkPage title="Stock Mínimos y Alertas" adminRoute="inventario" />;
    case 'compras-proveedores': return <AdministrativeAppLinkPage title="Proveedores" adminRoute="proveedores" />;
    case 'compras-cotizaciones': return <AdministrativeAppLinkPage title="Cotizaciones Compra" adminRoute="cot_compras" />;
    case 'compras-oc': return <AdministrativeAppLinkPage title="Órdenes de Compra" adminRoute="ordenes_compra" />;
    case 'compras-importaciones': return <PlaceholderPage title="Compras e Importaciones" />;
    case 'compras-recepciones': return <AdministrativeAppLinkPage title="Recepciones" adminRoute="recepciones" />;

    case 'consolidado': return <ConsolidadoPage />;
    case 'finanzas-cxc': return <AdministrativeAppLinkPage title="Cuentas por Cobrar" adminRoute="cxc" />;
    case 'finanzas-cxp': return <AdministrativeAppLinkPage title="Cuentas por Pagar" adminRoute="cxp" />;
    case 'finanzas-tesoreria': return <AdministrativeAppLinkPage title="Tesorería" adminRoute="tesoreria" />;
    case 'ots-costos':
    case 'costos': return <CostosPage onNav={onNavigate} setCurrentOT={setCurrentOT} />;
    case 'clientes': return <ClientesContratosPage />;
    case 'equipos': return <EquiposPage />;
    case 'proyectos': return <ProyectosTarifasPage />;
    case 'usuarios': return <AdministrativeAppLinkPage title="Usuarios y Roles" adminRoute="usuarios" />;
    case 'configuracion':
    case 'config': return <ConfiguracionPage />;
    case 'docs': return <DocsPage />;
    case 'proveedores': return <PlaceholderPage title="Proveedores" />;
    default: return null;
  }
}
