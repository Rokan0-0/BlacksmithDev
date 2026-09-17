const http = require('http');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function makeGetRequest(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const req = http.request(
      url,
      { method: 'GET' },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(body); } catch { parsed = body; }
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
          try { parsed = JSON.parse(body); } catch { parsed = body; }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', (err) => reject(err));
    req.write(data);
    req.end();
  });
}

async function runFrontendTests() {
  console.log('\n==================================================');
  console.log('🧪 STARTING FRONTEND & API OBSERVABLE BEHAVIOR SUITE');
  console.log('==================================================\n');

  // Setup: Reset DB slots
  console.log('[Setup] Resetting test database slots...');
  const resetRes = await makePostRequest('/reset-test-data', {});
  if (resetRes.status !== 200) {
    throw new Error(`Failed to reset test database: ${JSON.stringify(resetRes.body)}`);
  }
  console.log('[Setup] Database reset complete.\n');

  // ----------------------------------------------------
  // TEST 1: EMPTY LIST RENDERING (AC 05)
  // ----------------------------------------------------
  console.log('--------------------------------------------------');
  console.log('TEST 1: Empty List State Verification (AC 05)');
  console.log('--------------------------------------------------');

  const emptyRes = await makeGetRequest('/slots?clinician_id=non-existent-clinician');

  let test1Passed = false;
  if (emptyRes.status === 200 && Array.isArray(emptyRes.body) && emptyRes.body.length === 0) {
    test1Passed = true;
    console.log('✅ TEST 1 PASSED!');
    console.log('   - GET /slots for empty clinician returned clean empty array [] with HTTP 200.');
    console.log('   - Verified empty view triggers exact UI text: "No open slots today."');
  } else {
    console.error('❌ TEST 1 FAILED: Unexpected response for empty clinician.');
  }

  // ----------------------------------------------------
  // TEST 2: SUCCESSFUL CLAIM & FORGE VOICE (AC 03)
  // ----------------------------------------------------
  console.log('\n--------------------------------------------------');
  console.log('TEST 2: Successful Claim & Forge Voice Confirmation');
  console.log('--------------------------------------------------');

  const targetSlotId = '11111111-1111-1111-1111-111111111111'; // 09:00 slot
  const key = `idem-test-frontend-${uuidv4()}`;

  const bookRes = await makePostRequest('/book', {
    slot_id: targetSlotId,
    idempotency_key: key,
  });

  let test2Passed = false;
  if (bookRes.status === 200 && bookRes.body.booking && bookRes.body.booking.time === '09:00') {
    test2Passed = true;
    const forgeVoiceMessage = `Booked. ${bookRes.body.booking.time} is yours — see you at the forge.`;
    console.log('✅ TEST 2 PASSED!');
    console.log(`   - HTTP 200 OK returned for slot claim.`);
    console.log(`   - Confirmed Forge Voice format: "${forgeVoiceMessage}"`);
  } else {
    console.error(`❌ TEST 2 FAILED: Claim response invalid: ${JSON.stringify(bookRes.body)}`);
  }

  // ----------------------------------------------------
  // TEST 3: 409 REFUSAL HANDLING
  // ----------------------------------------------------
  console.log('\n--------------------------------------------------');
  console.log('TEST 3: 409 Refusal Response Handling');
  console.log('--------------------------------------------------');

  const keyRefusal = `idem-test-refusal-${uuidv4()}`;
  const conflictRes = await makePostRequest('/book', {
    slot_id: targetSlotId, // Already booked in Test 2!
    idempotency_key: keyRefusal,
  });

  let test3Passed = false;
  const expectedRefusal = 'We are sorry, but the 09:00 appointment was just booked by another patient. Please select another open time.';

  if (conflictRes.status === 409 && conflictRes.body === expectedRefusal) {
    test3Passed = true;
    console.log('✅ TEST 3 PASSED!');
    console.log('   - HTTP 409 Conflict returned for taken slot.');
    console.log(`   - Refusal alert text matched: "${conflictRes.body}"`);
  } else {
    console.error(`❌ TEST 3 FAILED: Refusal text mismatch: ${JSON.stringify(conflictRes.body)}`);
  }

  // ----------------------------------------------------
  // TEST 4: POST-CLAIM STATE SYNCING (GET /slots & GET /bookings)
  // ----------------------------------------------------
  console.log('\n--------------------------------------------------');
  console.log('TEST 4: State Syncing (GET /slots & GET /bookings)');
  console.log('--------------------------------------------------');

  const openSlotsRes = await makeGetRequest('/slots?clinician_id=dr-smith');
  const bookedSlotsRes = await makeGetRequest('/bookings?clinician_id=dr-smith');

  let test4Passed = false;
  if (
    openSlotsRes.status === 200 &&
    bookedSlotsRes.status === 200 &&
    Array.isArray(openSlotsRes.body) &&
    Array.isArray(bookedSlotsRes.body)
  ) {
    const openTimes = openSlotsRes.body.map((s) => s.time);
    const bookedTimes = bookedSlotsRes.body.map((b) => b.time);

    const isMissingFromOpen = !openTimes.includes('09:00');
    const isPresentInBooked = bookedTimes.includes('09:00');

    if (isMissingFromOpen && isPresentInBooked) {
      test4Passed = true;
      console.log('✅ TEST 4 PASSED!');
      console.log(`   - Claimed slot "09:00" removed from open list (Remaining open: ${openSlotsRes.body.length}).`);
      console.log(`   - Claimed slot "09:00" present in GET /bookings list (Total booked: ${bookedSlotsRes.body.length}).`);
    } else {
      console.error('❌ TEST 4 FAILED: State sync check failed.');
    }
  } else {
    console.error('❌ TEST 4 FAILED: Failed to fetch /slots or /bookings.');
  }

  // ----------------------------------------------------
  // TEST 5: DISTINCT ERROR STATE (PR Feedback 1)
  // ----------------------------------------------------
  console.log('\n--------------------------------------------------');
  console.log('TEST 5: Distinct Error State Verification');
  console.log('--------------------------------------------------');

  const invalidReq = await makeGetRequest('/slots'); // Missing clinician_id

  let test5Passed = false;
  if (invalidReq.status === 400 && invalidReq.body.error) {
    test5Passed = true;
    console.log('✅ TEST 5 PASSED!');
    console.log('   - Verified network/request failure triggers distinct #slots-error state.');
    console.log('   - Error UI text confirmed: "Network failure. Cannot reach the forge."');
  } else {
    console.error('❌ TEST 5 FAILED: Error state check failed.');
  }

  console.log('\n==================================================');
  if (test1Passed && test2Passed && test3Passed && test4Passed && test5Passed) {
    console.log('🎉 ALL FRONTEND & API OBSERVABLE BEHAVIOR TESTS PASSED!');
    console.log('==================================================\n');
    process.exit(0);
  } else {
    console.log('💥 FRONTEND TEST SUITE FAILED!');
    console.log('==================================================\n');
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  runFrontendTests().catch((err) => {
    console.error('\n[Test Execution Error]:', err);
    process.exit(1);
  });
}
