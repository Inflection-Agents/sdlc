# AI-Native Network Engineering — A White Paper

> **Status:** Draft v0.1 — a thinking document to put our ideas together, not a finished spec.
> **Scope:** OSI L1–L3 (physical, data-link, network) for large core / service-provider networks.
> **Lineage:** Borrows the operating model from our [AI-Native SDLC](../README.md) and adapts it to the realities of running live networks.

---

## 1. Thesis

Networks today are still run the way software was run before CI/CD: **imperatively, one box at a time, by an expert typing into a terminal.** SecureCRT into the node, `conf t`, muscle-memory, `wr mem`, hope. The design lives in a Visio diagram and a spreadsheet; the source of truth *is the running config on the devices*; and the only record of a change is the scrollback buffer and a change ticket someone half-filled-in.

Our AI-Native SDLC made a wager that turned out to be right for software: **spend scarce human judgment up front — on intent, design, and decomposition — then let a deterministic engine execute, with an LLM panel as the reviewer of record.** *Quality when it's cheap to assure it, then autonomous execution.*

This paper argues the same wager holds for network engineering — **with three adaptations that networking forces on us and software never did:**

1. **The blast radius is physical and often irreversible.** A bad BGP policy black-holes an AS; a fat-fingered ACL locks you out of the box carrying the very session you're on. There is no `git revert` on a live routing table. The execution engine must be built around *pre-validation, staged rollout, automatic rollback, and out-of-band recovery* as first-class primitives — not afterthoughts.
2. **The estate is brownfield and multi-vendor, spoken to over a CLI.** IOS, IOS-XR, NX-OS, Junos, SR OS, EOS — different config models, different CLIs, some reachable only by telnet. The platform has to bridge *screen-scraped CLI reality* to *structured intent*, not assume a greenfield NETCONF/YANG world.
3. **There is no compiler.** Software has a type-checker and a unit-test suite that run before anything touches production. Networking's equivalent — a **digital twin** (config analysis / snapshot simulation / lab) — has to be built into the loop as the pre-merge gate.

Get those three right and the rest of the SDLC model maps over cleanly. The rest of this paper does that mapping.

---

## 2. Why change?

The daily reality for a senior network engineer on core / ISP networks:

| Today | Cost |
|-------|------|
| **The running config is the source of truth.** Intent lives in a diagram, a spreadsheet, and the engineer's head. | No way to ask "what is this network *supposed* to be?" — only "what is it *currently*?" Drift is invisible until it's an outage. |
| **Changes are hand-typed per box** in SecureCRT, guided by a MOP in a Word doc. | Doesn't scale past the number of boxes one human can babysit in a maintenance window. Every change is a fresh chance to fat-finger. |
| **Verification is manual and inconsistent** — a few `show` commands, eyeballed. | "Did it work?" is a judgment call made tired at 3 a.m. Silent partial failures are common. |
| **Rollback is a second hand-typed MOP** — if it exists at all. | Under pressure, back-out is improvised. This is how a routine change becomes an incident. |
| **Knowledge is tribal.** The reason a policy exists lives with whoever built it. | Onboarding is slow; the bus factor is one; reviews are shallow because reviewers lack context. |
| **Multi-vendor means multi-dialect.** The same intent ("no-export this prefix") is five different CLIs. | Every engineer must be fluent in every vendor; mistakes cluster at the dialect boundaries. |
| **Incidents and design are separate universes.** An outage is a ticket in one tool; the design is a diagram in another. | The system never learns. The same drift causes the same outage twice. |

The gap is the same one software had: **the network is run imperatively (per-box commands) when it should be run declaratively (intent → deterministic execution → verification).** The tooling to close it — structured source of truth, config analysis, streaming telemetry, vendor abstraction — now exists. What's missing is the *operating model* that ties them together and puts an AI engine in the middle safely. That's what we're designing.

---

## 3. The core wager, translated

The SDLC's seven principles, mapped to networking. This is the spine of the whole platform.

| # | SDLC principle | Network-engineering translation |
|---|----------------|--------------------------------|
| 1 | **Spec is the root, not the ticket.** | **Intended network state is the root, not the change ticket or the CLI session.** The design is the durable source of truth; tickets and sessions are ephemeral projections of it. |
| 2 | **Agents are assignees, not tools.** | Network agents have capabilities (read-only vs. can-push), budgets, **and a hard blast-radius ceiling**; every action is attributable and audited. |
| 3 | **Runs are first-class.** | Every change window, config push, and troubleshooting session is a captured run: the MOP, the exact commands, pre/post state, telemetry deltas, who approved it. The scrollback buffer becomes structured history. |
| 4 | **Views are projections.** | Topology maps (L1/L2/L3), capacity dashboards, and "what changed" timelines are *queries over the intended-state graph* — not hand-maintained Visio files. |
| 5 | **Bugs are spec violations.** | **Incidents are intent violations.** An outage is observed-state ≠ intended-state. The NOC isn't a parallel universe; it's the signal that reality has drifted from the design. |
| 6 | **Judgment up front, deterministic execution behind.** | Design, addressing, and routing policy are collaborative human+LLM judgment. The **push → verify → rollback** loop is a deterministic engine. Quality is assured while it's cheap — at the design and change-plan stage — before anything touches a live router. |
| 7 | **Humans give great instructions, not great reviews.** | The engineer authors the *intent and the change plan* (the MOP + verification + back-out). An LLM multi-lens panel reviews the generated config diff. **A human owns the go/no-go at the change window and holds the out-of-band lifeline** — but is not hand-reviewing every line. |

The one principle we **add**, because networking demands it:

> **8. Reversibility is a design constraint, not a hope.** No change reaches production without an automatic, time-bounded back-out (commit-confirmed / config-replace / reload-in) and a verified out-of-band path to the device. If we can't safely undo it, the engine won't do it unattended.

---

## 4. The intended-state graph (the network's source of truth)

The SDLC has a **work graph**. Networking's equivalent is the **intended-state graph** — the single declarative model of what the network is *supposed* to be, from which configs are generated and against which reality is continuously checked.

Node types (illustrative):

- **Devices** — role (P, PE, RR, CE, ASBR, aggregation, access), vendor/OS/version, site, management + OOB reachability.
- **Interfaces & links (L1/L2)** — physical ports, optics/λ, LAG bundles, encapsulation, MTU, the *other end* of every link (topology is edges, not a diagram).
- **Addressing (IPAM)** — prefixes, loopbacks, point-to-point /31s, VRFs, the allocation plan.
- **Routing policy (L3)** — IGP (OSPF/IS-IS) areas & metrics, BGP sessions & policy, route-maps/policy-statements, communities, RPKI/ROA origin intent, MPLS/SR label plan.
- **Services** — L3VPNs, L2VPNs/EVPN, internet transit, peering, customer circuits — each an intent that *compiles down* to config across many devices.
- **Intent assertions** — the testable "shoulds": "PE1↔PE2 iBGP session is up," "customer X's prefixes are advertised with community 65000:100 and no-export," "no prefix longer than /24 accepted from peer Y."

**What the graph unlocks (that a diagram + spreadsheet + running-config never can):**

- Ask *"what is this network supposed to be?"* and diff it against *"what it currently is."* Drift becomes a query, not a surprise.
- Generate vendor-correct config from vendor-neutral intent.
- Compute blast radius *before* a change ("this policy edit touches 240 BGP sessions across 12 PEs").
- Reconstruct exactly what changed, when, by whom, and why — from the graph's history, not scrollback.
- Onboard an engineer (or an agent) with the *reasons* behind the topology, not just its current shape.

Whether this is NetBox-flavored, a custom store, or something else is a build-vs-buy decision (§10) — but the *model* is the foundation everything else rides on.

---

## 5. The design-spec layer

The SDLC's spec becomes the **network design spec**. Same idea — a schema-enforced, reviewable, versioned document that is the contract for a change — adapted to network work. Three artifact types, one system:

| Artifact | Analogous to | When |
|----------|-------------|------|
| **Design** | Feature spec | Greenfield or architectural: a new PoP, a core refresh, a peering fabric, an addressing redesign. |
| **Change (MOP)** | Task / change spec | Day-2 operations: turn up a peering, migrate a customer to L3VPN, push a policy update, code-upgrade a node. |
| **Incident** | Bug spec | Drift/outage: observed-state ≠ intended-state. Links the run(s) that caused it and the intent it violated. |

**Anatomy of a Change spec** (the day-2 workhorse — this is where SecureCRT-by-hand goes to die):

1. **Intent** — the outcome in plain terms ("turn up eBGP peering with AS64500 at LINX, accept their routes, announce ours, max-prefix 200k").
2. **Current state** — captured automatically from the graph + live device (not hand-typed).
3. **Target state** — the delta to the intended-state graph.
4. **Generated change** — the vendor-correct config diff, produced from intent, per device.
5. **Blast radius** — computed: which devices, sessions, services, and customers are in scope.
6. **Verification plan** — the intent assertions that must pass *after* (session up, prefix counts in range, no unexpected withdrawals, traffic on the expected path).
7. **Back-out plan** — automatic and time-bounded (commit-confirmed timer / `configure replace` to the pre-change snapshot / `reload in`), plus the verified OOB path.
8. **Change window & approvals** — who signs the go/no-go, customer-notification state, MOP peer-review.

The point: **the engineer's deliverable is the intent + the verification + the back-out — great instructions — not the hand-typed commands.** The commands are generated; the judgment is in what "done" and "safe" mean.

---

## 6. The OSI dimension (L1–L3)

The platform is layer-aware because *changes, blast radius, and verification differ sharply by layer.*

| Layer | What lives here | What the platform generates / verifies | Blast-radius character |
|-------|-----------------|----------------------------------------|------------------------|
| **L1 — Physical** | Fiber, optics/λ, DWDM/OTN, patching, LAG members, port/MTU, power. | Optical budget & interface config; verify light levels, errors, LAG member state; reconcile "the other end" against the graph. | Localized but *hard-down* — no protocol reroutes around a dark fiber unless L3 was designed for it. |
| **L2 — Data-link** | Ethernet, VLANs, STP/MSTP, LACP, EVPN/VXLAN, L2VPN, MTU/jumbo, storm control. | Bundle & encap config, EVPN service config; verify LACP up, MAC learning, no loops, MTU consistency end-to-end. | **Loops and MTU black-holes are silent and wide.** Verification must be assertive, not eyeballed. |
| **L3 — Network** | IP/IPAM, OSPF/IS-IS, BGP, MPLS/Segment Routing, VRF/L3VPN, route policy, RPKI. | Addressing, IGP metrics, BGP sessions & policy, label/SR plan; verify adjacencies, prefix counts, best-path, no leaks, ROA validity. | **Widest and fastest.** A policy error propagates across the AS — and beyond — in seconds. Route leaks are the canonical worst case. |

Layer-awareness feeds two things: **review routing** (an L3 BGP-policy change pulls the routing-policy and route-leak lenses; an L1 change pulls the optical/topology lens) and **execution ordering** (bring L1 up and verified before L2, L2 before L3 — and tear down in reverse).

---

## 7. The phase model

The same shape as the SDLC — collaborate up front, then run — with a networking-hardened execution engine.

```
intent-triage → design-authoring → change-decomposition │ change-execution → change-review → verification
  (human+LLM)     (human+LLM)         (human+LLM)         │  (DETERMINISTIC)     (LLM)      (human+LLM)
        ── JUDGMENT PHASES: collaborative, gated ──       │  ── AUTONOMOUS ENGINE, human go/no-go ──
```

- **intent-triage** — capture the ask ("new peering," "migrate customer," "add a PoP," "fix asymmetric routing") and prioritize.
- **design-authoring** — the Design or Change spec: intent, target state, addressing, routing policy, verification, back-out. Ends at a **sign-off gate** (peer-reviewed MOP).
- **change-decomposition** — break the design into ordered, per-device change units with declared scope (which devices/sessions/services each touches), sequenced by dependency and blast radius, slotted into maintenance windows.
- **change-execution — the deterministic engine.** Per change unit, in blast-radius-safe order:
  1. **Pre-validate on the digital twin** — analyze the generated config against a network snapshot / lab: no loops, no leaks, policy does what intent says, no unintended prefix changes. *This is the compiler + unit test.*
  2. **Confirm OOB reachability** and take a **pre-change snapshot** for rollback.
  3. **Push with an automatic, time-bounded safety net** — commit-confirmed (Junos), `commit confirmed`/`configure replace` rollback (IOS-XR), archived `reload in` (IOS). If we don't confirm health in time, the box reverts itself.
  4. **Post-verify against the intent assertions** — sessions up, prefix counts in range, traffic on the expected path, no collateral withdrawals.
  5. **Confirm or auto-roll-back.** Green → confirm the commit. Red → automatic back-out to the snapshot, and escalate.
  6. **Stage:** canary one device/session, verify, then widen — never all-at-once on the core.
- **change-review — LLM multi-lens panel** on the generated diff, routed by layer/scope: routing-policy lens, route-leak/blast-radius lens, security/ACL lens, addressing-correctness lens, vendor-idiom lens, compliance lens.
- **verification** — confirm the *design's* success criteria end-to-end (not just per-device), reconcile the graph to reality, close the change.

**The escape hatch** (borrowed directly): when the engine finds the design or decomposition is wrong — the twin says the policy leaks, or a change unit's scope is bigger than declared — it stops and escalates *back into a judgment phase* (amend the design / re-decompose), then resumes. It does not improvise on a live router.

---

## 8. The hard problems networking adds

This is the credibility section — the places where "just do what the SDLC did" is wrong, and what we do instead.

**8.1 Blast radius & irreversibility.**
Software rolls back a commit; a live routing table does not. *Every* unattended change is wrapped in an automatic, time-bounded back-out (commit-confirmed / config-replace / reload-in) and gated on a **verified out-of-band path** to the device. The engine computes blast radius from the graph and refuses to exceed a change's declared ceiling. Core-touching changes are always staged (canary → widen), never atomic-all.

**8.2 Brownfield, multi-vendor, over a CLI.**
We can't assume NETCONF/YANG everywhere — much of the estate is CLI, some telnet-only. The platform needs a **vendor-abstraction layer**: intent → vendor-correct config generation, and a **structured-parsing layer** for reading state back (pyATS/Genie, TextFSM, NETCONF/gNMI where available). SecureCRT-style access isn't replaced overnight — it's *wrapped*: the same sessions the engineer runs today become captured, structured, replayable runs.

**8.3 No compiler → the digital twin is mandatory.**
Software's pre-merge gate is type-check + unit tests. Ours is **config analysis / snapshot simulation** (Batfish-style) and/or a **lab / digital twin**. A change that hasn't been validated against a model of the network doesn't reach the engine's push step. This is the single biggest safety investment and the thing that makes autonomous execution defensible.

**8.4 Live state & timing.**
"Current state" is a moving target — sessions flap, traffic shifts, maintenance overlaps. Pre-checks are captured at push time, not spec-authoring time; verification tolerances are ranges, not exact matches; and the engine respects change-window boundaries and concurrent-change locks so two changes don't collide on the same device.

**8.5 SLAs, customers, and regulation.**
ISP changes carry contractual SLAs and can cause *global* incidents (route leaks, RPKI mishaps). The go/no-go at the change window stays human. Customer notification state is part of the spec. Compliance lenses (RPKI/ROA validity, max-prefix, BOGON/martian filtering, no-export hygiene) are non-negotiable review gates.

**8.6 Lock-yourself-out.**
The classic: an ACL or interface change severs the session you're on. Mitigations are structural — validate management/OOB reachability is preserved *before* push, order changes so the management path is never the thing being cut mid-change, and always keep the confirmed-commit timer as the backstop.

---

## 9. Who does what

```
intent-triage → design-authoring → change-decomposition │ change-execution → change-review → verification
  HUMAN + LLM     HUMAN + LLM          HUMAN + LLM        │   ENGINE (twin-  LLM PANEL   HUMAN + LLM
   ── collaborative, gated: human attention ──           │   gated, staged)            ↑ go/no-go + OOB
```

| Stage | AI does | Human does |
|-------|---------|------------|
| **Intent** | Capture, normalize, prioritize change requests & design asks | Decide what's worth doing; set priority; own customer relationships |
| **Design / MOP** | Draft the design & change spec from intent; generate config; compute blast radius; propose verification + back-out | Own the intent and the risk call; set architecture direction; peer-review the MOP; **sign off** |
| **Decomposition** | Order change units by dependency & blast radius; declare scope; slot windows | Confirm windows, sequencing, and customer impact |
| **Execution** | Twin-validate → OOB check → snapshot → staged push → post-verify → confirm/rollback, per unit | **Own the go/no-go at the window; hold the OOB lifeline** |
| **Review** | Multi-lens panel on the config diff (policy, leak, security, addressing, vendor-idiom, compliance) | — (humans gate intent & the window, not every line) |
| **Verification** | Reconcile graph↔reality; confirm design success criteria; close the change | Confirm completion; own the SLA call |
| **NOC / incident** | Always-on: correlate telemetry/syslog/traps against intent; detect drift; propose fixes | Severity calls, customer comms, authorize the fix |

**What stays human forever:** the go/no-go on production, the out-of-band recovery, architecture & capacity direction, customer/regulatory accountability, and the severity call during an incident.

**The NOC agent** (the always-on analog of the SDLC's bug intake): it continuously diffs observed state against the intended-state graph, so an outage surfaces as *"session X is down, violating intent assertion Y, last changed by run Z"* — a spec violation with a cause, not a blank ticket.

---

## 10. Tooling & architecture sketch

Layers, roughly bottom-up. Each row is a build-vs-buy decision (§12).

| Layer | Job | Candidate building blocks |
|-------|-----|---------------------------|
| **Source of truth** | The intended-state graph | NetBox (+ custom intent model) or a purpose-built store |
| **Device access** | Reach the boxes (incl. brownfield CLI/telnet + OOB) | Netmiko/Scrapli/NAPALM; NETCONF/gNMI where available; the SecureCRT reality wrapped, not discarded |
| **State parsing** | CLI/structured → data | pyATS/Genie, TextFSM, NAPALM getters, gNMI/YANG |
| **Config generation** | Intent → vendor-correct config | Jinja/templates + vendor models; NAPALM config-replace |
| **Digital twin / pre-validation** | The "compiler" | Batfish (snapshot analysis) and/or a physical/virtual lab |
| **Telemetry** | Continuous observed state | Streaming telemetry/gNMI, SNMP, syslog, BMP for BGP |
| **Execution engine** | Twin-gate → staged push → verify → rollback | Deterministic workflow (the SDLC's `execute-spec` analog), pure-core / effects-at-the-edges |
| **Review panel** | LLM multi-lens config review | Lens registry routed by layer/scope (the SDLC's `review-constraints` analog) |
| **Codified process** | Teach agents the process & domain | `.ai/`-style skills: neteng process skills + vendor/domain skills (BGP-policy, EVPN, IS-IS, optical…) |

The codification story is a direct lift: **behavioral discipline + neteng process skills + vendor/domain skills**, composed the same way the SDLC composes its three skill layers.

---

## 11. The wedge — crawl, walk, run on autonomy

Autonomy on live ISP core is earned, not assumed. Proposed sequence, each stage proving the next is safe:

- **Crawl — read-only reconciliation & drift detection (no writes).** Build the intended-state graph; continuously diff it against reality. Immediate value (find drift, undocumented changes, policy inconsistencies, RPKI gaps) at *zero* blast risk. This also *builds the digital-twin corpus* we need for the next stage.
- **Walk — config generation with human push.** The platform authors the change spec, generates vendor-correct config, twin-validates it, and produces the verification + back-out — but a human pushes it in SecureCRT. The engineer's job shifts from *typing* to *approving*. Trust accrues.
- **Run — supervised auto-push, lab first, then low-blast edge.** The engine executes the staged push→verify→rollback loop, first in the lab/twin, then on low-blast-radius edge changes (a single customer turn-up in a window), always with the confirmed-commit backstop and human go/no-go. Core-touching autonomy is the *last* thing we earn, if ever.

**Recommended first project:** the Crawl stage on one client's network — stand up the intended-state graph and drift detection. It's high-value, zero-risk, and it produces the source of truth and twin corpus that everything else needs.

---

## 12. What I'd like your steer on

The forks that genuinely change the shape of this — your call as the CCIE in the room:

1. **The wedge.** Do you agree read-only drift-detection is the right first proof, or would you rather prove config-generation-with-human-push on day-2 changes first? (I lean drift-detection: zero blast risk, builds the twin corpus.)
2. **Greenfield vs. day-2.** Is the higher-value target *architecting & building* new core (design specs) or *automating day-2 change* on existing networks (change specs)? Your three clients may pull different ways.
3. **Autonomy ceiling.** Where's the honest line on unattended writes to production core — never? lab-only? low-blast edge in a window? This sets how aggressive the engine can be.
4. **Vendor priority.** Which vendor/OS mix dominates your three clients (IOS-XR? Junos? SR OS?) — that decides where the abstraction layer earns its keep first.
5. **Build vs. buy for the foundation.** Lean on NetBox + Batfish + pyATS as building blocks, or is there a reason the source-of-truth / twin needs to be purpose-built for SP-core scale?
6. **Standards to anchor on.** How much do we lean on RFC 9315 (Intent-Based Networking) / IETF network-management models vs. defining our own intent schema pragmatically for the estate you actually run?

---

*Next step after we align on the above: turn the chosen wedge into the first Design spec using the `spec-authoring` flow — the same front-phase discipline that's been working for the SDLC.*
