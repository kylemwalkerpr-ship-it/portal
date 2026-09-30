"""Pure, locally testable logic for the mounted Modal Volume proof."""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import PurePosixPath
from typing import Callable

ARTIFACT_ROOT = "proofs/modal-storage-proof"
MOUNT = "/mnt/artifacts"
MAX_BYTES = 1024


def artifact_relative_path(proof_id: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", proof_id):
        raise ValueError("proof id must be a UUID")
    path = PurePosixPath(ARTIFACT_ROOT) / f"{proof_id}.bin"
    if path.is_absolute() or ".." in path.parts or not path.name:
        raise ValueError("artifact path escaped the proof root")
    return str(path)


def mounted_path(relative_path: str, mount: str = MOUNT) -> str:
    parsed = PurePosixPath(relative_path)
    if parsed.is_absolute() or parsed.parent != PurePosixPath(ARTIFACT_ROOT) or not re.fullmatch(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.bin", parsed.name
    ):
        raise ValueError("refusing path outside the single-artifact proof scope")
    return os.path.join(mount, *parsed.parts)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _created_parent_directories(parent: str, mount: str) -> list[str]:
    """Return only missing in-scope directories this writer will create."""
    root = os.path.realpath(mount)
    parent_real = os.path.realpath(parent)
    if os.path.commonpath((root, parent_real)) != root:
        raise ValueError("artifact parent escaped the mount")
    missing: list[str] = []
    cursor = parent
    while not os.path.exists(cursor):
        missing.append(cursor)
        next_cursor = os.path.dirname(cursor)
        if next_cursor == cursor:
            raise ValueError("artifact parent has no existing ancestor")
        cursor = next_cursor
    if not os.path.isdir(cursor):
        raise NotADirectoryError(cursor)
    return list(reversed(missing))


def write_local(root: str, relative_path: str, payload: bytes, commit: Callable[[], None]) -> dict[str, object]:
    if len(payload) > MAX_BYTES:
        raise ValueError("proof artifact exceeds 1 KiB")
    target = mounted_path(relative_path, root)
    parent = os.path.dirname(target)
    created_dirs = _created_parent_directories(parent, root)
    os.makedirs(parent, exist_ok=True)
    with open(target, "xb") as artifact:
        artifact.write(payload)
    commit()
    return {"size_bytes": len(payload), "sha256": sha256_bytes(payload), "created_dirs": created_dirs}


def read_local(root: str, relative_path: str, reload: Callable[[], None]) -> dict[str, object]:
    target = mounted_path(relative_path, root)
    reload()
    with open(target, "rb") as artifact:
        data = artifact.read(MAX_BYTES + 1)
    return {"size_bytes": len(data), "sha256": sha256_bytes(data)}


def remove_own_path(root: str, relative_path: str, created_dirs: list[str] | None = None) -> bool:
    path = mounted_path(relative_path, root)
    expected_root = os.path.realpath(os.path.join(root, ARTIFACT_ROOT))
    real_parent = os.path.realpath(os.path.dirname(path))
    if real_parent != expected_root:
        raise ValueError("cleanup target escaped the proof root")
    try:
        os.remove(path)
        removed = True
    except FileNotFoundError:
        removed = False
    # Remove only directories explicitly recorded as created by this writer;
    # rmdir is non-recursive and naturally preserves nonempty/shared parents.
    for directory in reversed(created_dirs or []):
        real_dir = os.path.realpath(directory)
        if os.path.commonpath((os.path.realpath(root), real_dir)) != os.path.realpath(root):
            raise ValueError("cleanup directory escaped the mount")
        try:
            os.rmdir(directory)
        except (FileNotFoundError, OSError):
            pass
    return removed


def run_proof(
    relative_path: str,
    payload: bytes,
    writer: Callable[[str, bytes], dict[str, object]],
    reader: Callable[[str], dict[str, object]],
    cleanup: Callable[[str, list[str]], dict[str, object]],
    absence_check: Callable[[str], dict[str, object]],
) -> dict[str, object]:
    """Run write/read/verify and always invoke scoped cleanup."""
    record: dict[str, object] = {
        "artifact_path": relative_path,
        "expected_size_bytes": len(payload),
        "expected_sha256": sha256_bytes(payload),
    }
    created_dirs: list[str] = []
    failure: BaseException | None = None
    try:
        written = writer(relative_path, payload)
        record["write"] = written
        created_dirs = list(written.get("created_dirs", []))
        read = reader(relative_path)
        record["read"] = read
        if read != {key: written[key] for key in ("size_bytes", "sha256")} or read["sha256"] != record["expected_sha256"]:
            raise RuntimeError("separate remote reader did not match the committed artifact")
        record["proof_passed"] = True
    except BaseException as exc:
        failure = exc
        record["proof_passed"] = False
        record["proof_error"] = f"{type(exc).__name__}: {exc}"
    finally:
        try:
            record["cleanup"] = cleanup(relative_path, created_dirs)
            record["cleanup_status"] = "passed"
            record["absence_check"] = absence_check(relative_path)
            if not record["absence_check"]["own_path_missing"]:
                record["proof_passed"] = False
                raise RuntimeError("UUID artifact remained in refreshed root listing after cleanup")
        except BaseException as cleanup_exc:
            record["cleanup_status"] = "failed"
            record["cleanup_error"] = f"{type(cleanup_exc).__name__}: {cleanup_exc}"
            record["proof_passed"] = False
            try:
                cleanup_exc.innerrecord = record
            except (AttributeError, TypeError):
                pass
            raise
    if failure is not None:
        try:
            failure.innerrecord = record
        except (AttributeError, TypeError):
            pass
        raise failure
    return record
