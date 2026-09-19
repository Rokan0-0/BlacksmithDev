const { chromium } = require('playwright');
const { execSync } = require('child_process');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (e1) {
    try {
      return await chromium.launch({ channel: 'msedge', headless: true });
    } catch (e2) {
      return await chromium.launch({ channel: 'chrome', headless: true });
    }
  }
}

async function runFrontendTests() {
  console.log('\n==================================================');
  console.log('🧪 STARTING PLAYWRIGHT TRUE UI FRONTEND TEST SUITE');
  console.log('==================================================\n');

  const browser = await launchBrowser();
  const context = await browser.newContext();
  const apiRequest = context.request;

  // Reset database test data first via API request
  console.log('[Setup] Resetting database test slots via POST /reset-test-data...');
  const resetResponse = await apiRequest.post(`${BASE_URL}/reset-test-data`);
  if (!resetResponse.ok()) {
    throw new Error(`Failed to reset test data: ${resetResponse.statusText()}`);
  }
  console.log('[Setup] Test database slots reset complete.\n');

  const page = await context.newPage();
  let hasError = false;

  try {
    // Step 1: Load http://localhost:3000
    console.log(`[Step 1] Navigating to ${BASE_URL}...`);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Step 2: Wait for slots to load in DOM
    console.log('[Step 2] Waiting for slot cards to load in the DOM...');
    await page.waitForSelector('.slot-card', { timeout: 10000 });

    const initialCount = await page.locator('.slot-card').count();
    console.log(`[DOM Verified] Found ${initialCount} initial open slots in DOM.`);
    if (initialCount === 0) {
      throw new Error('Expected open slot cards to be rendered on initial page load.');
    }

    // Step 3: Physically click "Claim Slot" button
    console.log('\n--------------------------------------------------');
    console.log('TEST 1: Claim Slot & Forge Voice Toast Assertion');
    console.log('--------------------------------------------------');

    const firstSlotCard = page.locator('.slot-card').first();
    const slotTimeElement = firstSlotCard.locator('.slot-time');
    const slotTimeText = (await slotTimeElement.textContent()).trim();
    console.log(`[DOM Action] Found first slot time: "${slotTimeText}"`);

    const claimButton = firstSlotCard.locator('.btn-claim-slot');
    console.log('[DOM Action] Physically clicking "Claim Slot" button...');
    await claimButton.click();

    // Step 4: Wait for DOM to update & assert Forge Voice toast text
    console.log('[DOM Assertion] Waiting for Forge Voice toast notification in DOM...');
    const expectedForgeVoice = `Booked. ${slotTimeText} is yours — see you at the forge.`;
    
    // Wait specifically for the confirmation toast containing "Booked."
    const toastElement = page.locator('.toast', { hasText: 'Booked.' });
    await toastElement.waitFor({ state: 'visible', timeout: 10000 });

    const toastText = (await toastElement.textContent()).trim();
    console.log(`[Toast Detected]: "${toastText}"`);

    if (!toastText.includes(expectedForgeVoice)) {
      throw new Error(`Toast text mismatch!\nExpected to contain: "${expectedForgeVoice}"\nActual text: "${toastText}"`);
    }
    console.log(`✅ TEST 1 PASSED! Toast correctly displays Forge Voice string:\n   "${expectedForgeVoice}"`);

    // Step 5: Claim all remaining open slots until empty state is triggered
    console.log('\n--------------------------------------------------');
    console.log('TEST 2: Empty State Assertion ("No open slots today.")');
    console.log('--------------------------------------------------');
    console.log('[DOM Action] Claiming all remaining open slots to exhaust availability...');

    // Get remaining slot IDs currently present in DOM
    const remainingSlotIds = await page.evaluate(() => 
      Array.from(document.querySelectorAll('.btn-claim-slot')).map(b => b.getAttribute('data-id'))
    );

    for (const slotId of remainingSlotIds) {
      const btnLocator = page.locator(`.btn-claim-slot[data-id="${slotId}"]`);
      if (await btnLocator.count() > 0) {
        await btnLocator.scrollIntoViewIfNeeded().catch(() => {});
        await btnLocator.click({ force: true }).catch(() => {});
        // Wait for the button to detach from DOM after state refresh
        await btnLocator.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      }
    }

    // Step 6: Assert the empty state element and exact text
    console.log('[DOM Assertion] Waiting for empty state container (#slots-empty)...');
    await page.waitForSelector('#slots-empty:not(.hidden)', { timeout: 10000 });

    const emptyTextElement = page.locator('#slots-empty .empty-text');
    const emptyStateText = (await emptyTextElement.textContent()).trim();
    console.log(`[Empty State Text Detected]: "${emptyStateText}"`);

    if (emptyStateText !== 'No open slots today.') {
      throw new Error(`Empty state text mismatch!\nExpected: "No open slots today."\nActual: "${emptyStateText}"`);
    }
    console.log('✅ TEST 2 PASSED! Empty state correctly displays exact text:\n   "No open slots today."');

    console.log('\n==================================================');
    console.log('🎉 ALL PLAYWRIGHT UI TESTS PASSED PERFECTLY!');
    console.log('==================================================\n');
  } catch (err) {
    console.error('\n❌ PLAYWRIGHT UI TEST FAILED:', err.message);
    await page.screenshot({ path: 'test-failure.png', fullPage: true }).catch(() => {});
    hasError = true;
  } finally {
    console.log('[Teardown] Re-seeding database via execSync("npm run seed")...');
    try {
      execSync('npm run seed', { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' } });
      console.log('[Teardown] State restored: Database re-seeded for next developer.');
    } catch (seedErr) {
      console.warn('[Teardown Notice] execSync("npm run seed"):', seedErr.message);
    }

    try {
      await apiRequest.post(`${BASE_URL}/reset-test-data`);
    } catch (e) {}

    await browser.close().catch(() => {});
    process.exit(hasError ? 1 : 0);
  }
}

if (require.main === module) {
  runFrontendTests();
}
