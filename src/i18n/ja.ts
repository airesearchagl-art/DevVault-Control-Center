/**
 * Japanese interface text — the key set of the whole application (Localization Foundation v0.2.1).
 *
 * Rules for this file:
 * - keys are stable identifiers; never an English sentence and never an internal enum value;
 * - `{placeholder}` marks a value supplied at runtime (Human content, counts, file names, SHAs);
 * - a key ending in `_one` is the English singular form and is unused in Japanese, but it must
 *   exist in both dictionaries so the parity gate stays symmetric;
 * - persisted values (review state, resource state, freshness, event type, schema field, file name,
 *   error code, product and tool names) are never translated — only their labels live here.
 */

export const ja = {
  // --- application shell ---------------------------------------------------------------------
  "app.name": "DevVault Control Center",
  "app.subtitle": "Review Hub",
  "app.loading": "DevVault Control Center を起動しています…",
  "app.fatal.title": "DevVault Control Center がデータフォルダを開けません",
  "app.fatal.body":
    "データは変更されていません。フォルダの権限（または DVCC_DATA_DIR）を確認して、もう一度お試しください。",
  "app.fatal.retry": "再試行",
  "app.dataDir.label": "データ:",
  "app.dataDir.envTag": "DVCC_DATA_DIR",
  "app.dataDir.debugTag": "デバッグビルド",
  "app.actions.newProject": "＋ プロジェクト",
  "app.actions.newReview": "＋ レビュー",
  "app.actions.openDataFolder": "データフォルダを開く",
  "app.actions.reload": "再読み込み",
  "app.actions.refreshAllGit": "全プロジェクトのGit状態を更新",
  "app.language.label": "言語",
  "app.language.ariaLabel": "表示言語",

  // --- empty states --------------------------------------------------------------------------
  "empty.noProjects.title": "Review Hub へようこそ",
  "empty.noProjects.body":
    "レビュー対象のプロジェクトを登録すると、PRやレビュースレッドごとにレビューを作成できます。",
  "empty.noProjects.action": "最初のプロジェクトを登録",
  "empty.noReviews.title": "レビューがまだありません",
  "empty.noReviews.body":
    "レビューを作成すると、PR・HEAD・ChatGPTスレッド・状態・次のアクションを記録できます。",
  "empty.noReviews.action": "レビューを作成",
  "empty.noSelection.title": "レビューを選択してください",
  "empty.noSelection.body":
    "キューからレビューを選ぶと、状況の確認と再開ができます。",

  // --- queue ---------------------------------------------------------------------------------
  "queue.filter.placeholder": "絞り込み: プロジェクト、PR（#45）、種別…",
  "queue.filter.ariaLabel": "レビューを絞り込む",
  "queue.showClosed": "完了したレビューも表示",
  "queue.item.prRound": "PR{pr} / R{round}",
  "queue.item.noPr": "PRなし / R{round}",
  "queue.item.suspendedFrom": "中断前: {state}",
  "queue.item.noNextAction": "次のアクション未設定",
  "queue.item.unreadable": "読み取り不可 — {problem}",
  "queue.empty.none": "レビューはまだありません。",
  "queue.empty.filtered": "条件に一致するレビューがありません。",
  "queue.projects.summary": "プロジェクト（{count}）",
  "queue.projects.reviewCount": "レビュー{count}件",
  "queue.projects.none": "登録済みプロジェクトはありません。",
  "queue.projects.addReview": "＋ レビュー",
  "queue.projects.edit": "編集",

  // --- review detail: header and actions -------------------------------------------------------
  "detail.header.summary": "{type} ・ {pr} ・ ラウンド R{round}",
  "detail.header.pr": "PR #{pr}",
  "detail.header.noPr": "PRなし",
  "detail.suspendedFrom":
    "{state} から中断中。再開するとその状態に戻り、リソース状態は HOT になります。",
  "detail.projectMissing":
    "プロジェクト「{id}」は projects.json にありません。",
  "detail.actions.ariaLabel": "レビュー操作",
  "detail.actions.resume": "再開",
  "detail.actions.resumeHot": "再開（HOT）",
  "detail.actions.markReady": "レビュー準備完了にする",
  "detail.actions.startReview": "レビュー開始",
  "detail.actions.captureResult": "レビュー結果を保存",
  "detail.actions.confirmVerdict": "判定を確定",
  "detail.actions.confirmVerdictDisabled":
    "先にこのラウンドのレビュー結果を保存してください",
  "detail.actions.cancelReview": "レビューを取り消す",
  "detail.actions.startNextRound": "R{round} を開始",
  "detail.actions.roundLimit": "ラウンド上限 R{max} に達しています",
  "detail.actions.recaptureResult": "レビュー結果を保存し直す",
  "detail.actions.suspend": "一時中断…",
  "detail.actions.block": "ブロック…",
  "detail.actions.close": "完了にする…",
  "detail.actions.openAriaLabel": "開く・コピー",
  "detail.actions.openGithub": "GitHubを開く",
  "detail.actions.openGithubMissing": "リポジトリURLが未記録です",
  "detail.actions.openChatgpt": "ChatGPTを開く",
  "detail.actions.openChatgptMissing": "スレッドURLが未記録です",
  "detail.actions.openFolder": "プロジェクトフォルダを開く",
  "detail.actions.openFolderMissing": "ローカルルートが未記録です",
  "detail.actions.copyPrompt": "レビュー依頼をコピー（R{round}）",

  // --- review detail: cards --------------------------------------------------------------------
  "detail.card.review": "レビュー",
  "detail.card.state": "状態",
  "detail.card.thread": "ChatGPTスレッド",
  "detail.card.project": "プロジェクト",
  "detail.card.gitEvidence": "Git状況",
  "detail.card.nextAction": "次のアクション",
  "detail.card.checkpoint": "チェックポイント",
  "detail.card.previousResult": "前回のレビュー結果",
  "detail.card.recentEvents": "最近の履歴",
  "detail.edit": "編集",
  "detail.field.reviewType": "レビュー種別",
  "detail.field.pr": "PR",
  "detail.field.round": "ラウンド",
  "detail.field.expectedHead": "レビュー予定HEAD（記録値）",
  "detail.field.reviewedHead": "レビュー済みHEAD（記録値）",
  "detail.field.requestSaved": "依頼の保存",
  "detail.field.requestSavedValue": "{timestamp} ・ request-r{round}.md",
  "detail.field.updated": "更新",
  "detail.field.reviewState": "レビュー状態",
  "detail.field.resourceState": "リソース状態",
  "detail.field.threadTitle": "タイトル",
  "detail.field.threadUrl": "URL",
  "detail.field.repository": "リポジトリ",
  "detail.field.localRoot": "ローカルルート",
  "detail.field.ide": "IDE",
  "detail.field.projectNextAction": "プロジェクトの次のアクション",
  "detail.value.prNumber": "#{pr}",
  "detail.value.round": "R{round}",
  "detail.value.unrecorded": "— 未記録",
  "detail.value.unobserved": "— 未確認",
  "detail.nextAction.ariaLabel": "次のアクション",
  "detail.nextAction.save": "次のアクションを保存",
  "detail.nextAction.revert": "元に戻す",
  "detail.checkpoint.file": "checkpoint.md",
  "detail.checkpoint.loading": "読み込み中…",
  "detail.checkpoint.none":
    "チェックポイントは未保存です。一時中断すると保存されます。",
  "detail.previousResult.summary": "R{round} ・ {verdict} ・ 保存 {timestamp}",
  "detail.previousResult.verdictPending": "判定未確定",
  "detail.previousResult.none": "レビュー結果はまだ保存されていません。",
  "detail.previousResult.loading": "読み込み中…",
  "detail.previousResult.unreadable":
    "result-r{round}.md を読み取れませんでした。",
  "detail.previousResult.showLess": "折りたたむ",
  "detail.previousResult.showFull": "全文を表示",
  "detail.previousResult.verdictNote": "判定メモ: {note}",
  "detail.previousResult.archived": "R{round} の以前の結果を保持: {files}",
  "detail.events.file": "events.jsonl",
  "detail.events.skipped":
    "events.jsonl の読み取れない{count}行をスキップしました（ファイルは変更していません）。",
  "detail.events.none": "履歴はありません。",
  "detail.events.stateChange": "{from} → {to}",
  "detail.events.noState": "∅",
  "detail.events.note": " — {note}",
  "detail.truncated": "\n…",

  // --- Git evidence card -------------------------------------------------------------------------
  "git.refresh": "Git状態を更新",
  "git.field.observation": "観測結果",
  "git.field.branch": "現在のブランチ",
  "git.field.head": "現在のHEAD（観測値）",
  "git.field.worktree": "作業ツリー",
  "git.field.observedAt": "観測日時",
  "git.worktree.dirty": "未コミットの変更あり",
  "git.worktree.clean": "変更なし",
  "git.branch.detached": "detached HEAD",
  "git.hint":
    "観測値は読み取り専用で保存されません。DVCCを再起動すると、更新するまで未確認に戻ります。更新しても記録済みHEADやレビュー状態は変わりません。",
  "git.status.ok": "観測済み",
  "git.status.noLocalRoot": "ローカルルートが未記録",
  "git.status.notARepository": "Gitリポジトリではありません",
  "git.status.gitUnavailable": "Gitを実行できません",
  "git.status.timeout": "時間内に応答しませんでした",
  "git.status.error": "未観測（エラー）",
  "git.observation.malformed": "Gitの観測結果を読み取れませんでした。",

  // --- freshness ---------------------------------------------------------------------------------
  "freshness.aligned": "一致",
  "freshness.headChanged": "HEAD変更あり",
  "freshness.reviewStale": "レビューが古い",
  "freshness.worktreeDirty": "未コミット変更あり",
  "freshness.unknown": "未確認",
  "freshness.explanation.notObserved": "Git状態はまだ確認されていません。",
  "freshness.explanation.noLocalRoot":
    "このプロジェクトにはローカルルートが記録されていません。",
  "freshness.explanation.notARepository":
    "記録されたローカルルートはGitリポジトリではありません。",
  "freshness.explanation.gitUnavailable":
    "Gitを起動できなかったため、リポジトリを確認できませんでした。",
  "freshness.explanation.timeout":
    "リポジトリの確認が時間内に終わりませんでした。",
  "freshness.explanation.errorWithReason":
    "リポジトリを確認できませんでした: {reason}",
  "freshness.explanation.error": "リポジトリを確認できませんでした。",
  "freshness.explanation.worktreeDirty":
    "ローカル作業ツリーに未コミットの変更があります。",
  "freshness.explanation.worktreeUnknown": "作業ツリーの状態が分かりません。",
  "freshness.explanation.headUnknown": "現在のHEADが分かりません。",
  "freshness.explanation.reviewStale":
    "レビュー済みHEAD {reviewed} と現在のHEAD {current} が一致しません。",
  "freshness.explanation.headChanged":
    "レビュー予定HEAD {expected} と現在のHEAD {current} が一致しません。",
  "freshness.explanation.reviewedNotComparable":
    "記録されたレビュー済みHEADを現在のHEADと比較できません。",
  "freshness.explanation.expectedNotComparable":
    "記録されたレビュー予定HEADを現在のHEADと比較できません。",
  "freshness.explanation.nothingRecorded":
    "このラウンドにはレビュー予定HEADもレビュー済みHEADも記録されていません。",
  "freshness.explanation.aligned":
    "記録済みHEADは現在のローカルHEADと一致しています。",
  "freshness.shortHeadUnknown": "—",

  // --- review / resource state labels --------------------------------------------------------------
  "state.review.new": "新規",
  "state.review.readyForReview": "レビュー準備完了",
  "state.review.reviewing": "レビュー中",
  "state.review.fixRequired": "修正が必要",
  "state.review.reviewPass": "レビュー合格",
  "state.review.blocked": "ブロック中",
  "state.review.suspended": "一時中断",
  "state.review.closed": "完了",
  "state.resource.hot": "HOT（作業中）",
  "state.resource.warm": "WARM（近日再開）",
  "state.resource.cold": "COLD（長期保留）",
  "state.resource.hint.hot":
    "いま作業中 — ChatGPT / IDE は開いたままで構いません",
  "state.resource.hint.warm": "近いうちに再開 — UIやChatGPTは閉じて構いません",
  "state.resource.hint.cold": "保留中 — 保存された状態だけを保持します",
  "state.resource.tooltip": "{label}：{hint}",
  "state.verdict.fixRequired": "修正が必要",
  "state.verdict.reviewPass": "レビュー合格",
  "state.verdict.blocked": "ブロック",

  // --- event type labels -----------------------------------------------------------------------------
  "events.type.reviewCreated": "レビュー作成",
  "events.type.reviewReady": "レビュー準備完了",
  "events.type.reviewStarted": "レビュー開始",
  "events.type.reviewCancelled": "レビュー取り消し",
  "events.type.requestSaved": "レビュー依頼を保存",
  "events.type.resultCaptured": "レビュー結果を保存",
  "events.type.verdictConfirmed": "判定を確定",
  "events.type.blocked": "ブロック",
  "events.type.suspended": "一時中断",
  "events.type.resumed": "再開",
  "events.type.closed": "完了",
  "events.type.resourceChanged": "リソース状態の変更",
  "events.type.nextActionUpdated": "次のアクションを更新",
  "events.type.metadataUpdated": "レビュー情報を更新",

  // --- project form ------------------------------------------------------------------------------------
  "project.form.createTitle": "プロジェクトを登録",
  "project.form.editTitle": "プロジェクトを編集 — {name}",
  "project.form.displayName": "表示名",
  "project.form.projectId": "プロジェクトID",
  "project.form.projectIdHint":
    "変更できない識別子: 英小文字・数字・ハイフン。作成後は変更できません。",
  "project.form.projectIdLocked": "プロジェクトIDは変更できません。",
  "project.form.repositoryUrl": "リポジトリURL",
  "project.form.repositoryUrlHint": "https://github.com/<owner>/<repo>（任意）",
  "project.form.localRoot": "ローカルルート",
  "project.form.localRootHint":
    "C:\\work\\project のような絶対パス（任意）。このPCにのみ保存されます。",
  "project.form.ide": "開発IDE",
  "project.form.ideHint": "表示用のラベルのみ（任意）",
  "project.form.nextAction": "プロジェクトの次のアクション",
  "project.form.notes": "メモ",
  "project.form.notesHint": "ローカルのメモ。レビュー依頼には含まれません。",
  "project.form.submitCreate": "プロジェクトを登録",
  "project.form.submitSave": "プロジェクトを保存",

  // --- review form -------------------------------------------------------------------------------------
  "review.form.createTitle": "レビューを作成",
  "review.form.project": "プロジェクト",
  "review.form.projectPlaceholder": "プロジェクトを選択…",
  "review.form.reviewType": "レビュー種別",
  "review.form.prNumber": "PR番号",
  "review.form.optional": "任意",
  "review.form.expectedHead": "レビュー予定HEAD（{round}）",
  "review.form.expectedHeadHint":
    "レビューを依頼するコミットSHA（任意・記録のみで、Gitから取得はしません）。",
  "review.form.threadTitle": "ChatGPTスレッドのタイトル",
  "review.form.threadUrl": "ChatGPTスレッドのURL",
  "review.form.threadUrlHint":
    "https://chatgpt.com/... または https://chat.openai.com/...（任意）",
  "review.form.nextAction": "次のアクション",
  "review.form.resourceState": "リソース状態",
  "review.form.submitCreate": "レビューを作成",
  "review.form.submitSave": "レビューを保存",
  "review.types.prReview": "PRレビュー",
  "review.types.reReview": "再レビュー",
  "review.types.designReview": "設計レビュー",
  "review.types.planReview": "計画レビュー",

  // --- dialogs ------------------------------------------------------------------------------------------
  "dialog.cancel": "キャンセル",
  "dialog.close": "閉じる",
  "dialog.closeAriaLabel": "ダイアログを閉じる",
  "dialog.dismiss": "閉じる",
  "review.edit.title": "レビューを編集",
  "review.suspend.title": "レビューを一時中断",
  "review.suspend.body":
    "レビューは{suspendedLabel}になり、現在の状態（{state}）を記憶します。再開するとその状態に戻ります。中断後はChatGPTやIDEを閉じて構いません。",
  "review.suspend.checkpointLabel": "チェックポイント（checkpoint.md に保存）",
  "review.suspend.resourceLegend": "中断中のリソース状態",
  "review.suspend.submit": "一時中断",
  "review.suspend.draft.state": "状態: {label}（R{round}）",
  "review.suspend.draft.stoppedAt": "中断した作業: ",
  "review.suspend.draft.next": "次にやること: {nextAction}",
  "review.capture.title": "レビュー結果を保存 — R{round}",
  "review.capture.body":
    "ChatGPTの回答をコピーし、{paste} で下に貼り付けてください。{file} として保存されます。判定を確定するまでレビュー状態は変わりません。",
  "review.capture.replaceLabel":
    "R{round} の保存済み結果を差し替える。現在の本文は {archived} として保持され、{file} が最新の結果になります。",
  "review.capture.resultLabel": "レビュー結果",
  "review.capture.resultPlaceholder":
    "ChatGPTのレビュー結果をここに貼り付け（Ctrl+V）",
  "review.capture.reviewedHeadLabel": "レビュー済みHEAD",
  "review.capture.reviewedHeadHint":
    "レビュー担当が実際にレビューしたと明記したコミットSHA（任意・明記がなければ空欄）。",
  "review.capture.submitReplace": "結果を差し替える",
  "review.capture.submitSave": "結果を保存",
  "review.verdict.title": "判定を確定 — R{round}",
  "review.verdict.missingResult":
    "このラウンドの保存済み結果を読み込めないか、まだありません。",
  "review.verdict.legend": "判定（あなたの決定）",
  "review.verdict.separator": " — ",
  "review.verdict.fixRequiredDescription": "修正してから再レビューが必要。",
  "review.verdict.reviewPassDescription": "必須の修正は見つからなかった。",
  "review.verdict.blockedDescription": "レビューを進められない（理由が必要）。",
  "review.verdict.reasonRequired": "理由（必須）",
  "review.verdict.noteOptional": "メモ（任意）",
  "review.verdict.acknowledgement":
    "レビュー結果を読んだうえで、この判定を確定します。",
  "review.verdict.later": "あとで決める",
  "review.verdict.submit": "判定を確定",
  "review.nextRound.title": "ラウンド R{round} を開始",
  "review.nextRound.body":
    "R{previous} の成果物はそのまま残ります。R{round} は{readyLabel}として開始します。",
  "review.nextRound.expectedHeadLabel": "R{round} のレビュー予定HEAD",
  "review.nextRound.expectedHeadHint":
    "任意。レビューを依頼する予定のコミットです。",
  "review.nextRound.submit": "R{round} を開始",
  "review.block.title": "レビューをブロック",
  "review.block.body":
    "レビューは{blockedLabel}になります。再開できる状態になったら「{markReady}」を使ってください。",
  "review.block.submit": "レビューをブロック",
  "review.block.reasonLabel": "理由（必須）",
  "review.close.title": "レビューを完了にする",
  "review.close.body":
    "完了したレビューは既定でキューに表示されません。ファイルと履歴は保持されます。",
  "review.close.submit": "レビューを完了にする",
  "projects.setAside.title": "projects.json を退避",
  "projects.setAside.body":
    "使用できない {projects}（および使用できないバックアップ）をデータフォルダ内で {corrupt} に改名し（削除はしません）、空のプロジェクト一覧で開始します。レビューには影響しません。",
  "projects.setAside.submit": "退避して空で開始",
  "projects.setAside.action": "退避して空で開始…",

  // --- review detail: unreadable review --------------------------------------------------------------------
  "unreadable.title.inaccessible": "レビュー {id} にアクセスできません",
  "unreadable.title.unreadable": "レビュー {id} を読み取れません",
  "unreadable.body.inaccessible":
    "DVCCは {file} にアクセスできませんでした（権限・ファイルロック・デバイスの問題など）。これはデータの破損としては扱いません。何も変更していません。アクセスの問題を解消してから再読み込みしてください。他のレビューには影響しません。",
  "unreadable.body.unreadable":
    "ファイルは変更されておらず、このレビューは読み取り専用です。データフォルダ内の {file} を修正または復元してから再読み込みしてください。他のレビューには影響しません。",

  // --- banners and notices ----------------------------------------------------------------------------------
  "banner.projectsIoError":
    "{projects} にアクセスできません: {problem}。これは権限・ファイルロック・デバイスエラーなどのアクセス問題で、データの破損ではありません。何も変更していません。再読み込みが成功するまでプロジェクトの編集はできません。",
  "banner.projectsUnreadable":
    "{projects} を使用できません: {problem}。プロジェクトの編集は無効で、ファイルは変更されていません。",
  "notice.restoredMissing":
    "{label} が見つからなかったため、バックアップから復元しました（バックアップは保持しています）。",
  "notice.restoredCorrupt":
    "{label} を読み取れなかったため、バックアップから復元しました。読み取れなかったファイルは {quarantined} として保持しています。",
  "notice.label.projects": "projects.json",
  "notice.label.reviewSession": "レビュー {id} の session.json",
  "notice.settingsInvalid":
    "{file} を読み取れなかったため、表示言語を日本語にしました。ファイルは変更していません。",

  // --- toasts ------------------------------------------------------------------------------------------------
  "toast.projectCreated": "プロジェクト「{name}」を作成しました",
  "toast.projectSaved": "プロジェクトを保存しました",
  "toast.reviewCreated": "レビューを作成しました",
  "toast.reviewSaved": "レビューを保存しました",
  "toast.nextActionSaved": "次のアクションを保存しました",
  "toast.reviewSuspended":
    "レビューを一時中断し、チェックポイントを保存しました",
  "toast.roundStarted": "ラウンド R{round} を開始しました",
  "toast.reviewBlocked": "レビューをブロックしました",
  "toast.reviewClosed": "レビューを完了にしました",
  "toast.verdictConfirmed": "判定を確定しました: {verdict}",
  "toast.requestSaved":
    "レビュー依頼を request-r{round}.md として保存し、クリップボードにコピーしました",
  "toast.requestSavedCopyFailed":
    "request-r{round}.md を保存しましたが、クリップボードへのコピーに失敗しました: {error}",
  "toast.resultSaved":
    "レビュー結果を result-r{round}.md として保存しました。{kept}判定を確定するまでレビュー状態は変わりません。",
  "toast.resultSavedKept": "以前の結果は {file} として保持しました。",
  "toast.setAsideDone":
    "{files} として保持しました。空のプロジェクト一覧で開始します。",
  "toast.setAsideFailed": "ファイルを退避できませんでした: {error}",
  "toast.gitRefreshedAll": "{count}件のプロジェクトのGit状態を更新しました。",
  "toast.gitRefreshedAll_one":
    "{count}件のプロジェクトのGit状態を更新しました。",
  "toast.noProjectsToObserve": "観測対象のプロジェクトがありません。",
  "toast.noProjectForReview":
    "このレビューにはプロジェクトが記録されていません",
  "toast.noRepositoryUrl":
    "このプロジェクトにはリポジトリURLが記録されていません",
  "toast.noThreadUrl": "このレビューにはChatGPTスレッドURLが記録されていません",
  "toast.noLocalRoot": "このプロジェクトにはローカルルートが記録されていません",
  "toast.launchFailed": "{label}に失敗しました: {error}",

  // --- errors -------------------------------------------------------------------------------------------------
  "error.saveConflict":
    "保存していません: DVCCが読み込んだ後に別のプログラムがファイルを変更したため、その変更を上書きしませんでした。「再読み込み」で最新のデータを確認してください。",
  "error.saveRecoveryRequired":
    "保存していません: ファイルが見つからず、バックアップが存在します。再読み込みするとバックアップから復元されます。",
  "error.saveFailed": "保存に失敗しました: {error}",
  "error.withCode": "{message}（{code}）",
  "health.ioError": "アクセスできません: {reason}（{code}）",
  "health.unsupportedVersion":
    "より新しいDVCCで書き込まれています（schemaVersion {version}）。読み取り専用で開きました",
  "health.unreadable": "読み取れません: {reason}",

  // --- time ------------------------------------------------------------------------------------------------------
  "time.pattern": "{year}/{month}/{day} {hour}:{minute}",
  "time.unknown": "—",
} as const;
