import { calcularEncuadre, colorUtilizacion, crearLayout } from './sceneModel.js';
import { crearModeloMaquina } from './machineBuilders.js';

const TOKENS = {
  '--dx-ui-green-fg': '#14633A', '--dx-ui-amber-fg': '#8A4B00', '--dx-ui-red-fg': '#B42318',
  '--dx-ui-cyan': '#00ACC1', '--dx-ui-ink': '#1F2937', '--dx-ui-card': '#FFFFFF',
  '--dx-ui-line': '#E4E7EB', '--dx-ui-gray': '#6B7280', '--dx-ui-navy': '#1A2B4A',
};
const CATEGORIA = { green: '--dx-ui-green-fg', amber: '--dx-ui-amber-fg', red: '--dx-ui-red-fg' };

export function leerTokens(element) {
  const style = getComputedStyle(element);
  return Object.fromEntries(Object.entries(TOKENS).map(([name, fallback]) => [name, style.getPropertyValue(name).trim() || fallback]));
}

export function crearEscena(THREE, OrbitControls, host, model, tokens, opciones = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (error) {
    opciones.onError?.(error);
    return null;
  }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 500);
  const controls = new OrbitControls(camera, renderer.domElement);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const layout = crearLayout(model.bahias, model.puestos);
  const root = new THREE.Group();
  const targets = [];
  const textObjects = [];
  const render = () => renderer.render(scene, camera);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0;
  let visible = !document.hidden;
  let labels = false;
  const layerState = { categorias: {}, objetos: { maquinas: true, personas: true, componentes: true } };

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.domElement.setAttribute('aria-label', 'Vista tridimensional del taller. Usa las flechas para girar y más o menos para acercar.');
  renderer.domElement.tabIndex = 0;
  renderer.domElement.className = 'dx-planner-3d-canvas';
  scene.add(new THREE.HemisphereLight(0xffffff, 0x56627a, 1.5));
  const light = new THREE.DirectionalLight(0xffffff, 1.05);
  light.position.set(-25, 40, 30);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.left = -layout.ancho / 2; light.shadow.camera.right = layout.ancho / 2;
  light.shadow.camera.top = layout.profundidad / 2; light.shadow.camera.bottom = -layout.profundidad / 2;
  light.shadow.camera.near = 1; light.shadow.camera.far = 100;
  scene.add(light);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
  const floor = box(layout.ancho, .4, layout.profundidad, mat(tokens['--dx-ui-card'], 1, '--dx-ui-card'), 0, -.3, 0);
  floor.userData.noRay = true;
  floor.receiveShadow = true;
  root.add(floor);
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
    context.fillStyle = tokens['--dx-ui-ink'];
    context.font = '600 34px sans-serif';
    context.textAlign = 'center';
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
    const tint = tokens[bahia.horas ? CATEGORIA[colorUtilizacion(bahia.utilizacion)] : '--dx-ui-gray'];
    const token = CATEGORIA[colorUtilizacion(bahia.utilizacion)];
    const zone = box(pos.width, .14, pos.depth, mat(tint, bahia.horas ? .22 : .1, bahia.horas ? token : '--dx-ui-gray'), pos.x, .02, pos.z);
    addTarget(zone, 'bahia', bahia, bahia.categoria || 'general');
    addLabel(`${bahia.nombre} · ${Math.round(bahia.utilizacion * 100)}%`, pos.x, 3.2, pos.z - pos.depth / 2 + .6, bahia.categoria || 'general');
    const outlineMaterial = new THREE.LineBasicMaterial({ color: tint });
    outlineMaterial.userData.themeToken = bahia.horas ? token : '--dx-ui-gray';
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(pos.width, .18, pos.depth)), outlineMaterial);
    outline.raycast = () => {};
    outline.position.set(pos.x, .1, pos.z);
    outline.userData.category = bahia.categoria || 'general';
    root.add(outline);
    bahia.puestos.forEach(puesto => {
      const p = layout.posicionesPuesto[puesto.id];
      if (!p) return;
      const pad = box(p.width, .18, p.depth, mat(tokens['--dx-ui-line'], 1, '--dx-ui-line'), p.x, .13, p.z);
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
    const machine = crearModeloMaquina(THREE, maquina.tipo || { tipo_clave: maquina.tipo_clave }, undefined, tokens['--dx-ui-cyan']);
    machine.traverse(obj => { if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; } });
    machine.position.set(x, .3, z);
    machine.scale.setScalar(post ? Math.min(.42, spacing / 7) : Math.min(.5, spacing / 6.5));
    if (maquina.estado !== 'disponible') machine.traverse(obj => {
      if (obj.isMesh) { obj.material.transparent = true; obj.material.opacity = .38; }
    });
    machine.traverse(obj => { if (obj.isMesh) targets.push(obj); });
    machine.userData = { kind: 'maquina', datum: maquina, category: model.bahias.find(item => item.id === maquina.bahia_id)?.categoria || 'general' };
    root.add(machine);
    addLabel(maquina.nombre, x, 5, z, machine.userData.category);
  });

  model.personas.forEach((persona, index) => {
    const assignment = persona.asignaciones[0];
    const bay = model.bahias.find(item => item.puestos.some(p => p.id === assignment?.puesto_id));
    const pos = bay ? layout.posicionesBahia[bay.id] : null;
    const x = pos ? pos.x : 0;
    const z = pos ? pos.z : layout.profundidad / 2 - 3;
    const group = new THREE.Group();
    const color = persona.asignaciones.length ? tokens['--dx-ui-cyan'] : tokens['--dx-ui-gray'];
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(.32, .4, 1.15, 12), mat(color, persona.asignaciones.length ? 1 : .45));
    torso.position.y = .95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.27, 12, 8), mat(tokens['--dx-ui-amber-fg'], persona.asignaciones.length ? 1 : .45));
    head.position.y = 1.75;
    group.add(torso, head);
    group.position.set(x + ((index % 3) - 1) * 1.5, 0, z + Math.floor(index / 3) * 1.6);
    group.userData = { kind: 'persona', datum: persona, category: 'personas' };
    targets.push(torso, head);
    root.add(group);
    addLabel(`${persona.nombre} · ${Math.round(Math.min(1, persona.horas / 8) * 100)}%`, group.position.x, 2.8, group.position.z, 'personas');
  });

  model.bahias.forEach(bahia => {
    const pos = layout.posicionesBahia[bahia.id];
    if (!pos) return;
    bahia.ots.forEach((ot, index) => {
      const x = pos.x - pos.width / 2 + 2 + index * 1.35;
      const component = index % 3 === 0
        ? new THREE.Mesh(new THREE.CylinderGeometry(.46, .46, 2.8, 18), mat(tokens['--dx-ui-cyan']))
        : box(index % 3 === 1 ? 1.8 : 1.1, index % 3 === 1 ? .45 : 1.2, index % 3 === 1 ? 1.2 : .8, mat(index % 3 === 1 ? '#8FB8E8' : '#9AA9BE'));
      component.position.set(x, index % 3 === 0 ? 1.4 : index % 3 === 1 ? .45 : .6, pos.z);
      addTarget(component, 'componente', { ot, bahia }, bahia.categoria || 'general');
    });
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
  controls.enableDamping = !reduced;
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
    render();
    raf = requestAnimationFrame(animate);
  };
  const visibility = () => {
    visible = !document.hidden;
    cancelAnimationFrame(raf);
    if (visible && !reduced) raf = requestAnimationFrame(animate);
  };
  document.addEventListener('visibilitychange', visibility);
  const keyboard = event => {
    if (event.key === '+' || event.key === '=') camera.position.multiplyScalar(.9);
    else if (event.key === '-') camera.position.multiplyScalar(1.1);
    else if (event.key === 'ArrowLeft') controls.rotateLeft(.12);
    else if (event.key === 'ArrowRight') controls.rotateLeft(-.12);
    else if (event.key === 'ArrowUp') controls.rotateUp(.12);
    else if (event.key === 'ArrowDown') controls.rotateUp(-.12);
    else return;
    event.preventDefault();
    controls.update();
    render();
  };
  renderer.domElement.addEventListener('keydown', keyboard);
  const wheel = event => {
    if (!event.ctrlKey && !event.metaKey) { opciones.onZoomHint?.(); return; }
    event.preventDefault();
    const direction = event.deltaY > 0 ? 1.12 : .89;
    const offset = camera.position.clone().sub(controls.target).multiplyScalar(direction);
    const distance = Math.max(controls.minDistance, Math.min(controls.maxDistance, offset.length()));
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
  const pointerLeave = () => opciones.onTooltip?.(null);
  renderer.domElement.addEventListener('pointermove', pointerMove);
  renderer.domElement.addEventListener('pointerleave', pointerLeave);
  render();

  return {
    renderer,
    centerView() { applyFrame(camera.aspect); },
    setLayers(next) {
      Object.assign(layerState.categorias, next.categorias || {});
      Object.assign(layerState.objetos, next.objetos || {});
      root.children.forEach(child => {
        const kind = child.userData.kind || child.parent?.userData.kind;
        const category = child.userData.category || child.parent?.userData.category;
        const objectVisible = kind === 'maquina' ? layerState.objetos.maquinas : kind === 'persona' ? layerState.objetos.personas : kind === 'componente' ? layerState.objetos.componentes : true;
        child.visible = objectVisible && layerState.categorias[category] !== false;
      });
      render();
    },
    setLabels(value) { labels = value; textObjects.forEach(item => { item.visible = labels; }); renderer.domElement.dataset.labels = String(labels); render(); },
    updateTheme(nextTokens) {
      root.traverse(child => {
        if (child.material?.userData?.themeToken) child.material.color.set(nextTokens[child.material.userData.themeToken]);
        if (child.userData.labelCanvas) {
          const context = child.userData.labelCanvas.getContext('2d');
          context.clearRect(0, 0, 512, 96);
          context.fillStyle = nextTokens['--dx-ui-ink'];
          context.font = '600 34px sans-serif';
          context.textAlign = 'center';
          context.fillText(child.userData.labelText, 256, 60);
          child.material.map.needsUpdate = true;
        }
      });
      render();
    },
    dispose() {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', visibility);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerleave', pointerLeave);
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
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
