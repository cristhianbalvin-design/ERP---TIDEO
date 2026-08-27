import { useEffect, useState } from 'react';
import { isSupabaseMode } from '../../../src/lib/dataMode.js';
import { DashboardPage } from './pages/pages1.jsx';
import MisOTsPage from './pages/MisOTsPage.jsx';
import { MapaCampo } from './pages/TransportePages.jsx';
import { MockBackendBanner } from './components/MockBackendBanner.jsx';
import { businessLinesRouteIds, renderBusinessLinesRoute } from './routes/businessLinesRoutes.jsx';
import { workshopOperationsRouteIds, renderWorkshopOperationsRoute } from './routes/workshopOperationsRoutes.jsx';
import { supplyAdministrationRouteIds, renderSupplyAdministrationRoute } from './routes/supplyAdministrationRoutes.jsx';

export const availableZahoryRoutes = new Set([
  'dashboard',
  'mis-ots-hoy',
  'mis-ots',
  'mapa-campo',
  ...businessLinesRouteIds,
  ...workshopOperationsRouteIds,
  ...supplyAdministrationRouteIds,
]);

export function ZahoryRoutes({ route, onNavigate }) {
  const [currentOT, setCurrentOT] = useState('OT-2026-050');
  const [currentOF, setCurrentOF] = useState('OF-2026-018');
  const [currentOV, setCurrentOV] = useState('OV-2026-001');
  const [currentPV, setCurrentPV] = useState('PV-2026-001');

  useEffect(() => {
    localStorage.setItem('zahory_sac_role', 'gerente');
    localStorage.setItem('zahory_sac_page', route);
  }, [route]);

  let content;
  switch (route) {
    case 'dashboard':
      content = <DashboardPage onNav={onNavigate} setCurrentOT={setCurrentOT} />;
      break;
    case 'mis-ots-hoy':
    case 'mis-ots':
      content = <MisOTsPage setCurrent={onNavigate} />;
      break;
    case 'mapa-campo':
      content = <MapaCampo setCurrent={onNavigate} />;
      break;
    default:
      content = renderBusinessLinesRoute(route, {
        onNavigate,
        currentOT,
        setCurrentOT,
        currentOF,
        setCurrentOF,
        currentOV,
        setCurrentOV,
        currentPV,
        setCurrentPV,
      });
      if (!content) {
        content = renderWorkshopOperationsRoute(route, {
          onNavigate,
          currentOT,
          setCurrentOT,
        });
      }
      if (!content) {
        content = renderSupplyAdministrationRoute(route, {
          onNavigate,
          setCurrentOT,
        });
      }
  }

  return (
    <div className="zahory-mock-root" data-zahory-route={route} data-current-ot={currentOT}>
      {!isSupabaseMode() && <MockBackendBanner />}
      {content}
    </div>
  );
}
