# AI-Native Network Engineering Platform

Borrowing the operating model of the [AI-Native SDLC](../README.md) and adapting it
to running live L1–L3 networks (service-provider / core). Start with the white
paper, then the skills model, then the runnable connector.

## What's here

| Path | What it is |
|------|------------|
| **[whitepaper.md](whitepaper.md)** | The thesis: *judgment up front, deterministic execution behind*, adapted for networking. The intended-state graph, the design/change/incident spec layer, the twin-gated execution engine, and the crawl→walk→run autonomy wedge. |
| **[skills-model.md](skills-model.md)** | Models the senior network engineer *and* software engineer side-by-side (what transfers from the SDLC, what's unique to infra). Defines the domain **skill-agents** by OSI layer (L1/L2/L3) plus cross-cutting craft, each as scope / competencies / verify-signals / red-flags. |
| **[skills/net-topology-map/](skills/net-topology-map/SKILL.md)** | **Onboarding (one-time):** ingest the network's diagrams (Visio/PDF/images) into a structured topology map — the seed of the intended-state graph, and the connector's inventory. |
| **[skills/net-login-and-baseline/](skills/net-login-and-baseline/SKILL.md)** | **Every session:** login (SSH/telnet by IP/hostname) → a seven-category baseline with role-specific command sets (router / switch / firewall, grounded in the AUS1 Junos MOP) → before/after/diff discipline. |
| **[connector/](connector/README.md)** | **`netcli`** — a runnable MCP connector. Map → inventory → "just connect" (one device or many), credentials from a vault, baselines wired from the skill. `python3 connector/selftest.py` proves it offline (13 checks). |

## Reading order

1. `whitepaper.md` — the why and the shape.
2. `skills-model.md` — the skill-agent catalog.
3. `skills/net-topology-map` → `skills/net-login-and-baseline` — the onboarding-then-every-session pair.
4. `connector/` — the executable that runs the above.

## Status

Early build, actively shaping. The connector's mock path is proven end-to-end;
next up is structured parsing + the baseline **diff** (drift report), a real vault
backend, and ingesting real network diagrams into the topology map.
