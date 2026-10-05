// ログのサイズベースローテーション（TASK-0003 / REQ-113 / NFR-403）
//
// pino のファイルトランスポートはサイズ回転を持たないため、軽量な回転を自前実装する。
// 回転は app.log → app.log.1 → app.log.2 ... の順送りで、maxGenerations を超える
// 最古世代は削除する。閾値・世代数は引数で注入できる（テスト容易性、TASK-0003 注意事項）。

import { existsSync, renameSync, rmSync, statSync } from "node:fs"

/** 既定の回転閾値（100MB, REQ-113）。 */
export const DEFAULT_MAX_BYTES = 100 * 1024 * 1024

/** 既定の保持世代数（5世代, NFR-403）。 */
export const DEFAULT_MAX_GENERATIONS = 5

/**
 * 対象ファイルのサイズが maxBytes を超えていれば回転する。
 *
 * @param filePath 監視対象（例: logs/app.log）
 * @param maxBytes この値を超えたら回転（既定 100MB）
 * @param maxGenerations 保持する世代数（既定 5）
 * @returns 回転したら true、しなければ false
 */
export function rotateIfNeeded(
  filePath: string,
  maxBytes: number = DEFAULT_MAX_BYTES,
  maxGenerations: number = DEFAULT_MAX_GENERATIONS,
): boolean {
  if (!existsSync(filePath)) {
    return false
  }
  const size = statSync(filePath).size
  if (size <= maxBytes) {
    return false
  }

  // 最古世代を削除（maxGenerations を超える分）。
  const oldest = `${filePath}.${maxGenerations}`
  if (existsSync(oldest)) {
    rmSync(oldest, { force: true })
  }

  // app.log.{n-1} → app.log.{n} へ順送り（古い側から動かす）。
  for (let gen = maxGenerations - 1; gen >= 1; gen--) {
    const from = `${filePath}.${gen}`
    const to = `${filePath}.${gen + 1}`
    if (existsSync(from)) {
      renameSync(from, to)
    }
  }

  // 現在のログを .1 へ。
  renameSync(filePath, `${filePath}.1`)
  return true
}
