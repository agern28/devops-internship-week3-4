# Gün 17 - ConfigMap, Secret, Ingress, namespace

## Hedef

Yapılandırmayı image'ın dışına çıkarmak ve trafiği cluster'ın dışından içeri almak. Dün
`kubectl describe pod` `Environment: <none>` diyordu ama uygulama yine de bir sürüm ve log
seviyesi raporluyordu - ikisi de image'a gömülüydü, yani birini değiştirmek yeniden build ve
yeniden release demekti.

## Yaptıklarım

**Ingress controller.** `minikube addons enable ingress`, ingress-nginx kuruyor (controller
v1.14.3). Tahmin etmek yerine `kubectl wait` ile controller pod'unu bekledim - controller hazır
olmadan Ingress uygulamak, adresi hiç dolmayan bir kaynak bırakıyor.

**ConfigMap.** `app-config`, tek anahtar: `LOG_LEVEL: "debug"`. Bilerek `debug`, çünkü image'ın
varsayılanı `info` - enjeksiyon çalışıyorsa fark yanıt gövdesinde doğrudan görünüyor, çıkarım
yapmak gerekmiyor.

Eğitim paketindeki ConfigMap'te bulunan `APP_VERSION`'ı çıkardım. Orada `1.0.0` olarak
ayarlıydı ve ConfigMap değeri image'ın kendi `ENV`'ini ezdiği için, `1.1.0` image'ı deploy
etsem bile uygulama kendini `1.0.0` sanmaya devam edecekti. Sürüm, o image'ı üreten build'e
aittir; onunla çelişebilen bir ConfigMap, yalan söyleyen bir yapılandırma dosyasıdır. Gün 20
demosu tam olarak bir sürüm değişimini göstermekle ilgili, yani bu tam da göstermem gereken şeyi
sessizce bozacaktı.

**Secret.** Manifest'ten değil, komutla oluşturuldu:

```
kubectl create secret generic app-secret \
  --from-literal=API_KEY='local-dev-not-a-real-key' -n app
```

Paketteki `secret.yaml`, `stringData` içinde gerçekçi görünen bir değer taşıyor ve hemen
üstündeki yorumda gerçek secret commit'lememek gerektiğini söylüyor. Dosyayı değil yorumu takip
ettim: `secret.example.yaml`'ı `REPLACE_ME` yer tutucusuyla commit ettim, gerçek değeri git'in
tamamen dışında tuttum.

**Deployment.** ConfigMap'in tamamı için `envFrom`, tek secret anahtarı için de `secretKeyRef`
ile açık bir `env` girdisi eklendi. İki farklı sebep için iki farklı mekanizma - `envFrom` her
şeyi içeri çekiyor ve okunması amaçlanan yapılandırma için uygun; secret anahtarını açıkça
isimlendirmek ise Deployment'ın hangi secret'ları tükettiğini net gösteriyor.

**Ingress.** Host `myapp.local`, path `/`, arkasında 80 portundaki mevcut `myapp` Service'i.

## Sonuç

Yanıtta görünen config enjeksiyonu:

```
$ curl -s localhost:8080/
{"message":"Hello from the DevOps training app!","version":"1.0.0","logLevel":"debug"}
```

`logLevel` artık `debug` ve image hiç yeniden build edilmedi. `version` hâlâ image'dan gelen
`1.0.0`, ki istediğim ayrım tam olarak buydu.

Secret enjeksiyonu, iki açıdan:

```
$ kubectl describe pod -n app -l app=myapp | grep API_KEY
      API_KEY:  <set to the key 'API_KEY' in secret 'app-secret'>  Optional: false

$ kubectl exec -n app deploy/myapp -- sh -c 'echo $API_KEY'
local-dev-not-a-real-key
```

`describe` değeri değil referansı gösteriyor - yani değer log'lara, terminal geçmişine ya da bir
hata ayıklama oturumunun ekran görüntüsüne sızmıyor. Container'ın içinde ise sıradan bir ortam
değişkeni.

**Secret'lar şifreli değil.** İsmi aksini çağrıştırdığı için burada net olmakta fayda var:

```
$ kubectl get secret app-secret -n app -o jsonpath='{.data.API_KEY}' | base64 -d
local-dev-not-a-real-key
```

Base64 kodlamadır, şifreleme değil. Bu namespace'te Secret okuma yetkisi olan herkes değere
sahip. Onu asıl koruyan şey RBAC, bir de cluster öyle yapılandırılmışsa etcd'nin
encryption-at-rest özelliği. Gerçek bir sistemde bu anahtar cluster'da hiç durmaz, harici bir
secret yöneticisinden gelirdi.

Port-forward olmadan erişilebilen Ingress:

```
$ kubectl get ingress -n app
NAME    CLASS   HOSTS         ADDRESS        PORTS   AGE
myapp   nginx   myapp.local   192.168.49.2   80      15s

$ curl -s -H "Host: myapp.local" http://192.168.49.2/
{"message":"Hello from the DevOps training app!","version":"1.0.0","logLevel":"debug"}
```

Gün 16'daki tünel gitti. Trafik artık cluster'ın IP'sine gidiyor, nginx Host başlığına bakarak
eşleştiriyor ve Service'e yönlendiriyor.

Önce açık `Host` başlığıyla test ettim, `/etc/hosts` kaydını sonra ekledim. WSL açılışta
`/etc/hosts`'u Windows'un host dosyasından yeniden ürettiği için o kayıt kalıcı değil - başlıklı
sürüm ise her zaman çalışıyor ve komutun dışındaki hiçbir şeye bağlı değil.

## Dikkatimi çeken bir şey

Cluster gece boyunca kapalıydı. Yeniden başlattığımda iki pod'dan biri `Error` durumunda geldi
ve öyle kaldı - `kubectl get all` çıktısı `deployment.apps/myapp 1/2` gösteriyordu, sağlıklı bir
pod'un yanında ölü bir pod duruyordu ve onu kimse değiştirmedi. Bugünkü Deployment değişikliğinin
tetiklediği rollout durumu temizledi, ama bu tesadüfen oldu.

Deployment pod'ları sayıyor, çalışan pod'ları değil. Mevcut manifest'te Kubernetes'e "bu
container gerçekten trafik servis ediyor mu" diye sormasını söyleyen hiçbir şey yok - probe'lar
tam olarak bunun için var ve `Ready: 1/1` ile `Status: Running` bu yüzden farklı iddialar. Orası
Gün 19.
