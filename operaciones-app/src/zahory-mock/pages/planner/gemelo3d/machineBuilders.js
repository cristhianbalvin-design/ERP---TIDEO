const CATEGORIAS = {
  mec: '#00ACC1', rect: '#5B3A8C', corte: '#E08A00', conf: '#8A4B00',
  sold: '#D9822B', trat: '#2563EB', izaje: '#1A2B4A', prue: '#14633A', serv: '#6B7280',
};

function piezas(THREE, grupo, color, piezas) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.24 });
  const metal = new THREE.MeshStandardMaterial({ color: '#9AA9BE', roughness: 0.35, metalness: 0.7 });
  piezas.forEach(([w, h, d, x, y, z, cilindro = false]) => {
    const geometry = cilindro
      ? new THREE.CylinderGeometry(w, w, h, 16)
      : new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geometry, cilindro ? metal : material);
    mesh.position.set(x, y, z);
    grupo.add(mesh);
  });
  return grupo;
}

const DISEÑOS = {
  lathe: [[6, 1, 2.4, 0, .5, 0], [1.4, 2, 2, -2, 2, 0], [1.1, 1.5, 1.2, 2.2, 1.7, 0]],
  cnc: [[5, 3, 3, 0, 1.5, 0], [3, 1.8, .15, 0, 1.8, 1.55], [1, 1.6, .8, 3, 1.8, .8]],
  mill: [[4.5, 1, 3, 0, .5, 0], [1.2, 4, 1.2, 0, 2, -1], [2, 1, 2, 0, 3.5, 0]],
  drill: [[2.5, .5, 2.5, 0, .25, 0], [.35, 4.8, .35, 0, 2.7, -.5, true], [1.6, 1, 1.4, 0, 4.5, -.5]],
  grind: [[5, 1, 2.8, 0, .5, 0], [3, .5, 2, .4, 1.3, 0], [1.8, 2, 1.4, -1.8, 2.2, 0]],
  saw: [[5, .8, 3, 0, .4, 0], [4.2, .2, .2, 0, 1.8, 0, true], [1, 2, 1, 0, 1.3, 0]],
  plasma: [[5.4, .8, 3.2, 0, .4, 0], [4.8, .15, 2.8, 0, .9, 0], [.5, 1.6, 3.6, -2.5, 1.6, 0]],
  press: [[4.8, .5, 2, 0, .25, 0], [.7, 4.6, .9, -1.8, 2.5, 0], [.7, 4.6, .9, 1.8, 2.5, 0], [4.6, 1, 1.4, 0, 4.8, 0]],
  roll: [[5, .8, 2.4, 0, .4, 0], [.7, 3.2, 2, -2.4, 1.8, 0], [.55, 3.8, .55, 0, 1.5, 0, true]],
  weld: [[1.8, 2.4, 1.4, 0, 1.2, 0], [.4, 2.5, .4, 1.4, 1.2, 0], [.2, .2, 2, -1.2, 1.8, .5]],
  oven: [[4, 3.2, 3, 0, 1.6, 0], [3, 2.2, .15, 0, 1.7, 1.55], [.35, 1.4, .35, -1, 3.9, -.6]],
  booth: [[4.4, 3.4, .3, 0, 1.7, -1.4], [.3, 3.4, 3, -2.1, 1.7, 0], [.3, 3.4, 3, 2.1, 1.7, 0], [4.4, .3, 3, 0, 3.5, 0]],
  chrome: [[1.3, 2.4, 1.3, 0, 1.2, 0, true], [1.4, 1.8, 1.2, 2.4, .9, 0], [.1, 3.4, .1, 0, 2.7, 0, true]],
  wash: [[4, 1.6, 2.8, 0, .8, 0], [4.1, .3, 2.9, 0, 1.75, 0], [1, .8, .8, 1.2, 2.3, 0]],
  crane: [[.8, 5, .8, -4, 2.5, 0], [.8, 5, .8, 4, 2.5, 0], [9, .9, 1.4, 0, 5.2, 0]],
  jib: [[.5, 5, .5, -1.8, 2.5, 0, true], [4.4, .4, .5, .4, 4.7, 0], [.05, 2, .05, 1.8, 3, 0, true]],
  hoist: [[.4, 4.8, .4, -2.3, 2.4, 0], [.4, 4.8, .4, 2.3, 2.4, 0], [5, .4, .6, 0, 4.8, 0]],
  fork: [[2.2, 1.2, 3.2, 0, 1, -.4], [1.8, 1.6, 1.8, 0, 2.4, -.6], [.2, 3, .2, -.6, 2.2, 1.4]],
  stand: [[.5, 1.8, 2.2, -1.6, .9, 0], [.5, 1.8, 2.2, 1.6, .9, 0], [3.7, .3, .4, 0, 1.5, 0]],
  bench: [[5, 1.6, 3, 0, .9, 0], [3.6, .4, 2.2, 0, 2, 0], [.35, .35, .16, -1.2, 2.4, 1.1, true]],
  cmm: [[3.8, 1, 2.8, 0, .5, 0], [.35, 2.6, .35, -1.8, 2.3, 0], [4, .35, .5, 0, 3.5, 0]],
  compr: [[.9, 3.8, .9, 0, 1.4, 0, true], [1.5, 1.2, 1.3, 0, 2.7, 0], [.3, 1.2, .3, -1.4, .6, 0]],
  generic: [[4, 1.2, 2.4, 0, .6, 0], [.5, 2, .5, -1.5, 2, 0], [2, .4, .4, 0, 3, 0]],
};

export const FAMILIAS_CONSTRUCTOR = Object.keys(DISEÑOS).filter(key => key !== 'generic');

export function resolverConstructor(tipo) {
  const base = tipo?.base_3d || tipo?.tipo_clave;
  return Object.hasOwn(DISEÑOS, base) ? base : 'generic';
}

export function crearModeloMaquina(THREE, tipo, color = CATEGORIAS[tipo?.familia] || '#6B7280', outlineColor = '#CFF7FF') {
  const constructor = resolverConstructor(tipo);
  const group = new THREE.Group();
  piezas(THREE, group, color, DISEÑOS[constructor]);
  const addBox = (w, h, d, x, y, z, tint = '#2B3445') => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: tint, roughness: .72, metalness: .25 }));
    mesh.position.set(x, y, z); group.add(mesh);
  };
  const addCylinder = (r, h, x, y, z, tint = '#9AA9BE') => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), new THREE.MeshStandardMaterial({ color: tint, roughness: .34, metalness: .72 }));
    mesh.position.set(x, y, z); mesh.rotation.z = Math.PI / 2; group.add(mesh);
  };
  const led = '#22D3EE';
  if (['lathe', 'mill', 'drill', 'grind', 'saw', 'cnc', 'cmm'].includes(constructor)) {
    addBox(.16, .16, 1.5, .2, 2.2, 1.45, led); addCylinder(.13, 1.1, -.3, 2.7, -.2, '#DCE6F5'); addBox(.28, .42, .28, 1.35, 2.65, .7, '#E3A72F');
  }
  if (['cnc', 'oven', 'booth', 'wash', 'chrome', 'plasma'].includes(constructor)) { addBox(2.3, 1.5, .12, .1, 1.7, 1.6, '#8FD8E8'); addBox(.12, .18, .12, 1.25, 2.2, 1.7, led); }
  if (['crane', 'jib', 'hoist'].includes(constructor)) { addCylinder(.08, 2.4, 1.1, 3.7, 0, '#2B3445'); addBox(.65, .38, .65, 1.1, 2.25, 0, '#2B3445'); addBox(.9, .18, .9, -1.8, .08, 0, '#2B3445'); }
  if (['fork', 'stand', 'bench', 'compr'].includes(constructor)) { for (const x of [-1.5, 1.5]) addCylinder(.42, .38, x, .48, 1.25, '#2B3445'); addBox(.24, .12, 2.8, 0, .24, 2.3, '#9AA9BE'); }
  if (['press', 'roll', 'plasma'].includes(constructor)) { addCylinder(.46, 3.7, -.78, 1.8, .1, '#DCE6F5'); addCylinder(.46, 3.7, .78, 1.8, .1, '#DCE6F5'); addBox(.22, .22, .22, 1.7, 2.3, .8, led); }
  if (['weld', 'booth'].includes(constructor)) { addBox(1.5, .8, 1.3, -1.6, .5, -.4, '#2B3445'); addCylinder(.1, 1.8, 1.4, 1.8, .5, '#9AA9BE'); addBox(.22, .18, .16, 0, 2.7, 1.35, '#FFA94D'); }
  if (typeof THREE.EdgesGeometry === 'function' && typeof group.traverse === 'function') group.traverse(mesh => {
    if (!mesh.isMesh || mesh.userData.noEdge) return;
    const lineMaterial = new THREE.LineBasicMaterial({ color: outlineColor, transparent: true, opacity: .78 });
    lineMaterial.userData.themeToken = '--dx-ui-cyan';
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), lineMaterial);
    edge.userData.noRay = true; if (typeof mesh.add === 'function') mesh.add(edge);
  });
  group.userData.constructorMaquina = constructor;
  return group;
}

export { CATEGORIAS as COLORES_FAMILIA };
