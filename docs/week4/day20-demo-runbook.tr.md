# Gün 20 - Ara değerlendirme ve checkpoint demosu

## Hedef

Zincirin tamamını uçtan uca çalışır halde göstermek ve her parçanın neden böyle olduğunu
anlatabilmek.

## Runbook

Sırayla ne çalıştıracağım ve neyi göstereceğim. Yaklaşık 12 dakika.

### 0. Başlamadan önce

```bash
minikube start
kubectl get nodes
kubectl get pods -n app
helm list -n app
```

Cluster oturumlar arasında kapalı duruyor ve yeniden başladıktan sonra kubeconfig, Docker'ın
artık haritalamadığı bir portu gösterebiliyor - `minikube start` bunu yeniden yazıyor. Demonun
sırasında değil, epey öncesinde yapılacak iş.

### 1. Commit'ten başlayan pipeline

Repoyu aç, `.github/workflows/` klasörünü göster. İki dosya her push ve pull request'te, biri
sadece tag'de çalışıyor.

```
ci.yml       Node 22 / 24 / 26 üzerinde build + test, npm cache'i ile
quality.yml  ESLint, coverage eşiği, CodeQL
release.yml  v*.*.* tag'i -> image + GitHub Release
```

Merge edilmiş bir pull request'i ve beş zorunlu check'i göster. Sonra Gün 13'teki kapalı pull
request'i: kasten eklenen kullanılmayan bir değişken lint job'ını düşürmüş ve merge butonu
grileşmiş. Kapı bir öneri değil.

### 2. Artifact

```bash
docker pull ghcr.io/agern28/devops-internship-week3-4:1.1.0
```

Paket sayfasını göster: `1.1.0`, `1.1`, `1` ve `latest`. `1.0.0` hâlâ orada, dokunulmamış. Sürüm
etiketleri değişmez ve rollback hedefi onlar; `latest` ise kayıyor.

### 3. Çalışan iş yükü

```bash
kubectl get all,ingress -n app
curl -s -H "Host: myapp.local" http://$(minikube ip)/
```

```json
{"message":"Hello from the DevOps training app!","version":"1.1.0","logLevel":"debug"}
```

Tek satırda iki şey: sürüm image'dan geliyor, log seviyesi ConfigMap'ten. Bilerek ayrıldı - eğer
`APP_VERSION` de ConfigMap'te olsaydı, yeni bir image deploy etmek yine eski sürümü raporlardı.

### 4. Kendini onarma

```bash
kubectl get pods -n app -w
# baska bir terminalde:
kubectl delete pod -n app <bir pod>
```

Yerine hemen bir pod geliyor ve `1/1` olmadan önce birkaç saniye `0/1 Running` durumunda
duruyor. O boşluk readiness probe'u: container ayakta ama uygulama warm-up'ını bitirene kadar
`/ready` 503 dönüyor ve Service o ana kadar ona yönlendirmiyor.

### 5. Ölçekleme

```bash
kubectl get hpa -n app
```

Vakit varsa üç busybox yük pod'unu başlat ve replikaların 2 → 4 → 5 gidişini izlet. Yoksa kayıtlı
çıktıyı göster - ölçek büyütme birkaç dakika sürüyor, küçültmenin ise beş dakikalık stabilizasyon
penceresi var ki bu bir demonun sabrını aşıyor.

### 6. Deploy ve geri alma

```bash
helm upgrade myapp ./helm/myapp -n app \
  --set secret.API_KEY='...' --set image.tag=1.1.0
helm history myapp -n app
helm rollback myapp -n app
curl -s -H "Host: myapp.local" http://$(minikube ip)/
```

Sürüm yaklaşık yirmi saniyede 1.0.0'a dönüyor. Tekrar `helm rollback` çalıştırınca ileri gidiyor.

## Beklediğim sorular ve cevaplarım

**`release.yml`'deki deploy adımı neden bir echo?**

GitHub'ın barındırdığı runner benim dizüstümdeki minikube'a erişemez, içeri doğru rota yok.
Gerçek olması için bu makinede self-hosted runner, dışa açık bir cluster ya da cluster içinde
registry'yi izleyen Argo CD gibi pull tabanlı bir agent gerekir. Gerçekten kuracağım şey
sonuncusu olurdu, çünkü cluster'ı hiç dışarı açmayı gerektirmiyor. Deploy ediyormuş gibi yapan
bir şey yazmak yerine placeholder bıraktım.

**Kubernetes Secret'ları şifreli mi?**

Hayır. `kubectl get secret -o jsonpath=... | base64 -d` değeri düz metin olarak döndürüyor.
Base64 kodlamadır. Onu koruyan şey RBAC, bir de cluster öyle yapılandırılmışsa etcd'nin
encryption-at-rest özelliği. Üretimde bu değer harici bir secret yöneticisinden gelirdi.

**Ne bozuldu ve nasıl düzelttin?**

Anlatmaya değer üç tanesi: pull request'i merge etmeden `v1.0.0` tag'i atmak - tag, release
workflow'u içermeyen bir commit'e düştü ve hiçbir şey tetiklenmedi. ConfigMap'i değiştirip
başarılı raporlayan ama pod'lar eski değeri servis etmeye devam eden bir `helm upgrade` - ortam
değişkenleri container başlarken okunuyor ve pod şablonu değişmemişti, checksum annotation'ı ile
çözüldü. Ve varsayılan branch yerine bütün branch'leri kapsayan bir branch protection ruleset'i,
ki feature branch push etmeyi tamamen imkansız hale getirmişti.

**Eğitim paketinde neden bu kadar çok şey değiştirdin?**

Birkaç action sürümü Node 20 runtime'ını hedefliyordu, ki Eylül 2026'da runner'lardan
kaldırılıyor. `node:20-alpine` EOL olmuş durumda. Dockerfile'da, release workflow'unun gönderdiği
sürüm için `ARG` yoktu, dolayısıyla her image 1.0.0 raporluyordu. Helm chart'ında çalışan bir
varsayılan secret vardı, yani ezmeyi unutmak sahte bir anahtarla sessizce kurulum demekti.

**Ne eksik?**

GitOps yok - deploy'lar manuel. Altyapı kod olarak tanımlı değil; cluster elle başlatılan yerel
bir minikube. Bir sayaç endpoint'i dışında observability yok; Prometheus yok, dashboard yok,
alerting yok. Secret'lar harici bir yönetici yerine cluster'da duruyor. Tek ortam var - staging
yok, ortamlar arası promotion yok.

## Prova sırasında bulduğum iki şey

**`helm history` yanlış app sürümü raporluyor.** Her revizyon `APP VERSION 1.0.0` diyor, 1.1.0
image'ını çalıştıranlar bile; çünkü `appVersion` `Chart.yaml`'da sabit yazılmış ve onu güncelleyen
bir şey yok. `helm history`, hangi image'ın deploy edildiğinin güvenilir bir kaydı değil. Düzgün
çözümü `appVersion`'ı release'in parçası olarak yükseltmek, ki bu da pipeline'ın
otomatikleştirebileceği bir başka iş.

**Geçmiş on revizyonla sınırlı.** Yeterince upgrade'den sonra revizyon 1 sessizce listeden düştü
- Helm varsayılan olarak son onu tutuyor. Burada sorun değil ama `helm history`'yi bir denetim
kaydı gibi görmeden önce bilinmesi gereken bir şey.

## Nereye vardı

Dört hafta: sürüm kontrolü ve Linux, container'lar, CI/CD, Kubernetes. Son iki hafta bir repoyu
kendi kendini build eden, test eden, kapılardan geçiren, sürümleyen, yayınlayan ve çalıştıran bir
şeye çevirdi. En çok vakit harcayacağımı tahmin etmediğim kısım, araçların bana ne söylediğini
gerçekten okumaktı - atlaması kolay uyarılar ve teknik olarak doğru ama pratikte yanlış olan
"başarılı" mesajları.
