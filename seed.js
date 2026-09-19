const { v4: uuidv4 } = require('uuid');
const db = require('./db');

/**
 * Idempotent Seed Script for Clinician Slots
 * Seeds hourly slots from 09:00 to 17:00 for a given clinician_id.
 */
async function seedClinicianSlots(clinicianId = 'dr-smith', allowInMemory = false) {
  console.log(`[Seed] Initializing slot seeding for clinician: '${clinicianId}'...`);
  
  await db.initDb();

  // Strict check required by PR feedback unless explicitly allowed during testing mock or test ENV
  if (!allowInMemory && process.env.NODE_ENV !== 'test' && db.isInMemoryMode && db.isInMemoryMode()) {
    throw new Error("FATAL: Cannot seed an in-memory database. Postgres must be running.");
  }

  const hourlyTimes = [
    '09:00',
    '10:00',
    '11:00',
    '12:00',
    '13:00',
    '14:00',
    '15:00',
    '16:00',
    '17:00',
  ];

  let insertedCount = 0;
  let skippedCount = 0;

  for (const timeStr of hourlyTimes) {
    const slotId = uuidv4();
    
    // Exact SQL logic required for idempotent insertion
    const queryText = `
      INSERT INTO slots (id, clinician_id, time, status)
      VALUES ($1, $2, $3, 'AVAILABLE')
      ON CONFLICT (clinician_id, time) DO NOTHING
      RETURNING id;
    `;

    const res = await db.query(queryText, [slotId, clinicianId, timeStr]);

    if (res.rowCount === 1) {
      insertedCount++;
      console.log(`  ✔ Inserted slot: ${timeStr} (ID: ${slotId})`);
    } else {
      skippedCount++;
      console.log(`  ➔ Skipped existing slot: ${timeStr} (Conflict / Already exists)`);
    }
  }

  console.log(`\n[Seed Summary] Clinician '${clinicianId}': ${insertedCount} inserted, ${skippedCount} skipped.`);
  return { insertedCount, skippedCount };
}

if (require.main === module) {
  const targetClinician = process.argv[2] || 'dr-smith';
  seedClinicianSlots(targetClinician)
    .then(() => {
      console.log('[Seed] Seeding completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Seed Error]:', err.message);
      process.exit(1);
    });
}

module.exports = { seedClinicianSlots };
