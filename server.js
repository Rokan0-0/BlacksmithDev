const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const LOCK_TIMEOUT_MS = process.env.LOCK_TIMEOUT_MS || '2000ms';

/**
 * List Endpoint: GET /slots
 * Returns all AVAILABLE slots for a specific clinician ordered by time.
 * If no slots are found, returns a clean empty array [] with HTTP 200.
 */
app.get('/slots', async (req, res) => {
  const { clinician_id } = req.query;

  if (!clinician_id) {
    return res.status(400).json({ error: 'clinician_id query parameter is required.' });
  }

  try {
    const result = await db.query(
      "SELECT id, time, status FROM slots WHERE clinician_id = $1 AND status = 'AVAILABLE' ORDER BY time",
      [clinician_id]
    );

    return res.status(200).json(result.rows || []);
  } catch (error) {
    console.error('[GET /slots Error]:', error);
    return res.status(500).json({ error: 'Internal server error while fetching slots.' });
  }
});

/**
 * Core Endpoint: POST /book
 * Implements atomic booking, lock_timeout protection, 
 * idempotency hold-and-return logic, and race condition prevention.
 */
app.post('/book', async (req, res) => {
  const { slot_id, idempotency_key } = req.body;

  if (!slot_id || !idempotency_key) {
    return res.status(400).json({ error: 'slot_id and idempotency_key are required.' });
  }

  const client = await db.connect();

  try {
    // 1. Configure Transaction & Session Lock Timeout
    await client.query('BEGIN');
    await client.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT_MS}'`);

    // 2. Idempotency Check (The Wait/Throw)
    let isPrimaryExecution = true;
    try {
      await client.query(
        'INSERT INTO idempotency_keys (key) VALUES ($1)',
        [idempotency_key]
      );
    } catch (err) {
      // 23505 is PostgreSQL's unique_violation error code
      if (err.code === '23505') {
        isPrimaryExecution = false;
        await client.query('ROLLBACK');
      } else {
        throw err;
      }
    }

    // Handled Concurrent Retry (Hold and Return)
    if (!isPrimaryExecution) {
      const startTime = Date.now();
      const maxWaitMs = 2500;

      while (Date.now() - startTime < maxWaitMs) {
        const keyResult = await db.query(
          'SELECT booking_result FROM idempotency_keys WHERE key = $1',
          [idempotency_key]
        );

        if (keyResult.rows.length > 0 && keyResult.rows[0].booking_result !== null) {
          let stored = keyResult.rows[0].booking_result;
          if (typeof stored === 'string') {
            try { stored = JSON.parse(stored); } catch (e) {}
          }
          return res.status(stored.statusCode || 200).send(stored.payload);
        }

        // Wait 50ms before polling again
        await new Promise((r) => setTimeout(r, 50));
      }

      return res.status(504).json({ error: 'Transaction timeout waiting for idempotency execution.' });
    }

    // 3. Fetch Slot Details (to acquire time string for potential refusal message)
    const slotCheck = await client.query(
      'SELECT id, time, status, clinician_id FROM slots WHERE id = $1',
      [slot_id]
    );

    if (slotCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      const errPayload = { error: 'Slot not found.' };
      await db.query(
        'UPDATE idempotency_keys SET booking_result = $2 WHERE key = $1',
        [idempotency_key, JSON.stringify({ statusCode: 404, payload: errPayload })]
      );
      return res.status(404).json(errPayload);
    }

    const slotTime = slotCheck.rows[0].time;

    // 4. The Booking Write (Atomic Concurrency Token Update)
    // UPDATE slots SET status = 'BOOKED' WHERE id = $1 AND status = 'AVAILABLE';
    const updateResult = await client.query(
      "UPDATE slots SET status = 'BOOKED' WHERE id = $1 AND status = 'AVAILABLE' RETURNING id, time, status, clinician_id",
      [slot_id]
    );

    // 5. The Refusal: Evaluate rowCount
    if (updateResult.rowCount === 0) {
      await client.query('ROLLBACK');

      const refusalMessage = `We are sorry, but the ${slotTime} appointment was just booked by another patient. Please select another open time.`;
      
      // Store refusal result in idempotency_keys for hold-and-return consistency
      await db.query(
        'UPDATE idempotency_keys SET booking_result = $2 WHERE key = $1',
        [idempotency_key, JSON.stringify({ statusCode: 409, payload: refusalMessage })]
      );

      return res.status(409).send(refusalMessage);
    }

    // 6. The Success: rowCount === 1
    const bookedSlot = updateResult.rows[0];
    const successPayload = {
      message: 'Appointment booked successfully.',
      booking: {
        id: bookedSlot.id,
        time: bookedSlot.time,
        status: bookedSlot.status,
        clinician_id: bookedSlot.clinician_id,
      },
    };

    // Store success result in idempotency_keys table
    await client.query(
      'UPDATE idempotency_keys SET booking_result = $2 WHERE key = $1',
      [idempotency_key, JSON.stringify({ statusCode: 200, payload: successPayload })]
    );

    await client.query('COMMIT');

    return res.status(200).json(successPayload);

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[POST /book Error]:', error);
    return res.status(500).json({ error: 'Internal server error during booking transaction.' });
  } finally {
    client.release();
  }
});

// Helper endpoint to reset/seed test slots
app.post('/reset-test-data', async (req, res) => {
  try {
    await db.query('DELETE FROM idempotency_keys');
    await db.query('DELETE FROM slots');
    
    const times = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
    const slotMap = {
      '09:00': '11111111-1111-1111-1111-111111111111',
      '10:00': '22222222-2222-2222-2222-222222222222',
      '14:00': '33333333-3333-3333-3333-333333333333',
    };

    for (const t of times) {
      const id = slotMap[t] || uuidv4();
      await db.query(
        "INSERT INTO slots (id, clinician_id, time, status) VALUES ($1, 'dr-smith', $2, 'AVAILABLE') ON CONFLICT (clinician_id, time) DO NOTHING",
        [id, t]
      );
    }

    res.json({ message: 'Database reset successfully with 9 test slots for dr-smith.' });
  } catch (err) {
    console.error('[Reset Test Data Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  db.initDb()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`[Server] Booking service listening on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error('[Server Init Failed]:', err);
    });
}

module.exports = app;
