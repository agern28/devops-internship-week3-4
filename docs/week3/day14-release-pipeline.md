# Day 14 - Build, push, semantic versioning, releases

## Goal

Turn tested code into something that can actually be shipped: a container image, versioned,
sitting in a registry, produced automatically from a git tag.

## What I did

**Dockerfile.** Two changes to the version from the training bundle.

The base image went from `node:20-alpine` to `node:24-alpine`. Node 20 reached end-of-life on
30 April 2026, and it would have been inconsistent to require `>=22` in `package.json` while
shipping an image built on 20.

The more interesting one: the bundle's `release.yml` passed `APP_VERSION` as a build argument,
but the Dockerfile never declared an `ARG` to receive it. Docker just prints "unused build
argument" and moves on, so the value was silently discarded and every image reported `1.0.0`
regardless of what was actually being built. Added:

```dockerfile
ARG APP_VERSION=0.0.0-dev
ENV APP_VERSION=$APP_VERSION
```

The default is deliberately not `1.0.0` - if the argument ever fails to arrive again, the
container says `0.0.0-dev` and the problem is visible instead of hidden.

Verified locally before touching CI:

```
$ docker build --build-arg APP_VERSION=0.9.0-local -t training-app:local .
$ curl -s localhost:8080/
{"message":"Hello from the DevOps training app!","version":"0.9.0-local","logLevel":"info"}
```

**Release workflow.** Triggers only on `v*.*.*` tags. Logs in to GHCR with `GITHUB_TOKEN` -
no personal access token, nothing long-lived stored anywhere - derives the tag set with
`docker/metadata-action`, builds, pushes, and creates a GitHub Release with generated notes.

Bumped every action to the current major (`checkout@v5`, `setup-buildx-action@v4`,
`login-action@v4`, `metadata-action@v6`, `build-push-action@v7`), same Node 20 runtime reason
as the last two days. Added `cache-from/cache-to: type=gha` so Docker layers persist between
runs, which needs Buildx set up first.

One change worth explaining: the build argument comes from `steps.meta.outputs.version`, not
`github.ref_name`. The git tag is `v1.0.0` but the image tags are `1.0.0` - metadata-action
strips the prefix. Using `ref_name` would have baked `v1.0.0` into a container whose own image
tag says `1.0.0`, which is the kind of small inconsistency that becomes confusing exactly when
you are trying to debug which version is running.

**The deploy step is still an echo.** It prints the `helm upgrade` command it would run. A
GitHub-hosted runner cannot reach a minikube cluster on my laptop - there is no inbound route.
Making it real needs a self-hosted runner, a publicly reachable cluster, or a pull-based agent
inside the cluster. Left as a placeholder on purpose rather than faked.

**Made the package public** after the first push. GHCR packages are private by default, and a
local cluster pulling anonymously would hit `ImagePullBackOff` on day 16.

## What tripped me up

**Tagged before merging.** This one cost the most time. All the checks on the pull request were
green, so I tagged `v1.0.0` and pushed - and nothing happened. No workflow run, no package, no
release.

The reason is obvious in hindsight: a tag points at a commit. The pull request had never been
merged, so `main` was still on the day 13 commit and the tag landed on a tree that did not
contain `release.yml`. GitHub had nothing to trigger.

```
$ git show main:.github/workflows/release.yml
fatal: path '.github/workflows/release.yml' does not exist in 'main'
```

Green checks mean "you may merge", not "merged". Fix was to delete the tag locally and on the
remote, merge the pull requests, then re-create the tag on the updated `main`.

**`git add` is all-or-nothing.** I listed three files explicitly and one of them did not exist
yet, so git aborted the whole staging operation. The commit silently did not happen and I
pushed an empty branch without noticing. `git add -A` followed by `git status --short` is the
safer habit - stage everything, then look at what you actually staged.

**Container names need at least two characters.** `--name t` is rejected outright; the naming
pattern requires a second character. Trivial, but the error message is about the pattern rather
than the length, which sends you looking in the wrong direction.

## Result

Tag `v1.0.0` pushed, release workflow ran, image published to
`ghcr.io/agern28/devops-internship-week3-4` with the semver tag set plus `latest`.
GitHub Release created automatically with generated notes.

Pulled it back anonymously to confirm the whole thing end to end:

```
$ docker logout ghcr.io
$ docker pull ghcr.io/agern28/devops-internship-week3-4:1.0.0
$ curl -s localhost:8081/
{"message":"Hello from the DevOps training app!","version":"1.0.0","logLevel":"info"}
```

That single line proves three things at once: the package really is public, the `ARG` fix works,
and the version the container reports matches the tag it was published under.

The chain now runs from commit to published artifact without anyone touching it. What is still
missing is the last link - something to actually run the image. That starts on day 16.
