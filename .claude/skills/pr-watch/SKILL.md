---
name: pr-watch
description: Drive a pull request to green and to merge — subscribe to its events, diagnose and fix failing CI, and resolve merge conflicts by merging main in. Use after opening a PR, when asked to watch, monitor, babysit or autofix one, and whenever a CI failure or a conflict notice arrives.
---

# Driving a pull request to green

Opening the pull request is the middle of the job, not the end. A branch that
went up green and sat through three merges to `main` is red now, and nobody
watching the board can tell the difference between "still working on it" and
"broken and abandoned".

## Subscribe, then stop polling

```
subscribe_pr_activity(owner="jacobanana", repo="mathsboard", pullNumber=<n>)
```

Events wake the session — CI results, review comments, conflict notices. Do not
`sleep`, do not re-check in a loop. Between events there is nothing to do.

Webhooks miss things, though: a CI *success*, a force-push, a conflict that
appeared quietly. So before going idle, schedule one check-in about an hour out
(`send_later`), and when it fires re-read the PR's state, act on anything
actionable, and re-arm. Silently — a check-in that found nothing says nothing.
Stop when the PR is merged or closed, or when asked to.

## A red check is diagnosed, never re-run hopefully

Get the failing job's log first. Which suite failed decides everything:

| failing job | reproduce it | what it means |
| --- | --- | --- |
| **Typecheck** / **Unit tests** (`unit-run.yml`) | `bash scripts/checks.sh` | the fast gate. It is what the commit hook runs, so a red one here means the commit hook was bypassed or `main` moved under the branch |
| **E2E** (`e2e-run.yml`) | `bash scripts/e2e.sh` | the browser suite against a real sync backend |

Reproduce locally before pushing anything. One validated push beats three
speculative ones, and each speculative one costs a 30-minute e2e run.

Two things about the e2e suite in particular:

- **It runs against the compose stack in CI and can run against the local stack
  here.** `scripts/e2e.sh` picks whichever it can (see the `app-screenshots`
  skill). The one suite the local stack cannot run is `e2e/image.spec.ts`, which
  uploads through S3 — if *that* is what CI is failing on, you need
  `bash scripts/e2e.sh --stack` and a Docker daemon. Without one, reason from
  the CI log and say plainly that the fix is unverified locally.
- **Retries are already on** (`retries: 1` in CI), so a failure that survived a
  retry is not a network burp. "Flaky" is a diagnosis of last resort, and only
  for a job that died before any test body ran — checkout, `npm ci`, the browser
  download. Re-run those and say so.

**Never make a test pass by weakening it.** No `test.skip`, no `.only` removed
from around the inconvenient half, no timeout inflated to paper over a race, no
assertion loosened to whatever the code now does. If the test is wrong, say
which behaviour it is asserting and why that behaviour changed — that is a
conversation, not a commit.

## A conflict is resolved by merging `main` in

This repo merges pull requests; keep the branch's history and bring `main` to
it rather than rewriting what is already pushed and reviewed.

```bash
git fetch origin main
git merge origin/main
# resolve, then:
bash scripts/checks.sh && bash scripts/e2e.sh
git push
```

Resolving here has three repo-specific rules:

1. **`package-lock.json` is regenerated, never hand-merged.** Take `main`'s
   version, then re-apply the branch's dependency change:
   `git checkout --theirs package-lock.json && npm install`. A hand-merged lock
   file installs a tree that neither branch ever tested.
2. **A tool is registered in one place.** Two branches adding a tool both touch
   `src/tools/index.ts`; the resolution keeps *both* registrations, and
   `src/tools/registry.test.ts` is what proves it.
3. **The two boards share one build.** A conflict in `src/subject.ts`,
   `src/ui/`, or the styles is a conflict in *both* the maths and the language
   board — resolve it, then screenshot both (`--path /` and `--path /language/`).

When a conflict is genuinely ambiguous — both sides changed the same logic and
picking either loses behaviour — say so in the thread and ask. Everything else
is resolved and pushed; the resolution is the deliverable, not a question.

## Red on `main` too

Before spending an afternoon on a failure your diff did not cause, check
whether `main` has it:

```bash
git stash && git checkout main && git pull && bash scripts/checks.sh
```

If it fails there too, say so once in the PR thread — "`<check>` is failing on
`main` as well, not from this branch; I will re-run when it recovers" — and act
on the recovery notice when it comes. That is the only legitimate "not mine",
and it is still not silence.

## What goes in the thread

Reply when a round *resolves* something, hits a real blocker, or raises a
question. Not on every push — the diff is the record. Do not narrate fixes, do
not post a summary of a green run nobody asked about, and do not reply to your
own earlier comment coming back as an event.
