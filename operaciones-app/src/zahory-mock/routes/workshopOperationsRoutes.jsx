import { BacklogPage } from '../pages/BacklogPage.jsx';
import { CrearOTPage } from '../pages/CrearOTPage.jsx';
import { KPIsConfiabilidad } from '../pages/ConfiabilidadPage.jsx';
import { OTDetallePage } from '../pages/pages1.jsx';
import {
  OTsListadoPage,
  GestionPartesTallerPage,
  HistorialMinaPage,
  CierreConformidad,
  ProgramacionPM,
  DisponibilidadMecanica,
} from '../pages/pages2_v2.jsx';
import { ReporteMinaPage, ParteTallerPage } from '../pages/pages3.jsx';
import { SchedulerDespacho } from '../pages/TransportePages.jsx';
import { AnalisisSOS } from '../pages/ProduccionPages.jsx';
import { PlaceholderPage } from '../components/PlaceholderPage.jsx';
import {
  HSEDashboard,
  PermisosTrabajoHSE,
  RegistroIncidentes,
  EPPCertificaciones,
  AnalisisRiesgoATS,
  ProtocoloLOTO,
} from '../pages/HSEPage.jsx';

export const workshopOperationsRouteIds = new Set([
  'ots', 'crear-ot', 'ot-detalle', 'taller', 'partes-taller', 'crear-parte-taller',
  'partes-mina', 'mina', 'nuevo-reporte', 'mis-reportes', 'cierre-conformidad', 'scheduler-despacho',
  'hse-dashboard', 'permisos-trabajo', 'registro-incidentes', 'epp-certificaciones',
  'analisis-riesgo-ats', 'protocolo-loto',
  'backlog', 'sos-telemetria', 'analisis-sos', 'confiabilidad',
  'programacion-pm', 'disponibilidad-mecanica', 'indicadores-confiabilidad',
]);

export function renderWorkshopOperationsRoute(route, context) {
  const { onNavigate, currentOT, setCurrentOT } = context;

  switch (route) {
    case 'ots': return <OTsListadoPage onNav={onNavigate} setCurrentOT={setCurrentOT} />;
    case 'crear-ot': return <CrearOTPage onNav={onNavigate} />;
    case 'ot-detalle': return <OTDetallePage onNav={onNavigate} code={currentOT} />;
    case 'taller':
    case 'crear-parte-taller': return <ParteTallerPage onNav={onNavigate} />;
    case 'partes-taller': return <GestionPartesTallerPage onNav={onNavigate} />;
    case 'partes-mina':
    case 'mina':
    case 'mis-reportes': return <HistorialMinaPage onNav={onNavigate} />;
    case 'nuevo-reporte': return <ReporteMinaPage onNav={onNavigate} />;
    case 'cierre-conformidad': return <CierreConformidad />;
    case 'scheduler-despacho': return <SchedulerDespacho setCurrent={onNavigate} />;

    case 'hse-dashboard': return <HSEDashboard setCurrent={onNavigate} />;
    case 'permisos-trabajo': return <PermisosTrabajoHSE />;
    case 'registro-incidentes': return <RegistroIncidentes />;
    case 'epp-certificaciones': return <EPPCertificaciones />;
    case 'analisis-riesgo-ats': return <AnalisisRiesgoATS />;
    case 'protocolo-loto': return <ProtocoloLOTO />;

    case 'backlog': return <BacklogPage onNav={onNavigate} />;
    case 'sos-telemetria':
    case 'analisis-sos': return <AnalisisSOS setCurrent={onNavigate} />;
    case 'confiabilidad': return <KPIsConfiabilidad />;
    case 'programacion-pm': return <ProgramacionPM setCurrent={onNavigate} />;
    case 'disponibilidad-mecanica': return <DisponibilidadMecanica setCurrent={onNavigate} />;
    case 'indicadores-confiabilidad': return <PlaceholderPage title="Indicadores MTBF/MTTR" />;
    default: return null;
  }
}
