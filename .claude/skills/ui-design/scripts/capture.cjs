#!/usr/bin/env node
'use strict';
// ui-design の撮影と機械判定。ui-shots コマンドで動かす:
//   ui-shots <このスキル>/scripts/capture.cjs --config docs/ui/screens.json --out .ui-shots/<名前>/<回>
//
// 画面台帳（screens.json）の画面を「状態 × 幅」ごとに撮影し、A 層（欠陥）の候補を機械で判定して
// <out>/checks.json と <out>/summary.md に書く。導線（journeys）は1手ずつ動かして撮影し、手数を数える。
// 書式は references/screens-json.md。
//
// - 依存（playwright・axe-core）は ui-shots の置き場所（UI_SHOTS_HOME）から読む。無ければプロジェクトの
//   node_modules を試す（プロジェクトの Playwright と版が食い違うと Chromium が見つからないことがある）。
// - ログイン情報などは ${env:名前} で書き、値は環境変数か .env から読む。値は表示もファイル出力もしない。
// - <out> が .ui-shots/ の下なら、.git/info/exclude に .ui-shots/ を足す（撮影画像を git に入れない。
//   プロジェクトの .gitignore は書き換えない）。
// 終了コード: 0 = 撮影できた（指摘の有無は問わない）/ 1 = 開けなかった画面がある / 2 = 使い方・設定の誤り

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------- 引数と設定
function parseArgs(argv) {
  const a = { config: 'docs/ui/screens.json', screens: 'all', states: 'all', journeys: 'all', maxHeight: 6000, axe: true, shots: true };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => { if (i + 1 >= argv.length) usage(`${k} に値がありません`); return argv[++i]; };
    switch (k) {
      case '--config': a.config = next(); break;
      case '--out': a.out = next(); break;
      case '--screens': a.screens = next(); break;
      case '--states': a.states = next(); break;
      case '--widths': a.widths = next().split(',').map(Number).filter(Boolean); break;
      case '--journeys': a.journeys = next(); break;
      case '--base-url': a.baseUrl = next(); break;
      case '--max-height': a.maxHeight = Number(next()) || 6000; break;
      case '--no-axe': a.axe = false; break;
      case '--no-shots': a.shots = false; break;
      case '-h': case '--help': usage(); break;
      default: usage(`知らない引数: ${k}`);
    }
  }
  if (!a.out) usage('--out（出力先）が要ります');
  return a;
}
function usage(msg) {
  if (msg) console.error(`[capture] ${msg}`);
  console.error([
    '使い方: ui-shots capture.cjs --out <出力先> [--config docs/ui/screens.json]',
    '        [--screens SCR-01,SCR-02|all] [--states default,empty,error,long|all] [--widths 375,768,1440]',
    '        [--journeys J-01|all|none] [--base-url URL] [--max-height 6000] [--no-axe] [--no-shots]',
  ].join('\n'));
  process.exit(msg ? 2 : 0);
}
const ARGS = parseArgs(process.argv.slice(2));
function lib(name) {
  const home = process.env.UI_SHOTS_HOME;
  try { return require(require.resolve(name, { paths: [home || process.cwd()] })); } catch { return null; }
}
const playwright = lib('playwright');
if (!playwright) {
  console.error('[capture] Playwright が見つかりません。ui-shots コマンドで動かしてください（ui-shots --check で道具を確認）');
  process.exit(2);
}
let CONFIG;
try { CONFIG = JSON.parse(fs.readFileSync(ARGS.config, 'utf8')); }
catch (e) { console.error(`[capture] 画面台帳を読めません: ${ARGS.config}（${e.message.split('\n')[0]}）`); process.exit(2); }
const BASE_URL = ARGS.baseUrl || CONFIG.baseUrl;
if (!BASE_URL) { console.error('[capture] baseUrl がありません（screens.json の baseUrl か --base-url）'); process.exit(2); }
const WIDTHS = ARGS.widths || CONFIG.widths || [375, 768, 1440];
const OUT = path.resolve(ARGS.out);

// ---------------------------------------------------------------- .env と ${env:名前}
const DOTENV = (() => {
  const m = {};
  try {
    for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
      const mm = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!mm) continue;
      let v = mm[2];
      if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
      m[mm[1]] = v;
    }
  } catch { /* .env が無いのは普通 */ }
  return m;
})();
const usesEnv = (v) => typeof v === 'string' && /\$\{env:/.test(v);
function subst(v) {
  if (typeof v !== 'string') return v;
  return v.replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, n) => {
    const x = process.env[n] !== undefined ? process.env[n] : DOTENV[n];
    if (x === undefined) throw new Error(`環境変数 ${n} がありません（.env に書くか export してください。値は表示しません）`);
    return x;
  });
}
const urlOf = (p) => new URL(p, BASE_URL).toString();

// ---------------------------------------------------------------- 色・寸法の正規化
const NAMED = { transparent: [0, 0, 0, 0], white: [255, 255, 255, 1], black: [0, 0, 0, 1] };
function parseColor(s) {
  if (!s) return null;
  s = String(s).trim().toLowerCase();
  if (NAMED[s]) return NAMED[s];
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    if (p.length < 3) return null;
    const ch = (x) => (x.endsWith('%') ? Math.round(parseFloat(x) * 2.55) : Math.round(parseFloat(x)));
    const al = p[3] === undefined ? 1 : (p[3].endsWith('%') ? parseFloat(p[3]) / 100 : parseFloat(p[3]));
    return [ch(p[0]), ch(p[1]), ch(p[2]), al];
  }
  m = s.match(/^hsla?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    const h = ((parseFloat(p[0]) % 360) + 360) % 360 / 360, sat = parseFloat(p[1]) / 100, l = parseFloat(p[2]) / 100;
    const al = p[3] === undefined ? 1 : (p[3].endsWith('%') ? parseFloat(p[3]) / 100 : parseFloat(p[3]));
    const f = (n) => { const k = (n + h * 12) % 12; const a = sat * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4), al];
  }
  return null;
}
const hex = (c) => '#' + c.slice(0, 3).map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
function toPx(v) {
  const m = String(v).trim().match(/^(-?[\d.]+)(px|rem|em)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] === 'rem' || m[2] === 'em' ? n * 16 : n;
}
// トークン（CSS 変数）から、許す色と文字サイズを取り出す
function tokensFrom(vars) {
  const palette = new Map(), sizes = new Set();
  for (const [name, value] of Object.entries(vars)) {
    const c = parseColor(value);
    if (c && c[3] > 0) palette.set(hex(c), name);
    if (/font-size|^--text-(?!.*(color|shadow|decoration))/.test(name)) { const px = toPx(value); if (px) sizes.add(Math.round(px * 4) / 4); }
  }
  return { palette, sizes };
}
function readTokenFile(file) {
  const vars = {};
  const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)[;}]/g)) vars[m[1]] = m[2].trim();
  return vars;
}

// ---------------------------------------------------------------- ページ内の機械判定（A 層の候補）
function inPageChecks(width) {
  // 比べる幅は撮影の幅（スマホとして描くと、はみ出したページを縮めて収めるので window.innerWidth は当てにならない）
  const vw = width || window.innerWidth;
  const out = { hscroll: null, clipped: [], offscreen: [], overlaps: [], dummy: [], brokenImages: [], colors: {}, fontSizes: {} };
  const doc = document.documentElement;
  const docW = Math.max(doc.scrollWidth, document.body ? document.body.scrollWidth : 0);
  if (docW > vw + 1) out.hscroll = { documentWidth: docW, viewportWidth: vw };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const where = (el) => {
    const parts = [];
    let e = el;
    for (let d = 0; e && e.nodeType === 1 && d < 4; d++, e = e.parentElement) {
      let s = e.tagName.toLowerCase();
      if (e.id) { parts.unshift(s + '#' + e.id); break; }
      const cls = [...e.classList].filter((c) => !c.startsWith('data-')).slice(0, 2).join('.');
      if (cls) s += '.' + cls;
      parts.unshift(s);
    }
    return parts.join(' > ');
  };
  const label = (el) => (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('alt') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  // 横に動かせる入れ物（表を包む overflow-x: auto など）の中なら、画面の外にあっても動かせば見える
  const inScroller = (el) => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 1) return true;
    }
    return false;
  };
  const add = (map, key, el) => {
    const m = map[key] || (map[key] = { count: 0, examples: [] });
    m.count++;
    if (m.examples.length < 3) m.examples.push(where(el));
  };
  const els = [...document.querySelectorAll('body *')].filter((el) => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'BR'].includes(el.tagName));
  for (const el of els) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const text = ownText(el);
    if (text) {
      const clipX = el.scrollWidth > el.clientWidth + 1 && /hidden|clip/.test(cs.overflowX);
      const clipY = el.scrollHeight > el.clientHeight + 1 && /hidden|clip/.test(cs.overflowY);
      const intended = cs.textOverflow === 'ellipsis' || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none');
      if ((clipX || clipY) && !intended && out.clipped.length < 20) out.clipped.push({ where: where(el), text: label(el), direction: clipX ? 'x' : 'y' });
      if ((r.right > vw + 1 || r.left < -1) && out.offscreen.length < 20 && !inScroller(el)) out.offscreen.push({ where: where(el), text: label(el), left: Math.round(r.left), right: Math.round(r.right) });
      add(out.fontSizes, String(Math.round(parseFloat(cs.fontSize) * 4) / 4), el);
      add(out.colors, cs.color, el);
    }
    if (!/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) add(out.colors, cs.backgroundColor, el);
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      if (parseFloat(cs['border' + side + 'Width']) > 0 && cs['border' + side + 'Style'] !== 'none') add(out.colors, cs['border' + side + 'Color'], el);
    }
    if (el.tagName === 'IMG' && el.complete && el.naturalWidth === 0) out.brokenImages.push({ where: where(el), src: (el.getAttribute('src') || '').slice(0, 80) });
  }
  for (const el of document.querySelectorAll('svg path, svg circle, svg rect, svg line, svg polyline, svg polygon, svg ellipse')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.fill && cs.fill !== 'none' && !/^url/.test(cs.fill)) add(out.colors, cs.fill, el);
    if (cs.stroke && cs.stroke !== 'none' && !/^url/.test(cs.stroke)) add(out.colors, cs.stroke, el);
  }
  // 押せる物どうしの重なり（親子は除く。重なった中心で一番上にある物が、どちらかの中なら本物の重なり）
  const sel = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=checkbox], [role=tab], [tabindex]:not([tabindex="-1"])';
  const inter = [...document.querySelectorAll(sel)].filter((el) => visible(el) && !el.closest('[inert], [aria-hidden="true"]')).slice(0, 300);
  const rects = inter.map((el) => el.getBoundingClientRect());
  for (let i = 0; i < inter.length && out.overlaps.length < 20; i++) {
    for (let j = i + 1; j < inter.length && out.overlaps.length < 20; j++) {
      const a = inter[i], b = inter[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = rects[i], rb = rects[j];
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w <= 2 || h <= 2) continue;
      const small = Math.min(ra.width * ra.height, rb.width * rb.height);
      if (w * h < small * 0.1) continue;
      const cx = Math.max(ra.left, rb.left) + w / 2, cy = Math.max(ra.top, rb.top) + h / 2;
      const top = document.elementFromPoint(cx, cy);
      if (top && (a.contains(top) || b.contains(top))) out.overlaps.push({ a: where(a) + ' 「' + label(a) + '」', b: where(b) + ' 「' + label(b) + '」' });
    }
  }
  // ダミー文字・表示の崩れ（undefined・NaN・[object Object]・埋め込み忘れの {{ }} など）
  const body = document.body ? document.body.innerText : '';
  const re = /lorem ipsum|\[object Object\]|\bundefined\b|\bNaN\b|\bnull\b|\{\{[^}\n]{0,40}\}\}|\bTODO\b|\bFIXME\b|ダミー/gi;
  const seen = new Set();
  for (const m of body.matchAll(re)) {
    const key = m[0].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.dummy.push({ text: m[0], context: body.slice(Math.max(0, m.index - 15), m.index + m[0].length + 15).replace(/\s+/g, ' ') });
  }
  return out;
}
function inPageVars() {
  const names = new Set();
  const walk = (rules) => { for (const r of rules) { if (r.style) for (const p of r.style) if (p.startsWith('--')) names.add(p); if (r.cssRules) walk(r.cssRules); } };
  for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { /* 別オリジンの CSS は読めない */ } }
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  for (const n of names) { const v = cs.getPropertyValue(n).trim(); if (v) out[n] = v; }
  return out;
}

// フォーカスの見え方: Tab で順に移り、フォーカス中と外したときで見た目が変わらない物を拾う
async function focusCheck(page, max = 25) {
  await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); window.scrollTo(0, 0); });
  const focused = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate((i) => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      if (el.hasAttribute('data-uishots-focus')) return { repeat: true };
      el.setAttribute('data-uishots-focus', String(i));
      const cs = getComputedStyle(el);
      const st = [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.borderColor, cs.borderWidth, cs.backgroundColor, cs.color, cs.textDecorationLine].join('|');
      return { i, tag: el.tagName.toLowerCase(), text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30), st };
    }, i);
    if (!info || info.repeat) break;
    focused.push(info);
  }
  const plain = await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const m = {};
    for (const el of document.querySelectorAll('[data-uishots-focus]')) {
      const cs = getComputedStyle(el);
      m[el.getAttribute('data-uishots-focus')] = [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.borderColor, cs.borderWidth, cs.backgroundColor, cs.color, cs.textDecorationLine].join('|');
      el.removeAttribute('data-uishots-focus');
    }
    return m;
  });
  return { tabbed: focused.length, invisible: focused.filter((f) => plain[f.i] !== undefined && plain[f.i] === f.st).map((f) => ({ tag: f.tag, text: f.text })) };
}

// ---------------------------------------------------------------- 状態（API の応答の差し替え）
const LONG_KEYS = /(title|name|label|desc|description|comment|note|body|text|summary|subject|message|address|company|memo|content|caption)/i;
const LONG_FILL = '（長い文字列の確認用）あいうえおかきくけこさしすせそたちつてとなにぬねの';
function lengthen(v, keys, key) {
  if (Array.isArray(v)) return v.map((x) => lengthen(x, keys, key));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = lengthen(x, keys, k); return o; }
  if (typeof v === 'string' && key && keys.test(key) && v.length < 60 && !/^(https?:|\/|\d{4}-\d{2}-\d{2})/.test(v)) return v + LONG_FILL;
  return v;
}
async function applyState(page, spec) {
  for (const r of spec.routes || []) {
    await page.route(r.url, async (route) => {
      try {
        if (r.transform === 'long') {
          const resp = await route.fetch();
          let json;
          try { json = await resp.json(); } catch { return route.fulfill({ response: resp }); }
          const keys = r.keys ? new RegExp('^(' + r.keys.join('|') + ')$') : LONG_KEYS;
          return route.fulfill({ response: resp, json: lengthen(json, keys) });
        }
        if (r.abort) return route.abort();
        return route.fulfill({
          status: r.status || 200,
          contentType: r.json !== undefined ? 'application/json' : (r.contentType || 'text/plain; charset=utf-8'),
          body: r.json !== undefined ? JSON.stringify(r.json) : (r.body || ''),
        });
      } catch { try { await route.continue(); } catch { /* 済み */ } }
    });
  }
}

// ---------------------------------------------------------------- 導線の手
function locate(page, t) {
  if (typeof t === 'string') return page.getByText(t).first();
  if (t.role) return page.getByRole(t.role, t.name !== undefined ? { name: t.name, exact: !!t.exact } : {}).first();
  if (t.label) return page.getByLabel(t.label, { exact: !!t.exact }).first();
  if (t.placeholder) return page.getByPlaceholder(t.placeholder).first();
  if (t.testId) return page.getByTestId(t.testId).first();
  if (t.text) return page.getByText(t.text, { exact: !!t.exact }).first();
  if (t.selector) return page.locator(t.selector).first();
  throw new Error('対象の指定がありません（role / label / text / placeholder / testId / selector のどれか）');
}
const describe = (t) => (typeof t === 'string' ? `text=${t}` : Object.entries(t).filter(([k]) => !['value', 'option', 'exact'].includes(k)).map(([k, v]) => `${k}=${v}`).join(' '));
const COUNTED = ['click', 'select', 'check', 'uncheck', 'press'];
async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true)).catch(() => {});
  await page.waitForTimeout(200);
}
async function runStep(page, step) {
  const T = 10000;
  if (step.goto !== undefined) { await page.goto(urlOf(subst(step.goto)), { waitUntil: 'load', timeout: 30000 }); return `goto ${step.goto}`; }
  if (step.click) { await locate(page, step.click).click({ timeout: T }); return `click ${describe(step.click)}`; }
  if (step.hover) { await locate(page, step.hover).hover({ timeout: T }); return `hover ${describe(step.hover)}`; }
  if (step.fill) { await locate(page, step.fill).fill(subst(String(step.fill.value ?? '')), { timeout: T }); return `fill ${describe(step.fill)}`; }
  if (step.select) { await locate(page, step.select).selectOption(subst(String(step.select.option)), { timeout: T }); return `select ${describe(step.select)}`; }
  if (step.check) { await locate(page, step.check).check({ timeout: T }); return `check ${describe(step.check)}`; }
  if (step.uncheck) { await locate(page, step.uncheck).uncheck({ timeout: T }); return `uncheck ${describe(step.uncheck)}`; }
  if (step.press) { await page.keyboard.press(step.press); return `press ${step.press}`; }
  if (step.waitFor) {
    const w = step.waitFor;
    if (w.text) await page.getByText(w.text).first().waitFor({ timeout: 15000 });
    else if (w.selector) await page.locator(w.selector).first().waitFor({ timeout: 15000 });
    else if (w.url) await page.waitForURL(w.url, { timeout: 15000 });
    else if (w.ms) await page.waitForTimeout(Number(w.ms));
    return `waitFor ${describe(w)}`;
  }
  if (step.shot) return 'shot';
  throw new Error(`知らない手: ${JSON.stringify(Object.keys(step))}`);
}

// ---------------------------------------------------------------- 本体
const slug = (s) => String(s).replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40);
function contextOptions(width, storageState) {
  const mobile = width < 768;
  return {
    viewport: { width, height: mobile ? 812 : width < 1200 ? 1024 : 900 },
    deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile,
    locale: 'ja-JP', timezoneId: 'Asia/Tokyo', colorScheme: 'light', reducedMotion: 'reduce',
    bypassCSP: true, ignoreHTTPSErrors: true,
    ...(storageState ? { storageState } : {}),
  };
}
const FREEZE = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important}';
function watch(page) {
  const log = { console: [], http: [], failed: [] };
  page.on('console', (m) => { if (m.type() === 'error' && log.console.length < 20) log.console.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => { if (log.console.length < 20) log.console.push('pageerror: ' + String(e.message).split('\n')[0].slice(0, 200)); });
  page.on('response', (r) => { if (r.status() >= 400 && log.http.length < 20) log.http.push({ status: r.status(), url: r.url().slice(0, 160) }); });
  page.on('requestfailed', (r) => { const f = r.failure(); if (log.failed.length < 20 && !(f && /ERR_ABORTED/.test(f.errorText))) log.failed.push({ url: r.url().slice(0, 160), error: f ? f.errorText : '' }); });
  return log;
}
function ensureExcluded() {
  if (!/(^|[\\/])\.ui-shots([\\/]|$)/.test(OUT)) return;
  try {
    const { execSync } = require('child_process');
    const gitDir = execSync('git rev-parse --git-common-dir', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const file = path.join(gitDir, 'info', 'exclude');
    const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (!/^\/?\.ui-shots\/?\s*$/m.test(cur)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, (cur && !cur.endsWith('\n') ? '\n' : '') + '# ui-design の撮影画像（git に入れない）\n.ui-shots/\n');
    }
  } catch { /* git 管理外なら何もしない */ }
}

(async () => {
  fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'journeys'), { recursive: true });
  ensureExcluded();
  const axePath = (() => { const home = process.env.UI_SHOTS_HOME; try { return require.resolve('axe-core/axe.min.js', { paths: [home || process.cwd()] }); } catch { return null; } })();
  const axeSource = ARGS.axe && axePath ? fs.readFileSync(axePath, 'utf8') : null;
  if (ARGS.axe && !axeSource) console.error('[capture] axe-core が見つからないので、アクセシビリティの自動チェックは飛ばします');
  const fileTokens = CONFIG.tokens && fs.existsSync(CONFIG.tokens) ? tokensFrom(readTokenFile(CONFIG.tokens)) : null;
  if (CONFIG.tokens && !fileTokens) console.error(`[capture] トークンファイルが見つかりません: ${CONFIG.tokens}（ページの CSS 変数で代わりに判定します）`);

  const browser = await playwright.chromium.launch({ args: ['--disable-dev-shm-usage', '--font-render-hinting=none', '--lang=ja-JP'] });
  const result = {
    run: { date: new Date().toISOString(), baseUrl: BASE_URL, widths: WIDTHS, config: ARGS.config, chromium: browser.version(), tokens: CONFIG.tokens || '(ページの CSS 変数)' },
    auth: null, screens: [], journeys: [],
  };

  // ログイン（要る画面・導線があるときだけ。1回だけ行い、状態を使い回す）
  const wantScreens = ARGS.screens === 'all' ? null : new Set(ARGS.screens.split(','));
  const screens = (CONFIG.screens || []).filter((s) => !wantScreens || wantScreens.has(s.id));
  const wantJourneys = ARGS.journeys === 'all' ? null : ARGS.journeys === 'none' ? new Set() : new Set(ARGS.journeys.split(','));
  const journeys = (CONFIG.journeys || []).filter((j) => !wantJourneys || wantJourneys.has(j.id));
  let storage = null;
  if (CONFIG.auth && [...screens, ...journeys].some((x) => x.login)) {
    const ctx = await browser.newContext(contextOptions(1440));
    const page = await ctx.newPage();
    try {
      for (const st of CONFIG.auth.steps || []) { await runStep(page, st); await settle(page); }
      storage = await ctx.storageState();
      result.auth = { ok: true };
    } catch (e) {
      result.auth = { ok: false, error: String(e.message).split('\n')[0] };
      console.error(`[capture] ログインに失敗: ${result.auth.error}（ログインが要る画面は飛ばします）`);
    }
    await ctx.close();
  }

  let failedScreens = 0;
  for (const s of screens) {
    const defined = Object.keys(s.states || {});
    const states = ['default', ...defined].filter((st) => ARGS.states === 'all' || ARGS.states.split(',').includes(st));
    for (const state of states) {
      for (const width of s.widths || WIDTHS) {
        const rec = { id: s.id, name: s.name, path: s.path, state, width, file: null, checks: null, focus: null, axe: null, log: null, error: null };
        result.screens.push(rec);
        if (s.login && !(storage)) { rec.error = 'ログインできなかったので飛ばした'; failedScreens++; continue; }
        const ctx = await browser.newContext(contextOptions(width, s.login ? storage : null));
        const page = await ctx.newPage();
        rec.log = watch(page);
        try {
          if (state !== 'default') await applyState(page, s.states[state]);
          const resp = await page.goto(urlOf(s.path), { waitUntil: 'load', timeout: 30000 });
          rec.status = resp ? resp.status() : null;
          await page.addStyleTag({ content: FREEZE }).catch(() => {});
          if (s.waitFor) await runStep(page, { waitFor: s.waitFor });
          await settle(page);
          if (ARGS.shots) {
            const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0));
            rec.file = path.join('shots', `${slug(s.id)}__${slug(state)}__${width}.png`);
            rec.pageHeight = h;
            // fullPage: false … 画面に見えている範囲だけ（ダイアログなど、画面に固定された物を見るとき）
            if (s.fullPage === false) await page.screenshot({ path: path.join(OUT, rec.file) });
            else await page.screenshot({ path: path.join(OUT, rec.file), fullPage: true, clip: { x: 0, y: 0, width, height: Math.max(1, Math.min(h, ARGS.maxHeight)) } });
          }
          rec.checks = await page.evaluate(inPageChecks, width);
          const tk = fileTokens || tokensFrom(await page.evaluate(inPageVars));
          rec.checks.palette = summarizeColors(rec.checks.colors, tk.palette);
          rec.checks.typeScale = summarizeSizes(rec.checks.fontSizes, tk.sizes);
          delete rec.checks.colors; delete rec.checks.fontSizes;
          if (axeSource) {
            await page.addScriptTag({ content: axeSource });
            const ax = await page.evaluate(async () => {
              // preload: false … axe が CSS を取り直しに行かない（file:// の画面で余計なエラーを出さない）
              const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'], preload: false });
              return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 5).map((n) => String(n.target && n.target[0])) }));
            });
            rec.axe = ax;
          }
          rec.focus = await focusCheck(page);
        } catch (e) {
          rec.error = String(e.message).split('\n')[0].slice(0, 300);
          failedScreens++;
        }
        await ctx.close();
        console.log(`[capture] ${s.id} ${state} ${width}px … ${rec.error ? '失敗: ' + rec.error : 'A 層の候補 ' + countA(rec) + ' 件'}`);
      }
    }
  }

  for (const j of journeys) {
    for (const width of j.widths || [1440, 375]) {
      const rec = { id: j.id, name: j.name, story: j.story || null, width, budget: j.budget ?? null, hands: 0, steps: [], error: null, log: null };
      result.journeys.push(rec);
      if (j.login && !storage) { rec.error = 'ログインできなかったので飛ばした'; continue; }
      const ctx = await browser.newContext(contextOptions(width, j.login ? storage : null));
      const page = await ctx.newPage();
      rec.log = watch(page);
      let n = 0;
      try {
        for (const st of j.steps || []) {
          n++;
          const action = Object.keys(st).find((k) => k !== 'shot') || 'shot';
          const did = await runStep(page, st);
          if (COUNTED.includes(action)) rec.hands++;
          if (action === 'goto') await page.addStyleTag({ content: FREEZE }).catch(() => {});
          await settle(page);
          const step = { n, did, file: null };
          if (st.shot && ARGS.shots) {
            step.file = path.join('journeys', `${slug(j.id)}__${String(n).padStart(2, '0')}-${slug(st.shot)}__${width}.png`);
            step.shot = st.shot;
            await page.screenshot({ path: path.join(OUT, step.file), fullPage: false });
          }
          rec.steps.push(step);
        }
      } catch (e) {
        rec.error = `手 ${n} で失敗: ${String(e.message).split('\n')[0].slice(0, 200)}`;
        const f = path.join('journeys', `${slug(j.id)}__${String(n).padStart(2, '0')}-失敗__${width}.png`);
        await page.screenshot({ path: path.join(OUT, f) }).catch(() => {});
        rec.steps.push({ n, did: '失敗', file: f });
      }
      rec.overBudget = rec.budget != null ? rec.hands > rec.budget : null;
      await ctx.close();
      console.log(`[capture] 導線 ${j.id} ${width}px … ${rec.error || `手数 ${rec.hands}${rec.budget != null ? ' / 予算 ' + rec.budget : ''}`}`);
    }
  }
  await browser.close();

  fs.writeFileSync(path.join(OUT, 'checks.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(OUT, 'summary.md'), summaryMd(result));
  console.log(`[capture] 書き出し: ${path.join(ARGS.out, 'checks.json')} / ${path.join(ARGS.out, 'summary.md')}`);
  process.exit(failedScreens ? 1 : 0);
})().catch((e) => { console.error('[capture] 止まりました: ' + String(e && e.message || e).split('\n')[0]); process.exit(1); });

// ---------------------------------------------------------------- 集計と要約
function summarizeColors(colors, palette) {
  if (!palette || palette.size === 0) return { skipped: 'トークン（色の CSS 変数）が見つからない' };
  const off = [];
  for (const [css, v] of Object.entries(colors)) {
    const c = parseColor(css);
    if (!c || c[3] === 0) continue;
    const h = hex(c);
    if (!palette.has(h)) off.push({ color: h + (c[3] < 1 ? ` (透明度 ${Math.round(c[3] * 100)}%)` : ''), count: v.count, examples: v.examples });
  }
  off.sort((a, b) => b.count - a.count);
  return { allowed: palette.size, offPalette: off.slice(0, 15) };
}
function summarizeSizes(sizes, scale) {
  if (!scale || scale.size === 0) return { skipped: 'トークン（文字サイズの CSS 変数）が見つからない' };
  const off = [];
  for (const [px, v] of Object.entries(sizes)) {
    if (![...scale].some((s) => Math.abs(s - Number(px)) < 0.3)) off.push({ size: `${px}px`, count: v.count, examples: v.examples });
  }
  off.sort((a, b) => b.count - a.count);
  return { scale: [...scale].sort((a, b) => a - b).map((x) => `${x}px`), offScale: off.slice(0, 10) };
}
function countA(r) {
  if (!r.checks) return 0;
  const c = r.checks;
  return (c.hscroll ? 1 : 0) + c.clipped.length + c.overlaps.length + c.dummy.length + c.brokenImages.length
    + (c.palette.offPalette ? c.palette.offPalette.length : 0) + (c.typeScale.offScale ? c.typeScale.offScale.length : 0)
    + (r.axe ? r.axe.length : 0) + (r.focus ? r.focus.invisible.length : 0)
    + (r.log ? r.log.console.length + r.log.http.length + r.log.failed.length : 0);
}
function summaryMd(res) {
  const L = [];
  L.push('# 撮影と機械判定の結果', '');
  L.push(`- 日時: ${res.run.date}`, `- 対象: ${res.run.baseUrl}（幅 ${res.run.widths.join(' / ')}px）`, `- トークン: ${res.run.tokens}`, `- Chromium: ${res.run.chromium}`);
  if (res.auth) L.push(`- ログイン: ${res.auth.ok ? 'できた' : '失敗（' + res.auth.error + '）'}`);
  L.push('', '> 機械判定は A 層（欠陥）の**候補**。画像で確かめてから直す。B 層・C 層と使いやすさは画像で判定する（references/ui-rubric.md）。', '');
  L.push('## 画面', '', '| 画面 | 状態 | 幅 | A 層の候補 | 内訳 |', '|---|---|---|---|---|');
  for (const r of res.screens) {
    if (r.error) { L.push(`| ${r.id} ${r.name || ''} | ${r.state} | ${r.width} | — | ❌ ${r.error} |`); continue; }
    const c = r.checks, parts = [];
    if (c.hscroll) parts.push(`横スクロール（${c.hscroll.documentWidth}px）`);
    if (c.clipped.length) parts.push(`切れ ${c.clipped.length}`);
    if (c.offscreen.length && !c.hscroll) parts.push(`画面外の文字 ${c.offscreen.length}`);
    if (c.overlaps.length) parts.push(`重なり ${c.overlaps.length}`);
    if (r.axe && r.axe.length) parts.push(`axe ${r.axe.map((v) => v.id).join('・')}`);
    if (r.focus && r.focus.invisible.length) parts.push(`フォーカスが見えない ${r.focus.invisible.length}`);
    if (c.dummy.length) parts.push(`ダミー文字 ${c.dummy.map((d) => d.text).join('・')}`);
    if (c.brokenImages.length) parts.push(`壊れた画像 ${c.brokenImages.length}`);
    if (c.palette.offPalette && c.palette.offPalette.length) parts.push(`トークン外の色 ${c.palette.offPalette.length}`);
    if (c.typeScale.offScale && c.typeScale.offScale.length) parts.push(`段階外の文字サイズ ${c.typeScale.offScale.length}`);
    if (r.log.console.length) parts.push(`コンソールのエラー ${r.log.console.length}`);
    if (r.log.http.length) parts.push(`HTTP エラー ${r.log.http.map((h) => h.status).join('・')}`);
    L.push(`| ${r.id} ${r.name || ''} | ${r.state} | ${r.width} | ${countA(r)} | ${parts.join('、') || 'なし'} |`);
  }
  if (res.journeys.length) {
    L.push('', '## 導線', '', '| 導線 | 幅 | 手数 / 予算 | 結果 |', '|---|---|---|---|');
    for (const j of res.journeys) L.push(`| ${j.id} ${j.name || ''} | ${j.width} | ${j.hands}${j.budget != null ? ' / ' + j.budget : ''}${j.overBudget ? ' ⚠️ 予算超え' : ''} | ${j.error ? '❌ ' + j.error : '最後まで通った'} |`);
  }
  L.push('', '## 詳細', '');
  for (const r of res.screens) {
    if (r.error || !r.checks) continue;
    const c = r.checks, items = [];
    if (c.hscroll) items.push(`- 横スクロール: 文書の幅 ${c.hscroll.documentWidth}px > 画面 ${c.hscroll.viewportWidth}px` + (c.offscreen.length ? `（はみ出している物: ${c.offscreen.slice(0, 5).map((o) => `\`${o.where}\`「${o.text}」`).join('、')}）` : ''));
    for (const x of c.clipped) items.push(`- 切れ（${x.direction === 'x' ? '横' : '縦'}）: \`${x.where}\`「${x.text}」`);
    if (!c.hscroll) for (const x of c.offscreen) items.push(`- 画面外の文字: \`${x.where}\`「${x.text}」（${x.left}〜${x.right}px）`);
    for (const x of c.overlaps) items.push(`- 重なり: ${x.a} と ${x.b}`);
    for (const v of r.axe || []) items.push(`- axe ${v.id}（${v.impact}）: ${v.help} — ${v.nodes} 箇所（例: ${v.targets.slice(0, 3).map((t) => '`' + t + '`').join('、')}）`);
    for (const f of (r.focus && r.focus.invisible) || []) items.push(`- フォーカスが見えない: ${f.tag}「${f.text}」`);
    for (const d of c.dummy) items.push(`- ダミー文字「${d.text}」: …${d.context}…`);
    for (const b of c.brokenImages) items.push(`- 壊れた画像: \`${b.where}\` ${b.src}`);
    for (const o of c.palette.offPalette || []) items.push(`- トークン外の色 ${o.color}: ${o.count} 箇所（例: ${o.examples.map((e) => '`' + e + '`').join('、')}）`);
    for (const o of c.typeScale.offScale || []) items.push(`- 段階外の文字サイズ ${o.size}: ${o.count} 箇所（例: ${o.examples.map((e) => '`' + e + '`').join('、')}）`);
    for (const m of r.log.console) items.push(`- コンソールのエラー: ${m}`);
    for (const h of r.log.http) items.push(`- HTTP ${h.status}: ${h.url}`);
    for (const f of r.log.failed) items.push(`- 通信の失敗: ${f.url}（${f.error}）`);
    if (c.palette.skipped) items.push(`- （色の判定は飛ばした: ${c.palette.skipped}）`);
    if (!items.length) continue;
    L.push(`### ${r.id} ${r.name || ''} — ${r.state} / ${r.width}px`, '', `画像: \`${r.file || '（撮影なし）'}\``, '', ...items, '');
  }
  return L.join('\n') + '\n';
}
