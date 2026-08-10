# Gün 13 - Kalite kapıları: lint, coverage eşiği, SAST

## Hedef

Kötü kodun `main`'e ulaşmasını hatırlamaya bel bağlamadan, otomatik olarak engellemek. Üç
kapı: lint, coverage eşiği ve statik analiz - bir de kapıların gerçekten bağlayıcı olması için
branch protection.

## Yaptıklarım

**ESLint.** `.eslintrc.json` eklendi (eslint:recommended, `no-unused-vars` error,
`no-console` warning) ve `node_modules/` ile `coverage/` için `.eslintignore`. Üretilmiş rapor
dosyalarını lint'lemenin anlamı yok, sadece run'ı yavaşlatıyor. Önce kontrol ettim: ignore
dosyası olmadan da hata üretmiyor, yani bu bir arıza düzeltmesi değil hijyen meselesi.

**Dünkü açık handle'ı düzelttim.** `npm test`, `Jest did not exit one second after the test run
has completed` uyarısı basıyordu. Sebebi `src/app.js` içindeki modül seviyesindeki
`setTimeout`: warm-up'ı simüle ediyor ve testler bittikten sonra bile 2 saniyesi dolana kadar
event loop'u ayakta tutuyor. Timer'ı bir değişkende tutup `warmupTimer.unref()` çağırmak
Node'a "bunu çalışır kalma sebebi sayma" demek. Test süresi 8 saniyeden 1.5 saniyeye düştü.

**Eksik testleri yazdım.** Coverage %65.38'de takılıydı ve kapsanmayan satırların hepsi
`/ready` içindeydi - hiçbir test o endpoint'e dokunmuyordu. İki dalı da test etmek zor, çünkü
readiness ancak gerçek bir 2 saniyelik timer dolunca değişiyor ve testte 2 saniye beklemek
saçma. Sahte zamanlayıcı bunu çözüyor: dosyanın başında `jest.useFakeTimers()`, sonra iki
durum arasında `jest.advanceTimersByTime(2000)` ile warm-up'ın üstünden atlıyorsun.

Doğru olması gereken tek şey şu: `jest.useFakeTimers()` modülün `require`'ından **önce**
gelmek zorunda. Timer import anında kuruluyor, sonra çağırırsan çoktan kaçırmış olursun.

**Coverage eşiğini geri koydum** (80/70/80/80) ve `src/server.js`'i `collectCoverageFrom`
dışına aldım. O dosya sadece `app.listen()` çağırıyor, test edilecek bir mantık yok ve %0'ı
boş yere toplamı aşağı çekiyordu. Dürüst alternatif eşiği düşürmekti, ki bu kapıyı anlamsız
hale getirirdi. Bir entrypoint'i kapsam dışı bırakmak normal bir tercih; çıtayı indirip sorunu
gizlemek değil.

**Workflow.** `quality.yml` iki job içeriyor: lint + coverage, ve CodeQL. Eğitim paketindeki
`v3` yerine `github/codeql-action@v4` kullandım - v4 Node 24 üzerinde koşuyor ve v3 Aralık
2026'da deprecate edilecek, yani v3 ile başlamak neredeyse anında migrasyon demekti.

**Branch protection.** `main` üzerinde bir ruleset: pull request zorunlu, beş check zorunlu
(üç CI matrix leg'i, lint/coverage job'ı, CodeQL) ve bypass listesi boş.

## Takıldığım yer

**Ruleset sadece `main`'i değil bütün branch'leri hedefliyordu.** Feature branch'i push etmek
doğrudan reddedildi:

```
remote: error: GH013: Repository rule violations found for refs/heads/day13-break-the-gate
remote: - 5 of 5 required status checks are expected.
```

Güzel bir kilitlenme: kural beş geçmiş check istiyor, ama henüz var olmayan bir branch'te
check çalışamaz ve branch de kural yüzünden oluşturulamaz. Ruleset hedefini varsayılan branch
olarak ayarlayınca çözüldü. Ders kapsam hakkında - korumanın amacı `main`'e ne merge edildiğini
denetlemek, benim bir branch üzerinde çalışmamı engellemek değil.

**Aradığım ayar ruleset ekranında yok.** Klasik branch protection'da "Include administrators"
diye bir checkbox var. Ruleset'lerde bunun yerine sayfanın üstünde bir bypass listesi duruyor -
o listeyi boş bırakmak aynı işi görüyor. Bir de enforcement status'un `Evaluate` değil `Active`
olduğundan emin olmak gerekiyor; `Evaluate` ihlalleri sadece raporluyor, engellemiyor.

## Sonuç

Yerelde: 5 test, `app.js` dört metrikte de %100, açık handle uyarısı yok.

| | Gün 12 | Gün 13 |
|---|---|---|
| Test sayısı | 3 | 5 |
| Coverage (statements) | %65.38 | %100 |
| Coverage kapısı | yok | 80/70/80/80, zorunlu |
| Test süresi | ~8sn | ~1.5sn |

Sonra kapının çalıştığını kanıtladım. Kasten kullanılmayan bir değişken içeren branch, açılan
pull request, ve `Lint + Coverage gate` job'ı `no-unused-vars` ile düştü. Merge butonu grileşip
"Merging is blocked" yazdı. PR merge edilmeden kapatıldı, branch silindi.

O run'da dikkat çeken bir ayrıntı: quality job'ı düşerken üç CI job'ı yeşil kaldı. Lint sadece
`quality.yml` içinde var, dolayısıyla `ci.yml`'ın şikayet edeceği bir şey yoktu. İki workflow,
iki ayrı soru - "build oluyor ve testler geçiyor mu" ve "merge edilecek kadar iyi mi".
