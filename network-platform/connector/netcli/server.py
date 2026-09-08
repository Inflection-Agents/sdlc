"""server — the MCP network-CLI connector.

Exposes the "just connect" surface as MCP tools over the topology-map inventory:

    list_devices(role?, site?, vendor?)   -> inventory view
    run(host, commands)                    -> connect, run, disconnect (one device)
    run_on_many(role?/site?/vendor?, commands) -> concurrent across a filter
    baseline(host)                         -> role-appropriate baseline capture
    baseline_many(role?/site?/vendor?)     -> baseline across a filter

Config via environment:
    NETCLI_INVENTORY   path to the topology-map file (JSON, or YAML if PyYAML present)
    NETCLI_MOCK=1      use the offline mock transport (no network, no creds needed)
    NETCLI_MAX_CONC    max concurrent sessions for *_many (default 10)
    Credentials: NETCLI_USERNAME / NETCLI_PASSWORD / NETCLI_SSH_KEY, or per-host
                 NETCLI_<HOSTID>_*, or a vault-backed secret_ref in the map.

Run:  NETCLI_INVENTORY=examples/inventory.aus1.json NETCLI_MOCK=1 python -m netcli.server
"""

from __future__ import annotations

import os

from . import inventory as inv_mod
from .credentials import CredentialResolver
from .diff import diff_sessions, render_text
from .runner import baseline, baseline_many, run, run_on_many
from .snapshots import load_capture, save_capture, snapshot_path


def _load_inventory() -> inv_mod.Inventory:
    path = os.environ.get("NETCLI_INVENTORY")
    if not path:
        raise RuntimeError("set NETCLI_INVENTORY to the topology-map file")
    return inv_mod.load(path)


def _mock() -> bool:
    return os.environ.get("NETCLI_MOCK", "").lower() in ("1", "true", "yes")


def _max_conc() -> int:
    try:
        return int(os.environ.get("NETCLI_MAX_CONC", "10"))
    except ValueError:
        return 10


def build_server():  # pragma: no cover - requires the mcp package
    try:
        from mcp.server.fastmcp import FastMCP
    except ImportError as e:
        raise RuntimeError(
            "the MCP server needs the `mcp` package: `pip install mcp`. "
            "(The core connector — inventory/credentials/transport/runner — works without it.)"
        ) from e

    mcp = FastMCP("netcli")
    inv = _load_inventory()
    resolver = CredentialResolver()  # wire a vault backend here in production

    @mcp.tool()
    def list_devices(role: str = "", site: str = "", vendor: str = "") -> list[dict]:
        """List devices from the topology map, optionally filtered by role/site/vendor."""
        devs = inv.filter(role=role or None, site=site or None, vendor=vendor or None)
        return [
            {"id": d.id, "role": d.role, "vendor": d.vendor, "os": d.os,
             "site": d.site, "host": d.host, "oob": d.oob, "transport": d.transport}
            for d in devs
        ]

    @mcp.tool()
    def run_commands(host: str, commands: list[str]) -> dict:
        """Connect to one device (by id or host) and run commands; returns per-command output."""
        return run(inv, resolver, host, commands, mock=_mock()).as_dict()

    @mcp.tool()
    def run_many(commands: list[str], role: str = "", site: str = "", vendor: str = "") -> list[dict]:
        """Run the same commands concurrently across a filtered set of devices."""
        devs = inv.filter(role=role or None, site=site or None, vendor=vendor or None)
        return [s.as_dict() for s in
                run_on_many(inv, resolver, devs, commands, mock=_mock(), max_concurrency=_max_conc())]

    @mcp.tool()
    def baseline_device(host: str) -> dict:
        """Run the role-appropriate baseline set for one device (login-and-baseline)."""
        return baseline(inv, resolver, host, mock=_mock()).as_dict()

    @mcp.tool()
    def baseline_devices(role: str = "", site: str = "", vendor: str = "") -> list[dict]:
        """Baseline a filtered set of devices concurrently; each gets its own role set."""
        devs = inv.filter(role=role or None, site=site or None, vendor=vendor or None)
        return [s.as_dict() for s in
                baseline_many(inv, resolver, devs, mock=_mock(), max_concurrency=_max_conc())]

    @mcp.tool()
    def snapshot(host: str, label: str = "baseline") -> dict:
        """Baseline one device and save the capture to a snapshot file; returns the path."""
        cap = baseline(inv, resolver, host, mock=_mock()).as_dict()
        path = save_capture(cap, snapshot_path(_snapshot_dir(), cap["device_id"], label))
        return {"path": path, "device_id": cap["device_id"], "ok": cap["ok"],
                "commands": len(cap["results"])}

    @mcp.tool()
    def diff(before_path: str, after_path: str, show_ok: bool = False) -> dict:
        """Diff two saved snapshots into a drift report (structured + rendered text)."""
        cap = diff_sessions(load_capture(before_path), load_capture(after_path))
        return {"report": cap.as_dict(), "rendered": render_text(cap, show_ok=show_ok)}

    return mcp


def _snapshot_dir() -> str:
    return os.environ.get("NETCLI_SNAPSHOT_DIR", "snapshots")


def main() -> None:  # pragma: no cover
    build_server().run()


if __name__ == "__main__":  # pragma: no cover
    main()
