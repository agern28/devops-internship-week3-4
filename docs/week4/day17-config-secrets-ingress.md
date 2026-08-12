# Day 17 - ConfigMaps, Secrets, Ingress, namespaces

## Goal

Get configuration out of the image and traffic in from outside the cluster. Yesterday
`kubectl describe pod` said `Environment: <none>` while the app still reported a version and a
log level - both were baked into the image, so changing either meant a rebuild and a re-release.

## What I did

**Ingress controller.** `minikube addons enable ingress`, which installs ingress-nginx
(controller v1.14.3). Waited for the controller pod with `kubectl wait` rather than guessing -
applying an Ingress before the controller is ready just leaves it with no address.

**ConfigMap.** `app-config` with a single key, `LOG_LEVEL: "debug"`. Deliberately set to
`debug` because the image defaults to `info` - if injection works, the difference is visible in
the response body instead of having to be inferred.

I dropped `APP_VERSION` from the ConfigMap that ships with the training bundle. It was set to
`1.0.0` there, and since a ConfigMap value overrides the image's own `ENV`, deploying a `1.1.0`
image would still have produced an app claiming to be `1.0.0`. The version belongs to the build
that produced the image; a ConfigMap that can disagree with it is a config file that lies.
Day 20's demo is specifically about showing a version change, so this would have quietly broken
the thing I most need to demonstrate.

**Secret.** Created imperatively rather than from a manifest:

```
kubectl create secret generic app-secret \
  --from-literal=API_KEY='local-dev-not-a-real-key' -n app
```

The bundle's `secret.yaml` has a real-looking value in `stringData` and a comment right above it
saying not to commit real secrets. I followed the comment instead of the file: committed
`secret.example.yaml` with `REPLACE_ME` as a placeholder, and kept the actual value out of git
entirely.

**Deployment.** Added `envFrom` for the whole ConfigMap and an explicit `env` entry with
`secretKeyRef` for the single secret key. Two different mechanisms for two different reasons -
`envFrom` pulls in everything and is fine for config that is meant to be read; naming the secret
key explicitly means the Deployment shows exactly which secrets it consumes.

**Ingress.** Host `myapp.local`, path `/`, backend the existing `myapp` Service on port 80.

## Result

Config injection, visible in the response:

```
$ curl -s localhost:8080/
{"message":"Hello from the DevOps training app!","version":"1.0.0","logLevel":"debug"}
```

`logLevel` is now `debug` and the image was never rebuilt. `version` still reads `1.0.0` from
the image, which is exactly the split I wanted.

Secret injection, from two angles:

```
$ kubectl describe pod -n app -l app=myapp | grep API_KEY
      API_KEY:  <set to the key 'API_KEY' in secret 'app-secret'>  Optional: false

$ kubectl exec -n app deploy/myapp -- sh -c 'echo $API_KEY'
local-dev-not-a-real-key
```

`describe` shows the reference, not the value - so the value does not leak into logs, terminal
scrollback or a screenshot of a debugging session. Inside the container it is a normal
environment variable.

**Secrets are not encrypted.** Worth being precise about, because the name suggests otherwise:

```
$ kubectl get secret app-secret -n app -o jsonpath='{.data.API_KEY}' | base64 -d
local-dev-not-a-real-key
```

Base64 is encoding, not encryption. Anyone with read access to Secrets in this namespace has
the value. What actually protects it is RBAC, plus encryption-at-rest for etcd if the cluster is
configured for it. On a real system this key would come from an external secret manager rather
than living in the cluster at all.

Ingress, reachable without a port-forward:

```
$ kubectl get ingress -n app
NAME    CLASS   HOSTS         ADDRESS        PORTS   AGE
myapp   nginx   myapp.local   192.168.49.2   80      15s

$ curl -s -H "Host: myapp.local" http://192.168.49.2/
{"message":"Hello from the DevOps training app!","version":"1.0.0","logLevel":"debug"}
```

The tunnel from day 16 is gone. Traffic now goes to the cluster's IP, nginx matches on the Host
header, and routes to the Service.

I tested with an explicit `Host` header first and added the `/etc/hosts` entry second. WSL
regenerates `/etc/hosts` from the Windows host file on boot, so the entry is not permanent -
the header version always works and does not depend on anything outside the command.

## One thing I noticed

The cluster had been stopped overnight. On restart, one of the two pods came back as `Error`
and stayed that way - `kubectl get all` showed `deployment.apps/myapp 1/2` with a dead pod
sitting next to a healthy one, and nothing replaced it. The rollout triggered by today's
Deployment change cleared it up, but only incidentally.

A Deployment counts pods, not working pods. Nothing in the current manifest tells Kubernetes how
to ask "is this container actually serving traffic" - which is what probes are for, and why
`Ready: 1/1` is a different claim from `Status: Running`. That is day 19.
