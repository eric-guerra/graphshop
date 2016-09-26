'use strict';

var DataLoader = require('dataloader');

/**
 * One set of loaders per request. DataLoader collects every key requested during a single tick of
 * resolver execution and issues one batch call per backend, then caches results for the rest of
 * the request. A page of 20 products with brand, rating and stock becomes 3 backend calls, not 61.
 */
function createLoaders(sources) {
  return {
    product: new DataLoader(function (ids) { return sources.products.getMany(ids); }),
    brand: new DataLoader(function (ids) { return sources.products.getBrands(ids); }),
    productsByBrand: new DataLoader(function (ids) { return sources.products.productsByBrand(ids, 50); }),
    reviews: new DataLoader(function (productIds) { return sources.reviews.forProducts(productIds); }),
    // Inventory is a separate service that may be down: per-key errors let the rest of the query succeed.
    inventory: new DataLoader(function (skus) {
      return sources.inventory.forSkus(skus).catch(function (err) {
        return skus.map(function () { return err; });
      });
    })
  };
}

module.exports = createLoaders;
