/**
 * Kuzmos · Kasa — Kasa Spreadsheet'e genel erişim yardımcıları.
 */

function ss_() {
  return SpreadsheetApp.openById(getConfig_().kasaId);
}

function sheet_(name, headers) {
  var s = ss_().getSheetByName(name);
  if (!s) {
    s = ss_().insertSheet(name);
    if (headers && headers.length) {
      s.appendRow(headers);
      s.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#111').setFontColor('#F5C800');
      s.setFrozenRows(1);
    }
  }
  return s;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ss_: ss_, sheet_: sheet_ };
  Object.keys(module.exports).forEach(function (k) { global[k] = module.exports[k]; });
}
