# GraphShop

A **GraphQL** gateway for a storefront. One query fetches products from **MongoDB**, reviews from a reviews service and stock from an inventory service. **DataLoader** batching turns what would be hundreds of backend calls into one call per backend.

> Portfolio reference implementation of a 2016 project (Node + GraphQL + DataLoader + MongoDB), built on graphql-js 16.

```graphql
{
  products(first: 20, category: "Camping", sort: PRICE_ASC) {
    totalCount
    pageInfo { hasNextPage endCursor }
    edges { node { name price brand { name } rating reviewCount inventory { status } } }
  }
}
```

Without batching, 20 products × (brand + reviews + rating + stock) is 81 backend calls. With per-request DataLoaders it is **3**: one brands batch (de-duplicated), one reviews batch (shared by `rating` and `reviewCount`), and one inventory batch. Product lookups are primed from the page itself. The tests assert these call counts.

## Features

- **Relay-style connections** with opaque keyset cursors (`[sortValue, id]`). Pages stay stable under inserts, and every sort (name, price ascending, price descending) walks the catalog exactly once (tested). The page size is capped at 50
- **Mutations with typed user errors** (`addReview` returns `errors: [{field, message}]` instead of throwing). The review loader cache is invalidated, so the payload's `product.rating` reflects the new review in the same response
- **Abuse protection** as validation rules that run before execution: a **depth limit** (fragment-aware) and a **cost limit**, where each field is weighted by the page sizes of the list fields above it
- **Partial failure**: if the inventory service is down, only `inventory` resolves to null and the rest of the query succeeds
- **Error masking**: unexpected errors become `Internal error` for clients, with the real error logged server-side; user-input and validation errors pass through with codes

## Structure

```
src/schema.graphql      SDL
src/resolvers.js        resolvers, cursors, connection building
src/loaders.js          per-request DataLoaders (per-key errors for the flaky service)
src/limits.js           depth and cost validation rules
src/sources/memory.js   in-memory product store + simulated review/inventory services (with call counters)
src/sources/mongo.js    MongoDB product store (batched $in lookups, keyset queries, indexes)
```

## Run and test

```bash
npm install
npm start                                       # http://localhost:4000/graphql (in-memory data)
MONGO_URL=mongodb://localhost/graphshop npm start
npm test
```
