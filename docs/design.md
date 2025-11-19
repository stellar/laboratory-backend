# Engineering Design Review

Author: Amisha Singla (<amisha.singla@stellar.org>)  
Date: 2025-07-31

## Table of contents

- [Problem Statement](#problem-statement)
- [Design](#design)
  - [Architecture](#architecture)
  - [Data model](#data-model)
  - [API design](#api-design)
- [Alternatives considered](#alternatives-considered)
- [Estimated work](#estimated-work)
- [Active work](#active-work)

## Problem Statement

Stellar Labs needs to surface contract, transaction, and ledger data for users (explore transaction details, contract details, ledger details, etc.). Internally, the Labs frontend relies on a mix of external APIs and RPC endpoints to fetch that data.

Current data sources used:

- Contract data is fetched from the Stellar Expert API: https://stellar.expert/openapi.html (example request shown below).

Example Stellar Expert contract-data request:

https://api.stellar.expert/explorer/public/contract-data/CAS3FL6TLZKDGGSISDBWGGPXT3NRR4DYTZD7YOD3HMYO6LTJUVGRVEAM?order=desc&limit=10

## Design

High level: split the solution into two components:

1. Indexer — consumes ledger data (from a ledger data lake / GCS), parses/indexes contract-related metadata, and stores index records in Postgres.
2. API — a JS/Express service that exposes endpoints to query the indexed data (reads Postgres, optionally reads GCS for blobs, and parses XDR with js-stellar-xdr-json).

### Architecture

The indexer will periodically read ledger close meta from the data lake, extract contract entries, and write compact indexed rows to Postgres so the API can serve fast, filtered queries.

![Contract API architecture](https://github.com/user-attachments/assets/6eb88602-4a3b-470d-8223-af79fcb1b060)

### Data model

The Postgres store contains index information for contracts. The minimal indexed columns for the current use case are shown below.

**Contract data schema (example)**

| Column name                | Data type                | Constraints |
| -------------------------- | ------------------------ | ----------- |
| id                         | TEXT                     | PRIMARY KEY |
| ledger_sequence            | INTEGER                  | NOT NULL    |
| durability                 | TEXT                     |             |
| keys_index                 | TEXT[]                   |             |
| key                        | BYTEA                    |             |
| val                        | BYTEA                    |             |
| closed_at                  | TIMESTAMP WITH TIME ZONE | NOT NULL    |
| live_until_ledger_sequence | INTEGER                  | NOT NULL    |

Indexes:

- `idx_contract_id` on (id)
- `idx_keys_index` on (keys_index)

Notes:

- Store compact indexed values to optimize query throughput (avoid storing full blobs in frequently queried columns).
- Use appropriate column types (BYTEA for binary values) and provide helper views that project parsed JSON for consumer-facing APIs.

### API design

The API provides endpoints for contract data and keys. Examples below use a REST style; implementation will be JS/Express.

- GET `/contract/{contract_id}?key={key}&cursor={cursor}&limit={limit}&sort_by={field}&order={asc|desc}`

Example response (paged):

<details>
<summary>Example contract response (expand)</summary>

```json
{
  "_links": {
    "self": { "href": "/contract/CAS3...AM?order=desc&limit=10" },
    "prev": { "href": "/contract/CAS3...AM?order=asc&limit=10&cursor=..." },
    "next": { "href": "/contract/CAS3...AM?order=desc&limit=10&cursor=..." }
  },
  "results": [
    {
      "id": "CAS3FL6T...VEAM",
      "durability": "persistent",
      "key": "AAAAEAAAAAE...",
      "ttl": 59020106,
      "updated": 1746538521,
      "value": "AAAACg...",
      "paging_token": "QAACRv7T..."
    }
  ]
}
```

</details>

- GET `/contract/{contract_id}/keys` — returns the set of keys for the contract.

<details>
<summary>Example keys response (expand)</summary>

```json
{
  "results": [
    {
      "id": "CAS3FL6T...VEAM",
      "keys": ["AAAAEAAAAAA..."]
    }
  ]
}
```

</details>

API behaviour / considerations:

- Cursor-based pagination for stable paging tokens.
- Filtering by key/value with indexed search for performant queries.
- Support `keyContains`/`valueContains` partial filters, with limits to avoid expensive full table scans.
- Provide an endpoint that returns available keys/values for a contract to drive the frontend filter UI.

## Active work

- Indexer work: https://github.com/stellar/stellar-ledger-data-indexer/pull/1
- API work: https://github.com/stellar/laboratory-backend
