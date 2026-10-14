const CATEGORIAS = {
  mec: '#00ACC1', rect: '#5B3A8C', corte: '#E08A00', conf: '#8A4B00',
  sold: '#D9822B', trat: '#2563EB', izaje: '#1A2B4A', prue: '#14633A', serv: '#6B7280',
};

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

export function crearModeloMaquina(THREE, tipo, color = '#6F98D6', outlineColor = '#9FEFFA') {
  const constructor = resolverConstructor(tipo);
  const mk = (tint, options = {}) => new THREE.MeshStandardMaterial({ color: tint, roughness: .6, metalness: .25, ...options });
  const box = (w, h, d, material, x, y, z) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); return mesh; };
  const cyl = (r1, r2, h, material, x, y, z, rotation = 0) => { const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 18), material); mesh.position.set(x, y, z); if (rotation && mesh.rotation) mesh.rotation.z = rotation; return mesh; };
  const outl = (group, tint) => { if (typeof group.traverse === 'function') group.traverse(mesh => { if (!mesh.isMesh || mesh.userData.noEdge) return; const line = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: tint })); line.userData.noRay = true; mesh.add(line); }); return group; };
  const m = mk(color, { roughness: .5, metalness: .35 });
  m.name = 'machineBody'; m.userData ||= {}; m.userData.themeToken = '--sc-mach';
  const machModel = (THREE, type, m, base) => {
    var b=base;
    var g=new THREE.Group(),dk=mk('#2B3445',{roughness:.8}),gl=mk('#8FD8E8',{transparent:true,opacity:.5,roughness:.1}),led=mk('#22D3EE',{emissive:0x22D3EE,emissiveIntensity:.8}),wh=mk('#B7C4D6',{metalness:.7,roughness:.3}),w,P=Math.PI/2;
    if(b==='crane'){g.add(box(.8,5,.8,m,-4,2.5,0),box(.8,5,.8,m,4,2.5,0),box(9,.9,1.4,m,0,5.2,0),box(1.2,.6,1.2,dk,1,4.5,0),cyl(.06,.06,2.6,dk,1,3,0),box(.7,.5,.7,dk,1,1.6,0))}
    else if(b==='lathe'){g.add(box(6,1.2,2.4,m,0,.7,0),box(1.6,2.2,2.2,m,-2.2,2.3,0),cyl(.55,.55,.7,dk,-1.2,2.4,0,P),box(1.1,1.4,1.2,m,2.3,1.9,0),box(5,.25,.5,dk,0,1.4,1.1))}
    else if(b==='cnc'){g.add(box(5.6,2.8,3,m,0,1.4,0),box(3.4,1.5,.15,gl,-.5,1.7,1.55),box(1.2,1.6,.8,dk,3.2,1.8,.8),box(1,.4,.1,led,3.2,2.4,1.25))}
    else if(b==='mill'){g.add(box(4.6,1.2,3,dk,0,.6,.1),box(4,.6,2.6,m,0,1.5,.2),box(1.4,4.2,1.4,m,0,2.1,-1.1),box(2,1,2,m,0,3.8,-.3),cyl(.3,.3,1.2,dk,0,3,-.3))}
    else if(b==='drill'){g.add(box(2.4,.5,2.4,dk,0,.25,0),cyl(.35,.35,5,m,0,2.7,-.8),box(1.5,1.1,1.5,m,.2,4.5,-.4),cyl(.15,.15,1.6,dk,.2,3.4,-.4),box(2.2,.35,1.8,dk,0,1.5,0))}
    else if(b==='grind'){g.add(box(5,1.2,2.6,m,0,.6,0),box(3.4,.5,2,dk,.4,1.45,0),box(1.2,2.4,1.2,m,-1.8,2.4,-.6));w=cyl(1.05,1.05,.4,dk,-1.8,3.1,.3);if(w.rotation)w.rotation.x=P;g.add(w)}
    else if(b==='press'){g.add(box(4.8,.5,2,m,0,.25,0),box(.7,4.6,.9,m,-1.8,2.5,0),box(.7,4.6,.9,m,1.8,2.5,0),box(4.6,1,1.4,m,0,4.8,0),cyl(.6,.6,1.8,dk,0,3.6,0),box(3,.5,1.6,dk,0,1,0))}
    else if(b==='roll'){g.add(box(5,.8,2.4,dk,0,.4,0),box(.8,3.4,2.2,m,-2.5,2,0),box(.8,3.4,2.2,m,2.5,2,0),cyl(.55,.55,4.2,wh,-.9,1.6,0,P),cyl(.55,.55,4.2,wh,.9,1.6,0,P),cyl(.55,.55,4.2,wh,0,2.9,0,P))}
    else if(b==='bench'){g.add(box(5,1.6,3,m,0,.9,0),box(3.6,.4,2.2,dk,0,2,0),cyl(.35,.35,.16,mk('#E8F4FA'),-1.2,2.4,1.1,P),cyl(.35,.35,.16,mk('#E8F4FA'),1.2,2.4,1.1,P))}
    else if(b==='weld'){g.add(box(1.8,2.4,1.4,m,0,1.2,0),cyl(.4,.4,2.6,dk,1.5,1.3,0),box(.2,.2,2.2,dk,-1.2,1.8,.7),box(1,.4,.1,led,0,2,.75))}
    else if(b==='plasma'){g.add(box(5.4,.8,3.2,dk,0,.4,0),box(4.8,.15,2.8,m,0,.88,0),box(.5,1.6,3.6,m,-2.5,1.6,0),box(.5,1.6,3.6,m,2.5,1.6,0),box(5.4,.4,.6,m,0,2.4,0),cyl(.12,.12,1,led,.6,1.8,0))}
    else if(b==='oven'){g.add(box(4,3.2,3,m,0,1.6,0),box(3,2.2,.15,dk,0,1.7,1.55),box(.2,.2,1.6,led,1.1,1.7,1.7),cyl(.4,.4,1.4,dk,-1,3.9,-.6))}
    else if(b==='booth'){g.add(box(4.4,3.4,.3,m,0,1.7,-1.4),box(.3,3.4,3,m,-2.1,1.7,0),box(.3,3.4,3,m,2.1,1.7,0),box(4.4,.3,3,m,0,3.5,0),box(3,.15,2,dk,0,.1,.2),box(.6,.2,.1,led,0,3.1,1.3))}
    else if(b==='wash'){g.add(box(4,1.6,2.8,m,0,.8,0),box(4.1,.3,2.9,dk,0,1.75,0),box(1,.8,.8,dk,1.2,2.3,0),cyl(.1,.1,1.2,mk('#E8F4FA'),-1.2,2.5,0))}
    else if(b==='chrome'){var tm=mk('#7FD6E6',{transparent:true,opacity:.6,roughness:.2,metalness:.4});g.add(cyl(1.5,1.5,2.4,tm,0,1.2,0),box(1.4,1.8,1.2,m,2.8,.9,0),cyl(.1,.1,3.4,mk('#E8F4FA',{metalness:.9,roughness:.15}),0,2.7,0))}
    else if(b==='jib'){g.add(cyl(.45,.45,5,m,-1.8,2.5,0),box(.9,.3,.9,dk,-1.8,.15,0),box(4.4,.4,.5,m,.4,4.7,0),box(.7,.6,.7,dk,1.8,4.2,0),cyl(.05,.05,2,dk,1.8,3,0),box(.35,.35,.35,dk,1.8,1.9,0))}
    else if(b==='hoist'){g.add(box(.4,4.8,.4,m,-2.3,2.4,0),box(.4,4.8,.4,m,2.3,2.4,0),box(5,.4,.6,m,0,4.8,0),box(1,.7,1,dk,.5,4.2,0),cyl(.05,.05,2,dk,.5,3,0),box(.4,.5,.4,dk,.5,1.9,0))}
    else if(b==='fork'){g.add(box(2.2,1.2,3.2,m,0,1,-.4),box(1.8,1.6,1.8,gl,0,2.4,-.6),box(.2,3,.2,dk,-.6,2.2,1.4),box(.2,3,.2,dk,.6,2.2,1.4),box(.35,.2,2.4,dk,-.5,.5,2.6),box(.35,.2,2.4,dk,.5,.5,2.6),cyl(.5,.5,.4,dk,-1.2,.5,-1.2,P),cyl(.5,.5,.4,dk,1.2,.5,-1.2,P))}
    else if(b==='stand'){g.add(box(.5,1.8,2.2,m,-1.6,.9,0),box(.5,1.8,2.2,m,1.6,.9,0),box(3.7,.3,.4,dk,0,1.5,0),box(1.6,.2,1,dk,-1.6,1.9,0),box(1.6,.2,1,dk,1.6,1.9,0))}
    else if(b==='cmm'){g.add(box(3.8,1,2.8,dk,0,.5,0),box(.35,2.6,.35,m,-1.8,2.3,0),box(.35,2.6,.35,m,1.8,2.3,0),box(4,.35,.5,m,0,3.5,0),cyl(.08,.08,1.4,led,0,2.7,0),box(1.2,1.2,.1,gl,2.9,1.2,.6))}
    else if(b==='compr'){g.add(cyl(.9,.9,3.8,m,0,1.4,0,P),box(1.5,1.2,1.3,dk,0,2.7,0),box(.3,1.2,1.4,dk,-1.4,.6,0),box(.3,1.2,1.4,dk,1.4,.6,0),cyl(.2,.2,.6,led,1.6,2.2,.6))}
    else{g.add(box(5,.9,2,m,0,.45,0),box(.5,2.4,.5,m,-1.8,2,-.5),box(.5,.5,2.4,m,-1.8,3.1,.4));w=cyl(1.3,1.3,.12,dk,0,2.2,.5);if(w.rotation)w.rotation.x=P;g.add(w)}
    return g;  };
  const group = outl(machModel(THREE, tipo?.tipo_clave, m, constructor), outlineColor);
  group.userData.constructorMaquina = constructor;
  return group;
}

export { CATEGORIAS as COLORES_FAMILIA };
