# Compass — Implementation Plan

**Renamed from "Sprint Co-Pilot" to "Compass" post-build** — cosmetic only, no
functional change; some section text below still says "Sprint Co-Pilot" as
history.

## Context

This is a hackathon submission for "Collaboration using GitHub Planning & Tracking
Tools in the Agentic Age" (Microsoft Hackathon 2026), scoped to a 4-6 hour build
window. The idea, "Sprint Co-Pilot," was refined through brainstorming into: a
single-button web tool that reads a GitHub repo's open issues, has an LLM classify
each one (feature/bug, epic-or-not, story points), runs a deterministic allocation
algorithm to pick a balanced sprint within a fixed team capacity, and writes the
result straight to GitHub — a new Milestone, issues assigned to it, real sub-issues
created for any epic, and labels applied.

The user explicitly chose **Approach A (fully atomic)**: one click runs the whole
pipeline — scrape → classify → allocate → write — with no intermediate
review/confirm screen. They also asked for **minimal error handling**, **minimal
testing**, and a plan **decomposed so multiple Claude Code sessions (via git
worktrees) can implement different parts in parallel**.

The repo (`/Users/duckoid/Downloads/dev/microsoft-hackathon`) is currently docs-only
(README.md, docs/organizer-setup.md) — confirmed clean slate, no existing
package.json/CI/env files. The app will live in a new `sprint-copilot/` subdirectory.

## Fixed requirements (already decided, do not re-litigate)

- Stack: single Next.js app (App Router) — React frontend + Next.js API routes as
  the backend. No separate server.
- Auth: one GitHub PAT in a server-side env var. No OAuth/login.
- LLM: OpenAI API (user has a key available — **use OpenAI, no other LLM provider**), one batched call classifying all issues at once.
- Target repo: configurable via env vars (owner/repo).
- Sprint container: a real GitHub Milestone.
- Epic tickets: real GitHub sub-issues, linked to the parent via the GitHub
  sub-issues API — not plain issues with a text reference.
- Feature/bug ratio: fixed constant, 70% feature points / 30% bug points.
- Team capacity: hardcoded constants — 3 devs × 6 pts/dev = 18 points.
- Epic detection: done by the LLM in the same classify call.
- No review/confirm step — Approach A, fully atomic. (The live backlog overview,
  added below, is informational only — it lists all open issues, not the
  algorithm's picks — so it doesn't reintroduce a confirm-before-write step.)
- Minimal error handling: catch failures per pipeline stage, show a plain message,
  no retries, no rollback of partial GitHub writes.
- Minimal testing: one unit-tested pure module (allocation) + a manual E2E checklist.
  No test suite beyond that.
- No database — state lives only in the request/response cycle and React state.

## Critical GitHub API details (verified against docs, not memory — these shape the interfaces below)

- **Sub-issues**: `POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues`
  body `{"sub_issue_id": <id>}`. **`sub_issue_id` is the child issue's numeric
  database `id` field, not its `number`.** Create the child issue first
  (`POST /repos/{owner}/{repo}/issues`), capture the returned `id`, then link it.
- **Milestone assignment**: `PATCH /repos/{owner}/{repo}/issues/{issue_number}`
  body `{"milestone": <milestone number>}` — uses the milestone's `number`
  (from `POST .../milestones`), not its `id`.
- **Labels**: `PATCH .../issues/{n}` with a `labels` field **replaces** the whole
  set. Use the additive endpoint instead:
  `POST /repos/{owner}/{repo}/issues/{issue_number}/labels` body `{"labels": [...]}`
  — so existing labels on the issue aren't clobbered.
- The `GET /repos/{owner}/{repo}/issues` endpoint also returns pull requests —
  filter out any item with a `pull_request` key.

## Directory layout

```
sprint-copilot/
  PLAN.md                        # this plan, copied in — foundation
  CLAUDE.md                      # load-bearing brief for any session — foundation
  package.json, next.config.ts, tsconfig.json
  .env.local.example
  src/
    types.ts                     # shared contracts — foundation, everyone codes against this
    config.ts                    # constants + env accessors — foundation
    fixtures/
      sample-issues.json         # shared fixture — foundation
      sample-result.json         # shared mock API response — foundation
    lib/
      github/
        client.ts                # authed fetch wrapper
        issues.ts                # listOpenIssues, applyLabels, assignIssueToMilestone, createSubIssue
        milestones.ts            # createMilestone
      llm/
        prompt.ts                # buildClassificationPrompt
        classify.ts              # classifyIssues
      allocation/
        allocate.ts              # pure allocation algorithm
        allocate.test.ts
    app/
      page.tsx                   # backlog overview + run button + result
      api/run/route.ts           # orchestrator — real wiring, see addendum below
      api/issues/route.ts        # GET — lists live open issues for the overview
    components/
      RunButton.tsx
      ResultView.tsx
      BacklogList.tsx            # live GitHub issues overview
```

**Addendum (post-brief change, see "Live backlog overview" section below):** Tracks
A, B, C landed on `main` ahead of schedule, so Track D wires the real orchestrator
directly instead of deferring to a separate integration session, and the
`api/issues/route.ts` overview endpoint was added. `src/fixtures/*.json` stay in
the repo as reference data only — no shipped route imports them.

## Foundation step (sequential — one session, ~30-45 min, MUST finish before parallel work starts)

1. `npx create-next-app@latest sprint-copilot --typescript --app` (skip Tailwind —
   this is a demo, not a design pass; plain CSS is enough).
2. Write `src/types.ts` — the single source of truth every track codes against:

```ts
export interface GitHubIssue {
  number: number;
  id: number;              // numeric DB id — required for sub-issue linking
  title: string;
  body: string | null;
  html_url: string;
  labels: string[];        // label names only
  state: "open";
}

export type IssueType = "feature" | "bug";

export interface IssueClassification {
  issue_number: number;               // correlates back to GitHubIssue.number
  type: IssueType;
  is_epic: boolean;
  points: number;                     // small fixed scale, e.g. 1/2/3/5/8/13
  subticket_suggestions?: string[];   // present only if is_epic
}

export interface ClassifiedIssue extends GitHubIssue {
  classification: IssueClassification;
}

export type Bucket = "feature" | "bug";

export interface AllocatedIssue extends ClassifiedIssue { bucket: Bucket; }

export interface AllocationConfig {
  capacityPoints: number;   // 18
  featureRatio: number;     // 0.7
  bugRatio: number;         // 0.3
}

export interface AllocationResult {
  selected: AllocatedIssue[];
  unselected: ClassifiedIssue[];
  totals: {
    featurePointsUsed: number;
    bugPointsUsed: number;
    totalPointsUsed: number;
    capacity: number;
  };
}

export interface WriteOutcome {
  issueNumber: number;
  bucket: Bucket;
  milestoneAssigned: boolean;
  labelsApplied: boolean;
  subIssuesRequested: number;
  subIssuesCreated: number;
  errors: string[];         // per-item, non-fatal
}

export interface SprintRunResult {
  ok: boolean;
  milestone?: { number: number; html_url: string; title: string };
  writeOutcomes?: WriteOutcome[];
  totals?: AllocationResult["totals"];
  error?: { stage: "fetch" | "classify" | "allocate" | "write"; message: string };
}
```

3. Write `src/config.ts` — constants (`CAPACITY_POINTS=18`, `FEATURE_RATIO=0.7`,
   `BUG_RATIO=0.3`) and env getters (`getGitHubPat()`, `getTargetRepo()`,
   `getOpenAIKey()`) that throw a clear error if unset.
4. Write `.env.local.example` listing `GITHUB_PAT`, `GITHUB_OWNER`, `GITHUB_REPO`,
   `OPENAI_API_KEY`.
5. Write `src/fixtures/sample-issues.json` (8-12 realistic issues, mixed
   feature/bug/epic-shaped) and `src/fixtures/sample-result.json` (a hand-written
   `SprintRunResult`). Don't skip this — it's what lets the parallel tracks build
   without ever running each other's code.
6. Copy this plan into the repo as `sprint-copilot/PLAN.md`, so every worktree/
   session has it on disk without needing plan-mode file access.
7. Write `sprint-copilot/CLAUDE.md` — a short, load-bearing brief for any Claude
   session picking up a track (each worktree gets this automatically since it's
   part of the foundation commit). Contents, in priority order:
   - **LLM provider is OpenAI only — no other provider, under any circumstance.**
   - Approach A: one button, fully atomic (scrape → classify → allocate → write),
     no review/confirm step.
   - The three GitHub API gotchas: `sub_issue_id` in the sub-issues endpoint is
     the child issue's numeric `id`, not its `number`; milestone assignment uses
     the milestone's `number`, not `id`; the labels endpoint used must be the
     additive `POST .../labels`, never the replacing `PATCH .../issues/{n}`
     with a `labels` field.
   - Error handling and testing bars are deliberately minimal — do not add
     retries, rollback, or a broader test suite than specified.
   - Pointer: "See `PLAN.md` in this directory for full detail — module
     interfaces, the dependency graph, and your track's exact scope."
8. Commit to `main`. Create one worktree per track off this commit.

## Parallel tracks (zero file overlap, zero cross-imports — only shared foundation files)

**Track A — GitHub client** (`src/lib/github/`) — highest-risk track (real external
API, auth, the id-vs-number gotchas above). Front-load a throwaway manual smoke
test in the first 30 min against a real scratch repo: create issue → create
milestone → assign → label → create a second issue → link as sub-issue → verify.

```ts
export class GitHubApiError extends Error { status: number; body: unknown; }
export async function githubRequest<T>(path: string, init?: RequestInit): Promise<T>;

export async function listOpenIssues(owner: string, repo: string): Promise<GitHubIssue[]>;
// GET /repos/{owner}/{repo}/issues?state=open&per_page=100
// filter out items with a `pull_request` key; follow Link-header pagination

export async function applyLabels(owner: string, repo: string, issueNumber: number, labels: string[]): Promise<void>;
export async function assignIssueToMilestone(owner: string, repo: string, issueNumber: number, milestoneNumber: number): Promise<void>;
export async function createSubIssue(owner: string, repo: string, parentIssueNumber: number, title: string, body?: string): Promise<GitHubIssue>;
export async function createMilestone(owner: string, repo: string, title: string, description?: string): Promise<{ number: number; id: number; html_url: string; title: string }>;
```

**Track B — LLM classification** (`src/lib/llm/`)

```ts
export function buildClassificationPrompt(issues: GitHubIssue[]): { system: string; user: string };
export class ClassificationError extends Error {}
export async function classifyIssues(issues: GitHubIssue[]): Promise<IssueClassification[]>;
// MUST guarantee result.length === issues.length and every issue_number matches
// an input issue.number exactly once — throw ClassificationError otherwise.
```

**Resolved (checked against OpenAI's live docs, not memory — `response_format`/Chat
Completions JSON mode is legacy as of this build):** uses the **Responses API**,
`client.responses.create({ model, input, text: { format: { type: "json_schema",
name, schema, strict: true } } })`, reading `response.output_text`. Model:
`gpt-5.4-mini`. Schema wraps the array as `{ classifications: [...] }` (Structured
Outputs schemas are objects at the root) with every `IssueClassification` field
required and `additionalProperties: false`; `subticket_suggestions` is always
present in the schema (empty array when `!is_epic`) and only copied onto the
returned object when non-empty, to match the optional field in `types.ts`.
Truncates issue bodies to ~500 chars. `classifyIssues` throws `ClassificationError`
on a request failure, unparseable JSON, a length mismatch, an unknown/duplicate
`issue_number`, or a result that doesn't cover every input issue exactly once.
Live-tested against the real API with `src/fixtures/sample-issues.json` (10/10
classified, both epic-shaped issues correctly flagged with sensible
`subticket_suggestions`) — no fixture/mock stands in for this module.

**Track C — Allocation algorithm** (`src/lib/allocation/`) — pure, synchronous, no
I/O. Cheapest track to finish; good candidate to help others once done.

```ts
export function allocate(classified: ClassifiedIssue[], config: AllocationConfig): AllocationResult;
```

Algorithm:
1. Split into feature/bug candidates by `classification.type`.
2. Sort each ascending by `points`, tie-break ascending by `issue.number`.
3. Greedy-fill each bucket independently up to its own budget
   (`capacityPoints * featureRatio` / `* bugRatio`).
4. Top-off phase: if capacity remains unused because one bucket ran out of
   eligible issues, pull additional issues from *either* bucket (sorted ascending
   by points) to fill the leftover — so capacity is never wasted.
5. Return `{ selected, unselected, totals }`.

Note: an epic's own points count toward capacity; its sub-issues don't add
additional capacity (they're drafted after allocation).

Unit tests (`allocate.test.ts`, plain `node:test` or `vitest` — whichever is
fastest to wire up with zero config):

| Case | Setup | Expectation |
|---|---|---|
| Normal mix | features [5,3,2], bugs [3,2,1] | both buckets fill within budget |
| Feature-heavy backlog | many features, 0-1 bugs | top-off pulls extra features into leftover bug budget |
| Bug-heavy backlog | many bugs, 0-1 features | symmetric case |
| Capacity exactly met | totals sum to exactly 18 after top-off | `totalPointsUsed === 18` |
| Capacity underfilled | total available points < 18 | all issues selected, no error |

**Track D — Frontend** (`src/app/page.tsx`, `src/components/`)

```ts
// page.tsx (client component): status: "idle" | "loading" | "done" | "error"
// handleClick(): POST /api/run -> setResult -> setStatus
// components/RunButton.tsx  — props: { onClick, disabled }
// components/ResultView.tsx — props: { result: SprintRunResult }
//   success: milestone link/title + writeOutcomes table (bucket, sub-issue counts, per-item errors)
//   failure: error.stage + error.message
```

~~Build entirely against `src/fixtures/sample-result.json` via a temporary stub
`app/api/run/route.ts`.~~ Superseded — see the addendum immediately below.
Keep styling minimal (system font stack, a handful of CSS rules).

### Addendum — live backlog overview, real wiring, no mock (post-brief change)

Tracks A (GitHub client), B (LLM classify), and C (allocation) landed on `main`
ahead of the original schedule. Given that, the user asked for two changes to
Track D before it's built further:

1. **A live backlog overview**, showing every open issue in the target repo,
   sits above the run button — not a preview of what the algorithm will pick,
   just the current state of the backlog. This stays consistent with Approach
   A: there is still exactly one button, and it still runs the full pipeline
   atomically with no confirm step of its own.
2. **No mock/fixture data in the shipped app.** `app/api/run/route.ts` is
   wired to the real orchestrator now instead of deferring to a later
   integration session; `src/fixtures/*.json` remain in the repo as reference
   data only (e.g. useful for manually re-checking the allocation algorithm),
   but no route imports them.

**New endpoint** — `GET /api/issues`:
```ts
// calls listOpenIssues(owner, repo) from src/lib/github/issues.ts
// success: 200 { issues: GitHubIssue[] }
// failure: 500 { error: string }   — same minimal-error-handling bar as /api/run
```

**`app/api/run/route.ts`** — real orchestration, replacing the fixture stub:
```
listOpenIssues(owner, repo)
  -> classifyIssues(issues)
  -> allocate(classified, { capacityPoints: CAPACITY_POINTS, featureRatio: FEATURE_RATIO, bugRatio: BUG_RATIO })
  -> createMilestone(owner, repo, title)
  -> for each selected issue: assignIssueToMilestone, applyLabels(["agent-drafted", "type:<bucket>"]),
     and createSubIssue for each is_epic issue's subticket_suggestions
```
Catch failures per stage (`fetch` / `classify` / `allocate` / `write`) into
`SprintRunResult.error`, exactly as originally specified in the Integration
section below — no retries, no rollback of partial writes.

**Page composition** — `page.tsx` now manages two independent async states: a
`backlogStatus` (`"loading" | "done" | "error"`) for the `GET /api/issues` fetch
on mount, rendered via `components/BacklogList.tsx` (props: `{ issues:
GitHubIssue[] }` — number, title, labels, link to `html_url`), and the existing
`status`/`RunButton`/`ResultView` flow for the run itself, unchanged.

This addendum makes Track D self-sufficient for a full real run: it no longer
needs a separate "integration" session to wire `app/api/run/route.ts`, since
Track A/B/C's real modules are already available on `main` to import directly.

## Dependency graph

```
Foundation (types.ts, config.ts, fixtures/*)
        |
   +----+--------+---------+
   |    |        |         |
Track A Track B  Track C   Track D
(github)(llm)  (allocation)(frontend, vs. fixtures)
   |    |        |         |
   +----+--------+---------+
              |
    Integration: app/api/run/route.ts
    (imports real A + B + C, overwrites D's stub)
              |
       Manual E2E test
```

A, B, C, D have zero import dependencies on each other's implementations — only
on the shared foundation files. `app/api/run/route.ts` was originally deferred
to integration since it's the one place all three backend modules meet — but
per the addendum above, A/B/C landed early, so Track D now imports them
directly and there is no separate integration session.

## Running it in parallel

```
git worktree add ../sprint-copilot-github     -b track/github     <foundation-commit>
git worktree add ../sprint-copilot-llm        -b track/llm        <foundation-commit>
git worktree add ../sprint-copilot-allocation -b track/allocation <foundation-commit>
git worktree add ../sprint-copilot-frontend   -b track/frontend   <foundation-commit>
```

One Claude Code session per worktree, each scoped to its own module's files plus
read access to `src/types.ts` / `src/config.ts` / `src/fixtures/`. Merge order:
`track/allocation` and `track/github` first (most self-contained), then
`track/llm`, then `track/frontend` last (expect a trivial conflict on the stub
`route.ts` — accept integration's version). Whoever merges last also writes the
real `app/api/run/route.ts`, wiring: `listOpenIssues` → `classifyIssues` →
`allocate` → `createMilestone` + per-selected-issue
(`assignIssueToMilestone`, `applyLabels`, and `createSubIssue` for epics),
catching errors per stage into `SprintRunResult.error`.

## Secrets & human verification (do these manually before/alongside Track A and B)

- **GitHub PAT**: create a fine-grained PAT scoped to the target repo with Issues
  read/write (and Metadata read). Classic `repo` scope works too if simpler. Paste
  into `.env.local` — no agent can do this step.
- **Sub-issues availability**: before Track A starts, manually confirm in the
  GitHub UI that an issue in the target repo shows a "Sub-issues" section — some
  older orgs/plans may not have the feature. If it's missing, `createSubIssue`
  will fail in a way that looks like a bug but isn't.
- **OpenAI API key**: use the key you already have — paste into `.env.local` as
  `OPENAI_API_KEY` for Track B. **Do not substitute any other LLM provider.**
  Confirm the current model id and structured-output API shape against OpenAI's
  live docs rather than trusting a hardcoded/remembered one.
- **Track A smoke test**: a human should actually watch the manual smoke-test
  script run against a scratch repo and eyeball the created milestone/issue/
  sub-issue in the GitHub UI — the id-vs-number gotchas documented above are the
  kind of bug that passes code review but fails silently at runtime.
- **CORS is a non-issue by design, not something to "fix":** the browser only
  talks to the same-origin `/api/run` route. GitHub and OpenAI are called
  server-side from that route, never from client code. If Track A or D end up
  writing a client-side `fetch()` straight to `api.github.com` or
  `api.openai.com`, that's a bug — both a CORS failure and a secret-leak risk.

## Time budget (fits 4-6 hrs)

```
0:00-0:45  Foundation (sequential)
0:45-3:00  Parallel tracks A-D
3:00-4:00  Integration: merge, write real route.ts, fix mismatches
4:00-4:45  Manual E2E + demo polish (seed demo repo with 8-15 issues incl. one epic-shaped one)
4:45-5:15  Buffer
```

## Verification — manual end-to-end checklist

1. `.env.local` has valid `GITHUB_PAT` (Issues read/write scope), `GITHUB_OWNER`,
   `GITHUB_REPO`, `OPENAI_API_KEY`.
2. Load the page: backlog overview loads and lists every open issue in the
   target repo (matches the GitHub UI's open-issues count), idle state shows
   one button, no console errors.
3. Click it: loading state shows immediately, button disables (no double-submit).
4. A new Milestone appears on the target repo with a sane title.
5. Selected issues are assigned to that milestone on GitHub (not just in the UI).
6. Each selected issue has `agent-drafted` + correct `type: feature`/`type: bug`
   labels, and pre-existing labels on those issues weren't removed.
7. Any issue the LLM flagged `is_epic` has real sub-issues showing under
   "Sub-issues" on the parent in the GitHub UI.
8. UI totals (feature/bug points used, total, capacity) match a hand-check
   against the selected issues' points and the 70/30 split.
9. Re-run the button against the same repo (issues already labeled/milestoned)
   and confirm it doesn't crash.
10. Force one failure path: temporarily use an invalid `OPENAI_API_KEY`,
    confirm the UI shows a plain error with `stage: "classify"` and doesn't hang.

## Critical files

- `sprint-copilot/src/types.ts`
- `sprint-copilot/src/lib/github/issues.ts`
- `sprint-copilot/src/lib/llm/classify.ts`
- `sprint-copilot/src/lib/allocation/allocate.ts`
- `sprint-copilot/src/app/api/run/route.ts`
- `sprint-copilot/src/app/api/issues/route.ts`
- `sprint-copilot/src/components/BacklogList.tsx`
