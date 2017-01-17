'use strict';

var MongoClient = require('mongodb').MongoClient;

/**
 * MongoDB-backed ProductStore with the same batch interface as the in-memory one.
 * Collections: products {_id, sku, name, description, priceCents, category, brandId}, brands {_id, name}.
 */
function MongoProductStore(db) {
  this.products = db.collection('products');
  this.brands = db.collection('brands');
}

MongoProductStore.connect = async function (url) {
  var client = new MongoClient(url);
  await client.connect();
  var db = client.db();
  var store = new MongoProductStore(db);
  store.client = client;
  await store.products.createIndex({ category: 1, nameLower: 1, _id: 1 });
  await store.products.createIndex({ category: 1, priceCents: 1, _id: 1 });
  await store.products.createIndex({ brandId: 1, name: 1 });
  await store.products.createIndex({ name: 'text', description: 'text' });
  return store;
};

function toApi(doc) {
  if (!doc) return null;
  var o = Object.assign({}, doc, { id: String(doc._id) });
  delete o._id;
  return o;
}

MongoProductStore.prototype.getMany = async function (ids) {
  var docs = await this.products.find({ _id: { $in: ids } }).toArray();
  var byId = new Map(docs.map(function (d) { return [String(d._id), toApi(d)]; }));
  return ids.map(function (id) { return byId.get(id) || null; });
};

MongoProductStore.prototype.getBrands = async function (ids) {
  var docs = await this.brands.find({ _id: { $in: ids } }).toArray();
  var byId = new Map(docs.map(function (d) { return [String(d._id), toApi(d)]; }));
  return ids.map(function (id) { return byId.get(id) || null; });
};

/** One query for all requested brands, then group in memory. */
MongoProductStore.prototype.productsByBrand = async function (brandIds, limit) {
  var docs = await this.products.find({ brandId: { $in: brandIds } }).sort({ name: 1 }).toArray();
  return brandIds.map(function (bid) {
    return docs.filter(function (d) { return d.brandId === bid; }).slice(0, limit).map(toApi);
  });
};

/**
 * Maps the API sort to an indexed field and direction. NAME sorts on a stored lowercase copy
 * (nameLower) so ordering matches the cursor keys in sortKeys.js.
 */
var SORT_FIELDS = { NAME: ['nameLower', 1], PRICE_ASC: ['priceCents', 1], PRICE_DESC: ['priceCents', -1] };

MongoProductStore.prototype.find = async function (opts) {
  var filter = {};
  if (opts.category) filter.category = opts.category;
  if (opts.search) filter.$text = { $search: opts.search };
  var total = await this.products.countDocuments(filter);
  var spec = SORT_FIELDS[opts.sort || 'NAME'];
  var field = spec[0];
  var dir = spec[1];
  if (opts.after) {
    // Keyset condition: (field, _id) strictly after (value, id) in the sort direction.
    var value = opts.sort === 'PRICE_DESC' ? -opts.after[0] : opts.after[0];
    var past = {};
    past[field] = dir === 1 ? { $gt: value } : { $lt: value };
    var tie = {};
    tie[field] = value;
    tie._id = { $gt: opts.after[1] };
    filter = { $and: [filter, { $or: [past, tie] }] };
  }
  var sort = {};
  sort[field] = dir;
  sort._id = 1;
  var docs = await this.products.find(filter).sort(sort).limit(opts.first + 1).toArray();
  return { items: docs.map(toApi), total: total };
};

MongoProductStore.prototype.categories = async function () {
  var rows = await this.products.aggregate([{ $group: { _id: '$category', productCount: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray();
  return rows.map(function (r) { return { name: r._id, productCount: r.productCount }; });
};

module.exports = MongoProductStore;
module.exports.SORT_FIELDS = SORT_FIELDS;
