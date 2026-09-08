#!/usr/bin/env python3
"""Offline test for the baseline diff — proves signal-vs-noise separation.

Builds a realistic before/after pair for one Junos edge router with:
  * a config change (one BGP neighbor swapped)            -> NOTABLE, exact set-lines
  * a BGP peer down (established 5->4, down peers 0->1)    -> ALERT
  * an OSPF route-count drop (142 -> 118)                  -> NOTABLE
  * a new chassis alarm                                    -> ALERT
  * a code version change (upgrade)                        -> ALERT
  * uptime + timestamp ticking (pure volatile noise)       -> OK (suppressed)

Run:  python3 difftest.py
"""

from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from netcli.diff import ALERT, NOTABLE, OK, diff_sessions, render_text  # noqa: E402

FAILS = []


def check(name, cond):
    print(f"  [{'ok  ' if cond else 'FAIL'}] {name}")
    if not cond:
        FAILS.append(name)


def cap(results: dict) -> dict:
    return {"device_id": "ER1.AUS1", "host": "50.115.88.41", "ok": True, "error": None,
            "results": [{"command": c, "output": o, "took_ms": 1, "error": None}
                        for c, o in results.items()]}


BEFORE = cap({
    "show configuration | display set": (
        "set system host-name ER1\n"
        "set protocols bgp group LUMEN neighbor 130.250.2.146\n"
        "set protocols ospf area 0.0.0.0 interface ae99.0\n"
    ),
    "show bgp summary": (
        "Groups: 3 Peers: 5 Down peers: 0\n"
        "Peer          AS      InPkt OutPkt  Last Up/Dwn State\n"
        "130.250.2.146 65001   10    9       3d 04:05:12 Establ\n"
        "130.250.2.242 65002   11    8       3d 04:05:10 Establ\n"
        "130.250.38.146 65003  12    7       3d 04:05:09 Establ\n"
        "130.250.38.230 65004  13    6       3d 04:05:08 Establ\n"
        "65.56.106.29  65005   14    5       3d 04:05:07 Establ\n"
    ),
    "show route protocol ospf | count": "Count: 142 lines\n",
    "show chassis alarms": "No alarms currently active\n",
    "show version invoke-on all-routing-engines": (
        "Hostname: ER1\nModel: mx304\nJunos: 21.4R3-S10.13\n"
    ),
    "show system uptime": (
        "Current time: 2025-09-07 10:00:00 UTC\n"
        "System booted: 2025-07-28 06:00:00 UTC\n"
        "up 40 days, 3 hours\n"
    ),
})

AFTER = cap({
    "show configuration | display set": (
        "set system host-name ER1\n"
        "set protocols ospf area 0.0.0.0 interface ae99.0\n"
        "set protocols bgp group UNITAS neighbor 65.56.106.29\n"   # swapped neighbor
    ),
    "show bgp summary": (
        "Groups: 3 Peers: 5 Down peers: 1\n"
        "Peer          AS      InPkt OutPkt  Last Up/Dwn State\n"
        "130.250.2.146 65001   20    19      0:00:45 Active\n"       # this peer down now
        "130.250.2.242 65002   21    18      3d 05:10:10 Establ\n"
        "130.250.38.146 65003  22    17      3d 05:10:09 Establ\n"
        "130.250.38.230 65004  23    16      3d 05:10:08 Establ\n"
        "65.56.106.29  65005   24    15      3d 05:10:07 Establ\n"
    ),
    "show route protocol ospf | count": "Count: 118 lines\n",
    "show chassis alarms": (
        "Alarm time               Class  Description\n"
        "2025-09-08 11:00:00 UTC  Major  FPC 1 offline\n"
    ),
    "show version invoke-on all-routing-engines": (
        "Hostname: ER1\nModel: mx304\nJunos: 23.4R2-S3.9\n"          # upgraded
    ),
    "show system uptime": (
        "Current time: 2025-09-08 11:00:00 UTC\n"                    # ticked
        "System booted: 2025-07-28 06:00:00 UTC\n"
        "up 41 days, 4 hours\n"                                      # ticked
    ),
})


def sev_of(cap_diff, needle):
    for c in cap_diff.commands:
        if needle in c.command:
            return c
    return None


def main() -> int:
    d = diff_sessions(BEFORE, AFTER)

    print("\nPer-command classification:")
    cfg = sev_of(d, "display set")
    check("config change -> NOTABLE", cfg.severity == NOTABLE)
    check("config diff shows the ADDED UNITAS neighbor",
          any("UNITAS neighbor 65.56.106.29" in a for a in cfg.added))
    check("config diff shows the REMOVED LUMEN neighbor",
          any("LUMEN neighbor 130.250.2.146" in r for r in cfg.removed))

    bgp = sev_of(d, "show bgp summary")
    check("BGP peer down -> ALERT", bgp.severity == ALERT)
    check("BGP summary names the established drop",
          any("established" in s.lower() and "4" in s for s in bgp.summary))

    rc = sev_of(d, "| count")
    check("route-count drop 142->118 -> NOTABLE", rc.severity == NOTABLE)

    al = sev_of(d, "chassis alarms")
    check("new alarm -> ALERT", al.severity == ALERT)

    ver = sev_of(d, "show version")
    check("version change -> ALERT", ver.severity == ALERT)

    up = sev_of(d, "system uptime")
    check("uptime/timestamp ticking -> OK (noise suppressed)", up.severity == OK)

    check("overall capture severity -> ALERT", d.severity == ALERT)

    print("\nRendered drift report (alerts + notables only):\n")
    print(render_text(d))

    print()
    if FAILS:
        print(f"DIFFTEST FAILED: {FAILS}")
        return 1
    print("DIFFTEST PASSED — material change surfaced, volatile noise suppressed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
