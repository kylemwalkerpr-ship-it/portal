"""One-shot mounted Modal Volume persistence proof; run with `modal run --env ...`."""

from __future__ import annotations

import json
import time
import uuid

import modal
from modal_storage_proof_logic import (
    ARTIFACT_ROOT,
    MAX_BYTES,
    MOUNT,
    artifact_relative_path,
    mounted_path,
    read_local,
    remove_own_path,
    run_proof,
    sha256_bytes,
    write_local,
)

ENVIRONMENT = "content-studio-staging"
VOLUME_NAME = "content-studio-artifacts"
PAYLOAD = b"YouSafe Modal mounted Volume storage proof v1\n"
app = modal.App("content-studio-modal-volume-proof")
image = modal.Image.debian_slim().add_local_python_source("modal_storage_proof_logic")
volume = modal.Volume.from_name(
    VOLUME_NAME,
    create_if_missing=False,
    environment_name=ENVIRONMENT,
    version=1,
)


@app.function(
    image=image, volumes={MOUNT: volume}, gpu=None, cpu=(0.25, 0.25), memory=(128, 256),
    min_containers=0, max_containers=1, buffer_containers=0,
    scaledown_window=2, timeout=60, startup_timeout=60, retries=0,
)
def write_artifact(relative_path: str, payload: bytes) -> dict[str, object]:
    return write_local(MOUNT, relative_path, payload, volume.commit)


@app.function(
    image=image, volumes={MOUNT: volume}, gpu=None, cpu=(0.25, 0.25), memory=(128, 256),
    min_containers=0, max_containers=1, buffer_containers=0,
    scaledown_window=2, timeout=60, startup_timeout=60, retries=0,
)
def read_artifact(relative_path: str) -> dict[str, object]:
    return read_local(MOUNT, relative_path, volume.reload)


@app.function(
    image=image, volumes={MOUNT: volume}, gpu=None, cpu=(0.25, 0.25), memory=(128, 256),
    min_containers=0, max_containers=1, buffer_containers=0,
    scaledown_window=2, timeout=60, startup_timeout=60, retries=0,
)
def cleanup_artifact(relative_path: str, created_dirs: list[str]) -> dict[str, object]:
    removed = remove_own_path(MOUNT, relative_path, created_dirs)
    volume.commit()
    return {"removed": removed}


@app.function(
    image=image, volumes={MOUNT: volume}, gpu=None, cpu=(0.25, 0.25), memory=(128, 256),
    min_containers=0, max_containers=1, buffer_containers=0,
    scaledown_window=2, timeout=60, startup_timeout=60, retries=0,
)
def verify_absent(relative_path: str) -> dict[str, object]:
    volume.reload()
    root = mounted_path(ARTIFACT_ROOT + "/" + relative_path.rsplit("/", 1)[-1], MOUNT)
    import os
    entries = sorted(os.listdir(os.path.dirname(root))) if os.path.isdir(os.path.dirname(root)) else []
    return {"own_path_missing": os.path.basename(relative_path) not in entries, "root_entries": entries}


@app.local_entrypoint()
def main():
    proof_id = str(uuid.uuid4())
    relative_path = artifact_relative_path(proof_id)
    record: dict[str, object] = {
        "proof_id": proof_id,
        "artifact_path": relative_path,
        "expected_size_bytes": len(PAYLOAD),
        "expected_sha256": sha256_bytes(PAYLOAD),
        "environment": ENVIRONMENT,
        "volume_name": VOLUME_NAME,
        "volume_version": 1,
        "started_unix": time.time(),
    }
    try:
        volume.hydrate()
        record["volume_object_id"] = volume.object_id
        record["app_id"] = app.app_id
        record.update(run_proof(
            relative_path,
            PAYLOAD,
            lambda path, payload: write_artifact.remote(path, payload),
            lambda path: read_artifact.remote(path),
            lambda path, dirs: cleanup_artifact.remote(path, dirs),
            lambda path: verify_absent.remote(path),
        ))
    except BaseException as exc:
        record["proof_passed"] = False
        record["proof_error"] = f"{type(exc).__name__}: {exc}"
        inner = getattr(exc, "innerrecord", None)
        if isinstance(inner, dict):
            record.update(inner)
        raise
    finally:
        record["finished_unix"] = time.time()
        print("PROOF_RECEIPT " + json.dumps(record, sort_keys=True, default=str))
