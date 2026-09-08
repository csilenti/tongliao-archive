// build-data.js
// 解析 小约翰可汗语录.md → data.json / data.js（不改写 Markdown 原文）
//
// 语义保留：
//   * **粗体** 语录      → isClassic = true，segments 保留粗体片段
//   * BV号：BVxxxx       → bvid，自动生成 B 站链接
//   * 封面：![alt](path) → cover（web 路径）
//   * 语录中的“奇葩小国42 / 硬核狠人26 / 神奇组织7”等引用 → refs（内部链接目标）

const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, '小约翰可汗语录.md');
const md = fs.readFileSync(mdPath, 'utf-8');
const lines = md.split(/\r?\n/);

// ---------- helpers ----------

function toWebPath(p) {
  let s = String(p || '').trim().replace(/\\/g, '/');
  const m = s.match(/(?:^|\/)(photo\/.*)$/i);
  if (m) s = m[1];
  return s;
}
function extractCoverPath(line) {
  const m = line.match(/!\[[^\]]*\]\(([^)]+)\)/);
  return m ? m[1].trim() : '';
}
function extractBvid(line) {
  const m = line.match(/(BV[0-9A-Za-z]{8,})/);
  return m ? m[1] : '';
}

// 把一条语录拆成 {t, b} 片段，**xxx** → b:true
function parseSegments(text) {
  const segs = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ t: text.slice(last, m.index), b: false });
    segs.push({ t: m[1], b: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ t: text.slice(last), b: false });
  return segs.length ? segs : [{ t: text, b: false }];
}

// 时间信息（不改原文，仅提取）：（5min）（13:44处）等
function extractTime(text) {
  const m = text.match(/[（(][^）()]*(\d{1,2}:\d{2}|\d+\s*min)[^）()]*[）)]/i);
  if (m) return m[1].replace(/\s+/g, '');
  const m2 = text.match(/(\d{1,2}:\d{2})\s*处|(\d+\s*min)\s*处/i);
  if (m2) return (m2[1] || m2[2]).replace(/\s+/g, '');
  return '';
}

// ---------- 解析 ----------

const seriesOrder = [];          // [{ rawName, name, videos: [] }]
let currentSeries = null;
let currentEp = null;

function normSeriesName(raw) {
  let s = raw.trim();
  if (s.endsWith('系列')) s = s.slice(0, -2);
  return s;
}

for (const rawLine of lines) {
  const line = rawLine.replace(/\s+$/, '');
  if (!line.trim()) continue;

  if (line.startsWith('## ')) {
    const rawName = line.replace(/^##\s+/, '').trim();
    let s = seriesOrder.find(x => x.rawName === rawName);
    if (!s) { s = { rawName, name: normSeriesName(rawName), videos: [] }; seriesOrder.push(s); }
    currentSeries = s;
    currentEp = null;
    continue;
  }

  if (line.startsWith('### ')) {
    const title = line.replace(/^###\s+/, '').trim();
    if (!title) continue;
    // 标题形如 “奇葩小国42 -- 冰岛” / “小约翰 -- 孙皓”
    const m = title.match(/^(.*?)\s*(\d{1,3})?\s*--+\s*(.+)$/);
    currentEp = {
      _seriesName: currentSeries ? currentSeries.name : (m ? m[1].trim() : '未分类'),
      title,
      ep: m && m[2] ? parseInt(m[2], 10) : null,
      subject: m ? m[3].trim() : title,
      description: '',
      bvid: '',
      cover: '',
      quotesRaw: [], // [{n, text}]
    };
    if (currentSeries) currentSeries.videos.push(currentEp);
    continue;
  }

  if (!currentEp) continue;

  if (/^(BV号|bv|bvid)\s*[：:]/i.test(line)) {
    const bv = extractBvid(line);
    if (bv) currentEp.bvid = bv;
    continue;
  }
  if (/^(封面|cover)\s*[：:]/i.test(line)) {
    const p = extractCoverPath(line);
    if (p) currentEp.cover = toWebPath(p);
    continue;
  }
  if (/^!\[[^\]]*\]\([^)]+\)/.test(line)) {
    const p = extractCoverPath(line);
    if (p && !currentEp.cover) currentEp.cover = toWebPath(p);
    continue;
  }
  if (/^BV[0-9A-Za-z]{8,}/.test(line)) {
    const bv = extractBvid(line);
    if (bv && !currentEp.bvid) currentEp.bvid = bv;
    continue;
  }
  if (line.startsWith('>')) {
    const d = line.replace(/^>\s*/, '').trim();
    if (d && !d.startsWith('**')) {
      currentEp.description = (currentEp.description ? currentEp.description + ' ' : '') + d;
    }
    continue;
  }

  const qm = line.match(/^(\d+)[\.、]\s*(.+)$/);
  if (qm) {
    currentEp.quotesRaw.push({ n: parseInt(qm[1], 10), text: qm[2].trim() });
    continue;
  }
  // 缩进续行 → 接到上一条语录
  if (/^\s+\S/.test(rawLine) && currentEp.quotesRaw.length) {
    const last = currentEp.quotesRaw[currentEp.quotesRaw.length - 1];
    const t = line.trim();
    if (t) last.text += (/\s$/.test(last.text) ? '' : ' ') + t;
    continue;
  }
}

// ---------- 组装输出 ----------

const seriesIdOf = (name) => 's' + (seriesOrder.findIndex(s => s.name === name) + 1);

const episodes = {};             // id → episode
const episodeIndex = new Map();  // “奇葩小国42” → episodeId
const quotes = [];
let qNo = 0;
let epIdx = 0;

for (const s of seriesOrder) {
  const sId = seriesIdOf(s.name);
  for (const ep of s.videos) {
    const eId = sId + 'e' + (++epIdx);
    ep.id = eId;
    ep.series = s.name;
    ep.seriesId = sId;
    ep.description = ep.description.replace(/\s+/g, ' ').trim();
    if (ep.ep != null) episodeIndex.set(s.name + ep.ep, eId);
    episodes[eId] = ep;
  }
}

for (const s of seriesOrder) {
  for (const ep of s.videos) {
    for (const q of ep.quotesRaw) {
      const segments = parseSegments(q.text);
      const classic = segments.some(seg => seg.b);
      const plain = segments.map(x => x.t).join('');
      // 引用解析：系列名 + 数字，且目标期真实存在
      const refs = [];
      const refRe = /(奇葩小国|硬核狠人|神奇组织)(\d{1,3})/g;
      let m;
      while ((m = refRe.exec(plain)) !== null) {
        const target = episodeIndex.get(m[1] + parseInt(m[2], 10));
        if (target && target !== ep.id && !refs.some(r => r.target === target && r.text === m[0])) {
          refs.push({ text: m[0], target });
        }
      }
      qNo += 1;
      quotes.push({
        id: ep.id + 'q' + q.n,
        n: qNo,
        nInEp: q.n,
        text: plain,
        segments,
        classic,
        time: extractTime(plain),
        series: ep.series,
        seriesId: ep.seriesId,
        ep: ep.ep,
        episodeId: ep.id,
        subject: ep.subject,
        bvid: ep.bvid,
        cover: ep.cover,
        refs,
      });
    }
  }
}

// ---------- 统计（全部动态计算） ----------

const seriesStats = seriesOrder
  .map(s => {
    const sId = seriesIdOf(s.name);
    const qs = quotes.filter(q => q.seriesId === sId);
    const eps = s.videos.map(v => v.ep).filter(x => x != null);
    return {
      id: sId,
      name: s.name,
      episodes: s.videos.length,
      maxEp: eps.length ? Math.max(...eps) : null,
      quotes: qs.length,
      classic: qs.filter(q => q.classic).length,
      sampleSubjects: s.videos.slice(0, 3).map(v => v.subject),
      videoList: s.videos.map(v => v.id),
    };
  })
  .filter(s => s.episodes > 0);

const topSeries = seriesStats.slice().sort((a, b) => b.quotes - a.quotes)[0] || null;
const longest = quotes.slice().sort((a, b) => b.text.length - a.text.length)[0] || null;
const latestArr = seriesStats.filter(s => s.maxEp != null).sort((a, b) => b.maxEp - a.maxEp);

const stats = {
  quoteCount: quotes.length,
  episodeCount: Object.keys(episodes).length,
  seriesCount: seriesStats.length,
  classicCount: quotes.filter(q => q.classic).length,
  bvidCount: Object.values(episodes).filter(e => e.bvid).length,
  coverCount: Object.values(episodes).filter(e => e.cover).length,
  longestQuoteLen: longest ? longest.text.length : 0,
  longestQuoteId: longest ? longest.id : null,
  topSeriesName: topSeries ? topSeries.name : '',
  topSeriesQuotes: topSeries ? topSeries.quotes : 0,
  progress: latestArr.map(s => `${s.name} ${s.maxEp}`),
};

const episodesOut = {};
for (const [id, e] of Object.entries(episodes)) {
  episodesOut[id] = {
    id, series: e.series, seriesId: e.seriesId, ep: e.ep, title: e.title,
    subject: e.subject, description: e.description, bvid: e.bvid, cover: e.cover,
    quotes: quotes.filter(q => q.episodeId === id).map(q => q.id),
  };
}

const out = {
  generatedAt: new Date().toISOString(),
  series: seriesStats.map(({ videoList, ...rest }) => ({ ...rest, videoList })),
  episodes: episodesOut,
  quotes,
  stats,
};

fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(out, null, 1), 'utf-8');
fs.writeFileSync(
  path.join(__dirname, 'data.js'),
  'window.__TLYL_DATA__ = ' + JSON.stringify(out) + ';',
  'utf-8'
);

console.log('系列：', seriesStats.map(s => `${s.name}(${s.episodes}期/${s.quotes}条/经典${s.classic})`).join('  '));
console.log('语录总数:', stats.quoteCount, ' 经典:', stats.classicCount, ' 视频:', stats.episodeCount, ' BV:', stats.bvidCount, ' 封面:', stats.coverCount);
console.log('最长语录:', stats.longestQuoteLen, '字');
console.log('已整理到:', stats.progress.join(' / '));
console.log('引用链接数:', quotes.reduce((a, q) => a + q.refs.length, 0));
