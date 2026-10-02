# init-payload

Files `/sdlc-init` and `bootstrap.sh` copy into an **adopting repo**. They are not loaded by
Claude in this repository; this directory is a payload, not a working tree. Its layout mirrors
an adopter's tree on layout 2 (ADR-008), so init copies it into the repo root without
renaming anything except the `*.stub.*` files.

## Why these live here and not in the plugin proper

A plugin cannot seed repo directories, and a GitHub Actions runner checks out the repo rather
than the plugin cache. So anything CI must read, and anything an adopter edits, is physically
copied into the repo:

| | Why it is copied, not shipped |
| --- | --- |
| `.sdlc/scripts/` | CI runs `node .sdlc/scripts/…` against the repo checkout. Each script takes `--root` and resolves paths through `lib/sdlc-paths.mjs`. SPEC-010 serves them from the plugin instead. |
| `.sdlc/templates/` | Copy-and-fill artifacts. |
| `.sdlc/contracts/` | The review primitives and envelope schema the gate grades against. |
| `.sdlc/state-machine.yaml` | The phase spine. Framework-owned: every `/sdlc-sync` replaces it, because the adopter's own data lives in `config.yaml`. |
| `.sdlc/config.stub.yaml` | Becomes `.sdlc/config.yaml`: workspaces, `domain_routing`, `extensions`, `scan.allow`. The adopter's own. |
| `.sdlc/review-constraints.stub.yaml` | Becomes `.sdlc/review-constraints.yaml`: the adopter's own laws. Ships empty. `/sdlc-init` fills it. |
| `AGENTS.sdlc-block.md` | The project-context block init inserts into root `AGENTS.md`, between `<!-- BEGIN SDLC -->` and `<!-- END SDLC -->`. |
| `.github/workflows/*.yml` | Plugins cannot ship workflows, and the runner could not read them from a cache. |
| `.ignore`, `.gitignore`, `.gitattributes` | Root files. When the repo already has one, init appends these lines to it instead of copying. |

Everything an adopter never edits and CI never reads (skills, agents, hooks) ships in the
plugin and updates automatically.
