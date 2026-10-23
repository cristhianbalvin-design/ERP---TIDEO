// Visor 3D del gemelo del almacén (three.js). Se usa en la vista principal y en la vista previa del editor.
// Recibe el plano, las posiciones y, al colorear, la información de cada posición calculada por la página.
import { huellaRack, MOD_W, NIV_H, RACK_D, USOS, VAR_ESTADO } from './gemeloModelo.js';
import { temaOscuro } from './gemeloTema.js';

export function crearVisor(THREE, OrbitControls, canvas, host, opt = {}) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); } catch { opt.onError?.(); return null; }
  const reducido = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cssVar = n => getComputedStyle(host).getPropertyValue(n).trim() || '#888888';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 600);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reducido; controls.maxPolarAngle = Math.PI / 2.05; controls.minPolarAngle = 0.15;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.1));
  const sol = new THREE.DirectionalLight(0xffffff, 1.4); sol.position.set(10, 30, 15); scene.add(sol);
  const raiz = new THREE.Group(); scene.add(raiz);
  const binGeo = new THREE.BoxGeometry(1, 1, 1);
  const V = { renderer, scene, camera, controls, bins: [], L: null, vistas: {}, anim: null, ruta: null, seleccion: null, pulso: 0, rackEtq: {}, G: null, encuadrado: false };
  V.capas = { estructura: true, zonas: true, etiquetas: true, muros: true, vacias: true, racks: {} };
  V.filtrosOff = new Set();
  V.info = new Map();
  V.modo = 'estado';
  V.resaltados = null;

  function etiqueta(texto, x, y, z, tam = 1) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
    g.font = '700 52px "DM Sans", sans-serif'; const w = Math.min(500, g.measureText(texto).width + 48);
    g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.roundRect ? g.roundRect(256 - w / 2, 22, w, 84, 42) : g.rect(256 - w / 2, 22, w, 84); g.fill();
    g.fillStyle = '#1A2B4A'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(texto, 256, 66);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    s.scale.set(6 * tam, 1.5 * tam, 1); s.position.set(x, y, z); s.renderOrder = 5; return s;
  }
  function limpiar() {
    raiz.traverse(o => { if (o.geometry && o.geometry !== binGeo) o.geometry.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } });
    raiz.clear(); V.bins = []; V.ruta = null; V.rackEtq = {};
  }

  V.construir = (L, posiciones, porcentajeRack = () => 0) => {
    limpiar(); V.L = L;
    const G = { estructura: new THREE.Group(), zonas: new THREE.Group(), etiquetas: new THREE.Group(), muros: new THREE.Group(), posiciones: new THREE.Group() };
    Object.values(G).forEach(g => raiz.add(g)); V.G = G;
    const dark = temaOscuro(host);
    scene.background = new THREE.Color(dark ? 0x0f172a : 0xf8f9fa);
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(L.ancho, L.largo), new THREE.MeshStandardMaterial({ color: dark ? 0x1e293b : 0xffffff }));
    piso.rotation.x = -Math.PI / 2; piso.position.set(L.ancho / 2, 0, L.largo / 2); raiz.add(piso);
    const pts = []; for (let x = 0; x <= L.ancho; x++) pts.push(x, 0.01, 0, x, 0.01, L.largo); for (let z = 0; z <= L.largo; z++) pts.push(0, 0.01, z, L.ancho, 0.01, z);
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    raiz.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: dark ? 0x334155 : 0xd9dee5 })));
    const muroMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.55 });
    const lados = { N: [0, 0, L.ancho, 'x'], S: [0, L.largo, L.ancho, 'x'], O: [0, 0, L.largo, 'z'], E: [L.ancho, 0, L.largo, 'z'] };
    Object.entries(lados).forEach(([k, [x0, z0, len, eje]]) => {
      const puertas = L.puertas.filter(p => p.lado === k);
      const huecos = puertas.map(p => [p.pos, p.pos + p.ancho]).sort((a, b) => a[0] - b[0]);
      let ini = 0; const tramos = []; huecos.forEach(([a, b]) => { if (a > ini) tramos.push([ini, a]); ini = Math.max(ini, b); }); if (ini < len) tramos.push([ini, len]);
      tramos.forEach(([a, b]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(eje === 'x' ? b - a : 0.15, 1.2, eje === 'x' ? 0.15 : b - a), muroMat); m.position.set(eje === 'x' ? (a + b) / 2 : x0, 0.6, eje === 'x' ? z0 : (a + b) / 2); G.muros.add(m); });
      puertas.forEach(p => { const c = p.pos + p.ancho / 2; G.etiquetas.add(etiqueta('Puerta', eje === 'x' ? c : x0 + (k === 'O' ? -0.9 : 0.9), 1.6, eje === 'x' ? z0 + (k === 'N' ? -0.9 : 0.9) : c, 0.7)); });
    });
    L.zonas.forEach(z => {
      const col = new THREE.Color(USOS[z.uso]?.[1] || '#5B3A8C');
      const m = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.h), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(z.x + z.w / 2, 0.02, z.y + z.h / 2); G.zonas.add(m);
      const borde = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(z.w, 0.01, z.h)), new THREE.LineBasicMaterial({ color: col }));
      borde.position.set(z.x + z.w / 2, 0.03, z.y + z.h / 2); G.zonas.add(borde);
      G.etiquetas.add(etiqueta(z.nombre, z.x + z.w / 2, 2.2, z.y + 0.8, 0.85));
    });
    const metal = new THREE.MeshStandardMaterial({ color: 0xe08a00, metalness: 0.3, roughness: 0.6 });
    const balda = new THREE.MeshStandardMaterial({ color: 0x9aa3b2, metalness: 0.2, roughness: 0.7 });
    L.racks.forEach(r => {
      const f = huellaRack(r), alto = r.niv * NIV_H + 0.2;
      for (let m = 0; m <= r.mod; m++) [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, alto, 0.08), metal); const a = m * MOD_W, b = RACK_D / 2 + s * RACK_D / 2; p.position.set(r.rot ? r.x + b : r.x + a, alto / 2, r.rot ? r.y + a : r.y + b); G.estructura.add(p); });
      for (let n = 0; n <= r.niv; n++) { const b = new THREE.Mesh(new THREE.BoxGeometry(f.w, 0.05, f.h), balda); b.position.set(f.x + f.w / 2, n * NIV_H + 0.18, f.y + f.h / 2); G.estructura.add(b); }
      const etq = etiqueta(`Rack ${r.cod} · ${Math.round(porcentajeRack(r) * 100)}%`, f.x + f.w / 2, alto + 0.9, f.y + f.h / 2, 0.8);
      G.etiquetas.add(etq); V.rackEtq[r.id] = etq;
    });
    posiciones.forEach(p => { const mesh = new THREE.Mesh(binGeo, new THREE.MeshStandardMaterial({ roughness: 0.55 })); mesh.userData = { pos: p }; mesh.position.set(p.x, p.y, p.z); G.posiciones.add(mesh); V.bins.push(mesh); });
    V.centro = new THREE.Vector3(L.ancho / 2, 0, L.largo / 2); V.span = Math.max(L.ancho, L.largo * 1.25);
    controls.minDistance = 4; controls.maxDistance = V.span * 3;
    V.recalcularVistas(); V.colorear();
    if (!V.encuadrado) { camera.position.copy(V.vistas.iso.pos); controls.target.copy(V.centro); V.encuadrado = true; }
  };
  V.recalcularVistas = () => {
    if (!V.centro) return; const f = Math.max(1, 1.35 / (camera.aspect || 1)), d = V.span * 1.05 * f;
    V.vistas = { iso: { pos: V.centro.clone().add(new THREE.Vector3(-0.42, 0.72, 1).normalize().multiplyScalar(d)), tgt: V.centro.clone() }, top: { pos: V.centro.clone().add(new THREE.Vector3(0, d * 1.2, 0.5)), tgt: V.centro.clone() } };
  };
  const grad = (t, a, b) => new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t)));
  /** info: Map(cod -> { lleno, estado, valor, dias }) */
  V.colorear = () => {
    const dark = temaOscuro(host);
    const maxV = Math.max(1, ...[...V.info.values()].map(i => i.valor || 0));
    const sel = cssVar('--dx-gem-sel');
    V.bins.forEach(b => {
      const p = b.userData.pos, i = V.info.get(p.cod) || { lleno: false, estado: 'vacio', valor: 0, dias: null };
      b.userData.estado = i.estado; b.userData.lleno = i.lleno;
      let col;
      if (V.modo === 'estado' || !i.lleno) col = new THREE.Color(cssVar(VAR_ESTADO[i.estado]));
      else if (V.modo === 'valor') col = grad(Math.sqrt((i.valor || 0) / maxV), dark ? '#1E3A5F' : '#DCEBFA', dark ? '#60A5FA' : '#1A2B4A');
      else { const d = i.dias ?? 0; col = d <= 30 ? grad(d / 30, '#16A34A', '#E08A00') : grad((d - 30) / 60, '#E08A00', '#DC2626'); }
      b.material.color.copy(col);
      const tenue = V.resaltados && !V.resaltados.has(p.cod);
      b.material.transparent = !i.lleno || Boolean(tenue); b.material.opacity = tenue ? 0.12 : (i.lleno ? 1 : 0.28); b.material.depthWrite = !b.material.transparent;
      b.scale.set(p.w, i.lleno ? p.h : p.h * 0.25, p.d); b.position.y = i.lleno ? p.y : p.y - p.h * 0.35;
      const res = V.resaltados?.has(p.cod) || p.cod === V.seleccion;
      b.material.emissive.set(res ? sel : 0x000000); b.material.emissiveIntensity = res ? 0.7 : 0;
    });
    V.aplicarCapas();
  };
  V.aplicarCapas = () => {
    if (!V.G) return; const s = V.capas;
    ['estructura', 'zonas', 'etiquetas', 'muros'].forEach(k => { V.G[k].visible = s[k]; });
    V.bins.forEach(b => { const p = b.userData.pos; const off = p.rackId && s.racks[p.rackId] === false; b.visible = !off && !(V.modo === 'estado' && V.filtrosOff.has(b.userData.estado)) && (s.vacias || b.userData.lleno); });
  };
  V.ajustar = () => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); V.recalcularVistas(); };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(V.ajustar) : null; ro?.observe(host); V.ajustar();
  V.irA = (p1, t1) => { if (reducido) { camera.position.copy(p1); controls.target.copy(t1); return; } V.anim = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1, t1 }; };
  V.vista = v => V.vistas[v] && V.irA(V.vistas[v].pos.clone(), V.vistas[v].tgt.clone());
  V.volarA = p => { const t = new THREE.Vector3(p.x, p.y, p.z), dir = camera.position.clone().sub(controls.target).normalize(), pos = t.clone().add(dir.multiplyScalar(16)); pos.y = Math.max(pos.y, p.y + 6); V.irA(pos, t); };
  V.limitar = () => { if (!V.L) return; const t = controls.target, ox = t.x, oz = t.z; t.x = Math.max(0, Math.min(V.L.ancho, t.x)); t.z = Math.max(0, Math.min(V.L.largo, t.z)); camera.position.x += t.x - ox; camera.position.z += t.z - oz; };
  V.paneo = (dir, paso) => { const off = camera.position.clone().sub(controls.target); off.y = 0; off.normalize(); const fwd = off.clone().negate(), der = new THREE.Vector3(-fwd.z, 0, fwd.x); const v = dir === 'arriba' ? fwd : dir === 'abajo' ? fwd.negate() : dir === 'der' ? der : der.negate(); v.multiplyScalar(paso); controls.target.add(v); camera.position.add(v); V.limitar(); };
  V.zoom = f => { const off = camera.position.clone().sub(controls.target); const d = Math.max(controls.minDistance, Math.min(controls.maxDistance, off.length() * f)); camera.position.copy(controls.target).add(off.setLength(d)); };
  V.girar = (az, pol) => { const off = camera.position.clone().sub(controls.target); const s = new THREE.Spherical().setFromVector3(off); s.theta += az; s.phi = Math.max(controls.minPolarAngle, Math.min(controls.maxPolarAngle, s.phi + pol)); off.setFromSpherical(s); camera.position.copy(controls.target).add(off); };
  // Ctrl + rueda para acercar: la rueda sola deja hacer scroll a la página (como el Planner)
  const rueda = ev => { if (!ev.ctrlKey && !ev.metaKey) { ev.stopImmediatePropagation(); opt.onZoomHint?.(); } };
  canvas.addEventListener('wheel', rueda, { capture: true });
  controls.addEventListener('change', V.limitar);
  V.mostrarRuta = puntos => {
    if (V.ruta) { V.ruta.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); raiz.remove(V.ruta); V.ruta = null; }
    if (!puntos) return;
    const g = new THREE.Group(), color = cssVar('--dx-gem-sel'), mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
    for (let i = 1; i < puntos.length; i++) { const a = puntos[i - 1], b = puntos[i]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.01) continue; const s = new THREE.Mesh(new THREE.BoxGeometry(len + 0.35, 0.04, 0.35), mat); s.position.set((a[0] + b[0]) / 2, 0.06, (a[1] + b[1]) / 2); s.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]); g.add(s); }
    const mk = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 16), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 }));
    mk.rotation.x = Math.PI; g.add(mk); g.userData = { puntos, mk, t: 0 };
    raiz.add(g); V.ruta = g; V.moverMarcador(reducido ? 1 : 0);
  };
  V.moverMarcador = t => {
    const { puntos, mk } = V.ruta.userData; const segs = []; let tot = 0;
    for (let i = 1; i < puntos.length; i++) { const l = Math.hypot(puntos[i][0] - puntos[i - 1][0], puntos[i][1] - puntos[i - 1][1]); segs.push(l); tot += l; }
    let d = t * tot, i = 0; while (i < segs.length - 1 && d > segs[i]) { d -= segs[i]; i++; }
    const k = segs[i] ? d / segs[i] : 0; const a = puntos[i], b = puntos[i + 1] || a; mk.position.set(a[0] + (b[0] - a[0]) * k, 1.1, a[1] + (b[1] - a[1]) * k);
  };
  V.bajoPuntero = (cx, cy) => {
    const r = canvas.getBoundingClientRect(), ray = new THREE.Raycaster(), ptr = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera); return ray.intersectObjects(V.bins.filter(b => b.visible), false)[0]?.object?.userData.pos || null;
  };
  let raf = 0, activo = true;
  function bucle() {
    if (!activo) return;
    raf = requestAnimationFrame(bucle);
    if (!host.isConnected || !host.offsetParent || document.hidden) return;
    if (V.anim) { V.anim.t = Math.min(1, V.anim.t + 0.045); const k = 1 - Math.pow(1 - V.anim.t, 3); camera.position.lerpVectors(V.anim.p0, V.anim.p1, k); controls.target.lerpVectors(V.anim.t0, V.anim.t1, k); if (V.anim.t >= 1) V.anim = null; }
    if (V.seleccion && !reducido) { V.pulso += 0.08; const b = V.bins.find(x => x.userData.pos.cod === V.seleccion); if (b) b.material.emissiveIntensity = 0.55 + Math.sin(V.pulso) * 0.35; }
    if (V.ruta && !reducido) { V.ruta.userData.t = (V.ruta.userData.t + 0.006) % 1.25; V.moverMarcador(Math.min(1, V.ruta.userData.t)); }
    controls.update(); renderer.render(scene, camera);
  }
  bucle();
  V.dispose = () => {
    activo = false; cancelAnimationFrame(raf); ro?.disconnect();
    canvas.removeEventListener('wheel', rueda, { capture: true });
    controls.removeEventListener('change', V.limitar); controls.dispose();
    limpiar(); binGeo.dispose(); renderer.dispose();
  };
  return V;
}
