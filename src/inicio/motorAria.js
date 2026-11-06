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
const $ = (s, r) => r.querySelector(s),
  $$ = (s, r) => [...r.querySelectorAll(s)];
let uid = 0;
export class Avatar {
  constructor(h, kind) {
    this.h = h;
    this.kind = kind;
    this.id = ++uid;
    this.timers = new Set();
    this.render();
  }
  destroy() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }
  later(fn) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, 120);
    this.timers.add(id);
  }
  render() {
    const K = this.kind || 'd';
    const fx = `<div class="dxi-fx">
      <i class="dxi-halo">
      </i>
      <i class="dxi-r">
      </i>
      <i class="dxi-r dxi-r2">
      </i>
      <i class="dxi-r dxi-r3">
      </i>
      <div class="dxi-orb">
      <b>
      </b>
      <b>
      </b>
      </div>
      </div>`;
    if (K !== 'b') {
      const P = K === 'd' ? 'd_' : 'c_';
      const eyes = K === 'd' ? ['l', 'r'].map(s => {
        const e = A.d_eyes[s],
          b = e.box;
        return `<div class="dxi-eb" style="left:${b[0]}%;top:${b[1]}%;width:${b[2] - b[0]}%;height:${b[3] - b[1]}%;
        -webkit-mask-image:url(${e.mask});
        mask-image:url(${e.mask})">
      <img src="${e.sclera}" alt="">
      <img class="dxi-iris" data-ex="${e.ex}" data-ey="${e.ey}" src="${e.iris}" alt="">
      </div>`;
      }).join('') : '';
      this.h.innerHTML = `<div class="dxi-av">${fx}<div class="dxi-av-bob">
      <img class="dxi-bs" src="${A[P + 'base']}" alt="Aria">${eyes}
      <img class="dxi-ly dxi-eye dxi-bl" src="${A[P + 'blink']}" alt="">
      ${K === 'c' ? `<img class="dxi-ly dxi-eye dxi-think" src="${A.c_think}" alt="">` : ''}
      <img class="dxi-ly dxi-mouth dxi-m-a" src="${A[P + 'a']}" alt="">
      <img class="dxi-ly dxi-mouth dxi-m-o" src="${A[P + 'o']}" alt="">
      <img class="dxi-ly dxi-mouth dxi-m-e" src="${A[P + 'e']}" alt="">
      </div>
      </div>`;
    } else {
      const bars = [0, 1, 2, 3, 4].map(i =>
        `<rect x="${43.2 + i * 2.9}" y="63" width="1.8" height="7" rx=".9" fill="#2CF0FF"/>`).join('');
      this.h.innerHTML = `<div class="dxi-av">${fx}<div class="dxi-av-bob">
      <img class="dxi-bs" src="${A.b_base}" alt="Aria">
      <svg class="dxi-b-face" viewBox="0 0 100 100">
      <defs>
      <filter id="gl${this.id}" x="-120%" y="-120%" width="340%" height="340%">
      <feGaussianBlur stdDeviation="1.6" result="b"/>
      <feMerge>
      <feMergeNode in="b"/>
      <feMergeNode in="b"/>
      <feMergeNode in="SourceGraphic"/>
      </feMerge>
      </filter>
      </defs>
      <g class="dxi-b-eyes" filter="url(#gl${this.id})">
      <rect class="dxi-b-eye" x="34.3" y="44.5" width="6" height="16" rx="3" fill="#2CF0FF"/>
      <rect class="dxi-b-eye" x="59.7" y="44.5" width="6" height="16" rx="3" fill="#2CF0FF"/>
      </g>
      <g class="dxi-b-m" filter="url(#gl${this.id})">${bars}</g>
      </svg>
      </div>
      </div>`;
    }
    this.av = $('.dxi-av', this.h);
    this.vis(null, 0);
    this.state(this.h.dataset.s || 'reposo');
  }
  state(s) {
    this.h.dataset.s = s;
    const t = $('.dxi-think', this.h);
    if (t) t.classList.toggle('dxi-on', s === 'piensa');
    const eyes = $('.dxi-b-eyes', this.h);
    if (eyes && s === 'piensa') eyes.style.transform = 'translate(2.5px,-3px)';
    if (s === 'piensa') $$('.dxi-iris', this.h).forEach(i =>
      i.style.transform = `translate(${i.dataset.ex * .75}%,${-i.dataset.ey}%)`);
  }
  blink() {
    if (this.h.dataset.s === 'piensa') return;
    const b = $('.dxi-bl', this.h);
    if (b) {
      b.classList.add('dxi-on');
      this.later(() => b.classList.remove('dxi-on'));
    }
    $$('.dxi-b-eye', this.h).forEach(e => {
      e.classList.add('dxi-shut');
      this.later(() => e.classList.remove('dxi-shut'));
    });
  }
  vis(v, e = 1) {
    if ((this.kind || 'd') !== 'b') {
      ['a', 'o', 'e'].forEach(k => {
        const m = $('.dxi-m-' + k, this.h);
        if (m) m.style.opacity = k === v ? e : 0;
      });
    } else {
      const w = {
        a: [.5, .9, 1.3, .9, .5],
        o: [.2, .7, 1, .7, .2],
        e: [.8, .6, .5, .6, .8]
      }[v] || [.08, .08, .08, .08, .08];
      $$('.dxi-b-m rect', this.h).forEach((r, i) =>
        r.style.transform = `scaleY(${(w[i] * (v ? .75 + Math.random() * .4 : 1)).toFixed(2)})`);
    }
  }
  point(x, y) {
    if (this.av) this.av.style.transform =
       `rotateY(${x * 7}deg) rotateX(${-y * 4}deg) translate(${x * 6}px,${y * 3}px)`;
    const eyes = $('.dxi-b-eyes', this.h);
    if (this.h.dataset.s === 'piensa') return;
    if (eyes) eyes.style.transform = `translate(${x * 3}px,${y * 2}px)`;
    $$('.dxi-iris', this.h).forEach(i => i.style.transform = `translate(${x * i.dataset.ex}%,${y * i.dataset.ey}%)`);
  }
}
export function crearMotor(root, getSteps, abrirAsistente) {
  const $ = (s, r = root) => r.querySelector(s),
    $$ = (s, r = root) => [...r.querySelectorAll(s)];
  const hero = new Avatar($('#heroAv'), 'd'),
    fly = new Avatar($('#flAv'), 'b'),
    fabA = new Avatar($('#fabAv'), 'b');
  const all = () => [hero, fly, fabA];
  let place = 'hero',
    KIND = 'd',
    pendingResolve = null,
    alive = true;
  const timers = new Set(),
    animations = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
    return id;
  };
  const blink = setInterval(() => {
    if (Math.random() < .55) all().forEach(a => a.blink());
  }, 1900);
  const move = e => all().forEach(av => {
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
  function stopSpeech() {
    if (pendingResolve) {
      pendingResolve();
      pendingResolve = null;
    }
    token++;
    window.speechSynthesis?.cancel();
    cancelAnimationFrame(timer);
    all().forEach(a => {
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
    if (' .,:;'.includes(c)) return [null, 0];
    return n;
  }
  function speak(av, text, say, el) {
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
        done = false;
      const cps = 13.5;
      const hasV = window.speechSynthesis && voice;
      const tgt = () => av === hero && place === 'fab' ? fabA : av;
      const end = () => {
        if (done || my !== token) return;
        done = true;
        pendingResolve = null;
        ws.forEach(w => w.classList.add('dxi-v'));
        tgt().vis(null);
        tgt().state('reposo');
        av.state('reposo');
        res();
      };
      const loop = t => {
        if (my !== token || done) return;
        idx = useB ? Math.min(s.length - 1, idx + cps / 60) : Math.min(s.length, (t - start) / 1000 * cps);
        const v = visemeOf(s[Math.floor(idx)], last);
        if (v[0]) last = v;
        tgt().vis(v[0], v[1]);
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
    const fl = $('#fl');
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
    const b = $('#bub');
    b.style.width = bw + 'px';
    b.style.left = bx + 'px';
    b.style.top = by + 'px';
  }
  async function go(i) {
    st = i;
    if (i >= STEPS.length) return endTour();
    const s = STEPS[i],
      el = $(s.el);
    if (!el) return go(i + 1);
    el.scrollIntoView({
      block: 'center',
      behavior: 'smooth'
    });
    await wait(450);
    if (!alive || st !== i) return;
    const r = el.getBoundingClientRect();
    const sp = $('#spot');
    sp.style.display = 'block';
    Object.assign(sp.style, {
      left: r.left - 6 + 'px',
      top: r.top - 6 + 'px',
      width: r.width + 12 + 'px',
      height: r.height + 12 + 'px'
    });
    posFly(r);
    $('#bubN').textContent = `${i + 1} de ${STEPS.length}`;
    $('#bubNx').textContent = i === STEPS.length - 1 ? 'Terminar' : 'Siguiente';
    await speak(fly, s.t, s.s, $('#bubSay'));
  }
  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  let busy = false,
    tour = false,
    inView = true;
  const stage = $('#stage'),
    mor = $('#mor'),
    fab = $('#fab'),
    fl = $('#fl');
  const wait = ms => new Promise(r => later(r, ms));
  const T = (x, y, s, rot = 0) => `translate(${x}px,${y}px) scale(${s}) rotate(${rot}deg)`;
  const box = r => ({
    x: r.left,
    y: r.top,
    s: r.width / 300
  });
  async function morph(from, to, toRobot) {
    const D = reduce ? 1 : 1050,
      hum = $('#morH'),
      rob = $('#morR'),
      bst = $('.dxi-bst', mor),
      scn = $('.dxi-scn', mor);
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
    const fb = $('#morW').animate(off.map((o, i) => ({
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
      mor.style.display = 'none';
      [main, fa, fb, fc, fd].forEach(x => {
        animations.delete(x);
        x.cancel();
      });
    };
  }
  async function toFab() {
    busy = true;
    place = 'moving';
    const r = stage.getBoundingClientRect();
    stage.style.visibility = 'hidden';
    fab.style.visibility = 'hidden';
    fab.style.display = 'block';
    const to = fab.getBoundingClientRect();
    const done = await morph(r, to, true);
    if (!alive) return;
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
    busy = true;
    place = 'moving';
    const from = fab.getBoundingClientRect();
    fab.style.display = 'none';
    fabA.state('reposo');
    const r = stage.getBoundingClientRect();
    const done = await morph(from, r, false);
    if (!alive) return;
    stage.style.visibility = '';
    done();
    place = 'hero';
    busy = false;
    sync();
  }
  function sync() {
    if (busy || tour) return;
    if (!inView && place === 'hero') toFab();else if (inView && place === 'fab') toHero();
  }
  const observer = window.IntersectionObserver ? new IntersectionObserver(es => {
    inView = es[0].intersectionRatio >= .4;
    sync();
  }, {
    threshold: [0, .2, .4, .6, 1]
  }) : null;
  observer?.observe(stage);
  fab.onclick = () => {
    if (!tour) abrirAsistente();
  };
  function setFl(x, y, fs, anim) {
    fl.style.transition = anim ? '' : 'none';
    fl.style.width = fl.style.height = fs + 'px';
    fl.style.transform = `translate(${x}px,${y}px)`;
  }
  async function startTour() {
    if (busy || tour) return;
    tour = true;
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
      if (!alive) return;
      setFl(x, y, fs);
      fl.style.display = 'block';
      done();
    }
    place = 'tour';
    busy = false;
    $('#bub').style.display = 'block';
    await wait(30);
    if (!alive) return;
    fl.style.transition = '';
    go(0);
  }
  async function endTour() {
    if (!tour || busy) return;
    busy = true;
    st = -1;
    stopSpeech();
    $('#spot').style.display = 'none';
    $('#bub').style.display = 'none';
    stage.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'center'
    });
    await wait(reduce ? 0 : 520);
    if (!alive) return;
    const r = stage.getBoundingClientRect(),
      fs = FS(),
      x = r.left + r.width / 2 - fs / 2,
      y = Math.max(70, r.top + 40);
    setFl(x, y, fs, true);
    await wait(reduce ? 0 : 720);
    if (!alive) return;
    fl.style.display = 'none';
    const done = await morph({
      left: x,
      top: y,
      width: fs,
      height: fs
    }, r, false);
    if (!alive) return;
    stage.style.visibility = '';
    done();
    place = 'hero';
    busy = false;
    tour = false;
    sync();
  }
  const begin = () => {
    STEPS = getSteps();
    if (STEPS.length) startTour();
  };
  const next = () => go(st + 1);
  const key = e => {
    if (e.key === 'Escape' && st >= 0) endTour();
  };
  $('#bubNx').addEventListener('click', next);
  $('#bubSk').addEventListener('click', endTour);
  window.addEventListener('keydown', key);
  return {
    speak: (text, el, say) => speak(hero, text, say, el),
    stopSpeech,
    startTour: begin,
    destroy() {
      alive = false;
      stopSpeech();
      clearInterval(blink);
      timers.forEach(clearTimeout);
      animations.forEach(a => a.cancel());
      observer?.disconnect();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('keydown', key);
      $('#bubNx').removeEventListener('click', next);
      $('#bubSk').removeEventListener('click', endTour);
      fab.onclick = null;
      window.speechSynthesis?.removeEventListener('voiceschanged', pickVoice);
      all().forEach(a => a.destroy());
    }
  };
}
