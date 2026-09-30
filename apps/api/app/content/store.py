"""Content loading (M1). For now: the content version hash sent with every response."""

import hashlib
from pathlib import Path


def compute_content_version(content_dir: Path) -> str:
    """Short, stable hash of every JSON file under `content/` (names and bytes)."""
    digest = hashlib.sha256()
    if content_dir.is_dir():
        for path in sorted(p for p in content_dir.rglob("*.json") if p.is_file()):
            digest.update(path.relative_to(content_dir).as_posix().encode())
            digest.update(b"\0")
            digest.update(path.read_bytes())
            digest.update(b"\0")
    return digest.hexdigest()[:12]
