// トースト発火 fireToast（TASK-0013）。
//
// 設計契約: requirements.md（REQ-009/NFR-003/NFR-104）/ architecture.md（WSL Interop）/
// api-endpoints.md（件数 N を数値として渡す）。
//
// WSL Interop で powershell.exe を起動し、固定スクリプト .devcontainer/toast.ps1
// （TASK-0025）を -File で実行する。スクリプトが BurntToast でトースト
// 「タスク更新 / N件のタスクが更新されました」を発火し、クリック動線も担う。
//
// 設計契約（architecture.md / dataflow.md）:
//   `powershell.exe -File .devcontainer/toast.ps1 -Count N`
//
// セキュリティ（P0 / コマンドインジェクション防止）:
// - 件数 N は Number.isInteger(n) && n >= 0 を実行時に検証してから引数として渡す。
// - シェル（shell:true）を介さず、spawn の引数配列で渡す（文字列連結でコマンドを組み立てない）。
// - 実行するスクリプトパスは固定リテラル。外部入力（件数のみ）はパラメータ -Count として
//   独立要素 String(n) で渡し、コマンド文字列・スクリプトパスへ連結しない。
// - トースト本文は toast.ps1 側の固定テンプレート＋件数のみ（機密情報・個人情報を含めない NFR-104）。

import { spawn } from "node:child_process"

/** 注入可能な spawn 互換関数（テストでフェイク化、実プロセスを起動しない）。 */
export type SpawnFn = (
  command: string,
  args: readonly string[],
  options?: { detached?: boolean; stdio?: "ignore" },
) => unknown

/** fireToast の依存。 */
export interface FireToastDeps {
  /** spawn 実装（既定 node:child_process.spawn）。 */
  spawnFn?: SpawnFn
}

/**
 * トースト発火スクリプトのパス。
 * 本アプリは .beam/dashboard を CWD として起動されるため、リポジトリ直下の
 * .devcontainer/toast.ps1 は ../../ 経由で参照する。配置が異なる場合は
 * 環境変数 TOAST_SCRIPT_PATH で上書きできる。
 * 件数は本ファイルではなくスクリプトの [int]$Count パラメータで型安全に受ける。
 */
const TOAST_SCRIPT_PATH =
  process.env.TOAST_SCRIPT_PATH ?? "../../.devcontainer/toast.ps1"

/** 既定の実 spawn（detached + stdio:ignore でホスト側に投げっぱなしにする）。 */
const realSpawn: SpawnFn = (command, args, options) => {
  const child = spawn(command, args as string[], {
    detached: options?.detached ?? true,
    stdio: options?.stdio ?? "ignore",
  })
  // 起動失敗（powershell.exe が存在しない環境＝Linux コンテナ等での ENOENT）は
  // 'error' イベントとして非同期に通知される。リスナーが無いと未捕捉例外で
  // アプリ本体ごと落ちるため、ここで必ず受けて握りつぶす（通知は best-effort、
  // NFR-003: 通知の失敗が本体機能を阻害してはならない）。
  child.on("error", () => {
    /* best-effort: 失敗時はトーストが出ないだけにする（アプリは継続） */
  })
  // 親プロセスの終了を妨げない（detached 起動の定石）。
  child.unref()
  return child
}

/**
 * トーストを発火する。
 *
 * @throws 件数 N が非負整数でない場合（コマンドインジェクション防止のための入力検証）。
 */
export function fireToast(count: number, deps: FireToastDeps = {}): void {
  // P0: 件数を数値として厳密に検証する。文字列・小数・負数・NaN は拒否する。
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
    throw new Error("通知件数は 0 以上の整数である必要があります")
  }

  const spawnFn = deps.spawnFn ?? realSpawn
  // 引数配列で渡す（シェル非経由）。-File に固定スクリプトパス、-Count の値は独立した
  // 要素 String(count) で渡す。数値検証済みのため安全（連結によるコマンド注入の余地なし）。
  spawnFn(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      TOAST_SCRIPT_PATH,
      "-Count",
      String(count),
    ],
    { detached: true, stdio: "ignore" },
  )
}
