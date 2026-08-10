# Day 13 - Quality gates: linting, coverage threshold, SAST

## Goal

Stop bad code from reaching `main` automatically, instead of relying on remembering to check.
Three gates: lint, a coverage threshold, and static analysis - plus branch protection so the
gates actually have teeth.

## What I did

**ESLint.** Added `.eslintrc.json` (eslint:recommended, `no-unused-vars` as an error,
`no-console` as a warning) and an `.eslintignore` for `node_modules/` and `coverage/`. Linting
generated report files is pointless and slows the run down. I checked first - it does not
actually produce errors without the ignore file, so this is hygiene rather than a fix.

**Fixed the open handle from yesterday.** `npm test` was printing `Jest did not exit one
second after the test run has completed`. The cause was the module-level `setTimeout` in
`src/app.js` that simulates warm-up: it keeps the event loop alive for its full 2 seconds even
after the tests are done. Holding the timer and calling `warmupTimer.unref()` tells Node not
to count it as a reason to stay running. Test time dropped from about 8 seconds to 1.5.

**Wrote the tests that were missing.** Coverage was stuck at 65.38% and the uncovered lines
were all in `/ready` - no test touched that endpoint at all. Testing both branches is awkward
because readiness only flips after a real 2 second timer, and waiting 2 seconds in a test is
absurd. Fake timers solve it: `jest.useFakeTimers()` at the top of the file, then
`jest.advanceTimersByTime(2000)` to jump past the warm-up between the two cases.

The one thing that has to be right: `jest.useFakeTimers()` must come *before* the `require`
of the module. The timer is created at import time, so if you call it afterwards you have
already missed it.

**Put the coverage threshold back** (80/70/80/80), and excluded `src/server.js` from
`collectCoverageFrom`. That file only calls `app.listen()` - there is no logic in it to test,
and its 0% was dragging the total down for no reason. The honest alternative would have been
to lower the threshold, which would have made the gate meaningless. Excluding an entrypoint is
a normal thing to do; lowering the bar to hide it is not.

**Workflow.** `quality.yml` with two jobs: lint + coverage, and CodeQL. I used
`github/codeql-action@v4` rather than the `v3` in the training bundle - v4 runs on Node 24 and
v3 is scheduled for deprecation in December 2026, so starting on v3 would mean migrating
almost immediately.

**Branch protection.** A ruleset on `main`: pull request required, all five checks required
(three CI matrix legs, the lint/coverage job, CodeQL), and an empty bypass list.

## What tripped me up

**The ruleset targeted every branch, not just `main`.** Pushing the feature branch was
rejected outright:

```
remote: error: GH013: Repository rule violations found for refs/heads/day13-break-the-gate
remote: - 5 of 5 required status checks are expected.
```

A neat little deadlock: the rule wants five passing checks, but checks cannot run on a branch
that does not exist yet, and the branch cannot be created because the rule blocks it. Setting
the ruleset target to the default branch fixed it. The lesson is about scope - the point of
protection is to guard what gets merged into `main`, not to stop me from working on a branch.

**The setting I was looking for does not exist under rulesets.** Classic branch protection has
an "Include administrators" checkbox. Rulesets replace it with a bypass list at the top of the
page - leaving that list empty is the equivalent. Also worth checking that enforcement status
is `Active` and not `Evaluate`, which only reports violations instead of blocking them.

## Result

Locally: 5 tests, `app.js` at 100% on all four metrics, no open-handle warning.

| | Day 12 | Day 13 |
|---|---|---|
| Tests | 3 | 5 |
| Coverage (statements) | 65.38% | 100% |
| Coverage gate | none | 80/70/80/80, enforced |
| Test run time | ~8s | ~1.5s |

Then I proved the gate works. Branch with a deliberate unused variable, pull request opened,
and `Lint + Coverage gate` failed on `no-unused-vars`. The merge button greyed out with
"Merging is blocked". Closed the pull request without merging and deleted the branch.

One detail worth noticing in that run: the three CI jobs stayed green while the quality job
failed. Linting only exists in `quality.yml`, so `ci.yml` had nothing to complain about. Two
workflows, two different questions - "does it build and pass tests" and "is it good enough to
merge".
