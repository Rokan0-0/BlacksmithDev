# Sprint 1 Scope Report

## What Shipped vs. What Was Cut
1. **Spine:** Shipped. The core API route and database schema were implemented. 
2. **Surface:** Shipped. The frontend UI was connected to allow users to interact with the booking API.
3. **The Guarantee:** Shipped. We replaced the failing locking mechanism with an atomic conditional `UPDATE` and idempotency keys. 
4. **Close It:** Shipped. The decision record and scope report are documented.

## Pickups for Next Sprint
1. **Frontend Request Timeouts:** We added an `AbortSignal` timeout to our demo script, but the actual frontend UI could use strict client-side timeouts so users aren't left staring at a spinner if the network drops.
2. **Isolate or Remove `pg-mem`:** The `pg-mem` fallback is still fully intact in `db.js`. We should evaluate stripping this out completely to ensure production doesn't accidentally fail-open into an in-memory state.
