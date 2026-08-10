[Türkçe](README.tr.md)

# devops-internship-week3-4

Weeks 3 and 4 of the DevOps program I was given during my internship: CI/CD pipelines first,
then Kubernetes fundamentals. Both weeks are built around one small Node.js/Express service,
which gets carried through the whole chain - built and tested in CI, packaged as a container
image, pushed to a registry, and finally deployed to a local cluster with Helm.

Weeks 1 and 2 (Git, Linux, Docker) are in a separate repo:
[agern28/devops-internship](https://github.com/agern28/devops-internship).

Every day has its own notes, in English and Turkish. They are working notes rather than
tutorials - what I did, what broke, and what I ended up with.

## Progress

| Day | Topic | Status | Notes |
|-----|-------|--------|-------|
| 11 | Pipeline design | Done | [EN](docs/week3/day11-pipeline-design.md) / [TR](docs/week3/day11-pipeline-design.tr.md) |
| 12 | GitHub Actions: workflows, matrix builds, caching | Done | [EN](docs/week3/day12-github-actions.md) / [TR](docs/week3/day12-github-actions.tr.md) |
| 13 | Quality gates: lint, coverage, CodeQL | Done | [EN](docs/week3/day13-quality-gates.md) / [TR](docs/week3/day13-quality-gates.tr.md) |
| 14 | Build, push to GHCR, semantic versioning, releases | Done | [EN](docs/week3/day14-release-pipeline.md) / [TR](docs/week3/day14-release-pipeline.tr.md) |
| 15 | Jenkins / GitLab CI comparison (optional) | Not started | - |
| 16 | Kubernetes basics: pods, deployments, services | Not started | - |
| 17 | ConfigMaps, Secrets, Ingress, namespaces | Not started | - |
| 18 | Helm charts | Not started | - |
| 19 | Probes, resource limits, autoscaling | Not started | - |
| 20 | Mid-program review and demo | Not started | - |

## Layout

```
.
├── docs/
│   ├── week3/          CI/CD notes, days 11-15
│   └── week4/          Kubernetes notes, days 16-20
├── src/                the sample service (added on day 12)
├── test/
├── .github/workflows/  CI, quality gates, release (days 12-14)
├── k8s/                raw manifests (days 16-19)
└── helm/               chart (day 18)
```

Only the docs exist right now. The application and everything around it lands day by day,
in the order above, so the commit history lines up with the program itself.
