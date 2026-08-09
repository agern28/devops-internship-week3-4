# Day 12 - GitHub Actions: workflows, matrix builds, caching

## Goal

Turn the Day 11 design into something that actually runs. Build and test on every push and
pull request, across more than one Node version, with dependency caching so repeat runs are
not paying full install cost every time.

## What I did

Copied only this day's files out of the training bundle: `src/`, `test/`, `package.json`.
The Dockerfile, the k8s manifests, the Helm chart and the other two workflows stay out of the
repo until their own days.

Three changes to `package.json` before writing any YAML:

**Generated `package-lock.json` and committed it.** The bundle ships without one. This is not
optional - `npm ci` refuses to run without a lockfile, and `setup-node`'s npm cache keys on
that exact file, so without it there is nothing to cache against either. One `npm install`
and it exists.

**Removed the `jest.coverageThreshold` block.** A coverage threshold is a quality gate, and
quality gates are Day 13's subject. Leaving it in would also have made the very first CI run
red for a reason that has nothing to do with what Day 12 is about. It goes back in tomorrow,
where failing it is the point.

**Bumped `engines.node` from `>=18` to `>=22`.** Node 18 went end-of-life in April 2025 and
Node 20 followed on 30 April 2026, so `>=18` was just wrong information sitting in the repo.

Then the workflow itself. I kept the bundle's structure but changed the matrix from
`[18, 20, 22]` to `[22, 24, 26]` for the same EOL reason - as of now 24 is Active LTS, 22 is
in maintenance, and 26 is Current. `fail-fast: false` so one leg failing does not hide the
other two. I also added `workflow_dispatch`, since Day 11 listed manual runs as one of the
trigger types and this is the cheapest way to actually see one. The coverage artifact is
uploaded from the Node 24 leg only, with 7 day retention - three identical copies of the same
report would be pointless.

## What tripped me up

**`npm test` exited 1 locally.** I had edited `package.json` but the `coverageThreshold` block
was still there; jest reported 65.38% against an 80% threshold and failed the run. Deleting
the block properly fixed it. Worth remembering that the threshold lives in `package.json`, not
in the workflow - nothing in the YAML mentions coverage at all.

**The first green run still had a warning.** All three jobs passed (19s, 18s, 18s), but the
annotations said:

```
Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced
to run on Node.js 24: actions/checkout@v4, actions/setup-node@v4, actions/upload-artifact@v4
```

This one is easy to misread. It has nothing to do with my matrix. There are two different
Node versions in play: the one my application is tested on (22/24/26) and the one the actions
themselves execute on. The `@v4` actions declare `node20` in their own `action.yml`, and the
runner is now forcing them onto Node 24 and complaining about it. Node 20 gets removed from
the runners entirely on 16 September 2026, so this would have gone from a warning to a hard
failure in about a month. Bumped all three to `@v5`.

Also noticed, but did not fix today: jest prints `Jest did not exit one second after the test
run has completed`. The `setTimeout` at `src/app.js:11` that simulates warm-up keeps a handle
open. Harmless now, but it holds the runner for an extra second on every job. Day 13 problem.

## Result

Three green jobs on the matrix, and the cache verified on the second run:

| | First run | After the v5 bump |
|---|---|---|
| Node 24 job, total | 18s | 13s |
| Install dependencies | - | 4s |
| Cache | not found | restored, ~12 MB |

Run: <https://github.com/agern28/devops-internship-week3-4/actions/runs/31332574509>

The interesting part is that a 5 second saving on a project this small is already visible.
The cache stores `~/.npm`, not `node_modules`, so `npm ci` still does the install work - it
just does not re-download anything. On a real dependency tree the gap would be much wider.
