import {
  DashboardRentalPage,
  FlotaRentalPage,
  ContratosRentalPage,
  DespachosRentalPage,
  LiquidacionRentalPage,
} from '../pages/AlquileresPages.jsx';
import {
  AnalisisSOS,
  DashboardProduccion,
  BandejaOFs,
  CrearOFPage,
  DetalleOFPage,
  PlanificacionOFPage,
  ControlProduccion,
  TiemposMTMPage,
  OEEPage,
  NoConformidadesPage,
  CalidadPage,
  PasaporteComponentePage,
  GarantiasPage,
  IngenieriaBOM,
  TiemposEstandarPage,
  AreaResumenPage,
  AreaProcesoPage,
  TrazabilidadOF,
} from '../pages/ProduccionPages.jsx';
import {
  DashboardTransporte,
  MonitorViajes,
  CrearOVPage,
  HojaDeRuta,
  MaestroRutas,
  LiquidacionTransporte,
} from '../pages/TransportePages.jsx';
import {
  DashboardRepuestos,
  PedidosVenta,
  CrearPedidoPage,
  DetallePedidoPage,
  CatalogoPrecios,
  DespachosRepuestos,
  PasaporteEquipos,
  GestionGarantias,
  CertificacionesActivo,
  CotizacionesVenta,
  OrdenesVenta,
  GuiasDespachos,
} from '../pages/RepuestosVentaPages.jsx';
import { CatalogoPage } from '../pages/pages2_v2.jsx';
import { PlaceholderPage } from '../components/PlaceholderPage.jsx';
import { AdministrativeAppLinkPage } from '../components/AdministrativeAppLinkPage.jsx';

export const businessLinesRouteIds = new Set([
  'dashboard-rental', 'flota', 'contratos-rental', 'checkout', 'liquidacion',
  'pasaporte-equipos', 'gestion-garantias', 'certificaciones-activo', 'monitoreo-equipos',
  'dashboard-transporte', 'transporte-viajes', 'transporte-crear-ov', 'transporte-ruta',
  'transporte-tarifas', 'transporte-liquidacion', 'transporte-tarifas-config',
  'dashboard-produccion', 'produccion-of', 'produccion-crear-of', 'produccion-detalle-of',
  'produccion-planificacion', 'produccion-control', 'produccion-mtm', 'produccion-oee',
  'produccion-nc', 'produccion-calidad', 'produccion-pasaporte', 'produccion-garantias',
  'produccion-ingenieria', 'produccion-tiempos', 'maestranza-of', 'of-planificacion',
  'maestranza-piso', 'of-tiempos-mtm', 'of-oee', 'of-no-conformidades',
  'area-ingenieria', 'area-maestranza', 'area-soldadura', 'area-fabricacion',
  'ing-planos', 'ing-bom', 'ing-tiempos', 'maestranza-bom',
  'mae-torneado', 'mae-fresado', 'mae-rectificado', 'mae-taladrado', 'mae-cromado', 'mae-recuperacion',
  'sol-mig-tig', 'sol-recargue', 'sol-corte', 'sol-estructural',
  'fab-piezas', 'fab-estructuras', 'fab-ensamble', 'fab-pruebas',
  'of-calidad', 'of-trazabilidad', 'of-informes',
  'dashboard-repuestos', 'pedidos-venta', 'repuestos-crear-pedido', 'repuestos-detalle-pedido',
  'catalogo-precios', 'despachos-repuestos', 'catalogo', 'repuestos-cotizaciones',
  'repuestos-ordenes', 'repuestos-despachos',
]);

export function renderBusinessLinesRoute(route, context) {
  const { onNavigate, currentOT, setCurrentOT, currentOF, setCurrentOF, currentOV, setCurrentOV, currentPV, setCurrentPV } = context;

  switch (route) {
    case 'dashboard-rental': return <DashboardRentalPage onNav={onNavigate} />;
    case 'flota': return <FlotaRentalPage onNav={onNavigate} />;
    case 'contratos-rental': return <ContratosRentalPage onNav={onNavigate} />;
    case 'checkout': return <DespachosRentalPage onNav={onNavigate} />;
    case 'liquidacion': return <LiquidacionRentalPage onNav={onNavigate} setCurrentOT={setCurrentOT} />;
    case 'pasaporte-equipos': return <PasaporteEquipos setCurrent={onNavigate} />;
    case 'gestion-garantias': return <GestionGarantias setCurrent={onNavigate} />;
    case 'certificaciones-activo': return <CertificacionesActivo />;
    case 'monitoreo-equipos': return <PlaceholderPage title="Monitoreo de Equipos" />;

    case 'dashboard-transporte': return <DashboardTransporte onNav={onNavigate} />;
    case 'transporte-viajes': return <MonitorViajes onNav={onNavigate} setCurrentOV={setCurrentOV} />;
    case 'transporte-crear-ov': return <CrearOVPage onNav={onNavigate} />;
    case 'transporte-ruta': return <HojaDeRuta onNav={onNavigate} ovId={currentOV} />;
    case 'transporte-tarifas': return <MaestroRutas onNav={onNavigate} />;
    case 'transporte-liquidacion': return <LiquidacionTransporte onNav={onNavigate} />;
    case 'transporte-tarifas-config': return <PlaceholderPage title="Tarifas Transporte" />;

    case 'dashboard-produccion': return <DashboardProduccion onNav={onNavigate} setCurrentOF={setCurrentOF} />;
    case 'produccion-of':
    case 'maestranza-of': return <BandejaOFs onNav={onNavigate} setCurrentOF={setCurrentOF} />;
    case 'produccion-crear-of': return <CrearOFPage onNav={onNavigate} />;
    case 'produccion-detalle-of': return <DetalleOFPage onNav={onNavigate} ofId={currentOF} />;
    case 'produccion-planificacion':
    case 'of-planificacion': return <PlanificacionOFPage onNav={onNavigate} />;
    case 'produccion-control':
    case 'maestranza-piso': return <ControlProduccion onNav={onNavigate} setCurrentOF={setCurrentOF} />;
    case 'produccion-mtm':
    case 'of-tiempos-mtm': return <TiemposMTMPage />;
    case 'produccion-oee':
    case 'of-oee': return <OEEPage />;
    case 'produccion-nc':
    case 'of-no-conformidades': return <NoConformidadesPage />;
    case 'produccion-calidad':
    case 'of-calidad': return <CalidadPage onNav={onNavigate} setCurrentOF={setCurrentOF} />;
    case 'produccion-pasaporte': return <PasaporteComponentePage />;
    case 'produccion-garantias': return <GarantiasPage />;
    case 'produccion-ingenieria': return <IngenieriaBOM onNav={onNavigate} />;
    case 'produccion-tiempos': return <TiemposEstandarPage />;
    case 'area-ingenieria': return <AreaResumenPage areaId="area-ingenieria" onNav={onNavigate} />;
    case 'area-maestranza': return <AreaResumenPage areaId="area-maestranza" onNav={onNavigate} />;
    case 'area-soldadura': return <AreaResumenPage areaId="area-soldadura" onNav={onNavigate} />;
    case 'area-fabricacion': return <AreaResumenPage areaId="area-fabricacion" onNav={onNavigate} />;
    case 'ing-planos': return <AreaProcesoPage procesoId="ing-planos" onNav={onNavigate} />;
    case 'ing-bom':
    case 'maestranza-bom': return <AreaProcesoPage procesoId="ing-bom" onNav={onNavigate} />;
    case 'ing-tiempos': return <AreaProcesoPage procesoId="ing-tiempos" onNav={onNavigate} />;
    case 'mae-torneado': return <AreaProcesoPage procesoId="mae-torneado" onNav={onNavigate} />;
    case 'mae-fresado': return <AreaProcesoPage procesoId="mae-fresado" onNav={onNavigate} />;
    case 'mae-rectificado': return <AreaProcesoPage procesoId="mae-rectificado" onNav={onNavigate} />;
    case 'mae-taladrado': return <AreaProcesoPage procesoId="mae-taladrado" onNav={onNavigate} />;
    case 'mae-cromado': return <AreaProcesoPage procesoId="mae-cromado" onNav={onNavigate} />;
    case 'mae-recuperacion': return <AreaProcesoPage procesoId="mae-recuperacion" onNav={onNavigate} />;
    case 'sol-mig-tig': return <AreaProcesoPage procesoId="sol-mig-tig" onNav={onNavigate} />;
    case 'sol-recargue': return <AreaProcesoPage procesoId="sol-recargue" onNav={onNavigate} />;
    case 'sol-corte': return <AreaProcesoPage procesoId="sol-corte" onNav={onNavigate} />;
    case 'sol-estructural': return <AreaProcesoPage procesoId="sol-estructural" onNav={onNavigate} />;
    case 'fab-piezas': return <AreaProcesoPage procesoId="fab-piezas" onNav={onNavigate} />;
    case 'fab-estructuras': return <AreaProcesoPage procesoId="fab-estructuras" onNav={onNavigate} />;
    case 'fab-ensamble': return <AreaProcesoPage procesoId="fab-ensamble" onNav={onNavigate} />;
    case 'fab-pruebas': return <AreaProcesoPage procesoId="fab-pruebas" onNav={onNavigate} />;
    case 'of-trazabilidad': return <TrazabilidadOF />;
    case 'of-informes': return <PlaceholderPage title="Informes y Certificados" />;

    case 'dashboard-repuestos': return <DashboardRepuestos onNav={onNavigate} setCurrentPV={setCurrentPV} />;
    case 'pedidos-venta': return <PedidosVenta onNav={onNavigate} setCurrentPV={setCurrentPV} />;
    case 'repuestos-crear-pedido': return <CrearPedidoPage onNav={onNavigate} />;
    case 'repuestos-detalle-pedido': return <DetallePedidoPage onNav={onNavigate} pvId={currentPV} />;
    case 'catalogo-precios': return <CatalogoPrecios />;
    case 'despachos-repuestos': return <DespachosRepuestos onNav={onNavigate} setCurrentPV={setCurrentPV} />;
    case 'catalogo': return <CatalogoPage onNav={onNavigate} />;
    case 'repuestos-cotizaciones': return <CotizacionesVenta setCurrent={onNavigate} />;
    case 'repuestos-ordenes': return <OrdenesVenta setCurrent={onNavigate} />;
    case 'repuestos-despachos': return <AdministrativeAppLinkPage title="Guías y Despachos" adminRoute="remision" />;
    default: return null;
  }
}
