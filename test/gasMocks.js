/**
 * Google Apps Script global'lerinin Jest için minimal sahte (fake)
 * implementasyonları. Gerçek Apps Script çalışma zamanını taklit eder;
 * SpreadsheetApp/PropertiesService/CacheService/LockService/Utilities
 * global olarak enjekte edilir ki src/*.js dosyaları hiç değişmeden
 * Node içinde çalışabilsin.
 */

const crypto = require('crypto');

function createFakeSheet(name, rows) {
  rows = rows || [];
  return {
    name: name,
    rows: rows,
    getLastRow: function () {
      return rows.length;
    },
    appendRow: function (row) {
      rows.push(row.slice());
    },
    deleteRows: function (startRow, numRows) {
      rows.splice(startRow - 1, numRows);
    },
    getRange: function (row, col) {
      return {
        setValue: function (v) {
          if (!rows[row - 1]) rows[row - 1] = [];
          rows[row - 1][col - 1] = v;
          return this;
        },
        setValues: function (vals) {
          for (var i = 0; i < vals.length; i++) {
            if (!rows[row - 1 + i]) rows[row - 1 + i] = [];
            for (var j = 0; j < vals[i].length; j++) rows[row - 1 + i][col - 1 + j] = vals[i][j];
          }
          return this;
        },
        setFontWeight: function () {
          return this;
        },
        setBackground: function () {
          return this;
        },
        setFontColor: function () {
          return this;
        }
      };
    },
    setFrozenRows: function () {},
    getDataRange: function () {
      var self = this;
      return {
        getValues: function () {
          return self.rows.map(function (r) {
            return r.slice();
          });
        },
        getDisplayValues: function () {
          return self.rows.map(function (r) {
            return r.map(function (v) {
              return v == null ? '' : String(v);
            });
          });
        }
      };
    }
  };
}

function createFakeSpreadsheet(initialSheets) {
  var sheets = {};
  Object.keys(initialSheets || {}).forEach(function (name) {
    sheets[name] = createFakeSheet(name, initialSheets[name]);
  });
  return {
    getSheetByName: function (name) {
      return sheets[name] || null;
    },
    insertSheet: function (name) {
      sheets[name] = createFakeSheet(name, []);
      return sheets[name];
    },
    deleteSheet: function (sheet) {
      delete sheets[sheet.name];
    },
    _sheets: sheets
  };
}

function toSignedBytes(buf) {
  var bytes = [];
  for (var i = 0; i < buf.length; i++) {
    var b = buf[i];
    bytes.push(b > 127 ? b - 256 : b);
  }
  return bytes;
}

function installGasMocks(opts) {
  opts = opts || {};
  var props = Object.assign({}, opts.scriptProperties || {});
  var cache = {};
  var fakeSpreadsheet = createFakeSpreadsheet(opts.sheets || {});
  var uuidCounter = 0;

  global.SpreadsheetApp = { openById: function () { return fakeSpreadsheet; } };

  global.PropertiesService = {
    getScriptProperties: function () {
      return {
        getProperty: function (k) {
          return Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null;
        },
        setProperty: function (k, v) {
          props[k] = v;
        }
      };
    }
  };

  global.CacheService = {
    getScriptCache: function () {
      return {
        get: function (k) {
          return Object.prototype.hasOwnProperty.call(cache, k) ? cache[k] : null;
        },
        put: function (k, v) {
          cache[k] = String(v);
        },
        remove: function (k) {
          delete cache[k];
        }
      };
    }
  };

  global.LockService = {
    getScriptLock: function () {
      return { waitLock: function () {}, releaseLock: function () {} };
    }
  };

  global.Utilities = {
    getUuid: function () {
      uuidCounter++;
      return 'uuid-' + uuidCounter + '-' + Math.random().toString(16).slice(2);
    },
    computeHmacSha256Signature: function (value, key) {
      return toSignedBytes(crypto.createHmac('sha256', String(key)).update(String(value)).digest());
    },
    computeDigest: function (algorithm, value) {
      return toSignedBytes(crypto.createHash('sha256').update(String(value)).digest());
    },
    newBlob: function (bytes) {
      var buf = Buffer.from(bytes.map(function (b) { return b < 0 ? b + 256 : b; }));
      return { getDataAsString: function () { return buf.toString('utf8'); } };
    },
    base64Decode: function (str) {
      var buf = Buffer.from(str, 'base64');
      return toSignedBytes(buf);
    },
    Charset: { UTF_8: 'UTF_8' },
    DigestAlgorithm: { SHA_256: 'SHA_256' }
  };

  global.HtmlService = {
    createHtmlOutputFromFile: function () {
      var out = {
        setTitle: function () { return out; },
        addMetaTag: function () { return out; }
      };
      return out;
    }
  };

  return { fakeSpreadsheet: fakeSpreadsheet, props: props, cache: cache };
}

module.exports = { installGasMocks: installGasMocks, createFakeSheet: createFakeSheet };
