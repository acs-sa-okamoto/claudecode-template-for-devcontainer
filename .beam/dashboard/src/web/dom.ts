// DOM 生成ヘルパ（XSS 安全）。
//
// すべての要素生成をここに集約し、テキストは textContent で挿入する。
// innerHTML への生文字列連結は禁止（P0: XSS 防止）。外部・ソース DB 由来の
// title/content/project 等は必ず本ヘルパ経由でテキストとして描画する。

/** タグ・属性・子から要素を生成する。text は textContent で安全に挿入される。 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    className?: string
    text?: string
    attrs?: Record<string, string>
    dataset?: Record<string, string>
    children?: Array<Node | null | undefined>
  } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (options.className) node.className = options.className
  // text は textContent。innerHTML を使わないことで XSS を構造的に防ぐ。
  if (options.text !== undefined) node.textContent = options.text
  if (options.attrs) {
    for (const [k, v] of Object.entries(options.attrs)) node.setAttribute(k, v)
  }
  if (options.dataset) {
    for (const [k, v] of Object.entries(options.dataset)) node.dataset[k] = v
  }
  if (options.children) {
    for (const child of options.children) {
      if (child) node.appendChild(child)
    }
  }
  return node
}

/** 子要素をすべて除去する（再描画前のクリア）。 */
export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild)
}
