#!/usr/bin/env node
// heckler — adversarial analysis of prose meant for public consumption.
//
//   node bin/heckler.mjs report <files...> [--baseline corpus/baseline.json] [--json]
//   node bin/heckler.mjs baseline <files...> [-o corpus/baseline.json]
//   node bin/heckler.mjs arc <file>
//
// What it is: a stylometric linter plus a register-trajectory plotter. It
// flags the statistical tells of machine prose (uniform sentence rhythm,
// stock constructions, paragraph bows) and measures distance from a baseline
// derived from the owner's own writing. It is heuristics, not a detector —
// its job is to point a human editor at the paragraphs that need a human.
// No dependencies. Node >= 20.

import { readFileSync, writeFileSync } from 'node:fs';

// ---------- text mechanics -------------------------------------------------

const stripMd = (t) => t
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/^#+ .*$/gm, '')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[*_`]/g, '');

const paragraphs = (t) => stripMd(t).split(/\n\s*\n/)
  .map((p) => p.split('\n').filter((l) => !/^\s*(?:[-*+]|\d+[.)])\s/.test(l)).join(' '))
  .map((p) => p.replace(/\s+/g, ' ').trim())
  .filter((p) => p.split(/\s+/).length >= 12);

const sentences = (p) => p
  .split(/(?<=[.!?])\s+(?=["'“(]?[A-Z0-9])/)
  .map((s) => s.trim()).filter(Boolean);

const words = (t) => (t.toLowerCase().match(/[a-z’']+/g) ?? []);

const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

// ---------- tics: the tell patterns ---------------------------------------
// severity: 2 = machine smell, fix it; 1 = suspicious in quantity; 0 = note.

const TICS = [
  { id: 'not-just-but', sev: 2, re: /\bnot (?:just|only|merely|simply)\b[^.!?]{2,70}?\b(?:but|it['’]s|it is)\b/i,
    why: 'the "not just X, but Y" reflex' },
  { id: 'stock-verbs', sev: 2, re: /\b(?:delve|delves|delving|underscores?|highlights? the|showcases?|serves as|stands as|testament to|boasts?)\b/i,
    why: 'stock AI verb/phrase' },
  { id: 'vital-role', sev: 2, re: /\bplays? an? (?:vital|crucial|key|pivotal|essential) role\b/i,
    why: '"plays a vital role"' },
  { id: 'worth-noting', sev: 1, re: /\bit(?:['’]s| is) (?:worth noting|important to (?:note|remember|understand))\b/i,
    why: 'throat-clearing' },
  { id: 'transitions', sev: 1, re: /(?:^|[.!?]\s+)(?:Moreover|Furthermore|Additionally|That said|In essence|Notably|Crucially|Importantly),/,
    why: 'formal connective tissue' },
  { id: 'landscape', sev: 1, re: /\b(?:in today['’]s [a-z]+ (?:landscape|world|era)|ever-(?:evolving|changing)|rapidly (?:evolving|changing))\b/i,
    why: 'consultant filler' },
  { id: 'em-dash-aside', sev: 1, re: / — [^—]{3,60} — /,
    why: 'dramatic em-dash aside' },
  { id: 'bow', sev: 2, re: /(?:^|[.!?]\s+)(?:Ultimately|In short|In the end|Taken together|The result is|At its core|In other words|Simply put),/,
    why: 'paragraph tying itself in a bow' },
  { id: 'intensifiers', sev: 0, re: /\b(?:deeply|truly|incredibly|profoundly|genuinely|fundamentally)\b/i,
    why: 'empty intensifier' },
  { id: 'exclaim', sev: 1, re: /!(?!\])/, why: 'exclamation (house style: none)' },
];

// Voice markers — features of the owner's register. Presence is GOOD.
const VOICE = [
  { id: 'question-volley', test: (p) => {
      const s = sentences(p); let run = 0, best = 0;
      for (const x of s) { run = x.endsWith('?') ? run + 1 : 0; best = Math.max(best, run); }
      return best >= 2; },
    why: 'question volley aimed at the reader' },
  { id: 'first-person', test: (p) => /\b(?:I|my|me)\b/.test(p), why: 'first-person grounding' },
  { id: 'concrete-number', test: (p) => /\b\d[\d,.]*(?:%| percent| million| billion| tons?| years?| MAF| degrees)?\b/.test(p),
    why: 'concrete number' },
];

// ---------- feature extraction --------------------------------------------

const FN = ('the of and a to in is that it for on with as are this be we our by or an have from at but not they their has was can will would may more also these some such one all its into about than other which when what how if so do us you your i my there been were').split(' ');

function docFeatures(text) {
  const ps = paragraphs(text);
  const allW = words(text);
  const perPara = ps.map((p) => {
    const s = sentences(p);
    const lens = s.map((x) => words(x).length).filter((n) => n > 0);
    const cv = lens.length > 1 ? std(lens) / mean(lens) : 0;
    const tics = [];
    for (const t of TICS) { const m = p.match(t.re); if (m) tics.push({ id: t.id, sev: t.sev, why: t.why, at: m[0].slice(0, 48) }); }
    const voice = VOICE.filter((v) => v.test(p)).map((v) => v.id);
    return { text: p, nSent: s.length, meanLen: mean(lens), cv, tics, voice };
  });
  const fn = Object.fromEntries(FN.map((w) => [w, 0]));
  for (const w of allW) if (w in fn) fn[w]++;
  const n = allW.length || 1;
  for (const w of FN) fn[w] /= n;
  const punct = {};
  for (const [k, re] of Object.entries({ emdash: /—/g, semicolon: /;/g, colon: /:/g, question: /\?/g, exclaim: /!/g, paren: /\(/g }))
    punct[k] = ((text.match(re) ?? []).length / n) * 1000;
  const sentLens = perPara.flatMap((p) => sentences(p.text).map((s) => words(s).length));
  return {
    nWords: n, nParas: ps.length, perPara, fn, punct,
    burstiness: sentLens.length > 1 ? std(sentLens) / mean(sentLens) : 0,
    meanSentLen: mean(sentLens),
    ttr: new Set(allW).size / n,
    lyRate: allW.filter((w) => w.endsWith('ly') && w.length > 4).length / n * 1000,
    ticRate: perPara.reduce((a, p) => a + p.tics.filter((t) => t.sev >= 1).length, 0) / (ps.length || 1),
  };
}

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (const w of FN) { dot += (a[w] ?? 0) * (b[w] ?? 0); na += (a[w] ?? 0) ** 2; nb += (b[w] ?? 0) ** 2; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

// ---------- register arc ---------------------------------------------------

const LEX = {
  distress: 'crisis threat threats extinction collapse death dying dead loss grief fear worry worried pollution destroy destroying damage risk risks danger catastrophe disaster futility nihilism melancholia smother vulnerable drought flood refugee dissonant frustration ambivalence',
  agency: 'power powers tool tools build building create ability able understand understanding model models simulate simulation learn solve heal healing restore together participate community help improve succeed succeeded eradicating ingenuity',
  hope: 'hope hopeful future better beautiful love cherish joy happy thrive flourish rebound rebounding optimism opportunity possibility luckily blossomed',
};
for (const k of Object.keys(LEX)) LEX[k] = new Set(LEX[k].split(' '));

function arc(text) {
  const secs = text.split(/^## /m).filter((s) => s.trim());
  return secs.map((s) => {
    const title = s.split('\n')[0].trim().slice(0, 32) || '(untitled)';
    const w = words(s); const n = w.length || 1;
    const score = {};
    for (const [k, set] of Object.entries(LEX)) score[k] = w.filter((x) => set.has(x)).length / n * 1000;
    score.question = ((s.match(/\?/g) ?? []).length / n) * 1000;
    return { title, n, ...score };
  });
}

const BAR = ' ▁▂▃▄▅▆▇█';
const spark = (vals) => {
  const max = Math.max(...vals, 0.001);
  return vals.map((v) => BAR[Math.min(8, Math.round(v / max * 8))]).join('');
};

// ---------- CLI ------------------------------------------------------------

const [cmd, ...rest] = process.argv.slice(2);
const flags = {}; const files = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--baseline' || rest[i] === '-o') flags[rest[i].replace(/^-+/, '')] = rest[++i];
  else if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = true;
  else files.push(rest[i]);
}
const read = (f) => readFileSync(f, 'utf8');

if (cmd === 'baseline') {
  const feats = files.map((f) => docFeatures(read(f)));
  const agg = (get) => mean(feats.map(get));
  const fn = Object.fromEntries(FN.map((w) => [w, agg((x) => x.fn[w])]));
  const punct = Object.fromEntries(Object.keys(feats[0].punct).map((k) => [k, agg((x) => x.punct[k])]));
  const base = {
    from: files, generated: 'bin/heckler.mjs baseline',
    fn, punct,
    burstiness: agg((x) => x.burstiness), meanSentLen: agg((x) => x.meanSentLen),
    ttr: agg((x) => x.ttr), lyRate: agg((x) => x.lyRate), ticRate: agg((x) => x.ticRate),
  };
  const out = flags.o ?? 'corpus/baseline.json';
  writeFileSync(out, JSON.stringify(base, null, 1));
  console.log(`baseline -> ${out}  (burstiness ${base.burstiness.toFixed(2)}, mean sentence ${base.meanSentLen.toFixed(1)}w, tic rate ${base.ticRate.toFixed(2)}/para)`);
} else if (cmd === 'arc') {
  const rows = arc(read(files[0]));
  const chans = ['distress', 'agency', 'hope', 'question'];
  console.log('register trajectory by section (per-1000-word lexicon hits; crude, transparent):\n');
  for (const c of chans) console.log(`${c.padEnd(9)} ${spark(rows.map((r) => r[c]))}`);
  console.log('\nsections:');
  rows.forEach((r, i) => console.log(`  ${i + 1}. ${r.title}  (${r.n}w · d${r.distress.toFixed(1)} a${r.agency.toFixed(1)} h${r.hope.toFixed(1)} q${r.question.toFixed(1)})`));
} else if (cmd === 'report') {
  let base = null;
  try { base = JSON.parse(read(flags.baseline ?? new URL('../corpus/baseline.json', import.meta.url))); } catch {}
  const out = [];
  for (const f of files) {
    const d = docFeatures(read(f));
    const sim = base ? cosine(d.fn, base.fn) : null;
    const doc = { file: f, words: d.nWords, paragraphs: d.nParas,
      burstiness: +d.burstiness.toFixed(2), meanSentLen: +d.meanSentLen.toFixed(1),
      ticRate: +d.ticRate.toFixed(2), lyRate: +d.lyRate.toFixed(1),
      similarityToBaseline: sim && +sim.toFixed(3), flags: [] };
    if (base) {
      if (Math.abs(d.burstiness - base.burstiness) > 0.22) doc.flags.push(`sentence rhythm differs from corpus: burstiness ${d.burstiness.toFixed(2)} vs ${base.burstiness.toFixed(2)} (direction matters less than distance)`);
      if (d.ticRate > Math.max(0.25, base.ticRate * 2)) doc.flags.push(`tic rate ${d.ticRate.toFixed(2)}/para vs corpus ${base.ticRate.toFixed(2)}`);
      if (d.punct.emdash > base.punct.emdash * 3 + 0.5) doc.flags.push(`em-dash rate ${d.punct.emdash.toFixed(1)}/1000w vs corpus ${base.punct.emdash.toFixed(1)}`);
      if (sim < 0.97) doc.flags.push(`function-word fingerprint drifts from corpus (cos ${sim.toFixed(3)})`);
    }
    doc.worstParagraphs = d.perPara
      .map((p, i) => { const metro = p.cv < 0.30 && p.nSent >= 3 && !p.voice.includes('question-volley');
        return { i: i + 1, score: p.tics.reduce((a, t) => a + t.sev, 0) + (metro ? 1 : 0), metro, p }; })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score).slice(0, flags.json ? 99 : 6)
      .map((x) => { const { i, score, p } = x; return ({
        para: i, score,
        excerpt: p.text.slice(0, 90) + (p.text.length > 90 ? '…' : ''),
        tells: [
          ...p.tics.map((t) => `${t.why} ("${t.at}")`),
          ...(x.metro ? [`metronome rhythm (${p.nSent} sentences, cv ${p.cv.toFixed(2)})`] : []),
        ],
        voice: p.voice,
      }); });
    out.push(doc);
  }
  if (flags.json) console.log(JSON.stringify(out, null, 1));
  else for (const d of out) {
    console.log(`\n■ ${d.file} — ${d.words}w, ${d.paragraphs} paras · burstiness ${d.burstiness} · mean sentence ${d.meanSentLen}w · tics ${d.ticRate}/para` + (d.similarityToBaseline ? ` · fingerprint cos ${d.similarityToBaseline}` : ''));
    for (const f of d.flags) console.log(`  ⚠ ${f}`);
    if (!d.flags.length) console.log('  no document-level flags');
    for (const w of d.worstParagraphs) {
      console.log(`  ¶${w.para} (score ${w.score}): "${w.excerpt}"`);
      for (const t of w.tells) console.log(`     · ${t}`);
    }
    if (!d.worstParagraphs.length) console.log('  no paragraph-level tells found');
  }
} else {
  console.log('usage: heckler report <files…> [--baseline b.json] [--json] | baseline <files…> [-o out] | arc <file>');
  process.exit(1);
}
