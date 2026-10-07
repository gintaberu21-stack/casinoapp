import { WHEEL_ORDER, numberColor } from './roulette.js';
// SVGで描画し、スマホでも番号帯とボールポケットを鮮明に保つ。
export function createRouletteWheel() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 400 400');
  svg.setAttribute('aria-hidden', 'true');
  const point = (radius, angle) => {
    const rad = angle * Math.PI / 180;
    return [200 + radius * Math.sin(rad), 200 - radius * Math.cos(rad)];
  };
  const sector = (inner, outer, start, end) => {
    const a = point(outer, start), b = point(outer, end), c = point(inner, end), d = point(inner, start);
    return `M${a} A${outer} ${outer} 0 0 1 ${b} L${c} A${inner} ${inner} 0 0 0 ${d} Z`;
  };
  const circle = (r, fill, stroke = '#b98832', width = 1) => `<circle cx="200" cy="200" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
  let markup = `<defs>
    <radialGradient id="wood"><stop stop-color="#b47439"/><stop offset=".48" stop-color="#713008"/><stop offset=".78" stop-color="#a95719"/><stop offset=".94" stop-color="#5c2308"/><stop offset="1" stop-color="#a45b21"/></radialGradient>
    <radialGradient id="bowl" cx="32%" cy="26%"><stop stop-color="#c99770"/><stop offset=".18" stop-color="#a8734b"/><stop offset=".55" stop-color="#814016"/><stop offset="1" stop-color="#4f210c"/></radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff3a2"/><stop offset=".22" stop-color="#be7e15"/><stop offset=".47" stop-color="#ffdb62"/><stop offset=".73" stop-color="#9b590d"/><stop offset="1" stop-color="#eac158"/></linearGradient>
    <radialGradient id="cap" cx="30%" cy="25%"><stop stop-color="#fff9c3"/><stop offset=".35" stop-color="#ffe576"/><stop offset=".75" stop-color="#d79923"/><stop offset="1" stop-color="#8d4a08"/></radialGradient>
  </defs>`;
  markup += circle(197, 'url(#wood)', '#582109', 3);
  markup += circle(188, 'none', '#c2772c', 2);
  // 木製フレームの継ぎ目。
  for (let index = 0; index < 8; index++) {
    const a = point(164, index * 45), b = point(188, index * 45);
    markup += `<path d="M${a} L${b}" stroke="#51230c" stroke-width="3" opacity=".65"/>`;
  }
  const POCKET_ANGLE = 360 / WHEEL_ORDER.length;
  for (let index = 0; index < WHEEL_ORDER.length; index++) {
    const color = { red: '#b81f29', black: '#101a16', green: '#167343' }[numberColor(WHEEL_ORDER[index])];
    markup += `<path d="${sector(146, 164, index * POCKET_ANGLE, (index + 1) * POCKET_ANGLE)}" fill="${color}" stroke="#ebc75f" stroke-width="1"/>`;
    markup += `<path d="${sector(108, 145, index * POCKET_ANGLE, (index + 1) * POCKET_ANGLE)}" fill="${color}" stroke="#ebc75f" stroke-width="1.2"/>`;
    const p = point(155, (index + .5) * POCKET_ANGLE);
    markup += `<text x="${p[0]}" y="${p[1]}" text-anchor="middle" dominant-baseline="central" fill="#fff8dc" font-family="Arial,sans-serif" font-size="14" font-weight="600" transform="rotate(${(index + .5) * POCKET_ANGLE} ${p[0]} ${p[1]})">${WHEEL_ORDER[index]}</text>`;
  }
  markup += circle(165, 'none', '#f2d475', 2);
  markup += circle(146, 'none', '#f2d475', 2);
  markup += circle(108, 'url(#bowl)', '#e9c76a', 3);
  for (let index = 0; index < 8; index++) {
    const a = point(39, index * 45), b = point(106, index * 45);
    markup += `<path d="M${a} L${b}" stroke="#53260f" stroke-width="2" opacity=".55"/>`;
  }
  markup += circle(41, 'url(#gold)', '#fff0a1', 2);
  markup += circle(32, 'url(#cap)', '#a16c17', 1.5);
  markup += circle(24, 'url(#gold)', '#ffe994', 1.5);
  markup += circle(15, 'url(#cap)', '#bd7c19', 1);
  svg.innerHTML = markup;
  return svg;
}
