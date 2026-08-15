"""Baselines — role -> baseline command set, wired from the net-login-and-baseline skill.

The commands here are the machine-runnable form of the skill's role sets. Paging
is disabled by the transport at session open, so we keep commands clean (no
`| no-more`); `| count` is kept where a numeric baseline is the whole point.

Keyed by (os_family, role). Falls back to a sensible per-OS default when the
exact role isn't mapped.
"""

from __future__ import annotations

# --- Junos ------------------------------------------------------------------

_JUNOS_ROUTER = [
    "show configuration | display set",
    "show bgp summary",
    "show bgp neighbor",
    "show ospf neighbor",
    "show ospf interface",
    "show ospf database",
    "show route protocol ospf | count",
    "show route protocol direct | count",
    "show route protocol static | count",
    "show interfaces terse",
    "show arp no-resolve",
    "show chassis hardware",
    "show chassis alarms",
    "show chassis environment",
    "show chassis fpc",
    "show chassis firmware",
    "show version invoke-on all-routing-engines",
    "show system alarms",
    "show ntp associations",
    "show system boot-messages",
]

_JUNOS_SWITCH = [
    "show configuration | display set",
    "show vrrp summary",
    "show ethernet-switching table",
    "show vlans",
    "show interfaces terse",
    "show chassis hardware detail",
    "show chassis routing-engine",
    "show chassis alarms",
    "show chassis environment",
    "show chassis fpc pic-status",
    "show version detail",
    "show system alarms",
    "show system uptime",
    "show system storage",
    "show ntp associations",
    "show virtual-chassis status",
    "show system boot-messages",
]

_JUNOS_FIREWALL = [
    "show configuration | display set",
    "show chassis cluster status",
    "show chassis cluster interface",
    "show security flow session summary",
    "show route",
    "show bgp summary",
    "show interfaces terse",
    "show arp no-resolve",
    "show chassis hardware",
    "show chassis alarms",
    "show chassis environment",
    "show version invoke-on all-routing-engines",
    "show system alarms",
    "show ntp associations",
    "show system boot-messages",
]

# --- Cisco IOS/IOS-XE/NX-OS (generic starting point) ------------------------

_CISCO_ROUTER = [
    "show running-config",
    "show ip bgp summary",
    "show ip ospf neighbor",
    "show ip route summary",
    "show ip interface brief",
    "show interfaces",
    "show ip arp",
    "show inventory",
    "show environment",
    "show version",
    "show logging",
    "show ntp associations",
]

_CISCO_SWITCH = [
    "show running-config",
    "show vlan brief",
    "show interfaces status",
    "show mac address-table",
    "show spanning-tree",
    "show ip interface brief",
    "show inventory",
    "show environment",
    "show version",
    "show logging",
]

# ---------------------------------------------------------------------------

_TABLE: dict[tuple[str, str], list[str]] = {
    ("junos", "edge-router"): _JUNOS_ROUTER,
    ("junos", "core"): _JUNOS_ROUTER,
    ("junos", "router"): _JUNOS_ROUTER,
    ("junos", "aggregation"): _JUNOS_SWITCH,
    ("junos", "access"): _JUNOS_SWITCH,
    ("junos", "switch"): _JUNOS_SWITCH,
    ("junos", "firewall"): _JUNOS_FIREWALL,
    ("iosxe", "router"): _CISCO_ROUTER,
    ("iosxr", "router"): _CISCO_ROUTER,
    ("nxos", "router"): _CISCO_ROUTER,
    ("iosxe", "switch"): _CISCO_SWITCH,
    ("nxos", "switch"): _CISCO_SWITCH,
}

_OS_DEFAULT: dict[str, list[str]] = {
    "junos": _JUNOS_ROUTER,
    "iosxe": _CISCO_ROUTER,
    "iosxr": _CISCO_ROUTER,
    "nxos": _CISCO_ROUTER,
    "eos": _CISCO_ROUTER,
}

_ROUTER_ROLES = {"edge-router", "core", "router"}
_SWITCH_ROLES = {"aggregation", "access", "switch"}


def baseline_commands(os_family: str, role: str) -> list[str]:
    os_family = (os_family or "").lower()
    role = (role or "").lower()
    if (os_family, role) in _TABLE:
        return list(_TABLE[(os_family, role)])
    # role-family fallback
    if os_family == "junos":
        if role in _SWITCH_ROLES:
            return list(_JUNOS_SWITCH)
        if role == "firewall":
            return list(_JUNOS_FIREWALL)
        return list(_JUNOS_ROUTER)
    if os_family in _OS_DEFAULT:
        if role in _SWITCH_ROLES:
            return list(_CISCO_SWITCH)
        return list(_OS_DEFAULT[os_family])
    raise KeyError(f"no baseline set for os={os_family!r} role={role!r}")
