# Decision Record: The Last Slot, Taken Once

## 1. Mechanism Chosen
**Atomic Single Conditional Writes** 
We implemented the booking guarantee using an atomic `UPDATE` statement with a strict conditional clause (`WHERE status = 'AVAILABLE'`) and idempotency keys.

## 2. Alternative Rejected
**Pessimistic Locking (`SELECT ... FOR UPDATE`)**
We abandoned the previous strategy of actively locking the database row while the application processed the booking logic.

## 3. The Product Trade-off
* **Why the chosen mechanism wins here:** It drastically narrows the window where a lock is held. Instead of holding a lock across an entire application transaction, the database only locks the row during the immediate `UPDATE` execution. The losing patient gets an immediate "Slot taken" failure instead of hanging indefinitely.
* **The cost:** It requires our application to have perfectly formed, complete data *before* it touches the database, as we cannot lock the row, read it, compute something, and then write back.
* **Where the alternative would have won:** Pessimistic locking is better suited for complex, multi-step financial or inventory transactions where external systems must be queried based on the locked row's exact current state before finalizing the write.
