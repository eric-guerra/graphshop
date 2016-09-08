'use strict';

var graphql = require('graphql');

/**
 * Validation rules that protect the gateway from abusive queries:
 *  - depth limit (brand → products → brand → products … recursion)
 *  - cost limit: each field costs 1, multiplied by the requested page size of list fields above it
 */
function depthLimit(maxDepth) {
  return function (context) {
    function depthOf(node, fragments, seen) {
      if (!node.selectionSet) return 0;
      var max = 0;
      node.selectionSet.selections.forEach(function (sel) {
        var d;
        if (sel.kind === graphql.Kind.FRAGMENT_SPREAD) {
          if (seen[sel.name.value]) return;
          var frag = fragments[sel.name.value];
          d = frag ? depthOf(frag, fragments, Object.assign({}, seen, { [sel.name.value]: true })) : 0;
        } else if (sel.kind === graphql.Kind.INLINE_FRAGMENT) {
          d = depthOf(sel, fragments, seen);
        } else {
          d = sel.name.value.startsWith('__') ? 0 : 1 + depthOf(sel, fragments, seen);
        }
        max = Math.max(max, d);
      });
      return max;
    }
    return {
      Document: function (doc) {
        var fragments = {};
        doc.definitions.forEach(function (d) { if (d.kind === graphql.Kind.FRAGMENT_DEFINITION) fragments[d.name.value] = d; });
        doc.definitions.forEach(function (d) {
          if (d.kind !== graphql.Kind.OPERATION_DEFINITION) return;
          var depth = depthOf(d, fragments, {});
          if (depth > maxDepth) {
            context.reportError(new graphql.GraphQLError('Query depth ' + depth + ' exceeds the limit of ' + maxDepth, { nodes: [d], extensions: { code: 'QUERY_TOO_DEEP' } }));
          }
        });
      }
    };
  };
}

function costLimit(maxCost, variables) {
  return function (context) {
    function argValue(arg) {
      if (!arg) return null;
      if (arg.value.kind === graphql.Kind.INT) return parseInt(arg.value.value, 10);
      if (arg.value.kind === graphql.Kind.VARIABLE) return variables && variables[arg.value.name.value];
      return null;
    }
    function cost(node, fragments, multiplier) {
      if (!node.selectionSet) return 0;
      var total = 0;
      node.selectionSet.selections.forEach(function (sel) {
        if (sel.kind === graphql.Kind.FRAGMENT_SPREAD) {
          var frag = fragments[sel.name.value];
          if (frag) total += cost(frag, fragments, multiplier);
          return;
        }
        if (sel.kind === graphql.Kind.INLINE_FRAGMENT) {
          total += cost(sel, fragments, multiplier);
          return;
        }
        var first = argValue((sel.arguments || []).find(function (a) { return a.name.value === 'first'; }));
        var childMultiplier = first ? multiplier * Math.min(first, 50) : multiplier;
        total += multiplier + cost(sel, fragments, childMultiplier);
      });
      return total;
    }
    return {
      Document: function (doc) {
        var fragments = {};
        doc.definitions.forEach(function (d) { if (d.kind === graphql.Kind.FRAGMENT_DEFINITION) fragments[d.name.value] = d; });
        doc.definitions.forEach(function (d) {
          if (d.kind !== graphql.Kind.OPERATION_DEFINITION) return;
          var c = cost(d, fragments, 1);
          if (c > maxCost) context.reportError(new graphql.GraphQLError('Query cost ' + c + ' exceeds the limit of ' + maxCost, { nodes: [d], extensions: { code: 'QUERY_TOO_EXPENSIVE', cost: c } }));
        });
      }
    };
  };
}

module.exports = { depthLimit: depthLimit, costLimit: costLimit };
