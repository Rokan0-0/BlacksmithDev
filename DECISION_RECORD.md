# Decision Record: The Last Slot, Taken Once

## 1. Mechanism Chosen
**Atomic Single Conditional Writes** 
We implemented the booking guarantee using an atomic `UPDATE` statement with a strict conditional clause (`WHERE status = 'AVAILABLE'`) and idempotency keys, relying on PostgreSQL's internal row-level concurrency controls to prevent double-booking.

## 2. Alternative Rejected
**Pessimistic Locking (`SELECT ... FOR UPDATE`)**
We abandoned the previous strategy of actively locking the database row while the application processed the booking logic.

## 3. The Product Trade-off
* **Why the chosen mechanism wins here:** It completely eliminates the lock-timeout errors that were crashing the service under high load. By attempting the update immediately, the database handles the concurrency in milliseconds. The losing patient gets an immediate "Slot taken" failure and can instantly pick another slot, rather than staring at a hanging loading spinner while waiting for a lock to release.
* **The cost:** It requires our application to have perfectly formed, complete data *before* it touches the database, as we cannot lock the row, read it, compute something, and then write back.
* **Where the alternative would have won:** Pessimistic locking is better suited for complex, multi-step financial or inventory transactions where external systems must be queried based on the locked row's exact current state before finalizing the write. For simple slot claiming, it was massive overkill.
