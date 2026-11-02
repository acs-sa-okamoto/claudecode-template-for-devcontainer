#!/usr/bin/env node
'use strict';
// 変更前後を並べた確認ページ（review.html）を作る。ui-shots コマンドで動かす（Node があればそれでもよい）:
//   ui-shots <このスキル>/scripts/review.cjs --after .ui-shots/<名前>/r2 [--before .ui-shots/<名前>/r0]
//            [--findings .ui-shots/<名前>/findings.json] [--out .ui-shots/<名前>/review.html] [--title "…"]
// - --after だけなら、その回の画像と指摘を並べる（audit の結果を見せるとき）
// - 画像は相対パスで参照する（review.html だけを別の場所へ動かすと画像が見えなくなる）。外部への通信はしない
// - findings.json の書式は references/ui-rubric.md の「指摘の書き方」

const fs = require('fs');
const path = require('path');

const a = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i], v = argv[i + 1];
  if (['--after', '--before', '--findings', '--out', '--title'].includes(k) && v !== undefined) { a[k.slice(2)] = v; i++; }
  else { console.error(`[review] 知らない引数: ${k}`); process.exit(2); }
}
if (!a.after) { console.error('[review] --after（変更後の撮影結果のフォルダ）が要ります'); process.exit(2); }
const load = (dir) => {
  if (!dir) return null;
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'checks.json'), 'utf8')); }
  catch (e) { console.error(`[review] ${dir}/checks.json を読めません（${e.message.split('\n')[0]}）`); process.exit(2); }
};
const after = load(a.after), before = load(a.before);
let findings = [];
if (a.findings) {
  try { findings = JSON.parse(fs.readFileSync(a.findings, 'utf8')).items || []; }
  catch (e) { console.error(`[review] 指摘を読めません: ${a.findings}（${e.message.split('\n')[0]}）`); process.exit(2); }
}
const OUT = a.out || path.join(path.dirname(path.resolve(a.after)), 'review.html');
const title = a.title || (before ? 'UI の確認（変更前と変更後）' : 'UI の確認');
const rel = (dir, file) => (file ? path.relative(path.dirname(OUT), path.join(dir, file)).split(path.sep).join('/') : null);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const key = (r) => `${r.id}|${r.state}|${r.width}`;

function flags(r) {
  if (!r) return [];
  if (r.error) return [`開けなかった: ${r.error}`];
  const c = r.checks, out = [];
  if (!c) return out;
  if (c.hscroll) out.push(`横スクロール（${c.hscroll.documentWidth}px）`);
  if (c.clipped.length) out.push(`切れ ${c.clipped.length}`);
  if (c.overlaps.length) out.push(`重なり ${c.overlaps.length}`);
  for (const v of r.axe || []) out.push(`axe ${v.id}（${v.nodes}）`);
  if (r.focus && r.focus.invisible.length) out.push(`フォーカスが見えない ${r.focus.invisible.length}`);
  if (c.dummy.length) out.push(`ダミー文字 ${c.dummy.map((d) => d.text).join('・')}`);
  if (c.brokenImages.length) out.push(`壊れた画像 ${c.brokenImages.length}`);
  if (c.palette && c.palette.offPalette && c.palette.offPalette.length) out.push(`トークン外の色 ${c.palette.offPalette.length}`);
  if (c.typeScale && c.typeScale.offScale && c.typeScale.offScale.length) out.push(`段階外の文字サイズ ${c.typeScale.offScale.length}`);
  if (r.log && r.log.console.length) out.push(`コンソールのエラー ${r.log.console.length}`);
  if (r.log && r.log.http.length) out.push(`HTTP ${r.log.http.map((h) => h.status).join('・')}`);
  return out;
}
const total = (res) => (res ? res.screens.reduce((n, r) => n + flags(r).length, 0) : null);
const STATUS = { fixed: '直した', kept: '残した', backlog: 'backlog へ', proposal: '提案（導線・機能の変更）' };

function figure(label, dir, r) {
  if (!r) return `<figure class="empty"><figcaption>${esc(label)}: 撮影なし</figcaption></figure>`;
  const src = rel(dir, r.file);
  const f = flags(r);
  return `<figure><figcaption><b>${esc(label)}</b> ${r.width}px — ${f.length ? `A 層の候補 ${f.length}` : '候補なし'}</figcaption>`
    + (src ? `<a href="${esc(src)}" target="_blank"><img loading="lazy" src="${esc(src)}" alt="${esc(r.id)} ${esc(r.state)} ${r.width}px"></a>` : '<p class="note">画像なし</p>')
    + (f.length ? `<ul class="flags">${f.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '')
    + '</figure>';
}
function findingRows(items) {
  if (!items.length) return '';
  return `<table class="findings"><thead><tr><th>ID</th><th>状態・幅</th><th>層</th><th>基準</th><th>指摘</th><th>直し方</th><th>結果</th></tr></thead><tbody>`
    + items.map((f) => `<tr><td>${esc(f.id)}</td><td>${esc([f.state, f.width && f.width + 'px'].filter(Boolean).join(' / '))}</td><td>${esc(f.layer)}</td><td>${esc(f.rule)}</td><td>${esc(f.issue)}</td><td>${esc(f.fix)}</td>`
      + `<td class="st-${esc(f.status)}">${esc(STATUS[f.status] || f.status || '')}${f.reason ? `<br><span class="note">${esc(f.reason)}</span>` : ''}</td></tr>`).join('')
    + '</tbody></table>';
}

const byKeyBefore = new Map((before ? before.screens : []).map((r) => [key(r), r]));
const ids = [...new Set(after.screens.map((r) => r.id))];
const sections = ids.map((id) => {
  const recs = after.screens.filter((r) => r.id === id);
  const name = recs[0].name || '';
  const states = [...new Set(recs.map((r) => r.state))];
  const body = states.map((st) => {
    const pairs = recs.filter((r) => r.state === st).map((r) => {
      const b = byKeyBefore.get(key(r));
      return `<div class="pair${before ? '' : ' single'}">${before ? figure('変更前', a.before, b) : ''}${figure(before ? '変更後' : '撮影', a.after, r)}</div>`;
    }).join('');
    return `<h3>${esc(st === 'default' ? '通常' : st)}</h3>${pairs}`;
  }).join('');
  return `<section id="${esc(id)}"><h2>${esc(id)} ${esc(name)}</h2>${body}${findingRows(findings.filter((f) => f.screen === id))}</section>`;
}).join('');

const journeyHtml = after.journeys && after.journeys.length ? `<section id="journeys"><h2>導線</h2>` + after.journeys.map((j) => {
  const bj = before && before.journeys ? before.journeys.find((x) => x.id === j.id && x.width === j.width) : null;
  const strip = (dir, rec, label) => rec ? `<p class="note">${esc(label)}: 手数 ${rec.hands}${rec.budget != null ? ` / 予算 ${rec.budget}` : ''}${rec.overBudget ? '（予算超え）' : ''}${rec.error ? ` — ${esc(rec.error)}` : ''}</p><div class="strip">`
    + rec.steps.filter((s) => s.file).map((s) => `<figure><figcaption>${s.n}. ${esc(s.shot || s.did)}</figcaption><a href="${esc(rel(dir, s.file))}" target="_blank"><img loading="lazy" src="${esc(rel(dir, s.file))}" alt=""></a></figure>`).join('') + '</div>' : '';
  return `<h3>${esc(j.id)} ${esc(j.name || '')} — ${j.width}px</h3>${bj ? strip(a.before, bj, '変更前') : ''}${strip(a.after, j, before ? '変更後' : '撮影')}${findingRows(findings.filter((f) => f.journey === j.id))}`;
}).join('') + '</section>' : '';
const others = findings.filter((f) => !f.screen && !f.journey);
const counts = Object.keys(STATUS).map((s) => [s, findings.filter((f) => f.status === s).length]).filter(([, n]) => n);

const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--ink:#0F1115;--muted:#6B7280;--pale:#CBD8E5;--pale-weak:#E5ECF2;--hairline:#E5E7EB;--danger:#DC2626;--success:#2E7D32}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--ink);font:16px/1.7 "BIZ UDPGothic","Yu Gothic UI","Yu Gothic","Meiryo","Hiragino Sans","Noto Sans JP",sans-serif}
header{background:var(--pale);padding:24px 32px}
h1{font-size:28px;line-height:1.4;margin:0 0 8px}
h2{font-size:22px;line-height:1.4;margin:48px 0 8px}
h3{font-size:18px;line-height:1.4;margin:24px 0 8px}
main{padding:0 32px 64px}
.meta{margin:0;color:#4B5563;font-size:14px}
.summary{display:flex;flex-wrap:wrap;gap:8px 24px;margin-top:16px;font-size:14px}
.summary b{font-size:18px}
nav{margin-top:16px;font-size:14px;display:flex;flex-wrap:wrap;gap:4px 16px}
nav a{color:var(--ink)}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:8px 0 16px}
.pair.single{grid-template-columns:1fr}
figure{margin:0;border:1px solid var(--hairline);padding:8px;min-width:0}
figure.empty{display:flex;align-items:center;justify-content:center;color:var(--muted)}
figcaption{font-size:14px;margin-bottom:8px}
img{display:block;max-width:100%;height:auto;border:1px solid var(--hairline)}
.pair img{max-height:900px;object-fit:contain;object-position:top left}
.flags{margin:8px 0 0;padding-left:20px;font-size:14px}
.note{color:var(--muted);font-size:14px}
.strip{display:flex;gap:8px;overflow-x:auto;padding-bottom:8px}
.strip figure{flex:0 0 280px}
table{border-collapse:collapse;width:100%;margin:16px 0;font-size:14px;line-height:1.5}
th{text-align:left;border-bottom:2px solid var(--ink);padding:8px}
td{border-bottom:1px solid var(--hairline);padding:8px;vertical-align:top}
.st-fixed{color:var(--success);font-weight:700}
.st-kept,.st-backlog,.st-proposal{font-weight:700}
a:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
@media (max-width:767px){header,main{padding-left:16px;padding-right:16px}.pair{grid-template-columns:1fr}}
</style></head><body>
<header>
<h1>${esc(title)}</h1>
<p class="meta">撮影 ${esc(after.run.date)}${before ? ` ／ 比較元 ${esc(before.run.date)}` : ''} ／ ${esc(after.run.baseUrl)}</p>
<div class="summary">
<span>A 層の候補（機械判定）: ${before ? `<b>${total(before)}</b> → ` : ''}<b>${total(after)}</b></span>
${counts.map(([s, n]) => `<span>${esc(STATUS[s])}: <b>${n}</b></span>`).join('')}
</div>
<nav>${ids.map((id) => `<a href="#${esc(id)}">${esc(id)}</a>`).join('')}${journeyHtml ? '<a href="#journeys">導線</a>' : ''}</nav>
</header>
<main>
${sections}
${journeyHtml}
${others.length ? `<section><h2>画面をまたぐ指摘</h2>${findingRows(others)}</section>` : ''}
</main></body></html>
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`[review] 書き出し: ${OUT}`);
