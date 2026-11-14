import { CrearOTPage } from '../pages/CrearOTPage.jsx';
import { OTDetallePage } from '../pages/pages1.jsx';
import {
  OTsListadoPage,
  GestionPartesTallerPage,
} from '../pages/pages2_v2.jsx';
import { CierreConformidadPage } from '../pages/CierreConformidadPage.jsx';
import { RecepcionActivosClientePage } from '../pages/RecepcionActivosClientePage.jsx';
import { DiagnosticoTecnicoPage } from '../pages/DiagnosticoTecnicoPage.jsx';
import { ParteTallerPage } from '../pages/pages3.jsx';
import { ReportesMinaPage } from '../pages/ReportesMinaPage.jsx';
import { PlannerPage } from '../pages/planner/PlannerPage.jsx';
import { BacklogOperativoPage } from '../pages/confiabilidad/BacklogOperativoPage.jsx';
import { AnalisisSosPage } from '../pages/confiabilidad/AnalisisSosPage.jsx';
import { KpisConfiabilidadPage } from '../pages/confiabilidad/KpisConfiabilidadPage.jsx';
import { ProgramacionPmPage } from '../pages/confiabilidad/ProgramacionPmPage.jsx';
import { DisponibilidadMecanicaPage } from '../pages/confiabilidad/DisponibilidadMecanicaPage.jsx';
import { PlaceholderPage } from '../components/PlaceholderPage.jsx';
import { AdministrativeAppLinkPage } from '../components/AdministrativeAppLinkPage.jsx';
import {
  HSEDashboard,
  PermisosTrabajoHSE,
  RegistroIncidentes,
  EPPCertificaciones,
  AnalisisRiesgoATS,
  ProtocoloLOTO,
} from '../pages/HSEPage.jsx';

export const workshopOperationsRouteIds = new Set([
  'ots', 'crear-ot', 'ot-detalle', 'recepcion-activos', 'diagnostico-tecnico', 'taller', 'partes-taller', 'crear-parte-taller',
  'partes-mina', 'mina', 'nuevo-reporte', 'mis-reportes', 'cierre-conformidad', 'scheduler-despacho',
  'hse-dashboard', 'permisos-trabajo', 'registro-incidentes', 'epp-certificaciones',
  'analisis-riesgo-ats', 'protocolo-loto',
  'backlog', 'sos-telemetria', 'analisis-sos', 'confiabilidad',
  'programacion-pm', 'disponibilidad-mecanica', 'indicadores-confiabilidad',
]);

export function renderWorkshopOperationsRoute(route, context) {
  const { onNavigate, currentOT, setCurrentOT, routeParams } = context;

  switch (route) {
    case 'ots': return <OTsListadoPage onNav={onNavigate} setCurrentOT={setCurrentOT} />;
    case 'crear-ot': return <CrearOTPage onNav={onNavigate} routeParams={routeParams} />;
    case 'recepcion-activos': return <RecepcionActivosClientePage />;
    case 'diagnostico-tecnico': return <DiagnosticoTecnicoPage routeParams={routeParams} />;
    case 'ot-detalle': return <OTDetallePage onNav={onNavigate} code={currentOT} />;
    case 'taller':
    case 'crear-parte-taller': return <ParteTallerPage onNav={onNavigate} routeParams={routeParams} />;
    case 'partes-taller': return <GestionPartesTallerPage onNav={onNavigate} />;
    case 'partes-mina':
    case 'mina':
    case 'mis-reportes': return <ReportesMinaPage onNav={onNavigate} />;
    case 'nuevo-reporte': return <ReportesMinaPage onNav={onNavigate} vistaInicial="nuevo" />;
    case 'cierre-conformidad': return <CierreConformidadPage />;
    case 'scheduler-despacho': return <PlannerPage />;

    case 'hse-dashboard': return <HSEDashboard setCurrent={onNavigate} />;
    case 'permisos-trabajo': return <PermisosTrabajoHSE />;
    case 'registro-incidentes': return <RegistroIncidentes />;
    case 'epp-certificaciones': return <EPPCertificaciones />;
    case 'analisis-riesgo-ats': return <AnalisisRiesgoATS />;
    case 'protocolo-loto': return <ProtocoloLOTO />;

    case 'backlog': return <BacklogOperativoPage onNav={onNavigate} />;
    case 'sos-telemetria':
    case 'analisis-sos': return <AnalisisSosPage onNav={onNavigate} />;
    case 'confiabilidad': return <KpisConfiabilidadPage onNav={onNavigate} />;
    case 'programacion-pm': return <ProgramacionPmPage onNav={onNavigate} />;
    case 'disponibilidad-mecanica': return <DisponibilidadMecanicaPage onNav={onNavigate} />;
    case 'indicadores-confiabilidad': return <PlaceholderPage title="Indicadores MTBF/MTTR" />;
    default: return null;
  }
}
