# Day 19 - Health checks, probes, resource limits, autoscaling

## Goal

Make the deployment self-healing and elastic. Days 17 and 18 both ended with the same problem:
nothing told the cluster whether a pod was actually able to serve traffic, so requests landed
on pods that were still starting up or already shutting down.

## What I did

**metrics-server.** `minikube addons enable metrics-server`. Without it the HPA has no CPU
readings and does nothing.

**Resource requests and limits.** Requests 100m CPU / 128Mi memory, limits 500m / 256Mi. The
distinction matters more than it looks: requests are what the scheduler reserves when placing a
pod, and - importantly for today - what the HPA measures utilisation *against*. A pod using
100m against a 100m request is at 100%, not at 20% of its 500m limit. Limits are the hard
ceiling; exceeding the memory limit gets the container killed.

**Three probes**, each answering a different question:

| Probe | Endpoint | Question | Consequence of failure |
|---|---|---|---|
| startup | `/healthz` | Has it finished booting? | Liveness stays paused; container killed if it never passes |
| liveness | `/healthz` | Is the process alive? | Container restarted |
| readiness | `/ready` | Can it serve traffic? | Removed from the Service endpoints |

Liveness and readiness deliberately point at different endpoints. `/healthz` returns 200 as soon
as the process is up. `/ready` returns 503 for the first two seconds while the app simulates a
warm-up, and 200 after. Pointing both at `/healthz` would have made the readiness probe
meaningless - it would pass at exactly the moment the app is not yet ready, which is the case it
exists to catch.

The startup probe exists so slow boots do not get mistaken for hangs. Liveness only begins once
startup passes, so a container that legitimately takes 20 seconds to start is not killed by a
liveness probe firing at 10.

**HPA**, targeting 70% CPU utilisation, 2 to 5 replicas.

**Made `replicas` conditional in the chart.** When autoscaling is on, the template omits
`spec.replicas` entirely. Otherwise the HPA and Helm would fight: the HPA scales to 5, the next
`helm upgrade` renders `replicas: 2`, and the deployment gets yanked back down mid-load.

## Result

**Readiness, visible in the pod lifecycle.** Watched pods while triggering a rollout:

```
myapp-656f9b74cb-285dp   0/1     ContainerCreating   0     0s
myapp-656f9b74cb-285dp   0/1     Running             0     1s
myapp-656f9b74cb-285dp   0/1     Running             0     2s
myapp-656f9b74cb-285dp   1/1     Running             0     4s
```

Three seconds of `0/1 Running`. The container was up the whole time - `Running` says so - but
`READY` stayed at 0 until `/ready` started answering 200. During that window the Service did not
route to it.

That gap is exactly what was missing yesterday, when a `curl` through the ingress hit a pod that
was on its way out and returned stale config. `Status: Running` and `Ready: 1/1` are different
claims, and only the second one means "send it traffic".

**Liveness.** My first attempt was to kill the process inside a container with
`kubectl exec -- kill 1`, and nothing happened at all - the pod stayed up with `RESTARTS 0`.
The kernel protects PID 1: signals sent to it inside a PID namespace are discarded unless the
process installed a handler for them, and Node does not install one by default. `kill -9` fails
for the same reason.

Breaking the probe itself is the better test anyway, and it goes through Helm:

```
helm upgrade myapp ./helm/myapp -n app --set probes.liveness.path=/does-not-exist
```

```
myapp-6ff6c4999-fvcl6   0/1  Running  1 (1s ago)   61s
myapp-6ff6c4999-fvcl6   1/1  Running  1 (4s ago)   64s
myapp-6ff6c4999-fvcl6   0/1  Running  2 (1s ago)   2m1s
myapp-6ff6c4999-fvcl6   1/1  Running  2 (4s ago)   2m4s
```

Restarts every 60 seconds or so - three failed probes at 10 second intervals, plus the time to
come back up. The pod names never change: readiness failure removes a pod from rotation,
liveness failure restarts the container in place. Same pod, new container.

The `0/1` right after each restart is the readiness probe doing its job again - the fresh
container has to clear its warm-up before the Service will route to it.

**Autoscaling under load.** Three busybox pods hammering the service in a loop:

```
myapp   Deployment/myapp   cpu: 1%/70%     2   5   2
myapp   Deployment/myapp   cpu: 18%/70%    2   5   2
myapp   Deployment/myapp   cpu: 251%/70%   2   5   2
myapp   Deployment/myapp   cpu: 251%/70%   2   5   4
myapp   Deployment/myapp   cpu: 251%/70%   2   5   5
myapp   Deployment/myapp   cpu: 123%/70%   2   5   5
```

2 → 4 → 5 replicas over about 30 seconds, then utilisation halving as the extra pods absorbed the
load. The overshoot to 251% is a consequence of the small request: at 100m, three loop clients
saturate the pods long before the HPA's next evaluation.

It stopped at 5 and said so:

```
ScalingLimited  True  TooManyReplicas  the desired replica count is more than the maximum replica count
```

At 123% CPU it still wanted more pods and was not allowed to have them. In a real system that is
the signal to raise `maxReplicas` or find out why each pod costs so much CPU - the HPA is telling
me the ceiling is binding, not that the problem is solved.

**One warning worth reading rather than ignoring:**

```
Warning  FailedGetResourceMetric  (x8 over 8m57s)  failed to get cpu utilization:
did not receive metrics for targeted pods (pods might be unready)
```

Eight occurrences over nine minutes, all before the load test. The HPA was created in the same
`helm upgrade` that added the probes, so for a while it was asking for metrics that
metrics-server was not yet producing. It resolved itself once metrics started flowing, but it is
a good reminder that an HPA reporting `<unknown>` is not autoscaling - it is failing quietly and
leaving the replica count wherever it was.

## The chain, complete

Every piece is now in place: a commit runs through CI and quality gates, a tag produces a
versioned image in a registry, and Helm deploys it to a cluster where the workload heals itself
and scales with demand. Day 20 is demonstrating all of it end to end.
