const http = require('http');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TARGET_SLOT_ID = '11111111-1111-1111-1111-111111111111'; // 09:00 slot for dr-smith

function makeRequest(path, method = 'GET', payload = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const data = payload ? JSON.stringify(payload) : null;

    const headers = {};
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }

    const req = http.request(
      url,
      { method, headers },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (data) req.write(data);
    req.end();
  });
}

async function runRaceDemo() {
  console.log('====================================================');
  console.log('⚡ REPEATABLE RACE CONDITION DEMO (Ticket TLSTO-004)');
  console.log('====================================================\n');

  // Step 1: Reset DB to clean initial state
  console.log('[1/4] Resetting database to ensure target slot is AVAILABLE...');
  const resetRes = await makeRequest('/reset-test-data', 'POST', {});
  if (resetRes.status !== 200) {
    console.error('❌ Failed to reset test database:', resetRes.body);
    process.exit(1);
  }
  console.log('✔ Database reset successfully (Target Slot 09:00 is OPEN).\n');

  // Step 2: Prepare two concurrent requests for the EXACT same slot ID
  const keyA = `patient-A-${uuidv4()}`;
  const keyB = `patient-B-${uuidv4()}`;

  console.log('[2/4] Firing 2 concurrent POST /book requests at the EXACT same millisecond:');
  console.log(`  - Target Slot ID: ${TARGET_SLOT_ID}`);
  console.log(`  - Patient A Key:  ${keyA}`);
  console.log(`  - Patient B Key:  ${keyB}\n`);

  // Step 3: Fire concurrently via Promise.all
  const [resA, resB] = await Promise.all([
    makeRequest('/book', 'POST', { slot_id: TARGET_SLOT_ID, idempotency_key: keyA }),
    makeRequest('/book', 'POST', { slot_id: TARGET_SLOT_ID, idempotency_key: keyB }),
  ]);

  console.log('[3/4] Responses Received:');
  console.log('----------------------------------------------------');
  console.log(`  Patient A Response:`);
  console.log(`    HTTP Status:   ${resA.status}`);
  console.log(`    Response Body: ${typeof resA.body === 'object' ? JSON.stringify(resA.body) : resA.body}`);
  console.log('');
  console.log(`  Patient B Response:`);
  console.log(`    HTTP Status:   ${resB.status}`);
  console.log(`    Response Body: ${typeof resB.body === 'object' ? JSON.stringify(resB.body) : resB.body}`);
  console.log('----------------------------------------------------\n');

  // Verify HTTP status codes
  const statuses = [resA.status, resB.status].sort();
  const hasOneSuccess = statuses[0] === 200;
  const hasOneConflict = statuses[1] === 409;

  if (hasOneSuccess && hasOneConflict) {
    console.log('✔ Race Result Verified: Exactly one 200 OK (Success) and one 409 Conflict (Refusal).\n');
  } else {
    console.error(`❌ Unexpected HTTP status combination: [${resA.status}, ${resB.status}]. Expected [200, 409].`);
    process.exit(1);
  }

  // Step 4: Connect to database & query slots table to verify final state
  console.log('[4/4] Connecting to Database to query `slots` table state...');
  await db.initDb();

  let slotRecord;
  let totalBookedCount = 0;

  if (!db.isInMemoryMode()) {
    // Native Postgres DB query
    const slotRes = await db.query(
      'SELECT id, clinician_id, time, status, idempotency_key FROM slots WHERE id = $1',
      [TARGET_SLOT_ID]
    );
    slotRecord = slotRes.rows[0];

    const countRes = await db.query(
      "SELECT COUNT(*) FROM slots WHERE id = $1 AND status = 'BOOKED'",
      [TARGET_SLOT_ID]
    );
    totalBookedCount = parseInt(countRes.rows[0].count, 10);
  } else {
    // In-memory pg-mem mode: server holds DB state, query server DB endpoint
    const slotRes = await makeRequest(`/slots/${TARGET_SLOT_ID}`);
    slotRecord = slotRes.body;
    totalBookedCount = slotRecord && slotRecord.status === 'BOOKED' ? 1 : 0;
  }

  console.log('----------------------------------------------------');
  console.log('📊 FINAL DATABASE SLOT STATE:');
  console.log(`  Slot ID:         ${slotRecord.id}`);
  console.log(`  Clinician ID:    ${slotRecord.clinician_id}`);
  console.log(`  Time:            ${slotRecord.time}`);
  console.log(`  Status:          ${slotRecord.status}`);
  console.log(`  Idempotency Key: ${slotRecord.idempotency_key}`);
  console.log(`  Total Booked:    ${totalBookedCount} (Expected: 1)`);
  console.log('----------------------------------------------------');

  if (slotRecord.status === 'BOOKED' && totalBookedCount === 1) {
    console.log('\n🎉 DEMO SUCCESS: Race condition handled flawlessly! Slot was booked exactly ONCE.');
    console.log('====================================================\n');
    process.exit(0);
  } else {
    console.error('\n❌ DEMO FAILED: Database state did not match expected single booking.');
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  runRaceDemo().catch((err) => {
    console.error('\n[Race Demo Error]:', err);
    process.exit(1);
  });
}
