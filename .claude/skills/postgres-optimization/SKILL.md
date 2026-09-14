---
name: postgres-optimization
description: Comprehensive PostgreSQL optimization — indexes, query plans, partitioning, JSONB, connection pooling, and unconventional techniques like constraint exclusion, function-based indexes, and hash uniqueness
---

# PostgreSQL Optimization

> **"Beyond 'just add an index' — systematic and creative solutions for real performance problems."**

---

## 1. Index Strategies

### Standard Index Types

```sql
-- B-tree: equality and range queries (default)
CREATE INDEX idx_orders_customer_id ON orders (customer_id);

-- Composite: equality columns first, range/sort last
CREATE INDEX idx_orders_status_created ON orders (status, created_at DESC);

-- Partial: smaller index for filtered queries
CREATE INDEX idx_orders_pending ON orders (created_at)
  WHERE status = 'pending';

-- Covering: avoids table lookup entirely
CREATE INDEX idx_users_email_name ON users (email) INCLUDE (name, avatar_url);

-- GIN: for JSONB containment queries
CREATE INDEX idx_products_metadata ON products USING GIN (metadata);

-- GiST: for full-text search
CREATE INDEX idx_articles_search ON articles USING GiST (
  to_tsvector('english', title || ' ' || body)
);

-- Concurrent creation (no table lock)
CREATE INDEX CONCURRENTLY idx_large_table_col ON large_table (col);
```

### Function-Based Indexes (Reduce Size for Low-Cardinality Columns)

When a timestamp column is queried at coarser granularity (daily), indexing the full timestamp wastes space:

```sql
-- Instead of indexing the full timestamptz (214 MB)
CREATE INDEX sale_sold_at_ix ON sale(sold_at);

-- Index only the derived date (66 MB — 3x smaller)
CREATE INDEX sale_sold_at_date_ix
ON sale((date_trunc('day', sold_at AT TIME ZONE 'UTC'))::date);
```

**Important:** Queries must use the exact same expression to hit this index:

```sql
-- Uses the index ✓
WHERE date_trunc('day', sold_at AT TIME ZONE 'UTC')::date BETWEEN '2025-01-01' AND '2025-01-31'

-- Does NOT use the index ✗
WHERE (sold_at AT TIME ZONE 'UTC')::date BETWEEN '2025-01-01' AND '2025-01-31'
```

**PostgreSQL 18+:** Use virtual generated columns to avoid discipline issues:

```sql
ALTER TABLE sale ADD sold_at_date DATE
GENERATED ALWAYS AS (date_trunc('day', sold_at AT TIME ZONE 'UTC'));
```

### Hash Index for Uniqueness on Large Text Values

For tables with large text columns (URLs, documents), a B-Tree unique index stores actual values in leaf nodes — making it nearly the size of the table. A hash exclusion constraint stores only hash values:

```sql
-- B-Tree unique (154 MB for a 160 MB table)
CREATE UNIQUE INDEX urls_url_unique_ix ON urls(url);

-- Hash exclusion constraint (32 MB — 5x smaller)
ALTER TABLE urls
ADD CONSTRAINT urls_url_unique_hash
EXCLUDE USING HASH (url WITH =);
```

Uniqueness is still enforced:

```sql
INSERT INTO urls (id, url) VALUES (1000002, 'https://example.com');
-- ERROR: conflicting key value violates exclusion constraint
```

Hash index lookup is also faster (0.022 ms vs B-Tree 0.046 ms).

**Limitations of hash exclusion vs B-Tree unique:**

| Feature | B-Tree Unique | Hash Exclusion |
|---------|--------------|----------------|
| Foreign key reference | ✓ | ✗ |
| `ON CONFLICT (column)` | ✓ | ✗ |
| `ON CONFLICT ON CONSTRAINT` | ✓ | ✓ (DO NOTHING only) |
| `ON CONFLICT DO UPDATE` | ✓ | ✗ |
| `MERGE` | ✓ | ✓ |

Use `MERGE` as a workaround for upserts:

```sql
MERGE INTO urls t
USING (VALUES (1000004, 'https://example.com')) AS s(id, url)
ON t.url = s.url
WHEN MATCHED THEN UPDATE SET id = s.id
WHEN NOT MATCHED THEN INSERT (id, url) VALUES (s.id, s.url);
```

---

## 2. Constraint Exclusion

PostgreSQL can use check constraints to skip impossible query scans entirely.

```sql
CREATE TABLE users (
    id INT PRIMARY KEY,
    username TEXT NOT NULL,
    plan TEXT NOT NULL,
    CONSTRAINT plan_check CHECK (plan IN ('free', 'pro'))
);
```

Without constraint exclusion, `WHERE plan = 'Pro'` (capital P — impossible) scans the whole table. With it:

```sql
SET constraint_exclusion TO 'on';

EXPLAIN ANALYZE SELECT * FROM users WHERE plan = 'Pro';
-- Result: One-Time Filter: false | Execution Time: 0.008 ms
```

| Environment | Recommendation |
|-------------|----------------|
| OLTP production | Leave as `'partition'` (default) |
| BI / Data Warehouse | Set to `'on'` |
| Ad-hoc query / reporting | Set to `'on'` |

**Cost:** Slight extra planning overhead evaluating constraints.

---

## 3. Reading Query Plans

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT o.id, o.total, u.name
FROM orders o
JOIN users u ON o.user_id = u.id
WHERE o.status = 'shipped'
  AND o.created_at > NOW() - INTERVAL '30 days'
ORDER BY o.created_at DESC
LIMIT 20;
```

What to look for:

| Signal | Meaning |
|--------|---------|
| `Seq Scan` on large table | Missing index |
| `Nested Loop` with high row estimates | Missing join index |
| `Sort` without `Index Scan` | In-memory/disk sort — add index |
| `Buffers: shared hit` vs `shared read` | Cache efficiency |

---

## 4. Partitioning

Partition tables over ~10M rows when queries consistently filter on the partition key.

```sql
CREATE TABLE events (
    id          BIGINT GENERATED ALWAYS AS IDENTITY,
    event_type  TEXT NOT NULL,
    payload     JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2024_q1 PARTITION OF events
    FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');
CREATE TABLE events_2024_q2 PARTITION OF events
    FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');

-- Indexes are inherited automatically (PG 11+)
CREATE INDEX ON events (created_at, event_type);
```

---

## 5. JSONB Operations

```sql
-- Containment query (uses GIN index)
SELECT * FROM products
WHERE metadata @> '{"category": "electronics"}'
  AND (metadata ->> 'price')::numeric < 500;

-- Update nested JSONB
UPDATE products
SET metadata = jsonb_set(metadata, '{stock}', to_jsonb(stock - 1))
WHERE id = 'abc';

-- Expand JSONB arrays
SELECT id, jsonb_array_elements_text(metadata -> 'tags') AS tag
FROM products
WHERE metadata ? 'tags';
```

---

## 6. Connection Pooling

Each PostgreSQL connection uses ~10 MB of server memory. Always use a pooler in front of Postgres for web applications.

```ini
# pgbouncer.ini
[databases]
app = host=localhost port=5432 dbname=app

[pgbouncer]
pool_mode = transaction        # transaction-level for web apps
max_client_conn = 1000
default_pool_size = 25
min_pool_size = 5
reserve_pool_size = 5
server_idle_timeout = 300
```

Use **session-level pooling** only if the app relies on prepared statements or temp tables.

---

## 7. Diagnostic Queries

**Slow queries:**
```sql
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

**Unused indexes:**
```sql
SELECT indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```

**Compare index vs table size:**
```sql
SELECT
    relname AS name,
    pg_size_pretty(pg_relation_size(oid)) AS size
FROM pg_class
WHERE relname LIKE 'your_table%'
ORDER BY pg_relation_size(oid) DESC;
```

**Check constraint exclusion setting:**
```sql
SHOW constraint_exclusion;
```

---

## 8. Decision Tree

```
Query too slow?
├── Check EXPLAIN ANALYZE
│   ├── Seq Scan on large table → Add index
│   ├── Condition always false? → Enable constraint_exclusion
│   └── Sort without index → Add sorted index
│
├── Index too large?
│   ├── Timestamp queried by day/week → Function-based index on truncated date
│   └── Large text uniqueness → Hash exclusion constraint
│
├── Table over 10M rows with date filters?
│   └── Partition by range
│
└── Connection exhaustion?
    └── Add PgBouncer / pgcat
```

---

## 9. Anti-Patterns

- Indexing every column instead of analyzing actual query patterns
- Using `SELECT *` when only a few columns are needed
- Not using `EXPLAIN ANALYZE` to verify index usage
- Storing large blobs in JSONB when a typed table is better
- Skipping connection pooling
- Running `VACUUM FULL` during peak hours (locks entire table)

---

## 10. Checklist

- [ ] `pg_stat_statements` enabled for query monitoring
- [ ] Indexes match actual query patterns
- [ ] Composite indexes ordered: equality → sort → range
- [ ] `EXPLAIN ANALYZE` run on all critical queries
- [ ] Partial indexes for frequently filtered subsets
- [ ] Function-based indexes for low-cardinality derived columns
- [ ] Hash exclusion for large-text uniqueness where upserts aren't needed
- [ ] Constraint exclusion enabled on BI/reporting databases
- [ ] Connection pooler (PgBouncer/pgcat) deployed
- [ ] Table partitioning for tables over 10M rows
- [ ] Unused indexes identified and dropped
