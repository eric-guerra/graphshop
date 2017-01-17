'use strict';

var sortKeys = require('../sortKeys');

/**
 * In-memory implementations of the three backends the gateway federates. Each exposes *batch*
 * methods (getMany) because that's what DataLoader calls; `calls` counts round trips so tests can
 * prove N+1 queries are gone.
 */

function delay() {
  return new Promise(function (r) { setImmediate(r); });
}

function counter() {
  return { calls: 0, keys: [] };
}

function ProductStore(products, brands) {
  this.products = products.slice();
  this.brands = brands.slice();
  this.stats = { products: counter(), brands: counter(), byBrand: counter() };
}

ProductStore.prototype.getMany = async function (ids) {
  this.stats.products.calls++;
  this.stats.products.keys.push(ids);
  await delay();
  var byId = new Map(this.products.map(function (p) { return [p.id, p]; }));
  return ids.map(function (id) { return byId.get(id) || null; });
};

ProductStore.prototype.getBrands = async function (ids) {
  this.stats.brands.calls++;
  this.stats.brands.keys.push(ids);
  await delay();
  var byId = new Map(this.brands.map(function (b) { return [b.id, b]; }));
  return ids.map(function (id) { return byId.get(id) || null; });
};

ProductStore.prototype.productsByBrand = async function (brandIds, limit) {
  this.stats.byBrand.calls++;
  await delay();
  var self = this;
  return brandIds.map(function (bid) {
    return self.products.filter(function (p) { return p.brandId === bid; }).sort(function (a, b) { return a.name.localeCompare(b.name); }).slice(0, limit);
  });
};

/** Keyset pagination: `after` is the sort key tuple of the last item seen. */
ProductStore.prototype.find = async function (opts) {
  await delay();
  var q = (opts.search || '').toLowerCase();
  var list = this.products.filter(function (p) {
    return (!opts.category || p.category === opts.category) &&
      (!q || (p.name + ' ' + (p.description || '')).toLowerCase().indexOf(q) >= 0);
  });
  var keyOf = sortKeys.SORTS[opts.sort || 'NAME'];
  list.sort(function (a, b) { return compareKeys(keyOf(a), keyOf(b)); });
  var total = list.length;
  if (opts.after) list = list.filter(function (p) { return compareKeys(keyOf(p), opts.after) > 0; });
  return { items: list.slice(0, opts.first + 1), total: total };
};

ProductStore.prototype.categories = async function () {
  await delay();
  var counts = {};
  this.products.forEach(function (p) { counts[p.category] = (counts[p.category] || 0) + 1; });
  return Object.keys(counts).sort().map(function (name) { return { name: name, productCount: counts[name] }; });
};

var compareKeys = sortKeys.compareKeys;

/** Stands in for the reviews microservice (GET /reviews?productIds=...). */
function ReviewService(reviews) {
  this.reviews = reviews.slice();
  this.stats = counter();
  this.seq = reviews.length;
}

ReviewService.prototype.forProducts = async function (productIds) {
  this.stats.calls++;
  this.stats.keys.push(productIds);
  await delay();
  var self = this;
  return productIds.map(function (pid) {
    return self.reviews.filter(function (r) { return r.productId === pid; }).sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
  });
};

ReviewService.prototype.add = async function (review) {
  await delay();
  var saved = Object.assign({ id: 'r' + (++this.seq), createdAt: new Date().toISOString() }, review);
  this.reviews.push(saved);
  return saved;
};

/** Stands in for the inventory service (POST /availability {skus}). */
function InventoryService(stock) {
  this.stock = Object.assign({}, stock);
  this.stats = counter();
  this.failing = false;
}

InventoryService.prototype.forSkus = async function (skus) {
  this.stats.calls++;
  this.stats.keys.push(skus);
  await delay();
  if (this.failing) throw new Error('inventory service unavailable');
  var self = this;
  return skus.map(function (sku) { return sku in self.stock ? self.stock[sku] : null; });
};

module.exports = { ProductStore: ProductStore, ReviewService: ReviewService, InventoryService: InventoryService, compareKeys: compareKeys };
