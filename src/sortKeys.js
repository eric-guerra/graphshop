'use strict';

/**
 * Sort keys for keyset pagination. Every key ends with the id so the order is total and a cursor
 * (the last key seen) identifies an exact position even when names or prices tie.
 */
var SORTS = {
  NAME: function (p) { return [p.name.toLowerCase(), p.id]; },
  PRICE_ASC: function (p) { return [p.priceCents, p.id]; },
  PRICE_DESC: function (p) { return [-p.priceCents, p.id]; }
};

function compareKeys(a, b) {
  for (var i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

module.exports = { SORTS: SORTS, compareKeys: compareKeys };
