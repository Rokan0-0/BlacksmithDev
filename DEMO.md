# Race Condition Demonstration & Runbook (TLSTO-004)

This runbook documents how to execute the repeatable race condition demo to verify that the appointment booking system's concurrency control mechanism prevents double-booking when multiple concurrent requests attempt to book the exact same slot at the exact same millisecond.

---

## 1. Prerequisites & Environment Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start Real PostgreSQL Database**:
   A real PostgreSQL instance must be running for a true concurrent database race condition to occur. Start the PostgreSQL container via Docker Compose:
   ```bash
   docker-compose up -d db
   ```

3. **Start the Server in Test Mode**:
   Start the server application in **test mode** (required to enable the `/reset-test-data`, `/_debug/store-status`, and `/slots/:id` endpoints):
   ```bash
   npx cross-env NODE_ENV=test node server.js
   ```

> [!WARNING]
> **Verify Native PostgreSQL Connection**:
> Check the server startup logs to verify that it connected to native PostgreSQL:
> `[DB Init] Connected to native PostgreSQL database.`
> 
> If you see the fallback log (`[DB Init] PostgreSQL service not detected on port 5432. Active mode: In-Memory PostgreSQL engine (pg-mem).`), Node's single-threaded event loop processes requests synchronously in-memory. **The pg-mem fallback does NOT prove a true concurrent database race condition.** Always start PostgreSQL via `docker-compose up -d db` before evaluating true race condition behavior.

---

## 2. Resetting the State

To clear the database state and re-seed fresh available appointment slots for clinician `dr-smith` between demo runs, send a POST request to the reset endpoint:

```bash
curl -X POST http://localhost:3000/reset-test-data
```

> **Note:** The `scripts/race-demo.js` script also automatically sends a request to `/reset-test-data` before executing the concurrent requests, ensuring the demo is completely idempotent and re-runnable out of the box.

---

## 3. Running the Race Condition Demo

To execute the race condition demonstration, run the following command:

```bash
node scripts/race-demo.js
```

---

## 4. Expected Output

When running `node scripts/race-demo.js`, the script fires two simultaneous `POST /book` requests targeting the exact same slot ID (`11111111-1111-1111-1111-111111111111`, the 09:00 slot for `dr-smith`) with two distinct idempotency keys.

### Expected Console Output

```text
====================================================
⚡ REPEATABLE RACE CONDITION DEMO (Ticket TLSTO-004)
====================================================

[0/4] Checking database store mode via GET /_debug/store-status...
✔ Confirmed server is connected to native PostgreSQL database.

[1/4] Resetting server state to ensure target slot is AVAILABLE...
✔ Server reset successfully (Target Slot 09:00 is OPEN).

[2/4] Firing 2 concurrent POST /book requests at the EXACT same millisecond:
  - Target Slot ID: 11111111-1111-1111-1111-111111111111
  - Patient A Key:  patient-A-6ecd53d9-fd77-4f9e-9f49-a6f21023bc6d
  - Patient B Key:  patient-B-b80fbb7d-54b5-4d65-bb32-4c32d4d4b76d

[3/4] Responses Received:
----------------------------------------------------
  Patient A Response:
    HTTP Status:   200
    Response Body: {"message":"Appointment booked successfully.","booking":{"id":"11111111-1111-1111-1111-111111111111","time":"09:00","status":"BOOKED","clinician_id":"dr-smith"}}

  Patient B Response:
    HTTP Status:   409
    Response Body: We are sorry, but the 09:00 appointment was just booked by another patient. Please select another open time.
----------------------------------------------------

✔ Race Result Verified: Exactly one 200 OK (Success) and one 409 Conflict with patient-readable refusal message.

[4/4] Verifying final slot state via GET /slots/:id...
----------------------------------------------------
📊 FINAL STORE SLOT STATE (from GET /slots/:id):
  Slot ID:         11111111-1111-1111-1111-111111111111
  Clinician ID:    dr-smith
  Time:            09:00
  Status:          BOOKED
  Idempotency Key: patient-A-6ecd53d9-fd77-4f9e-9f49-a6f21023bc6d
----------------------------------------------------

🎉 DEMO SUCCESS: Race condition handled flawlessly! Slot was booked exactly ONCE.
====================================================
```

### Verification Criteria

1. **HTTP 200 OK (Success)**: Exactly one request succeeds with HTTP status `200` and returns the appointment booking object.
2. **HTTP 409 Conflict (Refusal Body Asserted)**: Exactly one request fails with HTTP status `409` and returns a valid patient-readable refusal message (either the conditional write refusal or the lock timeout refusal).
3. **Store State Assertion**: Querying `GET /slots/11111111-1111-1111-1111-111111111111` verifies that the active server store holds the slot in `BOOKED` status, associated with the winning patient's idempotency key.
