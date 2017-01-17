'use strict';

var GraphQLScalarType = require('graphql').GraphQLScalarType;
var Kind = require('graphql').Kind;
var GraphQLError = require('graphql').GraphQLError;

var SORTS = require('./sortKeys').SORTS;

var MAX_PAGE = 50;

function encodeCursor(key) {
  return Buffer.from(JSON.stringify(key)).toString('base64url');
}

function decodeCursor(cursor) {
  try {
    var key = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Array.isArray(key)) throw new Error();
    return key;
  } catch (e) {
    throw new GraphQLError('Invalid cursor', { extensions: { code: 'BAD_USER_INPUT' } });
  }
}

function money(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function clampFirst(first) {
  if (first < 0) throw new GraphQLError('first must be >= 0', { extensions: { code: 'BAD_USER_INPUT' } });
  return Math.min(first, MAX_PAGE);
}

function stockStatus(n) {
  return n <= 0 ? 'OUT_OF_STOCK' : n <= 3 ? 'LOW_STOCK' : 'IN_STOCK';
}

var resolvers = {
  Cursor: new GraphQLScalarType({
    name: 'Cursor',
    serialize: function (v) { return v; },
    parseValue: function (v) { return v; },
    parseLiteral: function (ast) { return ast.kind === Kind.STRING ? ast.value : null; }
  }),

  Query: {
    product: function (_, args, ctx) { return ctx.loaders.product.load(args.id); },
    brand: function (_, args, ctx) { return ctx.loaders.brand.load(args.id); },
    categories: function (_, __, ctx) { return ctx.sources.products.categories(); },

    products: async function (_, args, ctx) {
      var first = clampFirst(args.first);
      var keyOf = SORTS[args.sort];
      var result = await ctx.sources.products.find({
        first: first, after: args.after ? decodeCursor(args.after) : null, category: args.category,
        search: args.search, sort: args.sort
      });
      var page = result.items.slice(0, first);
      page.forEach(function (p) { ctx.loaders.product.prime(p.id, p); });
      var edges = page.map(function (p) { return { cursor: encodeCursor(keyOf(p)), node: p }; });
      return {
        edges: edges,
        totalCount: result.total,
        pageInfo: { hasNextPage: result.items.length > first, endCursor: edges.length ? edges[edges.length - 1].cursor : null }
      };
    }
  },

  Mutation: {
    addReview: async function (_, args, ctx) {
      var input = args.input;
      var errors = [];
      if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) errors.push({ field: 'rating', message: 'Rating must be 1-5' });
      if (!input.body || input.body.trim().length < 10) errors.push({ field: 'body', message: 'Review must be at least 10 characters' });
      if (input.body && input.body.length > 2000) errors.push({ field: 'body', message: 'Review is too long' });
      if (!input.author || !input.author.trim()) errors.push({ field: 'author', message: 'Name is required' });
      var product = await ctx.loaders.product.load(input.productId);
      if (!product) errors.push({ field: 'productId', message: 'Product not found' });
      if (errors.length) return { review: null, product: product, errors: errors };

      var review = await ctx.sources.reviews.add({
        productId: input.productId, rating: input.rating, title: input.title || null,
        body: input.body.trim(), author: input.author.trim()
      });
      // The cached review list for this product is now stale within this request.
      ctx.loaders.reviews.clear(input.productId);
      return { review: review, product: product, errors: [] };
    }
  },

  Product: {
    price: function (p) { return money(p.priceCents); },
    brand: function (p, _, ctx) { return p.brandId ? ctx.loaders.brand.load(p.brandId) : null; },
    reviews: async function (p, args, ctx) {
      return (await ctx.loaders.reviews.load(p.id)).slice(0, clampFirst(args.first));
    },
    reviewCount: async function (p, _, ctx) { return (await ctx.loaders.reviews.load(p.id)).length; },
    rating: async function (p, _, ctx) {
      var rs = await ctx.loaders.reviews.load(p.id);
      if (!rs.length) return null;
      return Math.round(rs.reduce(function (s, r) { return s + r.rating; }, 0) / rs.length * 10) / 10;
    },
    inventory: async function (p, _, ctx) {
      var available = await ctx.loaders.inventory.load(p.sku);
      return available === null ? null : { available: available, status: stockStatus(available) };
    },
    related: async function (p, args, ctx) {
      if (!p.brandId) return [];
      var siblings = await ctx.loaders.productsByBrand.load(p.brandId);
      return siblings.filter(function (s) { return s.id !== p.id; }).slice(0, clampFirst(args.first));
    }
  },

  Brand: {
    products: async function (b, args, ctx) {
      return (await ctx.loaders.productsByBrand.load(b.id)).slice(0, clampFirst(args.first));
    }
  }
};

module.exports = { resolvers: resolvers, encodeCursor: encodeCursor, decodeCursor: decodeCursor, MAX_PAGE: MAX_PAGE };
