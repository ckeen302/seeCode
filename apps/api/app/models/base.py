from typing import Any

from sqlalchemy import Column, MetaData, Table, Uuid
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    metadata = MetaData()


# Supabase owns `auth.users`; locally, migration 001 creates a minimal stand-in.
# Declared only so foreign keys to it resolve. Never created from this metadata.
auth_users = Table("users", Base.metadata, Column("id", Uuid, primary_key=True), schema="auth")


def include_in_autogenerate(
    obj: Any, name: str | None, type_: str, reflected: bool, compare_to: Any
) -> bool:
    """`auth` belongs to Supabase (or the local stand-in from migration 001), never to us."""
    return not (type_ == "table" and getattr(obj, "schema", None) == "auth")
