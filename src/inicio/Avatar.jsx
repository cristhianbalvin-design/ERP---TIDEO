import React, { useEffect, useRef } from 'react';
import { Avatar as MotorAvatar } from './avatarMotor.js';
export default function Avatar({
  robot = false,
  hablando = false
}) {
  const host = useRef(null);
  const avatar = useRef(null);
  useEffect(() => {
    const a = new MotorAvatar(host.current, robot ? 'b' : 'd');
    avatar.current = a;
    const move = e => {
      const r = a.h.getBoundingClientRect();
      if (!r.width) return;
      const n = v => v / Math.sqrt(1 + v * v);
      a.point(n((e.clientX - (r.left + r.width / 2)) / 240), n((e.clientY - (r.top + r.height * .34)) / 200));
    };
    const blink = window.setInterval(() => {
      if (Math.random() < .55) a.blink();
    }, 1900);
    window.addEventListener('pointermove', move, {
      passive: true
    });
    return () => {
      clearInterval(blink);
      window.removeEventListener('pointermove', move);
      a.destroy();
      avatar.current = null;
    };
  }, [robot]);
  useEffect(() => {
    const a = avatar.current;
    if (!a) return;
    a.state(hablando ? 'habla' : 'reposo');
    if (!hablando) {
      a.vis(null);
      return;
    }
    let i = 0;
    const timer = window.setInterval(() => a.vis(['a', 'e', 'o'][i++ % 3]), 160);
    return () => {
      clearInterval(timer);
      a.vis(null);
    };
  }, [hablando, robot]);
  return <div ref={host} className="dx-inicio-avatar" data-s="reposo" />;
}
