// 二十四節気 の検査。全部の問題の中身（選び肢・答え・出典・答えを gen.js とは別に持った表で確かめる）・
// 今日の5問と上級の組み方（3年分）・通しで遊ぶ・まちがい・ヒント・続きから・上級・練習・とことん（何百回作って重ならない）・
// こよみ帳・実績・カレンダー・あとから・文字の大きさ・スマホ幅・暦の輪・PWA・引き継ぎコード・見やすさを確かめる。
// 使い方: node qa/run.mjs   失敗があれば終了コード 1。結果は qa-report/report.md。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkTransfer } from "./transfer-check.mjs";
import { checkSwStall } from "./sw-check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) });
const G = createRequire(import.meta.url)(path.join(root, "gen.js"));

// ---- 0. gen.js とは別に持つ表（国立天文台「暦要項」2026・2027 と「こよみ用語解説」、国立国会図書館「日本の暦」の季節）----
// [名前, 読み, 太陽黄経, 季節, 2026年の日, 2027年の日, 意味]。小寒から順に（暦要項の並び）
const T = [
  ["小寒", "しょうかん", 285, "冬", "01-05", "01-05", "寒の入りで、寒気がましてくる"], ["大寒", "だいかん", 300, "冬", "01-20", "01-20", "冷気が極まって、最も寒さがつのる"],
  ["立春", "りっしゅん", 315, "春", "02-04", "02-04", "寒さも峠を越え、春の気配が感じられる"], ["雨水", "うすい", 330, "春", "02-19", "02-19", "陽気がよくなり、雪や氷が溶けて水になり、雪が雨に変わる"],
  ["啓蟄", "けいちつ", 345, "春", "03-05", "03-06", "冬ごもりしていた地中の虫がはい出てくる"], ["春分", "しゅんぶん", 0, "春", "03-20", "03-21", "太陽が真東から昇って真西に沈み、昼夜がほぼ等しくなる"],
  ["清明", "せいめい", 15, "春", "04-05", "04-05", "すべてのものが生き生きとして、清らかに見える"], ["穀雨", "こくう", 30, "春", "04-20", "04-20", "穀物をうるおす春雨が降る"],
  ["立夏", "りっか", 45, "夏", "05-05", "05-06", "夏の気配が感じられる"], ["小満", "しょうまん", 60, "夏", "05-21", "05-21", "すべてのものがしだいにのびて天地に満ち始める"],
  ["芒種", "ぼうしゅ", 75, "夏", "06-06", "06-06", "稲などの（芒のある）穀物を植える"], ["夏至", "げし", 90, "夏", "06-21", "06-21", "昼の長さが最も長くなる"],
  ["小暑", "しょうしょ", 105, "夏", "07-07", "07-07", "暑気に入り梅雨のあけるころ"], ["大暑", "たいしょ", 120, "夏", "07-23", "07-23", "夏の暑さがもっとも極まるころ"],
  ["立秋", "りっしゅう", 135, "秋", "08-07", "08-08", "秋の気配が感じられる"], ["処暑", "しょしょ", 150, "秋", "08-23", "08-23", "暑さがおさまるころ"],
  ["白露", "はくろ", 165, "秋", "09-07", "09-08", "しらつゆが草に宿る"], ["秋分", "しゅうぶん", 180, "秋", "09-23", "09-23", "秋の彼岸の中日、昼夜がほぼ等しくなる"],
  ["寒露", "かんろ", 195, "秋", "10-08", "10-08", "秋が深まり野草に冷たい露がむすぶ"], ["霜降", "そうこう", 210, "秋", "10-23", "10-24", "霜が降りるころ"],
  ["立冬", "りっとう", 225, "冬", "11-07", "11-08", "冬の気配が感じられる"], ["小雪", "しょうせつ", 240, "冬", "11-22", "11-22", "寒くなって雨が雪になる"],
  ["大雪", "たいせつ", 255, "冬", "12-07", "12-07", "雪がいよいよ降りつもってくる"], ["冬至", "とうじ", 270, "冬", "12-22", "12-22", "昼が一年中で一番短くなる"],
];
const BYN = Object.fromEntries(T.map((r) => [r[0], r]));
// 黄経の順（春分 0° から）。中気は黄経が30°で割り切れる（春分0°・夏至90° など）、節気はそうでない
const ord = (n) => ((BYN[n][2] + 360) % 360) / 15, chu = (n) => BYN[n][2] % 30 === 0;
const days = (y, mmdd) => Date.UTC(y, +mmdd.slice(0, 2) - 1, +mmdd.slice(3)) / 864e5;
// 雑節（こよみ用語解説）：[名前, 説明の始まり, もとにする節気]
const Z = [["節分", "立春の前日", "立春"], ["彼岸", "春分または秋分の前3日から後3日", "春分"], ["土用", "立春・立夏・立秋・立冬の前約18日間", "立秋"], ["八十八夜", "立春から数えて88日目", "立春"], ["入梅", "夏至の約10日前", "夏至"], ["半夏生", "夏至の約10日後", "夏至"], ["二百十日", "立春から数えて210日目", "立春"]];
const nameIn = (t) => T.map((r) => r[0]).filter((n) => t.includes("「" + n + "」")).sort((a, b) => t.indexOf("「" + a + "」") - t.indexOf("「" + b + "」")); // 文に出てくる順

// ---- 1. 問題（ブラウザを使わない）----
const FIRST_DAY = '[["kisetsu|7","namae|11-1","tsugi|1","hi|2027-15","onaji|1"],["kankaku|11","chuki|0-1","narabe|1-8"]]';
{
  const all = Object.values(G.BANK), bad = [];
  const REAL = /ドラえもん|ポケモン|ジブリ|鬼滅|サンリオ/;
  const SRCOK = /^https:\/\/(eco\.mtk\.nao\.ac\.jp\/koyomi\/|www\.ndl\.go\.jp\/koyomi\/)/;
  check("表：gen.js の24の節気が、別に持った表（暦要項・用語解説）と名前・読み・黄経・日付・意味まで同じ", G.SEKKI.length === 24 && G.SEKKI.every((x) => { const r = BYN[x.n]; return r && r[1] === x.y && r[2] === x.k && r[6] === x.m && x.d26.split(" ")[0] === `${+r[4].slice(0, 2)}/${+r[4].slice(3)}` && x.d27.split(" ")[0] === `${+r[5].slice(0, 2)}/${+r[5].slice(3)}`; }));
  check("表：季節は立春〜穀雨が春・立夏〜大暑が夏・立秋〜霜降が秋・立冬〜大寒が冬（国立国会図書館）", G.SEKKI.every((x, i) => G.SEASON[Math.floor(i / 6)] === BYN[x.n][3]));
  for (const q of all) {
    const P = G.make(q.key), why = [];
    if (!P) { bad.push(q.key + " 作れない"); continue; }
    if (P.opts.length !== 4 || new Set(P.opts).size !== 4 || P.opts.filter((o) => o === P.ans).length !== 1) why.push("選び肢");
    if (!P.src.length || P.src.some((s) => !s || !SRCOK.test(s[1]))) why.push("出典");
    if ([...P.why].length > 90) why.push("説明が90字より長い");
    const txt = JSON.stringify([P.scene, P.opts, P.why]);
    if (/undefined|null|NaN/.test(txt)) why.push("中身が空");
    if (REAL.test(txt)) why.push("作品の名前");
    if (JSON.stringify(G.make(q.key)) !== JSON.stringify(P)) why.push("同じ key で同じ問題にならない");
    const t = P.scene.text, ns = nameIn(t), k = q.kind;
    const isN = (o) => !!BYN[o];
    if (k === "imi") { if (ns.length !== 1 || P.ans !== BYN[ns[0]][6] || P.opts.filter((o) => T.some((r) => r[6] === o)).length !== 4) why.push("意味の答え"); }
    if (k === "namae" || k === "onaji") { const r = T.find((x) => t.includes("「" + x[6] + "」")); if (!r || P.ans !== r[0] || !P.opts.every(isN)) why.push("名前の答え");
      if (k === "onaji" && !P.opts.every((o) => BYN[o][3] === r[3])) why.push("同じ季節でない選び肢"); }
    if (k === "yomi" && (ns.length !== 1 || P.ans !== BYN[ns[0]][1])) why.push("読みの答え");
    if (k === "kisetsu" && (ns.length !== 1 || P.ans !== BYN[ns[0]][3] || P.opts.join() !== "春,夏,秋,冬")) why.push("季節の答え");
    if (k === "tsugi" || k === "mae") { const want = (ord(ns[0]) + (k === "tsugi" ? 1 : 23)) % 24; if (ns.length !== 1 || !isN(P.ans) || ord(P.ans) !== want || !P.opts.every(isN)) why.push("次・前の答え"); }
    if (k === "hi") { const m = t.match(/^(\d{4})年(\d+)月(\d+)日/), mmdd = m && `${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`, hit = m && T.filter((r) => r[m[1] === "2026" ? 4 : 5] === mmdd);
      if (!hit || hit.length !== 1 || P.ans !== hit[0][0] || !P.opts.every(isN)) why.push("日付の答え"); }
    if (k === "zatsu") { const z = Z.find((x) => t.includes(x[0]) || t.includes(x[1]));
      if (!z) why.push("雑節が見つからない");
      else if (q.key.includes("|d")) { if (P.ans !== z[0] || !t.startsWith("「" + Z.find((x) => P.ans === x[0])[1])) why.push("雑節の名前"); }
      else if (q.key.includes("|b")) { if (P.ans !== z[2]) why.push("雑節のもとの節気"); }
      else if (!P.ans.startsWith(z[1]) || !t.includes("「" + z[0] + "」")) why.push("雑節の説明"); }
    if (k === "kokei") { const deg = t.match(/(\d+)°/);
      if (deg) { if (!isN(P.ans) || BYN[P.ans][2] !== +deg[1]) why.push("黄経から名前"); }
      else if (ns.length !== 1 || P.ans !== BYN[ns[0]][2] + "°") why.push("名前から黄経"); }
    if (k === "narabe") { const cyc = (o) => { const a = o.split(" → ").map(ord), d1 = (a[1] - a[0] + 24) % 24, d2 = (a[2] - a[1] + 24) % 24; return d1 + d2 < 24 && d1 > 0 && d2 > 0 && (a[0] - a[2] + 24) % 24 > 0 && d1 + d2 + (a[0] - a[2] + 24) % 24 === 24; };
      const good = P.opts.filter(cyc); if (good.length !== 1 || good[0] !== P.ans || !P.ans.startsWith(ns[0])) why.push(`並びの答え（${good.join("/")}）`); }
    if (k === "chuki") { const want = t.includes("「中気」"); if (!isN(P.ans) || chu(P.ans) !== want || P.opts.filter((o) => chu(o) === want).length !== 1) why.push("節気と中気"); }
    if (k === "kankaku") { const a = BYN[ns[0]], b = BYN[ns[1]]; if (ns.length !== 2) why.push("間の日数の名前"); else {
      const d1 = days(2026, a[4]); let d2 = days(2026, b[4]); if (d2 <= d1) d2 = days(2027, b[5]); if (P.ans !== (d2 - d1) + "日") why.push(`間の日数（${d2 - d1}日）`); } }
    if (!P.at || !P.at.length) { if (k !== "zatsu") why.push("暦の輪の印が無い"); }
    else if (P.at.some((i) => !G.SEKKI[i]) || (isN(P.ans) && !P.at.includes(G.SEKKI.findIndex((x) => x.n === P.ans)))) why.push("暦の輪の印に答えが無い");
    if (why.length) bad.push(q.key + "：" + why.join("・"));
  }
  check(`問題：全部の問題（${all.length}問）で、選び肢は4つで答えは1つ・出典（国立天文台・国立国会図書館）つき・説明90字以内・答えを別に持った表で確かめて合う`, bad.length === 0, bad.slice(0, 5).join(" / "));
  check("問題：とことん・練習で出る問題は300問以上（好きなだけ遊んでも、すぐに同じ問題にならない）", all.length >= 300, all.length);
  const per = G.KINDS.map((k) => [k.id, G.keysOf(k.id).length]).filter(([, n]) => n < 20);
  check("問題：どの種類も20問以上ある", per.length === 0, per.join(" "));
  check("問題：種類は13（やさしい4・ふつう4・むずかしい5）", G.KINDS.length === 13 && [0, 1, 2].map((l) => G.kindsOf(l).length).join() === "4,4,5", [0, 1, 2].map((l) => G.kindsOf(l).length).join());
  check("知らない key（constructor など）は問題にしない", G.make("constructor") === null && G.make("__proto__") === null && G.make("toString") === null);
  const longLook = G.KINDS.filter((k) => [...k.look].length > 45).map((k) => k.id);
  check("ヒントは45字以内（やさしい日本語。一文を短く）", !longLook.length, longLook.join(","));
  // 並びを変えない選び肢（角度・日数の順）でも、答えの場所がかたよらない（いつも真ん中なら、考えずに当たる）
  const pos = {}; for (const q of all) if (q.fix && q.kind !== "kisetsu") { const o = G.make(q.key).opts.indexOf(q.ans); pos[o] = (pos[o] || 0) + 1; }
  const tp = Object.values(pos).reduce((a, b) => a + b, 0);
  check("並びを変えない選び肢でも、答えの場所（1〜4番目）がどれも1割以上", [0, 1, 2, 3].every((i) => (pos[i] || 0) >= tp * 0.1), JSON.stringify(pos));
  const ap = {}; for (const q of all) if (!q.fix) { const o = G.make(q.key).opts.indexOf(q.ans); ap[o] = (ap[o] || 0) + 1; }
  const ta = Object.values(ap).reduce((a, b) => a + b, 0);
  check("並べかえる選び肢で、答えの場所（1〜4番目）がどれも1割5分以上", [0, 1, 2, 3].every((i) => (ap[i] || 0) >= ta * 0.15), JSON.stringify(ap));
}
{
  // 今日の5問・上級の組み方（3年分）
  const bad = [], cover = new Set(); let sameAsPrev = 0, prev = "";
  const d0 = Date.parse("2026-11-07");
  const kd = (t) => G.BANK[t].kind;
  for (let i = 0; i < 365 * 3; i++) {
    const d = new Date(d0 + i * 864e5).toISOString().slice(0, 10), dl = G.dailyTags(d), hl = G.hardTags(d);
    const dk = dl.map(kd), hk = hl.map(kd);
    if (dl.length !== 5 || new Set(dk).size !== 5 || dk.map((k) => G.BY[k].lv).join() !== "0,0,1,1,2") bad.push(d + " 今日");
    if (hl.length !== 3 || new Set(hk).size !== 3 || hk.some((k) => G.BY[k].lv !== 2) || hk.includes(dk[4])) bad.push(d + " 上級");
    if (JSON.stringify(dl) !== JSON.stringify(G.dailyTags(d))) bad.push(d + " 同じにならない");
    if (dl.join() === prev) sameAsPrev++; prev = dl.join();
    if (i < 60) [...dk, ...hk].forEach((k) => cover.add(k));
  }
  check("今日の5問（やさしい2・ふつう2・むずかしい1、種類は重ねない）と上級（むずかしい3・今日のむずかしいと別）を3年分作れる", bad.length === 0, bad.slice(0, 5).join(","));
  check("2か月のうちに13種類が全部出る・前の日と同じ5問の日が無い", cover.size === 13 && sameAsPrev === 0, `${cover.size}種類・前の日と同じ ${sameAsPrev}日`);
  // 過去の日の問題を変えない：はじめの日の5問を控えと比べる（gen.js・BANK を変えたら、ここが落ちる）
  check("過去の日の問題が変わらない（第1回 2026-11-07 の5問と上級）", JSON.stringify([G.dailyTags("2026-11-07"), G.hardTags("2026-11-07")]) === FIRST_DAY, JSON.stringify([G.dailyTags("2026-11-07"), G.hardTags("2026-11-07")]));
}

// ---- 2. ファイルの中身 ----
const html = readFileSync(path.join(root, "index.html"), "utf8"), gen = readFileSync(path.join(root, "gen.js"), "utf8");
const ext = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https:\/\/fonts\.googleapis\.com(\/|$)|^https:\/\/ko-fi\.com\/satouaaaaa$/.test(u));
check("外から読むのは文字（Google Fonts）だけ。スクリプト・広告・解析を入れない（出典のリンクは押したときに開くだけ）", ext.length === 0 && ![...html.matchAll(/<script[^>]+src="([^"]+)"/g)].some((m) => /^https?:/.test(m[1])), ext.join(","));
check("CSP で通信先を自分だけにしている", /connect-src 'self'/.test(html) && !/connect-src[^;"]*https/.test(html));
check("Math.random は練習・とことんの並びと回の名札だけ（今日の5問・上級は日付の乱数。gen.js には無い）", (html.match(/Math\.random/g) || []).length === 3 && !/Math\.random/.test(gen));
check("乱数は sort の比較の中で引かない（ブラウザで引く回数が変わる）", !/\.sort\(\s*\([^)]*\)\s*=>[^\n;]*\b(R|rng|rand|Math\.random)\s*\(/.test(html + gen));
check("一行の式の途中にコメント // を足さない（行の残りが消える。rosen-hitofude 2026-11-04）", !/;\s*\/\/[^\n]*;\s*\w/.test(gen.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")));
check("このゲームについて：出典（国立天文台・国立国会図書館）を載せ、日付が2026年・2027年の暦要項のものだと書く", /2026年・2027年の暦要項/.test(html) && /G\.SRC/.test(html) && Object.values(G.SRC).length >= 3);
check("チケット・回数制限・🔒で開くモードを入れない（好きなだけ遊べる。shared-workflows game-dev.md F1・F2）", !/🎫|チケット|ライフ|スタミナ|すると開く|のあとで開く/.test(html));
check("画面にお笑いの言葉を入れない（本物っぽく）", !/お笑い|ギャグ|ツッコミ|なんでやねん|（うそ）/.test(html));
check("引き継ぎ：transfer.js をゲームの script より前に、このゲームの記録のキーだけで読む", /<script src="transfer\.js" data-game="nijushi-sekki" data-keys="sekki-v1,sekki-fs"><\/script>\s*<\/head>/.test(html) && html.indexOf('src="transfer.js"') < html.indexOf('src="gen.js"') && /data-hk/.test(html) && existsSync(path.join(root, "transfer.js")));
{ const og = (k) => (html.match(new RegExp(`<meta (?:property|name)="${k}" content="([^"]+)"`)) || [])[1] || "";
  const png = readFileSync(path.join(root, "og.png"));
  check("SNS で貼ると絵と題が出る（OGP・1200×630・絶対URL）", og("og:title") && og("og:description") && og("og:image") === "https://satou-aaaaa.github.io/nijushi-sekki/og.png" && og("twitter:card") === "summary_large_image" && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630); }
{ const fy = readFileSync(path.join(root, ".github/ISSUE_TEMPLATE/feedback.yml"), "utf8");
  check("感想フォームの name が3字以上（2字だとフォームが出ない。shared-workflows incidents/2026-11-05-feedback-form-not-shown.md）", [...((fy.match(/^name:\s*(.+)$/m) || [])[1] || "").trim()].length >= 3);
  check("感想フォームは名前・メールを聞かない", /id: fun/.test(fy) && !/id: (name|email|mail)/.test(fy) && /labels: \["感想"\]/.test(fy)); }
check("README の URL のすぐ後ろに全角の字を続けない（Link check が URL の一部と読む）", !/https?:\/\/[\x21-\x7e]*[^\x00-\x7f]/.test(readFileSync(path.join(root, "README.md"), "utf8").replace(/\]\(https?:\/\/[^)\s]+\)/g, "").replace(/<https?:\/\/[^>\s]+>/g, "")));
{ const sw = readFileSync(path.join(root, "sw.js"), "utf8"), mf = JSON.parse(readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  const shell = JSON.parse(sw.match(/SHELL = (\[[^\]]+\])/)[1]);
  { const st = await checkSwStall(sw); check("PWA：本文の途中で通信が止まっても、保存した画面を返す（ふつうはネットの返事）", st.ok, st); }
  check("PWA：sw.js は画面のファイルを全部保存し（引き継ぎの transfer.js も）、外へ何も送らない", ["./index.html", "./gen.js", "./transfer.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"].every((f) => shell.includes(f)) && !/https?:\/\//.test(sw.replace(/^\/\/.*$/gm, "")));
  check("PWA：manifest にアイコン2つと名前がある", mf.name === "二十四節気" && mf.icons.length >= 2 && mf.start_url === "./"); }

// ---- 3. ブラウザで遊ぶ ----
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname), f = path.join(root, p === "/" ? "index.html" : p);
  const rel = path.relative(root, f);
  if (rel.startsWith("..") || path.isAbsolute(rel) || !existsSync(f)) { res.writeHead(404); return res.end(); } // リポジトリの外（同じ名前で始まる隣のフォルダも）は返さない
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r)); // 外からつながらないよう、この機械の中だけで開く
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const dayBefore = (n) => new Date(Date.parse(TODAY) - n * 864e5).toISOString().slice(0, 10);
async function newPage(w = 390, ctx) {
  const c = ctx || await browser.newContext({ viewport: { width: w, height: 800 } });
  await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|net::/.test(m.text())) errors.push(m.text()); });
  await p.goto(url); await p.waitForTimeout(200);
  return p;
}
const closeHow = async (p) => { if (await p.locator("#howto[open]").count()) await p.click("#howto-ok"); };
const ansIdx = (p) => p.evaluate(() => { const c = __km.cur(); return c.P.opts.indexOf(c.P.ans); });
const wrongIdx = (p) => p.evaluate(() => { const c = __km.cur(); return c.P.opts.findIndex((o) => o !== c.P.ans && !c.wrong.includes(o)); });
const mem = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("sekki-v1") || "{}"));
async function solve(p, { wrong = 0 } = {}) {
  for (let i = 0; i < wrong; i++) await p.click(`.ch[data-j="${await wrongIdx(p)}"]`);
  await p.click(`.ch[data-j="${await ansIdx(p)}"]`);
  await p.waitForSelector(".verdict");
}

try {
  // はじめて：遊び方が出る・文字の大きさ
  const p = await newPage();
  check("はじめて開くと遊び方が出る", await p.locator("#howto[open]").count() === 1);
  await p.click("#howto-ok");
  {
    const q = await newPage();
    await q.keyboard.press("Escape"); await q.waitForTimeout(100);
    const shut = await q.locator("#howto[open]").count() === 0;
    await q.reload(); await q.waitForTimeout(150);
    const again = await q.locator("#howto[open]").count();
    await q.click("#go-p"); await q.click("#back"); await q.waitForTimeout(100);
    check("遊び方を Esc で閉じたあと、開き直しても・ホームに戻っても遊び方が出ない", shut && again === 0 && await q.locator("#howto[open]").count() === 0);
    await q.close();
  }
  { const r = await newPage(); const big = []; // 題が h1{flex:1} を受け継いで縦に伸び、iPad の縦で大きなすき間が出た（shared-workflows incidents/2026-11-07-title-stretched.md）
    for (const [w, h] of [[820, 1180], [390, 844], [1280, 800]]) { await r.setViewportSize({ width: w, height: h }); await r.reload(); await r.waitForTimeout(200); await r.keyboard.press("Escape"); await r.waitForTimeout(100);
      const v = await r.evaluate(() => { const e = [...document.querySelectorAll(".title")].find((x) => x.offsetParent); if (!e) return null; const h = e.getBoundingClientRect().height; const f = e.style.flex; e.style.flex = "none"; const n = e.getBoundingClientRect().height; e.style.flex = f; return h - n; });
      if (v === null || v > 4) big.push(`${w}x${h}:${v === null ? "題なし" : "+" + Math.round(v) + "px"}`); }
    check("ホームの題は縦長の画面でも縦に伸びない（820×1180・390×844・1280×800）", big.length === 0, big.join(" ")); await r.close(); }
  check("文字の大きさ：はじめは「大きい」（21px）", await p.evaluate(() => getComputedStyle(document.documentElement).fontSize) === "21px");
  await p.click('.fsrow button[data-fs="3"]');
  await p.reload(); await p.waitForTimeout(150);
  check("文字の大きさ：「とても大きい」にすると開き直しても残る", await p.evaluate(() => getComputedStyle(document.documentElement).fontSize) === "25px" && await p.locator('.fsrow button[data-fs="3"][aria-pressed="true"]').count() === 1);
  await p.click('.fsrow button[data-fs="2"]');
  check("ホームに今日の心得が出る", (await p.textContent("#tip")).includes("今日の心得"));

  // 今日の5問：1問目はまちがえる、2問目はヒント2回、ほかはそのまま
  await p.click("#go-d");
  const tags = await p.evaluate(() => __km.load().runs.d.list);
  check("今日の5問は日付から決まる（gen.js の dailyTags と同じ）", JSON.stringify(tags) === JSON.stringify(G.dailyTags(TODAY)));
  check("問題の画面：答える前は暦の輪を出さない（答えが見えてしまう）・大きな選び肢（高さ56px以上）", await p.locator("#scene .ring").count() === 0 && (await p.$$eval(".ch", (b) => b.map((x) => x.getBoundingClientRect().height))).every((h) => h >= 56) && await p.locator(".ch").count() === 4);
  await p.click(`.ch[data-j="${await wrongIdx(p)}"]`);
  check("まちがえると ✕ の印と「ちがう」の文字（色だけで分けない）・知らせは role=status", await p.locator(".ch.ng").count() === 1 && (await p.evaluate(() => getComputedStyle(document.querySelector(".ch.ng"), "::after").content)).includes("ちがう") && (await p.textContent("#msg")).includes("ちがいます") && await p.getAttribute("#msg", "role") === "status");
  // 開き直しても、まちがえた選び肢は残る
  await p.reload(); await p.waitForTimeout(150); await p.click("#go-d");
  check("途中で閉じても続きから（同じ問題・まちがえた印のまま）", await p.locator(".ch.ng").count() === 1 && await p.evaluate(() => __km.cur().i) === 0);
  await solve(p);
  check("正解すると ✓ の印・なぜの説明・出典のリンク・★2（まちがい1回）", await p.locator(".ch.ok").count() === 1 && (await p.textContent(".verdict .why")).length > 6 && await p.locator(".verdict .src a").count() >= 1 && (await p.getAttribute(".verdict .stars", "aria-label")) === "星2つ");
  await p.click("#next");
  await p.click("#hint");
  check("ヒント1は見るところを言う（答えは言わない）", (await p.textContent("#hintbox")).includes("💡") && await p.locator(".ch.ng").count() === 0);
  const nOpt = await p.locator(".ch").count();
  if (nOpt > 2) { await p.click("#hint"); check("ヒント2はまちがいの選び肢を消し、2つにしぼる・ヒントは2回まで", await p.locator(".ch:not(.ng)").count() === 2 && await p.locator("#hint:disabled").count() === 1); }
  else check("選び肢が2つの問題は、ヒントは1回まで（しぼる段は無い）", await p.locator("#hint:disabled").count() === 1);
  const h2 = nOpt > 2 ? 2 : 1;
  await solve(p);
  check("ヒントの数だけ★がへる", (await p.getAttribute(".verdict .stars", "aria-label")) === `星${h2 === 2 ? 1 : 2}つ`);
  await p.click("#next");
  for (let i = 2; i < 5; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(150);
  const s1 = await mem(p);
  check("5問で結果：今日の記録に1問ごとのまちがい（1・ヒント・0・0・0）", JSON.stringify(s1.days[TODAY]?.m) === JSON.stringify([1, h2, 0, 0, 0]));
  const share = await p.textContent(".share");
  check("シェアの文に答え・問題を出さない（題・回・日付と印だけ）", /^二十四節気 第\d+回 \d+\/\d+\n(🟢|🔶|🔺){5}( まちがいなし)?$/u.test(share.trim()), share);
  check("まちがいのある日は Ko-fi の一言を出さない", await p.locator(".kofi").count() === 0);
  check("結果に「あと少しの実績」と、続けて遊ぶ・上級のボタン", await p.locator("#achnext").count() === 1 && await p.locator("#go-e").count() === 1 && await p.locator("#go-h").count() === 1);
  check("こよみ帳に解いた種類が載る", Object.keys(s1.dex).length === 5);
  await p.click("#back");
  check("今日を終えたら、ホームは「今日の結果を見る」と上級", (await p.textContent("#go-d")).includes("結果") && await p.locator("#go-h").count() === 1);
  // 上級：ヒントなし・3問
  await p.click("#go-h");
  check("上級はヒントのボタンが無い・3問", await p.locator("#hint").count() === 0 && (await p.evaluate(() => __km.load().runs.h.list.length)) === 3);
  for (let i = 0; i < 3; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(150);
  check("上級の記録は hdays に入る", (await mem(p)).hdays[TODAY]?.m.length === 3);
  // 練習：記録を増やさない
  await p.click("#back"); await p.click("#go-p"); await p.click('.lv button[data-t="2"]');
  const before = await mem(p);
  for (let i = 0; i < 5; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(150);
  const after = await mem(p);
  check("練習は今日の記録を増やさない（こよみ帳の数はふえる）", JSON.stringify(after.days) === JSON.stringify(before.days) && Object.values(after.dex).reduce((a, b) => a + b) === Object.values(before.dex).reduce((a, b) => a + b) + 5);
  // こよみ帳からその種類だけで練習
  await p.click("#back"); await p.click("#go-dex");
  const firstKind = await p.getAttribute(".book button", "data-k");
  await p.click(".book button");
  check("こよみ帳の種類を押すと、その種類だけで練習", (await p.evaluate(() => __km.load().runs.p.list)).every((t) => t.startsWith(firstKind + "|")));
  // とことん：まちがえても続く・「ここで降りる」まで終わらない・自己ベストは一発で正解した数
  await p.click("#back"); await p.click("#go-e");
  check("とことんは種類を混ぜて60問以上を用意し、同じ問題は出さない", await p.evaluate(() => { const l = __km.load().runs.e.list; return l.length >= 60 && new Set(l).size === l.length; }));
  await solve(p); await p.click("#next"); await solve(p); await p.click("#next");
  await solve(p, { wrong: 1 }); await p.click("#next");
  await p.click(`.ch[data-j="${await wrongIdx(p)}"]`);
  check("とことんはまちがえても終わらない・ヒントも押せる", await p.locator(".verdict").count() === 0 && await p.locator("#hint:not([disabled])").count() === 1 && await p.locator(".ch:not([disabled])").count() >= 1);
  await solve(p); await p.click("#next");
  await p.click("#quit"); await p.waitForTimeout(150);
  check("「ここで降りる」で終わり、一発で正解した数（2問）が自己ベストに残る", (await mem(p)).ebest === 2 && (await p.textContent("#eres")).includes("2問") && !(await mem(p)).runs.e);
  await p.reload(); await p.waitForTimeout(250);
  check("降りたあと開き直しても、とことんの続きにならない", await p.locator(".ch").count() === 0);
  // とことんの並びを何百回作り、足していっても、全部出し切るまで同じ問題を出さない・同じ種類を続けない
  const er = await p.evaluate(() => { const K = __km, bad = []; let kinds = 0;
    for (let n = 0; n < 300; n++) { const r = { list: K.endlessList(), cyc: 0 }; const first = r.list.slice(0, 15).map((t) => K.G.BY[K.G.BANK[t].kind].lv); if (new Set(r.list).size !== r.list.length) bad.push("same" + n);
      if (first.slice(0, 5).some((l) => l !== 0) || first.slice(5, 15).some((l) => l !== 1)) bad.push("ramp" + n);
      if (n < 3) { while (r.list.length < K.ALLKEYS.length + 200) K.moreList(r); const a = r.list.slice(0, K.ALLKEYS.length); if (new Set(a).size !== a.length) bad.push("dup" + n); if (new Set(a).size !== K.ALLKEYS.length) bad.push("cover" + n); const b = r.list.slice(r.cyc); if (new Set(b).size !== b.length) bad.push("dup2-" + n); }
      for (let i = 1; i < Math.min(r.list.length, 60); i++) if (K.G.BANK[r.list[i]].kind === K.G.BANK[r.list[i - 1]].kind) kinds++;
    }
    return [bad.slice(0, 5), kinds]; });
  {
    // 前の回の最後の問題を除いて作り直しても、やさしい5→ふつう10から始まり、その問題を1問目にしない（2026-11-07 CodeRabbit）
    const rr = await p.evaluate(() => { const K = __km, bad = []; for (let n = 0; n < 100; n++) { const last = K.ALLKEYS[n * 7 % K.ALLKEYS.length], l = K.endlessList(new Set([last]), K.G.BANK[last].kind); const lv = l.slice(0, 15).map((t) => K.G.BY[K.G.BANK[t].kind].lv); if (lv.slice(0, 5).some((x) => x !== 0) || lv.slice(5).some((x) => x !== 1) || l.includes(last) || K.G.BANK[l[0]].kind === K.G.BANK[last].kind) bad.push(n); } return bad; });
    check("とことんを2回目に始めても、やさしい→ふつうから・前の最後の問題と種類を1問目にしない", rr.length === 0, JSON.stringify(rr.slice(0, 5)));
  }
  check("とことんの並びを300回作る：やさしい5→ふつう10から始まり、全部出し切るまで同じ問題なし・同じ種類が続く所はほぼ無い", er[0].length === 0 && er[1] < 300 * 3, JSON.stringify(er));
  {
    // 引き継ぎコードなどで数の所に文字が入っても、画面に HTML として出さない（2026-11-05 CodeRabbit）
    const q = await newPage(); await closeHow(q);
    await q.evaluate(() => { const s = JSON.parse(localStorage.getItem("sekki-v1")) || { v: 1 }; s.ebest = '<img id="xss" src=x>'; s.dex = { add: '"><b id="xss2">' }; s.elast = '"><u id="xss4">'; s.runs = { z: { mode: "z", id: "z", date: "2026-11-05", list: [], res: [] }, e: { mode: "e", id: "x", date: "2026-11-05", list: ["imi|0-0", "imi|1-0"], res: [], life: '"><i id="xss3">' }, h: { list: "bad", res: [] }, p: { mode: "p", id: "y", date: "2026-11-05", list: ["constructor|1"], res: [] }, d: { mode: "d", id: "z", date: "x", list: ["yomi|1"], res: [] }, h2: { date: "2026-11-07", list: [], res: [] }, a1: { mode: "a", id: "a1", date: "2026-11-04", list: ["yomi|1"], res: [null] }, a2: { mode: "a", id: "a2", date: "2026-11-03", list: "bad", res: [] }, "a:2026-11-02": { mode: "a", id: "a3", date: "2026-11-02", list: ["yomi|1", "yomi|2"], res: [{ m: 0 }], cur: { i: 1, tag: "yomi|2", wrong: "x", hints: 0 } } }; s.days = { "2026-11-05": { m: "x" }, bad: { m: [0] }, "2026-02-30": { m: [0] }, "2026-11-06": { m: [] } }; localStorage.setItem("sekki-v1", JSON.stringify(s)); });
    await q.reload(); await q.waitForTimeout(250);
    const st = await q.evaluate(() => __km.load());
    check("記録の形を直す：数の所の文字は0に・前の版の花（life）は読まない・形のちがう途中経過（置き場とモードが合わない回も）と日ごとの記録（問題の数が合わないものも）は捨てる", st.ebest === 0 && st.dex.add === 0 && !("life" in st.runs.e) && st.elast === null && !("h" in st.runs) && !("p" in st.runs) && !("d" in st.runs) && !("a1" in st.runs) && !("a2" in st.runs) && !("h2" in st.runs) && !("z" in st.runs) && st.runs["a:2026-11-02"] && st.runs["a:2026-11-02"].cur === null && Object.keys(st.days).length === 0);
    await q.click("#go-e").catch(() => {}); await q.waitForTimeout(150);
    check("記録の文字を HTML として出さない", await q.locator("#xss, #xss2, #xss3, #xss4").count() === 0);
    await q.context().close();
  }
  // 実績・このゲームについて
  await p.click("#go-ach");
  check("実績は13個で、腕前・集める・続けるの3つの組", await p.locator(".ach").count() === 13 && await p.locator(".agrp").count() === 3 && await p.locator(".ach.got").count() >= 3);
  check("達成した実績は ✓ の文字も付く（色だけで分けない）", (await p.textContent(".ach.got b")).startsWith("✓"));
  await p.click("#back"); await p.click("#f-about");
  check("このゲームについて：出典（国立天文台・国立国会図書館）のリンクと、日付が年によって変わること", (await p.textContent("#about")).includes("年によって1日ほど変わります") && await p.locator("#about a").count() >= 4);
  await p.context().close();

  // まちがいなしの日は Ko-fi を1回だけ
  {
    const q = await newPage(); await closeHow(q); await q.click("#go-d");
    for (let i = 0; i < 5; i++) { await solve(q); await q.click("#next"); }
    await q.waitForTimeout(150);
    check("全部まちがいなしで初めて終えたときだけ Ko-fi の一言", await q.locator(".kofi").count() === 1 && (await q.textContent(".big")).includes("まちがいなし"));
    await q.click("#back"); await q.click("#go-d");
    check("結果をもう一度見ても Ko-fi は出さない", await q.locator(".kofi").count() === 0);
    await q.context().close();
  }

  // カレンダー・あとから：過去の日の記録を置いて見る
  {
    // 第1回（2026-11-07）から日がたった日に時計を合わせる（第1回の日でも、取りこぼした日を確かめられる）
    const cctx = await browser.newContext({ viewport: { width: 390, height: 800 } }); await cctx.clock.setFixedTime(new Date("2026-11-17T03:00:00Z"));
    const T2 = "2026-11-17", dayBefore = (n) => new Date(Date.parse(T2) - n * 864e5).toISOString().slice(0, 10);
    const q = await newPage(390, cctx);
    await q.evaluate(([d2, d3]) => { localStorage.setItem("sekki-v1", JSON.stringify({ v: 1, tut: true, days: { [d2]: { m: [0, 0, 0, 0, 0], k: [] }, [d3]: { m: [1, 0, 0, 2, 0], k: [] } }, hdays: {}, adays: {}, dex: {}, runs: {}, kofi: {}, ach: {}, ebest: 0 })); }, [dayBefore(2), dayBefore(3)]);
    await q.reload(); await q.waitForTimeout(150);
    check("ホームの「続けて」は、きのうを休んだら — （休んだ日を責めない）", (await q.textContent(".stats")).includes("—"));
    await q.click("#go-cal");
    const lateList = await q.evaluate(() => __km.lateDays(__km.load()));
    const exp = [1, 4, 5, 6, 7].map(dayBefore).filter((d) => d >= "2026-11-07");
    check("カレンダー：取りこぼした過去7日（第1回より後）を押せる", JSON.stringify(lateList) === JSON.stringify(exp), lateList.join(","));
    check("カレンダー：遊んだ日は★の数の文字も付く", (await q.locator(".cal .c.p3").count()) + (await q.locator(".cal .c.p2").count()) + (await q.locator(".cal .c.p1").count()) >= (dayBefore(3).slice(0, 7) === T2.slice(0, 7) ? 2 : 0));
    if (lateList.length) {
      const d = lateList[0];
      await q.evaluate((d) => { const b = document.querySelector(`.cal .miss[data-k="${d}"]`); if (b) b.click(); else { const m = document.querySelector(".calnav #prev"); m && m.click(); } }, d);
      if (!(await q.locator(".ch").count())) await q.click(`.cal .miss[data-k="${d}"]`);
      check("あとから：その日の今日の5問と同じ問題", JSON.stringify(await q.evaluate((d) => __km.load().runs["a:" + d].list, d)) === JSON.stringify(G.dailyTags(d)));
      for (let i = 0; i < 5; i++) { await solve(q); await q.click("#next"); }
      await q.waitForTimeout(150);
      const s = await mem(q);
      check("あとからは adays に入り、今日の記録・続けた日には数えない", s.adays[d] && !s.days[d] && (await q.locator(".share").count()) === 0 && (await q.locator(".kofi").count()) === 0);
    } else check("あとから：遊べる日がある", false, "第1回の日から日がたっていない");
    await q.context().close();
  }

  // 古いタブ：同じ問題を2つのタブで開き、片方で答えたら、もう片方は二重に入れない
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const a = await newPage(390, ctx); await closeHow(a); await a.click("#go-d");
    const b = await ctx.newPage(); b.on("pageerror", (e) => errors.push(e.message)); await b.goto(url); await b.waitForTimeout(150); await b.click("#go-d");
    await solve(a);
    await b.click(`.ch[data-j="${await ansIdx(b)}"]`);
    await b.waitForTimeout(200);
    const s = await mem(a);
    check("古いタブで同じ問題に答えても二重に数えない", s.runs.d.res.length === 1 && Object.values(s.dex).reduce((x, y) => x + y) === 1);
    // ヒントの数は、別のタブで使った分も減らさない
    await a.click("#next"); await b.goto(url); await b.waitForTimeout(150); await b.click("#go-d");
    const c2 = await ctx.newPage(); c2.on("pageerror", (e) => errors.push(e.message)); await c2.goto(url); await c2.waitForTimeout(150); await c2.click("#go-d"); await c2.waitForTimeout(100); // ヒントを使う前に開いた古いタブ
    let used = 0; for (let i = 0; i < 2; i++) if (await a.locator("#hint").isEnabled()) { await a.click("#hint"); used++; } // 2択の問題はヒント1回まで
    if (await b.locator("#hint").isEnabled()) await b.click("#hint");
    check("別のタブで使ったヒントの数を減らさない", used >= 1 && (await mem(a)).runs.d.cur.hints === used);
    // ヒントを使っていない古いタブで正解しても、別のタブのヒントを★に数える（2026-11-07 CodeRabbit）
    await c2.click(`.ch[data-j="${await ansIdx(c2)}"]`); await c2.waitForTimeout(150);
    check("古いタブの正解でも、別のタブで使ったヒントを★に数える", (await mem(a)).runs.d.res[1].m >= used, JSON.stringify((await mem(a)).runs.d.res));
    await c2.close();
    await ctx.close();
  }

  // スマホ幅・とても大きい文字でもはみ出さない・押す所は44px以上
  {
    const bad = [], small = [];
    for (const [w, fs] of [[320, 3], [390, 2], [320, 1]]) {
      const q = await newPage(w); await closeHow(q);
      await q.evaluate((fs) => localStorage.setItem("sekki-fs", String(fs)), fs); await q.reload(); await q.waitForTimeout(150);
      for (const go of [null, "#go-d", "solve", "#go-cal", "#go-dex", "#go-ach", "#go-e"]) {
        if (go === "solve") { await solve(q); }
        else if (go) { await q.goto(url); await q.waitForTimeout(100); await q.click(go); }
        await q.waitForTimeout(100);
        const ov = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (ov > 0) bad.push(`${w}px 文字${fs} ${go || "ホーム"} ${ov}px`);
        small.push(...(await q.$$eval("button:not([disabled]), a[href]", (bs) => bs.filter((b) => b.checkVisibility() && !b.closest(".cal")).filter((b) => b.getBoundingClientRect().height < 44).map((b) => (b.id || b.className || b.textContent).slice(0, 20)))).map((x) => `${w}/${fs}/${go}:${x}`));
      }
      await q.context().close();
    }
    // とことん：正解したすぐあとでも「ここで降りる」で終われる（2026-11-07 CodeRabbit。前は次の問題へ進むまで押しても何も起きなかった）
    {
      const q = await newPage(); await closeHow(q); await q.click("#go-e"); await q.waitForTimeout(150);
      const ans = await q.evaluate(() => __km.cur().P.ans);
      await q.locator(".ch", { hasText: ans }).first().click(); await q.waitForTimeout(100);
      const lab = (await q.textContent("#quit")) || "";
      await q.click("#quit"); await q.waitForTimeout(150);
      check("とことん：正解したあとでも「ここで降りる」で結果へ進み、ボタンの数も答えた数になる", /1問で終える/.test(lab) && await q.locator("#eres").count() === 1, lab);
      await q.context().close();
    }
    // 正解すると、暦の輪に答えの節気の印（● と太い枠。色だけで分けない）が出る。幅320pxでも輪ははみ出さない
    {
      const q = await newPage(320); await closeHow(q); await q.click("#go-e"); await q.waitForTimeout(150);
      await q.evaluate(() => { __km.save((x) => { x.runs.e.list[x.runs.e.res.length] = "kokei|n6"; }); __km.play(); });
      await q.waitForTimeout(150);
      const ans = await q.evaluate(() => __km.cur().P.ans);
      await q.locator(".ch", { hasText: ans }).first().click(); await q.waitForTimeout(100);
      const rg = await q.evaluate(() => { const r = document.querySelector("#scene .ring"); if (!r) return null; const b = r.getBoundingClientRect(); return { w: b.width, mk: [...r.querySelectorAll(".mk text")].map((t) => t.textContent), leg: document.querySelector("#scene .legend2").textContent, sw: document.documentElement.scrollWidth }; });
      check("正解すると、暦の輪に答えの節気が ● で出て、下の文にも名前と黄経が出る（幅320pxではみ出さない）", rg && rg.mk.length === 1 && rg.mk[0] === "●" + ans && rg.leg.includes(ans + "（") && rg.w <= 320 && rg.sw <= 320, JSON.stringify(rg));
      await q.context().close();
    }
    // ヒント2：その日の問題に頼らず、データから選び肢3つ以上の問題を選んで確かめる（2026-11-07 共通化。日によって検査が動かないのを防ぐ）
    {
      const q = await newPage(390); await closeHow(q); await q.click("#go-e"); await q.waitForTimeout(150);
      const tag = await q.evaluate(() => __km.ALLKEYS.find((t) => { const P = __km.G.make(t); return P && P.opts.length >= 3; }));
      await q.evaluate((t) => { __km.save((x) => { x.runs.e.list[x.runs.e.res.length] = t; }); __km.play(); }, tag);
      await q.waitForTimeout(150);
      await q.click("#hint"); await q.click("#hint");
      const two = await q.locator(".ch:not(.ng)").count();
      await q.click(`.ch:not(.ng)[data-j="${await q.evaluate(() => { const c = __km.cur(); return c.P.opts.findLastIndex((o) => o !== c.P.ans); })}"]`);
      const one = await q.locator(".ch:not(.ng)").count();
      const ok = await q.evaluate(() => { const c = __km.cur(); return [...document.querySelectorAll(".ch:not(.ng)")].map((b) => c.P.opts[+b.dataset.j]).join() === c.P.ans; });
      check("ヒント2（データから選んだ選び肢3つ以上の問題）：2つにしぼり、残ったまちがいを選んでも消した選び肢は戻らず正解だけが残る", !!tag && two === 2 && one === 1 && ok, `${tag} ${two} ${one}`);
      await q.context().close();
    }
    check("幅320px・とても大きい文字でも横にはみ出さない", bad.length === 0, bad.join(" / "));
    check("押せる所は高さ44px以上", small.length === 0, [...new Set(small)].slice(0, 8).join(","));
  }

  // 見やすさの設定を全部入れても、ページの一番下まで動ける（読み上げの class が html に当たって固まった。2026-11-05）
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 700 } });
    await ctx.addInitScript(() => localStorage.setItem("a11y-v1", JSON.stringify({ read: true, cvd: true, calm: true, say: true, ruby: true })));
    const q = await newPage(390, ctx); await closeHow(q);
    const r = await q.evaluate(() => { window.scrollTo(0, 1e5); const f = document.querySelector("footer").getBoundingClientRect(); return [scrollY, Math.round(f.bottom), innerHeight, getComputedStyle(document.documentElement).position]; });
    check("見やすさの設定を全部入れても、いちばん下まで動ける（html が固定されない）", r[0] > 0 && r[1] <= r[2] && r[3] === "static", r.join(","));
    await ctx.close();
  }
  // キーボードだけで遊べる（Tab と Enter）
  {
    const q = await newPage(); await closeHow(q);
    await q.focus("#go-d"); await q.keyboard.press("Enter"); await q.waitForTimeout(100);
    const j = await ansIdx(q);
    await q.focus(`.ch[data-j="${j}"]`); await q.keyboard.press("Enter"); await q.waitForTimeout(100);
    check("キーボードだけで選んで答えられる", await q.locator(".verdict").count() === 1);
    await q.context().close();
  }
} catch (e) { check("ブラウザでの検査が最後まで動く", false, e.stack.split("\n").slice(0, 3).join(" ")); }

// 引き継ぎコード（shared-workflows template/qa/transfer-check.mjs）
try {
  const sample = { "sekki-v1": JSON.stringify({ v: 1, tut: true, days: { "2026-11-07": { m: [0, 1, 0, 0, 2], k: ["imi", "yomi", "tsugi", "hi", "kokei"] } }, hdays: {}, adays: {}, dex: { imi: 1, yomi: 1, tsugi: 1, hi: 1, kokei: 1 }, runs: {}, kofi: {}, ach: {}, ebest: 7, elast: null, t: 1 }), "sekki-fs": "3" };
  await checkTransfer({ browser, url, game: "nijushi-sekki", sample, check, open: async (pg) => { if (await pg.locator("#howto[open]").count()) await pg.click("#howto-ok"); } });
} catch (e) { check("引き継ぎの検査が最後まで動く", false, e.message.split("\n")[0]); }
await browser.close();
server.close();
check("画面のエラーが無い", errors.length === 0, errors.slice(0, 3).join(" | "));

{ // 見やすさ・読みやすさ・偏り（shared-workflows template/qa/a11y.mjs の写し）
  const { spawnSync } = await import("node:child_process");
  const a = spawnSync(process.execPath, [path.join(root, "qa", "a11y.mjs")], { encoding: "utf8", env: process.env });
  check("見やすさ・読みやすさの検査（qa/a11y.mjs。中身は qa-report/a11y.md）", a.status === 0, (a.stdout.match(/^- ❌.*$/gm) || []).join(" / ") || (a.status ? a.stderr.slice(-300) : ""));
}

const ng = results.filter((r) => !r.ok);
const md = `# 二十四節気 QA\n\n${results.map((r) => `- ${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? `（${r.detail}）` : ""}`).join("\n")}\n\n${ng.length ? `❌ ${ng.length}件` : `✅ ${results.length}項目すべて通過`}\n`;
mkdirSync(path.join(root, "qa-report"), { recursive: true });
writeFileSync(path.join(root, "qa-report/report.md"), md);
console.log(md);
process.exit(ng.length ? 1 : 0);
