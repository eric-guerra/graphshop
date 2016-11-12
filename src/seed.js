'use strict';

var brands = [
  { id: 'b1', name: 'Ridgeline' },
  { id: 'b2', name: 'Summit' },
  { id: 'b3', name: 'Velo' }
];

var catalog = [
  ['p1', 'TENT-2P', 'Ridgeline 2P Tent', 34900, 'Camping', 'b1'],
  ['p2', 'TENT-4P', 'Ridgeline 4P Tent', 49900, 'Camping', 'b1'],
  ['p3', 'BAG-20F', 'Alpine 20F Sleeping Bag', 27900, 'Camping', 'b1'],
  ['p4', 'STOVE-PKT', 'Pocket Stove', 5499, 'Camping', 'b2'],
  ['p5', 'PACK-24', 'Summit 24L Daypack', 8900, 'Hiking', 'b2'],
  ['p6', 'PACK-55', 'Summit 55L Pack', 21900, 'Hiking', 'b2'],
  ['p7', 'POLES-C', 'Carbon Trekking Poles', 11900, 'Hiking', 'b2'],
  ['p8', 'SHOE-TR3', 'Trail Runner 3', 12999, 'Footwear', 'b3'],
  ['p9', 'SHOE-RD1', 'Road Racer 1', 14999, 'Footwear', 'b3'],
  ['p10', 'TEE-MER', 'Merino Tee', 6500, 'Apparel', 'b3'],
  ['p11', 'SHELL-STM', 'Stormline Shell', 15900, 'Apparel', 'b2'],
  ['p12', 'LAMP-400', 'Lumen 400 Headlamp', 4999, 'Camping', null]
];

var products = catalog.map(function (r) {
  return { id: r[0], sku: r[1], name: r[2], description: r[2] + ' for the outdoors', priceCents: r[3], category: r[4], brandId: r[5] };
});

var reviews = [
  ['r1', 'p1', 5, 'Bombproof', 'Survived a storm on the Lone Star Trail without a drop inside.', 'ana', '2016-03-01T10:00:00Z'],
  ['r2', 'p1', 4, null, 'Great tent but the stakes are flimsy.', 'ben', '2016-04-01T10:00:00Z'],
  ['r3', 'p4', 5, 'Fast boil', 'Boils water faster than my old stove by a mile.', 'cy', '2016-02-11T10:00:00Z'],
  ['r4', 'p8', 3, null, 'Grippy but runs half a size small.', 'dee', '2016-05-05T10:00:00Z'],
  ['r5', 'p8', 4, 'Solid', 'Comfortable for long trail days.', 'eli', '2016-05-07T10:00:00Z']
].map(function (r) {
  return { id: r[0], productId: r[1], rating: r[2], title: r[3], body: r[4], author: r[5], createdAt: r[6] };
});

var stock = { 'TENT-2P': 12, 'TENT-4P': 2, 'BAG-20F': 0, 'STOVE-PKT': 40, 'PACK-24': 9, 'PACK-55': 3, 'SHOE-TR3': 14, 'TEE-MER': 25, 'SHELL-STM': 7, 'LAMP-400': 33 };

module.exports = { brands: brands, products: products, reviews: reviews, stock: stock };
