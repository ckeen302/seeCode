"""Per-user problem bodies: notes (Sections 7.2 and 16.2)."""

from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator

from app.schemas import CamelModel

MAX_NOTE_BYTES = 10 * 1024  # Section 20


def _note_size(body: str) -> str:
    if len(body.encode()) > MAX_NOTE_BYTES:
        raise ValueError("notes must be at most 10 KB")
    return body


class NoteUpdate(CamelModel):
    body: Annotated[str, AfterValidator(_note_size)]


class NoteView(CamelModel):
    body: str
    updated_at: datetime | None  # null until the first save
