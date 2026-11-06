import { assets, ojos } from './assets.js';
const A = { d_base: assets.base, d_blink: assets.blink, d_a: assets.a, d_o: assets.o, d_e: assets.e, b_base: assets.robot, d_eyes: { l: ojos[0], r: ojos[1] } };
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
