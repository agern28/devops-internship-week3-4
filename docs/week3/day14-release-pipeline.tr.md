# Gün 14 - Build, push, semantic versioning, release

## Hedef

Test edilmiş kodu gerçekten dağıtılabilir bir şeye çevirmek: sürümlenmiş, registry'de duran ve
bir git tag'inden otomatik olarak üretilen bir container image.

## Yaptıklarım

**Dockerfile.** Eğitim paketindeki halinden iki fark var.

Temel image `node:20-alpine`'dan `node:24-alpine`'a geçti. Node 20 30 Nisan 2026'da EOL oldu ve
`package.json`'da `>=22` isteyip image'ı 20 üzerinde üretmek tutarsız olurdu.

Daha ilginç olanı şu: paketteki `release.yml`, `APP_VERSION`'ı build argümanı olarak
gönderiyordu ama Dockerfile'da onu karşılayacak bir `ARG` yoktu. Docker bu durumda sadece
"unused build argument" yazıp devam ediyor, yani değer sessizce çöpe gidiyordu ve ne build
edilirse edilsin her image `1.0.0` raporluyordu. Eklendi:

```dockerfile
ARG APP_VERSION=0.0.0-dev
ENV APP_VERSION=$APP_VERSION
```

Varsayılan bilerek `1.0.0` değil. Argüman bir gün yine ulaşmazsa container `0.0.0-dev` diyecek
ve sorun gizlenmek yerine görünür olacak.

CI'a dokunmadan önce yerelde doğruladım:

```
$ docker build --build-arg APP_VERSION=0.9.0-local -t training-app:local .
$ curl -s localhost:8080/
{"message":"Hello from the DevOps training app!","version":"0.9.0-local","logLevel":"info"}
```

**Release workflow'u.** Sadece `v*.*.*` tag'lerinde tetikleniyor. GHCR'a `GITHUB_TOKEN` ile
giriyor - personal access token yok, hiçbir yerde uzun ömürlü bir kimlik bilgisi durmuyor -
etiket setini `docker/metadata-action` ile üretiyor, build edip push ediyor ve otomatik notlarla
bir GitHub Release oluşturuyor.

Bütün action'ları güncel major'a çektim (`checkout@v5`, `setup-buildx-action@v4`,
`login-action@v4`, `metadata-action@v6`, `build-push-action@v7`), son iki gündeki Node 20
runtime sebebinin aynısı. Bir de `cache-from/cache-to: type=gha` ekledim ki Docker layer'ları
run'lar arasında kalsın; bunun için önce Buildx kurmak gerekiyor.

Açıklamaya değer bir değişiklik: build argümanı `github.ref_name`'den değil,
`steps.meta.outputs.version`'dan geliyor. Git tag'i `v1.0.0`, ama image etiketleri `1.0.0` -
metadata-action baştaki harfi kırpıyor. `ref_name` kullanmak, kendi image etiketi `1.0.0` olan
bir container'ın içine `v1.0.0` gömmek demekti; tam da hangi sürümün çalıştığını anlamaya
çalışırken kafa karıştıran türden küçük bir tutarsızlık.

**Deploy adımı hâlâ bir echo.** Çalıştıracağı `helm upgrade` komutunu ekrana basıyor. GitHub'ın
barındırdığı runner benim dizüstümdeki minikube'a erişemez, içeri doğru rota yok. Gerçek olması
için self-hosted runner, dışa açık bir cluster ya da cluster içinde çalışan pull tabanlı bir
agent gerekirdi. Sahte bir deploy yazmak yerine bilinçli olarak placeholder bırakıldı.

**İlk push'tan sonra paketi public yaptım.** GHCR paketleri varsayılan olarak private ve
anonim çeken bir yerel cluster Gün 16'da `ImagePullBackOff` alırdı.

## Takıldığım yer

**Merge etmeden tag attım.** En çok zaman kaybettiren buydu. Pull request'teki check'lerin
hepsi yeşildi, ben de `v1.0.0` atıp push ettim - ve hiçbir şey olmadı. Workflow run'ı yok,
paket yok, release yok.

Sebebi sonradan bakınca çok açık: tag bir commit'i işaret eder. Pull request merge edilmemişti,
yani `main` hâlâ Gün 13 commit'indeydi ve tag `release.yml` içermeyen bir ağaca düştü. GitHub'ın
tetikleyecek bir şeyi yoktu.

```
$ git show main:.github/workflows/release.yml
fatal: path '.github/workflows/release.yml' does not exist in 'main'
```

Yeşil check "merge edebilirsin" demek, "merge edildi" demek değil. Çözüm: tag'i yerelde ve
uzakta silmek, PR'ları merge etmek, sonra güncellenmiş `main` üzerinde tag'i yeniden
oluşturmak.

**`git add` ya hep ya hiç çalışıyor.** Üç dosyayı tek tek yazmıştım ve biri henüz mevcut
değildi; git bütün staging işlemini iptal etti. Commit sessizce oluşmadı ve ben farkında olmadan
boş bir branch push ettim. `git add -A` sonrası `git status --short` daha güvenli bir alışkanlık
- önce her şeyi al, sonra neyi aldığına bak.

**Container isimleri en az iki karakter olmalı.** `--name t` doğrudan reddediliyor; isim
kalıbı ikinci bir karakter istiyor. Önemsiz bir detay ama hata mesajı uzunluktan değil kalıptan
bahsettiği için insanı yanlış yere bakmaya itiyor.

## Sonuç

`v1.0.0` tag'i push edildi, release workflow'u çalıştı, image
`ghcr.io/agern28/devops-internship-week3-4` altına semver etiket seti ve `latest` ile
yayınlandı. GitHub Release otomatik notlarla oluştu.

Uçtan uca doğrulamak için image'ı anonim olarak geri çektim:

```
$ docker logout ghcr.io
$ docker pull ghcr.io/agern28/devops-internship-week3-4:1.0.0
$ curl -s localhost:8081/
{"message":"Hello from the DevOps training app!","version":"1.0.0","logLevel":"info"}
```

Bu tek satır üç şeyi birden kanıtlıyor: paket gerçekten public, `ARG` düzeltmesi çalışıyor, ve
container'ın raporladığı sürüm yayınlandığı etiketle örtüşüyor.

Zincir artık commit'ten yayınlanmış artifact'e kadar kimse dokunmadan işliyor. Eksik olan son
halka, image'ı gerçekten çalıştıracak şey. Orası Gün 16'da başlıyor.
