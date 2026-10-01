"""Database work shared by routers: attempts, progress (with mastery), review items and
the review queue, drill sessions, Today, Stats, guest import and the account (profile,
export, deletion).

The rules themselves live in `app/learning/` as pure functions; these modules load rows,
apply the rules and write the results. Callers own the transaction (they commit).
"""
