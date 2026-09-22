# BlacksmithDev - High-Concurrency Appointment Booking Service

A robust Node.js and PostgreSQL appointment booking service featuring atomic single conditional writes, lock timeout protection, and idempotency guarantees to prevent double-booking under high concurrency.

---

## 🚀 Race Condition Demo & Concurrency Verification

To verify the concurrency guarantees and run the race condition demo, please see the [Runbook](DEMO.md).

### Quick Runbook & Demo Command

```bash
# 1. Start PostgreSQL
docker-compose up -d db

# 2. Start server in test mode
npx cross-env NODE_ENV=test node server.js

# 3. Run the race condition demo
node scripts/race-demo.js
```

For complete instructions, expected outputs, and database reset details, refer to [DEMO.md](DEMO.md).

---

## 🧪 Automated Testing

- **Concurrency & Seed Test Suite**: `npm run test-concurrency`
- **Playwright True UI Test Suite**: `npm run test-frontend`
