"""diff — turn two baselines (before/after) into a drift report.

The whole value of a baseline is the *diff*. But a naive text diff of `show`
output is almost all noise — counters, uptimes, ages and timestamps change every
second. So this module separates **material change** from **volatile noise**:

  1. Config (`show configuration | display set`) is diffed as a SET/DELETE line
     delta — the exact config that changed. This is the money output.
  2. Known commands get **metric extraction**: BGP established/down peers, route
     `| count` totals, alarm presence, version, cluster state, session count.
     Deltas in these are compared as values and classified by severity.
  3. Everything else is **normalized** (volatile fields masked) then line-diffed,
     so residual changes surface without the clock-tick noise.

Severity: OK < NOTABLE < ALERT. A capture's overall severity is the max.
The diff has no knowledge of intent — a version change during a planned upgrade
is still flagged ALERT ("material, confirm it was intended"); intent lives in the
change spec, not here.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

OK, NOTABLE, ALERT = "ok", "notable", "alert"
_RANK = {OK: 0, NOTABLE: 1, ALERT: 2}


def _max_sev(a: str, b: str) -> str:
    return a if _RANK[a] >= _RANK[b] else b


# --- volatile-noise normalization ------------------------------------------

_VOLATILE = [
    (re.compile(r"\b\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\s+\w+)?\b"), "<TS>"),   # 2025-09-08 12:00:01 UTC
    (re.compile(r"\b\d{2}:\d{2}:\d{2}\b"), "<TIME>"),                                  # 12:00:01
    (re.compile(r"\b\d+d\s+\d+:\d+:\d+\b"), "<AGE>"),                                  # 3d 04:05:12 (BGP Last Up/Dwn)
    (re.compile(r"\bup\s+\d+\s+day.*$", re.I), "up <UPTIME>"),                         # uptime lines
    (re.compile(r"\b(?:Input|Output)\s+(?:bytes|packets)\s*:\s*[\d,]+.*$", re.I), r"<COUNTER>"),
    (re.compile(r"\b(?:offset|delay|jitter|reach|poll|when)\s*[:=]?\s*[-\d.]+", re.I), "<NTPVAR>"),
]


def normalize(text: str) -> list[str]:
    """Mask volatile fields and return material, stripped, non-empty lines."""
    out = []
    for raw in text.splitlines():
        line = raw.rstrip()
        # drop pure comment/mock scaffolding lines so they don't dominate the diff
        if line.lstrip().startswith("#"):
            continue
        for pat, repl in _VOLATILE:
            line = pat.sub(repl, line)
        line = line.strip()
        if line:
            out.append(line)
    return out


# --- metric extractors (per known command) ---------------------------------

def _extract_bgp_summary(out: str) -> dict:
    m = {}
    dp = re.search(r"Down\s+peers:\s*(\d+)", out, re.I)
    pe = re.search(r"\bPeers:\s*(\d+)", out, re.I)
    if dp:
        m["down_peers"] = int(dp.group(1))
    if pe:
        m["peers"] = int(pe.group(1))
    # count established sessions (Junos shows "Establ" in the per-peer state column)
    m["established"] = len(re.findall(r"\bEstabl\b", out))
    return m


def _extract_count(out: str) -> dict:
    m = re.search(r"Count:\s*(\d+)", out, re.I)
    if m:
        return {"count": int(m.group(1))}
    return {}


def _extract_alarms(out: str) -> dict:
    if re.search(r"No alarms currently active", out, re.I):
        return {"alarms_active": 0, "alarm_lines": []}
    # alarm table rows carry a class/severity; count non-header, non-blank lines
    lines = [l.strip() for l in out.splitlines()
             if l.strip() and not re.match(r"(Alarm time|Class|---)", l.strip(), re.I)
             and "# " not in l]
    return {"alarms_active": len(lines), "alarm_lines": lines[:10]}


def _extract_version(out: str) -> dict:
    m = re.search(r"(?:Junos:|JUNOS Software Release\s*\[)\s*([\w.\-]+)", out)
    if m:
        return {"version": m.group(1)}
    m = re.search(r"\b(\d\d\.\d[\w.\-]*)\b", out)  # e.g. 23.4R2-S3
    return {"version": m.group(1)} if m else {}


def _extract_cluster(out: str) -> dict:
    states = re.findall(r"\b(primary|secondary|lost|hold|ineligible|disabled)\b", out, re.I)
    return {"cluster_states": [s.lower() for s in states]} if states else {}


def _extract_sessions(out: str) -> dict:
    m = re.search(r"(?:Current sessions|Valid sessions|Sessions):\s*(\d+)", out, re.I)
    return {"sessions": int(m.group(1))} if m else {}


# match on a substring of the command
_EXTRACTORS = [
    ("show bgp summary", _extract_bgp_summary),
    ("| count", _extract_count),
    ("show chassis alarms", _extract_alarms),
    ("show system alarms", _extract_alarms),
    ("show version", _extract_version),
    ("show chassis cluster status", _extract_cluster),
    ("show security flow session summary", _extract_sessions),
]

_CONFIG_CMD = "display set"


def _extractor_for(cmd: str):
    for needle, fn in _EXTRACTORS:
        if needle in cmd:
            return fn
    return None


# --- per-command diff -------------------------------------------------------

@dataclass
class CommandDiff:
    command: str
    severity: str = OK
    summary: list[str] = field(default_factory=list)
    added: list[str] = field(default_factory=list)     # config: new set-lines; else material added lines
    removed: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "command": self.command, "severity": self.severity,
            "summary": self.summary, "added": self.added, "removed": self.removed,
        }


def _diff_config(cmd: str, before: str, after: str) -> CommandDiff:
    b = {l.strip() for l in before.splitlines() if l.strip() and not l.lstrip().startswith("#")}
    a = {l.strip() for l in after.splitlines() if l.strip() and not l.lstrip().startswith("#")}
    added = sorted(a - b)
    removed = sorted(b - a)
    d = CommandDiff(command=cmd, added=added, removed=removed)
    if added or removed:
        d.severity = NOTABLE
        d.summary.append(f"config changed: +{len(added)} / -{len(removed)} set-lines")
    else:
        d.summary.append("config identical")
    return d


def _route_count_severity(before: int, after: int, tol_pct: float = 15.0) -> tuple[str, str]:
    if before == after:
        return OK, ""
    if after == 0 and before > 0:
        return ALERT, f"route count dropped to ZERO ({before} → 0)"
    delta = after - before
    pct = abs(delta) / before * 100 if before else 100.0
    sev = ALERT if pct > 40 else NOTABLE
    return sev, f"route count {before} → {after} ({'+' if delta > 0 else ''}{delta}, {pct:.0f}%)"


def _diff_metrics(cmd: str, mb: dict, ma: dict) -> CommandDiff:
    d = CommandDiff(command=cmd)

    # BGP
    if "established" in mb or "established" in ma:
        eb, ea = mb.get("established", 0), ma.get("established", 0)
        db, da = mb.get("down_peers"), ma.get("down_peers")
        if ea < eb:
            d.severity = _max_sev(d.severity, ALERT)
            d.summary.append(f"BGP established sessions DROPPED {eb} → {ea}")
        elif ea > eb:
            d.severity = _max_sev(d.severity, NOTABLE)
            d.summary.append(f"BGP established sessions rose {eb} → {ea}")
        if db is not None and da is not None and da > db:
            d.severity = _max_sev(d.severity, ALERT)
            d.summary.append(f"BGP down peers rose {db} → {da}")
        if not d.summary:
            d.summary.append(f"BGP stable ({ea} established)")
        return d

    # route counts
    if "count" in mb or "count" in ma:
        sev, msg = _route_count_severity(mb.get("count", 0), ma.get("count", 0))
        d.severity = sev
        d.summary.append(msg or "route count unchanged")
        return d

    # alarms
    if "alarms_active" in mb or "alarms_active" in ma:
        ab, aa = mb.get("alarms_active", 0), ma.get("alarms_active", 0)
        if aa > ab:
            d.severity = ALERT
            d.summary.append(f"NEW alarms present ({ab} → {aa})")
            d.added = [l for l in ma.get("alarm_lines", []) if l not in mb.get("alarm_lines", [])]
        elif aa < ab:
            d.severity = NOTABLE
            d.summary.append(f"alarms cleared ({ab} → {aa})")
        else:
            d.summary.append("no alarm change")
        return d

    # version
    if "version" in mb or "version" in ma:
        vb, va = mb.get("version"), ma.get("version")
        if vb != va:
            d.severity = ALERT
            d.summary.append(f"VERSION changed {vb} → {va} (confirm this was intended)")
        else:
            d.summary.append(f"version stable ({va})")
        return d

    # cluster
    if "cluster_states" in mb or "cluster_states" in ma:
        cb, ca = mb.get("cluster_states", []), ma.get("cluster_states", [])
        if cb != ca:
            d.severity = ALERT
            d.summary.append(f"cluster state changed {cb} → {ca}")
        else:
            d.summary.append(f"cluster stable ({ca})")
        return d

    # sessions
    if "sessions" in mb or "sessions" in ma:
        sb, sa = mb.get("sessions", 0), ma.get("sessions", 0)
        if sa == 0 and sb > 0:
            d.severity = ALERT
            d.summary.append(f"flow sessions dropped to ZERO ({sb} → 0)")
        elif sb and abs(sa - sb) / sb > 0.5:
            d.severity = NOTABLE
            d.summary.append(f"flow session count swing {sb} → {sa}")
        else:
            d.summary.append(f"sessions ~stable ({sb} → {sa})")
        return d

    return d


def _diff_text(cmd: str, before: str, after: str, cap: int = 12) -> CommandDiff:
    nb, na = normalize(before), normalize(after)
    sb, sa = set(nb), set(na)
    added = [l for l in na if l not in sb]
    removed = [l for l in nb if l not in sa]
    d = CommandDiff(command=cmd, added=added[:cap], removed=removed[:cap])
    if added or removed:
        d.severity = NOTABLE
        d.summary.append(f"output changed (material): +{len(added)} / -{len(removed)} lines")
    else:
        d.summary.append("no material change (volatile noise ignored)")
    return d


def diff_command(cmd: str, before: str, after: str) -> CommandDiff:
    if _CONFIG_CMD in cmd:
        return _diff_config(cmd, before, after)
    fn = _extractor_for(cmd)
    if fn:
        d = _diff_metrics(cmd, fn(before), fn(after))
        # if metrics found nothing to say, fall back to a normalized text check
        if d.severity == OK and not any("changed" in s or "DROPPED" in s or "rose" in s for s in d.summary):
            txt = _diff_text(cmd, before, after)
            if txt.severity != OK:
                return txt
        return d
    return _diff_text(cmd, before, after)


# --- capture-level diff -----------------------------------------------------

@dataclass
class CaptureDiff:
    device_id: str
    severity: str = OK
    commands: list[CommandDiff] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "device_id": self.device_id,
            "severity": self.severity,
            "commands": [c.as_dict() for c in self.commands],
        }


def _index(session: dict) -> dict[str, str]:
    return {r["command"]: r.get("output", "") for r in session.get("results", [])}


def diff_sessions(before: dict, after: dict) -> CaptureDiff:
    """Diff two capture dicts (SessionResult.as_dict()). Same device assumed."""
    dev = after.get("device_id") or before.get("device_id") or "?"
    bi, ai = _index(before), _index(after)
    cap = CaptureDiff(device_id=dev)
    for cmd in ai:  # iterate in the after-capture order
        if cmd not in bi:
            cd = CommandDiff(command=cmd, severity=NOTABLE, summary=["command new in after-capture"])
        else:
            cd = diff_command(cmd, bi[cmd], ai[cmd])
        cap.commands.append(cd)
        cap.severity = _max_sev(cap.severity, cd.severity)
    for cmd in bi:
        if cmd not in ai:
            cd = CommandDiff(command=cmd, severity=NOTABLE, summary=["command missing from after-capture"])
            cap.commands.append(cd)
            cap.severity = _max_sev(cap.severity, cd.severity)
    return cap


# --- rendering --------------------------------------------------------------

_ICON = {OK: "  ", NOTABLE: "~ ", ALERT: "! "}


def render_text(cap: CaptureDiff, show_ok: bool = False) -> str:
    lines = []
    banner = {OK: "OK — no material drift", NOTABLE: "NOTABLE drift", ALERT: "ALERT — material drift"}[cap.severity]
    lines.append(f"=== baseline diff: {cap.device_id} === [{banner}]")
    shown = 0
    for c in cap.commands:
        if c.severity == OK and not show_ok:
            continue
        shown += 1
        lines.append(f"{_ICON[c.severity]}{c.command}")
        for s in c.summary:
            lines.append(f"      - {s}")
        for a in c.added:
            lines.append(f"      + {a}")
        for r in c.removed:
            lines.append(f"      - (was) {r}")
    if shown == 0:
        lines.append("  (all commands OK — no material change)")
    return "\n".join(lines)
