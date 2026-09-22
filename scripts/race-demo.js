const http = require('http');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TARGET_SLOT_ID = '11111111-1111-1111-1111-111111111111'; // 09:00 slot for dr-smith
const VALID_REFUSAL_MESSAGES = [
  'We are sorry, but the 09:00 appointment was just booked by another patient. Please select another open time.',
  'We are sorry, but that appointment was just booked by another patient. Please select another open time.',
];

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

  // Step 0: Check database store mode to enforce real PostgreSQL requirement (Fail Closed)
  console.log('[0/4] Checking database store mode via GET /_debug/store-status...');
  const storeStatusRes = await makeRequest('/_debug/store-status', 'GET');
  
  const isNativePostgres = storeStatusRes.status === 200 &&
    typeof storeStatusRes.body === 'object' &&
    storeStatusRes.body !== null &&
    storeStatusRes.body.inMemory === false;

  if (!isNativePostgres) {
    console.error('FATAL: Server is running in pg-mem fallback mode. True concurrency cannot be proven synchronously. Please start PostgreSQL.');
    process.exit(1);
  }
  console.log('✔ Confirmed server is connected to native PostgreSQL database.\n');

  // Step 1: Reset test data to clean initial state
  console.log('[1/4] Resetting server state to ensure target slot is AVAILABLE...');
  const resetRes = await makeRequest('/reset-test-data', 'POST', {});
  if (resetRes.status !== 200) {
    console.error('❌ Failed to reset test data:', resetRes.body);
    process.exit(1);
  }
  console.log('✔ Server reset successfully (Target Slot 09:00 is OPEN).\n');

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

  if (!hasOneSuccess || !hasOneConflict) {
    console.error(`❌ Unexpected HTTP status combination: [${resA.status}, ${resB.status}]. Expected [200, 409].`);
    process.exit(1);
  }

  // PR Feedback: Assert refusal body matches either conditional write or lock_timeout refusal message
  const refusalRes = resA.status === 409 ? resA : resB;
  const refusalText = typeof refusalRes.body === 'object' ? refusalRes.body.error || refusalRes.body.message : refusalRes.body;

  const isValidRefusal = VALID_REFUSAL_MESSAGES.includes(refusalText);

  if (!isValidRefusal) {
    console.error('❌ Refusal body assertion failed!');
    console.error(`   Expected one of:\n     1) "${VALID_REFUSAL_MESSAGES[0]}"\n     2) "${VALID_REFUSAL_MESSAGES[1]}"`);
    console.error(`   Got:              "${refusalText}"`);
    process.exit(1);
  }

  console.log('✔ Race Result Verified: Exactly one 200 OK (Success) and one 409 Conflict with patient-readable refusal message.\n');

  // Store Verification: Verify final slot state via GET /slots/:id HTTP endpoint
  console.log('[4/4] Verifying final slot state via GET /slots/:id...');
  const slotRes = await makeRequest(`/slots/${TARGET_SLOT_ID}`, 'GET');

  if (slotRes.status !== 200) {
    console.error(`❌ Failed to fetch slot status via GET /slots/${TARGET_SLOT_ID}:`, slotRes.body);
    process.exit(1);
  }

  const slotRecord = slotRes.body;

  console.log('----------------------------------------------------');
  console.log('📊 FINAL STORE SLOT STATE (from GET /slots/:id):');
  console.log(`  Slot ID:         ${slotRecord.id}`);
  console.log(`  Clinician ID:    ${slotRecord.clinician_id}`);
  console.log(`  Time:            ${slotRecord.time}`);
  console.log(`  Status:          ${slotRecord.status}`);
  console.log(`  Idempotency Key: ${slotRecord.idempotency_key}`);
  console.log('----------------------------------------------------');

  if (slotRecord.status === 'BOOKED') {
    console.log('\n🎉 DEMO SUCCESS: Race condition handled flawlessly! Slot was booked exactly ONCE.');
    console.log('====================================================\n');
    process.exit(0);
  } else {
    console.error('\n❌ DEMO FAILED: Final slot status was not BOOKED.');
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
