# netcli — MCP network-CLI connector (prototype)

The **"just connect"** layer for the AI-native network platform. Give it a host
(IP or DNS name) from the topology map, and it logs in over SSH/telnet, runs
commands, and pulls state — one device or many, concurrently. Credentials come
from a **secrets store / vault**, never from the map or git.

This is the executable counterpart of two skills:
[`net-topology-map`](../skills/net-topology-map/SKILL.md) (the inventory it reads)
and [`net-login-and-baseline`](../skills/net-login-and-baseline/SKILL.md) (the
baseline command sets it runs).

## Try it now (offline, no network, no creds)

```bash
cd network-platform/connector
python3 selftest.py
```

The self-test runs entirely in **mock mode** against the AUS1 example inventory:
it filters devices, runs role-appropriate baselines for a router / switch /
firewall, does a concurrent baseline across the edge routers, and asserts the
credential guardrails. 13 checks, zero dependencies.

## Architecture

```
  topology map (net-topology-map)  ──►  inventory.py   (hosts, roles, os, mgmt IP, OOB)
                                             │
  vault / env  ──►  credentials.py  ─────────┤          (secret_ref -> username/password/key)
                                             ▼
                                         runner.py       (connect · run · run_on_many · baseline)
                                             │
                            ┌────────────────┴───────────────┐
                            ▼                                 ▼
                     transport.py                        server.py
              MockTransport (offline)              MCP tools: list_devices,
              ScrapliTransport (real SSH/telnet)   run_commands, run_many,
                                                   baseline_device, baseline_devices
```

- **`inventory.py`** — loads the topology map's `devices:` block; filter by
  `role`/`site`/`vendor`/`os`. Refuses to load a map that contains a literal
  credential (secrets belong in the vault).
- **`credentials.py`** — resolves a `secret_ref` pointer via a vault backend, or
  env vars for local/dev (`NETCLI_USERNAME` / `NETCLI_PASSWORD` / `NETCLI_SSH_KEY`,
  or per-host `NETCLI_<HOSTID>_*`). Unconfigured vault + no env creds → fails loudly.
- **`transport.py`** — `MockTransport` (offline) and `ScrapliTransport` (real,
  lazy-imports scrapli; SSH + telnet; maps `os` → Scrapli platform).
- **`baselines.py`** — role → baseline command set, transcribed from the
  `net-login-and-baseline` skill (Junos router/switch/firewall + a Cisco set).
- **`runner.py`** — orchestration, with `ThreadPoolExecutor` for connect-to-many.
- **`server.py`** — the MCP server exposing the tools.

## Run the MCP server (mock)

```bash
pip install -r requirements.txt
NETCLI_INVENTORY=examples/inventory.aus1.json NETCLI_MOCK=1 python -m netcli.server
```

MCP tools exposed: `list_devices`, `run_commands`, `run_many`, `baseline_device`,
`baseline_devices`.

## Going to real devices

1. Drop `NETCLI_MOCK` (or set it to `0`).
2. Wire a real vault backend: `CredentialResolver(vault=<obj with fetch(ref)->dict>)`
   in `server.py`, or export `NETCLI_USERNAME` / `NETCLI_PASSWORD` for a quick lab test.
3. `pip install scrapli scrapli-community` for device I/O.

## Configuration (env)

| Var | Purpose |
|-----|---------|
| `NETCLI_INVENTORY` | path to the topology-map file (JSON; YAML if PyYAML installed) |
| `NETCLI_MOCK` | `1` = offline mock transport (no network/creds) |
| `NETCLI_MAX_CONC` | max concurrent sessions for the `*_many` tools (default 10) |
| `NETCLI_USERNAME` / `NETCLI_PASSWORD` / `NETCLI_SSH_KEY` | dev/local credentials |
| `NETCLI_<HOSTID>_USERNAME` / `_PASSWORD` / `_KEY` | per-host overrides |

## Security posture

- Secrets never live in the inventory/map or in git — only `secret_ref` pointers do.
- The inventory loader actively **rejects** a map containing a literal password.
- The OOB/console path is **recorded** per device (for the change-safety lifeline)
  but never auto-connected.

## Status

Prototype. The mock path is proven end-to-end by `selftest.py`. The Scrapli path
is wired but untested against live gear (by design — no production access here).
Next: a real vault backend, structured parsing of captured output (NAPALM/Genie),
and the before/after **diff** that turns two baselines into a drift report.
