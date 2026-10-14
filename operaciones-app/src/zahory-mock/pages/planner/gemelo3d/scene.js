import { calcularDistanciaZoom, calcularEncuadre, calcularVectorPaneo, colorUtilizacion, crearLayout, limitarPaneo } from './sceneModel.js';
import { crearModeloMaquina } from './machineBuilders.js';
import { crearModeloComponenteCliente, crearModeloEquipoCliente } from './clientModels.js';
import { resolverIlustracionOT } from './sceneModel.js';

const TOKENS = {
  '--dx-ui-green-fg': '#14633A', '--dx-ui-amber-fg': '#8A4B00', '--dx-ui-red-fg': '#B42318',
  '--dx-ui-cyan': '#00ACC1', '--dx-ui-ink': '#1F2937', '--dx-ui-card': '#FFFFFF',
  '--dx-ui-line': '#E4E7EB', '--dx-ui-gray': '#6B7280', '--dx-ui-navy': '#1A2B4A',
  '--sc-floor': '#12203A', '--sc-grid': '#26406A', '--sc-pad': '#1A2D4D', '--sc-bg1': '#000000', '--sc-bg2': '#000000',
  '--sc-idle': '#7186A4', '--sc-mach': '#5F86BF', '--sk-mec': '#22D3EE', '--sk-sold': '#FFA94D', '--sk-hid': '#A78BFA', '--sk-ele': '#60A5FA', '--sk-tor': '#4ADE80',
};
const CATEGORIA = { green: '--dx-ui-green-fg', amber: '--dx-ui-amber-fg', red: '--dx-ui-red-fg' };
export const ESCENA_TEMAS = {
  oscuro: { piso: '#12203A', cuadricula: '#26406A', losa: '#1A2D4D', fondoSuperior: '#000000', fondoInferior: '#000000', personalLibre: '#7186A4', maquina: '#5F86BF' },
  claro: { piso: '#DDE5F0', cuadricula: '#B5C3D8', losa: '#EDF2F8', fondoSuperior: '#000000', fondoInferior: '#000000', personalLibre: '#8A99B0', maquina: '#6F8BB5' },
};
export const ILUMINACION_GEMELO = { hemisferioCielo: 0xffffff, hemisferioSuelo: 0x40506e, intensidadHemisferio: .95, intensidadDireccional: .8, posicionDireccional: [-20, 34, 22], toneMapping: 'NoToneMapping', salidaColor: 'SRGBColorSpace' };

export function leerTokens(element) {
  const style = getComputedStyle(element);
  const css = Object.fromEntries(Object.entries(TOKENS).map(([name, fallback]) => [name, style.getPropertyValue(name).trim() || fallback]));
  const dark = detectarTemaOscuro(element);
  const theme = dark ? ESCENA_TEMAS.oscuro : ESCENA_TEMAS.claro;
  const colors = { floor: theme.piso, grid: theme.cuadricula, pad: theme.losa, bg1: theme.fondoSuperior, bg2: theme.fondoInferior, idle: theme.personalLibre, mach: theme.maquina };
  return { ...css, '--sc-floor': colors.floor, '--sc-grid': colors.grid, '--sc-pad': colors.pad, '--sc-bg1': colors.bg1, '--sc-bg2': colors.bg2, '--sc-idle': colors.idle, '--sc-mach': colors.mach };
}

export function detectarTemaOscuro(element, documentRef = globalThis.document) {
  const candidatos = [element, element?.closest?.('[data-theme],.dark'), documentRef?.documentElement, documentRef?.body];
  const shadowHost = element?.getRootNode?.()?.host;
  if (shadowHost) candidatos.push(shadowHost);
  return candidatos.some(candidate => candidate && (
    candidate.matches?.('[data-theme="dark"],.dark')
    || candidate.getAttribute?.('data-theme') === 'dark'
    || candidate.classList?.contains('dark')
  ));
}

export function observarTemaEscena(root, actualizar, documentRef = globalThis.document, Observer = globalThis.MutationObserver) {
  if (!root || typeof Observer !== 'function') return () => {};
  const observer = new Observer(actualizar);
  const targets = new Set([root, documentRef?.documentElement, documentRef?.body, root.getRootNode?.()?.host]);
  targets.forEach(target => target && observer.observe(target, { attributes: true, attributeFilter: ['data-theme', 'class'] }));
  return () => observer.disconnect();
}

export function crearEscena(THREE, OrbitControls, host, model, tokens, opciones = {}) {
  let renderer;
  try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch (error) {
    opciones.onError?.(error);
    return null;
  }
  const scene = new THREE.Scene();
  // Three 0.186 usa iluminación física y salida sRGB; estas intensidades equivalen al r128 no físico de la maqueta.
  renderer.outputColorSpace = THREE[ILUMINACION_GEMELO.salidaColor];
  renderer.toneMapping = THREE[ILUMINACION_GEMELO.toneMapping];
  renderer.setClearColor(0x000000, 1);
  const hemi = new THREE.HemisphereLight(ILUMINACION_GEMELO.hemisferioCielo, ILUMINACION_GEMELO.hemisferioSuelo, ILUMINACION_GEMELO.intensidadHemisferio);
  const directional = new THREE.DirectionalLight(0xffffff, ILUMINACION_GEMELO.intensidadDireccional);
  directional.position.set(...ILUMINACION_GEMELO.posicionDireccional);
  scene.add(hemi, directional);
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color(tokens['--sc-bg1']) }, bottom: { value: new THREE.Color(tokens['--sc-bg2']) } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec2 vUv; void main(){gl_FragColor=vec4(mix(bottom,top,smoothstep(0.0,1.0,vUv.y)),1.0);}', depthWrite: false,
  }));
  backdrop.position.set(0, 100, -160); scene.add(backdrop);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 500);
  const controls = new OrbitControls(camera, renderer.domElement);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const layout = crearLayout(model.bahias, model.puestos);
  const root = new THREE.Group();
  const targets = [];
  const textObjects = [];
  const sparks = [];
  const bayIndicators = [];
  const walkingFigures = [];
  const render = () => renderer.render(scene, camera);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0;
  let visible = !document.hidden;
  let labels = false;
  const layerState = { categorias: {}, objetos: { maquinas: true, personas: true, componentes: true, equipos: true } };
  let selectedTargets = [];

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.domElement.setAttribute('aria-label', 'Vista tridimensional del taller. Usa las flechas para girar y más o menos para acercar.');
  renderer.domElement.tabIndex = 0;
  renderer.domElement.className = 'dx-planner-3d-canvas';
  scene.add(root);
  const mat = (color, opacity = 1, token = null) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: .6, metalness: .25, transparent: opacity < 1, opacity });
    material.userData.themeToken = token;
    return material;
  };
  const box = (w, h, d, material, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    return mesh;
  };
  const floor = box(layout.ancho, .4, layout.profundidad, mat(tokens['--sc-floor'], 1, '--sc-floor'), 0, -.3, 0);
  floor.userData.noRay = true;
  floor.receiveShadow = true;
  root.add(floor);
  const gridPoints = [];
  for (let x = -layout.ancho / 2; x <= layout.ancho / 2; x += 2) gridPoints.push(x, -.08, -layout.profundidad / 2, x, -.08, layout.profundidad / 2);
  for (let z = -layout.profundidad / 2; z <= layout.profundidad / 2; z += 2) gridPoints.push(-layout.ancho / 2, -.08, z, layout.ancho / 2, -.08, z);
  const gridGeometry = new THREE.BufferGeometry(); gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
  const gridMaterial = new THREE.LineBasicMaterial({ color: tokens['--sc-grid'], transparent: true, opacity: 0.7 });
  gridMaterial.userData.themeToken = '--sc-grid';
  const grid = new THREE.LineSegments(gridGeometry, gridMaterial); grid.userData.noRay = true; root.add(grid);
  const addTarget = (mesh, kind, datum, category) => {
    mesh.userData = { kind, datum, category };
    if (kind === 'componente') {
      const edgeMaterial = new THREE.LineBasicMaterial({ color: tokens['--dx-ui-cyan'] });
      edgeMaterial.userData.themeToken = '--dx-ui-cyan';
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMaterial);
      edge.userData.noRay = true; edge.raycast = () => {}; mesh.add(edge);
    }
    targets.push(mesh);
    root.add(mesh);
    return mesh;
  };
  const addLabel = (text, x, y, z, category) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    context.fillStyle = '#F8FAFC';
    context.strokeStyle = '#000000';
    context.lineWidth = 8;
    context.lineJoin = 'round';
    context.font = '600 34px sans-serif';
    context.textAlign = 'center';
    context.strokeText(String(text).slice(0, 28), 256, 60);
    context.fillText(String(text).slice(0, 28), 256, 60);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.position.set(x, y, z);
    sprite.scale.set(8, 1.5, 1);
    sprite.visible = false;
    sprite.userData = { category, labelCanvas: canvas, labelText: String(text).slice(0, 28) };
    root.add(sprite);
    textObjects.push(sprite);
  };

  model.bahias.forEach(bahia => {
    const pos = layout.posicionesBahia[bahia.id];
    if (!pos) return;
    const usageToken = CATEGORIA[colorUtilizacion(bahia.utilizacion)];
    const statusToken = bahia.conflicto ? '--dx-ui-red-fg' : bahia.ots.length ? '--dx-ui-cyan' : '--dx-ui-gray';
    const zone = box(pos.width, .14, pos.depth, mat(tokens['--sc-pad'], .48, '--sc-pad'), pos.x, .02, pos.z);
    addTarget(zone, 'bahia', bahia, bahia.categoria || 'general');
    addLabel(`${bahia.nombre} · ${Math.round(bahia.utilizacion * 100)}%`, pos.x, 3.2, pos.z - pos.depth / 2 + .6, bahia.categoria || 'general');
    const outlineMaterial = new THREE.LineBasicMaterial({ color: tokens[statusToken] });
    outlineMaterial.userData.themeToken = statusToken;
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(pos.width, .18, pos.depth)), outlineMaterial);
    outline.raycast = () => {};
    outline.position.set(pos.x, .1, pos.z);
    outline.userData.category = bahia.categoria || 'general';
    root.add(outline);
    const pipMaterial = mat(tokens['--sc-grid'], 1, '--sc-grid');
    const activeSlots = new Set(bahia.asignaciones.map(item => item.ot_id)).size;
    const capacitySlots = bahia.puestos.reduce((sum, puesto) => sum + Number(puesto.capacidad || 1), 0);
    for (let index = 0; index < capacitySlots; index++) {
      const pipColor = bahia.conflicto ? tokens['--dx-ui-red-fg'] : index < activeSlots ? tokens['--dx-ui-cyan'] : tokens['--sc-grid'];
      const pipMat = mat(pipColor, 1, bahia.conflicto ? '--dx-ui-red-fg' : index < activeSlots ? '--dx-ui-cyan' : '--sc-grid');
      const pip = box(.42, .12, .42, pipMat, pos.x - pos.width / 2 + .7 + index * .65, .24, pos.z + pos.depth / 2 - .45);
      pip.userData.noRay = true; root.add(pip);
    }
    const fill = Math.min(1, Math.max(0, bahia.utilizacion));
    if (fill > 0) {
      const utilization = box(Math.max(.2, pos.width * fill), .08, .2, mat(tokens[usageToken], 1, usageToken), pos.x - pos.width / 2 + pos.width * fill / 2, .22, pos.z - pos.depth / 2 + .2);
      utilization.userData.noRay = true; root.add(utilization);
    }
    if (bahia.conflicto) bayIndicators.push(outline);
    bahia.puestos.forEach(puesto => {
      const p = layout.posicionesPuesto[puesto.id];
      if (!p) return;
      const pad = box(p.width, .18, p.depth, mat(tokens['--sc-pad'], 1, '--sc-pad'), p.x, .13, p.z);
      addTarget(pad, 'puesto', { ...puesto, bahia }, bahia.categoria || 'general');
    });
    const category = bahia.categoria || 'general';
    const addAccessory = mesh => { mesh.userData.category = category; mesh.userData.noRay = true; root.add(mesh); };
    if (category === 'pesada') for (let index = 0; index < 5; index++) {
      addAccessory(box(1.5, .08, .45, mat(index % 2 ? tokens['--dx-ui-navy'] : tokens['--dx-ui-amber-fg']), pos.x - pos.width / 2 + 1.3 + index * 1.7, .26, pos.z + pos.depth / 2 - .5));
    }
    if (category === 'sold') {
      addAccessory(box(.24, 3.2, pos.depth * .7, mat(tokens['--dx-ui-gray']), pos.x - pos.width / 2 + .4, 1.6, pos.z));
      addAccessory(box(pos.width * .7, 3.2, .24, mat(tokens['--dx-ui-gray']), pos.x, 1.6, pos.z - pos.depth / 2 + .4));
      addAccessory(box(pos.width * .7, 3.2, .24, mat(tokens['--dx-ui-gray']), pos.x, 1.6, pos.z + pos.depth / 2 - .4));
    }
    if (category === 'crom') for (const offset of [-2, 2]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.4, 18), mat(tokens['--dx-ui-cyan'], .42));
      tank.position.set(pos.x - pos.width / 2 + 2, 1.2, pos.z + offset);
      addAccessory(tank);
    }
    if (category === 'mec') addAccessory(box(3.2, .9, 1.5, mat(tokens['--dx-ui-gray']), pos.x - pos.width / 2 + 2, .6, pos.z - pos.depth / 2 + 1.2));
    if (category === 'hidr') for (const offset of [-.8, .8]) {
      const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 2.2, 16), mat(tokens['--dx-ui-cyan']));
      cylinder.position.set(pos.x - pos.width / 2 + 1.2, 1.1, pos.z + offset);
      addAccessory(cylinder);
    }
    if (category === 'sold') {
      addAccessory(box(2.2, .9, 2.2, mat('#7A889F'), pos.x, .45, pos.z));
      addAccessory(box(1.1, .2, .5, mat('#FFA94D'), pos.x, 2.4, pos.z - pos.depth / 2 + .8));
      for (let spark = 0; spark < 6; spark++) {
        const light = mat('#FFD27A', 1, null); light.emissive = new THREE.Color('#FFB84D'); light.emissiveIntensity = 1;
        const particle = box(.18, .18, .18, light, pos.x + (spark % 3 - 1) * .35, 1.4, pos.z + (spark % 2 ? .5 : -.5));
        particle.userData.spark = spark; particle.userData.sparkBase = particle.position.y; addAccessory(particle); sparks.push(particle);
      }
    }
    if (category === 'crom') addAccessory(box(.18, 2.2, pos.depth * .8, mat('#E8F4FA'), pos.x - pos.width / 2 + 4, 2.6, pos.z));
  });

  const maquinasPorUbicacion = new Map();
  model.maquinas.forEach(maquina => {
    const key = maquina.puesto_id || maquina.bahia_id;
    maquinasPorUbicacion.set(key, (maquinasPorUbicacion.get(key) || 0) + 1);
  });
  const indiceMaquina = new Map();
  model.maquinas.forEach(maquina => {
    const bay = layout.posicionesBahia[maquina.bahia_id];
    const post = layout.posicionesPuesto[maquina.puesto_id];
    const loc = post || bay;
    if (!loc) return;
    const key = maquina.puesto_id || maquina.bahia_id;
    const count = maquinasPorUbicacion.get(key) || 1;
    const slot = (indiceMaquina.get(key) || 0) + 1;
    indiceMaquina.set(key, slot);
    const spacing = (post ? loc.width : Math.min(7, loc.depth / count)) / count;
    const x = post ? loc.x - loc.width / 2 + spacing * (slot - .5) : loc.x + loc.width / 2 + 2.8;
    const z = post ? loc.z - loc.depth / 2 + 2.8 : loc.z + (slot - (count + 1) / 2) * spacing;
    const machine = crearModeloMaquina(THREE, maquina.tipo || { tipo_clave: maquina.tipo_clave }, tokens['--sc-mach'], tokens['--dx-ui-cyan']);
    machine.traverse(obj => { if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; } });
    machine.position.set(x, .3, z);
    machine.scale.setScalar(post ? Math.min(.42, spacing / 7) : Math.min(.5, spacing / 6.5));
    if (maquina.estado !== 'disponible') machine.traverse(obj => {
      if (obj.isMesh) { obj.material.transparent = true; obj.material.opacity = .38; }
    });
    const machineCategory = model.bahias.find(item => item.id === maquina.bahia_id)?.categoria || 'general';
    machine.traverse(obj => { if (obj.isMesh) { obj.userData.kind = 'maquina'; obj.userData.datum = maquina; obj.userData.category = machineCategory; targets.push(obj); } });
    if (maquina.asignaciones.length) machine.traverse(obj => { if (obj.material?.name === 'machineBody') { obj.material.emissive.set(tokens['--dx-ui-cyan']); obj.material.emissiveIntensity = .4; } });
    machine.userData = { kind: 'maquina', datum: maquina, category: machineCategory };
    root.add(machine);
    addLabel(`${maquina.nombre}${maquina.asignaciones.length ? ' · en uso' : ''}`, x, 5, z, machine.userData.category);
  });

  model.personas.forEach((persona, index) => {
    const assignment = persona.estado === 'ausente' ? null : persona.asignaciones[0];
    const bay = model.bahias.find(item => item.puestos.some(p => p.id === assignment?.puesto_id));
    const pos = bay ? layout.posicionesBahia[bay.id] : null;
    const x = pos ? pos.x : 0;
    const z = pos ? pos.z : layout.profundidad / 2 - 3;
    const group = new THREE.Group();
    const colorToken = persona.especialidad?.toLowerCase().includes('sold') ? '--sk-sold' : persona.especialidad?.toLowerCase().includes('hidr') ? '--sk-hid' : persona.especialidad?.toLowerCase().includes('mec') ? '--sk-mec' : '--sc-idle';
    const color = tokens[colorToken];
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(.32, .4, 1.15, 12), mat(color, persona.estado === 'ausente' ? .35 : 1, colorToken));
    torso.position.y = .95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.27, 12, 8), mat(tokens['--dx-ui-amber-fg'], persona.asignaciones.length ? 1 : .45));
    head.position.y = 1.75;
    group.add(torso, head);
    const idleX = layout.limites.maxX + 7 + (index % 2) * 2.4;
    const idleZ = -8 + Math.floor(index / 2) * 2.2;
    const targetX = assignment ? x + ((index % 3) - 1) * 1.5 : idleX;
    const targetZ = assignment ? z + Math.floor(index / 3) * 1.6 : idleZ;
    group.position.set(reduced ? targetX : idleX, 0, reduced ? targetZ : idleZ);
    if (persona.estado === 'ausente') group.scale.y = .55;
    group.userData = { kind: 'persona', datum: persona, category: 'personas' };
    targets.push(torso, head);
    root.add(group);
    walkingFigures.push({ group, targetX, targetZ, beam: null, persona, active: Boolean(assignment), conflict: Boolean(bay?.conflicto) });
    addLabel(`${persona.nombre}${assignment ? ' · en tarea' : ''}`, group.position.x, 2.8, group.position.z, 'personas');
  });

  const busyCount = model.personas.filter(persona => persona.estado !== 'ausente' && persona.asignaciones.length > 0).length;
  const waiting = box(9, .12, 22, mat(tokens['--sc-pad'], .9, '--sc-pad'), layout.limites.maxX + 11, .06, 0);
  waiting.userData.noRay = true; root.add(waiting);
  addLabel(`Personal · ${busyCount} de ${model.personas.length} en tarea`, layout.limites.maxX + 11, .8, -12, 'personas');

  model.bahias.forEach(bahia => {
    const pos = layout.posicionesBahia[bahia.id];
    if (!pos) return;
    const asignacionesOT = [...new Map(bahia.asignaciones.map(item => [item.ot_id, item])).values()];
    asignacionesOT.forEach((asignacion, index) => {
      const ot = bahia.ots.find(item => item.id === asignacion.ot_id);
      if (!ot) return;
      const slotWidth = pos.width / Math.max(1, asignacionesOT.length);
      const x = pos.x - pos.width / 2 + slotWidth * (index + .5);
      const types = resolverIlustracionOT(ot);
      if (types.equipo === 'cil' && !types.equipoGenerico) {
        const cylinder = crearModeloComponenteCliente(THREE, types.componente, true);
        cylinder.position.set(x - 1, .3, pos.z + .6);
        cylinder.scale.setScalar(Math.min(1.05, slotWidth / 8.4));
        cylinder.userData = { kind: 'componentes', datum: { ot, bahia }, category: bahia.categoria || 'general' };
        cylinder.traverse(obj => { if (obj.isMesh) { obj.userData.kind = 'equipo'; obj.userData.datum = { ot, bahia }; targets.push(obj); } });
        root.add(cylinder);
      } else {
        const equipment = crearModeloEquipoCliente(THREE, types.equipo);
        equipment.position.set(x, .3, pos.z + .9);
        equipment.rotation.y = types.equipo === 'exc' ? 0 : Math.PI;
        equipment.scale.setScalar(Math.min(.82, slotWidth / 6.6));
        equipment.userData = { kind: 'equipos', datum: { ot, bahia }, category: bahia.categoria || 'general' };
        equipment.traverse(obj => { if (obj.isMesh) { obj.userData.kind = 'equipo'; obj.userData.datum = { ot, bahia }; obj.userData.category = bahia.categoria || 'general'; targets.push(obj); } });
        root.add(equipment);
      }
      if (types.componente !== 'generico' || types.componenteGenerico) {
        if (types.equipo !== 'cil' || types.equipoGenerico) {
          const bench = new THREE.Group();
          bench.add(box(3.4,.9,2.8,mat('#3A4B66'),0,.45,0));
          const component = crearModeloComponenteCliente(THREE, types.componente);
          component.position.set(0,.9,0); component.scale.setScalar(.58); bench.add(component);
          bench.position.set(x + slotWidth * .3,.3,pos.z + pos.depth / 2 - 2.6);
          bench.userData = { kind: 'componentes', datum: { ot, bahia }, category: bahia.categoria || 'general' };
          bench.traverse(obj => { if (obj.isMesh && !obj.userData.noRay) { obj.userData.kind = 'componente'; obj.userData.datum = { ot, bahia }; targets.push(obj); } });
          root.add(bench);
        }
      }
      addLabel(`OT ${ot.numero || ot.id} · ${types.componenteGenerico ? 'ilustración genérica' : types.componente}`, x, 4.8, pos.z, bahia.categoria || 'general');
    });
  });

  walkingFigures.forEach(figure => {
    if (!figure.active) return;
    const positions = new Float32Array([figure.group.position.x, 1.7, figure.group.position.z, figure.targetX, .25, figure.targetZ]);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: figure.conflict ? tokens['--dx-ui-red-fg'] : tokens['--dx-ui-cyan'], transparent: true, opacity: .9 });
    const beam = new THREE.Line(geometry, material); beam.userData.noRay = true; root.add(beam); figure.beam = beam;
  });

  (model.paredDias || []).forEach((day, index) => {
    const colorToken = CATEGORIA[colorUtilizacion(day.utilizacion)];
    const height = .5 + day.utilizacion * 7;
    const dayMaterial = mat(tokens[colorToken], 1, colorToken);
    dayMaterial.emissive.set(day.fecha === model.fecha ? tokens[colorToken] : '#000000');
    dayMaterial.emissiveIntensity = day.fecha === model.fecha ? .9 : .08;
    const bar = box(1.7, height, 1.7, dayMaterial, -12 + index * 2.4, height / 2, layout.profundidad / 2 - 3);
    addTarget(bar, 'dia', day, 'dias');
  });

  const applyFrame = aspect => {
    const fit = calcularEncuadre(layout.limites, aspect || 1, camera.fov);
    controls.target.set(fit.x, 0, fit.z);
    camera.position.set(fit.x + fit.distance * Math.sin(fit.azimuth) * Math.cos(fit.elevation), fit.distance * Math.sin(fit.elevation), fit.z + fit.distance * Math.cos(fit.azimuth) * Math.cos(fit.elevation));
    controls.minDistance = fit.minDistance; controls.maxDistance = fit.maxDistance;
    controls.minPolarAngle = .26; controls.maxPolarAngle = 1.38;
    controls.update(); render();
  };
  applyFrame(1);
  controls.enableDamping = false;
  controls.enableZoom = false;
  renderer.domElement.style.touchAction = 'pan-y';
  controls.addEventListener('change', render);
  host.appendChild(renderer.domElement);
  const resize = new ResizeObserver(entries => {
    const { width, height } = entries[0].contentRect;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    applyFrame(camera.aspect);
    render();
  });
  resize.observe(host);
  const animate = () => {
    if (!visible || reduced) return;
    controls.update();
    const tick = performance.now() / 240;
    sparks.forEach(item => { item.position.y = item.userData.sparkBase + Math.abs(Math.sin(tick + item.userData.spark * 1.7)) * .9; });
    bayIndicators.forEach(item => { item.material.opacity = .55 + Math.sin(tick * 1.4) * .4; item.material.transparent = true; });
    walkingFigures.forEach(figure => {
      figure.group.position.x += (figure.targetX - figure.group.position.x) * .035;
      figure.group.position.z += (figure.targetZ - figure.group.position.z) * .035;
      if (figure.beam) {
        const points = figure.beam.geometry.attributes.position;
        points.setXYZ(0, figure.group.position.x, 1.7, figure.group.position.z);
        points.setXYZ(1, figure.targetX, .25, figure.targetZ);
        points.needsUpdate = true;
      }
    });
    render();
    raf = requestAnimationFrame(animate);
  };
  const visibility = () => {
    visible = !document.hidden;
    cancelAnimationFrame(raf);
    if (visible && !reduced) raf = requestAnimationFrame(animate);
  };
  document.addEventListener('visibilitychange', visibility);
  if (visible && !reduced) raf = requestAnimationFrame(animate);
  const keyboard = event => {
    if (event.key === '+' || event.key === '=') zoomView(2);
    else if (event.key === '-') zoomView(-2);
    else if (event.key === 'ArrowLeft') controls.rotateLeft(.12);
    else if (event.key === 'ArrowRight') controls.rotateLeft(-.12);
    else if (event.key === 'ArrowUp') controls.rotateUp(.12);
    else if (event.key === 'ArrowDown') controls.rotateUp(-.12);
    else return;
    event.preventDefault();
    controls.update();
    render();
  };
  function moveView(direction, amount = 1) {
    const offset = camera.position.clone().sub(controls.target);
    const step = calcularVectorPaneo(Math.atan2(offset.x, offset.z), direction, amount);
    const next = limitarPaneo(controls.target.x + step.x, controls.target.z + step.z, layout.limites);
    const dx = next.x - controls.target.x;
    const dz = next.z - controls.target.z;
    controls.target.x = next.x;
    controls.target.z = next.z;
    camera.position.x += dx;
    camera.position.z += dz;
    controls.update();
    render();
  }
  function zoomView(amount = 1) {
    const offset = camera.position.clone().sub(controls.target);
    const distance = calcularDistanciaZoom(offset.length(), amount, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(offset.setLength(distance));
    controls.update();
    render();
  }
  renderer.domElement.addEventListener('keydown', keyboard);
  const wheel = event => {
    if (!event.ctrlKey && !event.metaKey) { opciones.onZoomHint?.(); return; }
    event.preventDefault();
    const direction = event.deltaY > 0 ? 2 : -2;
    const offset = camera.position.clone().sub(controls.target);
    const distance = calcularDistanciaZoom(camera.position.distanceTo(controls.target), direction > 0 ? -2 : 2, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(offset.setLength(distance)); render();
  };
  renderer.domElement.addEventListener('wheel', wheel, { passive: false });
  let tooltip;
  const pointerMove = event => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(targets, false).find(item => !item.object.userData.noRay);
    if (!hit) { opciones.onTooltip?.(null); return; }
    const data = hit.object.userData.datum || hit.object.parent?.userData.datum;
    const kind = hit.object.userData.kind || hit.object.parent?.userData.kind;
    if (data) opciones.onTooltip?.({ kind, data, x: event.clientX - rect.left, y: event.clientY - rect.top });
  };
  let press = null;
  const pointerDown = event => { press = { x: event.clientX, y: event.clientY }; };
  const pointerUp = event => {
    if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) { press = null; return; }
    press = null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(targets, false).find(item => !item.object.userData.noRay);
    if (!hit) return;
    const datum = hit.object.userData.datum || hit.object.parent?.userData.datum;
    const kind = hit.object.userData.kind || hit.object.parent?.userData.kind;
    if (datum) opciones.onSelect?.({ kind, data: datum });
  };
  const keySelect = event => { if (event.key === 'Escape') opciones.onSelect?.(null); };
  const pointerLeave = () => opciones.onTooltip?.(null);
  renderer.domElement.addEventListener('pointerdown', pointerDown);
  renderer.domElement.addEventListener('pointerup', pointerUp);
  renderer.domElement.addEventListener('keydown', keySelect);
  renderer.domElement.addEventListener('pointermove', pointerMove);
  renderer.domElement.addEventListener('pointerleave', pointerLeave);
  render();

  return {
    renderer,
    moveView,
    zoomView,
    centerView() { applyFrame(camera.aspect); },
    setLayers(next) {
      Object.assign(layerState.categorias, next.categorias || {});
      Object.assign(layerState.objetos, next.objetos || {});
      root.children.forEach(child => {
        const kind = child.userData.kind || child.parent?.userData.kind;
        const category = child.userData.category || child.parent?.userData.category;
        const objectVisible = kind === 'maquina' ? layerState.objetos.maquinas : kind === 'persona' ? layerState.objetos.personas : kind === 'componentes' ? layerState.objetos.componentes : kind === 'equipos' ? layerState.objetos.equipos : true;
        child.visible = objectVisible && layerState.categorias[category] !== false;
      });
      render();
    },
    setLabels(value) { labels = value; textObjects.forEach(item => { item.visible = labels; }); renderer.domElement.dataset.labels = String(labels); render(); },
    updateTheme(nextTokens) {
      if (floor.material.userData.themeToken) floor.material.color.set(nextTokens['--sc-floor']);
      backdrop.material.uniforms.top.value.set('#000000'); backdrop.material.uniforms.bottom.value.set('#000000');
      root.traverse(child => {
        if (child.material?.userData?.themeToken) child.material.color.set(nextTokens[child.material.userData.themeToken]);
        if (child.material?.name === 'machineBody' && child.material.emissiveIntensity) child.material.emissive.set(nextTokens['--dx-ui-cyan']);
        if (child.userData.labelCanvas) {
          const context = child.userData.labelCanvas.getContext('2d');
          context.clearRect(0, 0, 512, 96);
          context.fillStyle = '#F8FAFC';
          context.strokeStyle = '#000000';
          context.lineWidth = 8;
          context.lineJoin = 'round';
          context.font = '600 34px sans-serif';
          context.textAlign = 'center';
          context.strokeText(child.userData.labelText, 256, 60);
          context.fillText(child.userData.labelText, 256, 60);
          child.material.map.needsUpdate = true;
        }
      });
      render();
    },
    setSelection(selection) {
      selectedTargets.forEach(({ material, color, intensity }) => { material.emissive.copy(color); material.emissiveIntensity = intensity; });
      selectedTargets = [];
      if (!selection) { render(); return; }
      const selected = selection.data?.ot || selection.data;
      const seenMaterials = new Set();
      targets.forEach(target => {
        const datum = target.userData.datum;
        const related = datum?.ot || datum;
        if (!related || (selected?.id && related.id !== selected.id)) return;
        const materials = Array.isArray(target.material) ? target.material : [target.material];
        materials.forEach(material => {
          if (!material?.emissive || !material.emissive.isColor || seenMaterials.has(material)) return;
          seenMaterials.add(material);
          selectedTargets.push({ material, color: material.emissive.clone(), intensity: material.emissiveIntensity || 0 });
          material.emissive.set(tokens['--dx-ui-cyan']); material.emissiveIntensity = .55;
        });
      });
      render();
    },
    dispose() {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', visibility);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerleave', pointerLeave);
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('keydown', keySelect);
      renderer.domElement.removeEventListener('keydown', keyboard);
      renderer.domElement.removeEventListener('wheel', wheel);
      resize.disconnect();
      controls.removeEventListener('change', render);
      controls.dispose();
      root.traverse(child => {
        child.geometry?.dispose();
        (Array.isArray(child.material) ? child.material : [child.material]).filter(Boolean).forEach(material => {
          material.map?.dispose();
          material.dispose();
        });
      });
      scene.clear();
      backdrop.geometry.dispose(); backdrop.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
