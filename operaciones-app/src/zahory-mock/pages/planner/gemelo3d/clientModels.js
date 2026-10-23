const makeTools = THREE => {
  const mk = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .6, metalness: .25, ...options });
  const box = (w,h,d,material,x=0,y=0,z=0) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material); mesh.position.set(x,y,z); return mesh; };
  const cyl = (r1,r2,h,material,x=0,y=0,z=0,rot=0) => { const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,18),material); mesh.position.set(x,y,z); if(rot) mesh.rotation.z=rot; return mesh; };
  const outl = (group,color) => { group.traverse(mesh => { if(mesh.isMesh&&!mesh.userData.noEdge){const edge=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color}));edge.userData.noRay=true;mesh.add(edge);} }); return group; };
  return { mk, box, cyl, outl };
};
export function crearModeloEquipoCliente(THREE, type = 'generico') {
  const {mk,box,cyl}=makeTools(THREE);
  const equip = type => {
    var g=new THREE.Group(),yel=mk('#E3A72F'),dk=mk('#2B3445',{roughness:.9}),st=mk('#9AA9BE'),or=mk('#D9822B'),bl=mk('#3FA7C4');
    if(type==='exc'){g.add(box(2.4,.7,5.2,dk,-1.7,.35,0),box(2.4,.7,5.2,dk,1.7,.35,0),box(4.8,1.2,3.6,yel,0,1.3,0),box(2,1.6,2,yel,.8,2.7,.9),box(.7,.7,5.5,yel,0,2.2,-3.6),box(.6,2.8,.6,st,0,1.2,-6.1),box(1.8,1.2,1.4,st,0,.2,-6.9))}
    else if(type==='carg'){g.add(box(4.2,1.8,6,yel,0,1.5,0),box(3,1.8,2.6,yel,0,3.2,1),cyl(1.1,1.1,.8,dk,-2.2,1.1,2,Math.PI/2),cyl(1.1,1.1,.8,dk,2.2,1.1,2,Math.PI/2),cyl(1.1,1.1,.8,dk,-2.2,1.1,-2,Math.PI/2),cyl(1.1,1.1,.8,dk,2.2,1.1,-2,Math.PI/2),box(4.6,1.4,1.6,st,0,.9,-4))}
    else if(type==='cuch'){g.add(box(4.2,.4,3,st,0,.4,0),box(4.2,1.6,.4,st,0,1.2,-1.4),box(.4,1.6,3,st,-2,1.2,0),box(.4,1.6,3,st,2,1.2,0))}
    else if(type==='volq'){g.add(box(3.4,1,8,dk,0,1.1,0),box(3.4,2.2,3.4,or,0,2.6,-3),box(3.2,2.2,4.4,st,0,2.5,1.6),cyl(.9,.9,.7,dk,-1.8,.9,2.6,Math.PI/2),cyl(.9,.9,.7,dk,1.8,.9,2.6,Math.PI/2),cyl(.9,.9,.7,dk,-1.8,.9,-2.6,Math.PI/2),cyl(.9,.9,.7,dk,1.8,.9,-2.6,Math.PI/2))}
    else if(type==='cil'){g.add(cyl(.7,.7,7,st,0,1.2,0,Math.PI/2),cyl(.35,.35,3,mk('#D7DEE9'),4.6,1.2,0,Math.PI/2),box(1.6,1.2,1.6,dk,-2,.6,0),box(1.6,1.2,1.6,dk,2,.6,0))}
    else{g.add(box(4.6,1.6,2.4,bl,0,1.2,0),cyl(1,1,4.2,st,0,3,0,Math.PI/2),cyl(.5,.5,.3,dk,-2.4,.5,1.4,Math.PI/2),cyl(.5,.5,.3,dk,2.4,.5,1.4,Math.PI/2))}
    return g;  };
  return equip(type);
}
export function crearModeloComponenteCliente(THREE, code = 'generico', solo = false) {
  const {mk,box,cyl,outl}=makeTools(THREE);
  const compModel = (code,solo) => {
    var g=new THREE.Group(),st=mk('#DCE6F5',{roughness:.3,metalness:.8}),dk=mk('#4B5C78',{roughness:.6,metalness:.4}),ac=mk('#8FB8E8',{roughness:.35,metalness:.7});
    if(code==='cil'){g.add(cyl(.75,.75,5,st,0,1.3,0,Math.PI/2),cyl(.32,.32,3.6,ac,4.2,1.3,0,Math.PI/2),box(.7,1.5,1.5,dk,-2.7,1.3,0),box(.7,1.5,1.5,dk,2.4,1.3,0));if(solo)g.add(box(1.4,.9,1.8,dk,-1.4,.45,0),box(1.4,.9,1.8,dk,1.4,.45,0))}
    else if(code==='eje'){g.add(cyl(.4,.4,8,st,0,1.1,0,Math.PI/2),cyl(.7,.7,.9,ac,-2,1.1,0,Math.PI/2),cyl(.7,.7,.9,ac,2,1.1,0,Math.PI/2),cyl(.55,.55,.6,ac,-3.4,1.1,0,Math.PI/2),box(1.2,.16,.34,dk,0,1.5,0));if(solo)g.add(box(1.2,.8,1.4,dk,-2.6,.4,0),box(1.2,.8,1.4,dk,2.6,.4,0))}
    else if(code==='bomba'){g.add(box(3.2,2,2.4,st,0,1.2,0),cyl(.95,.95,.7,ac,-1.1,1.2,1.4,Math.PI/2),cyl(.95,.95,.7,ac,1.1,1.2,1.4,Math.PI/2),cyl(.35,.35,1.6,dk,-1.2,2.8,0),cyl(.35,.35,1.6,dk,1.2,2.8,0),cyl(.3,.3,1.8,dk,2.3,1.2,0,Math.PI/2))}
    else if(code==='reductor'){g.add(box(3.4,2.4,3,st,0,1.3,0),cyl(.42,.42,2.2,ac,-2.8,1.5,0,Math.PI/2),cyl(.6,.6,2,ac,2.7,1,0,Math.PI/2),box(3.8,.3,3.4,dk,0,.15,0),cyl(.3,.3,.6,dk,0,2.7,0))}
    else if(code==='buje'){var r=cyl(.95,.95,1.7,st,0,1.1,0);r.rotation.x=Math.PI/2;var hole=cyl(.55,.55,1.76,dk,0,1.1,0);hole.rotation.x=Math.PI/2;g.add(r,hole);if(solo)g.add(box(2.6,.35,2,dk,0,.17,0))}
    else if(code==='piston'){g.add(cyl(.85,.85,1.3,st,-1.2,1.2,0,Math.PI/2),cyl(.28,.28,3.8,ac,1.4,1.2,0,Math.PI/2),cyl(.9,.9,.14,dk,-1.7,1.2,0,Math.PI/2),cyl(.9,.9,.14,dk,-1.3,1.2,0,Math.PI/2),cyl(.5,.5,.8,dk,3.2,1.2,0))}
    else{g.add(box(1.2,1.5,1.7,st,-1.4,1.2,0),box(3,.6,.6,st,.4,1.65,.7),box(3,.6,.6,st,.4,1.65,-.7),box(3,.6,.6,st,.4,.75,.7),box(3,.6,.6,st,.4,.75,-.7),cyl(.18,.18,2,ac,1.7,1.2,0))}
    return outl(g,0x22D3EE);  };
  return outl(compModel(code,solo),0x22D3EE);
}