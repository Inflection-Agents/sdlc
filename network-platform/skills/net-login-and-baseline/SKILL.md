---
name: net-login-and-baseline
description: Use when logging into any network device (router, switch, or firewall) to capture a baseline — the first step of both configuration and troubleshooting. Covers SSH/telnet by IP or hostname from the terminal, disabling the pager, starting a session capture, then the role-appropriate show-command baseline, with capture-before / capture-after / diff discipline. Grounded in the AUS1 Junos MOP; multi-vendor mapping included.
---

# Login & Baseline

## Overview

**The two things a network engineer always does first: log in, and get a baseline.** Before any change, before any troubleshooting — you SSH (or telnet) to the device by IP or hostname, and you capture the current state. The baseline is the ground truth you configure *from* and troubleshoot *against*. It is also the thing you diff after a change to prove nothing broke.

This is a **read-only** skill — it never changes the device. That makes it the safest possible first agent (zero blast radius) and the foundation of the platform's drift-detection wedge.

**Announce at start:** "Logging in and capturing a baseline — read-only, nothing changes on the device."

A baseline serves two jobs at once:

- **For configuration:** a *capture-before* to know the starting state, and a *capture-after* to prove the change did only what was intended (diff the two).
- **For troubleshooting:** a snapshot of "what is the device doing right now" across every layer, so you reason from evidence instead of memory.

> **Iron law (from the domain meta-skills):** a baseline is worthless if you only read "up." Capture *counts and values* (route counts, session states, error counters, light levels) so the after-diff is numeric and adversarial — not "looks fine."

---

## Step 1 — Login

The mechanics, in order:

1. **Target.** Get the device address — an **IP** or a **DNS name / hostname** (e.g. `ER1.AUS1`, `50.115.88.41`). Know the **management path** you're using and whether an **out-of-band (console) path** exists — you never want to be one fat-fingered ACL away from losing the box.
2. **Transport.** **SSH** by default; **telnet** only where the gear/mgmt network forces it (legacy, OOB terminal servers). Console/OOB is the lifeline for anything that risks the mgmt path.
3. **Start a session capture.** In SecureCRT: *Log Session* to a timestamped file. **This is the baseline artifact** — the whole point of `| no-more` (below) is so the pager never truncates the capture. Name it `HOSTNAME_baseline_before_YYYYMMDD.txt`.
4. **Reach operational mode & kill the pager.** You want output to stream in full so the capture is complete.

| | Junos | Cisco IOS / NX-OS | Cisco IOS-XR |
|---|-------|-------------------|--------------|
| Prompt after login | operational mode `>` | user EXEC `>` → `enable` → `#` | EXEC `#` |
| Disable pager (whole session) | `set cli screen-length 0` <br>`set cli screen-width 0` | `terminal length 0` | `terminal length 0` |
| Disable pager (per command) | `... \| no-more` | `... \| no-more` (NX-OS) | `... \| no-more` |

The AUS1 MOP uses the **per-command `| no-more`** form on every line — safest for a clean capture. `| count` appends a numeric total (route counts), which is exactly what makes the after-diff numeric.

---

## Step 2 — The baseline category model (vendor-neutral)

Every good baseline — router, switch, or firewall — captures these **seven categories**. Memorize the categories, not the commands; the commands are the per-vendor, per-role instantiation.

| # | Category | What it proves | Why it's in the baseline |
|---|----------|----------------|--------------------------|
| 1 | **Configuration** | The intended state, in diffable form | The reference you configure from and roll back to |
| 2 | **Control plane — routing & HA** | Neighbors/adjacencies up, route counts, redundancy roles | The #1 thing a change or fault disturbs; counts make the diff numeric |
| 3 | **Data plane — interfaces & traffic** | Link state, counters, ARP/MAC, traffic levels | Where L1/L2 faults and traffic shifts show up |
| 4 | **Hardware & environment** | Chassis, power, fans, temp, FPC/fabric, alarms | Catch a pre-existing hardware problem *before* you touch config |
| 5 | **Software, version & license** | Code/firmware per RE, licenses | Know exactly what you're changing from; licenses survive upgrades |
| 6 | **System health, time & logs** | Uptime, storage, processes, NTP sync, boot/log messages | Silent problems (clock skew, full disk, crashes) surface here |
| 7 | **Reachability witness** | Continuous external ping set (e.g. PingInfoView) | The live, independent "is service up" signal across the whole change |

**The discipline:** run the full role set on login (*before*), keep the witness pings running throughout, then run the **same set** after each step and **diff**. `| count` deltas and neighbor-state changes are the tells.

---

## Step 3 — Role baseline sets (Junos — grounded in the AUS1 MOP)

Three roles: **Routers**, **Switches**, **Firewalls**. Commands organized by the seven categories. `| no-more` assumed on every line (omitted for readability); add `| count` where a numeric baseline helps.

### Routers — edge/core, dual-RE, BGP + OSPF (from `ER1/ER2.AUS1`)

```
# 1. Configuration
show configuration | display set

# 2. Control plane — BGP
show bgp summary
show bgp neighbor
show route advertising-protocol bgp <each-eBGP-peer-ip>
show route receive-protocol bgp <each-eBGP-peer-ip>
# Control plane — OSPF
show ospf neighbor
show ospf interface
show ospf database
# Control plane — routes (value + count for a numeric baseline)
show route protocol ospf         ;  show route protocol ospf | count
show route protocol direct       ;  show route protocol direct | count
show route protocol static       ;  show route protocol static | count

# 3. Data plane — interfaces & ARP
show interfaces terse
show interfaces extensive
show arp no-resolve

# 4. Hardware & environment
show chassis hardware
show chassis power
show chassis alarms
show chassis environment
show chassis fabric summary
show chassis fabric plane
show chassis fpc
show chassis firmware

# 5. Software, version & license (both REs)
show version invoke-on all-routing-engines
show vmhost version invoke-on all-routing-engines
show system license

# 6. System health, time & logs
show system alarms
show ntp status
show ntp associations
show system boot-messages
```

### Switches — L2 / aggregation / virtual-chassis / PoE (from `CAS1-10`, `CSW1`, `VM-SW1.AUS1`)

```
# 1. Configuration
show configuration | display set

# 2. Control plane — HA + routing (L3/aggregation switches)
show vrrp summary
show vrrp detail
show ospf neighbor  ;  show ospf interface  ;  show ospf database
show route protocol ospf | count
show route protocol direct | count
show route protocol static | count

# 2b. L2 / switching
show ethernet-switching table
show vlans

# 3. Data plane — interfaces
show interfaces
show interfaces terse
show interfaces extensive

# 4. Hardware & environment
show chassis hardware detail
show chassis routing-engine
show chassis power-budget-statistics
show chassis alarms
show chassis environment
show chassis fpc pic-status
show chassis firmware

# 4b. PoE (access switches)
show poe controller
show poe interface
show poe telemetries

# 4c. Virtual-chassis (if VC)
show virtual-chassis status
show virtual-chassis vc-port

# 5. Software, version & license
show version detail            # or: show version invoke-on all-routing-engines
show system license

# 6. System health, time & logs
show system alarms
show system uptime
show system storage
show system processes summary
show system processes extensive
show ntp status
show ntp associations
show system boot-messages
file list /var/tmp             # pre-upgrade: confirm the image is staged
```

### Firewalls — SRX HA cluster (from `FW1.AUS1`)

```
# 1. Configuration
show configuration | display set

# 2. Firewall-specific — HA cluster & session state (do these FIRST on a firewall)
show chassis cluster status            # node0/node1 primary/secondary, priorities, redundancy groups
show chassis cluster interface         # fabric + control links, monitored interfaces
show security flow session summary     # session count/table — the firewall's core workload
# Control plane (SRX commonly runs BGP/routing)
show route
show bgp summary
show bgp neighbor

# 3. Data plane — interfaces & ARP
show interfaces terse
show interfaces extensive
show arp no-resolve

# 4. Hardware & environment
show chassis hardware
show chassis power
show chassis alarms
show chassis environment
show chassis fabric summary
show chassis fabric plane
show chassis fpc
show chassis firmware

# 5. Software, version, license & recovery snapshot
show version invoke-on all-routing-engines
show vmhost version invoke-on all-routing-engines
show system license
show system snapshot slice alternate media internal   # verify a recovery snapshot exists before upgrade

# 6. System health, time & logs
show system alarms
show ntp status
show ntp associations
show system boot-messages
```

> **Senior extension for VPN/edge firewalls** (beyond the MOP's core set — add when the box terminates VPNs or enforces policy): `show security policies hit-count`, `show security nat source/destination rule all`, `show security ike security-associations`, `show security ipsec security-associations`. These baseline the security posture the same way BGP baselines the routing posture.

---

## Step 4 — The multi-vendor map (same categories, Cisco idiom)

You run Cisco (IOS / IOS-XR / NX-OS) as well as Junos. The **category model is identical**; only the syntax changes. Lead with this table when the device isn't Junos.

| Category | Junos | Cisco IOS / NX-OS | Cisco IOS-XR |
|----------|-------|-------------------|--------------|
| Configuration | `show configuration \| display set` | `show running-config` | `show running-config` |
| BGP | `show bgp summary` / `show bgp neighbor` | `show ip bgp summary` / `show ip bgp neighbors` | `show bgp summary` / `show bgp neighbors` |
| OSPF / IS-IS | `show ospf neighbor` | `show ip ospf neighbor` / `show isis neighbors` | `show ospf neighbor` / `show isis neighbors` |
| Routes (+count) | `show route protocol … \| count` | `show ip route` / `show ip route summary` | `show route` / `show route summary` |
| HA / FHRP | `show vrrp summary` | `show standby brief` (HSRP) / `show vrrp brief` | `show vrrp` / `show redundancy` |
| Interfaces | `show interfaces terse/extensive` | `show ip interface brief` / `show interfaces` | `show ipv4 interface brief` / `show interfaces` |
| L2 (switch) | `show ethernet-switching table` / `show vlans` | `show mac address-table` / `show vlan` | — |
| ARP | `show arp no-resolve` | `show ip arp` | `show arp` |
| Hardware/env | `show chassis hardware/environment` | `show inventory` / `show environment` / `show module` | `show inventory` / `admin show environment` |
| Version | `show version invoke-on all-routing-engines` | `show version` | `show version` / `show redundancy` |
| License | `show system license` | `show license` | `show license` |
| NTP | `show ntp status` / `show ntp associations` | `show ntp status` / `show ntp associations` | `show ntp associations` |
| Alarms/logs | `show system alarms` / `show system boot-messages` | `show logging` / `show facility-alarm` | `show logging` / `show alarms` |
| Firewall HA/sessions | `show chassis cluster status` / `show security flow session summary` | ASA/FTD: `show failover` / `show conn count` | — |

---

## Step 5 — Baseline discipline (before → after → diff)

1. **Before.** Full role set on login, captured to file. Note the **numbers**: BGP peers Established (`x/y`), route counts per protocol, interface error counters, alarm count (ideally zero), code version per RE, NTP sync state.
2. **Witness.** External ping set running the entire time (the MOP's PingInfoView across each internal/external subnet). A blip here is the fastest "something broke" signal.
3. **After.** The **same** set, captured to `..._after_...`. Diff against before.
4. **What the diff should show:** *only the intended delta.* Route counts back within range, all neighbors re-Established, no new alarms, version changed as planned, everything else identical.

**Red-flags in the before-baseline — stop and reassess before changing anything:**

- Pre-existing chassis **alarms** or environment warnings (you don't want to own a fault you didn't cause).
- BGP/OSPF neighbors **not** fully up, or route counts far from expected.
- **NTP not synced** (clock skew corrupts log correlation and some auth).
- Firewall **cluster not healthy** (both primary, or a monitored interface down) — never upgrade/change an already-degraded cluster.
- No **recovery snapshot** / image not staged in `/var/tmp` before an upgrade.
- Disk (`show system storage`) near full.

---

## How this fits the platform

This skill is the concrete core of the **`running-config-and-state`** domain agent from the [skills model](../../skills-model.md):

- **Read-only, zero blast radius** — the right first agent to build and trust.
- **The capture-before/after/diff loop** is the neteng analog of a test's arrange/act/assert, and it's what the execution engine's pre-check / post-check steps automate.
- **The seven-category model + the numeric diff** is exactly what **drift detection** (the white-paper "crawl" wedge) runs continuously: baseline every device, diff actual vs intended, surface the delta.
- The per-role sets here become **structured captures** (parse with NAPALM getters / pyATS-Genie / TextFSM) so the diff is machine-computed, not eyeballed — turning the SecureCRT scrollback into first-class, replayable state.

**Next build:** wrap this as an executable capture (SSH/telnet transport + per-role command set + parse to structured JSON), so "login and baseline" becomes one command that returns a diffable artifact.
