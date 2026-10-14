import { useEffect, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { cargarPlanner, mensajeErrorPlanner } from '../../../services/plannerService.js';
import { Wizard } from './Wizard.jsx';
import { SimulacionView } from './SimulacionView.jsx';
import { usePlannerActions } from './usePlannerActions.js';
import { PlannerHeader, PlannerVistas, CargandoPlanner, SinBahias } from './PlannerShell.jsx';

const AVISO_VISTA_CONSOLIDADA = 'Elige una sociedad concreta (no la vista consolidada) para configurar '
  + 'o planificar el taller.';

function obtenerRecursos(datos) {
  return {
    personas: Math.max(1, datos?.personas?.length || 0),
    maquinas: Math.max(1, datos?.maquinas?.filter(item => item.estado === 'disponible').length || 0),
    horasMaquinaDia: 8,
  };
}

export function PlannerPage() {
  const sesion = useSesionOperativa();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [vista, setVista] = useState('panel');
  const [seleccion, setSeleccion] = useState({});
  const [busqueda, setBusqueda] = useState('');
  const [wizard, setWizard] = useState(null);
  const [simulacion, setSimulacion] = useState(null);
  const [undo, setUndo] = useState(null);

  async function cargar(limpiarError = true) {
    if (sesion.cargando) return;
    if (!sesion.empresaId) {
      setCargando(false);
      setError(sesion.error || 'No hay una empresa activa en la sesión operativa.');
      return;
    }
    setCargando(true);
    if (limpiarError) setError('');
    try {
      const resultado = await cargarPlanner({
        empresaId: sesion.empresaId,
        sociedadId: sesion.sociedadId,
        sociedadesIdsAlcance: sesion.vistaConsolidada
          ? sesion.sociedadesIdsAlcance
          : null,
      });
      setDatos(resultado);
    } catch (cargaError) {
      setError(mensajeErrorPlanner(cargaError));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, [sesion.empresaId, sesion.sociedadId, sesion.cargando]);

  const ots = datos?.ots || [];
  const recursos = obtenerRecursos(datos);
  const acciones = usePlannerActions({
    sesion,
    datos,
    ots,
    recursos,
    undo,
    seleccion,
    simulacion,
    cargar,
    setGuardando,
    setError,
    setAviso,
    setUndo,
    setWizard,
    setVista,
    setSeleccion,
    setSimulacion,
  });

  return (
    <main className="dx-ui dx-planner" aria-busy={cargando}>
      <PlannerHeader
        vista={vista}
        permiteEscritura={sesion.permiteEscritura}
        onChangeVista={setVista}
        onSimulate={acciones.simular}
        onPlanificar={acciones.abrirWizard}
      />
      {error && (
        <div className="dx-planner-error" role="alert">
          {error}<button onClick={() => cargar()}>Reintentar</button>
        </div>
      )}
      {!sesion.permiteEscritura
        ? <p className="dx-planner-notice" role="status">{AVISO_VISTA_CONSOLIDADA}</p>
        : aviso && <p className="dx-planner-notice" role="status">{aviso}</p>}
      {simulacion && (
        <SimulacionView
          simulacion={simulacion}
          guardando={guardando || !sesion.permiteEscritura}
          onClose={() => setSimulacion(null)}
          onApply={acciones.aplicarSimulacion}
        />
      )}
      {cargando && <CargandoPlanner />}
      {!cargando && datos && (
        <PlannerVistas
          vista={vista}
          datos={datos}
          ots={ots}
          recursos={recursos}
          seleccion={seleccion}
          undo={undo}
          guardando={guardando}
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          onSelect={setSeleccion}
          onPlanificar={acciones.abrirWizard}
          onMoveDate={acciones.moverFecha}
          onMoveOT={acciones.moverOT}
          onUndo={acciones.deshacer}
          onSaveConfig={acciones.guardarConfig}
          permiteEscritura={sesion.permiteEscritura}
        />
      )}
      {!cargando && datos && !datos.bahias.length && vista === 'panel' && (
        <SinBahias onConfigure={() => setVista('config')} />
      )}
      {wizard && datos && (
        <Wizard
          datos={datos}
          recursos={recursos}
          initialOT={wizard.ot}
          busy={guardando || !sesion.permiteEscritura}
          onClose={() => setWizard(null)}
          onInherit={acciones.guardarWizardHerencia}
          onSave={acciones.guardarWizard}
        />
      )}
    </main>
  );
}
