import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import dagre from '@dagrejs/dagre';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const DIMENSIONS = {
  unidad: { width: 300, height: 118 },
  colocacion: { width: 264, height: 116 },
  posicion: { width: 190, height: 62 },
};
const EMPTY_POSITION = { x: 40, y: 40 };
const CanvasNodeContext = createContext({ modoConexion: 'todos' });
const CANVAS_INTERACTION_STYLES = `
  .ov2-canvas .react-flow__node { cursor: grab; }
  .ov2-canvas .ov2-drag-handle:active,
  .ov2-canvas .ov2-drag-handle:active * { cursor: grabbing !important; }
  .ov2-canvas .react-flow__node.dragging,
  .ov2-canvas .react-flow__node.dragging * { cursor: grabbing !important; }
  .ov2-canvas .ov2-connect-handle { width: 12px; height: 12px; border: 2px solid var(--card); }
  .ov2-canvas .ov2-handle-uo { color: #14b8a6; }
  .ov2-canvas .ov2-handle-uo-padre,
  .ov2-canvas .ov2-handle-uo-hijo { color: #0F6E56; }
  .ov2-canvas .ov2-handle-jerarquia { color: #2563eb; }
  .ov2-canvas .ov2-handle-matricial { color: #7c3aed; }
  .ov2-canvas .ov2-connect-handle.ov2-handle-disabled { opacity: .22; pointer-events: none; filter: grayscale(1); }
  .ov2-canvas .ov2-connect-handle:not(.ov2-handle-disabled):hover,
  .ov2-canvas .react-flow__handle.connectingfrom,
  .ov2-canvas .react-flow__handle.connectingto,
  .ov2-canvas .react-flow__handle.valid {
    transform: scale(1.45);
    box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 24%, transparent), 0 0 12px currentColor;
    transition: transform .14s ease, box-shadow .14s ease;
  }
  .ov2-canvas .react-flow__connection-path { stroke-dasharray: 9 5; animation: ov2-connection-flow .7s linear infinite; }
  @keyframes ov2-connection-flow { to { stroke-dashoffset: -14; } }
`;

const nodeShell = (color, background) => ({
  background,
  border: `1px solid ${color}`,
  borderRadius: 10,
  boxShadow: '0 2px 7px rgba(15, 23, 42, 0.10)',
  color: 'var(--fg)',
  fontFamily: 'inherit',
  minWidth: 0,
});

const NodeHeader = ({ color, children }) => (
  <div title="Arrastrar tarjeta" style={{ color, fontSize: 11, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 5 }}>
    {children}
  </div>
);

const useNodeDragCursor = dragging => {
  const [pointerDown, setPointerDown] = useState(false);

  useEffect(() => {
    if (!pointerDown) return undefined;
    const clearPointerDown = () => setPointerDown(false);
    window.addEventListener('pointerup', clearPointerDown, { once: true });
    window.addEventListener('pointercancel', clearPointerDown, { once: true });
    return () => {
      window.removeEventListener('pointerup', clearPointerDown);
      window.removeEventListener('pointercancel', clearPointerDown);
    };
  }, [pointerDown]);

  return {
    cursor: dragging || pointerDown ? 'grabbing' : 'grab',
    onPointerDown: event => {
      if (event.target.closest?.('.nodrag, .react-flow__handle')) return;
      setPointerDown(true);
    },
  };
};

const handleEnabled = (modoConexion, tipoConexion) => (
  modoConexion === 'todos' || (Array.isArray(tipoConexion) ? tipoConexion : [tipoConexion]).includes(modoConexion)
);

const handleClassName = (modoConexion, tipoConexion, extra = '') => (
  `ov2-connect-handle ${extra} ${handleEnabled(modoConexion, tipoConexion) ? '' : 'ov2-handle-disabled'}`.trim()
);

const etiquetaColocacion = colocacion => colocacion?.cargo?.nombre || colocacion?.cargo_id || 'Cargo-colocación';
const etiquetaPosicion = posicion => posicion?.etiqueta || posicion?.ocupante?.nombre || posicion?.id || 'Posición';

const descripcionArista = edge => {
  if (edge.data?.kind === 'uo') return `Asignación de UO: ${etiquetaColocacion(edge.data.colocacion)} pertenece a ${edge.data.unidad?.nombre || 'la UO seleccionada'}.`;
  if (edge.data?.kind === 'uo_padre') return `${edge.data.padre?.nombre || 'UO padre'} es padre de ${edge.data.hija?.nombre || 'UO hija'}.`;
  if (edge.data?.kind === 'jerarquia') return `Jerarquía: ${etiquetaColocacion(edge.data.padre)} es padre de ${etiquetaColocacion(edge.data.hija)}.`;
  if (edge.data?.kind === 'matricial') return `Relación matricial: ${etiquetaPosicion(edge.data.subordinada)} ↔ ${etiquetaPosicion(edge.data.jefe)}.`;
  return '';
};

export const UnidadOrganizacionalNode = ({ data, dragging }) => {
  const { modoConexion, onCrearColocacion, onEliminarUnidad } = useContext(CanvasNodeContext);
  const dragCursor = useNodeDragCursor(dragging);
  const asignarUoHabilitado = handleEnabled(modoConexion, 'uo');
  const jerarquiaUoSourceHabilitada = handleEnabled(modoConexion, 'uo_padre');
  const jerarquiaUoHabilitada = handleEnabled(modoConexion, 'uo_padre');
  return (
  <div className="ov2-drag-handle" data-testid={`ov2-node-uo-${data.record.id}`} onPointerDown={dragCursor.onPointerDown} style={{ ...nodeShell('#0f766e', 'color-mix(in srgb, #14b8a6 9%, var(--card))'), width: DIMENSIONS.unidad.width, padding: '13px 15px', borderWidth: 2, cursor: dragCursor.cursor }}>
    <Handle id="uo-hijo-target" type="target" position={Position.Top} isConnectable={jerarquiaUoHabilitada} className={handleClassName(modoConexion, 'uo_padre', 'ov2-handle-uo-hijo')} style={{ background: '#0F6E56' }} />
    <Handle id="uo-padre-source" type="source" position={Position.Bottom} isConnectable={jerarquiaUoSourceHabilitada} className={handleClassName(modoConexion, 'uo_padre', 'ov2-handle-uo-padre')} style={{ background: '#0F6E56', left: '34%' }} />
    <Handle id="uo-source" type="source" position={Position.Right} isConnectable={asignarUoHabilitado} className={handleClassName(modoConexion, 'uo', 'ov2-handle-uo')} style={{ background: '#14b8a6', top: '66%' }} />
    <NodeHeader color="#0f766e">UO {data.codigo && `· ${data.codigo}`}</NodeHeader>
    <div style={{ fontWeight: 850, fontSize: 17, lineHeight: 1.18 }}>{data.nombre}</div>
    <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
      <button
        type="button"
        className="nodrag btn btn-secondary"
        data-testid={`ov2-create-colocacion-${data.record.id}`}
        style={{ padding: '3px 7px', fontSize: 10 }}
        onClick={event => { event.stopPropagation(); onCrearColocacion?.(data.record); }}
      >
        + Cargo
      </button>
      <button
        type="button"
        className="nodrag btn btn-danger"
        data-testid={`ov2-delete-uo-${data.record.id}`}
        style={{ padding: '3px 7px', fontSize: 10 }}
        onClick={event => { event.stopPropagation(); onEliminarUnidad?.(data.record); }}
      >
        Eliminar UO
      </button>
    </div>
  </div>
  );
};

export const CargoColocacionNode = ({ data, dragging }) => {
  const { modoConexion, onEditarColocacion } = useContext(CanvasNodeContext);
  const dragCursor = useNodeDragCursor(dragging);
  const asignarUoHabilitado = handleEnabled(modoConexion, 'uo');
  const jerarquiaHabilitada = handleEnabled(modoConexion, 'jerarquia');
  return (
  <div
    className="ov2-drag-handle"
    data-testid={`ov2-node-ccol-${data.record.id}`}
    role="button"
    tabIndex={0}
    title="Haz clic para editar. Arrastra desde este cargo padre hacia su cargo hijo para definir jerarquía."
    onClick={() => onEditarColocacion?.(data.record)}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') onEditarColocacion?.(data.record); }}
    onPointerDown={dragCursor.onPointerDown}
    style={{ ...nodeShell('#2563eb', 'var(--card)'), width: DIMENSIONS.colocacion.width, padding: '10px 12px', borderWidth: 2, cursor: dragCursor.cursor }}
  >
    <Handle id="uo-target" type="target" position={Position.Left} isConnectable={asignarUoHabilitado} className={handleClassName(modoConexion, 'uo', 'ov2-handle-uo')} style={{ background: '#14b8a6', top: '28%' }} />
    <Handle id="jerarquia-target" type="target" position={Position.Top} isConnectable={jerarquiaHabilitada} className={handleClassName(modoConexion, 'jerarquia', 'ov2-handle-jerarquia')} style={{ background: '#2563eb' }} />
    <NodeHeader color="#2563eb">Cargo-colocación</NodeHeader>
    <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.2 }}>{data.cargoNombre}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 7 }}>
      <span style={{ background: 'rgba(37,99,235,.10)', color: '#1d4ed8', borderRadius: 99, fontSize: 10, fontWeight: 750, padding: '2px 6px' }}>{data.nivelNombre}</span>
      <span style={{ background: 'var(--bg-subtle)', color: 'var(--fg-muted)', borderRadius: 99, fontSize: 10, padding: '2px 6px' }}>{data.rolNombre}</span>
      <span style={{ background: '#1d4ed8', color: '#fff', borderRadius: 99, fontSize: 10, fontWeight: 800, padding: '2px 6px' }}>{data.ocupadas}/{data.cantidadPosiciones}</span>
    </div>
    <Handle id="jerarquia-source" type="source" position={Position.Bottom} isConnectable={jerarquiaHabilitada} className={handleClassName(modoConexion, 'jerarquia', 'ov2-handle-jerarquia')} style={{ background: '#2563eb' }} />
  </div>
  );
};

export const PosicionNode = ({ data, dragging }) => {
  const { modoConexion } = useContext(CanvasNodeContext);
  const dragCursor = useNodeDragCursor(dragging);
  const matricialHabilitada = handleEnabled(modoConexion, 'matricial');
  return (
  <div className="ov2-drag-handle" data-testid={`ov2-node-pos-${data.record.id}`} onPointerDown={dragCursor.onPointerDown} style={{ ...nodeShell('#94a3b8', 'var(--bg-subtle)'), width: DIMENSIONS.posicion.width, padding: '7px 9px', boxShadow: 'none', cursor: dragCursor.cursor }}>
    <Handle id="matricial-target" type="target" position={Position.Left} isConnectable={matricialHabilitada} className={handleClassName(modoConexion, 'matricial', 'ov2-handle-matricial')} style={{ background: '#7c3aed' }} />
    <div style={{ fontWeight: 750, fontSize: 12 }}>{data.ocupanteNombre || 'Vacante'}</div>
    <div style={{ color: 'var(--fg-muted)', fontSize: 10, marginTop: 2 }}>{data.estadoLabel}</div>
    <Handle id="matricial-source" type="source" position={Position.Right} isConnectable={matricialHabilitada} className={handleClassName(modoConexion, 'matricial', 'ov2-handle-matricial')} style={{ background: '#7c3aed' }} />
  </div>
  );
};

const nodeTypes = { unidad: UnidadOrganizacionalNode, colocacion: CargoColocacionNode, posicion: PosicionNode };
const sortByName = (a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
const nodeKey = (tipoNodo, nodoId) => `${tipoNodo}:${nodoId}`;
const toFlowNodeId = (tipoNodo, nodoId) => `${tipoNodo === 'cargo_colocacion' ? 'ccol' : tipoNodo}:${nodoId}`;

const tipoConexion = (connection, nodes) => {
  const source = nodes.find(node => node.id === connection.source);
  const target = nodes.find(node => node.id === connection.target);
  if (!source || !target || source.id === target.id) return null;
  if (source.type === 'unidad' && connection.sourceHandle === 'uo-source' && target.type === 'colocacion' && connection.targetHandle === 'uo-target') return 'uo';
  if (source.type === 'unidad' && connection.sourceHandle === 'uo-padre-source' && target.type === 'unidad' && connection.targetHandle === 'uo-hijo-target') return 'uo_padre';
  if (source.type === 'colocacion' && connection.sourceHandle === 'jerarquia-source' && target.type === 'colocacion' && connection.targetHandle === 'jerarquia-target') return 'jerarquia';
  if (source.type === 'posicion' && connection.sourceHandle === 'matricial-source' && target.type === 'posicion' && connection.targetHandle === 'matricial-target') return 'matricial';
  return null;
};

const hintConexion = ({ handleId, node }) => {
  if (node?.type === 'unidad' && handleId === 'uo-source') return 'Suelta sobre una cargo-colocación para asignarla a esta UO.';
  if (node?.type === 'unidad' && handleId === 'uo-padre-source') return 'Suelta sobre una UO hija para definir la jerarquía.';
  if (node?.type === 'colocacion' && handleId === 'jerarquia-source') return 'Suelta sobre la cargo-colocación hija para definir jerarquía.';
  if (node?.type === 'posicion' && handleId === 'matricial-source') return 'Suelta sobre la posición jefe para crear la relación matricial.';
  return 'Selecciona un punto de conexión válido.';
};

const errorCicloUO = (connection, nodes) => {
  const source = nodes.find(node => node.id === connection.source);
  const target = nodes.find(node => node.id === connection.target);
  if (source?.type !== 'unidad' || target?.type !== 'unidad' || connection.sourceHandle !== 'uo-padre-source' || connection.targetHandle !== 'uo-hijo-target') return '';
  const padreId = source.data.record.id;
  const hijaId = target.data.record.id;
  if (padreId === hijaId) return 'Una unidad organizacional no puede ser su propia UO padre.';
  const unidadPorId = new Map(nodes.filter(node => node.type === 'unidad').map(node => [node.data.record.id, node.data.record]));
  let ancestroId = padreId;
  while (ancestroId) {
    if (ancestroId === hijaId) return 'La conexión generaría un ciclo en la jerarquía de unidades organizacionales.';
    ancestroId = unidadPorId.get(ancestroId)?.unidad_padre_id || null;
  }
  return '';
};

const errorCicloJerarquia = (connection, nodes) => {
  const source = nodes.find(node => node.id === connection.source);
  const target = nodes.find(node => node.id === connection.target);
  if (source?.type !== 'colocacion' || target?.type !== 'colocacion' || connection.sourceHandle !== 'jerarquia-source' || connection.targetHandle !== 'jerarquia-target') return '';
  const padreId = source.data.record.id;
  const hijaId = target.data.record.id;
  if (padreId === hijaId) return 'Una cargo-colocación no puede ser su propio padre jerárquico.';
  const colocacionPorId = new Map(nodes.filter(node => node.type === 'colocacion').map(node => [node.data.record.id, node.data.record]));
  let ancestroId = padreId;
  while (ancestroId) {
    if (ancestroId === hijaId) return 'La conexión generaría un ciclo en la jerarquía de cargos.';
    ancestroId = colocacionPorId.get(ancestroId)?.reporta_a_cargo_colocacion_id || null;
  }
  return '';
};

const errorCicloConexion = (connection, nodes) => errorCicloUO(connection, nodes) || errorCicloJerarquia(connection, nodes);

const dagrePositions = (nodes, edges) => {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'LR', nodesep: 52, ranksep: 118, marginx: 28, marginy: 28 });
  nodes.forEach(node => {
    const dimension = DIMENSIONS[node.type] || DIMENSIONS.posicion;
    graph.setNode(node.id, dimension);
  });
  edges.forEach(edge => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);
  return new Map(nodes.map(node => {
    const dimension = DIMENSIONS[node.type] || DIMENSIONS.posicion;
    const point = graph.node(node.id);
    return [node.id, { x: point.x - dimension.width / 2, y: point.y - dimension.height / 2 }];
  }));
};

const ordenarRaicesDeUoPorNivel = (nodes, colocaciones, posiciones) => {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const colocacionPorId = new Map(colocaciones.map(colocacion => [colocacion.id, colocacion]));
  const hijosPorColocacionId = new Map();
  const posicionesPorColocacionId = new Map();

  colocaciones.forEach(colocacion => {
    if (!colocacion.reporta_a_cargo_colocacion_id || !colocacionPorId.has(colocacion.reporta_a_cargo_colocacion_id)) return;
    const hijos = hijosPorColocacionId.get(colocacion.reporta_a_cargo_colocacion_id) || [];
    hijos.push(colocacion.id);
    hijosPorColocacionId.set(colocacion.reporta_a_cargo_colocacion_id, hijos);
  });
  posiciones.forEach(posicion => {
    const lista = posicionesPorColocacionId.get(posicion.cargo_colocacion_id) || [];
    lista.push(posicion.id);
    posicionesPorColocacionId.set(posicion.cargo_colocacion_id, lista);
  });

  const idsDelBloque = colocacionId => {
    const visitados = new Set();
    const visitar = id => {
      if (visitados.has(id)) return;
      visitados.add(id);
      (hijosPorColocacionId.get(id) || []).forEach(visitar);
    };
    visitar(colocacionId);
    const nodeIds = [...visitados].map(id => toFlowNodeId('cargo_colocacion', id));
    visitados.forEach(id => (posicionesPorColocacionId.get(id) || []).forEach(posicionId => nodeIds.push(toFlowNodeId('posicion', posicionId))));
    return nodeIds.filter(id => nodeById.has(id));
  };

  const raicesPorUo = new Map();
  colocaciones
    .filter(colocacion => !colocacion.reporta_a_cargo_colocacion_id || !colocacionPorId.has(colocacion.reporta_a_cargo_colocacion_id))
    .forEach(colocacion => {
      const lista = raicesPorUo.get(colocacion.unidad_organizacional_id) || [];
      lista.push(colocacion);
      raicesPorUo.set(colocacion.unidad_organizacional_id, lista);
    });

  raicesPorUo.forEach(raices => {
    const bloques = raices.map(colocacion => {
      const nodos = idsDelBloque(colocacion.id).map(id => nodeById.get(id));
      return { colocacion, nodos, minY: Math.min(...nodos.map(node => node.position.y)) };
    });
    const franjasOriginales = bloques.map(bloque => bloque.minY).sort((a, b) => a - b);
    bloques
      .sort((a, b) => Number(a.colocacion.nivel?.orden ?? Number.MAX_SAFE_INTEGER) - Number(b.colocacion.nivel?.orden ?? Number.MAX_SAFE_INTEGER)
        || String(a.colocacion.cargo?.nombre || '').localeCompare(String(b.colocacion.cargo?.nombre || ''), 'es')
        || String(a.colocacion.id).localeCompare(String(b.colocacion.id)))
      .forEach((bloque, index) => {
        const deltaY = franjasOriginales[index] - bloque.minY;
        bloque.nodos.forEach(node => { node.position.y += deltaY; });
      });
  });
};

const overlaps = (candidate, dimension, existing) => existing.some(node => {
  const other = DIMENSIONS[node.type] || DIMENSIONS.posicion;
  return candidate.x < node.position.x + other.width + 24
    && candidate.x + dimension.width + 24 > node.position.x
    && candidate.y < node.position.y + other.height + 24
    && candidate.y + dimension.height + 24 > node.position.y;
});

const findFreePosition = (preferred, node, existing) => {
  const dimension = DIMENSIONS[node.type] || DIMENSIONS.posicion;
  const candidate = { ...preferred };
  for (let index = 0; index < 180; index += 1) {
    if (!overlaps(candidate, dimension, existing)) return candidate;
    candidate.y += 112;
    if (index % 8 === 7) {
      candidate.y = preferred.y;
      candidate.x += 284;
    }
  }
  return candidate;
};

const AutoFitView = () => {
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (!nodesInitialized || hasFittedRef.current) return undefined;
    hasFittedRef.current = true;
    let secondFrame;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        fitView({ padding: 0.2, duration: 180, maxZoom: 1.15 });
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
    };
  }, [fitView, nodesInitialized]);

  return null;
};

const buildGraph = datos => {
  const unidades = [...(datos.unidadesOrganizacionales || [])].sort(sortByName);
  const colocaciones = [...(datos.cargoColocaciones || [])]
    .filter(colocacion => colocacion.estado === 'activo')
    .sort((a, b) => String(a.cargo?.nombre || '').localeCompare(String(b.cargo?.nombre || ''), 'es'));
  const posiciones = (datos.posicionesVinculadas || []).filter(posicion => posicion.activa);
  const colocacionPorId = new Map(colocaciones.map(colocacion => [colocacion.id, colocacion]));
  const posicionesPorColocacionId = new Map();
  const ocupacionesPorPosicionId = new Map();

  (datos.ocupacionesActivas || []).forEach(ocupacion => {
    const lista = ocupacionesPorPosicionId.get(ocupacion.posicion_id) || [];
    lista.push(ocupacion);
    ocupacionesPorPosicionId.set(ocupacion.posicion_id, lista);
  });
  posiciones.forEach(posicion => {
    const lista = posicionesPorColocacionId.get(posicion.cargo_colocacion_id) || [];
    lista.push(posicion);
    posicionesPorColocacionId.set(posicion.cargo_colocacion_id, lista);
  });

  const nodes = [];
  const edges = [];
  unidades.forEach(unidad => nodes.push({
    id: toFlowNodeId('uo', unidad.id), type: 'unidad', position: EMPTY_POSITION,
    dragHandle: '.ov2-drag-handle',
    data: { ...unidad, record: unidad, persistencia: { tipoNodo: 'uo', nodoId: unidad.id } },
  }));

  const unidadPorId = new Map(unidades.map(unidad => [unidad.id, unidad]));
  unidades.forEach(unidad => {
    if (!unidad.unidad_padre_id || !unidadPorId.has(unidad.unidad_padre_id)) return;
    edges.push({
      id: `uo-padre:${unidad.id}:${unidad.unidad_padre_id}`,
      source: toFlowNodeId('uo', unidad.unidad_padre_id), target: toFlowNodeId('uo', unidad.id),
      sourceHandle: 'uo-padre-source', targetHandle: 'uo-hijo-target',
      type: 'smoothstep', label: 'UO padre', labelStyle: { fill: '#0F6E56', fontSize: 10, fontWeight: 700 },
      style: { stroke: '#0F6E56', strokeWidth: 2.25 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#0F6E56', width: 16, height: 16 }, selectable: true, focusable: true,
      data: { kind: 'uo_padre', hija: unidad, padre: unidadPorId.get(unidad.unidad_padre_id) },
    });
  });

  colocaciones.forEach(colocacion => {
    const posicionesDeColocacion = posicionesPorColocacionId.get(colocacion.id) || [];
    nodes.push({
      id: toFlowNodeId('cargo_colocacion', colocacion.id), type: 'colocacion', position: EMPTY_POSITION,
      dragHandle: '.ov2-drag-handle',
      data: {
        record: colocacion,
        persistencia: { tipoNodo: 'cargo_colocacion', nodoId: colocacion.id },
        cargoNombre: colocacion.cargo?.nombre || colocacion.cargo_id,
        nivelNombre: colocacion.nivel?.nombre || colocacion.nivel?.codigo || 'Sin nivel',
        rolNombre: colocacion.rol?.nombre || colocacion.rol_id,
        cantidadPosiciones: colocacion.cantidad_posiciones || 0,
        ocupadas: posicionesDeColocacion.filter(posicion => (ocupacionesPorPosicionId.get(posicion.id) || []).length > 0).length,
      },
    });
    edges.push({
      id: `unidad:${colocacion.unidad_organizacional_id}:${colocacion.id}`,
      source: toFlowNodeId('uo', colocacion.unidad_organizacional_id),
      target: toFlowNodeId('cargo_colocacion', colocacion.id),
      sourceHandle: 'uo-source', targetHandle: 'uo-target',
      type: 'default', style: { stroke: '#14b8a6', strokeWidth: 2.25, strokeDasharray: '4 3' }, selectable: true, focusable: true,
      data: { kind: 'uo', unidad: unidadPorId.get(colocacion.unidad_organizacional_id), colocacion },
    });

    posicionesDeColocacion.forEach(posicion => {
      const ocupaciones = ocupacionesPorPosicionId.get(posicion.id) || [];
      nodes.push({
        id: toFlowNodeId('posicion', posicion.id), type: 'posicion', position: EMPTY_POSITION,
        dragHandle: '.ov2-drag-handle',
        data: {
          record: posicion,
          persistencia: { tipoNodo: 'posicion', nodoId: posicion.id },
          ocupanteNombre: ocupaciones.map(ocupacion => ocupacion.ocupante?.nombre).filter(Boolean).join(' · '),
          estadoLabel: ocupaciones.length ? `${ocupaciones.length} ocupante${ocupaciones.length === 1 ? '' : 's'} activo${ocupaciones.length === 1 ? '' : 's'}` : 'Vacante',
        },
      });
      edges.push({
      id: `ocupacion:${colocacion.id}:${posicion.id}`,
      source: toFlowNodeId('cargo_colocacion', colocacion.id), target: toFlowNodeId('posicion', posicion.id),
      sourceHandle: 'jerarquia-source', targetHandle: 'matricial-target',
        type: 'smoothstep', style: { stroke: '#94a3b8', strokeWidth: 2 }, selectable: false, focusable: false,
        data: { layoutOnly: true },
      });
    });
  });

  colocaciones.forEach(colocacion => {
    const padre = colocacion.reporta_a_cargo_colocacion_id;
    if (!padre || !colocacionPorId.has(padre)) return;
    // La interacción es hijo → padre y el sentido de la flecha conserva esa semántica.
    edges.push({
      id: `jerarquia:${colocacion.id}:${padre}`,
      source: toFlowNodeId('cargo_colocacion', padre), target: toFlowNodeId('cargo_colocacion', colocacion.id),
      sourceHandle: 'jerarquia-source', targetHandle: 'jerarquia-target',
      type: 'smoothstep', label: 'es padre de', labelStyle: { fill: '#1d4ed8', fontSize: 10, fontWeight: 700 },
      style: { stroke: '#2563eb', strokeWidth: 2.25 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb', width: 16, height: 16 }, selectable: true, focusable: true,
      data: { kind: 'jerarquia', hija: colocacion, padre: colocacionPorId.get(padre) },
    });
  });

  (datos.relacionesMatriciales || []).forEach(relacion => {
    const subordinadaExiste = posiciones.some(posicion => posicion.id === relacion.posicion_subordinada_id);
    const jefeExiste = posiciones.some(posicion => posicion.id === relacion.posicion_jefe_id);
    if (!subordinadaExiste || !jefeExiste) return;
    edges.push({
      id: `matricial:${relacion.id}`,
      source: toFlowNodeId('posicion', relacion.posicion_subordinada_id), target: toFlowNodeId('posicion', relacion.posicion_jefe_id),
      sourceHandle: 'matricial-source', targetHandle: 'matricial-target',
      type: 'smoothstep', label: 'matricial', labelStyle: { fill: '#7c3aed', fontSize: 10, fontWeight: 700 },
      style: { stroke: '#7c3aed', strokeWidth: 2, strokeDasharray: '7 5' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed', width: 15, height: 15 },
      selectable: true, focusable: true, data: {
        kind: 'matricial', relacionId: relacion.id,
        subordinada: (() => {
          const posicion = posiciones.find(item => item.id === relacion.posicion_subordinada_id);
          return { ...posicion, etiqueta: (ocupacionesPorPosicionId.get(posicion?.id) || []).map(ocupacion => ocupacion.ocupante?.nombre).filter(Boolean).join(' · ') || `Posición ${posicion?.id || ''}` };
        })(),
        jefe: (() => {
          const posicion = posiciones.find(item => item.id === relacion.posicion_jefe_id);
          return { ...posicion, etiqueta: (ocupacionesPorPosicionId.get(posicion?.id) || []).map(ocupacion => ocupacion.ocupante?.nombre).filter(Boolean).join(' · ') || `Posición ${posicion?.id || ''}` };
        })(),
      },
    });
  });

  const layouts = new Map((datos.layout || []).map(item => [nodeKey(item.tipo_nodo, item.nodo_id), { x: Number(item.x), y: Number(item.y) }]));
  const persistedNodes = nodes.filter(node => layouts.has(nodeKey(node.data.persistencia.tipoNodo, node.data.persistencia.nodoId)));
  const hasPersistedLayout = persistedNodes.length > 0;

  // Los handles son puramente visuales: Dagre solo se usa si el tenant no tiene ningún layout persistido.
  if (!hasPersistedLayout) {
    const layoutEdges = edges.filter(edge => edge.data?.kind !== 'matricial');
    const positions = dagrePositions(nodes, layoutEdges);
    nodes.forEach(node => { node.position = positions.get(node.id) || EMPTY_POSITION; });
    ordenarRaicesDeUoPorNivel(nodes, colocaciones, posiciones);
  } else {
    persistedNodes.forEach(node => { node.position = layouts.get(nodeKey(node.data.persistencia.tipoNodo, node.data.persistencia.nodoId)); });
    nodes.filter(node => !persistedNodes.includes(node)).forEach(node => {
      const record = node.data.record;
      let preferred = { x: 40, y: 40 };
      if (node.type === 'colocacion') {
        const unidad = persistedNodes.find(item => item.id === toFlowNodeId('uo', record.unidad_organizacional_id));
        const padre = persistedNodes.find(item => item.id === toFlowNodeId('cargo_colocacion', record.reporta_a_cargo_colocacion_id));
        preferred = padre ? { x: padre.position.x + 330, y: padre.position.y } : unidad ? { x: unidad.position.x + 330, y: unidad.position.y } : { x: 40, y: 40 };
      } else if (node.type === 'posicion') {
        const colocacion = persistedNodes.find(item => item.id === toFlowNodeId('cargo_colocacion', record.cargo_colocacion_id));
        preferred = colocacion ? { x: colocacion.position.x + 310, y: colocacion.position.y } : { x: 40, y: 40 };
      } else {
        const rightmost = persistedNodes.reduce((max, item) => Math.max(max, item.position.x), 0);
        preferred = { x: rightmost + 320, y: 40 };
      }
      node.position = findFreePosition(preferred, node, nodes.filter(item => item !== node && item.position !== EMPTY_POSITION));
    });
  }

  const maxY = Math.max(0, ...nodes.map(node => node.position.y + (DIMENSIONS[node.type] || DIMENSIONS.posicion).height));
  return { nodes, edges, minHeight: Math.max(620, maxY + 100) };
};

export default function OrganigramaCanvas({
  datos,
  onCrearColocacion,
  onEditarColocacion,
  onEliminarUnidad,
  onGuardarPosicion,
  modoConexion = 'todos',
  onConnectionHint,
  onReasignarUO,
  onAsignarUOPadre,
  onCrearJerarquia,
  onEliminarUOPadre,
  onEliminarJerarquia,
  onCrearRelacionMatricial,
  onEliminarRelacionMatricial,
  onPaneClick,
  onError,
}) {
  const graph = useMemo(() => buildGraph(datos), [datos]);
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);
  const [edgePopover, setEdgePopover] = useState(null);
  const [alignmentGuides, setAlignmentGuides] = useState([]);
  const canvasRef = useRef(null);
  const conexionInvalidaRef = useRef('');
  const conexionInvalidaNotificadaRef = useRef(false);
  const conexionInicioRef = useRef(null);
  const snapAlignmentRef = useRef(null);
  const alignmentGuidesSignatureRef = useRef('');
  const connectionLineStyle = useMemo(() => {
    const colorPorModo = {
      uo: '#0f9f9a',
      uo_padre: '#0F6E56',
      jerarquia: '#2563eb',
      matricial: '#7c3aed',
    };
    return { stroke: colorPorModo[modoConexion] || '#0f766e', strokeWidth: 4, strokeDasharray: '9 5', opacity: .98 };
  }, [modoConexion]);

  useEffect(() => { setNodes(graph.nodes); }, [graph.nodes, setNodes]);
  useEffect(() => { setEdges(graph.edges); }, [graph.edges, setEdges]);

  const onNodeDrag = useCallback((_, node) => {
    const matches = nodes
      .filter(other => other.id !== node.id && !other.hidden)
      .map(other => ({
        other,
        xDistance: Math.abs(other.position.x - node.position.x),
        yDistance: Math.abs(other.position.y - node.position.y),
      }));
    const xMatch = matches.filter(match => match.xDistance <= 5).sort((a, b) => a.xDistance - b.xDistance)[0];
    const yMatch = matches.filter(match => match.yDistance <= 5).sort((a, b) => a.yDistance - b.yDistance)[0];
    const guides = [
      xMatch && {
        id: `ov2-guide-x:${node.id}:${xMatch.other.id}`,
        source: node.id,
        target: xMatch.other.id,
        sourcePosition: Position.Top,
        targetPosition: Position.Bottom,
        type: 'straight',
        style: { stroke: '#64748b', strokeWidth: 1.25, strokeDasharray: '4 4', opacity: .8 },
        selectable: false,
        focusable: false,
        interactionWidth: 0,
      },
      yMatch && {
        id: `ov2-guide-y:${node.id}:${yMatch.other.id}`,
        source: node.id,
        target: yMatch.other.id,
        sourcePosition: Position.Left,
        targetPosition: Position.Right,
        type: 'straight',
        style: { stroke: '#64748b', strokeWidth: 1.25, strokeDasharray: '4 4', opacity: .8 },
        selectable: false,
        focusable: false,
        interactionWidth: 0,
      },
    ].filter(Boolean);
    snapAlignmentRef.current = (xMatch || yMatch) ? {
      nodeId: node.id,
      position: {
        x: xMatch ? xMatch.other.position.x : node.position.x,
        y: yMatch ? yMatch.other.position.y : node.position.y,
      },
    } : null;
    const signature = guides.map(guide => guide.id).join('|');
    if (signature !== alignmentGuidesSignatureRef.current) {
      alignmentGuidesSignatureRef.current = signature;
      setAlignmentGuides(guides);
    }
  }, [nodes]);

  const onNodeDragStop = useCallback((_, node) => {
    const meta = node.data?.persistencia;
    if (!meta) return;
    const snap = snapAlignmentRef.current?.nodeId === node.id ? snapAlignmentRef.current.position : null;
    const position = snap || node.position;
    if (snap) setNodes(current => current.map(item => item.id === node.id ? { ...item, position } : item));
    if (alignmentGuidesSignatureRef.current) setAlignmentGuides([]);
    alignmentGuidesSignatureRef.current = '';
    snapAlignmentRef.current = null;
    Promise.resolve(onGuardarPosicion?.({ ...meta, x: position.x, y: position.y })).catch(error => onError?.(error));
  }, [onGuardarPosicion, onError, setNodes]);

  const isValidConnection = useCallback(connection => {
    const tipo = tipoConexion(connection, nodes);
    const errorCiclo = errorCicloConexion(connection, nodes);
    if (errorCiclo) {
      conexionInvalidaRef.current = errorCiclo;
      if (!conexionInvalidaNotificadaRef.current) {
        conexionInvalidaNotificadaRef.current = true;
        onError?.(new Error(errorCiclo));
      }
      return false;
    }
    const valida = Boolean(tipo && (modoConexion === 'todos' || modoConexion === tipo));
    conexionInvalidaRef.current = valida ? '' : conexionInvalidaRef.current;
    return valida;
  }, [modoConexion, nodes]);

  const onConnectStart = useCallback((_, params) => {
    conexionInvalidaRef.current = '';
    conexionInvalidaNotificadaRef.current = false;
    conexionInicioRef.current = { source: params.nodeId, sourceHandle: params.handleId };
    const source = nodes.find(node => node.id === params.nodeId);
    onConnectionHint?.(hintConexion({ handleId: params.handleId, node: source }));
  }, [nodes, onConnectionHint]);

  const onConnectEnd = useCallback((event, connectionState) => {
    const touch = event.changedTouches?.[0] || event.touches?.[0];
    const elementAtPointer = typeof document === 'undefined' ? null : document.elementFromPoint(
      touch?.clientX ?? event.clientX,
      touch?.clientY ?? event.clientY,
    );
    const targetHandle = elementAtPointer?.closest?.('.react-flow__handle') || event.target?.closest?.('.react-flow__handle');
    const source = connectionState?.fromNode?.id || conexionInicioRef.current?.source;
    const sourceHandle = connectionState?.fromHandle?.id || conexionInicioRef.current?.sourceHandle;
    const target = connectionState?.toNode?.id || targetHandle?.dataset.nodeid;
    const targetHandleId = connectionState?.toHandle?.id || targetHandle?.dataset.handleid;
    if (!conexionInvalidaRef.current && source && target) {
      const errorCiclo = errorCicloConexion({
        source,
        sourceHandle,
        target,
        targetHandle: targetHandleId,
      }, nodes);
      if (errorCiclo) conexionInvalidaRef.current = errorCiclo;
    }
    if (conexionInvalidaRef.current && !conexionInvalidaNotificadaRef.current) onError?.(new Error(conexionInvalidaRef.current));
    conexionInvalidaRef.current = '';
    conexionInvalidaNotificadaRef.current = false;
    conexionInicioRef.current = null;
  }, [nodes, onError]);

  const onConnect = useCallback(connection => {
    const source = nodes.find(node => node.id === connection.source);
    const target = nodes.find(node => node.id === connection.target);
    const tipo = tipoConexion(connection, nodes);
    if (!source || !target || !tipo || (modoConexion !== 'todos' && modoConexion !== tipo)) {
      onError?.(new Error('La combinación de conexión no es válida para el modo seleccionado.'));
      return;
    }
    onConnectionHint?.('');
    if (tipo === 'uo') {
      Promise.resolve(onReasignarUO?.({ unidad: source.data.record, colocacion: target.data.record })).catch(error => onError?.(error));
      return;
    }
    if (tipo === 'uo_padre') {
      Promise.resolve(onAsignarUOPadre?.({ padre: source.data.record, hija: target.data.record })).catch(error => onError?.(error));
      return;
    }
    if (tipo === 'jerarquia') {
      Promise.resolve(onCrearJerarquia?.({ padre: source.data.record, hija: target.data.record })).catch(error => onError?.(error));
      return;
    }
    if (tipo === 'matricial') {
      Promise.resolve(onCrearRelacionMatricial?.({ subordinada: source.data.record, jefe: target.data.record })).catch(error => onError?.(error));
      return;
    }
    onError?.(new Error('Conecta una UO con una cargo-colocación o UO padre, cargo-colocación con cargo-colocación, o posición con posición.'));
  }, [modoConexion, nodes, onAsignarUOPadre, onConnectionHint, onCrearJerarquia, onCrearRelacionMatricial, onError, onReasignarUO]);

  const onEdgeClick = useCallback((event, edge) => {
    if (!edge.data?.kind) return;
    event.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    setEdgePopover({
      edge,
      unidadId: edge.data?.kind === 'uo' ? edge.data.unidad?.id || '' : '',
      x: Math.max(12, (event.clientX || rect?.width / 2) - (rect?.left || 0)),
      y: Math.max(12, (event.clientY || rect?.height / 2) - (rect?.top || 0)),
    });
  }, []);

  const reasignarDesdeArista = useCallback(() => {
    const edge = edgePopover?.edge;
    const unidad = nodes.find(node => node.type === 'unidad' && node.data.record.id === edgePopover?.unidadId)?.data.record;
    if (!edge || edge.data?.kind !== 'uo' || !unidad || unidad.id === edge.data.unidad?.id) return;
    setEdgePopover(null);
    Promise.resolve(onReasignarUO?.({ unidad, colocacion: edge.data.colocacion })).catch(error => onError?.(error));
  }, [edgePopover, nodes, onError, onReasignarUO]);

  const cerrarSobreLienzo = useCallback(() => {
    setEdgePopover(null);
    onPaneClick?.();
  }, [onPaneClick]);

  const eliminarArista = useCallback(() => {
    const edge = edgePopover?.edge;
    if (!edge || !window.confirm('¿Eliminar esta relación?')) return;
    setEdgePopover(null);
    if (edge.data.kind === 'uo_padre') {
      Promise.resolve(onEliminarUOPadre?.(edge.data.hija)).catch(error => onError?.(error));
      return;
    }
    if (edge.data.kind === 'jerarquia') {
      Promise.resolve(onEliminarJerarquia?.(edge.data.hija)).catch(error => onError?.(error));
      return;
    }
    if (edge.data.kind === 'matricial') Promise.resolve(onEliminarRelacionMatricial?.(edge.data.relacionId)).catch(error => onError?.(error));
  }, [edgePopover, onEliminarJerarquia, onEliminarRelacionMatricial, onEliminarUOPadre, onError]);

  return (
    <div ref={canvasRef} className="ov2-canvas" style={{ position: 'relative', height: '100%', minHeight: 0, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', backgroundColor: 'color-mix(in srgb, var(--bg-card, var(--bg)) 92%, #dbeafe)', backgroundImage: 'radial-gradient(color-mix(in srgb, var(--fg) 17%, transparent) 1px, transparent 1px)', backgroundSize: '18px 18px' }}>
      <style>{CANVAS_INTERACTION_STYLES}</style>
      <CanvasNodeContext.Provider value={{ modoConexion, onCrearColocacion, onEditarColocacion, onEliminarUnidad }}>
      <ReactFlow
        nodes={nodes}
        edges={[...edges, ...alignmentGuides]}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        isValidConnection={isValidConnection}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onConnect={onConnect}
        connectionLineStyle={connectionLineStyle}
        onEdgeClick={onEdgeClick}
        onPaneClick={cerrarSobreLienzo}
        nodesDraggable
        nodeDragThreshold={0}
        nodesConnectable
        elementsSelectable
        panOnDrag
        proOptions={{ hideAttribution: true }}
      >
        <AutoFitView />
        <Background gap={18} size={1} color="var(--border)" />
        <Controls showInteractive />
      </ReactFlow>
      </CanvasNodeContext.Provider>
      {edgePopover && (
        <div className="card nodrag nopan" data-testid="ov2-edge-popover" style={{ position: 'absolute', left: Math.min(edgePopover.x, 620), top: Math.min(edgePopover.y, 420), zIndex: 10, width: 270, padding: 10, boxShadow: '0 10px 24px rgba(15,23,42,.22)' }} onPointerDown={event => event.stopPropagation()}>
          <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35 }}>{descripcionArista(edgePopover.edge)}</div>
          {edgePopover.edge.data?.kind === 'uo' && (
            <div className="input-group" style={{ marginTop: 9 }}>
              <label htmlFor="ov2-reassign-uo">Reasignar a otra UO</label>
              <select id="ov2-reassign-uo" data-testid="ov2-reassign-edge-uo" className="select" value={edgePopover.unidadId} onChange={event => setEdgePopover(current => ({ ...current, unidadId: event.target.value }))}>
                {nodes.filter(node => node.type === 'unidad' && node.data.record.estado === 'activo').map(node => <option key={node.data.record.id} value={node.data.record.id}>{node.data.record.nombre}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 7, marginTop: 9 }}>
            <button type="button" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setEdgePopover(null)}>Cerrar</button>
            {edgePopover.edge.data?.kind === 'uo'
              ? <button type="button" className="btn btn-primary" data-testid="ov2-confirm-reassign-edge-uo" style={{ padding: '4px 8px', fontSize: 11 }} disabled={!edgePopover.unidadId || edgePopover.unidadId === edgePopover.edge.data.unidad?.id} onClick={reasignarDesdeArista}>Reasignar a otra UO</button>
              : <button type="button" className="btn btn-danger" data-testid="ov2-delete-edge" style={{ padding: '4px 8px', fontSize: 11 }} onClick={eliminarArista}>Eliminar relación</button>}
          </div>
        </div>
      )}
    </div>
  );
}
