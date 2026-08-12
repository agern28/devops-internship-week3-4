# Day 18 - Helm charts: templating, values, releases

## Goal

Package everything from days 16 and 17 so the whole application installs with one command and
its parameters live in one file instead of being scattered across five manifests.

## What I did

Started from the chart in the training bundle rather than `helm create` - the generated
boilerplate is mostly things this app does not use (service accounts, autoscaling behaviour
blocks, test hooks). The bundle chart already had the templates; the work was fixing four
things in it.

**Placeholders.** `values.yaml` pointed at `ghcr.io/your-org/devops-training-app:latest`.
Changed to the real repository with the tag pinned to `1.0.0` - same reasoning as day 16,
`latest` moves and combined with `IfNotPresent` a node can serve a stale image indefinitely.

**Dropped `APP_VERSION` from `config`.** Same fix as day 17. A ConfigMap that sets the version
overrides what the image reports, so `helm upgrade --set image.tag=1.1.0` would deploy a new
image that still claims to be 1.0.0.

**Emptied the committed secret.** The chart shipped with `API_KEY: "changeme-demo-key"` as a
default, which means forgetting to override it installs silently with a fake key. Replaced the
default with an empty string and wrapped the template value in `required`:

```
API_KEY: {{ required "secret.API_KEY must be provided, e.g. --set secret.API_KEY=..." .Values.secret.API_KEY | quote }}
```

Now `helm template` fails outright if the secret is missing. A loud failure beats a quiet
wrong value.

**Turned autoscaling off.** The chart defaults to `autoscaling.enabled: true`, which would have
created an HPA today. metrics-server is not installed yet, so it would sit there reporting
`<unknown>` targets and I would be debugging day 19's material a day early. Probes and limits
are stripped out of the deployment template for the same reason.

**Added a `fullname` helper.** The chart named every resource after `.Chart.Name`, so the
release name was ignored entirely and two releases of the same chart in one namespace would
collide. Switched resource names to the standard pattern that folds in `.Release.Name`. With
release name `myapp` the rendered names come out identical to before, so nothing broke - but
now a second release would actually work.

**Deleted the raw manifests before installing.** The chart produces a Deployment and Service
called `myapp` and so do the day 16/17 manifests. Helm refuses to adopt resources it did not
create, so this would have failed with an ownership error. Removed everything in the namespace
except the namespace itself, then installed.

## What tripped me up

**`helm upgrade` changed the ConfigMap and nothing happened.** Changed `LOG_LEVEL` from `debug`
to `info`, the upgrade reported success, `kubectl rollout status` said "successfully rolled
out" - and the app still answered `debug`.

```
$ kubectl get configmap myapp-config -n app -o jsonpath='{.data.LOG_LEVEL}'
info
$ kubectl exec -n app deploy/myapp -- sh -c 'echo $LOG_LEVEL'
debug
```

The ConfigMap really had changed. The pods had not. Environment variables are read when a
container starts, and updating a ConfigMap does not restart anything - the Deployment's pod
template was byte-identical before and after, so Kubernetes had no reason to roll anything. The
rollout "succeeded" instantly because there was nothing to roll.

The standard fix is to hash the config into the pod template so a content change becomes a
template change:

```yaml
annotations:
  checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
  checksum/secret: {{ include (print $.Template.BasePath "/secret.yaml") . | sha256sum }}
```

After that the upgrade actually cycled pods, one at a time, the way a rolling update is
supposed to look.

**Then it still answered `debug` once more.** Pods had genuinely been replaced this time. What
caught me is that `kubectl rollout status` returns as soon as the Deployment is satisfied, while
the old pod is still terminating and ingress-nginx has not re-synced its upstream list yet. My
`curl` landed on the pod on its way out. A few seconds later everything reported `info`.

Nothing in the current setup tells the cluster when a pod is actually ready to serve or done
serving - the Service adds a pod to its endpoints the moment it is `Running`, warm-up or not.
That is what readiness probes are for, and it is day 19.

## Result

Install, upgrade and rollback all from one command each:

```
$ helm history myapp -n app
REVISION  UPDATED                   STATUS      CHART        APP VERSION  DESCRIPTION
1         Wed Aug 12 09:34:15 2026  superseded  myapp-0.1.0  1.0.0        Install complete
2         Wed Aug 12 09:35:02 2026  superseded  myapp-0.1.0  1.0.0        Upgrade complete
3         Wed Aug 12 09:36:41 2026  superseded  myapp-0.1.0  1.0.0        Upgrade complete
4         Wed Aug 12 09:39:22 2026  deployed    myapp-0.1.0  1.0.0        Rollback to 1
```

Rolling back is itself a new revision rather than an erasure - revision 4 is "Rollback to 1",
and 1 through 3 are still there. That matters for the day 11 rollback plan: `helm rollback`
reverts image and config together, and the history is the audit trail of what was deployed when.

Five hand-applied manifests became `helm install myapp ./helm/myapp -n app --set
secret.API_KEY=...`, and changing a parameter is now `--set` instead of editing YAML and
remembering which files depend on each other.
