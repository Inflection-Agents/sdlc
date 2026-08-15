"""Inventory — the connector's device list, sourced from the topology map.

The `net-topology-map` skill produces a structured map whose `devices:` block
IS the connector's inventory. We never re-list devices; we read the map.

Security guardrail: the inventory must NOT contain credentials. If a device
carries a literal `password`/`secret`/`key` value (as opposed to a `secret_ref`
pointer), we refuse to load it — secrets belong in the vault, not the map/git.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any, Iterable


# Fields that must never appear in the map (they would end up in git).
_FORBIDDEN_SECRET_KEYS = {"password", "passwd", "secret", "ssh_password", "enable_password", "private_key"}


class InventoryError(Exception):
    pass


@dataclass(frozen=True)
class Device:
    id: str
    role: str = "unknown"          # edge-router | core | aggregation | access | firewall | switch ...
    vendor: str = "unknown"        # juniper | cisco | arista | nokia ...
    os: str = "unknown"            # junos | iosxe | iosxr | nxos | eos | sros ...
    site: str = "unknown"
    host: str | None = None        # mgmt IP or DNS name to connect to
    oob: str | None = None         # out-of-band / console path (recorded, not auto-used)
    transport: str = "ssh"         # ssh | telnet
    secret_ref: str | None = None  # POINTER to a vault secret, e.g. "vault://net/aus1#edge"
    extras: dict[str, Any] = field(default_factory=dict)

    @property
    def connect_target(self) -> str:
        if not self.host:
            raise InventoryError(f"device {self.id!r} has no host (mgmt IP/DNS) to connect to")
        return self.host


class Inventory:
    def __init__(self, devices: Iterable[Device], network: str = "unknown"):
        self._by_id: dict[str, Device] = {}
        for d in devices:
            self._by_id[d.id] = d
        self.network = network

    def __len__(self) -> int:
        return len(self._by_id)

    def all(self) -> list[Device]:
        return list(self._by_id.values())

    def get(self, device_id: str) -> Device:
        try:
            return self._by_id[device_id]
        except KeyError:
            raise InventoryError(f"unknown device {device_id!r}") from None

    def resolve(self, host_or_id: str) -> Device:
        """Accept either a device id or a bare host/IP; return the Device."""
        if host_or_id in self._by_id:
            return self._by_id[host_or_id]
        for d in self._by_id.values():
            if d.host == host_or_id:
                return d
        raise InventoryError(f"{host_or_id!r} is not a known device id or host")

    def filter(self, *, role: str | None = None, site: str | None = None,
               vendor: str | None = None, os: str | None = None) -> list[Device]:
        out = self.all()
        if role:
            out = [d for d in out if d.role == role]
        if site:
            out = [d for d in out if d.site == site]
        if vendor:
            out = [d for d in out if d.vendor == vendor]
        if os:
            out = [d for d in out if d.os == os]
        return out


def _check_no_secrets(raw: dict[str, Any], where: str) -> None:
    for k in raw:
        if k.lower() in _FORBIDDEN_SECRET_KEYS:
            raise InventoryError(
                f"{where}: field {k!r} looks like a credential. "
                f"Secrets must not live in the topology map — use a `secret_ref` "
                f"pointer and store the secret in the vault."
            )


def from_mapping(data: dict[str, Any]) -> Inventory:
    """Build an Inventory from an already-parsed topology-map mapping."""
    network = data.get("network", "unknown")
    devices: list[Device] = []
    for raw in data.get("devices", []):
        _check_no_secrets(raw, where=f"device {raw.get('id', '?')}")
        mgmt = raw.get("mgmt", {}) or {}
        _check_no_secrets(mgmt, where=f"device {raw.get('id', '?')} .mgmt")
        devices.append(Device(
            id=raw["id"],
            role=raw.get("role", "unknown"),
            vendor=raw.get("vendor", "unknown"),
            os=raw.get("os", "unknown"),
            site=raw.get("site", raw.get("location", "unknown")),
            host=mgmt.get("ip") or mgmt.get("host") or raw.get("host"),
            oob=mgmt.get("oob") or raw.get("oob"),
            transport=raw.get("transport", "ssh"),
            secret_ref=raw.get("secret_ref") or mgmt.get("secret_ref"),
            extras={k: v for k, v in raw.items()
                    if k not in {"id", "role", "vendor", "os", "site", "location",
                                 "host", "oob", "transport", "secret_ref", "mgmt"}},
        ))
    return Inventory(devices, network=network)


def load(path: str) -> Inventory:
    """Load an inventory from a topology-map file (JSON always; YAML if PyYAML present)."""
    with open(path, "r", encoding="utf-8") as fh:
        text = fh.read()
    ext = os.path.splitext(path)[1].lower()
    if ext in (".yaml", ".yml"):
        try:
            import yaml  # optional dependency
        except ImportError as e:
            raise InventoryError(
                f"{path} is YAML but PyYAML is not installed; "
                f"`pip install pyyaml` or provide JSON."
            ) from e
        data = yaml.safe_load(text)
    else:
        data = json.loads(text)
    if not isinstance(data, dict):
        raise InventoryError(f"{path}: expected a mapping at the top level")
    return from_mapping(data)
