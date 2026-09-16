const http = require('http');
const { v4: uuidv4 } = require('uuid');
const { seedClinicianSlots } = require('../seed');
const db = require('../db');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function makeGetRequest(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const req = http.request(
      url,
      {
        method: 'GET',
      },
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
    req.end();
  });
}

function makePostRequest(path, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const data = JSON.stringify(payload);

    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
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
    req.write(data);
    req.end();
  });
}

async function runConcurrencyTests() {
  console.log('\n==================================================');
  console.log('⚡ STARTING RACE CONDITION, IDEMPOTENCY & SEED SUITE');
  console.log('==================================================\n');

  // 0. Reset Test Data (seeds 9 hourly slots 09:00 - 17:00 for dr-smith)
  console.log('[Setup] Resetting test database slots...');
  const resetRes = await makePostRequest('/reset-test-data', {});
  if (resetRes.status !== 200) {
    throw new Error(`Failed to reset test database: ${JSON.stringify(resetRes.body)}`);
  }
  console.log('[Setup] Database reset complete (9 hourly slots seeded for dr-smith).\n');

  const targetSlotId = '22222222-2222-2222-2222-222222222222'; // 10:00 slot
  const expectedTime = '10:00';

  // ----------------------------------------------------
  // TEST 1: RACE CONDITION PROOF (Different Idempotency Keys)
  // ----------------------------------------------------
  console.log('--------------------------------------------------');
  console.log('TEST 1: Race Condition Proof (2 Concurrent Bookings for 1 Slot)');
  console.log('--------------------------------------------------');

  const key1 = `idempotency-key-race-A-${uuidv4()}`;
  const key2 = `idempotency-key-race-B-${uuidv4()}`;

  console.log(`Firing 2 simultaneous POST /book requests for slot ${targetSlotId} (10:00)...`);

  const [resA, resB] = await Promise.all([
    makePostRequest('/book', { slot_id: targetSlotId, idempotency_key: key1 }),
    makePostRequest('/book', { slot_id: targetSlotId, idempotency_key: key2 }),
  ]);

  console.log('\nResponses Received:');
  console.log(`  - Response A Status: ${resA.status}`);
  console.log(`  - Response A Body:   ${JSON.stringify(resA.body)}`);
  console.log(`  - Response B Status: ${resB.status}`);
  console.log(`  - Response B Body:   ${JSON.stringify(resB.body)}`);

  const statuses = [resA.status, resB.status].sort();
  const expectedRefusal = `We are sorry, but the ${expectedTime} appointment was just booked by another patient. Please select another open time.`;

  let test1Passed = false;
  if (statuses[0] === 200 && statuses[1] === 409) {
    const refusalRes = resA.status === 409 ? resA : resB;

    if (refusalRes.body === expectedRefusal) {
      test1Passed = true;
      console.log('\n✅ TEST 1 PASSED!');
      console.log(`   - Exactly one 200 OK received.`);
      console.log(`   - Exactly one 409 Conflict received.`);
      console.log(`   - Refusal message matched exact string: "${expectedRefusal}"`);
    } else {
      console.error('\n❌ TEST 1 FAILED: Refusal message string mismatch!');
      console.error(`   Expected: "${expectedRefusal}"`);
      console.error(`   Got:      "${refusalRes.body}"`);
    }
  } else {
    console.error('\n❌ TEST 1 FAILED: Incorrect HTTP status codes!');
    console.error(`   Expected one 200 and one 409, got [${resA.status}, ${resB.status}]`);
  }

  // ----------------------------------------------------
  // TEST 2: IDEMPOTENCY PROOF (Same Idempotency Key)
  // ----------------------------------------------------
  console.log('\n--------------------------------------------------');
  console.log('TEST 2: Idempotency Proof (2 Concurrent Requests with SAME Key)');
  console.log('--------------------------------------------------');

  const slotId2 = '33333333-3333-3333-3333-333333333333'; // 14:00 slot
  const sameKey = `idempotency-key-same-${uuidv4()}`;

  console.log(`Firing 2 simultaneous POST /book requests for slot ${slotId2} (14:00) with SAME key...`);

  const [resIdem1, resIdem2] = await Promise.all([
    makePostRequest('/book', { slot_id: slotId2, idempotency_key: sameKey }),
    makePostRequest('/book', { slot_id: slotId2, idempotency_key: sameKey }),
  ]);

  let test2Passed = false;
  if (
    resIdem1.status === 200 &&
    resIdem2.status === 200 &&
    JSON.stringify(resIdem1.body) === JSON.stringify(resIdem2.body)
  ) {
    test2Passed = true;
    console.log('✅ TEST 2 PASSED!');
    console.log('   - Both requests returned HTTP 200 OK.');
    console.log('   - Hold-and-return logic successfully returned identical booking payloads.');
  } else {
    console.error('❌ TEST 2 FAILED: Idempotent responses were not identical or not 200!');
  }

  // ----------------------------------------------------
  // TEST 3: LIST ENDPOINT GET /slots (Strict Open Slots Count & Missing Booked Times)
  // ----------------------------------------------------
  console.log('\n--------------------------------------------------');
  console.log('TEST 3: List Endpoint GET /slots Verification');
  console.log('--------------------------------------------------');

  const listRes = await makeGetRequest('/slots?clinician_id=dr-smith');
  const emptyListRes = await makeGetRequest('/slots?clinician_id=non-existent-doctor');

  let test3Passed = false;
  const totalSeeded = 9;
  const expectedAvailableCount = totalSeeded - 2; // 2 booked slots (10:00 and 14:00)

  if (listRes.status === 200 && Array.isArray(listRes.body)) {
    const returnedSlots = listRes.body;
    const returnedTimes = returnedSlots.map((s) => s.time);

    const isCorrectCount = returnedSlots.length === expectedAvailableCount;
    const missingBooked1 = !returnedTimes.includes('10:00') && !returnedTimes.includes('10:00 AM');
    const missingBooked2 = !returnedTimes.includes('14:00') && !returnedTimes.includes('02:00 PM');
    const isEmptyClean = emptyListRes.status === 200 && Array.isArray(emptyListRes.body) && emptyListRes.body.length === 0;

    if (isCorrectCount && missingBooked1 && missingBooked2 && isEmptyClean) {
      test3Passed = true;
      console.log('✅ TEST 3 PASSED!');
      console.log(`   - Exactly ${expectedAvailableCount} remaining open slots returned for dr-smith.`);
      console.log('   - Booked times ("10:00" and "14:00") are strictly missing from returned list.');
      console.log('   - Unknown clinician query returned clean empty array [] with HTTP 200.');
    } else {
      console.error('❌ TEST 3 FAILED: List assertion failed!');
      console.error(`   - Expected count: ${expectedAvailableCount}, Got: ${returnedSlots.length}`);
      console.error(`   - Returned times: ${JSON.stringify(returnedTimes)}`);
    }
  } else {
    console.error('❌ TEST 3 FAILED: Invalid response status or body structure.');
  }

  // ----------------------------------------------------
  // TEST 4: SEED IDEMPOTENCY PROOF (Running seedClinicianSlots Twice)
  // ----------------------------------------------------
  console.log('\n--------------------------------------------------');
  console.log('TEST 4: Seed Idempotency Proof (ON CONFLICT DO NOTHING)');
  console.log('--------------------------------------------------');

  console.log('Running seedClinicianSlots("dr-smith") twice in a row...');
  await seedClinicianSlots('dr-smith', true);
  await seedClinicianSlots('dr-smith', true);

  const dbCountRes = await db.query(
    "SELECT COUNT(*) FROM slots WHERE clinician_id = 'dr-smith'"
  );
  const totalCount = parseInt(dbCountRes.rows[0].count, 10);

  let test4Passed = false;
  if (totalCount === 9) {
    test4Passed = true;
    console.log('✅ TEST 4 PASSED!');
    console.log('   - Total count of slots for dr-smith remains exactly 9.');
    console.log('   - Confirmed ON CONFLICT (clinician_id, time) DO NOTHING prevents duplicate rows.');
  } else {
    console.error(`❌ TEST 4 FAILED: Expected exactly 9 slots for dr-smith, found ${totalCount}.`);
  }

  console.log('\n==================================================');
  if (test1Passed && test2Passed && test3Passed && test4Passed) {
    console.log('🎉 ALL RACE CONDITION, IDEMPOTENCY, LIST & SEED TESTS PASSED!');
    console.log('==================================================\n');
    process.exit(0);
  } else {
    console.log('💥 CONCURRENCY & SEED SUITE FAILED!');
    console.log('==================================================\n');
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  runConcurrencyTests().catch((err) => {
    console.error('\n[Test Execution Error]:', err);
    process.exit(1);
  });
}
