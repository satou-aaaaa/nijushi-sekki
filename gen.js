// 二十四節気 の問題（ブラウザと node の両方で使う）。
// 節気の名前・読み・意味・季節・順番・日付・太陽黄経、雑節を当てる。
// 意味と雑節は国立天文台「こよみ用語解説 二十四節気」、日付は国立天文台「暦要項」（2026年・2027年）、季節の分け方は国立国会図書館「日本の暦」から（出どころは SRC）。
// 問題は決まった種から全部ここで作る（BANK）。1問は「種類|番号」の key を持ち、同じ key ならいつも同じ問題になる。
// 作り方（build と N）を変えると、過去の日の問題も変わる。変えた PR に一言書く。QA は表を別に持って答えを確かめる。
// 乱数 R は呼ぶ回数が毎回同じになるように使う（sort の比較の中では引かない）。同じ日なら、どの端末でも同じ問題になる。
(function (root) {
  "use strict";
  const LV = ["やさしい", "ふつう", "むずかしい"];

  // 出どころ（短い名前と URL）
  const SRC = {
    naoj: ["国立天文台 暦計算室「こよみ用語解説 二十四節気」", "https://eco.mtk.nao.ac.jp/koyomi/faq/24sekki.html"],
    yoko26: ["国立天文台「暦要項 令和8年（2026）二十四節気および雑節」", "https://eco.mtk.nao.ac.jp/koyomi/yoko/2026/rekiyou262.html"],
    yoko27: ["国立天文台「暦要項 令和9年（2027）二十四節気および雑節」", "https://eco.mtk.nao.ac.jp/koyomi/yoko/2027/rekiyou272.html"],
    ndl: ["国立国会図書館「日本の暦」二十四節気", "https://www.ndl.go.jp/koyomi/chapter3/s7.html"],
  };

  function seedOf(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const pickN = (R, arr, n) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };

  // 二十四節気（立春から順に）。n 名前・y 読み・k 太陽黄経（度）・m 意味（国立天文台 用語解説）・d26 / d27 その年の日時（中央標準時、暦要項）
  // 季節は立春〜穀雨が春、立夏〜大暑が夏、立秋〜霜降が秋、立冬〜大寒が冬（国立国会図書館「日本の暦」）。立春から数えて1・3・5…番目が節気、2・4・6…番目が中気（交互）
  const SEKKI = [
    { n: "立春", y: "りっしゅん", k: 315, m: "寒さも峠を越え、春の気配が感じられる", d26: "2/4 05:02", d27: "2/4 10:46" },
    { n: "雨水", y: "うすい", k: 330, m: "陽気がよくなり、雪や氷が溶けて水になり、雪が雨に変わる", d26: "2/19 00:52", d27: "2/19 06:33" },
    { n: "啓蟄", y: "けいちつ", k: 345, m: "冬ごもりしていた地中の虫がはい出てくる", d26: "3/5 22:59", d27: "3/6 04:40" },
    { n: "春分", y: "しゅんぶん", k: 0, m: "太陽が真東から昇って真西に沈み、昼夜がほぼ等しくなる", d26: "3/20 23:46", d27: "3/21 05:25" },
    { n: "清明", y: "せいめい", k: 15, m: "すべてのものが生き生きとして、清らかに見える", d26: "4/5 03:40", d27: "4/5 09:17" },
    { n: "穀雨", y: "こくう", k: 30, m: "穀物をうるおす春雨が降る", d26: "4/20 10:39", d27: "4/20 16:18" },
    { n: "立夏", y: "りっか", k: 45, m: "夏の気配が感じられる", d26: "5/5 20:49", d27: "5/6 02:25" },
    { n: "小満", y: "しょうまん", k: 60, m: "すべてのものがしだいにのびて天地に満ち始める", d26: "5/21 09:37", d27: "5/21 15:18" },
    { n: "芒種", y: "ぼうしゅ", k: 75, m: "稲などの（芒のある）穀物を植える", d26: "6/6 00:48", d27: "6/6 06:26" },
    { n: "夏至", y: "げし", k: 90, m: "昼の長さが最も長くなる", d26: "6/21 17:25", d27: "6/21 23:11" },
    { n: "小暑", y: "しょうしょ", k: 105, m: "暑気に入り梅雨のあけるころ", d26: "7/7 10:57", d27: "7/7 16:37" },
    { n: "大暑", y: "たいしょ", k: 120, m: "夏の暑さがもっとも極まるころ", d26: "7/23 04:13", d27: "7/23 10:05" },
    { n: "立秋", y: "りっしゅう", k: 135, m: "秋の気配が感じられる", d26: "8/7 20:43", d27: "8/8 02:27" },
    { n: "処暑", y: "しょしょ", k: 150, m: "暑さがおさまるころ", d26: "8/23 11:19", d27: "8/23 17:14" },
    { n: "白露", y: "はくろ", k: 165, m: "しらつゆが草に宿る", d26: "9/7 23:41", d27: "9/8 05:28" },
    { n: "秋分", y: "しゅうぶん", k: 180, m: "秋の彼岸の中日、昼夜がほぼ等しくなる", d26: "9/23 09:05", d27: "9/23 15:02" },
    { n: "寒露", y: "かんろ", k: 195, m: "秋が深まり野草に冷たい露がむすぶ", d26: "10/8 15:29", d27: "10/8 21:17" },
    { n: "霜降", y: "そうこう", k: 210, m: "霜が降りるころ", d26: "10/23 18:38", d27: "10/24 00:33" },
    { n: "立冬", y: "りっとう", k: 225, m: "冬の気配が感じられる", d26: "11/7 18:52", d27: "11/8 00:39" },
    { n: "小雪", y: "しょうせつ", k: 240, m: "寒くなって雨が雪になる", d26: "11/22 16:23", d27: "11/22 22:16" },
    { n: "大雪", y: "たいせつ", k: 255, m: "雪がいよいよ降りつもってくる", d26: "12/7 11:53", d27: "12/7 17:38" },
    { n: "冬至", y: "とうじ", k: 270, m: "昼が一年中で一番短くなる", d26: "12/22 05:50", d27: "12/22 11:42" },
    { n: "小寒", y: "しょうかん", k: 285, m: "寒の入りで、寒気がましてくる", d26: "1/5 17:23", d27: "1/5 23:10" },
    { n: "大寒", y: "だいかん", k: 300, m: "冷気が極まって、最も寒さがつのる", d26: "1/20 10:45", d27: "1/20 16:30" },
  ];
  const SEASON = ["春", "夏", "秋", "冬"];
  const seasonOf = (i) => SEASON[Math.floor(i / 6)];
  const typeOf = (i) => (i % 2 === 0 ? "節気" : "中気");
  const at = (i) => SEKKI[((i % 24) + 24) % 24];
  // 雑節（国立天文台 用語解説の「雑節」）。d 説明・b もとにする節気（SEKKI の番号）・q そのたずね方
  const ZATSU = [
    { n: "節分", y: "せつぶん", d: "立春の前日。季節の分かれめのことで、もとは四季それぞれにあった", b: 0, q: "節分は、どの節気の前の日？" },
    { n: "彼岸", y: "ひがん", d: "春分または秋分の前3日から後3日まで、それぞれ計7日間", b: 3, q: "春の彼岸は、どの節気を真ん中にした7日間？" },
    { n: "土用", y: "どよう", d: "立春・立夏・立秋・立冬の前約18日間", b: 12, q: "夏の土用は、どの節気の前の約18日間？" },
    { n: "八十八夜", y: "はちじゅうはちや", d: "立春から数えて88日目。晩霜への注意", b: 0, q: "八十八夜は、どの節気から数えて88日目？" },
    { n: "入梅", y: "にゅうばい", d: "夏至の約10日前。梅雨の季節", b: 9, q: "入梅は、どの節気の約10日前？" },
    { n: "半夏生", y: "はんげしょう", d: "夏至の約10日後。田植えを終える目安", b: 9, q: "半夏生は、どの節気の約10日後？" },
    { n: "二百十日", y: "にひゃくとおか", d: "立春から数えて210日目。嵐の多い季節", b: 0, q: "二百十日は、どの節気から数えて210日目？" },
  ];

  // 日付（暦要項の「月/日 時:分」）から、その年の1月1日から数えた日（1から）
  const MD = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  function dayOf(s, year) { const [md] = s.split(" "); const [m, d] = md.split("/").map(Number); const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0); return MD[m - 1] + d + (leap && m > 2 ? 1 : 0); }
  const mdText = (s) => { const [m, d] = s.split(" ")[0].split("/"); return `${m}月${d}日`; };

  // 問題をためる。key は「種類|番号」。同じ種類の中で、文と選び肢が同じ問題は入れない
  const B = [], seen = new Set();
  function add(kind, id, q) {
    const sig = kind + "|" + q.scene.text + "|" + (q.text || "") + "|" + q.opts.slice().sort().join("/");
    if (seen.has(sig)) return false; seen.add(sig);
    if (!q.opts.includes(q.ans) || new Set(q.opts).size !== q.opts.length) throw new Error("bad question " + kind + id);
    const hay = q.ans + "|" + q.scene.text; q.at = SEKKI.map((x, j) => (hay.includes(x.n) ? j : -1)).filter((j) => j >= 0); // 正解のあとに暦の輪で印を付ける節気
    B.push({ key: kind + "|" + id, kind, ...q }); return true;
  }
  const Q = (text) => ({ t: "q", text });
  const near = (i) => [i - 2, i - 1, i + 1, i + 2].map((j) => ((j % 24) + 24) % 24);

  // ── やさしい ──
  // 名前 → 意味（選び肢はほかの節気の意味。同じ節気で2通り）
  for (let v = 0; v < 2; v++) { const R = rng(seedOf("gen:imi:" + v));
    SEKKI.forEach((s, i) => { const ds = pickN(R, SEKKI.filter((_, j) => j !== i && seasonOf(j) !== seasonOf(i)), 3);
      add("imi", `${i}-${v}`, { scene: Q(`「${s.n}」（${s.y}）は、どんなころ？`), opts: [s.m, ...ds.map((x) => x.m)], ans: s.m, src: ["naoj"],
        why: `${s.n}は「${s.m}」とされる、${seasonOf(i)}の節気です。2026年は${mdText(s.d26)}。` }); }); }
  // 意味 → 名前
  for (let v = 0; v < 2; v++) { const R = rng(seedOf("gen:namae:" + v));
    SEKKI.forEach((s, i) => { const ds = pickN(R, SEKKI.filter((_, j) => j !== i && seasonOf(j) !== seasonOf(i)), 3);
      add("namae", `${i}-${v}`, { scene: Q(`「${s.m}」。この節気は？`), opts: [s.n, ...ds.map((x) => x.n)], ans: s.n, src: ["naoj"],
        why: `${s.n}（${s.y}）です。${seasonOf(i)}の節気で、2026年は${mdText(s.d26)}。` }); }); }
  // 読み
  { const R = rng(seedOf("gen:yomi"));
    SEKKI.forEach((s, i) => { const ds = pickN(R, SEKKI.filter((_, j) => j !== i), 3);
      add("yomi", String(i), { scene: Q(`「${s.n}」の読み方は？`), opts: [s.y, ...ds.map((x) => x.y)], ans: s.y, src: ["naoj"],
        why: `${s.n}は「${s.y}」と読みます。意味は「${s.m}」。` }); }); }
  // 季節（選び肢は春夏秋冬の順のまま）
  SEKKI.forEach((s, i) => add("kisetsu", String(i), { scene: Q(`「${s.n}」は、春・夏・秋・冬のどれの節気？`), opts: SEASON.slice(), ans: seasonOf(i), src: ["ndl"], fix: 1,
    why: `${seasonOf(i)}は${at(Math.floor(i / 6) * 6).n}から${at(Math.floor(i / 6) * 6 + 5).n}まで。${s.n}はその${i % 6 + 1}番目です。` }));

  // ── ふつう ──
  // 次の節気・前の節気（選び肢は近くの節気）
  SEKKI.forEach((s, i) => { const a = at(i + 1), R = rng(seedOf("gen:tsugi:" + i)), ds = pickN(R, [at(i - 1), at(i + 2), at(i + 3)], 3);
    add("tsugi", String(i), { scene: Q(`「${s.n}」の次に来る節気は？`), opts: [a.n, ...ds.map((x) => x.n)], ans: a.n, src: ["naoj"],
      why: `${s.n}（${s.d26.split(" ")[0]}ごろ）の約15日後が${a.n}（${a.d26.split(" ")[0]}ごろ）です。` }); });
  SEKKI.forEach((s, i) => { const a = at(i - 1), R = rng(seedOf("gen:mae:" + i)), ds = pickN(R, [at(i + 1), at(i - 2), at(i - 3)], 3);
    add("mae", String(i), { scene: Q(`「${s.n}」の1つ前の節気は？`), opts: [a.n, ...ds.map((x) => x.n)], ans: a.n, src: ["naoj"],
      why: `${a.n}（${a.d26.split(" ")[0]}ごろ）の約15日後が${s.n}（${s.d26.split(" ")[0]}ごろ）です。` }); });
  // 日付 → 節気（その年、その日に始まる節気）
  for (const y of [2026, 2027]) { const f = y === 2026 ? "d26" : "d27";
    SEKKI.forEach((s, i) => { const R = rng(seedOf(`gen:hi:${y}:${i}`)), ds = pickN(R, near(i).map(at), 3);
      add("hi", `${y}-${i}`, { scene: Q(`${y}年${mdText(s[f])}。この日に始まる節気は？`), opts: [s.n, ...ds.map((x) => x.n)], ans: s.n, src: [y === 2026 ? "yoko26" : "yoko27"],
        why: `${y}年の${s.n}は${mdText(s[f])}（${s[f].split(" ")[1]}）。節気と節気の間は約15日です。` }); }); }
  // 雑節：説明 → 名前・名前 → もとにする節気・名前 → 説明
  ZATSU.forEach((z, i) => { const R = rng(seedOf("gen:zatsu:" + i)), ds = pickN(R, ZATSU.filter((_, j) => j !== i), 3);
    add("zatsu", `d${i}`, { scene: Q(`「${z.d}」。この雑節は？`), opts: [z.n, ...ds.map((x) => x.n)], ans: z.n, src: ["naoj"],
      why: `${z.n}（${z.y}）です。雑節は、二十四節気のほかに季節の目安として決めた日です。` });
    const b = SEKKI[z.b], bs = pickN(R, SEKKI.filter((_, j) => j !== z.b && seasonOf(j) === seasonOf(z.b)), 3);
    add("zatsu", `b${i}`, { scene: Q(z.q), opts: [b.n, ...bs.map((x) => x.n)], ans: b.n, src: ["naoj"], why: `${z.n}は「${z.d}」です。` });
    const es = pickN(R, ZATSU.filter((_, j) => j !== i), 3);
    add("zatsu", `m${i}`, { scene: Q(`「${z.n}」（${z.y}）とは？`), opts: [z.d, ...es.map((x) => x.d)], ans: z.d, src: ["naoj"], why: `${z.n}は「${z.d}」です。` }); });

  // ── むずかしい ──
  // 太陽黄経（選び肢は角度の順）
  SEKKI.forEach((s, i) => { const R = rng(seedOf("gen:kokei:" + i)), r = Math.floor(R() * 4), all = [0, 1, 2, 3].map((j) => at(i - r + j)); // 続いた4つ。答えの場所は種で決める（いつも真ん中にしない）
    add("kokei", `n${i}`, { scene: Q(`太陽黄経（太陽の通り道の上の位置）が${s.k}°になる瞬間を何という？`), opts: all.map((x) => x.n), ans: s.n, src: ["naoj"], fix: 1,
      why: `節気は太陽黄経で決めます。春分が0°で、15°ごとに次の節気。${s.n}は${s.k}°です。` });
    add("kokei", `k${i}`, { scene: Q(`「${s.n}」は、太陽黄経が何度になる瞬間？`), opts: all.map((x) => x.k + "°"), ans: s.k + "°", src: ["naoj"], fix: 1,
      why: `春分が0°で、15°進むごとに次の節気。${s.n}は${s.k}°です（立春315°・夏至90°・秋分180°・冬至270°）。` }); });
  // 並び：1年の中で、この順に来るのはどれ（3つの並べ方のうち、向きが合うものは1つだけ出す）
  for (const gap of [1, 2]) SEKKI.forEach((s, i) => { const a = s.n, b = at(i + gap).n, c = at(i + 2 * gap).n, R = rng(seedOf(`gen:narabe:${gap}:${i}`));
    const ok = [a, b, c], back = [[c, b, a], [b, a, c], [a, c, b]]; void R; // 並べ方6通りのうち、ok と向きが同じ（回した）ものは出さない
    add("narabe", `${gap}-${i}`, { scene: Q(`「${a}」から季節をたどると、左から右へこの順に来るのはどれ？`), opts: [ok.join(" → "), ...back.map((x) => x.join(" → "))], ans: ok.join(" → "), src: ["naoj"],
      why: `${a}（${mdText(s.d26)}ごろ）→${b}（${mdText(at(i + gap).d26)}ごろ）→${c}（${mdText(at(i + 2 * gap).d26)}ごろ）の順です。` }); });
  // 節気と中気：交互に来る。中気（または節気）はどれ
  for (let v = 0; v < 2; v++) SEKKI.forEach((s, i) => { const t = typeOf(i), R = rng(seedOf(`gen:chuki:${v}:${i}`)), ds = pickN(R, SEKKI.filter((_, j) => typeOf(j) !== t), 3);
    add("chuki", `${v}-${i}`, { scene: Q(`次のうち、「${t}」はどれ？（節気と中気は交互に来る）`), opts: [s.n, ...ds.map((x) => x.n)], ans: s.n, src: ["naoj"],
      why: `立春から数えて、1・3・5…番目が節気、2・4・6…番目が中気です。${s.n}は${i + 1}番目なので${t}。` }); });
  // 間の日数（2026年・2027年の暦要項から数える。選び肢は小さい順）
  SEKKI.forEach((s, i) => { const R = rng(seedOf("gen:kankaku:" + i)), step = 2 + Math.floor(R() * 4), e = at(i + step);
    const d1 = dayOf(s.d26, 2026), w = dayOf(e.d26, 2026) <= d1, d2 = w ? 365 + dayOf(e.d27, 2027) : dayOf(e.d26, 2026), v = d2 - d1, ed = (w ? "2027年" : "") + mdText(w ? e.d27 : e.d26);
    let r = Math.floor(R() * 4); if (v - 15 * r <= 0) r = 0; const all = [0, 1, 2, 3].map((j) => v + 15 * (j - r) + "日"); // 15日ずつ4つ。答えの場所は種で決める
    add("kankaku", String(i), { scene: Q(`「${s.n}」（2026年${mdText(s.d26)}）から、次の「${e.n}」までは何日？`), opts: all, ans: v + "日", src: w ? ["yoko26", "yoko27"] : ["yoko26"], fix: 1,
      why: `次の${e.n}は${ed}。節気は約15日ごとなので、${step}つ先で約${step * 15}日。数えると${v}日です。` }); });
  // 同じ季節の中で意味 → 名前（まぎらわしい）
  SEKKI.forEach((s, i) => { const R = rng(seedOf("gen:onaji:" + i)), ds = pickN(R, SEKKI.filter((_, j) => j !== i && seasonOf(j) === seasonOf(i)), 3);
    add("onaji", String(i), { scene: Q(`${seasonOf(i)}の節気のうち、「${s.m}」とされるのは？`), opts: [s.n, ...ds.map((x) => x.n)], ans: s.n, src: ["naoj"],
      why: `${s.n}（${s.y}）です。${seasonOf(i)}の${i % 6 + 1}番目の節気で、2026年は${mdText(s.d26)}。` }); });

  // 種類：id・難しさ・帳に出す名前・見るところ（ヒント1）
  const KINDS = [
    { id: "imi", lv: 0, name: "どんなころ", look: "名前の漢字に、季節や天気の言葉がかくれています。" },
    { id: "namae", lv: 0, name: "名前を当てる", look: "書いてある様子が、どの季節のものか考えましょう。" },
    { id: "yomi", lv: 0, name: "読み方", look: "小（しょう）・大（だい・たい）など、漢字の読みから。" },
    { id: "kisetsu", lv: 0, name: "どの季節", look: "春は立春から、夏は立夏から、6つずつです。" },
    { id: "tsugi", lv: 1, name: "次の節気", look: "節気は約15日ごとに、決まった順に来ます。" },
    { id: "mae", lv: 1, name: "前の節気", look: "季節の流れを、1つ戻って考えましょう。" },
    { id: "hi", lv: 1, name: "その日に始まる", look: "月の初めと中ごろ（5日・20日ごろ）に1つずつ来ます。" },
    { id: "zatsu", lv: 1, name: "雑節", look: "節分・彼岸・八十八夜などは、節気をもとに決めます。" },
    { id: "kokei", lv: 2, name: "太陽黄経", look: "春分が0°。15°進むごとに次の節気です。" },
    { id: "narabe", lv: 2, name: "並び順", look: "1つずつ、どれが先に来るかを考えましょう。" },
    { id: "chuki", lv: 2, name: "節気と中気", look: "立春から数えて、偶数番目が中気です。" },
    { id: "kankaku", lv: 2, name: "間の日数", look: "1つ先へ進むと約15日。いくつ先かを数えます。" },
    { id: "onaji", lv: 2, name: "同じ季節で見分ける", look: "その季節の中で、早い・遅いのどちらの様子か。" },
  ];
  B.forEach((q) => { q.lv = KINDS.find((k) => k.id === q.kind).lv; });
  const BY = Object.fromEntries(KINDS.map((k) => [k.id, k]));
  const kindsOf = (lv) => KINDS.filter((k) => k.lv === lv).map((k) => k.id);
  const BANK = Object.fromEntries(B.map((q) => [q.key, q]));
  const keysOf = (kind) => B.filter((q) => q.kind === kind).map((q) => q.key);

  // 1問を作る。tag は key（「種類|番号」）。選び肢は key の種で並べ替える（並びに意味のある選び肢 fix はそのまま）
  function make(tag) {
    const q = Object.prototype.hasOwnProperty.call(BANK, tag) ? BANK[tag] : null; if (!q) return null;
    const k = BY[q.kind], opts = q.opts.length === 2 || q.fix ? q.opts.slice() : pickN(rng(seedOf(tag)), q.opts, q.opts.length);
    return { tag, kind: q.kind, lv: k.lv, name: k.name, look: k.look, scene: q.scene, text: q.text || "", opts, ans: q.ans, why: q.why, at: q.at, src: q.src.map((s) => SRC[s]) };
  }
  const pickKey = (R, kind) => { const ks = keysOf(kind); return ks[Math.floor(R() * ks.length)]; };

  // 今日の5問（やさしい2・ふつう2・むずかしい1）。種類は重ねない
  function dailyTags(date) {
    const R = rng(seedOf("day:" + date)), e = pickN(R, kindsOf(0), 2), m = pickN(R, kindsOf(1), 2), h = pickN(R, kindsOf(2), 1);
    return [...e, ...m, ...h].map((id) => pickKey(R, id));
  }
  // 上級の3問（むずかしいだけ・今日の5問のむずかしいとは別の種類）
  function hardTags(date) {
    const dh = BANK[dailyTags(date)[4]].kind, R = rng(seedOf("hard:" + date)), h = pickN(R, kindsOf(2).filter((x) => x !== dh), 3);
    return h.map((id) => pickKey(R, id));
  }

  const G = { KINDS, BY, LV, SRC, SEKKI, ZATSU, SEASON, BANK, keysOf, kindsOf, seedOf, rng, make, dailyTags, hardTags, pickN, dayOf };
  if (typeof module !== "undefined" && module.exports) module.exports = G; else root.SEKKI = G;
})(typeof self !== "undefined" ? self : this);
