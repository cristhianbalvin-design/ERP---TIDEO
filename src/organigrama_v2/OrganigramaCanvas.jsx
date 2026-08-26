import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
const CANVAS_INTERACTION_STYLES = `
  .ov2-canvas .react-flow__node { cursor: grab; }
  .ov2-canvas .ov2-drag-handle:active,
  .ov2-canvas .ov2-drag-handle:active * { cursor: grabbing !important; }
  .ov2-canvas .react-flow__node.dragging,
  .ov2-canvas .react-flow__node.dragging * { cursor: grabbing !important; }
  .ov2-canvas .ov2-connect-handle { width: 12px; height: 12px; border: 2px solid var(--card); }
  .ov2-canvas .ov2-connect-handle.ov2-handle-disabled { opacity: .22; pointer-events: none; filter: grayscale(1); }
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
  modoConexion === 'todos' || modoConexion === tipoConexion
);

const handleClassName = (modoConexion, tipoConexion, extra = '') => (
  `ov2-connect-handle ${extra} ${handleEnabled(modoConexion, tipoConexion) ? '' : 'ov2-handle-disabled'}`.trim()
);

export const UnidadOrganizacionalNode = ({ data, dragging }) => {
  const dragCursor = useNodeDragCursor(dragging);
  const asignarUoHabilitado = handleEnabled(data.modoConexion, 'uo');
  return (
  <div className="ov2-drag-handle" data-testid={`ov2-node-uo-${data.record.id}`} onPointerDown={dragCursor.onPointerDown} style={{ ...nodeShell('#0f766e', 'color-mix(in srgb, #14b8a6 9%, var(--card))'), width: DIMENSIONS.unidad.width, padding: '13px 15px', borderWidth: 2, cursor: dragCursor.cursor }}>
    <Handle id="uo-source" type="source" position={Position.Bottom} isConnectable={asignarUoHabilitado} className={handleClassName(data.modoConexion, 'uo', 'ov2-handle-uo')} style={{ background: '#14b8a6' }} />
    <NodeHeader color="#0f766e">UO {data.codigo && `· ${data.codigo}`}</NodeHeader>
    <div style={{ fontWeight: 850, fontSize: 17, lineHeight: 1.18 }}>{data.nombre}</div>
    <button
      type="button"
      className="nodrag btn btn-secondary"
      data-testid={`ov2-create-colocacion-${data.record.id}`}
      style={{ marginTop: 7, padding: '3px 7px', fontSize: 10 }}
      onClick={event => { event.stopPropagation(); data.onCrearColocacion?.(data.record); }}
    >
      + Cargo
    </button>
  </div>
  );
};

export const CargoColocacionNode = ({ data, dragging }) => {
  const dragCursor = useNodeDragCursor(dragging);
  const asignarUoHabilitado = handleEnabled(data.modoConexion, 'uo');
  const jerarquiaHabilitada = handleEnabled(data.modoConexion, 'jerarquia');
  return (
  <div
    className="ov2-drag-handle"
    data-testid={`ov2-node-ccol-${data.record.id}`}
    role="button"
    tabIndex={0}
    title="Haz clic para editar. Arrastra desde este nodo hacia su cargo padre para definir jerarquía."
    onClick={() => data.onEditarColocacion?.(data.record)}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') data.onEditarColocacion?.(data.record); }}
    onPointerDown={dragCursor.onPointerDown}
    style={{ ...nodeShell('#2563eb', 'var(--card)'), width: DIMENSIONS.colocacion.width, padding: '10px 12px', borderWidth: 2, cursor: dragCursor.cursor }}
  >
    <Handle id="uo-target" type="target" position={Position.Top} isConnectable={asignarUoHabilitado} className={handleClassName(data.modoConexion, 'uo', 'ov2-handle-uo')} style={{ background: '#14b8a6' }} />
    <Handle id="jerarquia-target" type="target" position={Position.Left} isConnectable={jerarquiaHabilitada} className={handleClassName(data.modoConexion, 'jerarquia', 'ov2-handle-jerarquia')} style={{ background: '#2563eb' }} />
    <NodeHeader color="#2563eb">Cargo-colocación</NodeHeader>
    <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.2 }}>{data.cargoNombre}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 7 }}>
      <span style={{ background: 'rgba(37,99,235,.10)', color: '#1d4ed8', borderRadius: 99, fontSize: 10, fontWeight: 750, padding: '2px 6px' }}>{data.nivelNombre}</span>
      <span style={{ background: 'var(--bg-subtle)', color: 'var(--fg-muted)', borderRadius: 99, fontSize: 10, padding: '2px 6px' }}>{data.rolNombre}</span>
      <span style={{ background: '#1d4ed8', color: '#fff', borderRadius: 99, fontSize: 10, fontWeight: 800, padding: '2px 6px' }}>{data.ocupadas}/{data.cantidadPosiciones}</span>
    </div>
    <Handle id="jerarquia-source" type="source" position={Position.Right} isConnectable={jerarquiaHabilitada} className={handleClassName(data.modoConexion, 'jerarquia', 'ov2-handle-jerarquia')} style={{ background: '#2563eb' }} />
  </div>
  );
};

export const PosicionNode = ({ data, dragging }) => {
  const dragCursor = useNodeDragCursor(dragging);
  const matricialHabilitada = handleEnabled(data.modoConexion, 'matricial');
  return (
  <div className="ov2-drag-handle" data-testid={`ov2-node-pos-${data.record.id}`} onPointerDown={dragCursor.onPointerDown} style={{ ...nodeShell('#94a3b8', 'var(--bg-subtle)'), width: DIMENSIONS.posicion.width, padding: '7px 9px', boxShadow: 'none', cursor: dragCursor.cursor }}>
    <Handle id="matricial-target" type="target" position={Position.Left} isConnectable={matricialHabilitada} className={handleClassName(data.modoConexion, 'matricial', 'ov2-handle-matricial')} style={{ background: '#7c3aed' }} />
    <div style={{ fontWeight: 750, fontSize: 12 }}>{data.ocupanteNombre || 'Vacante'}</div>
    <div style={{ color: 'var(--fg-muted)', fontSize: 10, marginTop: 2 }}>{data.estadoLabel}</div>
    <Handle id="matricial-source" type="source" position={Position.Right} isConnectable={matricialHabilitada} className={handleClassName(data.modoConexion, 'matricial', 'ov2-handle-matricial')} style={{ background: '#7c3aed' }} />
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
  if (source.type === 'colocacion' && connection.sourceHandle === 'jerarquia-source' && target.type === 'colocacion' && connection.targetHandle === 'jerarquia-target') return 'jerarquia';
  if (source.type === 'posicion' && connection.sourceHandle === 'matricial-source' && target.type === 'posicion' && connection.targetHandle === 'matricial-target') return 'matricial';
  return null;
};

const hintConexion = ({ handleId, node }) => {
  if (node?.type === 'unidad' && handleId === 'uo-source') return 'Suelta sobre una cargo-colocación para asignarla a esta UO.';
  if (node?.type === 'colocacion' && handleId === 'jerarquia-source') return 'Suelta sobre la cargo-colocación padre para definir jerarquía.';
  if (node?.type === 'posicion' && handleId === 'matricial-source') return 'Suelta sobre la posición jefe para crear la relación matricial.';
  return 'Selecciona un punto de conexión válido.';
};

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

const buildGraph = (datos, onCrearColocacion, onEditarColocacion, modoConexion) => {
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
    data: { ...unidad, record: unidad, persistencia: { tipoNodo: 'uo', nodoId: unidad.id }, onCrearColocacion, modoConexion },
  }));

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
        onEditarColocacion,
        modoConexion,
      },
    });
    edges.push({
      id: `unidad:${colocacion.unidad_organizacional_id}:${colocacion.id}`,
      source: toFlowNodeId('uo', colocacion.unidad_organizacional_id),
      target: toFlowNodeId('cargo_colocacion', colocacion.id),
      sourceHandle: 'uo-source', targetHandle: 'uo-target',
      type: 'smoothstep', style: { stroke: '#14b8a6', strokeWidth: 2.25 }, selectable: false, focusable: false,
      data: { layoutOnly: true },
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
          modoConexion,
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
      source: toFlowNodeId('cargo_colocacion', colocacion.id), target: toFlowNodeId('cargo_colocacion', padre),
      sourceHandle: 'jerarquia-source', targetHandle: 'jerarquia-target',
      type: 'smoothstep', label: 'reporta a', labelStyle: { fill: '#1d4ed8', fontSize: 10, fontWeight: 700 },
      style: { stroke: '#2563eb', strokeWidth: 2.25 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb', width: 16, height: 16 }, selectable: false, focusable: false,
      data: { layoutOnly: true },
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
      selectable: true, focusable: true, data: { kind: 'matricial', relacionId: relacion.id },
    });
  });

  const layouts = new Map((datos.layout || []).map(item => [nodeKey(item.tipo_nodo, item.nodo_id), { x: Number(item.x), y: Number(item.y) }]));
  const persistedNodes = nodes.filter(node => layouts.has(nodeKey(node.data.persistencia.tipoNodo, node.data.persistencia.nodoId)));
  const hasPersistedLayout = persistedNodes.length > 0;

  if (!hasPersistedLayout) {
    const layoutEdges = edges
      .filter(edge => edge.data?.kind !== 'matricial')
      // La arista visible es hija → padre; para el árbol, dagre coloca padre → hija.
      .map(edge => edge.id.startsWith('jerarquia:') ? { ...edge, source: edge.target, target: edge.source } : edge);
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
  onGuardarPosicion,
  modoConexion = 'todos',
  onConnectionHint,
  onReasignarUO,
  onCrearJerarquia,
  onCrearRelacionMatricial,
  onEliminarRelacionMatricial,
  onError,
}) {
  const graph = useMemo(() => buildGraph(datos, onCrearColocacion, onEditarColocacion, modoConexion), [datos, modoConexion, onCrearColocacion, onEditarColocacion]);
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);

  useEffect(() => { setNodes(graph.nodes); }, [graph.nodes, setNodes]);
  useEffect(() => { setEdges(graph.edges); }, [graph.edges, setEdges]);

  const onNodeDragStop = useCallback((_, node) => {
    const meta = node.data?.persistencia;
    if (!meta) return;
    Promise.resolve(onGuardarPosicion?.({ ...meta, x: node.position.x, y: node.position.y })).catch(error => onError?.(error));
  }, [onGuardarPosicion, onError]);

  const isValidConnection = useCallback(connection => {
    const tipo = tipoConexion(connection, nodes);
    return Boolean(tipo && (modoConexion === 'todos' || modoConexion === tipo));
  }, [modoConexion, nodes]);

  const onConnectStart = useCallback((_, params) => {
    const source = nodes.find(node => node.id === params.nodeId);
    onConnectionHint?.(hintConexion({ handleId: params.handleId, node: source }));
  }, [nodes, onConnectionHint]);

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
    if (tipo === 'jerarquia') {
      Promise.resolve(onCrearJerarquia?.({ hija: source.data.record, padre: target.data.record })).catch(error => onError?.(error));
      return;
    }
    if (tipo === 'matricial') {
      Promise.resolve(onCrearRelacionMatricial?.({ subordinada: source.data.record, jefe: target.data.record })).catch(error => onError?.(error));
      return;
    }
    onError?.(new Error('Conecta cargo-colocación con cargo-colocación, o posición con posición.'));
  }, [modoConexion, nodes, onConnectionHint, onCrearJerarquia, onCrearRelacionMatricial, onError, onReasignarUO]);

  const onEdgeClick = useCallback((event, edge) => {
    if (edge.data?.kind !== 'matricial') return;
    event.stopPropagation();
    if (!window.confirm('¿Eliminar esta relación matricial?')) return;
    Promise.resolve(onEliminarRelacionMatricial?.(edge.data.relacionId)).catch(error => onError?.(error));
  }, [onEliminarRelacionMatricial, onError]);

  return (
    <div className="ov2-canvas" style={{ height: '100%', minHeight: 0, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card, var(--bg))' }}>
      <style>{CANVAS_INTERACTION_STYLES}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        isValidConnection={isValidConnection}
        onConnectStart={onConnectStart}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
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
    </div>
  );
}
