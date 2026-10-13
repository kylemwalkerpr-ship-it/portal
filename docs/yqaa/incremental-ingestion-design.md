# Incremental YQAA knowledge finalization

## Evidence and cause

Production run `officialsync38418012636` staged a complete snapshot, then its
`BEGIN; SET LOCAL statement_timeout = '120s'; finalize; COMMIT` transaction
still ended with SQLSTATE `57014` while inserting chunks. The currently applied
successor function in
`20261002080000_yqaa_finalize_safeupdate_newer_run_guard.sql` deletes every live
chunk and source and inserts every staged row. That makes a 24,949 chunk
snapshot pay for 24,949 inserts, the search-vector trigger, and GIN maintenance
even when almost every chunk is identical. The read-only comparison for
`yqaa_kb_20261013T145947Z` found 24,949 total chunks, 0 new, 12 with changed
`content_hash`, and 24,937 unchanged.

## Consumer contract

- Retrieval in `search_yqaa_knowledge` joins chunks to sources on `source_key`
  and filters on `sources.active`. The application calls that RPC; it does not
  filter chunks by `ingestion_run_id`.
- No runtime consumer reads the live source or chunk `ingestion_run_id`. The
  ingestion script reads run status/counts/site counts for its completion
  result. Run IDs on live rows are provenance fields, not a snapshot selector.
- Source `fetched_at` and `last_seen_at` are refreshed from the verified crawl
  on every successful finalization. Chunk `fetched_at` and `ingestion_run_id`
  remain the last crawl that changed that chunk's persisted content/metadata;
  they are updated only for an inserted or changed chunk. This preserves
  content provenance and avoids rewriting unchanged indexed rows.
- `lib/yqaaKnowledgeDb.ts` consumes RPC `fetched_at` in `freshnessWeight` and
  `freshEnough`. The successor keeps chunk `fetched_at` for internal retrieval
  ranking, but returns the joined active source's `fetched_at` in the existing
  RPC output field. Freshness consumers see the latest verified crawl without
  a schema or application API change.
- Every retained source row is tagged with the current run ID. Current run
  `source_count`, `chunk_count`, and `site_counts` are computed from the
  resulting verified live snapshot (current-run sources plus their chunks),
  never by counting only chunks tagged with the current run.

## Minimal successor migration

Add a timestamped successor migration; do not edit either applied finalizer
migration. Keep the existing service-only `SECURITY INVOKER` finalizer contract,
advisory transaction lock, run status lock, eligible-newer-run fence, staged
count validation, and one-call transaction semantics.

After validation and the newer-run fence, remove sources absent from this run
(their chunks cascade), then upsert all staged sources by stable `source_key`.
Refresh source crawl fields and source `ingestion_run_id`. Delete live chunks
that have no staged `chunk_key` in this run. Insert staged chunks and update
conflicting chunk keys only when persisted chunk fields other than crawl-only
`fetched_at` and `ingestion_run_id` differ. Inserts/changed rows receive the
current `fetched_at` and `ingestion_run_id`; unchanged rows receive no UPDATE.
The staged INSERT source also prefilters rows whose complete semantic tuple
matches the live tuple, so unchanged rows never invoke `BEFORE INSERT` triggers.
The `ON CONFLICT ... WHERE` comparison remains as a race-safe guard if a row
changes after that prefilter. Equality compares body, metadata, and every other
semantic field directly; it does not rely on a hash-only shortcut.
Stable keys remain `source_key || ':' || chunk_index`.

Build `site_counts` as a map of site to source count from the resulting snapshot,
preserving the existing completed finalizer result shape verified in production. Set
run totals from those verified totals, clear only this run's staging rows, and
return the same top-level result keys as today. Recreate the current search RPC
without changing its arguments, output types, scoring, diversification, or
active-source filter; its final projection returns `sources.fetched_at` so the
application freshness contract remains truthful. All live mutations,
completion, and staging cleanup remain in the caller's transaction,
so any exception restores the prior corpus and leaves the run retryable.

## Verification

Add deterministic SQL integration coverage against disposable loopback Postgres
with the real indexes and triggers: at least 25,000 indexed baseline chunks,
then a full staged snapshot with 12 total chunk changes across changed, new,
and removed keys. Capture `ctid` and an update-trigger counter to prove all
unchanged rows are untouched. Verify the search RPC reports current source
fetch time for an unchanged chunk. Also prove exact signatures survive an
injected mid-finalization exception, eligible newer runs reject older
finalizers before live writes, and execute ACL is granted only to
`service_role`.

The SQL integration script is prepared for the user to run against
`postgresql://postgres@127.0.0.1:55432/yqaa_retrieval_test`; it is not run in
this session. After the preceding local migrations are present, run:

```sh
psql -X -v ON_ERROR_STOP=1 'postgresql://postgres@127.0.0.1:55432/yqaa_retrieval_test' \
  -f supabase/migrations/20261014100000_yqaa_incremental_knowledge_finalize.sql
YQAA_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55432/yqaa_retrieval_test' \
  node scripts/test-yqaa-incremental-knowledge-finalizer.mjs
```

In this session, run focused Jest coverage, TypeScript, migration order/ledger
checks, script syntax, and `git diff --check`. Do not access secrets, push, apply
to production, or deploy.
