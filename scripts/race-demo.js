const http = require('http');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TARGET_SLOT_ID = '11111111-1111-1111-1111-111111111111'; // 09:00 slot for dr-smith
const EXPECTED_REFUSAL_MSG = 'We are sorry, but the 09:00 appointment was just booked by another patient. Please select another open time.';

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

  // PR Feedback 1: Assert parsed refusal body contains exact patient-readable refusal message
  const refusalRes = resA.status === 409 ? resA : resB;
  const refusalText = typeof refusalRes.body === 'object' ? refusalRes.body.error || refusalRes.body.message : refusalRes.body;

  if (refusalText !== EXPECTED_REFUSAL_MSG) {
    console.error('❌ Refusal body assertion failed!');
    console.error(`   Expected: "${EXPECTED_REFUSAL_MSG}"`);
    console.error(`   Got:      "${refusalText}"`);
    process.exit(1);
  }

  console.log('✔ Race Result Verified: Exactly one 200 OK (Success) and one 409 Conflict with patient-readable refusal message.\n');

  // PR Feedback 1 (Store Verification): Verify final slot state via GET /slots/:id HTTP endpoint (no direct DB connection)
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
