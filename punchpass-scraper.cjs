const { execSync } = require('child_process');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const DB_PATH = path.join(__dirname, 'vortex_data', 'punchpass.db');
const BASE_URL = 'https://app.punchpass.com';

// Report definitions
const REPORTS = {
  customer_attendance: {
    url: '/reports/attendances/customer_summary',
    name: 'Customer Attendance Summary',
    hasDateRange: true
  },
  sales_details: {
    url: '/reports/passes',
    name: 'Pass Sales Details',
    hasDateRange: true
  },
  active_passes: {
    url: '/reports/passes/active',
    name: 'Active Passes By Customer',
    hasDateRange: false
  },
  no_active_pass: {
    url: '/reports/passes/no_active_pass',
    name: 'Customers Without Active Pass',
    hasDateRange: false
  },
  no_shows: {
    url: '/reports/attendances/no_shows_and_late_cancels',
    name: 'No Shows & Late Cancels',
    hasDateRange: true
  },
  passes_expiring: {
    url: '/reports/passes/expiring',
    name: 'Passes Expiring Soon',
    hasDateRange: false
  },
  memberships: {
    url: '/reports/passes/memberships',
    name: 'Memberships',
    hasDateRange: false
  },
  class_revenue: {
    url: '/reports/courses',
    name: 'Attendance & Revenue Per Class',
    hasDateRange: true
  }
};

// ===== browser-harness helper =====
function bhRun(script) {
  // Escape single quotes for shell
  const escaped = script.replace(/'/g, "'\\''");
  try {
    const result = execSync(`browser-harness -c '${escaped}'`, {
      encoding: 'utf-8',
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024
    });
    return result.trim();
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');
    throw new Error(`browser-harness failed: ${output.slice(0, 500)}`);
  }
}

function bhRunJSON(script) {
  // Wraps script so output is JSON-parseable
  const wrapped = `
import json
${script}
`;
  const raw = bhRun(wrapped);
  // Find last JSON line
  const lines = raw.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('[') || line.startsWith('{')) {
      try { return JSON.parse(line); } catch(e) { /* try next */ }
    }
  }
  // Try parsing entire output
  try { return JSON.parse(raw); } catch(e) {
    throw new Error(`Could not parse JSON from browser-harness output:\n${raw.slice(0, 1000)}`);
  }
}

// ===== Database =====
function initDB() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS scrape_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      status TEXT DEFAULT 'running',
      reports_scraped INTEGER DEFAULT 0,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS customer_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scrape_run_id INTEGER,
      scraped_at TEXT DEFAULT (datetime('now')),
      date_range TEXT,
      customer_id TEXT,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      last_attendance TEXT,
      attended INTEGER,
      late_cancel INTEGER,
      no_shows INTEGER,
      child_name TEXT,
      FOREIGN KEY (scrape_run_id) REFERENCES scrape_runs(id)
    );

    CREATE TABLE IF NOT EXISTS sales_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scrape_run_id INTEGER,
      scraped_at TEXT DEFAULT (datetime('now')),
      date_range TEXT,
      pass_name TEXT,
      number_sold INTEGER,
      revenue TEXT,
      FOREIGN KEY (scrape_run_id) REFERENCES scrape_runs(id)
    );

    CREATE TABLE IF NOT EXISTS active_passes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scrape_run_id INTEGER,
      scraped_at TEXT DEFAULT (datetime('now')),
      customer_id TEXT,
      last_name TEXT,
      first_name TEXT,
      pass TEXT,
      active_on TEXT,
      expires_on TEXT,
      remaining_value TEXT,
      punches_left TEXT,
      status TEXT,
      FOREIGN KEY (scrape_run_id) REFERENCES scrape_runs(id)
    );

    CREATE TABLE IF NOT EXISTS no_active_pass (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scrape_run_id INTEGER,
      scraped_at TEXT DEFAULT (datetime('now')),
      customer_id TEXT,
      last_name TEXT,
      first_name TEXT,
      email TEXT,
      last_attendance TEXT,
      total_attended INTEGER,
      FOREIGN KEY (scrape_run_id) REFERENCES scrape_runs(id)
    );

    CREATE TABLE IF NOT EXISTS no_shows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scrape_run_id INTEGER,
      scraped_at TEXT DEFAULT (datetime('now')),
      date_range TEXT,
      customer_id TEXT,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      date TEXT,
      class_name TEXT,
      type TEXT,
      FOREIGN KEY (scrape_run_id) REFERENCES scrape_runs(id)
    );

    CREATE TABLE IF NOT EXISTS passes_expiring (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scrape_run_id INTEGER,
      scraped_at TEXT DEFAULT (datetime('now')),
      customer_id TEXT,
      last_name TEXT,
      first_name TEXT,
      pass TEXT,
      expires_on TEXT,
      punches_left TEXT,
      FOREIGN KEY (scrape_run_id) REFERENCES scrape_runs(id)
    );

    CREATE TABLE IF NOT EXISTS memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scrape_run_id INTEGER,
      scraped_at TEXT DEFAULT (datetime('now')),
      customer_id TEXT,
      last_name TEXT,
      first_name TEXT,
      pass TEXT,
      status TEXT,
      next_renewal TEXT,
      amount TEXT,
      FOREIGN KEY (scrape_run_id) REFERENCES scrape_runs(id)
    );

    CREATE TABLE IF NOT EXISTS class_revenue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scrape_run_id INTEGER,
      scraped_at TEXT DEFAULT (datetime('now')),
      date_range TEXT,
      class_name TEXT,
      total_classes INTEGER,
      total_attendances INTEGER,
      avg_attendance REAL,
      total_revenue TEXT,
      avg_revenue TEXT,
      FOREIGN KEY (scrape_run_id) REFERENCES scrape_runs(id)
    );

    CREATE TABLE IF NOT EXISTS daily_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE,
      total_customers INTEGER,
      active_passes INTEGER,
      no_active_pass INTEGER,
      passes_expiring_soon INTEGER,
      memberships_active INTEGER,
      month_revenue TEXT,
      month_attendances INTEGER,
      month_no_shows INTEGER
    );
  `);

  return db;
}

// ===== Data extraction via browser-harness =====

function navigateAndExtract(reportUrl) {
  // Navigate to report page in Paul's logged-in Chrome, extract DataTable data
  const script = `
goto_url("${BASE_URL}${reportUrl}")
wait_for_load()
import time
time.sleep(3)

# Check if we need to click "Run Report"
try:
    run_btn = js("document.querySelector('a.button, button.button')?.textContent?.trim()")
    if run_btn and 'Run Report' in str(run_btn):
        js("document.querySelector('a.button, button.button').click()")
        time.sleep(4)
except:
    pass

# Extract DataTable data via jQuery API
data = js("""
(function() {
  try {
    var table = jQuery('#DataTables_Table_0').DataTable();
    // Show all rows first
    try { table.page.len(-1).draw(false); } catch(e) {}

    var rows = table.rows().data().toArray();
    var headers = [];
    jQuery('#DataTables_Table_0 thead th').each(function(i) {
      headers.push(jQuery(this).text().trim());
    });

    var cleaned = rows.map(function(row) {
      var obj = { _headers: headers };

      // Get DT_RowId for customer ID — various formats
      if (row.DT_RowId) {
        obj._customer_id = row.DT_RowId;
      }

      Object.keys(row).forEach(function(key) {
        if (key === 'DT_RowId') return;
        var val = row[key];
        if (typeof val === 'object' && val !== null) {
          obj[key] = val['@data-order'] || val.display || JSON.stringify(val);
        } else if (typeof val === 'string' && val.indexOf('<a ') !== -1) {
          var m = val.match(/>([^<]*)<\\\\/a>/);
          obj[key] = m ? m[1] : val.replace(/<[^>]*>/g, '');
        } else {
          obj[key] = val;
        }
      });
      return obj;
    });

    return JSON.stringify({ rows: cleaned, count: cleaned.length });
  } catch(e) {
    return JSON.stringify({ error: e.message, rows: [], count: 0 });
  }
})()
""")

# Get date range if present
try:
    date_range = js("document.title || ''")
except:
    date_range = ""

print(json.dumps({ "tableData": json.loads(data) if isinstance(data, str) else data, "dateRange": date_range or "" }))
`;
  return bhRunJSON(script);
}

function mapRowToColumns(row, tableName) {
  // Map DataTable numeric keys to our DB columns
  // Keys are typically "0", "1", "2" etc (plus _customer_id, _headers)
  const numKeys = Object.keys(row)
    .filter(k => !k.startsWith('_') && k !== 'DT_RowId')
    .sort((a, b) => parseInt(a) - parseInt(b));

  // Column mappings per table — verified against actual Punchpass DataTable headers
  const mappings = {
    customer_attendance: {
      // 0=Select, 1=First Name(link), 2=Last Name(link), 3=Email, 4=Last Attendance(sort), 5=Last Attendance(display), 6=#Attended, 7=#Late Cancel, 8=#No Shows, 9=Child Name
      first_name: 1, last_name: 2, email: 3, last_attendance: 4, attended: 6, late_cancel: 7, no_shows: 8, child_name: 9
    },
    sales_details: {
      // 0=Pass Name(link), 1=Number Sold, 2=Revenue
      pass_name: 0, number_sold: 1, revenue: 2
    },
    active_passes: {
      // 0=Select, 1=Last Name(link), 2=First Name(link), 3=Email, 4=Pass(link), 5=Active On(sort), 6=Active On(display), 7=Expires On(sort), 8=Expires On(display), 9=Remaining Value Cents, 10=Remaining Value(display), 11=Punches Left, 12=Status
      last_name: 1, first_name: 2, pass: 4, active_on: 5, expires_on: 7, remaining_value: 10, punches_left: 11, status: 12
    },
    no_active_pass: {
      // 0=Select, 1=Customer(full name link), 2=Email, 3=Historical Passes, 4=Last Purchase(display), 5=Customer Since(display)
      // Note: column 1 has full name, no separate first/last
      last_name: 1, first_name: 1, email: 2, last_attendance: 4, total_attended: 3
    },
    no_shows: {
      // 0=Select, 1=First Name(link), 2=Last Name(link), 3=Email, 4=Date(sort), 5=Date(display), 6=Class, 7=Type
      first_name: 1, last_name: 2, email: 3, date: 4, class_name: 6, type: 7
    },
    passes_expiring: {
      // 0=Select, 1=Pass(link), 2=Expiration(sort), 3=Expiration(display), 4=Email Notice Sent, 5=Has Another Pass, 6=Customer(link), 7=Last Name, 8=First Name, 9=Email
      pass: 1, expires_on: 2, last_name: 7, first_name: 8, punches_left: 4
    },
    memberships: {
      // 0=Select, 1=Customer(link), 2=Last Name, 3=First Name, 4=Phone, 5=Email, 6=Membership(link), 7=Started(sort), 8=Started(display), 9=Current Period Ends(sort), 10=Current Period Ends(display), 11=Paid With, 12=Status(html), 13=#Passes Issued, 14=Renewals Left, 15=Customer ID
      last_name: 2, first_name: 3, pass: 6, status: 12, next_renewal: 9, amount: 11
    },
    class_revenue: {
      // Assumed standard: 0=class_name, 1=total_classes, 2=total_attendances, 3=avg_attendance, 4=total_revenue, 5=avg_revenue
      class_name: 0, total_classes: 1, total_attendances: 2, avg_attendance: 3, total_revenue: 4, avg_revenue: 5
    }
  };

  const mapping = mappings[tableName];
  if (!mapping) return null;

  const result = {};
  for (const [col, idx] of Object.entries(mapping)) {
    const key = String(idx);
    let val = row[key];

    // Strip any remaining HTML tags
    if (typeof val === 'string' && val.includes('<')) {
      const stripped = val.replace(/<[^>]*>/g, '').trim();
      if (stripped) val = stripped;
    }

    // Parse integers
    if (['attended', 'late_cancel', 'no_shows', 'number_sold', 'total_attended', 'total_classes', 'total_attendances'].includes(col)) {
      val = parseInt(val) || 0;
    }
    if (col === 'avg_attendance') {
      val = parseFloat(val) || 0;
    }

    result[col] = val !== undefined ? val : null;
  }

  // Customer ID from DT_RowId — formats: "selected-id-XXX", "pass-YYY-selected-id-XXX", "customer-XXX", "membership-id-YYY-selected-id-XXX"
  if (row._customer_id) {
    const match = row._customer_id.match(/selected-id-(\d+)/) || row._customer_id.match(/customer-(\d+)/);
    result.customer_id = match ? match[1] : row._customer_id.replace('selected-id-', '');
  } else {
    result.customer_id = null;
  }

  return result;
}

function storeData(db, tableName, rows, runId, dateRange) {
  if (!rows || rows.length === 0) return 0;

  const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const dbCols = tableInfo.map(c => c.name).filter(c => !['id', 'scrape_run_id', 'scraped_at'].includes(c));

  const insert = db.prepare(`
    INSERT INTO ${tableName} (scrape_run_id, ${dbCols.join(', ')})
    VALUES (${runId}, ${dbCols.map(() => '?').join(', ')})
  `);

  let stored = 0;
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      const mapped = mapRowToColumns(item, tableName);
      if (!mapped) continue;

      const values = dbCols.map(col => {
        if (col === 'date_range') return dateRange || null;
        if (col === 'customer_id') return mapped.customer_id || null;
        return mapped[col] !== undefined ? mapped[col] : null;
      });

      insert.run(values);
      stored++;
    }
  });

  insertMany(rows);
  return stored;
}

function buildDailySnapshot(db, runId) {
  const today = new Date().toISOString().split('T')[0];

  const customers = db.prepare(`SELECT COUNT(*) as c FROM customer_attendance WHERE scrape_run_id = ?`).get(runId);
  const active = db.prepare(`SELECT COUNT(*) as c FROM active_passes WHERE scrape_run_id = ?`).get(runId);
  const noPass = db.prepare(`SELECT COUNT(*) as c FROM no_active_pass WHERE scrape_run_id = ?`).get(runId);
  const expiring = db.prepare(`SELECT COUNT(*) as c FROM passes_expiring WHERE scrape_run_id = ?`).get(runId);
  const memberships = db.prepare(`SELECT COUNT(*) as c FROM memberships WHERE scrape_run_id = ?`).get(runId);
  const sales = db.prepare(`SELECT SUM(CAST(REPLACE(REPLACE(revenue, 'HK$', ''), ',', '') AS REAL)) as total FROM sales_details WHERE scrape_run_id = ?`).get(runId);
  const attendance = db.prepare(`SELECT SUM(attended) as total FROM customer_attendance WHERE scrape_run_id = ?`).get(runId);
  const noShows = db.prepare(`SELECT COUNT(*) as c FROM no_shows WHERE scrape_run_id = ?`).get(runId);

  db.prepare(`
    INSERT OR REPLACE INTO daily_snapshot (date, total_customers, active_passes, no_active_pass, passes_expiring_soon, memberships_active, month_revenue, month_attendances, month_no_shows)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    today,
    customers?.c || 0,
    active?.c || 0,
    noPass?.c || 0,
    expiring?.c || 0,
    memberships?.c || 0,
    sales?.total ? `HK$${sales.total.toFixed(2)}` : 'HK$0',
    attendance?.total || 0,
    noShows?.c || 0
  );

  console.log(`  Daily snapshot saved for ${today}`);
}

async function sendTelegramAlert(message) {
  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.PAUL_CHAT_ID;
  if (!token || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    });
  } catch (e) {
    console.error('Telegram alert failed:', e.message);
  }
}

async function checkForAlerts(db) {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const todaySnap = db.prepare(`SELECT * FROM daily_snapshot WHERE date = ?`).get(today);
  const yesterdaySnap = db.prepare(`SELECT * FROM daily_snapshot WHERE date = ?`).get(yesterday);

  if (!todaySnap) return;

  const alerts = [];

  if (todaySnap.passes_expiring_soon > 0) {
    const expiring = db.prepare(`
      SELECT first_name, last_name, pass, expires_on, punches_left
      FROM passes_expiring
      WHERE scrape_run_id = (SELECT MAX(id) FROM scrape_runs WHERE status = 'completed')
      ORDER BY expires_on ASC LIMIT 5
    `).all();

    if (expiring.length > 0) {
      const list = expiring.map(e => `  - ${e.first_name} ${e.last_name} | ${e.pass} (${e.punches_left} left, exp ${e.expires_on})`).join('\n');
      alerts.push(`<b>${todaySnap.passes_expiring_soon} passes expiring soon:</b>\n${list}`);
    }
  }

  if (todaySnap.no_active_pass > 0 && yesterdaySnap && todaySnap.no_active_pass > yesterdaySnap.no_active_pass) {
    const diff = todaySnap.no_active_pass - yesterdaySnap.no_active_pass;
    alerts.push(`${diff} more customer(s) without active pass (total: ${todaySnap.no_active_pass})`);
  }

  let summary = `<b>Punchpass Daily — ${today}</b>\n`;
  summary += `Active customers: ${todaySnap.total_customers}\n`;
  summary += `Active passes: ${todaySnap.active_passes}\n`;
  summary += `Month revenue: ${todaySnap.month_revenue}\n`;
  summary += `Month attendances: ${todaySnap.month_attendances}\n`;
  summary += `No-shows: ${todaySnap.month_no_shows}\n`;
  summary += `Expiring soon: ${todaySnap.passes_expiring_soon}\n`;
  summary += `No active pass: ${todaySnap.no_active_pass}`;

  if (alerts.length > 0) {
    summary += '\n\n' + alerts.join('\n\n');
  }

  await sendTelegramAlert(summary);
}

// ===== Main =====
async function run() {
  console.log('Punchpass Scraper (browser-harness mode)');
  console.log('========================================');

  // Verify browser-harness is available
  try {
    const check = bhRun('print(page_info())');
    console.log('  Browser connected:', check.split('\n')[0].slice(0, 80));
  } catch (e) {
    console.error('Cannot connect to Chrome. Is browser-harness running?');
    console.error('Make sure Chrome has remote debugging enabled.');
    process.exit(1);
  }

  const db = initDB();
  const runResult = db.prepare(`INSERT INTO scrape_runs DEFAULT VALUES`).run();
  const runId = Number(runResult.lastInsertRowid);

  try {
    let totalReports = 0;

    for (const [key, report] of Object.entries(REPORTS)) {
      console.log(`\n  Scraping: ${report.name}...`);
      try {
        const result = navigateAndExtract(report.url);
        const tableData = result.tableData || result;
        const rows = tableData.rows || [];
        const dateRange = result.dateRange || '';

        if (tableData.error) {
          console.log(`    Error: ${tableData.error}`);
          continue;
        }

        if (rows.length > 0) {
          const count = storeData(db, key, rows, runId, dateRange);
          console.log(`    ${count} rows stored`);
          totalReports++;
        } else {
          console.log(`    No data`);
        }
      } catch (err) {
        console.error(`    Failed: ${err.message.slice(0, 200)}`);
      }
    }

    // Daily snapshot
    buildDailySnapshot(db, runId);

    // Mark complete
    db.prepare(`UPDATE scrape_runs SET completed_at = datetime('now'), status = 'completed', reports_scraped = ? WHERE id = ?`).run(totalReports, runId);
    console.log(`\nScrape complete. ${totalReports}/${Object.keys(REPORTS).length} reports stored.`);

    // Rebuild member profiles
    try {
      const profiler = require('./punchpass-profiler.cjs');
      const profileCount = profiler.buildProfiles(db);
      console.log(`  ${profileCount} member profiles updated.`);
    } catch (e) {
      console.log(`  Profiler skipped: ${e.message}`);
    }

    // Telegram alerts
    await checkForAlerts(db);

  } catch (err) {
    console.error('Scrape failed:', err.message);
    db.prepare(`UPDATE scrape_runs SET completed_at = datetime('now'), status = 'failed', error = ? WHERE id = ?`).run(err.message, runId);
    await sendTelegramAlert(`<b>Punchpass scrape failed:</b> ${err.message}`);
  } finally {
    db.close();
  }
}

// CLI
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node punchpass-scraper.cjs [--help]');
  console.log('Scrapes Punchpass reports via browser-harness (connects to your Chrome).');
  console.log('Reports:', Object.keys(REPORTS).join(', '));
  process.exit(0);
}

run().catch(console.error);
