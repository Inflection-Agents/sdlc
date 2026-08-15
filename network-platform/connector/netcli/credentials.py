"""Credentials — resolve device secrets from a secrets store, at connect time.

The map holds *where and how to reach* a device (host, transport, oob) plus a
`secret_ref` POINTER. The actual username/password/key is resolved here, from:

  1. A vault backend, given a `secret_ref` like "vault://path/to/secret#field".
  2. Environment variables (dev/local default), per-host or global.
  3. An SSH key path (passwordless).

Nothing in this module reads a secret from the inventory/map, and the inventory
loader refuses to load a map that contains one.

The VaultBackend here is a thin, provider-agnostic interface. Wire it to your
real store (HashiCorp Vault, AWS Secrets Manager, CyberArk, env-injected CI
secrets) by implementing `fetch(ref) -> dict`. The default raises with a clear
message so a misconfiguration fails loudly instead of leaking.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol


class CredentialError(Exception):
    pass


@dataclass(frozen=True)
class Credential:
    username: str
    password: str | None = None
    key_path: str | None = None

    def redacted(self) -> dict:
        return {
            "username": self.username,
            "password": "***" if self.password else None,
            "key_path": self.key_path,
        }


class VaultBackend(Protocol):
    def fetch(self, ref: str) -> dict:  # -> {"username": ..., "password"/"key_path": ...}
        ...


class UnconfiguredVault:
    """Default backend: any secret_ref use fails loudly until a real vault is wired."""

    def fetch(self, ref: str) -> dict:
        raise CredentialError(
            f"secret_ref {ref!r} requires a configured vault backend. "
            f"Pass CredentialResolver(vault=<your backend>) implementing fetch(ref)->dict, "
            f"or use env-var credentials for local/dev."
        )


def _env(*names: str) -> str | None:
    for n in names:
        v = os.environ.get(n)
        if v:
            return v
    return None


class CredentialResolver:
    """Resolve a Device (id + optional secret_ref) to a Credential.

    Resolution order:
      1. secret_ref via the vault backend (production path).
      2. Per-host env: NETCLI_<HOSTID>_USERNAME / _PASSWORD / _KEY  (id upper-cased, non-alnum -> _).
      3. Global env: NETCLI_USERNAME / NETCLI_PASSWORD / NETCLI_SSH_KEY.
    """

    def __init__(self, vault: VaultBackend | None = None):
        self.vault = vault or UnconfiguredVault()

    def _from_vault(self, ref: str) -> Credential:
        data = self.vault.fetch(ref)
        if "username" not in data:
            raise CredentialError(f"vault secret {ref!r} missing 'username'")
        return Credential(
            username=data["username"],
            password=data.get("password"),
            key_path=data.get("key_path") or data.get("key"),
        )

    def resolve(self, *, device_id: str, secret_ref: str | None = None) -> Credential:
        if secret_ref:
            return self._from_vault(secret_ref)

        tag = "".join(c if c.isalnum() else "_" for c in device_id).upper()
        user = _env(f"NETCLI_{tag}_USERNAME", "NETCLI_USERNAME")
        pw = _env(f"NETCLI_{tag}_PASSWORD", "NETCLI_PASSWORD")
        key = _env(f"NETCLI_{tag}_KEY", "NETCLI_SSH_KEY")
        if not user:
            raise CredentialError(
                f"no credentials for {device_id!r}: set a secret_ref (vault) or "
                f"NETCLI_USERNAME / NETCLI_PASSWORD (or NETCLI_SSH_KEY) in the environment."
            )
        if not pw and not key:
            raise CredentialError(
                f"credential for {device_id!r} has neither password nor SSH key."
            )
        return Credential(username=user, password=pw, key_path=key)
