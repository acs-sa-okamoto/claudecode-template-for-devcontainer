// 方式B ブラウザ通知器の単体テスト（Notification API・実タイマー非依存。注入で検証）。

import { describe, expect, it } from "vitest"
import { createBrowserNotifier, type BrowserNotifierDeps } from "./notify.js"

/** 注入で制御できる通知器を作る。fire() で集約ウィンドウ満了をシミュレートする。 */
function setup(over: Partial<BrowserNotifierDeps> = {}) {
  const bodies: string[] = []
  let fire: (() => void) | null = null
  const notifier = createBrowserNotifier({
    isEnabled: () => true,
    getPermission: () => "granted",
    show: (_title, body) => bodies.push(body),
    setTimeoutFn: (cb) => {
      fire = cb
      return 0
    },
    ...over,
  })
  return { notifier, bodies, fire: () => fire?.() }
}

describe("createBrowserNotifier", () => {
  it("ウィンドウ内の複数変更を集約し1件だけ通知（重複は1カウント）", () => {
    const { notifier, bodies, fire } = setup()
    notifier.onChange([{ project: "p", taskId: "1" }])
    notifier.onChange([
      { project: "p", taskId: "2" },
      { project: "p", taskId: "1" }, // 重複
    ])
    expect(bodies).toHaveLength(0) // 満了前は出さない
    fire()
    expect(bodies).toEqual(["2件のタスクが更新されました"]) // ユニーク2件
  })

  it("通知 OFF のときは出さない", () => {
    const { notifier, bodies, fire } = setup({ isEnabled: () => false })
    notifier.onChange([{ project: "p", taskId: "1" }])
    fire()
    expect(bodies).toHaveLength(0)
  })

  it("許可が granted でないときは出さない", () => {
    const { notifier, bodies, fire } = setup({ getPermission: () => "default" })
    notifier.onChange([{ project: "p", taskId: "1" }])
    fire()
    expect(bodies).toHaveLength(0)
  })

  it("満了後に来た変更は次のウィンドウで通知する", () => {
    const { notifier, bodies, fire } = setup()
    notifier.onChange([{ project: "p", taskId: "1" }])
    fire()
    notifier.onChange([{ project: "p", taskId: "9" }])
    fire()
    expect(bodies).toEqual([
      "1件のタスクが更新されました",
      "1件のタスクが更新されました",
    ])
  })

  it("変更が無ければ通知しない", () => {
    const { bodies, fire } = setup()
    fire() // onChange なしで満了
    expect(bodies).toHaveLength(0)
  })
})
