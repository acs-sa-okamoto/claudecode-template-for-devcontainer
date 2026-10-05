<#
.SYNOPSIS
    task-bridge トースト発火 / トーストクリック動線（Windows ホスト側 PowerShell）。

.DESCRIPTION
    DevContainer（Linux）から WSL Interop 経由で powershell.exe で実行される。
    2 つのモードを持つ:

      1. 発火モード（既定 / -Count N）:
         BurntToast でタイトル「タスク更新」・本文「N件のタスクが更新されました」
         のトーストを表示する（REQ-009）。トーストのクリックアクションには
         本スクリプト自身を -Open で再実行する protocol を仕込む（REQ-103）。

      2. オープンモード（-Open）:
         トーストがクリックされた時に呼ばれる。127.0.0.1:3939 への到達性を確認し、
           - 到達可: デフォルトブラウザで http://127.0.0.1:3939 を開く（既存タブは
             ブラウザのタブ再利用挙動に委ねる。REQ-103 / AC-04）。
           - 到達不可: ブラウザを開かず、2 行のエラートーストを表示する
             （REQ-104 / AC-05 / EDGE-003）。

.NOTES
    セキュリティ（P0 / コマンドインジェクション防止）:
      - 受け取る外部入力は -Count（[int]）のみ。PowerShell の型付きパラメータで
        [int] として受けるため、数値以外はパラメータバインド時点で拒否される。
      - URL・ポート・トースト本文はすべて固定リテラル。外部入力を文字列連結して
        コマンド・URL・スクリプト本文へ流用しない。
      - 到達性確認・ブラウザ起動の対象は 127.0.0.1:3939 に固定（SSRF/任意 URL 起動の余地なし）。
      - 機密値（API キー・トークン）はスクリプトに含めない。

    前提:
      - BurntToast モジュールは .devcontainer/initialize.ps1（initializeCommand）で
        セットアップ済み（REQ-114）。本スクリプトは再インストールしない。
#>

[CmdletBinding(DefaultParameterSetName = 'Fire')]
param(
    # 発火モード: 更新されたタスク件数（非負整数のみ）。
    [Parameter(ParameterSetName = 'Fire')]
    [ValidateRange(0, [int]::MaxValue)]
    [int]$Count = 0,

    # オープンモード: トーストクリック時の動線（到達性確認 → ブラウザ or エラートースト）。
    [Parameter(ParameterSetName = 'Open', Mandatory = $true)]
    [switch]$Open
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- 固定値（外部入力で上書き不可。インジェクション/SSRF 防止の要） ---
$Script:Port = 3939
$Script:AppUrl = 'http://127.0.0.1:3939'

function Test-AppAlive {
    <#
        127.0.0.1:3939 への TCP 到達性を確認する。
        対象ホスト・ポートは固定。外部入力を受け取らない。
    #>
    try {
        $result = Test-NetConnection -ComputerName '127.0.0.1' -Port $Script:Port -WarningAction SilentlyContinue
        return [bool]$result.TcpTestSucceeded
    } catch {
        # 到達性確認自体が失敗した場合は「未起動」とみなしフォールバックへ倒す（フェイルクローズ）。
        return $false
    }
}

function Show-UpdateToast {
    <#
        発火モード: 「タスク更新 / N件のタスクが更新されました」を表示する。
        クリックすると本スクリプト自身を -Open で再実行する（到達性確認 → ブラウザ）。
        $ToastCount は [int] バインド済みのため安全に本文へ埋め込める（連結注入の余地なし）。

        クリック動線の実装方式:
          BurntToast の -Activated スクリプトブロックでクリックを受け、本スクリプトを
          -Open で別プロセス起動する。スクリプトパスは $PSCommandPath（このファイルの
          絶対パス）で固定し、外部入力を一切含めない。
    #>
    param([int]$ToastCount)

    Import-Module BurntToast -ErrorAction SilentlyContinue

    # 自分自身の絶対パス（固定。外部入力ではない）。
    $selfPath = $PSCommandPath
    $bodyText = "$ToastCount件のタスクが更新されました"

    New-BurntToastNotification -Text 'タスク更新', $bodyText -Activated {
        # トーストクリック時に呼ばれる。本スクリプトを -Open で再実行して動線を担わせる。
        Start-Process 'powershell.exe' -ArgumentList @(
            '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-File', $using:selfPath, '-Open'
        )
    }
}

function Invoke-OpenAction {
    <#
        オープンモード: 到達可ならブラウザで AppUrl を開く。到達不可なら 2 行エラートースト。
    #>
    Import-Module BurntToast -ErrorAction SilentlyContinue

    if (Test-AppAlive) {
        # 到達可: デフォルトブラウザで固定 URL を開く（既存タブ再利用はブラウザ任せ。REQ-103/AC-04）。
        Start-Process $Script:AppUrl
    } else {
        # 到達不可: ブラウザを開かず、仕様文言の 2 行エラートースト（REQ-104/AC-05/EDGE-003）。
        New-BurntToastNotification -Text `
            'DevContainerが起動していません。', `
            'DevContainerを起動してアプリを立ち上げてください。'
    }
}

# --- エントリ ---
switch ($PSCmdlet.ParameterSetName) {
    'Open' { Invoke-OpenAction }
    default { Show-UpdateToast -ToastCount $Count }
}
