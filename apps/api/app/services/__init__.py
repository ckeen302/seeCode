"""Database work shared by routers: attempts, progress, review items, activity days.

The rules themselves live in `app/learning/` as pure functions; these modules load rows,
apply the rules and write the results. Callers own the transaction (they commit).
"""
