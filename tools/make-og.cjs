// SNS で貼られたときの絵（og.png 1200×630）を作る。今日の問題（答え）は入れず、24の節気を並べた暦の輪だけ。
// 使い方: node tools/make-og.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
const ring = require("./ring.cjs");
const G = require("../gen.js");
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  const sea = ["春", "夏", "秋", "冬"].map((n, q) => { const a = (q * 6 + 2.5) * Math.PI / 12; return `<text x="${260 + 72 * Math.sin(a)}" y="${260 - 72 * Math.cos(a) + 14}" text-anchor="middle" font-size="40" font-weight="900" fill="#2a2420">${n}</text>`; }).join("");
  await p.setContent(`<body style="margin:0;font-family:'Noto Sans CJK JP','IPAPGothic',sans-serif">
  <div style="width:1200px;height:630px;box-sizing:border-box;padding:56px 64px;background:#f6f1e7;color:#2a2420;display:flex;gap:40px;align-items:center">
    <div style="flex:1">
      <div style="font-size:32px;color:#86291a;letter-spacing:.06em">季節のことばを当てる1日5問</div>
      <div style="font-size:120px;font-weight:900;margin-top:8px;color:#1f3a5c;white-space:nowrap">二十四<span style="color:#b8402a">節気</span></div>
      <div style="font-size:31px;margin-top:14px;line-height:1.55;white-space:nowrap">名前・意味・季節・順番・日付<br>国立天文台の暦にもとづく</div>
    </div>
    <svg width="520" height="520" viewBox="0 0 520 520">${ring(G.SEKKI.map((x) => x.n), 520, { inner: 0.27 })}${sea}</svg>
  </div></body>`);
  await p.screenshot({ path: path.join(__dirname, "..", "og.png") });
  await b.close();
})();
