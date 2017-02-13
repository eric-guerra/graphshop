'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var createApp = require('../src/app').createApp;
var memory = require('../src/sources/memory');
var seed = require('../src/seed');

function setup() {
  var sources = {
    products: new memory.ProductStore(seed.products, seed.brands),
    reviews: new memory.ReviewService(seed.reviews),
    inventory: new memory.InventoryService(seed.stock)
  };
  var logged = [];
  return new Promise(function (resolve) {
    var server = createApp(sources, { log: function (e) { logged.push(e); } }).listen(0, function () {
      var url = 'http://localhost:' + server.address().port + '/graphql';
      resolve({
        sources: sources,
        logged: logged,
        close: function () { return new Promise(function (r) { server.close(r); }); },
        gql: async function (query, variables) {
          var res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: query, variables: variables }) });
          var body = await res.json();
          body.status = res.status;
          return body;
        }
      });
    });
  });
}

test('a page of products with nested data is served with one call per backend', async function (t) {
  var api = await setup();
  t.after(api.close);
  var res = await api.gql(`{
    products(first: 12) {
      totalCount
      edges { node { name price brand { name } rating reviewCount inventory { available status } } }
    }
  }`);
  assert.equal(res.errors, undefined, JSON.stringify(res.errors));
  assert.equal(res.data.products.totalCount, 12);
  assert.equal(res.data.products.edges.length, 12);

  var s = api.sources;
  assert.equal(s.products.stats.brands.calls, 1, 'brands batched');
  assert.deepEqual(s.products.stats.brands.keys[0].slice().sort(), ['b1', 'b2', 'b3'], 'and de-duplicated');
  assert.equal(s.reviews.stats.calls, 1, 'reviews batched (rating + count share one load)');
  assert.equal(s.inventory.stats.calls, 1, 'inventory batched');
  assert.equal(s.products.stats.products.calls, 0, 'page results primed the product loader');

  var tent = res.data.products.edges.find(function (e) { return e.node.name === 'Ridgeline 2P Tent'; }).node;
  assert.deepEqual(tent, { name: 'Ridgeline 2P Tent', price: '$349.00', brand: { name: 'Ridgeline' }, rating: 4.5, reviewCount: 2, inventory: { available: 12, status: 'IN_STOCK' } });
  var lamp = res.data.products.edges.find(function (e) { return e.node.name === 'Lumen 400 Headlamp'; }).node;
  assert.equal(lamp.brand, null);
  assert.equal(lamp.rating, null);
});

test('keyset pagination walks every product exactly once in each sort', async function (t) {
  var api = await setup();
  t.after(api.close);
  for (var sort of ['NAME', 'PRICE_ASC', 'PRICE_DESC']) {
    var seen = [];
    var after = null;
    for (var page = 0; page < 10; page++) {
      var res = await api.gql('query($after: Cursor, $sort: ProductSort) { products(first: 5, after: $after, sort: $sort) { edges { node { id priceCents } } pageInfo { hasNextPage endCursor } } }',
        { after: after, sort: sort });
      res.data.products.edges.forEach(function (e) { seen.push(e.node); });
      if (!res.data.products.pageInfo.hasNextPage) break;
      after = res.data.products.pageInfo.endCursor;
    }
    assert.equal(seen.length, 12, sort);
    assert.equal(new Set(seen.map(function (n) { return n.id; })).size, 12, sort + ' has no duplicates');
    if (sort === 'PRICE_ASC') assert.ok(seen.every(function (n, i) { return i === 0 || seen[i - 1].priceCents <= n.priceCents; }));
    if (sort === 'PRICE_DESC') assert.ok(seen.every(function (n, i) { return i === 0 || seen[i - 1].priceCents >= n.priceCents; }));
  }
  var bad = await api.gql('{ products(after: "not-a-cursor") { totalCount } }');
  assert.equal(bad.errors[0].extensions.code, 'BAD_USER_INPUT');
});

test('filters, single lookups and nested brand products', async function (t) {
  var api = await setup();
  t.after(api.close);
  var res = await api.gql(`{
    camping: products(category: "Camping") { totalCount }
    search: products(search: "pack") { edges { node { sku } } }
    product(id: "p8") { name reviews(first: 1) { author } related { name } }
    brand(id: "b3") { products(first: 2) { name } }
    categories { name productCount }
    missing: product(id: "nope") { name }
  }`);
  assert.equal(res.data.camping.totalCount, 5);
  assert.deepEqual(res.data.search.edges.map(function (e) { return e.node.sku; }), ['PACK-24', 'PACK-55']);
  assert.deepEqual(res.data.product.reviews, [{ author: 'eli' }], 'newest review first');
  assert.deepEqual(res.data.product.related.map(function (p) { return p.name; }), ['Merino Tee', 'Road Racer 1']);
  assert.deepEqual(res.data.brand.products.map(function (p) { return p.name; }), ['Merino Tee', 'Road Racer 1']);
  assert.deepEqual(res.data.categories[0], { name: 'Apparel', productCount: 2 });
  assert.equal(res.data.missing, null);
  assert.equal(api.sources.products.stats.byBrand.calls, 1, 'related + brand.products share one batched call');
});

test('addReview validates input and the new review is visible in the same response', async function (t) {
  var api = await setup();
  t.after(api.close);
  var invalid = await api.gql('mutation { addReview(input: {productId: "p4", rating: 9, body: "short", author: ""}) { review { id } errors { field message } } }');
  assert.deepEqual(invalid.data.addReview.errors.map(function (e) { return e.field; }), ['rating', 'body', 'author']);

  var ok = await api.gql(`mutation {
    addReview(input: {productId: "p4", rating: 3, body: "Works but the igniter failed on day two.", author: "fay"}) {
      errors { field }
      review { id rating author }
      product { reviewCount rating }
    }
  }`);
  assert.deepEqual(ok.data.addReview.errors, []);
  assert.equal(ok.data.addReview.review.author, 'fay');
  assert.deepEqual(ok.data.addReview.product, { reviewCount: 2, rating: 4 }, 'loader cache was invalidated');
});

test('depth and cost limits reject abusive queries before execution', async function (t) {
  var api = await setup();
  t.after(api.close);
  var deep = await api.gql('{ brand(id: "b1") { products { brand { products { brand { products { brand { products { brand { name } } } } } } } } } }');
  assert.equal(deep.status, 400);
  assert.equal(deep.errors[0].extensions.code, 'QUERY_TOO_DEEP');

  var expensive = await api.gql('{ products(first: 50) { edges { node { related(first: 50) { reviews(first: 50) { author body rating } } } } } }');
  assert.equal(expensive.status, 400);
  assert.equal(expensive.errors[0].extensions.code, 'QUERY_TOO_EXPENSIVE');
  assert.equal(api.sources.products.stats.byBrand.calls, 0, 'nothing executed');

  var fragments = await api.gql('fragment F on Brand { products { brand { products { brand { products { brand { products { name } } } } } } } } { brand(id: "b1") { ...F } }');
  assert.equal(fragments.errors[0].extensions.code, 'QUERY_TOO_DEEP', 'fragments are counted');
});

test('a failing downstream service degrades one field, not the whole query; internals are masked', async function (t) {
  var api = await setup();
  t.after(api.close);
  api.sources.inventory.failing = true;
  var res = await api.gql('{ product(id: "p1") { name inventory { available } } }');
  assert.equal(res.data.product.name, 'Ridgeline 2P Tent');
  assert.equal(res.data.product.inventory, null);
  assert.equal(res.errors[0].message, 'Internal error');
  assert.deepEqual(res.errors[0].path, ['product', 'inventory']);
  assert.match(api.logged[0].message, /inventory service unavailable/, 'real error is logged server-side');

  var parse = await api.gql('{ products(');
  assert.equal(parse.status, 400);
  assert.equal(parse.errors[0].extensions.code, 'GRAPHQL_PARSE_FAILED');
});
