# SANAD Backend And Search Migration Plan

This app currently runs as a static GitHub Pages PWA. That is suitable while the collection is modest and most data can be shipped as static files.

## When To Move Beyond Static Files

Move to a backend/search service when any of these become true:

- Judgment data exceeds comfortable static delivery, especially above 50,000 to 100,000 records.
- Search needs ranking, typo tolerance, filters, facets, or Arabic stemming.
- Client profiles, invoices, and notes need secure sync across devices.
- Multiple users need accounts, permissions, or audit logs.
- Legal documents need file attachments or private storage.

## Recommended Architecture

```text
Frontend: GitHub Pages or Vercel/Cloudflare Pages
API: Node/Workers server routes
Database: Postgres
Search: Meilisearch, Typesense, or Postgres full text as a first step
Files: S3/R2-compatible object storage
Auth: email/password or passkey provider
Backups: scheduled database exports plus user-level JSON export
```

## Data Tables

- `judgments`: metadata, court, type, date, number, title.
- `judgment_texts`: full body, extracted intro, principles, reasoning, ruling.
- `laws`: law metadata.
- `law_articles`: one row per article.
- `clients`: client profile data.
- `services`: services/cases connected to each client.
- `invoices`: invoice records and payment state.
- `judgment_notes`: user tags, notes, and highlights.
- `audit_logs`: security-sensitive actions.

## Migration Path

1. Keep the current static app working.
2. Generate static chunks and search index from source documents.
3. Add an API-compatible data layer in `assets/app.js`.
4. Later replace the static data provider with API calls.
5. Move client data from `localStorage` into authenticated storage.
6. Keep JSON export/import as a user backup and migration tool.

## Search Requirements

The production search service should support:

- Arabic normalization.
- Exact judgment number lookup.
- Filters by court, year, type, and legal topic.
- Snippets showing the matching passage.
- Ranking by relevance and recency.
- Saved searches.

## Security Requirements

Client data should not remain only in browser storage once the app becomes multi-device or multi-user. The backend version should add authentication, encryption in transit, database access control, regular backups, and audit logs for exports, deletions, and invoice changes.
