# Day 16 - Kubernetes basics: pods, deployments, services

## Goal

Run the image built on day 14 on an actual cluster. Last link of the chain: commit → CI →
quality gates → image → registry → running workload.

## What I did

**Local cluster.** minikube v1.38.1 with the docker driver, 2 CPUs and 4 GB. kubectl v1.36.2.

```
minikube start --driver=docker --cpus=2 --memory=4g
```

I picked minikube over kind even though kind is lighter. Day 17 needs an ingress controller and
day 19 needs metrics-server, and minikube ships both as addons - on kind each one is a manual
install with extra cluster configuration. The concepts are identical either way, so paying a
little RAM to avoid two side quests seemed like the right trade.

**Three manifests**: a `Namespace` called `app`, a `Deployment` with 2 replicas, and a
`ClusterIP` `Service` mapping port 80 to container port 8080.

The Deployment points at `ghcr.io/agern28/devops-internship-week3-4:1.0.0` - the exact image
the release pipeline published yesterday, pinned to the semver tag rather than `latest`. That
matters: `latest` moves, and combined with `imagePullPolicy: IfNotPresent` a node that already
cached it would keep serving an old build without any indication that anything is wrong.

**Wrote a stripped-down Deployment rather than using the bundle's.** The `deployment.yaml`
that ships with the training material is the day 19 end state - it already has `envFrom` for a
ConfigMap, a `secretKeyRef`, resource requests and limits, and all three probes. Applying it
today would fail: the referenced `app-config` and `app-secret` do not exist yet, so the pods
would sit in `CreateContainerConfigError` and I would be debugging day 17's material on day 16.
Today's version is just image, port and replica count. Config and secrets arrive tomorrow,
probes and limits on day 19.

## Result

Pods reached `Running` about 23 seconds after apply, most of which was pulling the image.

```
NAME                         READY   STATUS    RESTARTS   AGE
pod/myapp-6d87b888ff-6njx5   1/1     Running   0          4m55s
pod/myapp-6d87b888ff-f94gl   1/1     Running   0          4m55s

NAME            TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
service/myapp   ClusterIP   10.107.130.66   <none>        80/TCP    4m55s

NAME                    READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/myapp   2/2     2            2           4m55s

NAME                               DESIRED   CURRENT   READY   AGE
replicaset.apps/myapp-6d87b888ff   2         2         2       4m55s
```

`kubectl get all` shows the hierarchy in one screen: I created a Deployment, the Deployment
created a ReplicaSet, and the ReplicaSet created the Pods. I never asked for a ReplicaSet.

**Access.** `EXTERNAL-IP` is `<none>` because ClusterIP means "reachable inside the cluster
only". Getting to it from my machine needs a tunnel:

```
kubectl port-forward -n app svc/myapp 8080:80
curl -s localhost:8080/
{"message":"Hello from the DevOps training app!","version":"1.0.0","logLevel":"info"}
```

That is the same JSON I got from `docker run` yesterday, now served by a container the cluster
scheduled onto a node and reached through a virtual IP. Proper external routing is day 17's
ingress.

**Self-healing.** Deleted one pod by name and looked again - two pods, one of them with a new
name. Nothing restarted it manually. The Deployment declares "I want 2", the ReplicaSet
noticed it had 1, and it created another. This is the difference between declarative and
imperative that gets talked about abstractly: I never said "start a pod", I said "there should
be two", and the controller keeps making that true.

**One detail from `describe`** worth noting:

```
Environment:    <none>
```

The container reports version 1.0.0, but Kubernetes is injecting nothing. It comes from the
`ENV APP_VERSION` baked into the image on day 14, confirmed with:

```
kubectl exec -n app -it deploy/myapp -- sh -c 'echo APP_VERSION=$APP_VERSION'
APP_VERSION=1.0.0
```

Which is exactly the problem day 17 solves. Configuration living inside the image means
changing a log level requires rebuilding and re-releasing. Tomorrow that line stops being
`<none>`.

## Commands worth keeping

| Command | What it answers |
|---|---|
| `kubectl get all -n app` | What exists right now |
| `kubectl describe pod -n app -l app=myapp` | Why is it in this state - events, image, mounts |
| `kubectl logs -n app -l app=myapp --tail=10` | What is the app saying (label selector covers all replicas) |
| `kubectl exec -n app -it deploy/myapp -- sh` | Shell inside a running container |
| `kubectl port-forward -n app svc/myapp 8080:80` | Reach a ClusterIP service from outside |

`describe` is the one that matters when something is broken. The events at the bottom explain
pull failures, scheduling problems and probe failures far better than `get pods` ever will.
