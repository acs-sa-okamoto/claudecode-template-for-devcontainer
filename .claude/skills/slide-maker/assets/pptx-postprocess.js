// pptx-postprocess.js — pptxgenjs で書き出した .pptx を日本語デッキ向けに後処理する
//
// 使い方（生成スクリプトの最後で）:
//   const { postProcess } = require("<slide-maker>/assets/pptx-postprocess.js");
//   await pres.writeFile({ fileName: OUT });
//   await applyTheme(OUT, THEME);            // pptx スキルの apply_theme.js を使う場合はその後
//   await postProcess(OUT, { eaFont: "BIZ UDPGothic" });
// CLI: node pptx-postprocess.js <deck.pptx> [東アジア書体名]
//
// 直すもの（どちらも pptxgenjs の既知の癖。validate.py は通ってしまうので見落としやすい）:
//   1. テーマの東アジア書体: pptxgenjs のテーマは <a:ea typeface=""/> が空、Jpan が游ゴシックのまま。
//      書体を指定していないランの日本語が游ゴシックで描かれ、欧文を含む行だけ大きく見える。
//      → テーマの ea と Jpan を eaFont にそろえる（生成側でも全ランに fontFace を付けるのが確実）。
//   2. 段落内で重複した <a:pPr>: テキストボックスに段落オプション（paraSpaceAfter 等）を付けると、
//      ランごとに <a:pPr> が出てスキーマ違反になる（PowerPoint は開けるが、他のツールで崩れうる）。
//      → 段落の最初の <a:pPr> だけを残す。
const fs = require("fs");

function loadJSZip() {
  try { return require("jszip"); } catch (_) {}
  // pptxgenjs に同梱の jszip を使う（NODE_PATH にグローバルの node_modules を足しておくこと）
  return require(require.resolve("jszip", { paths: [require.resolve("pptxgenjs")] }));
}

async function postProcess(file, { eaFont = "BIZ UDPGothic" } = {}) {
  const JSZip = loadJSZip();
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const names = Object.keys(zip.files);

  const themes = names.filter((f) => /^ppt\/theme\/theme\d+\.xml$/.test(f));
  for (const f of themes) {
    const x = (await zip.file(f).async("string"))
      .replace(/<a:ea typeface="[^"]*"\/>/g, `<a:ea typeface="${eaFont}"/>`)
      .replace(/<a:font script="Jpan" typeface="[^"]*"\/>/g, `<a:font script="Jpan" typeface="${eaFont}"/>`);
    zip.file(f, x);
  }

  let removed = 0;
  const parts = names.filter((f) => /^ppt\/(slides|slideLayouts|slideMasters)\/[^/]+\.xml$/.test(f));
  for (const f of parts) {
    const x = (await zip.file(f).async("string")).replace(/<a:p>([\s\S]*?)<\/a:p>/g, (m, inner) => {
      let seen = false;
      const fixed = inner.replace(/<a:pPr\b[^>]*\/>|<a:pPr\b[^>]*>[\s\S]*?<\/a:pPr>/g, (pp) => {
        if (!seen) { seen = true; return pp; }
        removed++;
        return "";
      });
      return `<a:p>${fixed}</a:p>`;
    });
    zip.file(f, x);
  }

  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  return { themes: themes.length, removedPPr: removed };
}

module.exports = { postProcess };

if (require.main === module) {
  const [file, eaFont] = process.argv.slice(2);
  if (!file) { console.error("usage: node pptx-postprocess.js <deck.pptx> [東アジア書体名]"); process.exit(2); }
  postProcess(file, eaFont ? { eaFont } : {}).then((r) => console.log(`postprocess: theme ${r.themes} file(s), removed ${r.removedPPr} duplicate pPr`));
}
