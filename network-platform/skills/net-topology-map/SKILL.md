---
name: net-topology-map
description: Use when ONBOARDING a network — before any login. Ingests the network's diagrams (Visio/PDF/images) across layers (optical/L1, L3 physical, L3 logical) and builds a structured topology map — the intended-state graph — so the agent always knows how the network is physically and logically connected. One-time per network (refreshed when the topology changes); it is the context every login-and-baseline and every change runs against.
---

# Network Topology Map (Onboarding)

## Overview

**Before you log into a single device, you already know the network.** A senior engineer carries a mental map — how the sites connect, which router peers with which carrier, what's redundant with what, how traffic is *supposed* to flow. That map comes from the network diagrams (Visio, PDF, images), and it's why those diagrams are maintained. This skill turns those diagrams into a **structured topology map** the agent loads before every session, so it has the same situational awareness you do.

This is the **onboarding step — one-time per network** (refreshed only when the topology actually changes). It runs *before* [`net-login-and-baseline`](../net-login-and-baseline/SKILL.md), which is the every-time step. The map is the context; the baseline is the reconciliation against it.

**Announce at start:** "Building the network map from your diagrams — this is the one-time onboarding that every future login runs against."

> **This map is the first population of the intended-state graph** (see the [white paper](../../whitepaper.md)). Everything downstream — baseline diff, drift detection, change blast-radius — reads from it. Get it right once and it pays back on every login.

---

## Why this comes first (and only once)

| | Topology map (this skill) | Login & baseline |
|---|---------------------------|------------------|
| **Cadence** | One-time per network (onboarding); refresh on topology change | Every session |
| **Source** | Network diagrams + IPAM/inventory | The live device |
| **Produces** | The intended structure ("how it's *supposed* to connect") | The observed state ("what it's doing *now*") |
| **Answers** | "Where am I in the network? What connects to what? What's redundant?" | "Is this device healthy and unchanged?" |
| **Blast radius** | None (reads documents) | None (read-only) |

Without the map, a baseline is just numbers. *With* it, the agent reads `show bgp summary` on ER1 and knows *those two eBGP peers are Lumen and Unitas, and losing one should fail traffic to the other* — it reasons about the network, not just the box.

---

## What it ingests

The diagrams you maintain, in whatever form they exist — **layered, because the network is layered:**

| Layer | Diagram type | What it carries |
|-------|--------------|-----------------|
| **L1 / Optical** | Optical / DWDM / fiber diagrams | Fiber paths, wavelengths/λ, transceivers, patch panels, span loss, ROADM/OTN, physical port↔port |
| **L1–L2 / Physical** | Rack / cabling / physical topology | Devices, chassis, interfaces, LAG/ae bundles, breakout, which port lands where |
| **L2** | Switching / VLAN / fabric diagrams | VLANs, trunks, STP/VC domains, EVPN/VXLAN VNIs |
| **L3 Physical** | L3 physical topology | Router interfaces, P2P links & subnets, carrier handoffs, site interconnects |
| **L3 Logical** | L3 logical / routing diagrams | BGP peerings (eBGP/iBGP), OSPF/IS-IS areas, VRRP/HSRP groups, VRFs/VPNs, route policy intent |

**Formats & how they're read:**

- **Visio (`.vsdx`)** — richest source: it's a zipped XML package; shapes carry device names/roles and *connectors carry the links*. Extract shapes + connections → nodes + edges directly.
- **PDF** — extract text + vector/labels; where it's a flattened image, treat as image (below).
- **Images (PNG/JPG)** — read visually: identify devices, labels, link lines, annotations (IPs, interface names, circuit IDs).
- **Supplements** — IPAM exports, interface spreadsheets, an existing config baseline (the `net-login-and-baseline` capture cross-checks the drawn topology against reality).

---

## What it produces — the structured map

A machine-readable topology artifact (YAML/JSON) with **layered views over one device inventory**. Shape (illustrative):

```yaml
network: AUS1
sites: [AUS1, CH1, CH2]         # incl. remote/backdoor sites
devices:
  - id: ER1.AUS1
    role: edge-router            # edge | core | aggregation | access | firewall | switch
    vendor: juniper
    model: MX304
    os: junos
    redundancy: dual-RE
    mgmt: { ip: 50.115.88.41, oob: Console1.AUS1 }
  - id: FW1.AUS1
    role: firewall
    vendor: juniper
    model: SRX
    redundancy: chassis-cluster
  # ... ER2, CAS1-10, CSW1, VM-SW1, ...
links:                            # edges — the "how it's connected"
  - { a: ER1.AUS1, a_if: ae99, b: ER2.AUS1, b_if: ae99, layer: L3, role: ibgp-interconnect }
  - { a: ER1.AUS1, a_if: xe-0/0/0:0, b: UNITAS, layer: L3, role: carrier-handoff, ip: 65.56.106.29 }
  - { a: ER2.AUS1, a_if: et-0/0/0, b: LUMEN,  layer: L3, role: carrier-handoff }
peerings:                         # L3-logical intent
  - { device: ER1.AUS1, type: ebgp, peer: UNITAS, group: CARRIER-UNITAS }
  - { device: ER2.AUS1, type: ebgp, peer: LUMEN,  group: CARRIER-LUMEN }
  - { device: ER1.AUS1, type: ibgp, peer: ER2.AUS1, group: EC_INTERNAL_ER2 }
redundancy:
  - { type: vrrp, group: 50, subnet: 130.250.0.0/28, master: ER1.AUS1, backup: ER2.AUS1 }
  - { type: chassis-cluster, device: FW1.AUS1 }
  - { type: dual-carrier, primary: UNITAS@ER1.AUS1, secondary: LUMEN@ER2.AUS1 }
optical: []                       # L1 view populated from optical diagrams
```

The **device list is the connector inventory** (see below), the **links/peerings are what baseline diffs and blast-radius reads**, and the **redundancy block is what change-safety checks** ("don't touch both sides of a redundant pair at once").

---

## Process

1. **Collect** every diagram layer the network has (optical, physical, L2, L3 physical, L3 logical) + any IPAM/inventory.
2. **Extract** per format (Visio shapes+connectors, PDF text/vectors, images visually) into a candidate node/edge set.
3. **Normalize** into the structured schema — one device inventory, layered views, roles, redundancy relationships.
4. **Cross-check** against a real `net-login-and-baseline` capture where available — the drawn topology vs the live config (LLDP/CDP neighbors, interface descriptions, BGP groups). Flag mismatches: *these are either drawing errors or drift, and both matter.*
5. **Validate with the engineer** — you confirm roles, redundancy intent, and anything the diagrams left ambiguous. This is the human sign-off on the source of truth.
6. **Publish** the map artifact; it becomes the context loaded at every login.

---

## Worked example (from the AUS1 MOP, before any diagram)

Even the code-upgrade MOP implies most of the map — which is the point:

- **Edge:** `ER1.AUS1` / `ER2.AUS1` (MX304, dual-RE), each homing a carrier — **Unitas** on ER1 (`xe-0/0/0:0`), **Lumen** on ER2 (`et-0/0/0`) — cross-linked by **iBGP over `ae99`**, internal gateway on **VRRP group 50** (ER1 master 105 / ER2 backup 115-when-failed).
- **Aggregation:** `CAS1–CAS10` (VRRP + OSPF). **Core switches:** `CSW1`, `VM-SW1`. **Firewall:** `FW1` (SRX **chassis-cluster**).
- **Backdoor/OOB:** `ER1.CH1 → ssh 50.115.88.41` reaches ER1.AUS1; `ER1.CH2 → ssh 65.56.106.30` reaches ER2.AUS1 — the out-of-band paths the map must record.

That structure is exactly what makes the upgrade safe (move carrier away → null iBGP → upgrade → restore), and it's exactly what the map should hold so the agent understands *why* those steps are ordered that way. Your actual diagrams will add the L1/optical and full L2 detail this text-only view can't.

---

## The connection layer (how the map drives multi-device login)

The map's device inventory is what makes **"just connect"** and **connect-to-many** work. Architecture:

```
   net-topology-map  ──►  device inventory (hosts, roles, vendor, mgmt IP, OOB)
                              │
                              ▼
        ┌──────────────────────────────────────────────┐
        │  Network CLI connector (SSH / telnet)         │
        │  connect · run · run_on_many · disconnect      │
        │  transport: Scrapli / Netmiko (SSH+telnet,     │
        │  multi-vendor); Nornir for concurrency;        │
        │  NAPALM for normalized getters                 │
        └──────────────────────────────────────────────┘
                              │  credentials from a SECRETS STORE
                              ▼  (never in the map, never in git)
                     one device ── or many, concurrently
```

- **Inventory comes from the map** — you don't re-list devices; the map *is* the host list.
- **Credentials are separate** — a secrets store / vault / per-session prompt supplies username+password (or SSH keys). The map holds *where and how to reach*, never the secret.
- **Multi-device** is an inventory filter (`role: edge-router`, `site: AUS1`) + a concurrent runner (Nornir), so "baseline all AUS1 edge routers" is one action.

*(Whether the connector is an MCP server or a library executor inside the engine is the open build decision — see the handoff below.)*

---

## How this fits the platform

- It's the **onboarding half** of the `running-config-and-state` story — the intended structure that the every-session baseline reconciles against.
- It seeds the **intended-state graph**, so **drift detection** (the white-paper "crawl" wedge) has something to diff reality *against* — and can flag when the **diagrams themselves** have gone stale.
- Its device inventory is the **connector inventory** that makes multi-device login and bulk baseline possible.
- Its **layered views** line up with the L1/L2/L3 domain skill-agents — each agent reads the map layer it owns.

**Next build:** (1) the diagram-ingestion pass once real diagrams are provided (Visio/PDF/image → structured map); (2) the network-CLI connector + secrets model that turns the inventory into "log in and pull," one device or many.
