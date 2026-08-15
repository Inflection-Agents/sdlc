"""Runner — the connect / run / baseline logic, with connect-to-many concurrency.

Pure orchestration over inventory + credentials + transport + baselines. The MCP
server (server.py) is a thin wrapper over these functions; they're also directly
usable from a script or a Nornir-style bulk job.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed

from .baselines import baseline_commands
from .credentials import CredentialResolver
from .inventory import Device, Inventory
from .transport import SessionResult, make_transport


def _run_one(device: Device, resolver: CredentialResolver, commands: list[str],
             *, mock: bool) -> SessionResult:
    cred = None
    if not mock:
        cred = resolver.resolve(device_id=device.id, secret_ref=device.secret_ref)
    sess = SessionResult(device_id=device.id, host=device.host or "", ok=False)
    tp = make_transport(device, cred, mock=mock)
    try:
        tp.open()
        sess.results = tp.send_commands(commands)
        sess.ok = all(r.error is None for r in sess.results)
    except Exception as e:
        sess.error = str(e)
    finally:
        try:
            tp.close()
        except Exception:
            pass
    return sess


def run(inv: Inventory, resolver: CredentialResolver, host: str, commands: list[str],
        *, mock: bool = False) -> SessionResult:
    """Connect to one device (by id or host) and run commands."""
    device = inv.resolve(host)
    return _run_one(device, resolver, commands, mock=mock)


def run_on_many(inv: Inventory, resolver: CredentialResolver, devices: list[Device],
                commands: list[str], *, mock: bool = False, max_concurrency: int = 10
                ) -> list[SessionResult]:
    """Connect to many devices concurrently and run the same commands on each."""
    if not devices:
        return []
    results: list[SessionResult] = []
    workers = min(max_concurrency, len(devices))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {pool.submit(_run_one, d, resolver, commands, mock=mock): d for d in devices}
        for fut in as_completed(futs):
            results.append(fut.result())
    # stable order by device id for reproducible output
    results.sort(key=lambda s: s.device_id)
    return results


def baseline(inv: Inventory, resolver: CredentialResolver, host: str,
             *, mock: bool = False) -> SessionResult:
    """Run the role-appropriate baseline set for one device."""
    device = inv.resolve(host)
    cmds = baseline_commands(device.os, device.role)
    return _run_one(device, resolver, cmds, mock=mock)


def baseline_many(inv: Inventory, resolver: CredentialResolver, devices: list[Device],
                  *, mock: bool = False, max_concurrency: int = 10) -> list[SessionResult]:
    """Baseline many devices concurrently — each gets its own role-appropriate set."""
    if not devices:
        return []
    results: list[SessionResult] = []
    workers = min(max_concurrency, len(devices))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {
            pool.submit(_run_one, d, resolver, baseline_commands(d.os, d.role), mock=mock): d
            for d in devices
        }
        for fut in as_completed(futs):
            results.append(fut.result())
    results.sort(key=lambda s: s.device_id)
    return results
