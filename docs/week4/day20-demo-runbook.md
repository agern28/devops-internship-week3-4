# Day 20 - Mid-program review and checkpoint demo

## Goal

Show the whole chain working end to end, and be able to explain why each piece is the way it is.

## The runbook

What I run, in order, with what to point at. Roughly 12 minutes.

### 0. Before starting

```bash
minikube start
kubectl get nodes
kubectl get pods -n app
helm list -n app
```

The cluster is stopped between sessions, and after a restart the kubeconfig can point at a port
Docker no longer maps - `minikube start` rewrites it. Worth doing well before the demo, not
during it.

### 1. The pipeline, from a commit

Open the repository and show `.github/workflows/`. Two files run on every push and pull request,
one runs only on a tag.

```
ci.yml       build + test on Node 22 / 24 / 26, with npm caching
quality.yml  ESLint, coverage threshold, CodeQL
release.yml  tag v*.*.* -> image + GitHub Release
```

Point at a merged pull request and the five required checks. Then at the closed pull request from
day 13, where a deliberate unused variable failed the lint job and the merge button greyed out.
The gate is not a suggestion.

### 2. The artifact

```bash
docker pull ghcr.io/agern28/devops-internship-week3-4:1.1.0
```

Show the package page: `1.1.0`, `1.1`, `1` and `latest`. `1.0.0` is still there, untouched. The
version tags are immutable and are the rollback targets; `latest` moves.

### 3. Running workload

```bash
kubectl get all,ingress -n app
curl -s -H "Host: myapp.local" http://$(minikube ip)/
```

```json
{"message":"Hello from the DevOps training app!","version":"1.1.0","logLevel":"debug"}
```

Two things in one line: the version comes from the image, the log level comes from a ConfigMap.
Deliberately split - if `APP_VERSION` also lived in the ConfigMap, deploying a new image would
still report the old version.

### 4. Self-healing

```bash
kubectl get pods -n app -w
# in another terminal:
kubectl delete pod -n app <one pod>
```

A replacement appears immediately and sits at `0/1 Running` for a few seconds before going
`1/1`. That gap is the readiness probe: the container is up, but `/ready` returns 503 until the
app finishes warming up, and the Service does not route to it until then.

### 5. Autoscaling

```bash
kubectl get hpa -n app
```

If there is time, start the three busybox load pods and watch replicas go 2 → 4 → 5. If not,
show the recorded output - the scale-up takes a couple of minutes and the scale-down has a five
minute stabilisation window, which is longer than a demo has patience for.

### 6. Deploy and roll back

```bash
helm upgrade myapp ./helm/myapp -n app \
  --set secret.API_KEY='...' --set image.tag=1.1.0
helm history myapp -n app
helm rollback myapp -n app
curl -s -H "Host: myapp.local" http://$(minikube ip)/
```

The version flips back to 1.0.0 in about twenty seconds. Run `helm rollback` again to go
forward.

## Questions I expect, and my answers

**Why is the deploy step in `release.yml` an echo?**

A GitHub-hosted runner cannot reach minikube on my laptop - there is no inbound route. Making it
real needs a self-hosted runner on this machine, a publicly reachable cluster, or a pull-based
agent like Argo CD inside the cluster watching the registry. The last one is what I would
actually build, because it does not require exposing the cluster at all. I left a placeholder
rather than writing something that pretends to deploy.

**Are Kubernetes Secrets encrypted?**

No. `kubectl get secret -o jsonpath=... | base64 -d` returns the value in plain text. Base64 is
encoding. What protects it is RBAC, plus encryption-at-rest for etcd if the cluster is configured
for it. In production the value would come from an external secret manager.

**What broke and how did you fix it?**

The three worth telling: tagging `v1.0.0` before merging the pull request, so the tag landed on
a commit that had no release workflow and nothing triggered. A `helm upgrade` that changed a
ConfigMap and reported success while the pods kept serving the old value, because environment
variables are read at container start and the pod template had not changed - fixed with a
checksum annotation. And a branch protection ruleset scoped to all branches instead of the
default branch, which made it impossible to push a feature branch at all.

**Why did you change so much of the training bundle?**

Several action versions targeted the Node 20 runtime, which is removed from runners in September
2026. `node:20-alpine` is past end-of-life. The Dockerfile was missing the `ARG` for the version
the release workflow was passing it, so every image reported 1.0.0 regardless. The Helm chart
had a working default secret, which means forgetting to override it installs silently with a
fake key.

**What is missing?**

No GitOps - deploys are manual. No infrastructure as code; the cluster is a local minikube
started by hand. No observability beyond a counter endpoint; no Prometheus, no dashboards, no
alerting. Secrets live in the cluster rather than an external manager. Single environment - no
staging, and no promotion between environments.

## Two things I found while rehearsing

**`helm history` reports the wrong app version.** Every revision says `APP VERSION 1.0.0`, even
the ones running the 1.1.0 image, because `appVersion` is hardcoded in `Chart.yaml` and nothing
updates it. `helm history` is not a reliable record of what image is deployed. Fixing it properly
means bumping `appVersion` as part of the release, which is another thing the pipeline could
automate.

**History is capped at ten revisions.** Revision 1 quietly dropped off the list after enough
upgrades - Helm keeps the last ten by default. Fine here, but worth knowing before treating
`helm history` as an audit trail.

## Where this ends up

Four weeks: version control and Linux, containers, CI/CD, Kubernetes. The last two turned a
repository into something that builds, tests, gates, versions, publishes and runs itself. The
part I did not expect to spend the most time on was reading what the tools were actually telling
me - the warnings that were easy to skip past, the "success" messages that were technically true
and practically wrong.
