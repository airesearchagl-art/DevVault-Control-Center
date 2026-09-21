import type { Dictionary } from "./types";

/**
 * English interface text. Typed as a complete record of the key set defined by `ja.ts`, so a
 * missing key — or a key that no longer exists — is a compile error.
 */
export const en: Dictionary = {
  // --- application shell ---------------------------------------------------------------------
  "app.name": "DevVault Control Center",
  "app.subtitle": "Review Hub",
  "app.loading": "Loading DevVault Control Center…",
  "app.fatal.title": "DevVault Control Center cannot open its data folder",
  "app.fatal.body":
    "Nothing was changed. Check the folder permissions (or DVCC_DATA_DIR) and try again.",
  "app.fatal.retry": "Retry",
  "app.dataDir.label": "Data:",
  "app.dataDir.envTag": "DVCC_DATA_DIR",
  "app.dataDir.debugTag": "debug build",
  "app.actions.newProject": "+ Project",
  "app.actions.newReview": "+ Review",
  "app.actions.openDataFolder": "Open data folder",
  "app.actions.reload": "Reload",
  "app.actions.refreshAllGit": "Refresh Git (all)",
  "app.language.label": "Language",
  "app.language.ariaLabel": "Interface language",

  // --- empty states --------------------------------------------------------------------------
  "empty.noProjects.title": "Welcome to Review Hub",
  "empty.noProjects.body":
    "Register the projects you review, then create a review for each PR or review thread.",
  "empty.noProjects.action": "Register your first project",
  "empty.noReviews.title": "No reviews yet",
  "empty.noReviews.body":
    "Create a review to track its PR, HEAD, ChatGPT thread, state and next action.",
  "empty.noReviews.action": "Create a review",
  "empty.noSelection.title": "Select a review",
  "empty.noSelection.body":
    "Pick a review from the queue to see where it stands and resume it.",

  // --- queue ---------------------------------------------------------------------------------
  "queue.filter.placeholder": "Filter: project, PR (#45), type…",
  "queue.filter.ariaLabel": "Filter reviews",
  "queue.showClosed": "Show closed",
  "queue.item.prRound": "PR{pr} / R{round}",
  "queue.item.noPr": "No PR / R{round}",
  "queue.item.suspendedFrom": "from {state}",
  "queue.item.noNextAction": "No next action",
  "queue.item.unreadable": "Unreadable — {problem}",
  "queue.empty.none": "No reviews yet.",
  "queue.empty.filtered": "No reviews match the filter.",
  "queue.projects.summary": "Projects ({count})",
  "queue.projects.reviewCount": "· {count} reviews",
  "queue.projects.reviewCount_one": "· {count} review",
  "queue.projects.none": "No projects registered.",
  "queue.projects.addReview": "+ Review",
  "queue.projects.edit": "Edit",

  // --- review detail: header and actions -------------------------------------------------------
  "detail.header.summary": "{type} · {pr} · Round R{round}",
  "detail.header.pr": "PR #{pr}",
  "detail.header.noPr": "No PR",
  "detail.suspendedFrom":
    "Suspended from {state}. Resume restores that state and sets the resource to HOT.",
  "detail.projectMissing": "Project “{id}” is not in projects.json.",
  "detail.actions.ariaLabel": "Review actions",
  "detail.actions.resume": "Resume",
  "detail.actions.resumeHot": "Resume (HOT)",
  "detail.actions.markReady": "Mark ready",
  "detail.actions.startReview": "Start review",
  "detail.actions.captureResult": "Capture result",
  "detail.actions.confirmVerdict": "Confirm verdict",
  "detail.actions.confirmVerdictDisabled":
    "Capture the result of this round first",
  "detail.actions.cancelReview": "Cancel review",
  "detail.actions.startNextRound": "Start R{round}",
  "detail.actions.roundLimit": "Round limit R{max} reached",
  "detail.actions.recaptureResult": "Re-capture result",
  "detail.actions.suspend": "Suspend…",
  "detail.actions.block": "Block…",
  "detail.actions.close": "Close…",
  "detail.actions.openAriaLabel": "Open and copy",
  "detail.actions.openGithub": "Open GitHub",
  "detail.actions.openGithubMissing": "No repository URL recorded",
  "detail.actions.openChatgpt": "Open ChatGPT",
  "detail.actions.openChatgptMissing": "No thread URL recorded",
  "detail.actions.openFolder": "Open project folder",
  "detail.actions.openFolderMissing": "No local root recorded",
  "detail.actions.copyPrompt": "Copy review prompt (R{round})",

  // --- review detail: cards --------------------------------------------------------------------
  "detail.card.review": "Review",
  "detail.card.state": "State",
  "detail.card.thread": "ChatGPT thread",
  "detail.card.project": "Project",
  "detail.card.gitEvidence": "Git evidence",
  "detail.card.nextAction": "Next action",
  "detail.card.checkpoint": "Checkpoint",
  "detail.card.previousResult": "Previous result",
  "detail.card.recentEvents": "Recent events",
  "detail.edit": "Edit",
  "detail.field.reviewType": "Review type",
  "detail.field.pr": "PR",
  "detail.field.round": "Round",
  "detail.field.expectedHead": "Expected HEAD (recorded)",
  "detail.field.reviewedHead": "Reviewed HEAD (recorded)",
  "detail.field.requestSaved": "Request saved",
  "detail.field.requestSavedValue": "{timestamp} · request-r{round}.md",
  "detail.field.updated": "Updated",
  "detail.field.reviewState": "Review state",
  "detail.field.resourceState": "Resource state",
  "detail.field.threadTitle": "Title",
  "detail.field.threadUrl": "URL",
  "detail.field.repository": "Repository",
  "detail.field.localRoot": "Local root",
  "detail.field.ide": "IDE",
  "detail.field.projectNextAction": "Project next action",
  "detail.value.prNumber": "#{pr}",
  "detail.value.round": "R{round}",
  "detail.value.unrecorded": "— not recorded",
  "detail.value.unobserved": "— not observed",
  "detail.nextAction.ariaLabel": "Next action",
  "detail.nextAction.save": "Save next action",
  "detail.nextAction.revert": "Revert",
  "detail.checkpoint.file": "checkpoint.md",
  "detail.checkpoint.loading": "Loading…",
  "detail.checkpoint.none": "No checkpoint saved. Suspend writes one.",
  "detail.previousResult.summary":
    "R{round} · {verdict} · captured {timestamp}",
  "detail.previousResult.verdictPending": "verdict not confirmed",
  "detail.previousResult.none": "No result captured yet.",
  "detail.previousResult.loading": "Loading…",
  "detail.previousResult.unreadable": "result-r{round}.md could not be read.",
  "detail.previousResult.showLess": "Show less",
  "detail.previousResult.showFull": "Show full result",
  "detail.previousResult.verdictNote": "Verdict note: {note}",
  "detail.previousResult.archived": "Earlier results of R{round} kept: {files}",
  "detail.events.file": "events.jsonl",
  "detail.events.skipped":
    "{count} unreadable lines in events.jsonl were skipped (file left unchanged).",
  "detail.events.skipped_one":
    "{count} unreadable line in events.jsonl was skipped (file left unchanged).",
  "detail.events.none": "No events.",
  "detail.events.round": "Round R{round}",
  "detail.events.stateChange": "{from} → {to}",
  "detail.events.noState": "∅",
  "detail.events.note": " — {note}",
  "detail.truncated": "\n…",

  // --- Git evidence card -------------------------------------------------------------------------
  "git.refresh": "Refresh Git state",
  "git.field.observation": "Observation",
  "git.field.branch": "Current branch",
  "git.field.head": "Current HEAD (observed)",
  "git.field.worktree": "Working tree",
  "git.field.observedAt": "Observed",
  "git.worktree.dirty": "Uncommitted changes",
  "git.worktree.clean": "Clean",
  "git.branch.detached": "detached HEAD",
  "git.hint":
    "Observed facts are read-only and are not stored: after restarting DVCC they are unknown until you refresh. Refreshing never changes the recorded HEAD values or the review state.",
  "git.status.ok": "Observed",
  "git.status.noLocalRoot": "No local root recorded",
  "git.status.notARepository": "Not a Git repository",
  "git.status.gitUnavailable": "Git unavailable",
  "git.status.timeout": "Timed out",
  "git.status.error": "Not observed (error)",
  "git.observation.malformed": "The Git observation could not be read.",

  // --- freshness ---------------------------------------------------------------------------------
  "freshness.aligned": "Aligned",
  "freshness.headChanged": "HEAD changed",
  "freshness.reviewStale": "Review stale",
  "freshness.worktreeDirty": "Working tree dirty",
  "freshness.unknown": "Unknown",
  "freshness.explanation.notObserved": "Git state has not been observed.",
  "freshness.explanation.noLocalRoot":
    "No local root is recorded for this project.",
  "freshness.explanation.notARepository":
    "The recorded local root is not a Git repository.",
  "freshness.explanation.gitUnavailable":
    "Git could not be started, so the repository was not observed.",
  "freshness.explanation.timeout": "Observing the repository timed out.",
  "freshness.explanation.errorWithReason":
    "The repository could not be observed: {reason}",
  "freshness.explanation.error": "The repository could not be observed.",
  "freshness.explanation.worktreeDirty":
    "Local working tree has uncommitted changes.",
  "freshness.explanation.worktreeUnknown":
    "The working tree state is not known.",
  "freshness.explanation.headUnknown": "The current HEAD is not known.",
  "freshness.explanation.reviewStale":
    "Reviewed HEAD {reviewed} differs from current HEAD {current}.",
  "freshness.explanation.headChanged":
    "Expected HEAD {expected} differs from current HEAD {current}.",
  "freshness.explanation.reviewedNotComparable":
    "The recorded reviewed HEAD cannot be compared with the current HEAD.",
  "freshness.explanation.expectedNotComparable":
    "The recorded expected HEAD cannot be compared with the current HEAD.",
  "freshness.explanation.nothingRecorded":
    "No expected or reviewed HEAD is recorded for this round.",
  "freshness.explanation.aligned":
    "Recorded HEAD values match current local HEAD.",
  "freshness.shortHeadUnknown": "—",

  // --- review / resource state labels --------------------------------------------------------------
  "state.review.new": "New",
  "state.review.readyForReview": "Ready for review",
  "state.review.reviewing": "Reviewing",
  "state.review.fixRequired": "Fix required",
  "state.review.reviewPass": "Review pass",
  "state.review.blocked": "Blocked",
  "state.review.suspended": "Suspended",
  "state.review.closed": "Closed",
  "state.resource.hot": "HOT",
  "state.resource.warm": "WARM",
  "state.resource.cold": "COLD",
  "state.resource.hint.hot": "Working on it now — ChatGPT / IDE may stay open",
  "state.resource.hint.warm": "Resuming soon — UI and ChatGPT can be closed",
  "state.resource.hint.cold": "Paused — only the saved state is kept",
  "state.resource.tooltip": "{label}: {hint}",
  "state.verdict.fixRequired": "Fix required",
  "state.verdict.reviewPass": "Review pass",
  "state.verdict.blocked": "Blocked",

  // --- event type labels -----------------------------------------------------------------------------
  // --- review workflow (Phase 3) -------------------------------------------------------------------------------
  "state.freshContext.turn1NotSent": "Turn 1 not sent",
  "state.freshContext.awaitingAssessment": "Awaiting the Fresh Assessment",
  "state.freshContext.assessmentReceived": "Fresh Assessment received",
  "state.freshContext.turn2Sent": "Turn 2 sent, awaiting the Final Judgment",
  "state.freshContext.judgmentReceived": "Final Judgment received",
  "state.freshContext.judgmentConfirmed": "Verdict confirmed",
  "state.riskTier.tier0": "Tier 0",
  "state.riskTier.tier1": "Tier 1",
  "state.riskTier.tier2": "Tier 2",
  "state.tier2Subject.security": "Security",
  "state.tier2Subject.privacy": "Privacy",
  "state.tier2Subject.credential": "Credentials",
  "state.tier2Subject.production": "Production",
  "state.tier2Subject.migration": "Data migration",

  "detail.card.workflow": "Review workflow",
  "workflow.fresh.title": "Fresh Context (two turns)",
  "workflow.fresh.turn1": "Turn 1 (review request)",
  "workflow.fresh.assessment": "Fresh Assessment",
  "workflow.fresh.turn2": "Turn 2 (resolution follow-up)",
  "workflow.fresh.judgment": "Final Judgment",
  "workflow.fresh.notSent": "not sent",
  "workflow.fresh.notReceived": "not received",
  "workflow.fresh.hint":
    "Turn 1 carries no background and no implementation history. That context is shared in Turn 2, after the initial assessment has come back.",
  "workflow.actions.ariaLabel": "Workflow actions",
  "workflow.actions.copyFollowup": "Copy Turn 2",
  "workflow.actions.captureJudgment": "Save the Final Judgment",
  "workflow.actions.setRiskTier": "Set the Risk Tier",
  "workflow.followup.needsAssessment": "Turn 2 cannot be sent until the Fresh Assessment is saved",
  "workflow.followup.answered": "Turn 2 cannot be rewritten once the Final Judgment is in",
  "workflow.judgment.needsFollowup": "The Final Judgment cannot be saved until Turn 2 has gone out",
  "workflow.riskTier.title": "Risk Tier",
  "workflow.riskTier.unset": "not set",
  "workflow.riskTier.subjectsLabel": "Tier 2 subjects",
  "workflow.riskTier.noSubjects": "no Tier 2 subject declared",
  "workflow.riskTier.hint":
    "The Risk Tier is the Human's own axis, independent of Review State, Resource State and Freshness.",

  "events.type.reviewCreated": "Review created",
  "events.type.reviewReady": "Marked ready for review",
  "events.type.reviewStarted": "Review started",
  "events.type.reviewCancelled": "Review cancelled",
  "events.type.requestSaved": "Review request saved",
  "events.type.resultCaptured": "Review result captured",
  "events.type.verdictConfirmed": "Verdict confirmed",
  "events.type.blocked": "Blocked",
  "events.type.suspended": "Suspended",
  "events.type.resumed": "Resumed",
  "events.type.closed": "Closed",
  "events.type.resourceChanged": "Resource state changed",
  "events.type.nextActionUpdated": "Next action updated",
  "events.type.metadataUpdated": "Review details updated",
  "events.type.followupSaved": "Turn 2 request saved",
  "events.type.judgmentCaptured": "Final Judgment captured",
  "events.type.riskTierSet": "Risk Tier set",
  "events.type.duplicateContinued": "Duplicate review continued",
  "events.type.evidenceReused": "Evidence reused",

  // --- project form ------------------------------------------------------------------------------------
  "project.form.createTitle": "Create project",
  "project.form.editTitle": "Edit project — {name}",
  "project.form.displayName": "Display name",
  "project.form.projectId": "Project ID",
  "project.form.projectIdHint":
    "Stable key: lowercase letters, digits and hyphens. Cannot be changed later.",
  "project.form.projectIdLocked": "Project ID cannot be changed.",
  "project.form.repositoryUrl": "Repository URL",
  "project.form.repositoryUrlHint":
    "https://github.com/<owner>/<repo> (optional)",
  "project.form.localRoot": "Local root",
  "project.form.localRootHint":
    "Absolute drive path such as C:\\work\\project (optional). Stored on this machine only.",
  "project.form.ide": "Development IDE",
  "project.form.ideHint": "Label only (optional)",
  "project.form.nextAction": "Project next action",
  "project.form.notes": "Notes",
  "project.form.notesHint": "Local notes; never included in review requests.",
  "project.form.submitCreate": "Create project",
  "project.form.submitSave": "Save project",

  // --- review form -------------------------------------------------------------------------------------
  "review.form.createTitle": "Create review",
  "review.form.project": "Project",
  "review.form.projectPlaceholder": "Select a project…",
  "review.form.reviewType": "Review type",
  "review.form.prNumber": "PR number",
  "review.form.optional": "Optional",
  "review.form.expectedHead": "Expected HEAD ({round})",
  "review.form.expectedHeadHint":
    "Commit SHA you expect the reviewer to review (optional, recorded by you — not fetched from Git).",
  "review.form.threadTitle": "ChatGPT thread title",
  "review.form.threadUrl": "ChatGPT thread URL",
  "review.form.threadUrlHint":
    "https://chatgpt.com/... or https://chat.openai.com/... (optional)",
  "review.form.nextAction": "Next action",
  "review.form.resourceState": "Resource state",
  "review.form.submitCreate": "Create review",
  "review.form.submitSave": "Save review",
  "review.types.prReview": "PR review",
  "review.types.reReview": "Re-review",
  "review.types.designReview": "Design review",
  "review.types.planReview": "Plan review",

  // --- dialogs ------------------------------------------------------------------------------------------
  "dialog.cancel": "Cancel",
  "dialog.close": "Close",
  "dialog.closeAriaLabel": "Close dialog",
  "dialog.dismiss": "Dismiss",
  "review.edit.title": "Edit review",
  "review.suspend.title": "Suspend review",
  "review.suspend.body":
    "The review becomes {suspendedLabel} and remembers its current state ({state}). Resume restores it. You can close ChatGPT and the IDE afterwards.",
  "review.suspend.checkpointLabel": "Checkpoint (saved to checkpoint.md)",
  "review.suspend.resourceLegend": "Resource state while suspended",
  "review.suspend.submit": "Suspend",
  "review.suspend.draft.state": "State: {label} (R{round})",
  "review.suspend.draft.stoppedAt": "Stopped at: ",
  "review.suspend.draft.next": "Next: {nextAction}",
  "review.capture.title": "Capture review result — R{round}",
  "review.capture.body":
    "Copy the reviewer's answer in ChatGPT, then paste it below with {paste}. It is saved as {file}. The review state does not change until you confirm a verdict.",
  "review.capture.replaceLabel":
    "Replace the saved result of R{round}. The current text is kept as {archived}; {file} becomes the new latest result.",
  "review.capture.resultLabel": "Review result",
  "review.capture.resultPlaceholder":
    "Paste the ChatGPT review result here (Ctrl+V)",
  "review.capture.reviewedHeadLabel": "Reviewed HEAD",
  "review.capture.reviewedHeadHint":
    "The commit SHA the reviewer states it reviewed (optional; leave empty if not stated).",
  "review.capture.submitReplace": "Replace result",
  "review.capture.submitSave": "Save result",
  "review.verdict.title": "Confirm verdict — R{round}",
  "review.verdict.missingResult":
    "The saved result for this round is loading or unavailable.",
  "review.verdict.legend": "Verdict (your decision)",
  "review.verdict.separator": " — ",
  "review.verdict.fixRequiredDescription":
    "The reviewer requires fixes before passing.",
  "review.verdict.reviewPassDescription":
    "The reviewer found no required fixes.",
  "review.verdict.blockedDescription":
    "The review cannot proceed (reason required).",
  "review.verdict.reasonRequired": "Reason (required)",
  "review.verdict.noteOptional": "Note (optional)",
  "review.verdict.acknowledgement":
    "I have read the review result and confirm this verdict.",
  "review.verdict.later": "Decide later",
  "review.verdict.submit": "Confirm verdict",
  // --- risk tier dialog (Phase 3) ------------------------------------------------------------------------------
  "review.riskTier.title": "Set the Risk Tier (R{round})",
  "review.riskTier.tier": "Risk Tier",
  "review.riskTier.subjects": "Tier 2 subjects (tick every one that applies)",
  "review.riskTier.tier0Description": "Small, reversible, narrow in effect",
  "review.riskTier.tier1Description": "An ordinary change, reviewed at the standard depth",
  "review.riskTier.tier2Description": "Touches security, privacy, credentials, production or a data migration",
  "review.riskTier.acknowledgement": "I confirm this Risk Tier as the Human",
  "review.riskTier.rule":
    "With a Tier 2 subject declared, Tier 0 and Tier 1 cannot be chosen. DVCC refuses with the reason rather than quietly raising it.",
  "review.riskTier.submit": "Set the Risk Tier",

  // --- final judgment dialog (Phase 3) -------------------------------------------------------------------------
  "review.judgment.title": "Save the Final Judgment (R{round})",
  "review.judgment.text": "Final Judgment (the answer to Turn 2)",
  "review.judgment.textHint":
    "The Fresh Assessment is not overwritten: this is kept separately as judgment-r{round}.md.",
  "review.judgment.replace": "Replace the saved Final Judgment (the previous text is kept in its own file)",
  "review.judgment.submitSave": "Save the Final Judgment",
  "review.judgment.submitReplace": "Replace the Final Judgment",

  "review.nextRound.title": "Start round R{round}",
  "review.nextRound.body":
    "R{previous} artifacts stay as they are. R{round} starts as {readyLabel}.",
  "review.nextRound.expectedHeadLabel": "Expected HEAD for R{round}",
  "review.nextRound.expectedHeadHint":
    "Optional; the commit you will ask the reviewer to review.",
  "review.nextRound.submit": "Start R{round}",
  "review.block.title": "Block review",
  "review.block.body":
    "The review moves to {blockedLabel}. Use “{markReady}” when it can continue.",
  "review.block.submit": "Block review",
  "review.block.reasonLabel": "Reason (required)",
  "review.close.title": "Close review",
  "review.close.body":
    "Closed reviews are hidden from the queue by default. Files and history are kept.",
  "review.close.submit": "Close review",
  "projects.setAside.title": "Set aside projects.json",
  "projects.setAside.body":
    "The unusable {projects} (and its unusable backup, if any) is renamed to {corrupt} in the data folder (not deleted), and DVCC starts with an empty project list. Reviews are not affected.",
  "projects.setAside.submit": "Set aside and start empty",
  "projects.setAside.action": "Set aside and start empty…",

  // --- review detail: unreadable review --------------------------------------------------------------------
  "unreadable.title.inaccessible": "Review {id} cannot be accessed",
  "unreadable.title.unreadable": "Review {id} cannot be read",
  "unreadable.body.inaccessible":
    "DVCC could not access {file} (for example permissions, a locked file or a device problem). This is not treated as damaged data: nothing was changed. Resolve the access problem, then reload. Other reviews are not affected.",
  "unreadable.body.unreadable":
    "The file was left unchanged and this review is read-only. Fix or restore {file} in the data folder, then reload. Other reviews are not affected.",

  // --- banners and notices ----------------------------------------------------------------------------------
  "banner.projectsIoError":
    "{projects} cannot be accessed: {problem}. This is an access problem (for example permissions, a locked file or a device error), not damaged data. Nothing was changed; project editing is disabled until Reload succeeds.",
  "banner.projectsUnreadable":
    "{projects} cannot be used: {problem}. Project editing is disabled and the file has not been changed.",
  "notice.restoredMissing":
    "{label} was missing and was restored from its backup (the backup was kept).",
  "notice.restoredCorrupt":
    "{label} could not be read and was restored from its backup. The unreadable file was kept as {quarantined}.",
  "notice.label.projects": "projects.json",
  "notice.label.reviewSession": "Review {id}: session.json",
  "notice.settingsInvalid":
    "{file} could not be read, so the interface language fell back to Japanese. The file was left unchanged.",
  "notice.settingsSaveFailed":
    "The interface language could not be saved to {file}, so it went back to the language that is stored.",
  "notice.settingsNotWritable":
    "The display language was not saved because this version of DVCC cannot safely update {file}. The file was left unchanged.",

  // --- toasts ------------------------------------------------------------------------------------------------
  "toast.projectCreated": "Project “{name}” created",
  "toast.projectSaved": "Project saved",
  "toast.reviewCreated": "Review created",
  "toast.reviewSaved": "Review saved",
  "toast.nextActionSaved": "Next action saved",
  "toast.reviewSuspended": "Review suspended — checkpoint saved",
  "toast.roundStarted": "Round R{round} started",
  "toast.reviewBlocked": "Review blocked",
  "toast.reviewClosed": "Review closed",
  "toast.verdictConfirmed": "Verdict confirmed: {verdict}",
  "toast.followupSaved":
    "Turn 2 saved as followup-r{round}.md and copied to the clipboard",
  "toast.followupSavedCopyFailed":
    "Saved followup-r{round}.md, but copying to the clipboard failed: {error}",
  "toast.judgmentCaptured":
    "Final Judgment saved as judgment-r{round}.md. {kept}The Fresh Assessment is left as it is.",
  "toast.riskTierSet": "Risk Tier set to {tier}",
  "toast.requestSaved":
    "Review request saved as request-r{round}.md and copied to the clipboard",
  "toast.requestSavedCopyFailed":
    "Saved request-r{round}.md, but copying to the clipboard failed: {error}",
  "toast.resultSaved":
    "Result saved as result-r{round}.md. {kept}The review state is unchanged until you confirm a verdict.",
  "toast.resultSavedKept": "The previous result was kept as {file}. ",
  "toast.setAsideDone": "Kept as {files}. Starting with an empty project list.",
  "toast.setAsideFailed": "Could not set the files aside: {error}",
  "toast.gitRefreshedAll": "Git state refreshed for {count} projects.",
  "toast.gitRefreshedAll_one": "Git state refreshed for {count} project.",
  "toast.noProjectsToObserve": "No projects to observe.",
  "toast.noProjectForReview": "No project is recorded for this review",
  "toast.noRepositoryUrl": "No repository URL recorded for this project",
  "toast.noThreadUrl": "No ChatGPT thread URL recorded for this review",
  "toast.noLocalRoot": "No local root recorded for this project",
  "toast.launchFailed": "{label} failed: {error}",

  // --- errors -------------------------------------------------------------------------------------------------
  "error.saveConflict":
    "Not saved: a file was changed on disk by another program since DVCC loaded it, and DVCC did not overwrite that change. Use Reload to see the current data.",
  "error.saveRecoveryRequired":
    "Not saved: the file is missing but its backup exists. Reload to restore it from the backup.",
  "error.saveFailed": "Save failed: {error}",
  "error.withCode": "{message} ({code})",
  "health.ioError": "could not be accessed: {reason} ({code})",
  "health.unsupportedVersion":
    "written by a newer DVCC version (schemaVersion {version}); opened read-only",
  "health.unreadable": "could not be read: {reason}",

  // --- validation --------------------------------------------------------------------------------------------
  "validation.url.notAbsolute": "Not a valid absolute URL",
  "validation.url.httpsOnly": "Only https URLs are allowed",
  "validation.url.credentials": "URLs with embedded credentials are not allowed",
  "validation.url.port": "URLs with a non-default port are not allowed",
  "validation.url.host": "Host must be one of: {hosts}",
  "validation.repositoryUrl.shape":
    "Repository URL must look like https://github.com/<owner>/<repo>",
  "validation.repositoryUrl.query":
    "Repository URL must not contain a query or fragment",
  "validation.head.format":
    "HEAD must be a 7–40 character hexadecimal commit SHA",
  "validation.prNumber.format": "PR number must be a positive integer",
  "validation.localRoot.unc": "UNC / network paths are not supported",
  "validation.localRoot.absolute":
    "Local root must be an absolute drive path such as C:\\work\\project",
  "validation.displayName.required": "Display name is required",
  "validation.displayName.tooLong":
    "Display name must be at most {max} characters",
  "validation.projectId.format":
    "Project ID must be 2–64 characters: lowercase letters, digits and hyphens, starting with a letter or digit",
  "validation.projectId.duplicate": "Project ID is already used",
  "validation.ide.tooLong": "IDE label must be at most {max} characters",
  "validation.nextAction.tooLong": "Next action is too long",
  "validation.notes.tooLong": "Notes are too long",
  "validation.reviewType.required": "Review type is required",
  "validation.reviewType.tooLong":
    "Review type must be at most {max} characters",
  "validation.threadTitle.tooLong":
    "Thread title must be at most {max} characters",
  "validation.project.required": "Select a registered project",
  "validation.resourceState.required": "Select a resource state",

  // --- action guards -----------------------------------------------------------------------------------------
  "action.notAllowed": "“{action}” is not allowed while the review is {state}",
  "action.alreadyActive": "The review is already active (not suspended and HOT)",
  "action.roundLimit": "The round limit (R{max}) has been reached",
  "action.expectedHead.invalid": "Expected HEAD is not a valid SHA",
  "action.reviewedHead.invalid": "Reviewed HEAD is not a valid SHA",
  "action.archive.roundMismatch": "Archive file name does not match this round",
  "action.archive.resultMismatch":
    "Archive file name does not match the replaced result",
  "action.archive.duplicate": "Archive file name is already recorded",
  "action.capture.replaceConfirmationRequired":
    "R{round} already has a saved result; replacing it requires explicit Human confirmation",
  "action.archive.judgmentMismatch":
    "Archive file name does not match the replaced Final Judgment",
  "action.followup.assessmentRequired":
    "Capture the Fresh Assessment of R{round} before saving a Turn 2",
  "action.followup.judgmentCaptured":
    "R{round} already has a Final Judgment, so its Turn 2 can no longer be rewritten",
  "action.followup.verdictConfirmed":
    "The verdict of R{round} is confirmed, so no Turn 2 can be saved",
  "action.judgment.assessmentRequired":
    "Capture the Fresh Assessment of R{round} before capturing a Final Judgment",
  "action.judgment.followupRequired":
    "R{round} has not sent a Turn 2, so there is no Final Judgment to capture",
  "action.judgment.verdictConfirmed":
    "The verdict of R{round} is confirmed, so no Final Judgment can be captured",
  "action.judgment.replaceConfirmationRequired":
    "R{round} already has a Final Judgment; replacing it requires explicit Human confirmation",
  "action.riskTier.confirmationRequired": "Setting the Risk Tier requires explicit Human confirmation",
  "action.riskTier.verdictConfirmed":
    "The verdict of R{round} is confirmed, so the Risk Tier can no longer be changed",
  "action.riskTier.unknown": "Unknown Risk Tier",
  "action.riskTier.belowRequired":
    "The subjects declared for this change require Risk Tier {required} or higher",
  "action.revalidation.verdictConfirmed":
    "The verdict of R{round} is confirmed, so a revalidation reason can no longer be recorded",
  "action.revalidation.alreadyRecorded":
    "R{round} already records why it is reviewing this head again",
  "action.revalidation.reasonNotApplicable":
    "That invalidation reason does not apply to a duplicate review of the same HEAD",
  "action.revalidation.priorReviewRequired":
    "Recording a revalidation needs the existing review it is about",
  "action.evidence.verdictConfirmed":
    "The verdict of R{round} is confirmed, so the evidence decisions can no longer be changed",
  "action.evidence.duplicateItem": "Evidence “{id}” appears twice",
  "action.verdict.confirmationRequired":
    "A verdict requires explicit Human confirmation",
  "action.verdict.resultRequired":
    "Capture the review result for round R{round} before confirming a verdict",
  "action.suspend.notResumable": "Cannot suspend from {state}",
  "action.resource.unchanged": "Resource is already {state}",
  "action.verdict.unknown": "Unknown verdict",
  "action.verdict.judgmentRequired":
    "This round sent a Turn 2, so capture the Final Judgment (judgment-r{round}.md) before confirming a verdict",
  "action.block.confirmationRequired":
    "Blocking requires explicit Human confirmation",
  "action.block.reasonRequired": "A reason is required to block the review",
  "action.block.reasonTooLong": "Reason is too long",
  "action.suspend.resourceState": "Suspend requires WARM or COLD",
  "action.suspend.checkpointRequired":
    "A checkpoint note is required to suspend",
  "action.resume.noPreviousState":
    "Suspended review has no recorded previous state",
  "action.close.confirmationRequired":
    "Closing requires explicit Human confirmation",
  "action.nextAction.unchanged": "Next action is unchanged",

  // --- services ------------------------------------------------------------------------------------------------
  "service.projectsNotModifiable": "projects.json cannot be modified: {problem}",
  "service.unknownProject": "Unknown project: {id}",
  "service.noArchiveName":
    "R{round} has no free archive name left for the previous response",
  "service.resultRequired": "Paste the review result before saving",
  "service.resultTooLong": "Review result is too long",
  "service.judgmentRequired": "Paste the Final Judgment before saving",
  "service.judgmentTooLong": "Final Judgment is too long",
  "service.reviewIdCollision":
    "Could not allocate a unique review id; try again",
  "service.reviewUnavailable": "Review {id} is not available",
  "service.projectMissing": "Project {id} is not in projects.json",
  "service.eventAppendFailed":
    "State saved, but the event history could not be appended: {error}",

  // --- file health and schema reasons ----------------------------------------------------------------------
  "health.reason.text": "{text}",
  "health.reason.backup": "backup: {error}",
  "health.reason.backupRestoreFailed": "backup restore failed: {error}",
  "health.missingWithUnreadableBackup":
    "the file is missing and its backup is unreadable: {backup}",
  "health.primaryAndBackupUnreadable":
    "{primary}; the backup is also unreadable: {backup}",
  "health.sessionMissing": "session.json is missing",
  "schema.field.mustBeString": "{field} must be a string",
  "schema.field.mustBeStringOrNull": "{field} must be a string or null",
  "schema.field.mustBeTimestamp":
    "{field} must be an ISO-8601 UTC timestamp",
  "schema.field.mustBeTimestampOrNull":
    "{field} must be an ISO-8601 UTC timestamp or null",
  "schema.field.mustBeHeadOrNull":
    "{field} must be a lowercase 7–40 character hexadecimal commit SHA or null",
  "schema.field.mustBeObject": "{field} must be an object",
  "schema.invalidJson": "invalid JSON: {reason}",
  "schema.topLevelMustBeObject": "the top-level value must be an object",
  "schema.versionMustBe": "schemaVersion must be {version}",
  "schema.projects.mustBeArray": "projects must be an array",
  "schema.projects.duplicateId": "duplicate projectId: {id}",
  "schema.project.invalidId": "{field} is not a valid project id",
  "schema.project.displayNameEmpty": "{field} must not be empty",
  "schema.project.repositoryUrlNotNormalized":
    "{field} is not a normalized GitHub repository URL",
  "schema.project.localRootNotAbsolute":
    "{field} is not an absolute drive path",
  "schema.round.numberMustBe": "{field} must be {expected}",
  "schema.round.unknownVerdict": "{field} is not a known verdict",
  "schema.round.archivedResults":
    "{field} must list result-r{round}-previous-<ms>.md file names",
  "schema.field.mustBeArray": "{field} must be an array",
  "schema.round.unknownRiskTier": "{field} is not a known Risk Tier",
  "schema.round.followupWithoutAssessment":
    "{field} is present but the round has no captured Fresh Assessment",
  "schema.round.judgmentWithoutFollowup":
    "{field} is present but the round has no record of a Turn 2",
  "schema.round.archivedJudgments":
    "{field} must list judgment-r{round}-previous-<ms>.md file names",
  "schema.round.invalidationReason": "{field} is not a known invalidation reason",
  "schema.round.priorReviewId": "{field} is not a valid review id",
  "schema.round.priorReviewRound": "{field} must be a positive integer",
  "schema.round.evidenceSource": "{field} is not a known evidence source",
  "schema.round.evidenceStatus": "{field} is not a known evidence status",
  "schema.round.evidenceReason": "{field} is not a known evidence reason",
  "schema.session.invalidReviewId":
    "session.reviewSessionId is not a valid review id",
  "schema.session.idFolderMismatch":
    "session.reviewSessionId ({id}) does not match its folder ({folder})",
  "schema.session.invalidProjectId":
    "session.projectId is not a valid project id",
  "schema.session.prNumber":
    "session.prNumber must be a positive integer or null",
  "schema.session.reviewTypeEmpty": "session.reviewType must not be empty",
  "schema.session.unknownResourceState":
    "session.resourceState is not a known resource state",
  "schema.session.unknownReviewState":
    "session.reviewState is not a known review state",
  "schema.session.suspendedFromNotResumable":
    "session.suspendedFrom must be a resumable state while SUSPENDED",
  "schema.session.suspendedFromMustBeNull":
    "session.suspendedFrom must be null unless SUSPENDED",
  "schema.session.roundsEmpty": "session.rounds must be a non-empty array",
  "schema.session.roundsExceedLimit":
    "session.rounds exceeds the round limit (R{max})",
  "schema.session.reviewRoundMismatch":
    "session.reviewRound must equal the number of rounds",
  "schema.session.threadUrl": "{field}: {reason}",
  "schema.event.stateChangeMustBeObject":
    "a state change must be an object or null",
  "schema.event.stateChangeFromUnknown":
    "the from of a state change is not a known state",
  "schema.event.stateChangeToUnknown":
    "the to of a state change is not a known state",
  "schema.event.detailKindMismatch": "{field} does not match the event type",
  "schema.event.unknownTierSubject": "{field} is not a known Tier 2 subject",
  "schema.event.unsupportedVersion": "unsupported event version",
  "schema.event.unknownType": "unknown event type",
  "schema.event.invalidReviewId": "invalid reviewSessionId",
  "schema.event.invalidRound": "invalid round",

  // --- time ------------------------------------------------------------------------------------------------------
  "time.pattern": "{year}-{month}-{day} {hour}:{minute}",
  "time.unknown": "—",
};
