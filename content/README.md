# Content

Learning content as JSON, versioned in Git (Section 10 of `docs/SPEC.md`):

- `patterns.json`, `roadmap.json`, `structures.json`, `toolkit.json`
- `problems/<slug>.json`, one file per problem

The API loads and validates these at startup and serves them without answers; the web
app never reads them directly. Check changes with:

```bash
uv run --project apps/api python scripts/validate_content.py
```

All problem text is written in our own words. Never paste text from LeetCode or any other site.
