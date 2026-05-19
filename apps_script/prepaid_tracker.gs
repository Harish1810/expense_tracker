// ============================================================
// ICICI Prepaid Card Transaction Tracker
// ------------------------------------------------------------
// Setup:
//   1. Open your Google Sheet → Extensions → Apps Script
//   2. Paste this entire file into the editor
//   3. Run setupTrigger() once (Run menu → Run function → setupTrigger)
//   4. Authorize Gmail + Sheets access when prompted
//   5. Done — transactions will sync automatically every hour
// ============================================================

var SHEET_NAME = 'prepaid_transactions';
var SENDER = 'Prepaidcards@icici.bank.in';
var HEADERS = ['S No', 'Date', 'Cheque No', 'Description', 'Withdrawal', 'Deposit', 'Balance', 'Category'];

// ------------------------------------------------------------
// Main function — runs on schedule
// ------------------------------------------------------------
function fetchPrepaidTransactions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }

  // Always run this first — converts any existing date serials to text strings
  // and locks the column as plain text to prevent future auto-conversion
  ensureDateColumnIsText(sheet);

  var threads = GmailApp.search('from:' + SENDER + ' is:unread');
  var addedCount = 0;

  for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages();
    for (var j = 0; j < messages.length; j++) {
      var msg = messages[j];
      if (!msg.isUnread()) continue;

      var body = msg.getPlainBody();
      var parsed = parseTransactionEmail(body);

      if (parsed) {
        if (!isDuplicate(sheet, parsed)) {
          sheet.appendRow(['', parsed.date, '', parsed.description, parsed.withdrawal, '0.00', parsed.balance, '']);
          addedCount++;
        }
      }

      msg.markRead();
    }
  }

  sortSheetByDate(sheet);
  Logger.log('fetchPrepaidTransactions: added ' + addedCount + ' new transaction(s).');
}

// ------------------------------------------------------------
// Parse transaction details from email plain-text body
// Handles both ECOM ("A transaction of INR...") and
// POS ("An online transaction of INR...") alert formats
// ------------------------------------------------------------
function parseTransactionEmail(body) {
  // Amount
  var amountMatch = body.match(/(?:A transaction|An online transaction) of INR ([\d,]+\.?\d*) has been done/i);
  if (!amountMatch) return null;

  // Merchant and raw date: "at Delightful Gourmet on 14-May-2026"
  var merchantMatch = body.match(/at (.+?) on (\d{1,2}-[A-Za-z]+-\d{4})/);
  if (!merchantMatch) return null;

  // Balance: "The Available Balance on your INR Prepaid Card is INR 7,904.65"
  // Use [\s\S]*? (lazy, matches newlines too) to safely skip past "INR Prepaid Card"
  var balanceMatch = body.match(/Available Balance[\s\S]*?is INR ([\d,]+\.?\d*)/i);

  var rawAmount  = amountMatch[1].replace(/,/g, '');
  var merchant   = merchantMatch[1].trim();
  var rawDate    = merchantMatch[2];          // e.g. "14-May-2026"
  var rawBalance = balanceMatch ? balanceMatch[1].replace(/,/g, '') : '0.00';

  // Convert "14-May-2026" → "14/05/2026"
  var dateObj = new Date(rawDate);
  var day   = String(dateObj.getDate()).padStart(2, '0');
  var month = String(dateObj.getMonth() + 1).padStart(2, '0');
  var year  = dateObj.getFullYear();
  var date  = day + '/' + month + '/' + year;

  return {
    date:        date,
    description: merchant,
    withdrawal:  parseFloat(rawAmount).toFixed(2),
    balance:     parseFloat(rawBalance).toFixed(2)
  };
}

// ------------------------------------------------------------
// Force date column (B) to plain text and convert any existing
// date serial cells to "DD/MM/YYYY" strings so getValues()
// never returns Date objects again.
// ------------------------------------------------------------
function ensureDateColumnIsText(sheet) {
  // Lock column format as plain text — prevents future auto-conversion
  sheet.getRange(1, 2, sheet.getMaxRows(), 1).setNumberFormat('@');

  if (sheet.getLastRow() <= 1) return;

  var dataRange = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1);
  var values = dataRange.getValues();
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var changed = false;

  var converted = values.map(function(row) {
    if (row[0] instanceof Date) {
      changed = true;
      // Utilities.formatDate respects the actual stored date value
      return [Utilities.formatDate(row[0], tz, 'dd/MM/yyyy')];
    }
    return row;
  });

  if (changed) dataRange.setValues(converted);
}

// ------------------------------------------------------------
// Sort sheet rows by Date ascending — latest at bottom.
// Handles both plain "DD/MM/YYYY" strings and Date objects
// (Sheets auto-converts date-like values to Date objects).
// Also normalises all dates to zero-padded DD/MM/YYYY.
// ------------------------------------------------------------
function sortSheetByDate(sheet) {
  if (sheet.getLastRow() <= 1) return;

  var dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length);
  var data = dataRange.getValues();

  // Parse a cell value (string or Date object) to a JS Date
  var parseCell = function(val) {
    if (val instanceof Date) return val;
    var s = String(val).trim();
    var parts = s.split('/');
    if (parts.length !== 3) return new Date(0);
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  };

  // Format a cell value as zero-padded DD/MM/YYYY string
  var normalise = function(val) {
    var d = parseCell(val);
    if (d.getTime() === new Date(0).getTime()) return String(val); // keep unparseable as-is
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    return dd + '/' + mm + '/' + d.getFullYear();
  };

  // Normalise date column in every row first
  data = data.map(function(row) {
    var r = row.slice();
    r[1] = normalise(row[1]);
    return r;
  });

  // Sort ascending by date
  data.sort(function(a, b) {
    return parseCell(a[1]) - parseCell(b[1]);
  });

  dataRange.setValues(data);
}

// ------------------------------------------------------------
// Duplicate check — match on date + description + amount
// ------------------------------------------------------------
function isDuplicate(sheet, parsed) {
  if (sheet.getLastRow() <= 1) return false;

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();

  // Normalise a date cell (string or Date object) to DD/MM/YYYY
  var normDate = function(val) {
    if (val instanceof Date) {
      return String(val.getDate()).padStart(2, '0') + '/' +
             String(val.getMonth() + 1).padStart(2, '0') + '/' +
             val.getFullYear();
    }
    // Handle non-padded strings like "9/4/2026" → "09/04/2026"
    var parts = String(val).trim().split('/');
    if (parts.length !== 3) return String(val).trim();
    return parts[0].padStart(2, '0') + '/' + parts[1].padStart(2, '0') + '/' + parts[2];
  };

  // Normalise an amount cell (number or string) to "374.00"
  var normAmt = function(val) {
    return parseFloat(String(val).replace(/,/g, '').trim() || '0').toFixed(2);
  };

  for (var i = 0; i < data.length; i++) {
    var rowDate   = normDate(data[i][1]);          // column B = Date
    var rowDesc   = String(data[i][3]).trim();      // column D = Description
    var rowAmount = normAmt(data[i][4]);            // column E = Withdrawal
    if (rowDate === parsed.date && rowDesc === parsed.description && rowAmount === parsed.withdrawal) {
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------
// One-time backfill: reads ALL emails from the sender and
// updates Balance (column G) for any sheet row that has 0.
// Run this once manually after fixing the balance regex.
// ------------------------------------------------------------
function backfillBalances() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() <= 1) {
    Logger.log('backfillBalances: no data to update.');
    return;
  }

  // Build a map of "date_description_amount" → balance from all emails
  var threads = GmailApp.search('from:' + SENDER);
  var emailMap = {};

  for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages();
    for (var j = 0; j < messages.length; j++) {
      var parsed = parseTransactionEmail(messages[j].getPlainBody());
      if (parsed && parsed.balance !== '0.00') {
        var key = parsed.date + '_' + parsed.description + '_' + parsed.withdrawal;
        emailMap[key] = parsed.balance;
      }
    }
  }

  var normAmt = function(val) {
    return parseFloat(String(val).replace(/,/g, '').trim() || '0').toFixed(2);
  };

  var dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length);
  var data = dataRange.getValues();
  var updatedCount = 0;

  for (var i = 0; i < data.length; i++) {
    // Only update rows where balance is currently 0 or empty
    if (normAmt(data[i][6]) !== '0.00') continue;

    var key = String(data[i][1]).trim() + '_' +
              String(data[i][3]).trim() + '_' +
              normAmt(data[i][4]);

    if (emailMap[key]) {
      data[i][6] = emailMap[key];
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    dataRange.setValues(data);
  }
  Logger.log('backfillBalances: updated ' + updatedCount + ' row(s).');
}

// ------------------------------------------------------------
// One-time setup: creates an hourly time-based trigger
// Run this manually once from the Apps Script editor
// ------------------------------------------------------------
function setupTrigger() {
  // Remove any existing triggers for this function to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'fetchPrepaidTransactions') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('fetchPrepaidTransactions')
    .timeBased()
    .everyHours(1)
    .create();

  Logger.log('Hourly trigger created for fetchPrepaidTransactions.');
}
