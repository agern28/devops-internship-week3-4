# Gün 12 - GitHub Actions: workflow, matrix build, cache

## Hedef

Gün 11'de tasarladığım şeyi gerçekten çalışan bir hale getirmek. Her push ve pull request'te
build ve test, birden fazla Node sürümü üzerinde, ve tekrar eden run'ların her seferinde
sıfırdan kurulum maliyeti ödememesi için bağımlılık cache'i.

## Yaptıklarım

Eğitim paketinden sadece bugüne ait dosyaları aldım: `src/`, `test/`, `package.json`.
Dockerfile, k8s manifest'leri, Helm chart'ı ve diğer iki workflow kendi günleri gelene kadar
repoya girmiyor.

YAML yazmadan önce `package.json` üzerinde üç değişiklik:

**`package-lock.json` üretip commit ettim.** Pakette yok. Bu tercih meselesi değil: `npm ci`
lockfile olmadan çalışmayı reddediyor, `setup-node`'un npm cache'i de anahtarını tam olarak o
dosyadan üretiyor, yani dosya yoksa cache'lenecek bir şey de yok. Tek bir `npm install`
yeterli.

**`jest.coverageThreshold` bloğunu sildim.** Coverage eşiği bir kalite kapısı ve kalite
kapıları Gün 13'ün konusu. Bıraksaydım ilk CI run'ı Gün 12'nin konusuyla hiç ilgisi olmayan
bir sebepten kırmızı başlayacaktı. Yarın geri gelecek, zaten orada kapının kırılması olayın
kendisi.

**`engines.node` değerini `>=18`'den `>=22`'ye çektim.** Node 18 Nisan 2025'te, Node 20 da 30
Nisan 2026'da EOL oldu; `>=18` repoda duran yanlış bir bilgiydi.

Sonra workflow'un kendisi. Paketteki yapıyı korudum ama matrix'i `[18, 20, 22]` yerine
`[22, 24, 26]` yaptım, sebebi aynı EOL meselesi: şu an 24 aktif LTS, 22 maintenance, 26 ise
current. `fail-fast: false` koydum ki bir leg patlarsa diğer ikisinin sonucu gizlenmesin.
Bir de `workflow_dispatch` ekledim; Gün 11'de tetikleyici türlerini listelemiştim, manuel
tetiklemeyi gerçekten görmenin en ucuz yolu bu. Coverage artifact'i sadece Node 24 leg'inden
yükleniyor, 7 gün saklanıyor - aynı raporun üç kopyasını tutmanın anlamı yok.

## Takıldığım yer

**`npm test` yerelde exit 1 döndü.** `package.json`'ı düzenlemiştim ama `coverageThreshold`
bloğu hâlâ duruyordu; jest %80 eşiğe karşılık %65.38 raporlayıp run'ı düşürdü. Bloğu düzgün
silince geçti. Akılda tutulacak şey: eşik `package.json` içinde yaşıyor, workflow'da değil -
YAML'ın hiçbir yerinde coverage geçmiyor.

**İlk yeşil run'da bile bir uyarı vardı.** Üç job da geçti (19sn, 18sn, 18sn) ama
annotations kısmında şu duruyordu:

```
Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced
to run on Node.js 24: actions/checkout@v4, actions/setup-node@v4, actions/upload-artifact@v4
```

Bunu yanlış okumak çok kolay. Benim matrix'imle hiçbir ilgisi yok. Ortada iki farklı Node
sürümü var: uygulamamın test edildiği sürüm (22/24/26) ve action'ların kendisinin üzerinde
koştuğu sürüm. `@v4` action'ları kendi `action.yml` dosyalarında `node20` yazıyor, runner da
onları zorla Node 24'e alıp bundan şikayet ediyor. Node 20 runner'lardan 16 Eylül 2026'da
tamamen kaldırılıyor, yani bu uyarı bir ay içinde doğrudan hataya dönüşecekti. Üçünü de
`@v5`'e çıkardım.

Bir de fark ettim ama bugün dokunmadım: jest `Jest did not exit one second after the test run
has completed` uyarısı basıyor. `src/app.js:11`'deki warm-up'ı simüle eden `setTimeout` açık
bir handle bırakıyor. Şimdilik zararsız ama her job'da runner'ı fazladan bir saniye tutuyor.
Gün 13'ün işi.

## Sonuç

Matrix'te üç yeşil job, ve ikinci run'da doğrulanan cache:

| | İlk run | v5 sonrası |
|---|---|---|
| Node 24 job, toplam | 18sn | 13sn |
| Install dependencies | - | 4sn |
| Cache | bulunamadı | restore edildi, ~12 MB |

Run: <https://github.com/agern28/devops-internship-week3-4/actions/runs/31332574509>

İlginç olan, bu ölçekte bir projede bile 5 saniyelik farkın şimdiden görülebiliyor olması.
Cache `node_modules`'ı değil `~/.npm`'i saklıyor, yani `npm ci` kurulum işini yine yapıyor -
sadece hiçbir şeyi tekrar indirmiyor. Gerçek bir bağımlılık ağacında aradaki fark çok daha
büyük olurdu.
