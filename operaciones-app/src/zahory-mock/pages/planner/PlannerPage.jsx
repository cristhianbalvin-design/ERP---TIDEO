import { useEffect, useMemo, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { cargarPlanner, mensajeErrorPlanner } from '../../../services/plannerService.js';
import { Wizard } from './Wizard.jsx';
import { SimulacionView } from './SimulacionView.jsx';
import { usePlannerActions } from './usePlannerActions.js';
import { PlannerHeader, PlannerVistas, CargandoPlanner, SinBahias } from './PlannerShell.jsx';
import { PlannerStrip } from './PlannerStrip.jsx';
import { PlannerSide } from './PlannerSide.jsx';
import { Configurator } from './Configurator.jsx';
import { GemeloView } from './gemelo3d/GemeloView.jsx';
import { alertas as calcularAlertas, construirInfos, hoyISO, listarCargos, metricas } from './plannerModelo.js';

const AVISO_VISTA_CONSOLIDADA = 'Elige una sociedad concreta (no la vista consolidada) para configurar '
  + 'o planificar el taller.';

export function resolverSeleccionTablero(ot, ots = []) {
  if (!ot?.id) return null;
  return ots.find(item => item.id === ot.id) || null;
}

export function construirModelo(datos, hoy = hoyISO()) {
  const { dias, infos } = construirInfos(datos, hoy);
  const met = metricas(datos, infos, hoy);
  return { hoy, dias, infos, met, alertas: calcularAlertas(datos, infos, met, dias), cargos: listarCargos(datos.personas || []) };
}

function seleccionPorDefecto(seleccion, modelo) {
  if (seleccion?.ot && modelo.infos.has(seleccion.ot.id)) return { ...seleccion, ot: modelo.infos.get(seleccion.ot.id).ot };
  const lista = [...modelo.infos.values()];
  const elegida = lista.find(info => info.st === 'bad') || lista.find(info => info.st === 'warn')
    || lista.find(info => info.planificada && info.st !== 'done') || lista.find(info => info.st !== 'done') || lista[0];
  return elegida ? { ot: elegida.ot } : {};
}

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
    aviso,
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

  const modelo = useMemo(() => (datos ? construirModelo(datos) : null), [datos]);
  const seleccionActual = modelo ? seleccionPorDefecto(seleccion, modelo) : {};
  const enConfig = vista === 'config' && !wizard;
  const ocupado = Boolean(wizard) || enConfig;
  const subtitulo = wizard
    ? 'Planificar una OT: elige cuál'
    : enConfig
      ? 'Configurar taller: bahías, puestos y máquinas'
      : modelo ? `${modelo.met.otTotal} órdenes de trabajo en ${modelo.met.osTotal} órdenes de servicio` : 'Cargando el plan del taller…';

  return (
    <main className="dx-ui dx-planner" aria-busy={cargando}>
      <div className="dx-pl-wrap">
        <PlannerHeader
          vista={vista}
          subtitulo={subtitulo}
          permiteEscritura={sesion.permiteEscritura}
          ocupado={ocupado}
          undoDisponible={Boolean(undo)}
          simulando={Boolean(simulacion)}
          onChangeVista={acciones.cambiarVista}
          onUndo={acciones.deshacer}
          onConfigurar={() => acciones.cambiarVista('config')}
          onSimulate={acciones.simular}
          onPlanificar={acciones.abrirWizard}
        />
        {error && (
          <div className="dx-planner-error" role="alert">
            {error}<button type="button" onClick={() => cargar()}>Reintentar</button>
          </div>
        )}
        {sesion.vistaConsolidada && sesion.empresaId && !sesion.cargando
          ? <p className="dx-planner-notice is-warning" role="status">{AVISO_VISTA_CONSOLIDADA}</p>
          : aviso && <p className="dx-planner-notice" role="status">{aviso}</p>}
        {modelo && !ocupado && !cargando && <PlannerStrip met={modelo.met} />}
        {simulacion && !ocupado && (
          <SimulacionView
            simulacion={simulacion}
            ots={ots}
            infos={modelo?.infos}
            guardando={guardando || !sesion.permiteEscritura}
            onClose={() => setSimulacion(null)}
            onApply={acciones.aplicarSimulacion}
            onElegir={acciones.elegirUrgente}
          />
        )}
        {cargando && <CargandoPlanner />}
        {enConfig && !cargando && datos && (
          <Configurator
            datos={datos}
            busy={guardando}
            permiteEscritura={sesion.permiteEscritura}
            modelo={modelo}
            onGuardar={acciones.guardarTaller}
            onCancel={() => acciones.cambiarVista('panel')}
            vistaPrevia={borrador => <GemeloView datos={borrador} modo="config" cargos={modelo?.cargos || []} />}
          />
        )}
        {!wizard && !enConfig && !cargando && datos && modelo && (
          <div className="dx-pl-main">
            <div className="dx-pl-left">
              {!datos.bahias.length && vista === 'panel' && (
                <SinBahias onConfigure={() => acciones.cambiarVista('config')} />
              )}
              <PlannerVistas
                vista={vista}
                datos={datos}
                modelo={modelo}
                seleccion={seleccionActual}
                busqueda={busqueda}
                onBusqueda={setBusqueda}
                onSelect={setSeleccion}
                onPlanificar={acciones.abrirWizard}
                permiteEscritura={sesion.permiteEscritura}
                onMoverBloque={acciones.moverBloque}
                onMoverUnidad={acciones.cambiarPuesto}
                onConfigurar={() => acciones.cambiarVista('config')}
                onVerEnTablero={ot => {
                  const otDelPlanner = resolverSeleccionTablero(ot, ots);
                  setSeleccion(otDelPlanner ? { ot: otDelPlanner } : {});
                  setVista('tablero');
                }}
              />
            </div>
            <PlannerSide
              datos={datos}
              infos={modelo.infos}
              alertas={modelo.alertas}
              cargos={modelo.cargos}
              dias={modelo.dias}
              hoy={modelo.hoy}
              seleccion={seleccionActual}
              permiteEscritura={sesion.permiteEscritura}
              guardando={guardando}
              onSelect={setSeleccion}
              onPlanificar={acciones.abrirWizard}
              onConfigurar={() => acciones.cambiarVista('config')}
              onResponsable={acciones.cambiarResponsable}
              onMaquina={acciones.cambiarMaquina}
              onNoAntes={acciones.noEmpezarAntes}
              onPuesto={acciones.cambiarPuesto}
            />
          </div>
        )}
        {wizard && datos && (
          <Wizard
            datos={datos}
            recursos={recursos}
            initialOT={wizard.ot}
            busy={guardando || !sesion.permiteEscritura}
            onClose={() => {
              setWizard(null);
              setVista('panel');
            }}
            onInherit={acciones.guardarWizardHerencia}
            onSave={acciones.guardarWizard}
          />
        )}
      </div>
    </main>
  );
}
