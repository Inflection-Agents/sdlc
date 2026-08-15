# Skills Model — Infrastructure (Network) Engineer & Software Engineer

> **Status:** Draft v0.1 — companion to the [white paper](whitepaper.md).
> **Purpose:** Model the skills of a senior network engineer *and* a software engineer, side by side, then define the **domain skill-agents** that let the platform help with day-to-day senior networking work.
> **Grounding:** CCIE Enterprise Infrastructure v1.1 + CCIE Service Provider v5.1 blueprints, SFIA (Skills Framework for the Information Age), RFC 9315 (Intent-Based Networking), and the modern network-automation stack. Sources in [§8](#8-sources).

---

## 1. Why model skills at all

The platform is only as good as the expertise it encodes. In the SDLC, domain skills like `dbt-craftsman` are what turn a generic agent into one that writes *correct* dbt. For networking, the domain expertise is your CCIE-level craft — and it's large, layered, and unforgiving. So we model it explicitly, as a catalog of **skill-agents**, each defined the same way a domain skill is: **what it knows, what it does, its verify-signals, and its classic mistakes.**

Two modelling choices up front, both borrowed from the SDLC's [skill-architecture](../skill-architecture.md):

1. **Two axes, kept distinct.** *Competency* (what you can do — BGP, optics, VXLAN) is separate from *responsibility/seniority* (SFIA L1–L7: autonomy, blast-radius judgment, influence). The skill-agents encode competency; the seniority axis is what stays human — the go/no-go, the architecture call.
2. **The OSI stack is the primary decomposition.** L1/L2/L3 is how you already think, and — critically — it's how *blast radius, verification, and failure modes* cluster. That makes it the right seam to cut skill-agents along.

---

## 2. Software engineer vs. network engineer — the side-by-side

The reason the SDLC model ports at all is that the two disciplines share a skeleton. Here's the software-engineer competency taxonomy (anchored in SFIA / SWEBOK) placed against its network-engineering analog.

| # | Software-engineer domain | Network-engineer analog | Transfers? |
|---|--------------------------|-------------------------|-----------|
| 1 | **Programming & languages** (idioms, data structures, algorithms) | Python + Jinja/YAML + vendor CLI & YANG modeling | **Direct** — same craft, different syntax |
| 2 | **Design / architecture** (modularity, APIs, distributed systems, scale) | Topology design, addressing plans, routing/policy design | **Direct** — design thinking transfers; primitives differ |
| 3 | **Requirements & problem framing** | **Intent capture** (RFC 9315) | **Direct** — IBN literally borrows the framing |
| 4 | **Testing & quality** (unit/integration/E2E, TDD) | pyATS/Genie tests + **Batfish** pre-change validation | **Direct** — "unit test" ≈ config validation + digital twin |
| 5 | **Debugging & troubleshooting** | Packet capture, path/reachability analysis, protocol troubleshooting | **Direct** — tools differ, method is the same |
| 6 | **Version control & collaboration** | Config-as-code in Git; **NetBox** as the "codebase" (source of truth) | **Direct** — networking is trending to GitOps |
| 7 | **CI/CD, build & release** | Config pipelines, staged rollout, NAPALM commit/rollback | **Direct** — *same discipline, far higher blast-radius stakes* |
| 8 | **Observability & operations (SRE)** | gNMI streaming telemetry, Suzieq, BMP, SNMP | **Direct** — same SRE mindset, different signals |
| 9 | **Security** | RPKI/route-origin validation, ACL/firewall reasoning, control-plane hardening | **Partial** — protocol/routing-security specific |
| 10 | **Lifecycle, process & craft** | Change management, maintenance windows, MOPs | **Partial** — heavier compliance/blast-radius culture |

**What has no clean software twin** — the four things that make networking its own discipline and drive the platform's hardest requirements:

- **(a) Real-time distributed control-plane protocols** as first-class objects — BGP/OSPF/IS-IS convergence is a live, adversarial, network-wide computation, not a function you call.
- **(b) Brownfield heterogeneity** — multi-vendor CLI/screen-scraping with no clean API. Software rarely has to drive five incompatible dialects over telnet.
- **(c) The physical L1–L2 layer** — cabling, optics, DWDM, DCIM. There is no software analog to a dirty fiber end-face or an OSNR budget.
- **(d) Change blast radius** — a bad push can partition the very network you are managing *through*, which is why digital-twin pre-validation and automatic rollback are load-bearing here in a way they never are for an app deploy.

Read the transfer column as the build plan: where it says **Direct**, the SDLC's machinery (spec, review panel, pipeline, verification discipline) ports over. Where it says **Partial / no twin**, we build new — and that new work is the domain skill-agents below.

---

## 3. The three-layer skill architecture (same shape as the SDLC)

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Behavioral (personal, always-on)                  │
│  Verify-before-done, systematic debugging, brainstorming.    │
│  Ported unchanged from the SDLC — discipline is universal.   │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Network-SDLC Process                              │
│  intent → design-authoring → change-decomposition →          │
│  change-execution → change-review → verification             │
│  (the phase model from the white paper)                      │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Domain — the network-engineering craft            │
│  L1/L2/L3 skill-agents + cross-cutting craft agents          │
│  (this document's catalog, §5)                               │
└─────────────────────────────────────────────────────────────┘
```

Each layer answers a different question — and two networking-specific **meta-skills** ([§6](#6-two-meta-skills-the-networking-iron-laws)) sit at the behavioral layer because they must apply in *every* domain agent:

| Layer | Question it answers | Networking example |
|-------|--------------------|--------------------|
| Behavioral | How do I approach any task safely? | Prove the failure, don't just read "up." Isolate faults bottom-up. Never claim done without post-checks. |
| Process | What lifecycle phase am I in? | Am I authoring a MOP, executing a change window, or reconciling drift? |
| Domain | What are the rules for *this* technology? | BGP: check *why* a path won. Optics: Rx power inside the window with margin. STP: is the root where I intended? |

---

## 4. The canonical competency taxonomy

Three independent frameworks converge on the same spine. Use the **CCIE blueprints** for the technical decomposition (the de-facto senior competency map) and **SFIA** for the professional leveling.

**CCIE Enterprise Infrastructure v1.1** — Network Infrastructure 30% · Software-Defined Infrastructure 25% · Transport Technologies 15% · Infrastructure Security & Services 15% · Automation & Programmability 15%. *(L1 is implicit — the blueprint assumes physical mastery as a prerequisite. That's exactly why L1 must be modeled explicitly for an agent.)*

**CCIE Service Provider v5.1** — Core Routing (OSPF/IS-IS/BGP/SR-MPLS/SRv6) 25% · Architectures & Services (L2/L3VPN, EVPN, mVPN) 25% · Assurance & Automation (MDT, NETCONF/YANG, gNMI) 20% · Access Connectivity 10% · HA & Fast Convergence (BFD, TI-LFA, NSF/NSR) 10% · Security 10%.

**SFIA** — the vendor-neutral leveling: **Network design (NTDS)** and **Network support (NTAS)**, each defined across responsibility Levels 1–7 (Follow → Set strategy), plus Architecture (ARCH/DESN), IT operations (ITOP), Availability/Capacity (AVMT/CPMG), Security (SCTY), Configuration management (CFMG).

**Merged model (what we build agents against):**

1. Physical & Transport (L1) · 2. L2 / Ethernet & Data-Link · 3. L3 / Routing · 4. Transport / MPLS / SR · 5. Overlay / SDN / Fabric · 6. High Availability & Convergence · 7. Security & Infra Services · 8. Automation & Programmability · 9. Assurance / Observability · 10. Architecture & Design (SFIA NTDS) · 11. Professional leveling (SFIA responsibility axis).

---

## 5. The domain skill-agent catalog

Each agent is defined like a domain skill: **Scope · Key competencies · Verify-signals · Red-flags.** Verify syntax is Cisco IOS/NX-OS idiom with Junos noted where it differs — the *concept* is the transferable skill, not the vendor CLI. Full competency lists (every skill, every failure mode) live in the [appendix](#appendix-full-competency-lists); this section is the roster and the shape of each agent.

### 5.1 L1 — `l1-physical-optical`

- **Scope:** Everything below the frame — copper/fiber, optics, power budgets, DWDM/OTN, LAG/breakout, physical MTU. The layer CCIE treats as "table stakes" and therefore the one an agent must be told explicitly.
- **Key competencies:** Fiber types (SMF OS2 vs MMF OM3/4/5, wavelength/reach classes); transceivers (SFP/QSFP/-DD, -SR/-LR/-ER/-ZR, FEC at 25G+, MSA/vendor coding, DAC/AOC); **optical power budget in dBm** (Tx − Rx-sensitivity, worst-case, attenuation + connector + splice + aging margin, overload on short high-power runs); connectors/polarity (LC/MPO, APC vs UPC, end-face care); DWDM/CWDM/OTN (ITU grid, EDFA, ROADM, chromatic dispersion & PMD, OSNR); duplex/auto-neg; LAG member consistency + breakout.
- **Verify-signals:** `show interface transceiver [detail]` (DDM Rx/Tx vs thresholds), `show interface` (incrementing CRC/runts/giants ⇒ physical), `show controllers` (PHY / SONET / OTN alarms — LOS/LOF/AIS, BER), `show etherchannel summary` (member P vs suspended), DF-bit ping sweep (MTU). Instruments: fiber inspection scope (IEC 61300-3-35), OPM/OLTS (dBm + insertion loss vs budget), OTDR (fault distance), BERT (commissioning), OSNR analyzer (DWDM). **Green light:** Rx power inside the optic window *with margin*, zero *incrementing* errors, matched speed/duplex/MTU both ends, measured loss < calculated budget, no LOS/LOF/BER alarms.
- **Red-flags:** Dirty end-face (the #1 fiber fault); SMF↔MMF or wavelength or reach-class mismatch (no/weak light); Rx out of window — too low (loss/bend/dirt) *or* too high (overload, needs attenuator); duplex/auto-neg mismatch (CRC + late collisions under load); FEC mismatch at 25G/100G (link won't come up); APC/UPC mix or MPO Tx→Tx; LAG member inconsistency (suspended member); breakout not provisioned; DWDM OSNR/CD/PMD budget exceeded or wrong ITU channel.

### 5.2 L2 — `l2-switching`

- **Scope:** The data-link core — framing, MAC, VLANs/trunking, the STP family, LACP, storm control, PVLAN, MTU consistency, and L2 edge security.
- **Key competencies:** Ethernet framing & where CRC originates; MAC learning/aging & flap detection; 802.1Q trunking & native-VLAN discipline; STP/RSTP/MSTP root design + PortFast/BPDU-guard/root-guard/loop-guard/UDLD; LACP active/passive & member consistency; storm control; PVLAN; MTU/jumbo with encapsulation overhead; L2 security (port-security, DHCP snooping, DAI, IP source guard).
- **Verify-signals:** `show spanning-tree [root|inconsistentports]` (root is where you intended, TCN counters quiet), `show interfaces trunk` (both ends agree on native VLAN + allowed list), `show mac address-table` (stable, no flap logs), `show etherchannel summary` (P not s), `show interface | i MTU` + DF-bit ping, `show ip dhcp snooping binding` / `show ip arp inspection statistics`. **Validate security by attacking:** flood MACs past the limit → err-disable; lease from untrusted port → snooping drop; forged ARP → DAI drop.
- **Red-flags:** MAC flapping between ports = a **loop**; native-VLAN mismatch (VLAN hopping / STP inconsistency); VLAN not on the trunk allowed-list; MST region mismatch (splits region → loops); root elected by accident onto an access switch; edge port without PortFast flushing the network with TCNs; suspended LACP member; MTU black-hole (small passes, large drops); DHCP-snooping uplink left untrusted.

### 5.3 L2 fabric — `l2-datacenter-fabric` *(optional split from `l2-switching`; justified at DC/SP scale)*

- **Scope:** VXLAN / BGP-EVPN spine-leaf overlays.
- **Key competencies:** Underlay (eBGP or IGP + PIM/ingress-replication); MP-BGP EVPN overlay; VNI↔VLAN/VRF mapping; VTEP/NVE source loopback; distributed anycast gateway; RD/RT for L2VNI (MAC-VRF) & L3VNI (IP-VRF); EVPN Type-2 (MAC/IP), Type-3 (IMET), Type-5 (prefix).
- **Verify-signals:** **underlay first** — loopback reachability + `show ip bgp/ospf neighbor`; then `show nve peers` / `show nve vni` (Up), `show bgp l2vpn evpn` (Type-2/3/5 present), `show l2route evpn mac`. Health = VTEPs reach each other's source IP, EVPN routes learned, NVE peers Up.
- **Red-flags:** Underlay unreachable (loopback not advertised) → nothing works; underlay MTU too small for +50/54B overhead → overlay black-hole (need ≥1550, usually 9000); RD/RT mismatch (routes not imported); inconsistent anycast-gateway MAC; missing PIM/ingress-replication (BUM doesn't flow).

### 5.4 L3 IGP — `l3-igp`

- **Scope:** Addressing and interior routing — IPAM, static/floating routes, OSPF, IS-IS, EIGRP, FHRP, redistribution control.
- **Key competencies:** Hierarchical/summarizable addressing (VLSM, /31, dual-stack IPv6, /127 P2P); static & floating-static with AD + reachability tracking; OSPF (areas/LSA types/cost/DR-BDR/summarization/auth); **IS-IS** (L1/L2, NET/system-ID, wide metrics, route leaking — the SP-core staple and SR/SRv6 IGP); EIGRP DUAL; FHRP (HSRP/VRRP/GLBP with tracking + preempt); redistribution with tags/down-bit to prevent loops.
- **Verify-signals:** `show ip ospf neighbor` (FULL / 2WAY-on-DROther), `show isis adjacency` (Up), `show ip route <proto>`, `show standby brief` (one Active/one Standby). Diff the routing table before/after any policy change.
- **Red-flags:** OSPF **stuck in EXSTART/EXCHANGE = MTU mismatch**; **stuck in INIT = one-way hello** (ACL/timer/area/auth); IS-IS **area-ID mismatch breaks L1** / **MTU mismatch drops IIH hellos**; EIGRP K-value or AS mismatch → no neighbor, no feasible successor → SIA; both FHRP routers Active (group/auth/subnet mismatch); redistribution loop from mutual redistribution without tags.

### 5.5 L3 BGP & policy — `l3-bgp-policy` *(its own agent — SP-core-critical, highest blast radius)*

- **Scope:** BGP end to end and the routing policy that governs it. This is the agent whose mistakes reach the global Internet, so it carries the heaviest guardrails.
- **Key competencies:** eBGP/iBGP, full-mesh vs route reflectors (cluster-id); policy via route-maps/prefix-lists/AS-path filters/communities (no-export/no-advertise, extended & large communities); best-path manipulation (weight, local-pref, prepend, MED); protection — **maximum-prefix**, ingress/egress prefix filtering, **RPKI/ROV**; **route-leak** dynamics (valley-free / Gao-Rexford, no-export on customer routes, MANRS).
- **Verify-signals:** memorize the **best-path order** — Weight → Local-Pref → locally-originated → shortest AS-Path → lowest origin → lowest MED (same neighbor-AS only) → eBGP over iBGP → lowest IGP to next-hop → oldest/router-ID. `show bgp summary` (Established + prefix counts), `show bgp <prefix>` (*why* this path won + communities), `show bgp neighbors <x> advertised-routes|received-routes`, `show bgp rpki table/servers`.
- **Red-flags:** **iBGP next-hop-self forgotten** (valid route, unreachable next-hop); iBGP without full-mesh/RR (routes don't propagate); no **maximum-prefix** (a peer's full-table leak melts the router); accepting **RPKI-invalid** routes; **route leaks** — re-advertising provider/peer routes to another provider (the classic global outage); MED compared across different neighbor-ASes by accident.

### 5.6 L3 transport & services — `l3-mpls-sr`

- **Scope:** The label-switched core and the VPN services on top — MPLS, Segment Routing, L3VPN/L2VPN.
- **Key competencies:** MPLS LDP (label-to-FEC, LDP-IGP sync) & RSVP-TE (TE tunnels, FRR); **Segment Routing** SR-MPLS (SRGB, prefix/adjacency-SIDs, TI-LFA) & SRv6 (locators, End/End.X/End.DT SIDs); **L3VPN** (VRF + RD uniqueness, import/export route-targets, VPNv4/VPNv6 MP-BGP, PE-CE protocol); **L2VPN** (VPWS/VPLS/EVPN-VPWS, VC-ID/MTU match).
- **Verify-signals:** `show mpls ldp neighbor` (Operational), `show mpls forwarding-table`, `show mpls traffic-eng tunnels`, `show segment-routing ...` / `show isis segment-routing`, `show bgp vpnv4 unicast` (labels + RTs), `show ip route vrf <x>`, `show mpls l2transport vc` (VC up, VC-ID + MTU match). LSP ping / traceroute mpls.
- **Red-flags:** **LDP-IGP sync missing** → black-hole on convergence; loopback not a /32 in IGP (label binding fails); **SRGB mismatch** → label misforwarding (must be network-wide consistent); **RT import/export mismatch** (route in VPNv4 table but not in the VRF); confusing **RD (uniqueness) with RT (membership)**; interface not bound to VRF (IP falls into global table); VC-ID/MTU mismatch keeping a pseudowire down.

### 5.7 Cross-cutting craft agents

These are not a single OSI layer — they're the craft that wraps every layer, and they're where "knowing the running configuration" and "not locking yourself out" live. They split by **cadence**: `net-topology-map` runs **once per network** (onboarding); everything else runs **every session**.

| Agent | Cadence | Scope | Verify-signals / red-flags |
|-------|---------|-------|----------------------------|
| **`net-topology-map`** | **Onboarding (1×)** | The step *before* login: ingest the network's diagrams (Visio/PDF/images) across layers — optical/L1, L3 physical, L3 logical — into a structured topology map (the seed of the intended-state graph), so the agent knows how the network is connected before touching a device. Its device inventory is the connector's host list. See [`net-topology-map`](skills/net-topology-map/SKILL.md). | Cross-check the drawn topology against a live baseline (LLDP/CDP, interface descriptions, BGP groups); mismatches are drawing errors *or* drift — both matter. Red-flag: trusting a stale diagram; missing the OOB/backdoor paths; no human sign-off on roles/redundancy. |
| **`running-config-and-state`** | Every session | The thing you always do: capture the running config + operational state, parse it to structured data, snapshot it, diff intended vs actual. Its concrete core is the [`net-login-and-baseline`](skills/net-login-and-baseline/SKILL.md) skill (login → seven-category baseline → before/after/diff). The SoT bridge (NetBox ⇄ device). Tooling: NAPALM getters, pyATS/Genie learn+diff, TextFSM/ntc-templates, gNMI where available. | Learn a feature's whole state and **diff before/after** every change, loaded *with the topology map for context*. Red-flag: acting on `show run` alone without capturing operational state (routes/sessions/counters), or trusting a diagram over the live config. |
| **`device-access-cli`** | Every session | The SecureCRT reality made into a **connector**: SSH/**telnet** by IP or hostname, multi-vendor dialects (IOS / IOS-XR / NX-OS / Junos / SR OS / EOS), enable vs configure-exclusive, **candidate/commit** (Junos/XR) vs running-config (IOS), paging/prompt handling, the **OOB/console** lifeline, and **connect-to-many** driven by the map's inventory. Transport: Scrapli/Netmiko + Nornir concurrency + NAPALM getters; credentials from a secrets store, never in the map. | Confirm OOB reachability *before* any change; know each vendor's commit & rollback model. Red-flag: a change that severs the management path you're on; credentials stored in the map or in git; assuming IOS "write mem" semantics on a commit-based OS. |
| **`verification-and-assurance`** | The neteng analog of TDD: define the intent assertions that must hold *after* a change (session up, prefix counts in range, path correct, no collateral withdrawals) and prove them. Tooling: pyATS/Genie test suites, Suzieq state assertions, streaming telemetry, BMP. | Every change ships with pre-checks + post-checks + tolerances (ranges, not exact). Red-flag: "it looks up" as the only evidence; no pre-change baseline to diff against. |
| **`change-safety`** | Reversibility as a constraint (white-paper principle #8): commit-confirmed timers (Junos), `configure replace`/rollback (IOS-XR), archived `reload in` (IOS); blast-radius computation; staged canary→widen; change windows. | Every unattended change has an automatic, time-bounded back-out + a verified OOB path, and never exceeds its declared blast-radius ceiling. Red-flag: an atomic all-at-once push to the core; a back-out plan that is itself a hand-typed MOP. |
| **`firewall-security-policy`** | The security gear you configure: stateful firewalls, ACLs, zones/policies, NAT, control-plane protection (CoPP/LPTS), AAA, infra services (DNS/DHCP/NTP). | Validate by testing the deny (fire the traffic the rule should block); check for shadowed/overlapping rules and implicit-deny surprises. Red-flag: an ACL/NAT change that locks out management; rule added at the wrong position in an ordered list. |
| **`sp-services`** | Service delivery for ISP clients: peering & transit turn-ups, L2/L3VPN customer provisioning, circuit turn-ups, IX/LINX peering hygiene (max-prefix, RPKI, community tagging). | Intent-driven service specs that compile to per-device config across the path; customer-notification + SLA state on the change. Red-flag: a peering turn-up without max-prefix + egress filters (route-leak risk). |
| **`digital-twin-validation`** | The "compiler": **Batfish** snapshot analysis (reachability, ACL/BGP reasoning, "what breaks if I push this") and/or a lab, run *before* the engine touches a live router. | No change reaches the push step without a green twin analysis. Red-flag: pushing an unmodeled change to production; treating the twin as optional for "small" changes. |

**Split-vs-merge guidance** (your call as the CCIE): `l3-bgp-policy` is deliberately its own agent — it's SP-core-critical and its errors have the widest blast radius, so it earns dedicated guardrails. `l2-datacenter-fabric` is split from `l2-switching` only because VXLAN/EVPN at scale is a distinct body of knowledge; merge them if your clients are mostly classic switching. Multicast (PIM/RP/IGMP snooping) and QoS are currently folded into `l3-igp` and the relevant layer respectively — promote either to its own agent if a client's estate leans on it heavily.

---

## 6. Two meta-skills (the networking iron laws)

These recur across *every* competency above and belong at the behavioral layer so they bind in all agents:

1. **Verify by proving the failure, not by reading "up."** The strongest signals are adversarial/differential: a DF-bit ping to *find* the MTU black-hole; firing the exact attack a security control should block; diffing the route table before/after a policy change; checking *why* a BGP path won, not merely that it exists. "Up" is not "correct."
2. **Fault isolation is directional — bottom-up.** For any overlay / L3VPN / VXLAN issue, verify **underlay / next-hop reachability first**, then the control plane (BGP/IGP adjacency + routes), then the data plane (labels / VNI / forwarding). Most "advanced" outages are a broken fundamental one layer down — MTU, loopback reachability, an RT or native-VLAN mismatch.

These are the network equivalent of the SDLC's "no completion claims without verification" — and they're *why* the platform's execution engine is built around pre-checks, post-checks, and the digital twin.

---

## 7. How this connects to the platform (RFC 9315)

The skill-agents aren't a static reference — they're the expertise the platform *applies* inside the Intent-Based Networking loop that RFC 9315 formalizes:

```
[INTENT] → [RENDER] → [DEPLOY] → [OBSERVE] → [VALIDATE] → drift? → [RECONCILE] ↺
   ▲  outer loop: human refines intent          inner loop: autonomic, no human  ▲
```

- **Render** (intent → design → per-device config) draws on the *design* competencies of the L1/L2/L3 agents.
- **Deploy** is wrapped by `change-safety` + `device-access-cli`, gated by `digital-twin-validation`.
- **Observe / Validate** is `verification-and-assurance` + `running-config-and-state` diffing actual vs intended.
- **Reconcile** — when drift is detected — is an *incident*, which in white-paper terms is an intent violation routed back through the agents that own the violated layer.

This is the same wager as the SDLC: the agents supply the *competency*; the process layer supplies the *lifecycle*; the human supplies the *intent and the go/no-go*.

---

## 8. Sources

**Frameworks / blueprints:** CCIE Enterprise Infrastructure v1.1 & CCIE Service Provider v5.1 exam topics (Cisco); SFIA — [Network support (NTAS)](https://sfia-online.org/en/sfia-9/skills/network-support), [Network design (NTDS)](https://sfia-online.org/en/sfia-9/skills/network-design), [professional-skills structure](https://sfia-online.org/en/about-sfia/sfia-professional-skills); SFIA [software-engineering view](https://sfia-online.org/en/tools-and-resources/sfia-views/software-engineering) (SWEBOK-aligned).

**L2/L3 practice:** [Cisco BGP best-path](https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/13753-25.html) · [OSPF EXSTART/MTU](https://www.cisco.com/c/en/us/support/docs/ip/open-shortest-path-first-ospf/13684-12.html) · [IS-IS adjacency/area types](https://www.cisco.com/c/en/us/support/docs/ip/integrated-intermediate-system-to-intermediate-system-is-is/200293-IS-IS-Adjacency-and-Area-Types.html) · [VXLAN BGP-EVPN configure/verify](https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/200952-Configuration-and-Verification-VXLAN-wit.html) · [MPLS L3VPN/RT](https://documents.rtbrick.com/trainings/current/mpls/mpls_l3vpn.html) · [Segment Routing design/migration](https://www.cisco.com/c/en/us/support/docs/ip/ipv6-routing/220485-configure-design-and-migration-best-prac.html) · RPKI/ROV: [RIPE](https://www.ripe.net/manage-ips-and-asns/resource-management/rpki/bgp-origin-validation/), [MANRS](https://manrs.org/2020/10/what-is-rov/) · [Juniper STP loop protection](https://www.juniper.net/documentation/us/en/software/junos/stp-l2/topics/topic-map/spanning-tree-loop-protection.html).

**Automation stack:** [awesome-network-automation](https://github.com/networktocode/awesome-network-automation/blob/master/README.md) · [Nornir/NAPALM/NetBox stack (PacketCoders)](https://www.packetcoders.io/how-to-build-a-network-automation-stack-with-nornir-napalm-and-netbox/) · [Netmiko/NAPALM/Ansible/Nornir (APNIC)](https://blog.apnic.net/2023/02/13/automation-tools-paramiko-netmiko-napalm-ansible-nornir-or/) · [pyATS/Suzieq/Batfish (CodiLime)](https://codilime.com/blog/tools-functional-testing-networks/) · [NetBox Labs](https://netboxlabs.com/blog/navigating-network-automation-with-netbox-the-operate-stage/).

**Intent-Based Networking:** RFC 9315 *Intent-Based Networking — Concepts and Definitions* ([datatracker](https://datatracker.ietf.org/doc/rfc9315/) · [RFC Editor](https://www.rfc-editor.org/info/rfc9315/)); related: RFC 7575 (Autonomic Networking), RFC 8969 (YANG service/network/device automation — L3SM/L3NM, L2SM/L2NM).

---

## Appendix: full competency lists

The condensed per-agent blocks in §5 are distilled from the full CCIE-level competency lists compiled during research — every discrete skill, its verify-signal, and its failure modes for L1 (10 competency areas), L2 (11), and L3 (13). When we turn an agent into an actual `SKILL.md`, that agent's full list becomes its body. The research is captured in this session; the next step is to promote the chosen first agents into real skill files.
