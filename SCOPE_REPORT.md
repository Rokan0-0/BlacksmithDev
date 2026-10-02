# Sprint 1 Scope Report

## What Shipped vs. What Was Cut
1. **The Investigation:** Shipped. We successfully identified lock timeouts as the root cause of the silent booking failures under load.
2. **The Guarantee:** Shipped. We completely replaced the locking mechanism with atomic conditional writes and enforced strict idempotency key checks to ensure the last slot is taken exactly once.
3. **The Race Demo:** Shipped (with scope adjustments). We built a concurrent Node.js script that successfully proves the race condition is handled. **Cut:** We removed in-memory DB fallback support for the demo; strict validation now requires a running PostgreSQL instance to ensure the proof is mathematically sound.
4. **Close It:** Shipped. (This document and the Decision Record).

## Pickups for Next Sprint
1. **Audit Third-Party API Mocks (Patient Communication):** Currently, our email/notification mocks fail open (returning a silent 200 OK locally). If this happens in production, a patient's slot is booked, but they never receive the confirmation email, leaving them stranded and confused. We need to implement guaranteed delivery or resilient retry queues for patient communications.
2. **Remove Silent Config Fallbacks (Tenant Routing):** If environment variables fail to load, the system currently falls back to defaults. This risks a patient successfully booking a slot that gets written to the wrong tenant database or the void. We must strip silent fallbacks and enforce loud server initialization failures if routing config is missing.
