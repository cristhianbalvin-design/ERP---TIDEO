// Voz con la que Aria lee sus respuestas. Usa la síntesis del navegador (sin costo) y la misma
// elección de voz en español que "Escuchar mi día" del Inicio.

const UNIDADES_MONEDA = { 'S/': ['soles', 'céntimos'], 'US$': ['dólares', 'centavos'] };

function montoHablado(simbolo, cifra) {
  const [entero, decimales = ''] = cifra.replace(/,/g, '').split('.');
  const [moneda, centavos] = UNIDADES_MONEDA[simbolo];
  const signo = entero.startsWith('-') ? 'menos ' : '';
  const base = `${signo}${entero.replace('-', '')} ${moneda}`;
  const cent = Number(decimales.padEnd(2, '0').slice(0, 2));
  return cent ? `${base} con ${cent} ${centavos}` : base;
}

// Convierte la respuesta del panel (montos, viñetas, notas) en un texto natural para leer en voz alta.
export function textoParaHablar(texto) {
  return String(texto || '')
    .replace(/(S\/|US\$)\s*(-?\d[\d,]*(?:\.\d{1,2})?)/g, (_, simbolo, cifra) => montoHablado(simbolo, cifra))
    .replace(/\*\*|__|`|#+\s*/g, '')
    .replace(/^\s*(?:[-•*]|\d+[.)])\s+/gm, '')
    .replace(/\bOjo:\s*/g, 'Ojo, ')
    .replace(/\bCxC\b/g, 'cuentas por cobrar')
    .replace(/\bCxP\b/g, 'cuentas por pagar')
    .replace(/:\s*\n/g, ': ')
    .replace(/\n+/g, '. ')
    .replace(/\s+/g, ' ')
    .replace(/(\.\s*){2,}/g, '. ')
    .trim()
    .slice(0, 1500);
}

// Chrome corta las frases muy largas: se leen por partes de hasta ~200 caracteres.
export function dividirFrases(texto, maximo = 200) {
  const partes = [];
  for (const frase of String(texto || '').split(/(?<=[.!?;])\s+/)) {
    let resto = frase.trim();
    while (resto.length > maximo) {
      const corte = resto.lastIndexOf(' ', maximo);
      const posicion = corte > 40 ? corte : maximo;
      partes.push(resto.slice(0, posicion).trim());
      resto = resto.slice(posicion).trim();
    }
    if (resto) partes.push(resto);
  }
  return partes;
}

export function puedeHablar() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
}

function elegirVoz() {
  const voces = window.speechSynthesis.getVoices() || [];
  return voces.find(v => /^es[-_](PE|419|MX|US|AR|CO|CL)/i.test(v.lang) && /female|mujer|sabina|paulina|helena|elvira|dalia|camila|google/i.test(v.name))
    || voces.find(v => /^es/i.test(v.lang)) || null;
}

// Lee el texto en voz alta. Devuelve una función que la detiene. onFin se llama una sola vez.
export function hablar(texto, { onFin } = {}) {
  let terminado = false;
  const terminar = () => { if (terminado) return; terminado = true; onFin?.(); };
  const partes = dividirFrases(textoParaHablar(texto));
  if (!puedeHablar() || !partes.length) { terminar(); return () => {}; }
  const sintesis = window.speechSynthesis;
  sintesis.cancel();
  const voz = elegirVoz();
  partes.forEach((parte, indice) => {
    const frase = new window.SpeechSynthesisUtterance(parte);
    if (voz) frase.voice = voz;
    frase.lang = voz?.lang || 'es-PE';
    frase.rate = 1.02;
    frase.pitch = 1.08;
    if (indice === partes.length - 1) frase.onend = terminar;
    frase.onerror = event => { if (event?.error !== 'interrupted' && event?.error !== 'canceled') terminar(); };
    sintesis.speak(frase);
  });
  return () => { sintesis.cancel(); terminar(); };
}
