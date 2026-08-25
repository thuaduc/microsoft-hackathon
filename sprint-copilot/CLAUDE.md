# Sprint Co-Pilot — brief for any Claude session working on this

Full detail, module interfaces, dependency graph, and per-track scope: see
`PLAN.md` in this directory. This file is just the load-bearing constraints —
read it before touching any track.

1. **LLM provider is OpenAI only — no other provider, under any circumstance.**
   The user has an OpenAI key available; do not substitute Anthropic, Gemini, or
   anything else even if it seems more convenient.

2. **Approach B: two-phase, preview then confirm.** (Supersedes the original
   Approach A "fully atomic, no confirm step" — that constraint was
   deliberately reversed; do not revert to it.) `POST /api/run/preview`
   streams `fetch → classify → allocate` as NDJSON activity-log events,
   ending in a `PreviewResult` — no GitHub writes yet. The review screen
   (`ReviewPanel`) lets the user toggle issues in/out and edit the milestone
   title. `POST /api/run/confirm` takes that (possibly adjusted) selection
   and streams the write phase (milestone → per-issue assign/label) — the
   only point anything is written to GitHub. Cancelling discards the preview
   with no writes made. (The UI also shows a live backlog overview — every
   open issue, unfiltered — above the flow; that's informational only,
   separate from the preview/review step. See PLAN.md's "Live backlog
   overview" addendum.)

2a. **No mock data in the shipped app.** `/api/run` and `/api/issues` call the
    real GitHub/OpenAI modules — `src/fixtures/*.json` are reference data only,
    not imported by any route.

2b. **Sub-issue / epic-splitting is out of scope for now.** `/api/run` does not
    create or link sub-issues, and classification does not detect epics or
    suggest subtickets (`IssueClassification` has no `is_epic` or
    `subticket_suggestions` field). This was deliberately descoped — do not
    re-add it without an explicit ask. The low-level capability still exists at
    `createSubIssue()` in `src/lib/github/issues.ts` (kept, tested, unused by
    the pipeline) in case it's wanted again later — see gotcha #3 below for how
    it works if you do wire it back in.

3. **Three GitHub API gotchas** (verified against docs, not memory):
   - Sub-issues (not currently used by the pipeline — see 2b):
     `POST .../issues/{issue_number}/sub_issues` body `{"sub_issue_id": <id>}`
     — `sub_issue_id` is the child issue's numeric database `id`, **not** its
     `number`. Create the child issue first, capture the returned `id`, then
     link it.
   - Milestone assignment: `PATCH .../issues/{issue_number}` body
     `{"milestone": <milestone number>}` — uses the milestone's `number`,
     **not** its `id`.
   - Labels: use the additive `POST .../issues/{issue_number}/labels`, never a
     `PATCH .../issues/{n}` with a `labels` field (that replaces the whole set
     and clobbers existing labels).

4. **Error handling and testing are deliberately minimal.** Catch failures per
   pipeline stage, surface a plain message, no retries, no rollback of partial
   GitHub writes. One unit-tested module (allocation) plus a manual E2E
   checklist — do not build a broader test suite.

5. **No database, no auth flow.** State lives only in the request/response
   cycle and React state. Auth is a single GitHub PAT in a server-side env var.
   (There was briefly a settings page persisting preferences to
   `localStorage` — removed as redundant once the sprint-planning page grew
   its own per-run "this sprint's focus" field, which is plain React state,
   sent as part of the `/api/run/preview` request body and forwarded into
   the classification prompt. Nothing here is stored anywhere.)

6. **CORS is a non-issue by design.** The browser only talks to the
   same-origin `/api/run` route; GitHub and OpenAI are called server-side from
   that route. A client-side `fetch()` straight to `api.github.com` or
   `api.openai.com` is a bug (CORS failure + secret leak), not something to
   route around.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
