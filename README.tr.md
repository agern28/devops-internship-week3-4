[English](README.md)

# devops-internship-week3-4

Stajda bana verilen DevOps programının 3. ve 4. haftası: önce CI/CD pipeline'ları, sonra
Kubernetes temelleri. İki hafta da tek bir küçük Node.js/Express servisi üzerinden ilerliyor.
Aynı uygulama zincirin tamamını dolaşıyor: CI'da build edilip test ediliyor, container image
olarak paketleniyor, registry'ye push ediliyor ve en sonunda Helm ile yerel bir cluster'a
deploy ediliyor.

1. ve 2. haftalar (Git, Linux, Docker) ayrı bir repoda:
[agern28/devops-internship](https://github.com/agern28/devops-internship).

Her günün kendi notu var, Türkçe ve İngilizce. Bunlar öğretici metinler değil, çalışırken
tuttuğum notlar: ne yaptım, nerede takıldım, elimde ne kaldı.

## Durum

| Gün | Konu | Durum | Not |
|-----|------|-------|-----|
| 11 | Pipeline tasarımı | Tamam | [TR](docs/week3/day11-pipeline-design.tr.md) / [EN](docs/week3/day11-pipeline-design.md) |
| 12 | GitHub Actions: workflow, matrix build, cache | Tamam | [TR](docs/week3/day12-github-actions.tr.md) / [EN](docs/week3/day12-github-actions.md) |
| 13 | Kalite kapıları: lint, coverage, CodeQL | Tamam | [TR](docs/week3/day13-quality-gates.tr.md) / [EN](docs/week3/day13-quality-gates.md) |
| 14 | Build, GHCR push, semantic versioning, release | Tamam | [TR](docs/week3/day14-release-pipeline.tr.md) / [EN](docs/week3/day14-release-pipeline.md) |
| 15 | Jenkins / GitLab CI karşılaştırması (opsiyonel) | Tamam | [TR](docs/week3/day15-jenkins-comparison.tr.md) / [EN](docs/week3/day15-jenkins-comparison.md) |
| 16 | Kubernetes temelleri: pod, deployment, service | Tamam | [TR](docs/week4/day16-kubernetes-basics.tr.md) / [EN](docs/week4/day16-kubernetes-basics.md) |
| 17 | ConfigMap, Secret, Ingress, namespace | Tamam | [TR](docs/week4/day17-config-secrets-ingress.tr.md) / [EN](docs/week4/day17-config-secrets-ingress.md) |
| 18 | Helm chart | Tamam | [TR](docs/week4/day18-helm-chart.tr.md) / [EN](docs/week4/day18-helm-chart.md) |
| 19 | Probe, resource limit, autoscaling | Tamam | [TR](docs/week4/day19-probes-hpa.tr.md) / [EN](docs/week4/day19-probes-hpa.md) |
| 20 | Ara değerlendirme ve demo | Başlanmadı | - |

## Yapı

```
.
├── docs/
│   ├── week3/          CI/CD notları, Gün 11-15
│   └── week4/          Kubernetes notları, Gün 16-20
├── src/                örnek servis (Gün 12'de ekleniyor)
├── test/
├── .github/workflows/  CI, kalite kapıları, release (Gün 12-14)
├── k8s/                ham manifest'ler (Gün 16-19)
└── helm/               chart (Gün 18)
```

Şu an sadece dokümanlar var. Uygulama ve çevresindeki her şey yukarıdaki sırayla, gün gün
ekleniyor; böylece commit geçmişi programın kendisiyle örtüşüyor.
