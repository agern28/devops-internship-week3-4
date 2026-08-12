# Gün 19 - Sağlık kontrolleri, probe'lar, resource limitleri, autoscaling

## Hedef

Deployment'ı kendi kendini onaran ve esnek hale getirmek. Gün 17 ve 18 aynı sorunla bitmişti:
cluster'a bir pod'un gerçekten trafik servis edebilir durumda olup olmadığını söyleyen hiçbir
şey yoktu, dolayısıyla istekler hâlâ açılmakta olan ya da çoktan kapanan pod'lara düşüyordu.

## Yaptıklarım

**metrics-server.** `minikube addons enable metrics-server`. Onsuz HPA'nın CPU okuması olmuyor
ve hiçbir şey yapmıyor.

**Resource request ve limit'leri.** Request 100m CPU / 128Mi bellek, limit 500m / 256Mi.
Aradaki fark göründüğünden önemli: request, scheduler'ın pod'u yerleştirirken ayırdığı miktar
ve - bugün için asıl önemlisi - HPA'nın kullanım oranını **karşısında** ölçtüğü değer. 100m
request'e karşı 100m kullanan bir pod %100'de, 500m limitin %20'sinde değil. Limit ise sert
tavan; bellek limitini aşan container öldürülüyor.

**Üç probe**, her biri farklı bir soruya cevap veriyor:

| Probe | Endpoint | Sorusu | Başarısızlığın sonucu |
|---|---|---|---|
| startup | `/healthz` | Açılışı bitti mi? | Liveness beklemede kalır; hiç geçmezse container öldürülür |
| liveness | `/healthz` | Süreç yaşıyor mu? | Container yeniden başlatılır |
| readiness | `/ready` | Trafik servis edebilir mi? | Service endpoint'lerinden çıkarılır |

Liveness ve readiness bilerek farklı endpoint'leri gösteriyor. `/healthz` süreç ayağa kalkar
kalkmaz 200 dönüyor. `/ready` ise uygulama warm-up'ı simüle ederken ilk iki saniye 503,
sonrasında 200 dönüyor. İkisini de `/healthz`'e bağlamak readiness probe'unu anlamsız kılardı -
tam da uygulamanın henüz hazır olmadığı anda geçerdi, ki yakalamak için var olduğu durum bu.

Startup probe, yavaş açılışların takılma sanılmaması için var. Liveness ancak startup geçtikten
sonra başlıyor, yani açılması meşru olarak 20 saniye süren bir container 10. saniyede tetiklenen
bir liveness probe tarafından öldürülmüyor.

**HPA**, %70 CPU kullanımını hedefliyor, 2 ile 5 replika arası.

**Chart'ta `replicas` koşullu hale getirildi.** Autoscaling açıkken şablon `spec.replicas`'ı
tamamen atlıyor. Aksi halde HPA ile Helm çekişirdi: HPA 5'e ölçeklerdi, sonraki `helm upgrade`
`replicas: 2` render ederdi ve deployment yükün ortasında geri çekilirdi.

## Sonuç

**Pod yaşam döngüsünde görünen readiness.** Rollout tetiklerken pod'ları izledim:

```
myapp-656f9b74cb-285dp   0/1     ContainerCreating   0     0s
myapp-656f9b74cb-285dp   0/1     Running             0     1s
myapp-656f9b74cb-285dp   0/1     Running             0     2s
myapp-656f9b74cb-285dp   1/1     Running             0     4s
```

Üç saniye boyunca `0/1 Running`. Container o süre boyunca ayaktaydı - `Running` bunu söylüyor -
ama `READY` sütunu, `/ready` 200 dönmeye başlayana kadar 0'da kaldı. O pencere boyunca Service o
pod'a yönlendirme yapmadı.

Dün eksik olan tam da bu boşluktu: ingress üzerinden atılan bir `curl` çıkış yolundaki bir
pod'a düşmüş ve eski yapılandırmayı döndürmüştü. `Status: Running` ile `Ready: 1/1` farklı
iddialar ve "ona trafik gönder" anlamına gelen sadece ikincisi.

**Liveness.** İlk denemem container içindeki süreci `kubectl exec -- kill 1` ile öldürmekti ve
hiçbir şey olmadı - pod `RESTARTS 0` ile ayakta kaldı. Çekirdek PID 1'i koruyor: bir PID
namespace'inde PID 1'e gönderilen sinyaller, süreç o sinyal için handler kurmadıysa atılıyor ve
Node varsayılan olarak kurmuyor. `kill -9` de aynı sebeple başarısız.

Zaten probe'un kendisini bozmak daha iyi bir test ve Helm üzerinden yapılıyor:

```
helm upgrade myapp ./helm/myapp -n app --set probes.liveness.path=/does-not-exist
```

```
myapp-6ff6c4999-fvcl6   0/1  Running  1 (1s ago)   61s
myapp-6ff6c4999-fvcl6   1/1  Running  1 (4s ago)   64s
myapp-6ff6c4999-fvcl6   0/1  Running  2 (1s ago)   2m1s
myapp-6ff6c4999-fvcl6   1/1  Running  2 (4s ago)   2m4s
```

Yaklaşık 60 saniyede bir yeniden başlatma - 10 saniye aralıklı üç başarısız probe, artı ayağa
kalkma süresi. Pod isimleri hiç değişmiyor: readiness başarısızlığı pod'u rotasyondan
çıkarıyor, liveness başarısızlığı container'ı yerinde yeniden başlatıyor. Aynı pod, yeni
container.

Her yeniden başlatmanın hemen ardından gelen `0/1` ise readiness probe'unun işini tekrar
yapması - yeni container, Service ona yönlendirmeden önce warm-up'ını tamamlamak zorunda.

**Yük altında ölçekleme.** Servise döngüyle yüklenen üç busybox pod'u:

```
myapp   Deployment/myapp   cpu: 1%/70%     2   5   2
myapp   Deployment/myapp   cpu: 18%/70%    2   5   2
myapp   Deployment/myapp   cpu: 251%/70%   2   5   2
myapp   Deployment/myapp   cpu: 251%/70%   2   5   4
myapp   Deployment/myapp   cpu: 251%/70%   2   5   5
myapp   Deployment/myapp   cpu: 123%/70%   2   5   5
```

Yaklaşık 30 saniye içinde 2 → 4 → 5 replika, ardından ek pod'lar yükü emdikçe kullanım oranı
yarıya indi. %251'e kadar aşma, küçük request'in sonucu: 100m'de, üç döngü istemcisi pod'ları
HPA'nın bir sonraki değerlendirmesinden çok önce doyuruyor.

5'te durdu ve bunu söyledi:

```
ScalingLimited  True  TooManyReplicas  the desired replica count is more than the maximum replica count
```

%123 CPU'da hâlâ daha fazla pod istiyordu ve buna izni yoktu. Gerçek bir sistemde bu,
`maxReplicas`'ı yükseltme ya da her pod'un neden bu kadar CPU harcadığını araştırma sinyali -
HPA bana tavanın bağlayıcı olduğunu söylüyor, sorunun çözüldüğünü değil.

**Yok saymak yerine okunmaya değer bir uyarı:**

```
Warning  FailedGetResourceMetric  (x8 over 8m57s)  failed to get cpu utilization:
did not receive metrics for targeted pods (pods might be unready)
```

Dokuz dakika içinde sekiz kez, hepsi yük testinden önce. HPA, probe'ları ekleyen `helm upgrade`
ile aynı anda oluşturuldu, yani bir süre metrics-server'ın henüz üretmediği metrikleri istedi.
Metrikler akmaya başlayınca kendiliğinden düzeldi, ama `<unknown>` raporlayan bir HPA'nın
autoscaling yapmadığını hatırlatan iyi bir örnek - sessizce başarısız oluyor ve replika sayısını
olduğu yerde bırakıyor.

## Zincir tamamlandı

Artık her parça yerinde: bir commit CI'dan ve kalite kapılarından geçiyor, bir tag registry'de
sürümlenmiş bir image üretiyor, Helm de onu kendi kendini onaran ve talebe göre ölçeklenen bir
cluster'a deploy ediyor. Gün 20, bunun tamamını uçtan uca göstermek.
