"""Transport — how we actually reach the box.

An abstract `Transport` (open / send_commands / close), plus:
  * MockTransport   — deterministic canned output; runs fully offline (demo/tests/CI).
  * ScrapliTransport — real SSH/telnet via Scrapli (lazy-imported), multi-vendor.

The mock path is what makes this a *runnable* prototype without touching real
gear; the Scrapli path is what you point at production once creds are wired.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Protocol

from .credentials import Credential
from .inventory import Device


@dataclass
class CommandResult:
    command: str
    output: str
    took_ms: int
    error: str | None = None


@dataclass
class SessionResult:
    device_id: str
    host: str
    ok: bool
    results: list[CommandResult] = field(default_factory=list)
    error: str | None = None

    def as_dict(self) -> dict:
        return {
            "device_id": self.device_id,
            "host": self.host,
            "ok": self.ok,
            "error": self.error,
            "results": [
                {"command": r.command, "output": r.output, "took_ms": r.took_ms, "error": r.error}
                for r in self.results
            ],
        }


class Transport(Protocol):
    def open(self) -> None: ...
    def send_commands(self, commands: list[str]) -> list[CommandResult]: ...
    def close(self) -> None: ...


# Map our os field -> Scrapli community/core platform names.
_SCRAPLI_PLATFORM = {
    "junos": "juniper_junos",
    "iosxe": "cisco_iosxe",
    "ios": "cisco_iosxe",
    "iosxr": "cisco_iosxr",
    "nxos": "cisco_nxos",
    "eos": "arista_eos",
    "sros": "nokia_sros",
}


class MockTransport:
    """Returns deterministic, obviously-fake output. Never touches the network."""

    def __init__(self, device: Device, credential: Credential | None = None):
        self.device = device
        self._open = False

    def open(self) -> None:
        self._open = True

    def send_commands(self, commands: list[str]) -> list[CommandResult]:
        if not self._open:
            raise RuntimeError("transport not open")
        out = []
        for cmd in commands:
            body = (
                f"# MOCK OUTPUT — {self.device.id} ({self.device.vendor}/{self.device.os})\n"
                f"# $ {cmd}\n"
                f"# (offline mock; wire ScrapliTransport for real output)\n"
            )
            out.append(CommandResult(command=cmd, output=body, took_ms=1))
        return out

    def close(self) -> None:
        self._open = False


class ScrapliTransport:
    """Real SSH/telnet via Scrapli. Lazy-imports scrapli so the core stays dep-free."""

    def __init__(self, device: Device, credential: Credential):
        self.device = device
        self.cred = credential
        self._conn = None

    def _driver(self):
        try:
            from scrapli import Scrapli  # lazy import
        except ImportError as e:
            raise RuntimeError(
                "ScrapliTransport requires scrapli: `pip install scrapli` "
                "(and `scrapli-community` for some platforms)."
            ) from e

        platform = _SCRAPLI_PLATFORM.get((self.device.os or "").lower())
        if not platform:
            raise RuntimeError(f"no Scrapli platform mapping for os={self.device.os!r}")

        args = {
            "host": self.device.connect_target,
            "platform": platform,
            "auth_username": self.cred.username,
            "auth_strict_key": False,
            "timeout_socket": 15,
            "timeout_ops": 60,
        }
        if self.device.transport == "telnet":
            args["transport"] = "telnet"
        if self.cred.key_path:
            args["auth_private_key"] = self.cred.key_path
        if self.cred.password:
            args["auth_password"] = self.cred.password
        return Scrapli(**args)

    def open(self) -> None:
        self._conn = self._driver()
        self._conn.open()  # pager is disabled by Scrapli's on-open for known platforms

    def send_commands(self, commands: list[str]) -> list[CommandResult]:
        if self._conn is None:
            raise RuntimeError("transport not open")
        results = []
        for cmd in commands:
            t0 = time.time()
            try:
                resp = self._conn.send_command(cmd)
                results.append(CommandResult(
                    command=cmd,
                    output=resp.result,
                    took_ms=int((time.time() - t0) * 1000),
                    error="failed" if resp.failed else None,
                ))
            except Exception as e:  # keep going; one bad command shouldn't abort the baseline
                results.append(CommandResult(
                    command=cmd, output="", took_ms=int((time.time() - t0) * 1000), error=str(e)
                ))
        return results

    def close(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            finally:
                self._conn = None


def make_transport(device: Device, credential: Credential | None, *, mock: bool) -> Transport:
    if mock:
        return MockTransport(device, credential)
    if credential is None:
        raise RuntimeError("real transport requires a resolved credential")
    return ScrapliTransport(device, credential)
