"""Initial schema: every table in Section 15, the profile trigger, and RLS policies.

On Supabase the `auth` schema (auth.users, auth.uid()) already exists. On a plain
Postgres (docker compose, CI, the cloud dev box) this migration first creates a
minimal stand-in so the same foreign keys, trigger and policies work everywhere.
The downgrade removes that stand-in only if this migration created it.

Revision ID: 001
Revises:
Create Date: 2026-09-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

AUTH_SHIM_MARKER = "seecode local auth shim"

AUTH_SHIM = [
    "create schema auth",
    f"comment on schema auth is '{AUTH_SHIM_MARKER}'",
    """
    create table auth.users (
      id                 uuid primary key,
      email              text,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      created_at         timestamptz not null default now()
    )
    """,
    # Same contract as Supabase's auth.uid(): the `sub` claim of the request's JWT.
    """
    create function auth.uid() returns uuid
    language sql stable
    as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      )::uuid
    $$
    """,
]

TABLES = [
    """
    create table public.profiles (
      id            uuid primary key references auth.users(id) on delete cascade,
      display_name  text,
      timezone      text not null default 'UTC',
      settings      jsonb not null default '{}'::jsonb,
      placement     jsonb,
      created_at    timestamptz not null default now()
    )
    """,
    """
    create table public.attempts (
      id               uuid primary key default gen_random_uuid(),
      user_id          uuid not null references public.profiles(id) on delete cascade,
      problem_slug     text not null,
      content_version  text not null,
      status           text not null default 'active',
      outcome          text,
      code             text not null default '',
      plan             jsonb,
      plan_checks      int not null default 0,
      plan_grade       jsonb,
      planned_first    boolean not null default false,
      plan_skipped     boolean not null default false,
      max_rung         int not null default 0,
      rungs_opened     jsonb not null default '[]'::jsonb,
      free_rungs       int[] not null default '{}',
      runs             int not null default 0,
      submits          int not null default 0,
      last_results     jsonb,
      predictions      jsonb not null default '[]'::jsonb,
      nudges_used      int not null default 0,
      active_seconds   int not null default 0,
      started_at       timestamptz not null default now(),
      finished_at      timestamptz,
      updated_at       timestamptz not null default now()
    )
    """,
    "create index attempts_user_problem"
    " on public.attempts (user_id, problem_slug, started_at desc)",
    "create unique index attempts_one_active"
    " on public.attempts (user_id, problem_slug) where status = 'active'",
    """
    create table public.problem_progress (
      user_id         uuid not null references public.profiles(id) on delete cascade,
      problem_slug    text not null,
      status          text not null default 'new',
      best_rung       int,
      first_solved_at timestamptz,
      last_attempt_at timestamptz,
      primary key (user_id, problem_slug)
    )
    """,
    """
    create table public.drill_sessions (
      id             uuid primary key default gen_random_uuid(),
      user_id        uuid not null references public.profiles(id) on delete cascade,
      mode           text not null,
      pattern_filter text,
      size           int not null,
      started_at     timestamptz not null default now(),
      finished_at    timestamptz
    )
    """,
    """
    create table public.drill_answers (
      id           uuid primary key default gen_random_uuid(),
      session_id   uuid not null references public.drill_sessions(id) on delete cascade,
      user_id      uuid not null references public.profiles(id) on delete cascade,
      mode         text not null,
      problem_slug text,
      pattern_id   text,
      toolkit_id   text,
      answer       jsonb not null,
      grade        jsonb not null,
      correct      boolean not null,
      seconds      real not null,
      overtime     boolean not null default false,
      created_at   timestamptz not null default now()
    )
    """,
    "create index drill_answers_user_pattern"
    " on public.drill_answers (user_id, pattern_id, created_at desc)",
    """
    create table public.review_items (
      id               uuid primary key default gen_random_uuid(),
      user_id          uuid not null references public.profiles(id) on delete cascade,
      kind             text not null,
      ref              text not null,
      resolve          boolean not null default false,
      due_at           timestamptz not null,
      interval_days    real not null default 0,
      ease             real not null default 2.5,
      reps             int not null default 0,
      lapses           int not null default 0,
      last_grade       text,
      last_reviewed_at timestamptz,
      created_at       timestamptz not null default now(),
      unique (user_id, kind, ref)
    )
    """,
    "create index review_items_due on public.review_items (user_id, due_at)",
    """
    create table public.review_logs (
      id              uuid primary key default gen_random_uuid(),
      item_id         uuid not null references public.review_items(id) on delete cascade,
      user_id         uuid not null references public.profiles(id) on delete cascade,
      grade           text not null,
      interval_before real not null,
      interval_after  real not null,
      answer          jsonb,
      plan_grade      jsonb,
      seconds         real,
      created_at      timestamptz not null default now()
    )
    """,
    """
    create table public.notes (
      user_id      uuid not null references public.profiles(id) on delete cascade,
      problem_slug text not null,
      body         text not null default '',
      updated_at   timestamptz not null default now(),
      primary key (user_id, problem_slug)
    )
    """,
    """
    create table public.activity_days (
      user_id uuid not null references public.profiles(id) on delete cascade,
      day     date not null,
      primary key (user_id, day)
    )
    """,
    """
    create table public.ai_cache (
      key        text primary key,
      feature    text not null,
      response   jsonb not null,
      created_at timestamptz not null default now()
    )
    """,
    """
    create table public.ai_usage (
      id         bigserial primary key,
      user_id    uuid references public.profiles(id) on delete set null,
      feature    text not null,
      cached     boolean not null,
      success    boolean not null,
      latency_ms int not null,
      created_at timestamptz not null default now()
    )
    """,
    "create index ai_usage_user_day on public.ai_usage (user_id, created_at)",
]

PROFILE_TRIGGER = [
    """
    create function public.handle_new_user() returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $$
    begin
      insert into public.profiles (id, display_name)
      values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
      )
      on conflict (id) do nothing;
      return new;
    end;
    $$
    """,
    """
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user()
    """,
]

# Tables whose rows belong to one user through `user_id`.
USER_OWNED_TABLES = [
    "attempts",
    "problem_progress",
    "drill_sessions",
    "drill_answers",
    "review_items",
    "review_logs",
    "notes",
    "activity_days",
]
SERVICE_ONLY_TABLES = ["ai_cache", "ai_usage"]  # RLS on, no policies: no client access


def _rls_statements() -> list[str]:
    # `(select auth.uid())` is evaluated once per statement instead of once per row.
    statements = [
        "alter table public.profiles enable row level security",
        "create policy profiles_owner on public.profiles for all"
        " using (id = (select auth.uid())) with check (id = (select auth.uid()))",
    ]
    for table in USER_OWNED_TABLES:
        statements += [
            f"alter table public.{table} enable row level security",
            f"create policy {table}_owner on public.{table} for all"
            " using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))",
        ]
    statements += [
        f"alter table public.{table} enable row level security" for table in SERVICE_ONLY_TABLES
    ]
    # Alembic's bookkeeping table also lives in `public`; hide it from Supabase's Data API.
    statements.append("alter table public.alembic_version enable row level security")
    return statements


def upgrade() -> None:
    bind = op.get_bind()
    has_auth = bind.execute(
        sa.text("select exists (select 1 from pg_namespace where nspname = 'auth')")
    ).scalar_one()
    statements = ([] if has_auth else AUTH_SHIM) + TABLES + PROFILE_TRIGGER + _rls_statements()
    for statement in statements:
        op.execute(statement)


def downgrade() -> None:
    op.execute("drop trigger if exists on_auth_user_created on auth.users")
    op.execute("drop function if exists public.handle_new_user()")
    for table in [
        "ai_usage",
        "ai_cache",
        "activity_days",
        "notes",
        "review_logs",
        "review_items",
        "drill_answers",
        "drill_sessions",
        "problem_progress",
        "attempts",
        "profiles",
    ]:
        op.execute(f"drop table if exists public.{table}")

    marker = (
        op.get_bind()
        .execute(
            sa.text(
                "select d.description from pg_namespace n"
                " left join pg_description d"
                "   on d.objoid = n.oid and d.classoid = 'pg_namespace'::regclass"
                " where n.nspname = 'auth'"
            )
        )
        .scalar()
    )
    if marker == AUTH_SHIM_MARKER:  # never touch Supabase's real auth schema
        op.execute("drop schema auth cascade")
