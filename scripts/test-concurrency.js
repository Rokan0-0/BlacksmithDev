const http = require('http');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

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
  console.log('⚡ STARTING RACE CONDITION & IDEMPOTENCY TEST SUITE');
  console.log('==================================================\n');

  // 0. Reset Test Data
  console.log('[Setup] Resetting test database slots...');
  const resetRes = await makePostRequest('/reset-test-data', {});
  if (resetRes.status !== 200) {
    throw new Error(`Failed to reset test database: ${JSON.stringify(resetRes.body)}`);
  }
  console.log('[Setup] Database reset complete.\n');

  const targetSlotId = '22222222-2222-2222-2222-222222222222'; // 10:00 AM slot
  const expectedTime = '10:00 AM';

  // ----------------------------------------------------
  // TEST 1: RACE CONDITION PROOF (Different Idempotency Keys)
  // ----------------------------------------------------
  console.log('--------------------------------------------------');
  console.log('TEST 1: Race Condition Proof (2 Concurrent Bookings for 1 Slot)');
  console.log('--------------------------------------------------');

  const key1 = `idempotency-key-race-A-${uuidv4()}`;
  const key2 = `idempotency-key-race-B-${uuidv4()}`;

  console.log(`Firing 2 simultaneous POST /book requests for slot ${targetSlotId}...`);
  console.log(`  - Request A Key: ${key1}`);
  console.log(`  - Request B Key: ${key2}`);

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
    const successRes = resA.status === 200 ? resA : resB;

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

  const slotId2 = '33333333-3333-3333-3333-333333333333'; // 02:00 PM slot
  const sameKey = `idempotency-key-same-${uuidv4()}`;

  console.log(`Firing 2 simultaneous POST /book requests for slot ${slotId2} with SAME key (${sameKey})...`);

  const [resIdem1, resIdem2] = await Promise.all([
    makePostRequest('/book', { slot_id: slotId2, idempotency_key: sameKey }),
    makePostRequest('/book', { slot_id: slotId2, idempotency_key: sameKey }),
  ]);

  console.log('\nResponses Received:');
  console.log(`  - Response 1 Status: ${resIdem1.status}`);
  console.log(`  - Response 1 Body:   ${JSON.stringify(resIdem1.body)}`);
  console.log(`  - Response 2 Status: ${resIdem2.status}`);
  console.log(`  - Response 2 Body:   ${JSON.stringify(resIdem2.body)}`);

  let test2Passed = false;
  if (
    resIdem1.status === 200 &&
    resIdem2.status === 200 &&
    JSON.stringify(resIdem1.body) === JSON.stringify(resIdem2.body)
  ) {
    test2Passed = true;
    console.log('\n✅ TEST 2 PASSED!');
    console.log('   - Both requests returned HTTP 200 OK.');
    console.log('   - Hold-and-return logic successfully returned identical booking payloads.');
  } else {
    console.error('\n❌ TEST 2 FAILED: Idempotent responses were not identical or not 200!');
  }

  console.log('\n==================================================');
  if (test1Passed && test2Passed) {
    console.log('🎉 ALL CONCURRENCY & ISOLATION TESTS PASSED PERFECTLY!');
    console.log('==================================================\n');
    process.exit(0);
  } else {
    console.log('💥 CONCURRENCY TESTS FAILED!');
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
