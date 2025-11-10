# Engineering Design Review Document Template

Author: Amisha Singla (amisha.singla@stellar.org) \
Date: 07/31/2025


## Problem Statement

<!--
Describe the core problem this proposal is addressing. A successful
problem statement develops a strong justification for why addressing
the problem is important and timely.

Consider the following:
* How do you quantify/qualify the value of solving this problem? 
    Consider both business and technical reasons.
* Have you run any simple experiments (or spikes) to validate the above claims?
* Why is now the appropriate time to solve this problem?
* What are the high-level goals or outcomes you want to achieve?
* What is our understanding of the product requirements?
* What is our understanding of the technical constraints?

If available, link directly to any product specs or documents.
-->

Stellar-dev labs helps users in understanding various data points about stellar network i.e. exploring transaction details,  contract details, ledger details, etc. Internally, labs uses various APIs to extract this data.

1. For contract data, it uses [stellar-expert API](https://stellar.expert/openapi.html)'s contract data endpoint. [Example request](https://api.stellar.expert/explorer/public/contract-data/CAS3FL6TLZKDGGSISDBWGGPXT3NRR4DYTZD7YOD3HMYO6LTJUVGRVEAM?order=desc&limit=10)
2. For transaction data, it uses RPC `getTransaction` endpoint. Example request payload:

```
{"id":1,"jsonrpc":"2.0","method":"getTransaction","params":{"hash":"727791e2a403a8eb6fa55ddcb58a550db45f47a29ec3159340aaf0218cc00fb0","xdrFormat":"json"}}
```

Now, there are following problems associated with above.

1. Stellar expert API provides very limited query filtering capabilities. Therefore, while extracting data for custom contracts such as KALE, it takes forever to load. Also, stellar-expert rate limit the requests. To be precise, we need following additional capabilities:
- Query by key/value i.e. key=foo,value=bar,keyContains=fo,valueContains=bar,updatedAtFrom=2025-01-01,updatedAtUntil=2025-01-02
- Build a sub-end point to get all possible keys and values. This will be used to allow users to filter on key/val. Currently, lab queries all the data and then curate it on frontend.
- Pagination and sorting support

2. RPC endpoint does not provide support for historical data - There is a [spike](https://github.com/stellar/stellar-rpc/issues/492) to explore possibility of providing historical data access in getTransaction endpoint. This problem is out-of-scope of this design.


## Design

<!--
Detail the specifics of your implementation approach for this project.
The template here is intentionally unopinionated. Content that may make
sense to include for one project, may not make sense for another. Use your
best judgement to provide the appropriate level of detail, erring on the
side of fleshing out any issues before entering the implementation stage.

Consider addressing any or all (or beyond) the following:
* Architecture Diagram
* Data Model
* User-facing changes (ex. API design, configuration changes, etc)
* Scalability or performance 
* Dependencies on other teams or products (internal and external)
* Migration plan
* Testing plan
* Infrastructure requirements
* Security concerns
* Observability (ex. metrics, logging, alerting, etc)
-->

The solution will be split into two parts:
1. Indexer - Fetch data from ledger data lake and store in postgres DB.
2. API - Defines routes and endpoints. It serves data stored in postrges DB.

### **Architecture Diagram for Indexer**
![Contract-API (1)](https://github.com/user-attachments/assets/6eb88602-4a3b-470d-8223-af79fcb1b060)


### **Data Model**

 From above design, the postgres DB will essentially store index information. For the current use case, we will need atleast `contract_id` as db index.
  - **Contract Data Schema**

| Column Name      | Data Type                | Constraints               |
| ---------------- | ------------------------ | ------------------------- |
| id               | TEXT                     |                           |
| ledger\_sequence | INTEGER                  | NOT NULL                  |
| durability       | TEXT                     |                           |
| keys_index       | TEXT[]                   |                           |
| key              | BYTEA                    |                           |
| val              | BYTEA                    |                           |
| closed\_at       | TIMESTAMP WITH TIME ZONE | NOT NULL                  |
| live_until_ledger_sequence | INTEGER        | NOT NULL                  |
| **Indexes**      |                          | `idx_contract_id` on (id), `idx_keys_index` on (keys_index) |



### **API design**

We will be building following endpoints in JS API:

- **GET /contract/{contract_id}?key={key}&cursor={cursor}&limit={limit}&sort_by={field}&order={asc|desc}**

Example Response:
<details>

```
    {
    "_links": {
      "self": {
        "href": "/contract/CAS3FL6TLZKDGGSISDBWGGPXT3NRR4DYTZD7YOD3HMYO6LTJUVGRVEAM?order=desc&limit=10"
      },
      "prev": {
        "href": "/contract/CAS3FL6TLZKDGGSISDBWGGPXT3NRR4DYTZD7YOD3HMYO6LTJUVGRVEAM?order=asc&limit=10&cursor=QAACRv7TSJdJuTDl3NzoOMqPd3NV1D4nMrUl1WCZbBVyzhmw"
      },
      "next": {
        "href": "/contract/CAS3FL6TLZKDGGSISDBWGGPXT3NRR4DYTZD7YOD3HMYO6LTJUVGRVEAM?order=desc&limit=10&cursor=QAACRvqzm9GPEHQEvjjeWPPCWkj8gAWF3kCMb8BTtXyzyZtI"
      }
    },
    "results": [
        {
          "id": "CAS3FL6TLZKDGGSISDBWGGPXT3NRR4DYTZD7YOD3HMYO6LTJUVGRVEAM",
          "durability": "persistent",
          "key": "AAAAEAAAAAEAAAACAAAADwAAAAdCYWxhbmNlAAAAABIAAAAAAAAAANkZYFbIclNVIsk19ya5m3Fn3VO11uhJO835GKCvV8dA",
          "ttl": 59020106,
          "updated": 1746538521,
          "value": "AAAACgAAAAAAAAAAAAAAAAAAAAA=",
          "paging_token": "QAACRv7TSJdJuTDl3NzoOMqPd3NV1D4nMrUl1WCZbBVyzhmw"
        }
    ]
}
```
    
</details>
 
- **GET/contract/{contract_id}/keys**

Example Response:
<details>

```
{
    "results": [
        {
          "id": "CAS3FL6TLZKDGGSISDBWGGPXT3NRR4DYTZD7YOD3HMYO6LTJUVGRVEAM",
          "keys": ["AAAAEAAAAAA..."]
        }
    ]
}
```

</details>


## Alternatives Considered

<!--
Summarize any potential approaches that you considered when drafting 
this design, making it clear why you decided against them.

Note that this section is intentionally after the primary design
section. This section should evolve as you refine the proposal and
alternatives are ruled out.
-->

We explored couple of internal and external indexers, however they did not turn out to be feasible
1. Wallet indexer - This is too specific for account indexing
2. Observr - The lack of support for local postgres limited us to test this option
3. Working on the top of stellar-expert - This requires setting up a MongoDB and elastic search based indexer, which would be complex than writing custom indexer.

## Estimated work

There will be two main parts of the work
1. Building an indexer to fetch ledger close meta and index respective dataset.
2. Building a JS based API to serve data required by user. This queries the database and GCS datalake, parses XDR using [js-stellar-xdr-json](https://github.com/stellar/js-stellar-xdr-json) and serves JSON to back to the user. (9 week)
   1. Getting familiar with JS/express API and setup Boilerplate API. 1 week
   2. Setup an endpoint for contract data with appropriate query filters, read the needed data from GCS and DB. 2 week
   3. Add function to parse contract data from XDR, probably use ORM. 1 week
   4. Unit test and Integration test coverage. 1.5 week
   5. Load testing on dev and API deployment on testnet. 1.5 week
   6. API deployment on mainnet. 1 week
   7. Address any issues - 1 week

## Active work

- Indexer is being built in https://github.com/stellar/stellar-ledger-data-indexer/pull/1
- API is being built in https://github.com/stellar/laboratory-backend