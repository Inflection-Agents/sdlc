"""snapshots — persist a baseline capture to disk so before/after can be diffed.

A snapshot is just SessionResult.as_dict() written as JSON, named by device +
label + timestamp. `net-login-and-baseline`'s before/after/diff loop is: snapshot
before a change, snapshot after, then `diff.diff_sessions(before, after)`.
"""

from __future__ import annotations

import json
import os
import time


def snapshot_path(dir_: str, device_id: str, label: str) -> str:
    safe = "".join(c if c.isalnum() or c in ".-" else "_" for c in device_id)
    ts = time.strftime("%Y%m%d-%H%M%S")
    os.makedirs(dir_, exist_ok=True)
    return os.path.join(dir_, f"{safe}_{label}_{ts}.json")


def save_capture(capture: dict, path: str) -> str:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(capture, fh, indent=2)
    return path


def load_capture(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)
