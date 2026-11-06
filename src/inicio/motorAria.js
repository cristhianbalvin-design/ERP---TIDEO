import { assets, ojos } from './assets.js';
const A = {
  d_base: assets.base,
  d_blink: assets.blink,
  d_a: assets.a,
  d_o: assets.o,
  d_e: assets.e,
  b_base: assets.robot,
  d_eyes: {
    l: ojos[0],
    r: ojos[1]
  }
};
import { Avatar } from './avatarMotor.js';
export function crearMotor(root, getSteps, abrirAsistente) {
  const $ = (s, r = root) => r.querySelector(s),
    $$ = (s, r = root) => [...r.querySelectorAll(s)];
  const nodes = Object.fromEntries(['heroAv', 'flAv', 'fabAv', 'stage', 'mor', 'fab', 'fl',
    'morH', 'morR', 'morW', 'spot', 'bub', 'bubN', 'bubNx', 'bubSk', 'bubSay']
    .map(id => [id, $('#' + id)]));
  const bst = $('.dxi-bst', nodes.mor), scn = $('.dxi-scn', nodes.mor);
  const hero = new Avatar(nodes.heroAv, 'd'),
    fly = new Avatar(nodes.flAv, 'b'),
    fabA = new Avatar(nodes.fabAv, 'b');
  const all = () => [hero, fly, fabA];
  let place = 'hero',
    KIND = 'd',
    pendingResolve = null,
    destruido = false;
  const timers = new Set(),
    animations = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!destruido) fn();
    }, ms);
    timers.add(id);
    return id;
  };
  const blink = setInterval(() => {
    if (!destruido && Math.random() < .55) all().forEach(a => a.blink());
  }, 1900);
  const move = e => !destruido && all().forEach(av => {
    const r = av.h.getBoundingClientRect();
    if (!r.width) return;
    const n = v => v / Math.sqrt(1 + v * v);
    av.point(n((e.clientX - r.left - r.width / 2) / 240), n((e.clientY - r.top - r.height * .34) / 200));
  });
  window.addEventListener('pointermove', move, {
    passive: true
  });
  let token = 0,
    voice = null,
    timer = null;
  function pickVoice() {
    const v = window.speechSynthesis?.getVoices() || [];
    voice = v.find(x => /^es[-_](PE|419|MX|US|AR|CO|CL)/i.test(x.lang)
      && /female|mujer|sabina|paulina|helena|elvira|dalia|camila|google/i.test(x.name))
      || v.find(x => /^es/i.test(x.lang)) || null;
  }
  if (window.speechSynthesis) {
    pickVoice();
    window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
  }
  function stopSpeech(skipDom = false) {
    if (pendingResolve) {
      pendingResolve();
      pendingResolve = null;
    }
    token++;
    window.speechSynthesis?.cancel();
    cancelAnimationFrame(timer);
    if (!skipDom) all().forEach(a => {
      a.vis(null);
      if (a.h.dataset.s === 'habla') a.state('reposo');
    });
  }
  function words(el, t) {
    el.innerHTML = t.split(' ').map(w => `<span class="dxi-w">${w}</span>`).join(' ');
    return $$('.dxi-w', el);
  }
  function visemeOf(c, n) {
    c = (c || '').toLowerCase();
    if ('aá'.includes(c)) return ['a', 1];
    if ('eéií'.includes(c)) return ['e', .9];
    if ('oóuú'.includes(c)) return ['o', 1];
    if ('mbp'.includes(c)) return [null, 0];
    if (/^[\s\p{P}]$/u.test(c)) return [null, 0];
    return n;
  }
  function speak(av, text, say, el) {
    if (destruido) return Promise.resolve();
    stopSpeech();
    const my = ++token;
    const s = say || text;
    const ws = el ? words(el, text) : [];
    av.state('habla');
    return new Promise(res => {
      pendingResolve = res;
      let idx = 0,
        start = performance.now(),
        useB = false,
        last = ['e', .4],
        lastVisemeAt = -Infinity,
        done = false;
      const cps = 13.5;
      const hasV = window.speechSynthesis && voice;
      const tgt = () => av === hero && place === 'fab' ? fabA : av;
      const end = () => {
        if (destruido || done || my !== token) return;
        done = true;
        pendingResolve = null;
        ws.forEach(w => w.classList.add('dxi-v'));
        tgt().vis(null);
        tgt().state('reposo');
        av.state('reposo');
        res();
      };
      const loop = t => {
        if (destruido || my !== token || done) return;
        idx = useB ? Math.min(s.length - 1, idx + cps / 60) : Math.min(s.length, (t - start) / 1000 * cps);
        if (t - lastVisemeAt >= 90) {
          const v = visemeOf(s[Math.floor(idx)], last);
          if (v[0]) last = v;
          tgt().vis(v[0], v[1]);
          lastVisemeAt = t;
        }
        const nv = Math.ceil(idx / s.length * ws.length);
        ws.forEach((w, i) => w.classList.toggle('dxi-v', i < nv));
        if (!hasV && idx >= s.length) {
          end();
          return;
        }
        timer = requestAnimationFrame(loop);
      };
      if (hasV) {
        const u = new SpeechSynthesisUtterance(s);
        u.voice = voice;
        u.lang = voice.lang;
        u.rate = 1.02;
        u.pitch = 1.08;
        u.onboundary = e => {
          useB = true;
          idx = e.charIndex;
        };
        u.onend = end;
        u.onerror = end;
        window.speechSynthesis.speak(u);
        later(() => {
          if (my === token && !done && !window.speechSynthesis?.speaking) end();
        }, s.length / cps * 1000 + 2500);
      }
      timer = requestAnimationFrame(loop);
    });
  }
  let STEPS = [];
  let st = -1;
  const FS = () => innerWidth < 700 ? 96 : 150;
  function posFly(r) {
    const fs = FS(),
      W = innerWidth,
      H = innerHeight;
    const fl = nodes.fl;
    fl.style.width = fl.style.height = fs + 'px';
    let x, y, bx, by;
    const bw = Math.min(340, W - 24);
    if (W < 760) {
      x = 12;
      y = H - fs - 170;
      bx = 12;
      by = H - 170;
    } else {
      const right = W - r.right > fs + bw + 40,
        left = r.left > fs + bw + 40;
      if (right || left) {
        x = right ? r.right + 16 : r.left - fs - 16;
        y = Math.max(12, Math.min(H - fs - 12, r.top + r.height / 2 - fs / 2));
        bx = right ? x + fs + 6 : x - bw - 6;
        by = Math.max(12, Math.min(H - 190, y));
      } else {
        const below = H - r.bottom > 200;
        y = below ? r.bottom + 14 : Math.max(12, r.top - fs - 14);
        x = Math.max(12, Math.min(W - fs - bw - 30, r.left + 20));
        bx = x + fs + 8;
        by = Math.max(12, Math.min(H - 190, y));
      }
    }
    fl.style.transform = `translate(${x}px,${y}px)`;
    const b = nodes.bub;
    b.style.width = bw + 'px';
    b.style.left = bx + 'px';
    b.style.top = by + 'px';
  }
  async function go(i) {
    if (destruido || !tour || busy || i < 0) return;
    if (i >= STEPS.length) return endTour();
    st = i;
    const s = STEPS[i],
      el = $(s.el);
    if (!el) return go(i + 1);
    el.scrollIntoView({
      block: 'center',
      behavior: 'smooth'
    });
    await wait(450);
    if (destruido || !tour || busy || st !== i) return;
    const r = el.getBoundingClientRect();
    const sp = nodes.spot;
    sp.style.display = 'block';
    Object.assign(sp.style, {
      left: r.left - 6 + 'px',
      top: r.top - 6 + 'px',
      width: r.width + 12 + 'px',
      height: r.height + 12 + 'px'
    });
    posFly(r);
    nodes.bubN.textContent = `${i + 1} de ${STEPS.length}`;
    nodes.bubNx.textContent = i === STEPS.length - 1 ? 'Terminar' : 'Siguiente';
    await speak(fly, s.t, s.s, nodes.bubSay);
  }
  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  let busy = false,
    tour = false,
    tourVersion = 0,
    inView = true;
  const { stage, mor, fab, fl } = nodes;
  const waiting = new Set();
  const wait = ms => new Promise(resolve => {
    if (destruido) return resolve();
    waiting.add(resolve);
    later(() => { waiting.delete(resolve); resolve(); }, ms);
  });
  const T = (x, y, s, rot = 0) => `translate(${x}px,${y}px) scale(${s}) rotate(${rot}deg)`;
  const box = r => ({
    x: r.left,
    y: r.top,
    s: r.width / 300
  });
  async function morph(from, to, toRobot) {
    if (destruido) return () => {};
    const D = reduce ? 1 : 1050,
      hum = nodes.morH,
      rob = nodes.morR;
    hum.src = A[KIND + '_base'];
    rob.src = A.b_base;
    mor.style.display = 'block';
    const a = box(from),
      b = box(to),
      mx = a.x + (b.x - a.x) * .55,
      my = a.y + (b.y - a.y) * .42 - 60,
      ms = a.s + (b.s - a.s) * .55,
      dir = b.x >= a.x ? 1 : -1;
    const main = mor.animate([{
      transform: T(a.x, a.y, a.s),
      easing: 'cubic-bezier(.3,0,.2,1)'
    }, {
      transform: T(a.x, a.y - 34, a.s * 1.05, -2 * dir),
      offset: .2,
      easing: 'cubic-bezier(.4,0,.3,1)'
    }, {
      transform: T(mx, my, ms, 6 * dir),
      offset: .6,
      easing: 'cubic-bezier(.3,.2,.2,1.08)'
    }, {
      transform: T(b.x, b.y, b.s)
    }], {
      duration: D,
      fill: 'forwards'
    });
    const h1 = toRobot ? [1, 1, 0, 0] : [0, 0, 1, 1],
      c1 = toRobot ? ['0%', '0%', '78%', '78%'] : ['78%', '78%', '0%', '0%'];
    const off = [0, .2, .55, 1];
    animations.add(main);
    const fa = hum.animate(off.map((o, i) => ({
      offset: o,
      opacity: h1[i],
      transform: `scale(${h1[i] ? 1 : .86})`
    })), {
      duration: D,
      fill: 'forwards'
    });
    const fb = nodes.morW.animate(off.map((o, i) => ({
      offset: o,
      clipPath: `circle(${c1[i]} at 50% 42%)`
    })), {
      duration: D,
      fill: 'forwards'
    });
    const fc = bst.animate([{
      offset: 0,
      opacity: 0,
      transform: 'scale(.35)'
    }, {
      offset: .22,
      opacity: 0,
      transform: 'scale(.35)'
    }, {
      offset: .36,
      opacity: 1,
      transform: 'scale(.8)'
    }, {
      offset: .6,
      opacity: 0,
      transform: 'scale(1.6)'
    }, {
      offset: 1,
      opacity: 0,
      transform: 'scale(1.6)'
    }], {
      duration: D,
      fill: 'forwards'
    });
    const fd = scn.animate([{
      offset: 0,
      opacity: 0,
      top: '8%'
    }, {
      offset: .2,
      opacity: 0,
      top: '8%'
    }, {
      offset: .26,
      opacity: 1,
      top: '10%'
    }, {
      offset: .52,
      opacity: 1,
      top: '86%'
    }, {
      offset: .58,
      opacity: 0,
      top: '90%'
    }, {
      offset: 1,
      opacity: 0,
      top: '90%'
    }], {
      duration: D,
      fill: 'forwards'
    });
    [fa, fb, fc, fd].forEach(x => animations.add(x));
    try {
      await main.finished;
    } catch {
      return () => {};
    }
    return () => {
      if (destruido) return;
      mor.style.display = 'none';
      [main, fa, fb, fc, fd].forEach(x => {
        animations.delete(x);
        x.cancel();
      });
    };
  }
  async function toFab() {
    if (destruido) return;
    busy = true;
    place = 'moving';
    const r = stage.getBoundingClientRect();
    stage.style.visibility = 'hidden';
    fab.style.visibility = 'hidden';
    fab.style.display = 'block';
    const to = fab.getBoundingClientRect();
    const done = await morph(r, to, true);
    if (destruido) return;
    fab.style.visibility = '';
    done();
    place = 'fab';
    if (hero.h.dataset.s === 'habla') {
      fabA.state('habla');
      hero.vis(null);
    }
    const pulse = fab.animate([{
      transform: 'scale(1)'
    }, {
      transform: 'scale(1.14)'
    }, {
      transform: 'scale(1)'
    }], {
      duration: 320
    });
    animations.add(pulse);
    pulse.finished.then(() => animations.delete(pulse), () => animations.delete(pulse));
    busy = false;
    sync();
  }
  async function toHero() {
    if (destruido) return;
    busy = true;
    place = 'moving';
    const from = fab.getBoundingClientRect();
    fab.style.display = 'none';
    fabA.state('reposo');
    const r = stage.getBoundingClientRect();
    const done = await morph(from, r, false);
    if (destruido) return;
    stage.style.visibility = '';
    done();
    place = 'hero';
    busy = false;
    sync();
  }
  function sync() {
    if (destruido || busy || tour) return;
    if (!inView && place === 'hero') toFab();else if (inView && place === 'fab') toHero();
  }
  const observer = window.IntersectionObserver ? new IntersectionObserver(es => {
    if (destruido || !es.length) return;
    inView = es[0].intersectionRatio >= .4;
    sync();
  }, {
    threshold: [0, .2, .4, .6, 1]
  }) : null;
  observer?.observe(stage);
  fab.onclick = () => {
    if (!destruido && !tour) abrirAsistente();
  };
  function setFl(x, y, fs, anim) {
    fl.style.transition = anim ? '' : 'none';
    fl.style.width = fl.style.height = fs + 'px';
    fl.style.transform = `translate(${x}px,${y}px)`;
  }
  async function startTour() {
    if (destruido || busy || tour) return;
    tour = true;
    const version = ++tourVersion;
    busy = true;
    stopSpeech();
    const fs = FS();
    if (place === 'fab') {
      const r = fab.getBoundingClientRect();
      fab.style.display = 'none';
      setFl(r.left, r.top, r.width);
      fl.style.display = 'block';
    } else {
      const r = stage.getBoundingClientRect();
      const x = r.left + r.width / 2 - fs / 2,
        y = Math.max(70, r.top + 40);
      stage.style.visibility = 'hidden';
      const done = await morph(r, {
        left: x,
        top: y,
        width: fs,
        height: fs
      }, true);
      if (destruido || !tour || version !== tourVersion) { done(); return; }
      setFl(x, y, fs);
      fl.style.display = 'block';
      done();
    }
    place = 'tour';
    busy = false;
    nodes.bub.style.display = 'block';
    await wait(30);
    if (destruido || !tour || version !== tourVersion) return;
    fl.style.transition = '';
    go(0);
  }
  function endTour() {
    const wasTour = tour;
    tour = false;
    tourVersion++;
    st = -1;
    nodes.spot.style.display = 'none';
    nodes.bub.style.display = 'none';
    fl.style.display = 'none';
    if (destruido || !wasTour) return;
    stopSpeech();
    animations.forEach(animation => animation.cancel());
    animations.clear();
    mor.style.display = 'none';
    stage.style.visibility = '';
    fab.style.visibility = '';
    fab.style.display = 'none';
    place = 'hero';
    busy = false;
    sync();
  }
  const begin = () => {
    if (destruido || tour || busy) return;
    STEPS = getSteps();
    if (STEPS.length) startTour();
  };
  const next = () => { if (tour && !busy && st >= 0) go(st + 1); };
  const key = e => {
    if (e.key === 'Escape') endTour();
  };
  nodes.bubNx.addEventListener('click', next);
  nodes.bubSk.addEventListener('click', endTour);
  window.addEventListener('keydown', key);
  return {
    speak: (text, el, say) => speak(hero, text, say, el),
    stopSpeech,
    startTour: begin,
    destroy() {
      if (destruido) return;
      destruido = true;
      // Cada recurso se libera por separado para que una API defectuosa no impida el resto.
      const safely = fn => { try { fn(); } catch { /* limpieza best-effort */ } };
      safely(() => observer?.disconnect());
      animations.forEach(a => safely(() => a.cancel()));
      animations.clear();
      safely(() => stopSpeech(true));
      safely(() => clearInterval(blink));
      timers.forEach(id => safely(() => clearTimeout(id)));
      timers.clear();
      waiting.forEach(resolve => resolve());
      waiting.clear();
      safely(() => window.removeEventListener('pointermove', move));
      safely(() => window.removeEventListener('keydown', key));
      safely(() => nodes.bubNx?.removeEventListener('click', next));
      safely(() => nodes.bubSk?.removeEventListener('click', endTour));
      safely(() => { if (fab) fab.onclick = null; });
      safely(() => window.speechSynthesis?.removeEventListener('voiceschanged', pickVoice));
      all().forEach(a => safely(() => a.destroy()));
    }
  };
}
