# Gün 15 - Jenkins ve GitLab CI'ın GitHub Actions ile karşılaştırması

Opsiyonel gün. Jenkins controller'ı ayağa kaldırmadım - amaç kavramların ne kadar taşınabilir
olduğunu anlamaktı ve bunu görmek için aynı pipeline'ı yazmak yeterli. Repo kökündeki
`Jenkinsfile`, Gün 12-14 arasında kurduğum pipeline'ın Declarative Pipeline sözdizimindeki
hali.

## Çalıştırma modelleri

En büyük fark sözdiziminde değil, job'ı çalıştıran makinenin kime ait olduğunda.

**GitHub Actions** her job için geçici bir sanal makine veriyor. Oluşturuluyor, adımlar
çalışıyor, yok ediliyor. Açıkça cache'lenmedikçe ya da artifact olarak yüklenmedikçe job'lar
arasında hiçbir şey kalmıyor. Build'in nerede koştuğunu ya da geride ne bıraktığını hiç
düşünmek zorunda kalmadım - Gün 12-14'te sıfır altyapı işi olmasının sebebi tam olarak bu.

**Jenkins**, üzerine agent'lar bağlanan uzun ömürlü bir controller. Birileri kuruyor,
güncelliyor, plugin'leri yönetiyor, disk temizliyor. Agent genelde geçici olmadığı için,
container'lı agent kullanmazsan build'ler arasında durum sızıyor. Karşılığında kendi
donanımında, özel bir ağın içinde, hiçbir dış bağımlılık olmadan çalıştırabiliyorsun.

**GitLab CI** Actions'a yakın duruyor: repo içinde YAML yapılandırma, job'ları çalıştıran
runner'lar. Farkı, runner'ların self-hosted olabilmesi ve instance genelinde paylaşılabilmesi;
yani ikisinin arasında bir yerde konumlanıyor.

## Kavram eşlemesi

| Kavram | GitHub Actions | Jenkins (Declarative) | GitLab CI |
|---|---|---|---|
| Yapılandırma dosyası | `.github/workflows/*.yml` | `Jenkinsfile` (Groovy) | `.gitlab-ci.yml` |
| En üst birim | workflow | pipeline | pipeline |
| Gruplama | job | stage | stage |
| İş birimi | step | step | job |
| Çalıştırma hedefi | `runs-on` (runner) | `agent` | `tags` (runner) |
| Tetikleyici | `on:` | `triggers` / `when` | `rules` / `only` |
| Sadece tag'de çalışma | `on: push: tags:` | `when { buildingTag() }` | `rules: if: $CI_COMMIT_TAG` |
| Yeniden kullanılabilir mantık | `uses:` (action) | plugin / shared library | `include:` / template |
| Artifact | `actions/upload-artifact` | `archiveArtifacts` | `artifacts:` |
| Secret | `secrets.*` | `withCredentials` | CI/CD variables (masked) |
| Çoklu sürüm | `strategy.matrix` | `matrix` direktifi | `parallel: matrix` |
| Bağımlılık cache'i | setup-node içindeki `cache:` | plugin ya da elle | `cache:` |

Eşleme yeterince sıkı, yani pipeline çevirmek büyük ölçüde mekanik bir iş. Kurduğum her şeyin
doğrudan bir karşılığı var.

## Çevirinin gerçek maliyeti

Jenkinsfile'ı yazmak, Actions'ın gizli kolaylıklarını görünür hale getirdi.

**Kimlik bilgileri artık bedava değil.** `release.yml`'de registry girişi
`secrets.GITHUB_TOKEN` kullanıyor; GitHub bunu her run için üretiyor, `permissions:` bloğuyla
kapsamını daraltıyor ve sonrasında atıyor. Jenkins'te böyle bir şey yok - birinin Jenkins
içinde elle oluşturması ve sonradan elle döndürmesi gereken bir `credentialsId:
'ghcr-credentials'` referansı yazmak zorunda kaldım. Daha önce hiç olmayan yerde uzun ömürlü
bir kimlik bilgisi belirdi.

**Sürüm metadata'sı benim sorunum oluyor.** `docker/metadata-action`, `v1.0.0` tag'ini
karşılıksız olarak `1.0.0`, `1.0`, `1` ve `latest`'e çeviriyordu. Jenkins'te böyle bir şey yok,
Jenkinsfile `${TAG_NAME}` ve `${BUILD_NUMBER}`'a düşüyor - semver merdiveninin tamamını
isteseydim sürüm dizesini kendim parçalayan bir shell yazıyor olacaktım.

**Registry dahil değil.** GHCR repoyla birlikte geldi. Jenkins'te bir yerlerde bir registry ve
onun için kimlik bilgisi gerekirdi.

**Jenkins tarafında da eksik bir şey yok.** Actions'ta olmayanlara sahip: gerçek bir plugin
ekosistemi, kendi kontrolümdeki donanımda agent'lar, ve aynı özel ağdaki bir cluster'la
konuşabilen pipeline'lar. Sonuncusu burada önemli: `release.yml`'deki deploy adımının
placeholder olmasının sebebi tam olarak GitHub runner'ının benim minikube'uma erişememesi. Aynı
makinede koşan bir Jenkins agent'ı `helm upgrade`'i gerçekten çalıştırabilirdi.

## Takaslar

Kod zaten GitHub'daysa ve bir altyapı ekibi yoksa doğru varsayılan Actions. Sıfır bakım,
entegre izinler, public repolar için ücretsiz. Bedeli satıcıya bağımlılık - workflow dosyaları
taşınabilir değil, kavramlar ise ancak neye karşılık geldiklerini artık bildiğim için
taşınabilir.

Jenkins, build'lerin kontrol ettiğim bir ağın içinde koşması gerektiğinde, araç zinciri başka
hiçbir yerde olmayan plugin'lere ihtiyaç duyduğunda ya da deploy hedefi internetten
erişilemez olduğunda cevap oluyor. Bedeli, birinin onu ayakta tutması.

GitLab CI orta yola en yakın duran seçenek ve Actions'tan geçiş maliyeti üçü arasında en
düşüğü.

## Bitti sayılma kriteri

Gün 14 pipeline'ını her iki sisteme de çevirebiliyorum. Repodaki Jenkinsfile bu alıştırmanın
kendisi; yukarıdaki eşleme tablosu da aynı şeyi GitLab için nasıl yapacağımın haritası.
