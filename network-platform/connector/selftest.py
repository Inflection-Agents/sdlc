#!/usr/bin/env python3
"""Offline self-test — proves the connector end-to-end with zero network access.

Runs in MOCK mode against the AUS1 example inventory:
  * loads the topology-map inventory
  * filters by role (connect-to-many)
  * baselines a router, a switch, and a firewall (role-appropriate command sets)
  * runs a concurrent baseline across all AUS1 edge routers
  * asserts the credential guardrails (no secrets in the map; vault required for real runs)

Run:  python3 selftest.py
"""

from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from netcli import inventory as inv_mod          # noqa: E402
from netcli.credentials import CredentialResolver, CredentialError  # noqa: E402
from netcli.inventory import InventoryError, from_mapping           # noqa: E402
from netcli.baselines import baseline_commands    # noqa: E402
from netcli.runner import baseline, baseline_many, run_on_many      # noqa: E402

FAILS = []


def check(name, cond):
    status = "ok  " if cond else "FAIL"
    print(f"  [{status}] {name}")
    if not cond:
        FAILS.append(name)


def main() -> int:
    inv_path = os.path.join(HERE, "examples", "inventory.aus1.json")
    inv = inv_mod.load(inv_path)
    resolver = CredentialResolver()  # no vault wired -> real runs would fail loudly (by design)

    print(f"\nLoaded inventory: network={inv.network} devices={len(inv)}")

    print("\n1. Inventory filtering (connect-to-many targeting):")
    edges = inv.filter(role="edge-router", site="AUS1")
    check("2 edge routers at AUS1", len(edges) == 2)
    check("filter by vendor juniper returns all 7", len(inv.filter(vendor="juniper")) == 7)

    print("\n2. Role-appropriate baseline sets:")
    er = baseline(inv, resolver, "ER1.AUS1", mock=True)
    check("ER1 baseline ran ok", er.ok)
    check("router set includes 'show bgp summary'",
          any("show bgp summary" == r.command for r in er.results))
    fw = baseline(inv, resolver, "FW1.AUS1", mock=True)
    check("firewall set includes cluster status",
          any("show chassis cluster status" == r.command for r in fw.results))
    check("firewall set includes flow session summary",
          any("show security flow session summary" == r.command for r in fw.results))
    sw = baseline(inv, resolver, "CSW1.AUS1", mock=True)
    check("switch set includes ethernet-switching table",
          any("show ethernet-switching table" == r.command for r in sw.results))
    check("router set differs from switch set",
          baseline_commands("junos", "edge-router") != baseline_commands("junos", "switch"))

    print("\n3. Connect-to-many (concurrent baseline across AUS1 edge routers):")
    many = baseline_many(inv, resolver, edges, mock=True)
    check("both edge routers baselined", len(many) == 2 and all(s.ok for s in many))
    check("results stable-sorted by id", [s.device_id for s in many] == ["ER1.AUS1", "ER2.AUS1"])

    rm = run_on_many(inv, resolver, inv.filter(role="switch"), ["show version"], mock=True)
    check("run_on_many across switches", len(rm) == 2 and all(s.ok for s in rm))

    print("\n4. Security guardrails:")
    try:
        from_mapping({"network": "x", "devices": [
            {"id": "BAD", "role": "router", "os": "junos", "password": "hunter2"}]})
        check("map with literal password rejected", False)
    except InventoryError:
        check("map with literal password rejected", True)

    try:
        # real (non-mock) resolve with no vault + no env creds must fail loudly
        os.environ.pop("NETCLI_USERNAME", None)
        resolver.resolve(device_id="ER1.AUS1", secret_ref="vault://net/aus1#edge")
        check("secret_ref without a wired vault fails loudly", False)
    except CredentialError:
        check("secret_ref without a wired vault fails loudly", True)

    print("\n5. Sample mock capture (first 3 lines of ER1 config command):")
    first = er.results[0]
    for line in first.output.strip().splitlines()[:3]:
        print("     " + line)

    print()
    if FAILS:
        print(f"SELFTEST FAILED: {len(FAILS)} check(s) failed: {FAILS}")
        return 1
    print("SELFTEST PASSED — connector shape proven end-to-end (offline mock).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
