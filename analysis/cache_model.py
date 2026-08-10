from __future__ import annotations

import json
import os
from pathlib import Path

from huggingface_hub import snapshot_download
from huggingface_hub.errors import LocalEntryNotFoundError


DEFAULT_MODEL_ID = "nvidia/LocateAnything-3B"
DEFAULT_REVISION = "c32291ca5e996f5a7a485845b4f57a233936bba0"


def main() -> int:
    model_id = os.environ.get("LOCATEANYTHING_MODEL_ID", DEFAULT_MODEL_ID).strip() or DEFAULT_MODEL_ID
    revision = os.environ.get("LOCATEANYTHING_REVISION", DEFAULT_REVISION).strip() or DEFAULT_REVISION
    token = os.environ.get("HF_TOKEN") or None

    try:
        snapshot_path = snapshot_download(
            repo_id=model_id,
            revision=revision,
            token=token,
            local_files_only=True,
        )
        source = "persistent-cache"
    except LocalEntryNotFoundError:
        snapshot_path = snapshot_download(
            repo_id=model_id,
            revision=revision,
            token=token,
        )
        source = "hugging-face"

    resolved = Path(snapshot_path).resolve()
    print(
        json.dumps(
            {
                "ok": True,
                "model": model_id,
                "revision": revision,
                "source": source,
                "snapshotPath": str(resolved),
            },
            ensure_ascii=False,
        ),
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
