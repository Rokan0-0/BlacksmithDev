/**
 * BlacksmithDev — Interactive Engine & Workbench Logic
 * @author BlacksmithDev Team
 */

document.addEventListener('DOMContentLoaded', () => {
  initEmberCanvas();
  initWorkbench();
  initTerminal();
  initInspectButtons();
  initCopyButton();
  initMetricCounters();
});

/* ==========================================================================
   1. Particle Canvas (Floating Embers & Sparks)
   ========================================================================== */
function initEmberCanvas() {
  const canvas = document.getElementById('ember-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

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
      
      // Color variation between Ember Orange and Electric Cyan
      const isCyan = Math.random() > 0.85;
      this.color = isCyan ? '#00F0FF' : (Math.random() > 0.4 ? '#FF6B00' : '#FF9100');
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
    particles.forEach(p => {
      p.update();
      p.draw();
    });
    requestAnimationFrame(animate);
  }

  animate();
}

/* ==========================================================================
   2. Workbench Code Generator
   ========================================================================== */
const CODE_TEMPLATES = {
  'async-pipeline': {
    typescript: `// BlacksmithDev: Async Task Queue & Retry Engine (TypeScript)
import { EventEmitter } from 'events';

export interface TaskOptions {
  maxRetries?: number;
  timeoutMs?: number;
  backoffFactor?: number;
}

export class TaskQueue<T> extends EventEmitter {
  private queue: Array<() => Promise<T>> = [];
  private activeWorkers = 0;

  constructor(
    private readonly concurrency: number = 8,
    private readonly options: TaskOptions = { maxRetries: 3, timeoutMs: 5000 }
  ) {
    super();
  }

  public enqueue(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const wrappedTask = async () => {
        let attempts = 0;
        while (attempts <= (this.options.maxRetries || 3)) {
          try {
            const result = await task();
            resolve(result);
            return;
          } catch (err) {
            attempts++;
            if (attempts > (this.options.maxRetries || 3)) {
              reject(err);
              return;
            }
            await new Promise((r) => setTimeout(r, Math.pow(2, attempts) * 100));
          }
        }
      };
      this.queue.push(wrappedTask as any);
      this.processNext();
    });
  }

  private processNext(): void {
    if (this.activeWorkers >= this.concurrency || this.queue.length === 0) return;
    this.activeWorkers++;
    const nextTask = this.queue.shift();
    if (nextTask) {
      nextTask().finally(() => {
        this.activeWorkers--;
        this.processNext();
      });
    }
  }
}`,
    javascript: `// BlacksmithDev: Async Task Queue (ES2024 JavaScript)
class TaskQueue {
  constructor(concurrency = 8) {
    this.concurrency = concurrency;
    this.activeWorkers = 0;
    this.queue = [];
  }

  async enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const res = await fn();
          resolve(res);
        } catch (err) {
          reject(err);
        }
      });
      this.tick();
    });
  }

  tick() {
    while (this.activeWorkers < this.concurrency && this.queue.length > 0) {
      this.activeWorkers++;
      const task = this.queue.shift();
      task().finally(() => {
        this.activeWorkers--;
        this.tick();
      });
    }
  }
}`,
    python: `# BlacksmithDev: Async Task Queue & Retry Engine (Python 3.12)
import asyncio
import logging
from typing import Callable, Any

logging.basicConfig(level=logging.INFO)

class AsyncPipeline:
    def __init__(self, concurrency: int = 8, max_retries: int = 3):
        self.semaphore = asyncio.Semaphore(concurrency)
        self.max_retries = max_retries

    async def execute_task(self, task_fn: Callable[[], Any], task_id: str) -> Any:
        async with self.semaphore:
            for attempt in range(1, self.max_retries + 1):
                try:
                    logging.info(f"[Forge] Executing task {task_id} (Attempt {attempt})")
                    return await task_fn()
                except Exception as e:
                    if attempt == self.max_retries:
                        raise e
                    await asyncio.sleep(0.1 * (2 ** attempt))

async def main():
    pipeline = AsyncPipeline(concurrency=8)
    # Pipeline initialized successfully`,
    rust: `// BlacksmithDev: High-Throughput Tokio Task Engine (Rust Safe)
use std::sync::Arc;
use tokio::sync::Semaphore;
use tokio::time::{sleep, Duration};

pub struct TaskEngine {
    semaphore: Arc<Semaphore>,
    max_retries: u32,
}

impl TaskEngine {
    pub fn new(concurrency: usize, max_retries: u32) -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(concurrency)),
            max_retries,
        }
    }

    pub async fn run_task<F, Fut, T>(&self, task: F) -> Result<T, String>
    where
        F: Fn() -> Fut,
        Fut: std::future::Future<Output = Result<T, String>>,
    {
        let _permit = self.semaphore.acquire().await.unwrap();
        for attempt in 1..=self.max_retries {
            match task().await {
                Ok(val) => return Ok(val),
                Err(err) if attempt == self.max_retries => return Err(err),
                Err(_) => sleep(Duration::from_millis(100 * 2u64.pow(attempt))).await,
            }
        }
        Err("Task execution failed".to_string())
    }
}`
  },
  'state-store': {
    typescript: `// BlacksmithDev: Reactive State Store with History (TypeScript)
export type Listener<T> = (state: T) => void;

export class ReactiveStore<T extends object> {
  private state: T;
  private listeners = new Set<Listener<T>>();
  private history: T[] = [];

  constructor(initialState: T) {
    this.state = new Proxy(initialState, {
      set: (target, property, value) => {
        Reflect.set(target, property, value);
        this.notify();
        return true;
      }
    });
  }

  public getState(): Readonly<T> {
    return Object.freeze({ ...this.state });
  }

  public subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const currentState = this.getState();
    this.history.push(currentState);
    this.listeners.forEach((l) => l(currentState));
  }
}`,
    javascript: `// BlacksmithDev: Reactive State Store (JavaScript)
class ReactiveStore {
  constructor(initialState = {}) {
    this.listeners = new Set();
    this.state = new Proxy(initialState, {
      set: (target, prop, val) => {
        target[prop] = val;
        this.notify();
        return true;
      }
    });
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    this.listeners.forEach(fn => fn(this.state));
  }
}`,
    python: `# BlacksmithDev: Reactive State Store (Python)
from typing import Dict, Any, Callable

class StateStore:
    def __init__(self, initial_state: Dict[str, Any]):
        self._state = initial_state
        self._subscribers = []

    def subscribe(self, fn: Callable[[Dict[str, Any]], None]):
        self._subscribers.append(fn)

    def set(self, key: str, value: Any):
        self._state[key] = value
        for sub in self._subscribers:
            sub(self._state.copy())`,
    rust: `// BlacksmithDev: Safe Threaded State Store (Rust)
use std::sync::{Arc, Mutex};

pub struct StateStore<T> {
    state: Arc<Mutex<T>>,
}

impl<T: Clone> StateStore<T> {
    pub fn new(initial: T) -> Self {
        Self { state: Arc::new(Mutex::new(initial)) }
    }

    pub fn update<F: FnOnce(&mut T)>(&self, f: F) {
        let mut guard = self.state.lock().unwrap();
        f(&mut guard);
    }
}`
  },
  'rate-limiter': {
    typescript: `// BlacksmithDev: Token Bucket Rate Limiter (TypeScript)
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number = 100,
    private readonly refillRatePerSec: number = 10
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  public allowRequest(tokensRequested: number = 1): boolean {
    this.refill();
    if (this.tokens >= tokensRequested) {
      this.tokens -= tokensRequested;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillRatePerSec);
    this.lastRefill = now;
  }
}`,
    javascript: `// BlacksmithDev: Token Bucket Rate Limiter (JavaScript)
class TokenBucket {
  constructor(capacity = 100, refillRate = 10) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.last = Date.now();
  }

  consume(count = 1) {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last)/1000) * this.refillRate);
    this.last = now;
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }
}`,
    python: `# BlacksmithDev: Token Bucket Rate Limiter (Python)
import time

class TokenBucket:
    def __init__(self, capacity: float = 100.0, refill_rate: float = 10.0):
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.tokens = capacity
        self.last_update = time.time()

    def acquire(self, amount: float = 1.0) -> bool:
        now = time.time()
        self.tokens = min(self.capacity, self.tokens + (now - self.last_update) * self.refill_rate)
        self.last_update = now
        if self.tokens >= amount:
            self.tokens -= amount
            return True
        return False`,
    rust: `// BlacksmithDev: High Performance Rate Limiter (Rust)
use std::time::{Instant, Duration};

pub struct TokenBucket {
    capacity: f64,
    refill_rate: f64,
    tokens: f64,
    last_update: Instant,
}

impl TokenBucket {
    pub fn new(capacity: f64, refill_rate: f64) -> Self {
        Self { capacity, refill_rate, tokens: capacity, last_update: Instant::now() }
    }

    pub fn acquire(&mut self, amount: f64) -> bool {
        let now = Instant::now();
        let elapsed = now.duration_since(this.last_update).as_secs_f64();
        self.tokens = (self.tokens + elapsed * self.refill_rate).min(self.capacity);
        self.last_update = now;
        if self.tokens >= amount {
            self.tokens -= amount;
            true
        } else {
            false
        }
    }
}`
  },
  'ws-client': {
    typescript: `// BlacksmithDev: Resilient WebSocket Manager (TypeScript)
export class ResilientWS {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;

  constructor(private url: string, private options = { maxReconnects: 10 }) {}

  public connect(): void {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('[BlacksmithWS] Connected successfully');
      this.reconnectAttempts = 0;
    };

    this.ws.onclose = () => {
      if (this.reconnectAttempts < this.options.maxReconnects) {
        this.reconnectAttempts++;
        const delay = Math.pow(2, this.reconnectAttempts) * 500;
        setTimeout(() => this.connect(), delay);
      }
    };
  }
}`,
    javascript: `// BlacksmithDev: Resilient WebSocket Manager (JavaScript)
class ResilientWS {
  constructor(url) {
    this.url = url;
    this.connect();
  }

  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => console.log('WebSocket Connection Established');
    this.ws.onclose = () => setTimeout(() => this.connect(), 2000);
  }
}`,
    python: `# BlacksmithDev: Async WebSocket Client (Python)
import websockets
import asyncio

async def connect_forge_stream(uri: str):
    async for websocket in websockets.connect(uri):
        try:
            async for message in websocket:
                print(f"[Stream Data] {message}")
        except websockets.ConnectionClosed:
            await asyncio.sleep(2)`,
    rust: `// BlacksmithDev: Tokio Tungstenite WebSocket (Rust)
use tokio_tungstenite::connect_async;
use futures_util::StreamExt;

pub async fn start_stream(url: &str) {
    if let Ok((ws_stream, _)) = connect_async(url).await {
        let (_, mut read) = ws_stream.split();
        while let Some(msg) = read.next().await {
            // Process message safely
        }
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

    let code = (CODE_TEMPLATES[tmpl] && CODE_TEMPLATES[tmpl][lang]) || '// Code template ready';

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
      }, 350);
    });
  }

  // Initial render
  renderCode();
}

/* ==========================================================================
   3. Terminal CLI Simulator
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
    const parts = lower.split(' ');
    const action = parts[0];

    switch (action) {
      case 'help':
        appendLine('<span class="term-highlight">Available Commands:</span>', 'info');
        appendLine('  <span class="term-cmd">status</span>       - Display repository & branch status', 'info');
        appendLine('  <span class="term-cmd">git-log</span>      - View recent commit history', 'info');
        appendLine('  <span class="term-cmd">forge [module]</span>- Test forge generator (e.g. forge async)', 'info');
        appendLine('  <span class="term-cmd">bench</span>        - Run system performance benchmark test', 'info');
        appendLine('  <span class="term-cmd">clear</span>        - Clear the terminal console', 'info');
        appendLine('  <span class="term-cmd">repo</span>         - Print official GitHub repo link', 'info');
        break;

      case 'status':
        appendLine('<i class="fa-solid fa-code-branch"></i> On branch <span class="term-highlight">main</span>', 'success');
        appendLine('Your branch is up to date with \'<span class="term-cmd">origin/main</span>\'.', 'info');
        appendLine('Remote URL: <span class="term-link">https://github.com/Rokan0-0/BlacksmithDev.git</span>', 'info');
        appendLine('Working tree clean. All forged modules compiled.', 'success');
        break;

      case 'git-log':
      case 'git':
        appendLine('* <span class="term-cmd">f89a201</span> (HEAD -> <span class="term-highlight">main</span>, <span class="term-cmd">origin/main</span>) first commit', 'info');
        appendLine('  Author: Rokan <rokan@blacksmith.dev>', 'info');
        appendLine('  Date:   Fri Sep 11 2026', 'info');
        appendLine('  - Initialized BlacksmithDev repository & forge workbench', 'info');
        break;

      case 'bench':
        appendLine('Running BlacksmithDev Synthetic Benchmark...', 'warning');
        setTimeout(() => {
          appendLine('⚡ Execution Latency: 0.42ms', 'success');
          appendLine('⚡ Async Task Throughput: 142,800 ops/sec', 'success');
          appendLine('⚡ Memory Footprint: 12.4 MB (Zero leaks detected)', 'success');
        }, 400);
        break;

      case 'forge':
        appendLine('🔨 Forging module in background workspace...', 'warning');
        setTimeout(() => {
          appendLine('✅ Module [blacksmith-core-v1.0] generated successfully.', 'success');
        }, 300);
        break;

      case 'clear':
        termOutput.innerHTML = '';
        break;

      case 'repo':
        appendLine('🔗 GitHub: <a href="https://github.com/Rokan0-0/BlacksmithDev.git" target="_blank" class="term-link">https://github.com/Rokan0-0/BlacksmithDev.git</a>', 'info');
        break;

      default:
        appendLine(`command not found: ${escapeHtml(cmd)}. Type '<span class="term-cmd">help</span>' for available options.`, 'error');
        break;
    }
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ==========================================================================
   4. Utility Functions & Interactions
   ========================================================================== */
function initCopyButton() {
  const btnCopy = document.getElementById('btn-copy-code');
  const codeDisplay = document.getElementById('code-display');

  if (btnCopy && codeDisplay) {
    btnCopy.addEventListener('click', () => {
      navigator.clipboard.writeText(codeDisplay.textContent).then(() => {
        showToast('📋 Code copied to clipboard!');
      });
    });
  }
}

function initInspectButtons() {
  document.querySelectorAll('.inspect-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const mod = e.target.getAttribute('data-module');
      showToast(`🔍 Inspecting ${mod.toUpperCase()} artifact details...`);
      document.getElementById('workbench').scrollIntoView({ behavior: 'smooth' });
    });
  });
}

function initMetricCounters() {
  const counters = document.querySelectorAll('.metric-value');
  counters.forEach(counter => {
    const target = parseFloat(counter.getAttribute('data-target'));
    let current = 0;
    const increment = target / 40;
    const isPercent = counter.textContent.includes('%');
    const isPlus = counter.textContent.includes('+');

    const updateCounter = () => {
      current += increment;
      if (current < target) {
        counter.textContent = current.toFixed(isPercent ? 1 : 0) + (isPercent ? '%' : (isPlus ? '+' : ''));
        requestAnimationFrame(updateCounter);
      } else {
        counter.textContent = target + (isPercent ? '%' : (isPlus ? '+' : ''));
      }
    };

    updateCounter();
  });
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<i class="fa-solid fa-fire text-ember"></i> <span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
