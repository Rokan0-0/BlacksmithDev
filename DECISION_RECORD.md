# Architecture Decision Record (ADR 001): Concurrency Control Model

## Title
Single Conditional Write vs. Pessimistic Locking for Appointment Slot Booking

## Status
Accepted & Implemented

## Context
In a high-concurrency patient appointment booking system, multiple concurrent requests may attempt to claim the exact same open clinician slot simultaneously. 

We evaluated two architectural patterns for transaction isolation and race condition prevention:
1. **Pessimistic Locking (`SELECT ... FOR UPDATE`)**
2. **Single Conditional Write (`UPDATE slots SET status = 'BOOKED' WHERE id = $1 AND status = 'AVAILABLE'`)**

## Decision
We chose the **Single Conditional Write** strategy.

### Architectural Rationale

1. **Minimized Lock Contention Duration**:
   - `SELECT ... FOR UPDATE` acquires row-level locks early in a multi-step transaction and holds those locks across network round-trips, application logic evaluation, and idempotency checks. This significantly increases queue depth and transaction latency under high load.
   - A **Single Conditional Write** defers row-level locking strictly to the single `UPDATE` execution statement, releasing locks immediately upon transaction completion or rollback.

2. **Elimination of Lock Timeouts (`55P03`) & Deadlocks**:
   - Holding row locks across multi-step transactions can lead to lock wait timeouts (`55P03`) and connection pool exhaustion when multiple workers queue up for popular slots.
   - Deferring to an atomic conditional `UPDATE` statement relies directly on PostgreSQL's row-level lock serialization at the exact moment of mutation, returning `rowCount === 0` instantly if another transaction has already transitioned the row status.

3. **Atomic State Transition Evaluation**:
   - The condition `WHERE id = $1 AND status = 'AVAILABLE'` acts as a atomic concurrency token.
   - If `rowCount === 1`: The transition succeeded, locking the slot exclusively for the winning transaction.
   - If `rowCount === 0`: The slot was no longer available. The losing transaction immediately triggers a clean `ROLLBACK` and returns an HTTP `409 Conflict` refusal without blocking connection pool workers.

4. **Idempotency Protection Across Rollbacks**:
   - Refusal notifications are persisted into `idempotency_keys` after transaction `ROLLBACK` via a pool connection. This ensures refusal records remain durable and consistent across concurrent retries without being lost to transaction rollbacks.

## Consequences
- **Positive**: Zero connection pool deadlocks, minimal transaction latency under concurrent bursts, and clean deterministic `409 Conflict` refusal handling.
- **Handling Edge Cases**: Catch blocks explicitly inspect PostgreSQL error codes `55P03` (lock_timeout) and `23505` (unique_violation) as secondary safeguards, returning HTTP `409 Conflict` refusals and saving idempotency outcomes post-rollback.
