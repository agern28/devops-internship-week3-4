# Gün 18 - Helm chart: templating, values, release

## Hedef

Gün 16 ve 17'de yapılan her şeyi paketlemek: uygulama tek komutla kurulsun ve parametreleri beş
ayrı manifest'e dağılmak yerine tek dosyada yaşasın.

## Yaptıklarım

`helm create` yerine eğitim paketindeki chart'tan başladım - üretilen boilerplate'in büyük
kısmı bu uygulamanın kullanmadığı şeyler (service account, autoscaling davranış blokları, test
hook'ları). Paketteki chart'ta şablonlar zaten vardı; iş, içindeki dört şeyi düzeltmekti.

**Yer tutucular.** `values.yaml`, `ghcr.io/your-org/devops-training-app:latest` adresini
gösteriyordu. Gerçek repoya çevirdim ve etiketi `1.0.0`'a sabitledim - Gün 16'daki gerekçenin
aynısı: `latest` kayan bir etiket ve `IfNotPresent` ile birleşince bir node süresiz olarak eski
bir image servis edebiliyor.

**`config` içinden `APP_VERSION` çıkarıldı.** Gün 17'deki düzeltmenin aynısı. Sürümü ayarlayan
bir ConfigMap, image'ın raporladığını eziyor; yani `helm upgrade --set image.tag=1.1.0` yeni bir
image deploy edip yine 1.0.0 diyen bir uygulama üretirdi.

**Commit'lenmiş secret boşaltıldı.** Chart varsayılan olarak `API_KEY: "changeme-demo-key"`
taşıyordu, yani ezmeyi unutursan sahte bir anahtarla sessizce kuruluyordu. Varsayılanı boş
dizeye çevirdim ve şablondaki değeri `required` ile sardım:

```
API_KEY: {{ required "secret.API_KEY must be provided, e.g. --set secret.API_KEY=..." .Values.secret.API_KEY | quote }}
```

Artık secret verilmezse `helm template` doğrudan hata veriyor. Gürültülü bir hata, sessiz bir
yanlış değerden iyidir.

**Autoscaling kapatıldı.** Chart varsayılan olarak `autoscaling.enabled: true` diyor, yani bugün
bir HPA oluşturacaktı. metrics-server henüz kurulu değil, dolayısıyla hedefleri `<unknown>`
gösterip duracaktı ve Gün 19'un malzemesini bir gün erken debug ediyor olacaktım. Probe'lar ve
limitler de aynı sebeple deployment şablonundan çıkarıldı.

**`fullname` helper'ı eklendi.** Chart her kaynağı `.Chart.Name` ile isimlendiriyordu, yani
release adı tamamen yok sayılıyordu ve aynı chart'ın iki release'i tek namespace'te çakışırdı.
Kaynak isimlerini `.Release.Name`'i de içeren standart kalıba çevirdim. Release adı `myapp`
olduğu için render edilen isimler öncekiyle birebir aynı çıkıyor, yani hiçbir şey bozulmadı -
ama artık ikinci bir release gerçekten çalışır.

**Kurulumdan önce ham manifest'ler silindi.** Chart `myapp` adında Deployment ve Service
üretiyor, Gün 16/17'nin manifest'leri de öyle. Helm kendi oluşturmadığı kaynakları sahiplenmeyi
reddediyor, yani kurulum ownership hatasıyla düşerdi. Namespace hariç içindeki her şeyi
sildim, sonra kurdum.

## Takıldığım yer

**`helm upgrade` ConfigMap'i değiştirdi ve hiçbir şey olmadı.** `LOG_LEVEL`'ı `debug`'dan
`info`'ya çevirdim, upgrade başarılı dedi, `kubectl rollout status` "successfully rolled out"
dedi - ve uygulama hâlâ `debug` yanıtı veriyordu.

```
$ kubectl get configmap myapp-config -n app -o jsonpath='{.data.LOG_LEVEL}'
info
$ kubectl exec -n app deploy/myapp -- sh -c 'echo $LOG_LEVEL'
debug
```

ConfigMap gerçekten değişmişti. Pod'lar değişmemişti. Ortam değişkenleri container başlarken
okunuyor ve ConfigMap güncellemek hiçbir şeyi yeniden başlatmıyor - Deployment'ın pod şablonu
öncesi ve sonrasında bayt bayt aynıydı, yani Kubernetes'in bir şey döndürmek için sebebi yoktu.
Rollout anında "başarılı" oldu çünkü döndürecek bir şey yoktu.

Standart çözüm, config'i pod şablonuna hash'lemek; böylece içerik değişikliği bir şablon
değişikliğine dönüşüyor:

```yaml
annotations:
  checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
  checksum/secret: {{ include (print $.Template.BasePath "/secret.yaml") . | sha256sum }}
```

Bundan sonra upgrade pod'ları gerçekten teker teker döndürdü, bir rolling update'in görünmesi
gerektiği gibi.

**Sonra bir kez daha `debug` yanıtı geldi.** Bu sefer pod'lar gerçekten değişmişti. Beni yakalayan
şey şu: `kubectl rollout status` Deployment tatmin olur olmaz dönüyor, ama eski pod hâlâ
sonlanıyor ve ingress-nginx upstream listesini henüz yenilememiş oluyor. `curl`'üm çıkış
yolundaki pod'a düştü. Birkaç saniye sonra her şey `info` raporluyordu.

Mevcut kurulumda cluster'a bir pod'un ne zaman servise hazır ya da ne zaman servisi bitirmiş
olduğunu söyleyen hiçbir şey yok - Service, pod `Running` olur olmaz onu endpoint'lerine
ekliyor, warm-up bitmiş mi bitmemiş mi umursamadan. Readiness probe tam olarak bunun için var,
ve orası Gün 19.

## Sonuç

Kurulum, yükseltme ve geri alma; her biri tek komut:

```
$ helm history myapp -n app
REVISION  UPDATED                   STATUS      CHART        APP VERSION  DESCRIPTION
1         Wed Aug 12 09:34:15 2026  superseded  myapp-0.1.0  1.0.0        Install complete
2         Wed Aug 12 09:35:02 2026  superseded  myapp-0.1.0  1.0.0        Upgrade complete
3         Wed Aug 12 09:36:41 2026  superseded  myapp-0.1.0  1.0.0        Upgrade complete
4         Wed Aug 12 09:39:22 2026  deployed    myapp-0.1.0  1.0.0        Rollback to 1
```

Geri almanın kendisi bir silme değil, yeni bir revizyon - revizyon 4 "Rollback to 1" ve 1'den
3'e kadar olanlar hâlâ duruyor. Bu, Gün 11'deki rollback planı için önemli: `helm rollback`
image'ı ve config'i birlikte geri alıyor, geçmiş de ne zaman neyin deploy edildiğinin kaydı
oluyor.

Elle uygulanan beş manifest, `helm install myapp ./helm/myapp -n app --set secret.API_KEY=...`
komutuna dönüştü ve bir parametreyi değiştirmek artık YAML düzenleyip hangi dosyanın hangisine
bağlı olduğunu hatırlamak yerine `--set` demek.
