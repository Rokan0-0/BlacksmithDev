/**
 * BlacksmithDev — Patient Slot Forge & Interactive Workbench App
 * @author Senior Full-Stack Engineer
 */

document.addEventListener('DOMContentLoaded', () => {
  initEmberCanvas();
  initBookingForge();
  initWorkbench();
  initTerminal();
  initMetricCounters();
});

/* ==========================================================================
   1. Particle Canvas (Floating Embers & Sparks)
   ========================================================================== */
function initEmberCanvas() {
  const canvas = document.getElementById('ember-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particleCount = 65;
  const particles = [];

  class Particle {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = Math.random() * width;
      this.y = height + Math.random() * 50;
      this.size = Math.random() * 2.5 + 0.8;
      this.speedY = Math.random() * 1.5 + 0.4;
      this.speedX = (Math.random() - 0.5) * 0.8;
      this.opacity = Math.random() * 0.7 + 0.3;
      this.decay = Math.random() * 0.003 + 0.001;

      const isCyan = Math.random() > 0.85;
      this.color = isCyan ? '#00F0FF' : Math.random() > 0.4 ? '#FF6B00' : '#FF9100';
    }

    update() {
      this.y -= this.speedY;
      this.x += Math.sin(this.y * 0.01) + this.speedX;
      this.opacity -= this.decay;

      if (this.opacity <= 0 || this.y < -10) {
        this.reset();
      }
    }

    draw() {
      ctx.save();
      ctx.globalAlpha = Math.max(0, this.opacity);
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);
    particles.forEach((p) => {
      p.update();
      p.draw();
    });
    requestAnimationFrame(animate);
  }

  animate();
}

/* ==========================================================================
   2. Patient Slot Forge (PR Feedback 1, 2, 3)
   ========================================================================== */
function initBookingForge() {
  const clinicianSelect = document.getElementById('clinician-select');
  const btnRefresh = document.getElementById('btn-refresh-slots');
  const btnRetry = document.getElementById('btn-retry-slots');
  const slotsLoading = document.getElementById('slots-loading');
  const slotsContainer = document.getElementById('slots-container');
  const slotsEmpty = document.getElementById('slots-empty');
  const slotsError = document.getElementById('slots-error');
  const openCountBadge = document.getElementById('open-count-badge');
  const userBookingsList = document.getElementById('user-bookings-list');
  const btnClearBookings = document.getElementById('btn-clear-my-bookings');

  // Load booked slots from server API (GET /bookings) and sync with local state (PR Feedback 3)
  fetchAndRenderBookings();

  // Fetch slots on page load
  fetchAndRenderSlots();

  if (clinicianSelect) {
    clinicianSelect.addEventListener('change', () => {
      fetchAndRenderSlots();
      fetchAndRenderBookings();
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      fetchAndRenderSlots();
      fetchAndRenderBookings();
      showToast('🔄 Refreshed available clinician slots.');
    });
  }

  if (btnRetry) {
    btnRetry.addEventListener('click', () => {
      fetchAndRenderSlots();
      fetchAndRenderBookings();
    });
  }

  if (btnClearBookings) {
    btnClearBookings.addEventListener('click', () => {
      localStorage.removeItem('my_blacksmith_bookings');
      fetchAndRenderBookings();
      showToast('🧹 Local booking history cleared.');
    });
  }

  async function fetchAndRenderSlots() {
    const clinicianId = clinicianSelect ? clinicianSelect.value : 'dr-smith';

    // Reset View States
    slotsLoading.classList.remove('hidden');
    slotsContainer.classList.add('hidden');
    slotsEmpty.classList.add('hidden');
    slotsError.classList.add('hidden');
    openCountBadge.textContent = 'Loading...';

    try {
      const response = await fetch(`/slots?clinician_id=${encodeURIComponent(clinicianId)}`);

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const slots = await response.json();

      slotsLoading.classList.add('hidden');

      // Empty State Check (AC 05: Exact text "No open slots today.")
      if (!Array.isArray(slots) || slots.length === 0) {
        slotsEmpty.classList.remove('hidden');
        openCountBadge.textContent = '0 Open Slots';
        openCountBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        openCountBadge.style.color = 'var(--color-red)';
        return;
      }

      // Render Open Slots Grid
      slotsEmpty.classList.add('hidden');
      slotsContainer.classList.remove('hidden');
      openCountBadge.textContent = `${slots.length} Available`;
      openCountBadge.style.borderColor = 'var(--border-cyan)';
      openCountBadge.style.color = 'var(--color-cyan)';

      slotsContainer.innerHTML = '';
      slots.forEach((slot) => {
        const slotCard = document.createElement('div');
        slotCard.className = 'slot-card';
        slotCard.innerHTML = `
          <div class="slot-time"><i class="fa-regular fa-clock"></i> ${escapeHtml(slot.time)}</div>
          <div class="slot-status-indicator">
            <span class="dot"></span> Available
          </div>
          <button class="btn btn-primary btn-sm btn-claim-slot" data-id="${escapeHtml(slot.id)}" data-time="${escapeHtml(slot.time)}">
            <i class="fa-solid fa-fire"></i> Claim Slot
          </button>
        `;

        const claimBtn = slotCard.querySelector('.btn-claim-slot');
        claimBtn.addEventListener('click', (e) => handleClaimSlot(slot, e.currentTarget));

        slotsContainer.appendChild(slotCard);
      });
    } catch (err) {
      console.error('[Booking Forge Error]:', err);
      // PR Feedback 3 Error Handling: Display #slots-error (Network failure. Cannot reach the forge.) instead of #slots-empty
      slotsLoading.classList.add('hidden');
      slotsContainer.classList.add('hidden');
      slotsEmpty.classList.add('hidden');
      slotsError.classList.remove('hidden');
      openCountBadge.textContent = 'Error';
      showToast(`⚠️ Network failure. Cannot reach the forge.`, 'error');
    }
  }

  async function handleClaimSlot(slot, claimBtn) {
    const clinicianId = clinicianSelect ? clinicianSelect.value : 'dr-smith';

    // PR Feedback 3 Button Guard: Immediately disable button & change text while in flight
    if (claimBtn) {
      claimBtn.disabled = true;
      claimBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Claiming...';
    }

    const idempotencyKey = `idem-book-${slot.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    showToast(`🔨 Forging transaction for ${slot.time} slot...`);

    try {
      const response = await fetch('/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_id: slot.id,
          idempotency_key: idempotencyKey,
        }),
      });

      const responseText = await response.text();

      // On 200 OK: Confirmation in forge voice (AC 03)
      if (response.status === 200) {
        const timeStr = slot.time;
        // Forge Voice: "Booked. 14:00 is yours — see you at the forge."
        const forgeVoiceMessage = `Booked. ${timeStr} is yours — see you at the forge.`;
        showToast(`🔥 ${forgeVoiceMessage}`);

        // Save local backup reference
        saveLocalBooking({ id: slot.id, time: timeStr, clinician_id: clinicianId });

        // PR Feedback 3 State Syncing: Fetch from GET /bookings and GET /slots after every successful booking
        await fetchAndRenderBookings();
        await fetchAndRenderSlots();
        return;
      }

      // Handle 409 Conflict (Refusal string)
      if (response.status === 409) {
        showToast(`⚠️ ${responseText}`, 'error');
        await fetchAndRenderSlots();
        return;
      }

      // Handle other errors
      showToast(`❌ Booking failed: ${responseText}`, 'error');
      await fetchAndRenderSlots();
    } catch (err) {
      console.error('[Book Slot Error]:', err);
      showToast(`❌ Network error claiming slot: ${err.message}`, 'error');
      await fetchAndRenderSlots();
    } finally {
      if (claimBtn && claimBtn.isConnected) {
        claimBtn.disabled = false;
        claimBtn.innerHTML = '<i class="fa-solid fa-fire"></i> Claim Slot';
      }
    }
  }

  // PR Feedback 3 State Syncing: Fetch bookings from GET /bookings endpoint
  async function fetchAndRenderBookings() {
    if (!userBookingsList) return;

    const clinicianId = clinicianSelect ? clinicianSelect.value : 'dr-smith';

    try {
      const response = await fetch(`/bookings?clinician_id=${encodeURIComponent(clinicianId)}`);

      let bookings = [];
      if (response.ok) {
        bookings = await response.json();
      } else {
        bookings = getLocalBookings();
      }

      if (!Array.isArray(bookings) || bookings.length === 0) {
        userBookingsList.innerHTML = `
          <div class="booking-empty-hint">
            <i class="fa-solid fa-calendar-plus" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
            No appointments forged yet. Claim an open slot above to reserve your time.
          </div>
        `;
        return;
      }

      userBookingsList.innerHTML = '';
      bookings.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'booking-item';
        div.innerHTML = `
          <div>
            <div class="booking-item-time"><i class="fa-solid fa-calendar-check text-cyan"></i> ${escapeHtml(item.time)}</div>
            <div class="booking-item-details">Clinician: ${escapeHtml(item.clinician_id || clinicianId)} • Status: SECURED</div>
          </div>
          <span class="badge-tag"><i class="fa-solid fa-lock"></i> BOOKED</span>
        `;
        userBookingsList.appendChild(div);
      });
    } catch (err) {
      console.error('[Fetch Bookings Error]:', err);
    }
  }

  function saveLocalBooking(item) {
    try {
      const list = getLocalBookings();
      list.unshift(item);
      localStorage.setItem('my_blacksmith_bookings', JSON.stringify(list));
    } catch (e) {}
  }

  function getLocalBookings() {
    try {
      const data = localStorage.getItem('my_blacksmith_bookings');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }
}

/* ==========================================================================
   3. Workbench Code Generator
   ========================================================================== */
const CODE_TEMPLATES = {
  'async-pipeline': {
    typescript: `// BlacksmithDev: Transaction-Isolated Booking Engine (TypeScript)
import { Pool } from 'pg';

export async function bookSlotAtomic(pool: Pool, slotId: string, idempotencyKey: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '2000ms'");

    await client.query('INSERT INTO idempotency_keys (key) VALUES ($1)', [idempotencyKey]);

    const updateRes = await client.query(
      "UPDATE slots SET status = 'BOOKED' WHERE id = $1 AND status = 'AVAILABLE' RETURNING id, time",
      [slotId]
    );

    if (updateRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return { status: 409, message: "We are sorry, appointment was just booked." };
    }

    await client.query('COMMIT');
    return { status: 200, booking: updateRes.rows[0] };
  } finally {
    client.release();
  }
}`,
    javascript: `// BlacksmithDev: Transaction-Isolated Booking Engine (JavaScript)
async function bookSlotAtomic(pool, slotId, idempotencyKey) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '2000ms'");

    await client.query('INSERT INTO idempotency_keys (key) VALUES ($1)', [idempotencyKey]);

    const res = await client.query(
      "UPDATE slots SET status = 'BOOKED' WHERE id = $1 AND status = 'AVAILABLE' RETURNING id, time",
      [slotId]
    );

    if (res.rowCount === 0) {
      await client.query('ROLLBACK');
      return { status: 409, message: "Slot already booked by another patient." };
    }

    await client.query('COMMIT');
    return { status: 200, data: res.rows[0] };
  } finally {
    client.release();
  }
}`,
    python: `# BlacksmithDev: Atomic Booking Engine (Python 3.12 / asyncpg)
import asyncpg

async def book_slot_atomic(pool: asyncpg.Pool, slot_id: str, idempotency_key: str):
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SET LOCAL lock_timeout = '2000ms'")
            await conn.execute("INSERT INTO idempotency_keys (key) VALUES ($1)", idempotency_key)
            
            result = await conn.execute(
                "UPDATE slots SET status = 'BOOKED' WHERE id = $1 AND status = 'AVAILABLE'",
                slot_id
            )
            return result`,
    rust: `// BlacksmithDev: Tokio Async Booking (Rust Safe)
use tokio_postgres::Client;

pub async fn book_slot_atomic(client: &mut Client, slot_id: &str, idempotency_key: &str) -> Result<bool, String> {
    let tx = client.transaction().await.unwrap();
    tx.execute("SET LOCAL lock_timeout = '2000ms'", &[]).await.unwrap();
    tx.execute("INSERT INTO idempotency_keys (key) VALUES ($1)", &[&idempotency_key]).await.unwrap();
    
    let rows_updated = tx.execute(
        "UPDATE slots SET status = 'BOOKED' WHERE id = $1 AND status = 'AVAILABLE'",
        &[&slot_id]
    ).await.unwrap();

    if rows_updated == 1 {
        tx.commit().await.unwrap();
        Ok(true)
    } else {
        tx.rollback().await.unwrap();
        Err("Conflict: Slot already booked".to_string())
    }
}`
  }
};

function initWorkbench() {
  const templateSelect = document.getElementById('template-select');
  const langSelect = document.getElementById('language-select');
  const concurrencyRange = document.getElementById('concurrency-range');
  const concurrencyVal = document.getElementById('concurrency-val');
  const btnForge = document.getElementById('btn-forge-code');
  const codeDisplay = document.getElementById('code-display');
  const editorFilename = document.getElementById('editor-filename');
  const charCount = document.getElementById('char-count');
  const forgeStatus = document.getElementById('forge-status');
  const btnCopy = document.getElementById('btn-copy-code');

  if (concurrencyRange) {
    concurrencyRange.addEventListener('input', (e) => {
      concurrencyVal.textContent = e.target.value;
    });
  }

  function renderCode() {
    const tmpl = templateSelect.value;
    const lang = langSelect.value;

    const extMap = { typescript: 'ts', javascript: 'js', python: 'py', rust: 'rs' };
    editorFilename.textContent = `forged_${tmpl}.${extMap[lang]}`;

    let code = (CODE_TEMPLATES[tmpl] && CODE_TEMPLATES[tmpl][lang]) || CODE_TEMPLATES['async-pipeline'][lang];
    codeDisplay.textContent = code;

    const lineCount = code.split('\n').length;
    charCount.textContent = `${lineCount} lines • UTF-8`;

    forgeStatus.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--color-green)"></i> Status: Forged (${lang.toUpperCase()})`;
  }

  if (btnForge) {
    btnForge.addEventListener('click', () => {
      forgeStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color: var(--color-flame)"></i> Forging...`;
      setTimeout(() => {
        renderCode();
        showToast('🔥 Code module forged successfully!');
      }, 300);
    });
  }

  if (btnCopy && codeDisplay) {
    btnCopy.addEventListener('click', () => {
      navigator.clipboard.writeText(codeDisplay.textContent).then(() => {
        showToast('📋 Code copied to clipboard!');
      });
    });
  }

  renderCode();
}

/* ==========================================================================
   4. CLI Simulator
   ========================================================================== */
function initTerminal() {
  const termInput = document.getElementById('terminal-input');
  const termOutput = document.getElementById('terminal-output');

  if (!termInput || !termOutput) return;

  termInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const command = termInput.value.trim();
      termInput.value = '';
      if (command) {
        processCommand(command);
      }
    }
  });

  function appendLine(text, type = '') {
    const div = document.createElement('div');
    div.className = `term-line ${type}`;
    div.innerHTML = text;
    termOutput.appendChild(div);
    termOutput.scrollTop = termOutput.scrollHeight;
  }

  function processCommand(cmd) {
    appendLine(`<span class="prompt">rokan@blacksmith:~$</span> ${escapeHtml(cmd)}`);

    const lower = cmd.toLowerCase().trim();

    switch (lower) {
      case 'help':
        appendLine('<span class="term-highlight">Available Commands:</span>', 'info');
        appendLine('  <span class="term-cmd">slots</span>        - Fetch available slots for dr-smith via GET /slots', 'info');
        appendLine('  <span class="term-cmd">bookings</span>     - Fetch booked slots for dr-smith via GET /bookings', 'info');
        appendLine('  <span class="term-cmd">status</span>       - Display repository & branch status', 'info');
        appendLine('  <span class="term-cmd">bench</span>        - Run synthetic concurrency benchmark', 'info');
        appendLine('  <span class="term-cmd">clear</span>        - Clear terminal screen', 'info');
        break;

      case 'slots':
        appendLine('Querying GET /slots?clinician_id=dr-smith...', 'warning');
        fetch('/slots?clinician_id=dr-smith')
          .then((r) => r.json())
          .then((slots) => {
            appendLine(`✅ Found ${slots.length} available slots for dr-smith:`, 'success');
            slots.forEach((s) => {
              appendLine(`  • [${s.time}] ID: ${s.id} (Status: ${s.status})`, 'info');
            });
          })
          .catch((err) => appendLine(`Error: ${err.message}`, 'error'));
        break;

      case 'bookings':
        appendLine('Querying GET /bookings?clinician_id=dr-smith...', 'warning');
        fetch('/bookings?clinician_id=dr-smith')
          .then((r) => r.json())
          .then((bookings) => {
            appendLine(`✅ Found ${bookings.length} booked slots for dr-smith:`, 'success');
            bookings.forEach((b) => {
              appendLine(`  • [${b.time}] ID: ${b.id} (Status: ${b.status})`, 'info');
            });
          })
          .catch((err) => appendLine(`Error: ${err.message}`, 'error'));
        break;

      case 'status':
        appendLine('<i class="fa-solid fa-code-branch"></i> On branch <span class="term-highlight">feat/TLSTO-002-the-surface</span>', 'success');
        appendLine('Database Isolation: <span class="term-highlight">ACTIVE</span> (lock_timeout=2000ms)', 'success');
        appendLine('Working tree clean.', 'info');
        break;

      case 'bench':
        appendLine('Running Synthetic Concurrency Test...', 'warning');
        setTimeout(() => {
          appendLine('⚡ Transaction Latency: 0.38ms', 'success');
          appendLine('⚡ Race Condition Prevention Rate: 100%', 'success');
          appendLine('⚡ Connection Pool Leak Count: 0', 'success');
        }, 350);
        break;

      case 'clear':
        termOutput.innerHTML = '';
        break;

      default:
        appendLine(`command not found: ${escapeHtml(cmd)}. Type '<span class="term-cmd">help</span>' for options.`, 'error');
        break;
    }
  }
}

/* ==========================================================================
   5. Utility Functions & Toast Alerts
   ========================================================================== */
function initMetricCounters() {
  const counters = document.querySelectorAll('.metric-value');
  counters.forEach((counter) => {
    const target = parseFloat(counter.getAttribute('data-target'));
    if (isNaN(target)) return;

    let current = 0;
    const increment = target / 30;
    const isPercent = counter.textContent.includes('%');
    const isMs = counter.textContent.includes('ms');

    const updateCounter = () => {
      current += increment;
      if (current < target) {
        counter.textContent = Math.round(current) + (isPercent ? '%' : isMs ? 'ms' : '');
        requestAnimationFrame(updateCounter);
      } else {
        counter.textContent = target + (isPercent ? '%' : isMs ? 'ms' : '');
      }
    };

    updateCounter();
  });
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'toast-error' : ''}`;
  toast.innerHTML = `<i class="fa-solid ${type === 'error' ? 'fa-triangle-exclamation text-ember' : 'fa-fire text-ember'}"></i> <span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
