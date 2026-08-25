# Compass (formerly "Sprint Co-Pilot") — brief for any Claude session working on this

Full detail, module interfaces, dependency graph, and per-track scope: see
`PLAN.md` in this directory. This file is just the load-bearing constraints —
read it before touching any track.

1. **LLM provider is OpenAI only — no other provider, under any circumstance.**
   The user has an OpenAI key available; do not substitute Anthropic, Gemini, or
   anything else even if it seems more convenient.

2. **Approach B: two-phase, preview then confirm.** (Supersedes the original
   Approach A "fully atomic, no confirm step" — that constraint was
   deliberately reversed; do not revert to it.) The pipeline is scrape →
   classify → allocate, streamed live to the UI as an activity log ending in
   a preview of the proposed sprint (no GitHub writes yet). The user can
   toggle issues in/out of that preview before clicking "Confirm & write,"
   which streams the write phase (milestone → per-issue assign/label) and is
   the only point anything is written to GitHub. Cancelling the review screen
   discards the preview with no writes made. (The UI also shows a live
   backlog overview — every open issue, unfiltered — above the flow; that's
   informational only, separate from the preview/review step. See PLAN.md's
   "Live backlog overview" addendum.)

2a. **No mock data in the shipped app.** `/api/run` and `/api/issues` call the
    real GitHub/OpenAI modules — `src/fixtures/*.json` are reference data only,
    not imported by any route.

3. **Three GitHub API gotchas** (verified against docs, not memory):
   - Sub-issues: `POST .../issues/{issue_number}/sub_issues` body
     `{"sub_issue_id": <id>}` — `sub_issue_id` is the child issue's numeric
     database `id`, **not** its `number`. Create the child issue first, capture
     the returned `id`, then link it.
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

6. **CORS is a non-issue by design.** The browser only talks to the
   same-origin `/api/run` route; GitHub and OpenAI are called server-side from
   that route. A client-side `fetch()` straight to `api.github.com` or
   `api.openai.com` is a bug (CORS failure + secret leak), not something to
   route around.
