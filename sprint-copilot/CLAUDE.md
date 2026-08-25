# Compass (formerly "Sprint Co-Pilot") — brief for any Claude session working on this

Full detail, module interfaces, dependency graph, and per-track scope: see
`PLAN.md` in this directory. This file is just the load-bearing constraints —
read it before touching any track.

1. **LLM provider is OpenAI only — no other provider, under any circumstance.**
   The user has an OpenAI key available; do not substitute Anthropic, Gemini, or
   anything else even if it seems more convenient.

2. **Approach B: two-phase, preview then confirm.** (Supersedes the original
   Approach A "fully atomic, no confirm step" — that constraint was
   deliberately reversed; do not revert to it.) `POST /api/run/preview` takes
   an optional `{ sprintFocus?: string }` and streams
   `fetch → classify → consolidate duplicates → allocate` as NDJSON
   activity-log events, ending in a `PreviewResult` — no GitHub writes yet.
   The review screen (`ReviewPanel`) lets the user toggle issues in/out and
   edit the milestone title. `POST /api/run/confirm` takes that (possibly
   adjusted) `{ selected, milestoneTitle, totals }` and streams the write
   phase (create milestone with a due date → per-issue assign/label) — the
   only point anything is written to GitHub. Cancelling discards the preview
   with no writes made. The Kanban board (`/`, see point 7) is the live
   backlog/board overview now — it replaced the old "backlog list above the
   run button" panel from Approach A. `BacklogList.tsx` still exists on disk
   but is dead code (not imported anywhere) — don't wire it back in without
   an explicit ask; extend the Kanban board instead.

2a. **No mock data in the shipped app.** No shipped route imports
    `src/fixtures/*.json` — they're reference data only. Every route
    (`/api/run/preview`, `/api/run/confirm`, `/api/board*`, `/api/issues`,
    `/api/milestones`, `/api/chat`) calls the real GitHub/OpenAI modules.

2b. **Sub-issue / epic-splitting is out of scope for now.** Classification
    does not detect epics or suggest subtickets (`IssueClassification` has no
    `is_epic` or `subticket_suggestions` field), and no route creates or
    links sub-issues. This was deliberately descoped — do not re-add it
    without an explicit ask. The low-level capability still exists at
    `createSubIssue()` in `src/lib/github/issues.ts` (kept, tested, unused by
    every route) in case it's wanted again later — see gotcha #3 below for
    how it works if you do wire it back in.

2c. **Duplicate consolidation happens before allocation.** Classification's
    `duplicate_of` field (an `issue_number` or `null`) flags near-duplicates
    within the same batch. `consolidateDuplicates()`
    (`src/lib/allocation/consolidate.ts`) resolves `duplicate_of` chains to
    their root and excludes every non-root duplicate before `allocate()` ever
    runs, so duplicates never compete for sprint capacity. `ConsolidatedEntry`
    (`{ issue: GitHubIssue, duplicateOfIssue: GitHubIssue }` — the *full*
    issue objects, not just display strings, so both can be opened in
    `TicketDetailModal` without a second fetch — see the in-place-detail-modal
    addendum below) carries enough of each issue's own data for a real
    per-item UI — `ReviewPanel` renders a dedicated "Duplicates excluded" box
    (one row per excluded issue, linked to both it and the issue it
    duplicates), not just a count. Always report these in the UI, don't
    silently drop them.

2d. **Unfinished issues from the previous sprint are force-carried into the
    new preview.** Before classification, `/api/run/preview` calls
    `listMilestones()` + `findPreviousMilestone()`
    (`src/lib/github/milestones.ts`) to find the most recent milestone whose
    due date has passed (falling back to the most recently created milestone
    if none has a due date), then treats any still-open issue on that
    milestone as a carry-over candidate. `allocate()`
    (`src/lib/allocation/allocate.ts`) takes an optional third
    `guaranteedNumbers: Set<number>` param — carry-over issues are always
    selected, and their points reduce their bucket's budget for everything
    else (they can push the run over capacity; the review screen's existing
    over-capacity styling covers that). They're flagged in the preview via
    `ClassifiedIssue.carriedOverFromMilestone` and shown with a "carried
    over" badge in `ReviewPanel`. This was previously a gap — the pipeline
    re-fetched all open issues every run with no notion of "previous sprint"
    at all, so unfinished work could silently miss its old sprint's view or
    get re-milestoned with a stale `status:in-progress` label still on it
    (see the labels gotcha below for that half of the fix).
    **Dragging a card back to Backlog must clear its milestone, or this
    silently over-triggers.** Found live: a card moved to Backlog only had
    its `status:*` label stripped (via `setIssueBoardStatus`) — its
    milestone assignment was untouched, so it kept counting as a carry-over
    candidate for that sprint forever, even though the board visually
    showed it back in Backlog (Backlog always renders regardless of
    milestone, so nothing looked wrong). `PATCH /api/board/{number}`
    (`board/[number]/route.ts`) now calls the new
    `unassignIssueFromMilestone()` (`{"milestone": null}`, `issues.ts`)
    whenever `status === "backlog"` and no explicit `milestoneNumber` was
    given; `KanbanBoard.tsx`'s optimistic update clears `milestone` locally
    the same way. Confirmed live: 8 issues had accumulated this
    stuck-on-Sprint-2 state before the fix; cleaning them up (re-PATCHing
    each to `status: "backlog"`) dropped a preview's carry-over count from
    8 to the 1 that was actually still open. If carry-over counts look too
    high again, check for issues with `status: "backlog"` on the board that
    still have a non-null `milestone` — that combination should be
    impossible going forward.

2e. **Classification also flags possibly-stale issues, using real repo
    content — not just a review of other issues.** Before classifying,
    `/api/run/preview` fetches the target repo's file tree
    (`getRepoTree()`, git trees API, capped at 400 blob paths) and README
    (`getReadme()`, raw content, truncated to 2000 chars) —
    `src/lib/github/repo.ts` — and folds both into the classification
    system prompt as `RepoContext` (`src/lib/llm/prompt.ts`). The LLM sets
    `IssueClassification.possibly_stale_reason` (a string, or `null`) when
    the file tree/README show an issue is probably already implemented or no
    longer applies. **Deliberately cheap**: file tree + README only, no file
    contents fetched per-issue — a heavier "fetch content of files that look
    related to each ticket" version was considered and rejected as
    unnecessary complexity for this pass. The prompt wording here has real
    calibration tension — encourage inference from file/component naming
    (e.g. an issue titled "add a kanban board" when `KanbanBoard.tsx`
    already exists) too strongly and it over-flags everything in the same
    subsystem (tried once: 22/22 issues got flagged, useless); too weakly
    and it never fires at all (tried too: 0/19). Current wording sets a
    "close, specific name match to the issue's core ask" bar — see the
    instruction block in `buildClassificationPrompt` before loosening or
    tightening it again, and re-verify against a repo with an
    obviously-already-built feature before considering a change "done".
    `classifyIssues()` sets `temperature: 0` for exactly this reason
    (verified live that `gpt-5.4-mini` accepts it) — don't remove it. It
    helps but does **not** fully fix run-to-run variance on this field
    (confirmed empirically: two temp-0 runs against the identical prompt
    flagged 4 and 9 issues respectively) — that's an inherent property of
    hosted LLM inference over a multi-issue batch, not a bug to chase
    further; see PLAN.md's calibration-history addendum, point 4.
    Unlike `duplicate_of`, a possibly-stale issue is **not** auto-excluded
    from allocation — it's a flag for the human to review, shown as its own
    dedicated "Possibly outdated" box in `ReviewPanel` (one row per flagged
    issue with the reason inline) — deliberately **not** also an inline
    per-row badge in the columns; each signal (duplicates, possibly-outdated)
    gets exactly one UI surface, not a scattered/duplicated one. Both
    repo-content fetches are non-fatal: a failure just skips the relevance
    check for that run (logged), same pattern as the carry-over lookup in
    2d. Each row in both boxes has a real action button now — see 2f, this
    supersedes the original "no close/delete button, act on it manually"
    design.

2f. **The "Duplicates excluded" and "Possibly outdated" boxes write to
    GitHub immediately on click — a deliberate, narrow exception to
    Approach B's "nothing is written until Confirm."** "Consolidate" (on a
    duplicate row) posts a comment (`"Closing as a duplicate of #N."`) then
    closes the issue as `not_planned`, via a new `POST
    /api/board/{number}/consolidate` route (`commentOnIssue()` +
    `setIssueBoardStatus()`, both in `issues.ts`). "Close" (on a
    possibly-outdated row) just closes as `not_planned` — reuses the
    existing `PATCH /api/board/{number}` route with `{status: "cancelled"}`,
    no new endpoint. Both are real, immediate, per-issue writes,
    independent of the Confirm/Cancel flow below them — Cancelling the
    whole preview does **not** undo an action already taken in either box.
    Closing a possibly-stale issue this way also flips its
    `inSprint` back to `false` in the review list if it was checked, so
    Confirm can't still try to milestone/label an issue you just closed.
    No such reconciliation exists for the duplicates box because a
    duplicate issue was never in the review list to begin with
    (`consolidateDuplicates()` already excludes it before allocation).

2g. **Sprint focus actually prioritizes which issues get selected, not just
    their point estimates.** `IssueClassification.matches_sprint_focus`
    (boolean, set by the LLM — true only when a `sprintFocus` was given and
    the issue clearly relates to it) feeds `allocate()`'s sort order
    (`sortByFocusThenPointsThenNumber` in `allocate.ts`): focus-matching
    issues sort ahead of non-matching ones within the same bucket, *then*
    ascending by points/number as before. This is what makes "focus on X"
    actually change the outcome, not just nudge effort estimates — verified
    live (a focus-matching 3-pt issue displaced other work into the
    selected set that wasn't selected without a matching focus). Priority
    order is: guaranteed carry-over (2d, always in, budget comes off the
    top before this sort ever runs) > focus-match > smaller points > lower
    issue number. This means a nearly-full carry-over queue can still starve
    focus-matching issues of budget even though the sort is working
    correctly — that's expected, not a bug; don't "fix" it by making focus
    override carry-over without an explicit ask. Shown in `ReviewPanel` as
    a "focus" badge per matching row (indigo, distinct from the amber
    "possibly stale" one).

2h. **Clicking a ticket anywhere in the review screen opens `TicketDetailModal`
    in place — it must never navigate away.** Every ticket-title click target
    in `ReviewPanel.tsx` (main columns, the "Possibly outdated" box, and both
    links in the "Duplicates excluded" box) is a `<button>` that calls
    `setDetailIssue(...)`, rendering the same read-only `TicketDetailModal`
    the Kanban board uses, as an overlay on the current page. **Do not
    reintroduce `next/link`'s `<Link href="/?issue=N">` here** — that was the
    original implementation and it navigated to the Kanban board (`/`),
    unmounting the whole sprint-planning page and losing the in-progress
    preview/review state (found live: "the preview shouldn't disappear").
    `ReviewIssue` (`ReviewPanel.tsx`) now `extends GitHubIssue` plus a
    computed `status: BoardStatus` (via `computeBoardStatus()`), so a review
    row's issue can be handed straight to `TicketDetailModal` without a
    second fetch; `detailIssue` state is typed `BoardIssue | null` (not
    `ReviewIssue | null`) specifically so the duplicates box can also open
    it by spreading a plain `ConsolidatedEntry.issue`/`duplicateOfIssue`
    (a `GitHubIssue`, not a `ReviewIssue`) plus a freshly computed `status`.

3. **GitHub API gotchas** (verified against docs, not memory):
   - Sub-issues (not currently used — see 2b): `POST
     .../issues/{issue_number}/sub_issues` body `{"sub_issue_id": <id>}` —
     `sub_issue_id` is the child issue's numeric database `id`, **not** its
     `number`. Create the child issue first, capture the returned `id`, then
     link it.
   - Milestone assignment: `PATCH .../issues/{issue_number}` body
     `{"milestone": <milestone number>}` — uses the milestone's `number`,
     **not** its `id`.
   - Labels: use the additive `POST .../issues/{issue_number}/labels`, never a
     `PATCH .../issues/{n}` with a `labels` field (that replaces the whole set
     and clobbers existing labels). Bucket labels are `BUCKET_LABEL` in
     `config.ts` — GitHub's own `enhancement`/`bug`, **not** a synthetic
     `type:feature`/`type:bug` scheme (that was consolidated away; see
     `src/lib/labels.ts`'s `TYPE_LABEL_PATTERN`). Confirm also applies
     `STATUS_TODO_LABEL` (`"status:todo"`) to every written issue. There is
     **no** `agent-drafted` label — it was removed (from both the code and
     every already-labeled issue in the target repo) as an unneeded marker;
     don't re-add it without an explicit ask. A carried-over issue (see 2d)
     may still carry `status:in-progress` from the previous sprint —
     `/api/run/confirm` strips that via `removeLabel()` before applying
     `STATUS_TODO_LABEL`, since additive-only labels would otherwise stack
     both status labels on it. `ConfirmSelection` carries each issue's
     preview-time `labels` so confirm knows what to strip.
   - Self-assignment: Confirm also assigns every written issue to the PAT's
     own login (`getAuthenticatedUserLogin()`, `GET /user`) via the plain
     REST `POST .../issues/{issue_number}/assignees` — unlike the Copilot
     bot login below, this endpoint works fine for a real human login. This
     is a solo-project stopgap (no team roster to pick an assignee from);
     don't build out a multi-assignee picker without an explicit ask. A
     failed login lookup is logged once and skips assignment for the whole
     run rather than erroring per-issue.
   - Copilot hand-off: **do not use the plain REST `POST
     .../issues/{issue_number}/assignees` endpoint** — verified against a
     live repo that it returns 201 but silently drops the
     `"copilot-swe-agent"` login (empty `assignees` array afterward, no
     error). The only working mechanism is GraphQL: query
     `suggestedActors(capabilities: [CAN_BE_ASSIGNED])` on the repo to get
     Copilot's bot actor `id` (matching `login === COPILOT_ASSIGNEE_LOGIN`)
     plus the issue's node `id`, then mutate
     `addAssigneesToAssignable(input: { assignableId, assigneeIds: [id] })`
     with header `GraphQL-Features: issues_copilot_assignment_api_support`
     — see `assignCopilotToIssue()` in `issues.ts` and `githubGraphQL()` in
     `client.ts` (the latter also matters generically: GraphQL errors come
     back as HTTP 200 with an `errors` array, not a non-2xx status, so a
     plain `res.ok` check won't catch them). Throws a clear error if Copilot
     isn't enabled as an assignable actor on the repo, instead of silently
     no-oping. There's no push-based notification for the PR Copilot later
     opens; `getLinkedPullRequest()` reads the issue's `/timeline` for a
     `cross-referenced` event as a best-effort, poll-on-view lookup.
   - `GET /repos/{owner}/{repo}/issues` also returns pull requests — filter
     out any item with a `pull_request` key (done once, centrally, in
     `listOpenIssues`/`listAllIssues`).

4. **Error handling and testing are deliberately minimal.** Catch failures per
   pipeline stage, surface a plain message, no retries, no rollback of partial
   GitHub writes — this applies to every route, including the newer
   `/api/board*` and `/api/chat` ones, not just the run pipeline. Three
   unit-tested pure modules (`allocation/allocate.ts`,
   `allocation/consolidate.ts`, `board/status.ts`) plus a manual E2E checklist
   — do not build a broader test suite.

5. **No database, no auth flow.** State lives only in the request/response
   cycle and React state. Auth is a single GitHub PAT in a server-side env var.
   There is no settings page and no persisted preferences (a `localStorage`
   settings page briefly existed and was removed). "This sprint's focus" is a
   plain per-run `<textarea>` on the sprint-planning page, sent once as part
   of the `/api/run/preview` request body and folded into the classification
   prompt for that run only — nothing is stored anywhere.

6. **CORS is a non-issue by design.** The browser only talks to same-origin
   API routes under `/api/*`; GitHub and OpenAI are called server-side from
   those routes. A client-side `fetch()` straight to `api.github.com` or
   `api.openai.com` is a bug (CORS failure + secret leak), not something to
   route around.

7. **The Kanban board (`/`) is the primary live view, not the sprint-planning
   page.** Nav (`Nav.tsx`, left sidebar) links Kanban / Sprint Planning /
   Chat. The board (`KanbanBoard.tsx`) shows five fixed columns — Backlog,
   Todo, In Progress, Done, Cancel — computed by `computeBoardStatus()`
   (`src/lib/board/status.ts`, also home to `isIssueInColumn()`, the single
   source of truth for which sprint-nav column an issue shows in — both are
   tested pure functions, not inline component logic). It has a
   milestone-scoped sprint nav (‹ Sprint N ›): Backlog always shows every
   issue with backlog status regardless of milestone; Todo/In
   Progress/Done/Cancel scope to whichever milestone is selected — **except**
   a milestone-less issue in **Todo or In Progress**, which shows regardless
   of which sprint is selected. That exception is load-bearing, not an
   edge-case nicety: without it, an in-progress (etc.) issue with no
   milestone can never equal a specific selected milestone number, so it's
   invisible in *every* sprint view, permanently — this was a real bug,
   found and fixed live (issue #28, confirmed via `/api/board` before the
   fix and the rendered board after). Don't tighten `isIssueInColumn()`
   back to a plain `===` check for Todo/In Progress.
   **Done/Cancel deliberately do NOT get that exception** — a milestone-less
   closed issue matches no sprint at all, rather than showing in every
   sprint's Done/Cancel column. Found live (user report: "the done and
   cancelled ticket shouldn't show in other sprint") — the original #28 fix
   applied the milestone-less exception to every non-backlog status, which
   meant a closed issue that (for whatever reason) never got milestoned
   showed up in Sprint 1's Done column, Sprint 2's, Sprint 3's, all of them
   at once. A closed issue isn't "still active" the way an unmilestoned
   todo/in-progress one is, so `isIssueInColumn()` now requires an exact
   milestone match for `done`/`cancelled` — see the status/column-matching
   logic and its tests in `status.ts`/`status.test.ts` before changing this
   again; don't collapse the two branches back into one shared exception.
   Dragging a card writes straight to GitHub via `PATCH /api/board/{number}`
   (optionally also assigning it to the currently-viewed milestone if it
   didn't have one) — optimistic UI update, snaps back with an inline error
   on failure, no retries. Clicking a card opens `TicketDetailModal.tsx`
   (read-only). A Todo card can be handed to GitHub's Copilot coding agent
   via `POST /api/board/{number}/copilot`, which also moves it to In
   Progress — the "Do with Copilot" button doesn't show on already-In
   Progress cards, since hand-off only makes sense once. A PR badge on the
   card (shown on both Todo and In Progress cards) comes from `GET
   /api/board/{number}/pull-request`.

8. **Chat (`/chat`, `ChatThread.tsx` + `POST /api/chat`) is read-only.** It
   re-fetches the live board (`listAllIssues` + `computeBoardStatus`) fresh
   on every request — no caching — folds it into the system prompt, and
   answers with a single non-streamed `client.responses.create` call. It
   cannot write to GitHub; don't add tool-calling/actions to it without an
   explicit ask.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
