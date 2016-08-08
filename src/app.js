'use strict';

var fs = require('fs');
var path = require('path');
var express = require('express');
var graphql = require('graphql');
var makeExecutableSchema = require('@graphql-tools/schema').makeExecutableSchema;
var resolvers = require('./resolvers').resolvers;
var createLoaders = require('./loaders');
var limits = require('./limits');

var typeDefs = fs.readFileSync(path.join(__dirname, 'schema.graphql'), 'utf8');
var schema = makeExecutableSchema({ typeDefs: typeDefs, resolvers: resolvers });

var MAX_DEPTH = 8;
var MAX_COST = 2000;

/**
 * Masks unexpected errors so stack traces and internal messages never reach clients;
 * GraphQL validation and BAD_USER_INPUT errors pass through.
 */
function formatError(err, log) {
  var code = err.extensions && err.extensions.code;
  var original = err.originalError;
  if (!original || code) return { message: err.message, path: err.path, extensions: err.extensions };
  log(original);
  return { message: 'Internal error', path: err.path, extensions: { code: 'INTERNAL' } };
}

function createApp(sources, options) {
  options = options || {};
  var log = options.log || function (e) { console.error(e); };
  var app = express();
  app.use(express.json({ limit: '100kb' }));

  app.post('/graphql', async function (req, res) {
    var body = req.body || {};
    if (typeof body.query !== 'string') return res.status(400).json({ errors: [{ message: 'query is required' }] });
    var document;
    try {
      document = graphql.parse(body.query);
    } catch (e) {
      return res.status(400).json({ errors: [{ message: e.message, extensions: { code: 'GRAPHQL_PARSE_FAILED' } }] });
    }
    var rules = graphql.specifiedRules.concat([limits.depthLimit(MAX_DEPTH), limits.costLimit(MAX_COST, body.variables)]);
    var validationErrors = graphql.validate(schema, document, rules);
    if (validationErrors.length) {
      return res.status(400).json({ errors: validationErrors.map(function (e) { return { message: e.message, extensions: e.extensions }; }) });
    }
    var context = { sources: sources, loaders: createLoaders(sources) };
    var result = await graphql.execute({
      schema: schema, document: document, variableValues: body.variables, operationName: body.operationName, contextValue: context
    });
    var out = { data: result.data };
    if (result.errors) out.errors = result.errors.map(function (e) { return formatError(e, log); });
    res.json(out);
  });

  app.get('/graphql/schema', function (req, res) {
    res.type('text/plain').send(typeDefs);
  });

  app.get('/healthz', function (req, res) { res.json({ ok: true }); });
  return app;
}

module.exports = { createApp: createApp, schema: schema };
