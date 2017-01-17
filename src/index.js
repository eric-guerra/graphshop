'use strict';

var createApp = require('./app').createApp;
var memory = require('./sources/memory');
var MongoProductStore = require('./sources/mongo');
var seed = require('./seed');

(async function main() {
  var products = process.env.MONGO_URL
    ? await MongoProductStore.connect(process.env.MONGO_URL)
    : new memory.ProductStore(seed.products, seed.brands);
  var sources = {
    products: products,
    reviews: new memory.ReviewService(seed.reviews),
    inventory: new memory.InventoryService(seed.stock)
  };
  var port = Number(process.env.PORT) || 4000;
  createApp(sources).listen(port, function () {
    console.log('GraphShop on http://localhost:' + port + '/graphql');
  });
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
