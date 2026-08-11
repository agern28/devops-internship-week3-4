# Day 15 - Jenkins and GitLab CI compared to GitHub Actions

Optional day. I did not stand up a Jenkins controller - the goal was to understand how
portable the concepts are, and writing the equivalent pipeline is enough to find that out.
The `Jenkinsfile` in the repo root is the same pipeline as days 12 to 14, expressed in
Declarative Pipeline syntax.

## Execution models

The biggest difference is not syntax, it is who owns the machine that runs the job.

**GitHub Actions** hands you an ephemeral virtual machine per job. It is created, runs the
steps, and is destroyed. Nothing persists between jobs unless it is explicitly cached or
uploaded as an artifact. I never had to think about where the build ran or what was left
behind - which is exactly why days 12 to 14 involved zero infrastructure work.

**Jenkins** is a long-lived controller with agents attached to it. Somebody installs it, keeps
it patched, manages plugins, and cleans up disk space. The agent is usually not ephemeral, so
state leaks between builds unless you use containerised agents. In exchange you can run it on
your own hardware, inside a private network, with no external dependency at all.

**GitLab CI** sits close to Actions: YAML config in the repository, runners execute jobs. The
difference is that runners can be self-hosted and shared across the instance, so it lands
somewhere between the two.

## Concept mapping

| Concept | GitHub Actions | Jenkins (Declarative) | GitLab CI |
|---|---|---|---|
| Config file | `.github/workflows/*.yml` | `Jenkinsfile` (Groovy) | `.gitlab-ci.yml` |
| Top-level unit | workflow | pipeline | pipeline |
| Grouping | job | stage | stage |
| Unit of work | step | step | job |
| Execution target | `runs-on` (runner) | `agent` | `tags` (runner) |
| Trigger | `on:` | `triggers` / `when` | `rules` / `only` |
| Tag-only run | `on: push: tags:` | `when { buildingTag() }` | `rules: if: $CI_COMMIT_TAG` |
| Reusable logic | `uses:` (action) | plugin / shared library | `include:` / template |
| Artifacts | `actions/upload-artifact` | `archiveArtifacts` | `artifacts:` |
| Secrets | `secrets.*` | `withCredentials` | CI/CD variables (masked) |
| Multi-version runs | `strategy.matrix` | `matrix` directive | `parallel: matrix` |
| Dependency cache | `cache:` in setup-node | plugin or manual | `cache:` |

The mapping is tight enough that translating a pipeline is mostly mechanical. Everything I
built has a direct equivalent.

## What the translation actually costs

Writing the Jenkinsfile made the hidden conveniences of Actions visible.

**Credentials stop being free.** In `release.yml` the registry login uses
`secrets.GITHUB_TOKEN`, which GitHub creates per run, scopes with the `permissions:` block, and
throws away afterwards. Jenkins has no equivalent - I had to reference a
`credentialsId: 'ghcr-credentials'` that somebody has to create by hand in Jenkins and rotate
by hand later. That is a long-lived credential where there used to be none.

**Version metadata becomes my problem.** `docker/metadata-action` turned the tag `v1.0.0` into
`1.0.0`, `1.0`, `1` and `latest` for free. Jenkins has no such thing, so the Jenkinsfile falls
back to `${TAG_NAME}` and `${BUILD_NUMBER}` - and if I wanted the full semver ladder I would be
writing shell to split the version string myself.

**No registry included.** GHCR came with the repository. On Jenkins I would need a registry
somewhere and credentials for it.

**Nothing is missing on the Jenkins side either.** It has the things Actions lacks - a real
plugin ecosystem, agents on hardware I control, and pipelines that can talk to a cluster on the
same private network. That last one matters here: the deploy step in `release.yml` is a
placeholder precisely because a GitHub-hosted runner cannot reach my minikube. A Jenkins agent
running on the same machine could execute `helm upgrade` for real.

## Trade-offs

Actions is the right default when the code is already on GitHub and there is no infrastructure
team. Zero maintenance, integrated permissions, free for public repositories. The cost is
vendor lock-in - the workflow files are not portable, and the concepts are only portable
because I now understand what they map to.

Jenkins is the answer when builds must run inside a network I control, when the toolchain needs
plugins nothing else has, or when the deployment target is unreachable from the public
internet. The cost is that somebody maintains it.

GitLab CI is the closest thing to a middle ground, and the migration cost from Actions is the
lowest of the three.

## Done when

I can take the day 14 pipeline and express it in either system. The Jenkinsfile in this repo is
that exercise; the mapping table above is how I would do the same for GitLab.
