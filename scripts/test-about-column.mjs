import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const scratchDir = path.resolve(process.cwd(), 'scratch');
if (!fs.existsSync(scratchDir)) {
  fs.mkdirSync(scratchDir, { recursive: true });
}

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const viewports = [
    { name: 'desktop', width: 1280, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 390, height: 844 },
  ];

  let allPassed = true;

  for (const vp of viewports) {
    console.log(`\n=== Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ===`);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('http://127.0.0.1:5000/about', { waitUntil: 'domcontentloaded' });

    // Wait for FOUC ready
    await page.waitForSelector('body.fouc-ready');
    await page.waitForTimeout(600);

    const metrics = await page.evaluate(() => {
      const shell = document.querySelector('.about-shell');
      const container = document.querySelector('.about-page-container');
      const headings = Array.from(document.querySelectorAll('.about-main-title, .about-section-heading'));
      const paragraphs = Array.from(document.querySelectorAll('.about-intro-section .about-body-text'));

      const headingStyles = headings.map(h => {
        const s = window.getComputedStyle(h);
        return {
          text: h.textContent.trim().slice(0, 20),
          fontFamily: s.fontFamily,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
        };
      });

      const pStyles = paragraphs.map(p => {
        const s = window.getComputedStyle(p);
        return {
          fontFamily: s.fontFamily,
          fontSize: s.fontSize,
          lineHeight: s.lineHeight,
          maxWidth: s.maxWidth,
          marginBottom: s.marginBottom,
        };
      });

      return {
        shellWidth: shell ? shell.offsetWidth : 0,
        containerPaddingLeft: container ? window.getComputedStyle(container).paddingLeft : '0px',
        containerPaddingRight: container ? window.getComputedStyle(container).paddingRight : '0px',
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        headingStyles,
        pStyles,
      };
    });

    console.log(`- Shell offsetWidth: ${metrics.shellWidth}px (<= 640px: ${metrics.shellWidth <= 640})`);
    console.log(`- Container padding: L=${metrics.containerPaddingLeft}, R=${metrics.containerPaddingRight}`);
    console.log(`- Scroll width: ${metrics.scrollWidth}px vs Window innerWidth: ${metrics.innerWidth}px`);

    const noOverflow = metrics.scrollWidth <= metrics.innerWidth;
    console.log(`- No horizontal scroll: ${noOverflow}`);
    if (!noOverflow || metrics.shellWidth > 640) allPassed = false;

    // Check headings
    const headingsValid = metrics.headingStyles.every(h => h.fontFamily.includes('Sora') && h.fontSize === '24px');
    console.log(`- Headings Sora 24px: ${headingsValid} (${metrics.headingStyles.length} headings checked)`);
    if (!headingsValid) {
      console.log('Heading details:', metrics.headingStyles);
      allPassed = false;
    }

    // Check paragraphs
    const pValid = metrics.pStyles.every(p => p.fontFamily.includes('Outfit') && p.fontSize === '16px');
    console.log(`- Paragraphs Outfit 16px: ${pValid} (${metrics.pStyles.length} paragraphs checked)`);
    if (!pValid) {
      console.log('Paragraph details:', metrics.pStyles);
      allPassed = false;
    }

    // Save screenshot to scratch/
    const screenshotPath = path.join(scratchDir, `about-${vp.name}-${vp.width}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`- Saved screenshot: ${screenshotPath}`);
  }

  // Language switch check
  console.log('\n=== Testing Language Switch to Tagalog (tl) ===');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:5000/about', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body.fouc-ready');
  await page.waitForTimeout(600);

  const tlResult = await page.evaluate(() => {
    if (window.applyLang) {
      window.applyLang('tl');
    }
    const lead1 = document.querySelector('[data-i18n="about_page.lead_1"]');
    const p1_1 = document.querySelector('[data-i18n="about_page.p1_1"]');
    return {
      lead1Text: lead1 ? lead1.textContent : '',
      p1_1Text: p1_1 ? p1_1.textContent : '',
    };
  });

  console.log(`- Tagalog lead_1: "${tlResult.lead1Text}"`);
  console.log(`- Tagalog p1_1: "${tlResult.p1_1Text}"`);
  const tlValid = tlResult.lead1Text.includes('Calzada ang salita') && tlResult.p1_1Text.includes('Tinutulungan ka ng Calzada');
  console.log(`- Tagalog translations loaded: ${tlValid}`);
  if (!tlValid) allPassed = false;

  await browser.close();

  if (allPassed) {
    console.log('\n>>> ALL ABOUT PAGE CHECKS PASSED: The About page is one column at every size. <<<');
    process.exit(0);
  } else {
    console.error('\n>>> SOME CHECKS FAILED <<<');
    process.exit(1);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
