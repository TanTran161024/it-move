const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const outDir = path.resolve(__dirname);
const url = process.env.AUDIT_URL || 'http://localhost:5173/';
const mojibakePattern = /(?:Ã.|Ä.|Æ.|Ð.|ð.|þ.|áº.|á».|�)/;

const viewports = [
  { width: 320, height: 740 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 414, height: 896 },
  { width: 768, height: 1024 },
  { width: 1024, height: 1366 },
  { width: 1280, height: 900 },
  { width: 1440, height: 960 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

async function safeClick(page, selector, timeout = 1500) {
  try {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout });
    await locator.click({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function auditViewport(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);

  return page.evaluate((patternSource) => {
    const pattern = new RegExp(patternSource);
    const doc = document.documentElement;
    const body = document.body;
    const text = body.innerText || '';
    const visibleText = text.slice(0, 8000);
    const allElements = [...document.querySelectorAll('body *')];
    const brokenImages = [...document.images]
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => ({ src: img.currentSrc || img.src, alt: img.alt || '' }))
      .slice(0, 12);
    const focusable = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      });

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      title: document.title,
      bodyTextStart: visibleText.slice(0, 600),
      mojibakeDetected: pattern.test(visibleText),
      mojibakeSamples: [...new Set((visibleText.match(/.{0,16}(?:Ã.|Ä.|Æ.|Ð.|ð.|þ.|áº.|á».|�).{0,24}/g) || []).slice(0, 12))],
      horizontalOverflow: doc.scrollWidth > doc.clientWidth + 1 || body.scrollWidth > body.clientWidth + 1,
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      headerExists: Boolean(document.querySelector('header')),
      footerExists: Boolean(document.querySelector('footer')),
      searchButtonExists: Boolean(document.querySelector('[data-search-open-button="true"], button[aria-label*="tìm"], button[aria-label*="Tìm"]')),
      heroHeight: document.querySelector('header + *')?.getBoundingClientRect().height || 0,
      imageCount: document.images.length,
      brokenImages,
      focusableCount: focusable.length,
      buttonsWithoutName: allElements
        .filter((el) => el.tagName === 'BUTTON' && !((el.innerText || '').trim() || el.getAttribute('aria-label') || el.getAttribute('title')))
        .length,
    };
  }, mojibakePattern.source);
}

async function runJourney(page) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);

  const result = {
    scroll: false,
    fastScroll: false,
    hoverHero: false,
    hoverCard: false,
    searchOpen: false,
    searchTyping: false,
    searchEscapeClose: false,
    menuClick: false,
    backForward: false,
    refresh: false,
    tabFocusCount: 0,
    searchOverlayScrollUnlocked: null,
  };

  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(300);
  result.scroll = await page.evaluate(() => window.scrollY > 100);
  await page.mouse.wheel(0, -2000);
  await page.waitForTimeout(300);
  result.fastScroll = await page.evaluate(() => window.scrollY <= 20);

  const hero = page.locator('header + *').first();
  if (await hero.count()) {
    await hero.hover({ timeout: 1500 }).then(() => { result.hoverHero = true; }).catch(() => {});
  }

  const card = page.locator('img[alt]:visible').nth(2);
  if (await card.count()) {
    await card.hover({ timeout: 1500 }).then(() => { result.hoverCard = true; }).catch(() => {});
  }

  result.searchOpen = await safeClick(page, '[data-search-open-button="true"]');
  await page.waitForTimeout(500);
  if (result.searchOpen) {
    result.searchOverlayScrollUnlocked = await page.evaluate(() => ({
      windowScrollY: window.scrollY,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      bodyOverflow: getComputedStyle(document.body).overflow,
      bodyPosition: getComputedStyle(document.body).position,
      overlayScrollable: Boolean(document.querySelector('[data-search-overlay="true"]')),
    }));
    const input = page.locator('[data-search-overlay="true"] input, input[type="search"], input[placeholder]').first();
    await input.fill('phim hanh dong').then(() => { result.searchTyping = true; }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    result.searchEscapeClose = await page.evaluate(() => !document.querySelector('[data-search-overlay="true"]'));
  }

  result.menuClick = await safeClick(page, 'nav button', 1500);
  await page.waitForTimeout(500);
  await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).then(() => { result.backForward = true; }).catch(() => {});
  await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).then(() => { result.refresh = true; }).catch(() => {});
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    const visibleFocus = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (visibleFocus) result.tabFocusCount += 1;
  }
  return result;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  const failedRequests = [];
  const badResponses = [];

  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      consoleMessages.push({ type: message.type(), text: message.text() });
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || '' });
  });
  page.on('response', (response) => {
    if (response.status() >= 400) badResponses.push({ status: response.status(), url: response.url() });
  });

  const viewportResults = [];
  for (const viewport of viewports) {
    const data = await auditViewport(page, viewport);
    viewportResults.push(data);
    if ([390, 1024, 1440, 1920].includes(viewport.width)) {
      await page.screenshot({ path: path.join(outDir, `homepage-${viewport.width}.png`), fullPage: true });
    }
  }

  const journey = await runJourney(page);
  const report = {
    url,
    generatedAt: new Date().toISOString(),
    consoleMessages,
    pageErrors,
    failedRequests,
    badResponses,
    viewportResults,
    journey,
  };
  fs.writeFileSync(path.join(outDir, 'homepage-audit.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
