// task-bridge フロントエンド エントリ。
//
// レイアウトを構築し、初期一覧をロード/描画する。SSE・設定・同期操作 UI をここで結線する。

import "./styles.css"
import { loadAndRenderTasks, renderLayout } from "./app.js"
import type { ApiError } from "./api/client.js"
import { fetchMode } from "./api/config.js"
import { getJob } from "./api/jobs.js"
import { createViewModeBadge } from "./render/modeBadge.js"
import { startBulkSync, syncDelete, syncOne } from "./api/sync.js"
import { showErrorScreen } from "./error/dbError.js"
import { applySyncError } from "./error/syncError.js"
import { createBulkSyncEnhancer } from "./render/bulkSync.js"
import type { GroupRenderOptions } from "./render/projectGroup.js"
import type { RowEnhancer } from "./render/row.js"
import { createSyncActions } from "./render/syncActions.js"
import { createBrowserNotifier } from "./notify/notify.js"
import { createNotificationToggle } from "./settings/notification.js"
import { createThemeToggleButton, initTheme } from "./settings/theme.js"
import { startSseClient } from "./sse/client.js"

// テーマは DOM 構築前に適用してちらつきを抑える（NFR-203 / AC-17）。
initTheme()

const root = document.getElementById("app")
if (root) {
  const { controls, taskList } = renderLayout(root)

  // 通知トグル・テーマ切替を操作領域へ配置（TASK-0023。モード非依存なので先に配置）。
  const notifToggle = createNotificationToggle()
  controls.appendChild(notifToggle.element)
  controls.appendChild(createThemeToggleButton())
  void notifToggle.init()

  // 方式B: ブラウザ通知器。通知 ON（トグル現在値）かつ許可済みのとき、SSE の更新を
  // 集約してブラウザ通知を出す（ホスト常駐・powershell に非依存）。
  const browserNotifier = createBrowserNotifier({
    isEnabled: () => notifToggle.input.checked,
  })

  // DB エラー時はエラー画面を表示しアプリは継続（TASK-0024 / NFR-303）。
  const onError = (error: ApiError): void => {
    showErrorScreen(taskList, error)
  }

  // 操作後・ジョブ完了後は一覧を再取得して状態を反映する（render はモード確定後に設定）。
  let render: GroupRenderOptions = {}
  const reload = async (): Promise<void> => {
    await loadAndRenderTasks(taskList, { onError, render })
  }

  // 動作モードを取得してから操作 UI を結線する。
  // view（閲覧専用 = Notion 連携なし）では登録系ボタンを無条件で非活性にするため、
  // モード確定後に enhancer を構築してから初回描画する（活性ボタンの一瞬の表示を防ぐ）。
  void fetchMode().then((mode) => {
    const isView = mode === "view"
    if (isView) {
      root.insertBefore(createViewModeBadge(), taskList)
    }

    // 行 enhancer: 同期失敗エラー表示（TASK-0024）+ 個別登録/削除同期ボタン（TASK-0021）を合成。
    const rowEnhancer: RowEnhancer = (row, task) => {
      applySyncError(row, task)
      createSyncActions({
        syncOne: (project, taskId) => syncOne(project, taskId),
        syncDelete: (project, taskId) => syncDelete(project, taskId),
        onError,
        onChange: () => void reload(),
        viewMode: isView,
      })(row, task)
    }

    // 見出し enhancer: プロジェクト一括登録ボタン + ジョブ進捗ポーリング（TASK-0021）。
    const headerEnhancer = createBulkSyncEnhancer({
      startBulkSync: (project) => startBulkSync(project),
      getJob: (jobId) => getJob(jobId),
      onError,
      onComplete: () => void reload(),
      viewMode: isView,
    })

    render = { rowEnhancer, headerEnhancer }

    // 初期一覧ロード（enhancer 確定後）。
    void loadAndRenderTasks(taskList, { onError, render })

    // SSE ライブ更新: tasks_changed 受信で再取得し変更行をハイライト（REQ-010 / AC-12）。
    // 併せて方式B のブラウザ通知へ生イベントを供給する。
    startSseClient({
      container: taskList,
      reload,
      onEvent: (changed) => browserNotifier.onChange(changed),
    })
  })
}
