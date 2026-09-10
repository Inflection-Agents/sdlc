# init-payload

Files copied into an **adopting repo** by `/sdlc:init`. They are not loaded by Claude
in this repository — this directory is a payload, not a working tree.

## Why these live here and not in the plugin proper

A plugin cannot seed repo directories, and a GitHub Actions runner checks out the
repo rather than the plugin cache. So anything CI must read, and anything an adopter
edits, has to be physically copied into their repo:

| | Why it is copied, not shipped |
| --- | --- |
| `scripts/sdlc/*.mjs` | CI runs `node scripts/sdlc/…` against the repo checkout. They also derive `REPO_ROOT` from their own location with no env escape, so they must sit in the repo they grade. |
| `.github/workflows/*.yml` | Plugins cannot ship workflows, and the runner could not read them from a cache. |
| `templates/*.md` | Copy-and-fill artifacts the adopter edits. |
| `.ignore` | Repo-root ripgrep fence for archived specs. |
| `sdlc-state-machine.yaml` | The phase spine is universal; `domain_routing` is the adopter's. |
| `.ai/sdlc/review-constraints.stub.yaml` | The adopter's own laws. Ships empty; `/sdlc:init` fills it. |

Everything an adopter never edits — skills, agents, hooks, `review-primitives.md`,
the envelope schema — ships in the plugin and updates automatically.
