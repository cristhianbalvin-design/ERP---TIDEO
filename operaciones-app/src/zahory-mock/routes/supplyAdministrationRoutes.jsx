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
    case 'solicitudes': return <SolicitudesPage onNav={onNavigate} />;
    case 'almacen-reservas': return <PlaceholderPage title="Reserva de Repuestos" subtitle="Reserva de ítems de stock vinculados a una OT específica. Bloquea el ítem hasta consumo o liberación." />;
    case 'almacen-movimientos': return <PlaceholderPage title="Entradas & Salidas" />;
    case 'almacen-alertas': return <PlaceholderPage title="Stock Mínimos & Alertas" />;
    case 'compras-proveedores': return <PlaceholderPage title="Proveedores" />;
    case 'compras-cotizaciones': return <PlaceholderPage title="Cotizaciones Compra" />;
    case 'compras-oc': return <PlaceholderPage title="Órdenes de Compra" />;
    case 'compras-importaciones': return <PlaceholderPage title="Compras e Importaciones" />;
    case 'compras-recepciones': return <PlaceholderPage title="Recepciones" />;

    case 'consolidado': return <ConsolidadoPage />;
    case 'finanzas-cxc': return <PlaceholderPage title="Cuentas por Cobrar" />;
    case 'finanzas-cxp': return <PlaceholderPage title="Cuentas por Pagar" />;
    case 'finanzas-tesoreria': return <PlaceholderPage title="Tesorería" />;
    case 'ots-costos':
    case 'costos': return <CostosPage onNav={onNavigate} setCurrentOT={setCurrentOT} />;
    case 'clientes': return <ClientesContratosPage />;
    case 'equipos': return <EquiposPage />;
    case 'proyectos': return <ProyectosTarifasPage />;
    case 'usuarios': return <UsuariosPage />;
    case 'configuracion':
    case 'config': return <ConfiguracionPage />;
    case 'docs': return <DocsPage />;
    case 'proveedores': return <PlaceholderPage title="Proveedores" />;
    default: return null;
  }
}
