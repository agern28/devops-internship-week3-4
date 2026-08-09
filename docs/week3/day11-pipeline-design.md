Day 11 - Pipeline Design
No tooling today. The point is to decide what the pipeline does before writing any YAML, so the workflows in the following days are just an implementation of this page.
Application under test
The sample service from devops-training: a small Node.js/Express app with four endpoints.
Path
Purpose
/
Greeting + version
/healthz
Liveness probe target
/ready
Readiness probe target (warm-up)
/metrics
In-memory request counter

The artifact the pipeline produces is a container image pushed to GitHub Container Registry (ghcr.io). Not a tarball, not a zip - the image is the thing that gets promoted from stage to stage and eventually deployed. Everything else (coverage reports, SARIF findings) is a by-product used for gating, not for shipping.
Stages
Stage
Trigger
Input
Action
Output
Gate to proceed
Source
push / PR / tag
Git commit
Checkout
Working tree
-
Build
push / PR
Source
npm ci, npm run build
Installed deps, built app
Install and build exit 0
Test
push / PR
Built app
jest --coverage on a matrix
Test results, lcov report
All tests pass on every matrix entry
Quality
push / PR
Source + coverage
ESLint, coverage thresholds, CodeQL
Lint output, SARIF
No lint errors, coverage >= threshold, no high/critical SAST findings
Package
tag v*.*.*
Source
docker build
Container image
Image builds
Publish
tag v*.*.*
Image
Push to ghcr.io with semver tags
Versioned image in registry
Push succeeds
Release
tag v*.*.*
Git history
Create GitHub Release
Release with generated notes
Release created
Deploy
manual
Published image
helm upgrade against the local cluster
Running release
Rollout healthy, probes pass

Diagram
flowchart LR
  A[Source] --> B[Build]
  B --> C[Test - matrix]
  C --> D[Quality gate]
  D -->|merge to main| E[(main protected)]
  E -->|tag v*.*.*| F[Package image]
  F --> G[Push to ghcr.io]
  G --> H[GitHub Release]
  H -.manual.-> I[Deploy to K8s via Helm]

The dotted edge is deliberate - see the deploy note below.
Decisions
What runs on a PR vs. what runs on a tag
Everything that can fail because of a code change runs on every push and pull request to main: install, build, matrix test, lint, coverage, CodeQL. These are cheap and they are what branch protection keys on.
Packaging and publishing only run on a v*.*.* tag. There is no reason to build and push an image for every commit on a feature branch - it would fill the registry with garbage and make it unclear which image is a release. A tag is an explicit human decision that says "this commit is a version".
Versioning is semver. The tag v1.2.3 produces four image tags: 1.2.3, 1.2, 1, and latest. The full version tag is treated as immutable; latest is mutable and is only a convenience for local testing, never something a deployment should pin to.
Artifact storage and retention
Coverage report: uploaded as a GitHub Actions artifact, 7 day retention. It only exists to inspect a failed run, so keeping it longer is pointless.
Container images: GitHub Container Registry, no automatic expiry. Semver-tagged images are kept because they are the rollback targets.
CodeQL findings: GitHub Security tab, retained by the platform.
Rollback strategy
The image tags are immutable, so every previously released version is still pullable. Two options, in order of preference:
helm rollback myapp <revision> - fastest, reverts the whole release including config changes, and Helm keeps the revision history.
helm upgrade myapp ./helm/myapp --set image.tag=<previous version> - use this when only the image needs to go back and the current values are correct.
There is no automatic rollback in the pipeline. Adding one would require the deploy step to actually run in CI, which it does not (below).
Secrets
GITHUB_TOKEN - injected automatically by Actions. Needs packages: write to push to GHCR and contents: write to create the release. No personal access token is required, which is the point: nothing long-lived is stored in the repo.
SONAR_TOKEN - only needed if the optional SonarCloud job is enabled. Repository secret.
API_KEY - the application's own secret. It is never baked into the image and never passed as a build arg. It comes from a Kubernetes Secret at runtime (day 17).
The rule: build-time secrets belong to the CI platform, runtime secrets belong to the cluster, and neither belongs in Git.
Why deploy is manual
The cluster is a local minikube instance. A GitHub-hosted runner cannot reach it - there is no inbound route to a laptop. The release.yml deploy step is therefore a placeholder that prints the command it would run.
Making it real would need one of: a self-hosted runner on the same machine, a publicly reachable cluster, or a pull-based GitOps agent (ArgoCD/Flux) running inside the cluster that watches the registry or the repo. The GitOps option is the one that would be used in practice, because it does not require exposing the cluster to the internet at all.
For this program the deploy is run by hand with helm upgrade, and the demo on day 20 shows that step explicitly rather than pretending it is automated.


