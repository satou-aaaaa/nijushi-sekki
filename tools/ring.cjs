// 暦の輪の絵（アイコンと SNS 用の絵で使う）。24の節気を立春を上に時計回りで、季節の色に塗る
const SCOL = ["#f6d6dc", "#d4ecd2", "#f6dcc0", "#d6e2f2"];
module.exports = function ring(names, size, opt = {}) {
  const c = size / 2, R1 = size * 0.47, R0 = size * (opt.inner || 0.3), out = [];
  const pt = (r, a) => [c + r * Math.sin(a), c - r * Math.cos(a)];
  for (let i = 0; i < 24; i++) {
    const a0 = (i - 0.5) * Math.PI / 12, a1 = (i + 0.5) * Math.PI / 12, q = Math.floor(i / 6);
    const [x0, y0] = pt(R1, a0), [x1, y1] = pt(R1, a1), [x2, y2] = pt(R0, a1), [x3, y3] = pt(R0, a0);
    out.push(`<path d="M${x0},${y0} A${R1},${R1} 0 0 1 ${x1},${y1} L${x2},${y2} A${R0},${R0} 0 0 0 ${x3},${y3}Z" fill="${SCOL[q]}" stroke="${opt.line || "#fffdf8"}" stroke-width="${size / 160}"/>`);
    if (names) { const [tx, ty] = pt((R1 + R0) / 2, i * Math.PI / 12); out.push(`<text x="${tx}" y="${ty + size * 0.016}" text-anchor="middle" font-size="${size * 0.045}" font-weight="700" fill="#2a2420">${names[i]}</text>`); }
  }
  return out.join("");
};
