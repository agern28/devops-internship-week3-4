# Gün 16 - Kubernetes temelleri: pod, deployment, service

## Hedef

Gün 14'te üretilen image'ı gerçek bir cluster'da çalıştırmak. Zincirin son halkası: commit →
CI → kalite kapıları → image → registry → çalışan iş yükü.

## Yaptıklarım

**Yerel cluster.** minikube v1.38.1, docker driver, 2 CPU ve 4 GB. kubectl v1.36.2.

```
minikube start --driver=docker --cpus=2 --memory=4g
```

kind daha hafif olmasına rağmen minikube'u seçtim. Gün 17 bir ingress controller, Gün 19 da
metrics-server istiyor; minikube ikisini de addon olarak veriyor, kind'da her biri ekstra
cluster yapılandırmasıyla elle kurulum demek. Kavramlar iki tarafta da aynı olduğu için, iki
yan görevden kurtulmak adına biraz RAM ödemek doğru takas gibi göründü.

**Üç manifest**: `app` adında bir `Namespace`, 2 replikalı bir `Deployment`, ve 80 portunu
container'ın 8080'ine bağlayan `ClusterIP` tipinde bir `Service`.

Deployment `ghcr.io/agern28/devops-internship-week3-4:1.0.0` image'ını gösteriyor - release
pipeline'ının dün yayınladığı image'ın kendisi, `latest` yerine semver etiketine sabitlenmiş
halde. Bu önemli: `latest` kayan bir etiket ve `imagePullPolicy: IfNotPresent` ile birleşince,
onu zaten cache'lemiş bir node hiçbir uyarı vermeden eski bir build'i servis etmeye devam
eder.

**Paketteki Deployment yerine sadeleştirilmiş bir tane yazdım.** Eğitim materyalindeki
`deployment.yaml` aslında Gün 19'un bitmiş hali - içinde ConfigMap için `envFrom`, bir
`secretKeyRef`, resource request/limit'leri ve üç probe'un hepsi zaten var. Bugün uygulasaydım
patlardı: referans verdiği `app-config` ve `app-secret` henüz yok, pod'lar
`CreateContainerConfigError` durumunda kalır ve Gün 16'da Gün 17'nin malzemesini debug ediyor
olurdum. Bugünkü hali sadece image, port ve replika sayısı. Config ve secret'lar yarın,
probe'lar ve limitler Gün 19'da geliyor.

## Sonuç

Pod'lar apply'dan yaklaşık 23 saniye sonra `Running` oldu, sürenin çoğu image çekmekle geçti.

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

`kubectl get all` hiyerarşiyi tek ekranda gösteriyor: ben bir Deployment oluşturdum, Deployment
bir ReplicaSet oluşturdu, ReplicaSet de Pod'ları oluşturdu. ReplicaSet'i hiç istemedim.

**Erişim.** `EXTERNAL-IP` `<none>` çünkü ClusterIP "sadece cluster içinden erişilebilir"
demek. Kendi makinemden ulaşmak için bir tünel gerekiyor:

```
kubectl port-forward -n app svc/myapp 8080:80
curl -s localhost:8080/
{"message":"Hello from the DevOps training app!","version":"1.0.0","logLevel":"info"}
```

Bu, dün `docker run` ile aldığım JSON'un aynısı - ama şimdi cluster'ın bir node'a
zamanladığı ve sanal bir IP üzerinden ulaşılan bir container servis ediyor. Düzgün dış
yönlendirme Gün 17'nin ingress'i.

**Kendini onarma.** Bir pod'u adıyla sildim ve tekrar baktım - yine iki pod, biri yeni isimle.
Kimse elle yeniden başlatmadı. Deployment "2 istiyorum" diyor, ReplicaSet elinde 1 kaldığını
fark etti ve bir tane daha oluşturdu. Bildirimsel (declarative) ile buyurgan (imperative)
arasındaki, genelde soyut anlatılan fark tam olarak bu: hiçbir zaman "bir pod başlat"
demedim, "iki tane olmalı" dedim ve controller bunu doğru tutmaya devam ediyor.

**`describe` çıktısındaki bir ayrıntı** not edilmeye değer:

```
Environment:    <none>
```

Container sürümü 1.0.0 olarak raporluyor ama Kubernetes hiçbir şey enjekte etmiyor. Bu değer
Gün 14'te image'a gömülen `ENV APP_VERSION`'dan geliyor:

```
kubectl exec -n app -it deploy/myapp -- sh -c 'echo APP_VERSION=$APP_VERSION'
APP_VERSION=1.0.0
```

Gün 17'nin çözdüğü problem tam olarak bu. Yapılandırma image'ın içinde yaşıyorsa, log seviyesini
değiştirmek yeniden build ve yeniden release demek. Yarın o satır `<none>` olmaktan çıkacak.

## Saklamaya değer komutlar

| Komut | Neyi cevaplıyor |
|---|---|
| `kubectl get all -n app` | Şu an ne var |
| `kubectl describe pod -n app -l app=myapp` | Neden bu durumda - event'ler, image, mount'lar |
| `kubectl logs -n app -l app=myapp --tail=10` | Uygulama ne diyor (label seçici tüm replikaları kapsıyor) |
| `kubectl exec -n app -it deploy/myapp -- sh` | Çalışan container içinde shell |
| `kubectl port-forward -n app svc/myapp 8080:80` | ClusterIP servisine dışarıdan erişim |

Bir şey bozulduğunda işe yarayan `describe`. En alttaki event'ler; pull hatalarını, zamanlama
sorunlarını ve probe başarısızlıklarını `get pods`'un asla anlatamayacağı kadar iyi anlatıyor.
