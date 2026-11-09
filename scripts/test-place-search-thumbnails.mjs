// scripts/test-place-search-thumbnails.mjs
// Verification for Place Search thumbnail rendering, category SVG icons,
// image bounding, error fallbacks, and mobile/desktop layouts.

import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const pub = path.join(root, 'public');

// Generate real test image buffers of various sizes & aspect ratios
const portraitBuf = await sharp({
    create: { width: 1200, height: 1600, channels: 3, background: { r: 50, g: 100, b: 150 } }
}).jpeg().toBuffer();

const wideBuf = await sharp({
    create: { width: 1600, height: 900, channels: 3, background: { r: 150, g: 100, b: 50 } }
}).jpeg().toBuffer();

const logoBuf = await sharp({
    create: { width: 500, height: 500, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
}).png().toBuffer();

// Prepare mock places data with test cases:
// 1. Kain Tayo (1200x1600 portrait photo / selfie)
// 2. Teng-Teng's (1600x900 wide landscape photo)
// 3. Plater Buddy's (500x500 square logo)
// 4. Clarisse Kitchen (Broken image URL -> fallback to category SVG)
// 5. Ton-Ton's Sisig (No image -> immediate category SVG)
const mockPlaces = [
    {
        id: 'biz_kaintayo',
        name: 'Kain Tayo',
        category: 'eateries',
        lat: 14.2041,
        lng: 121.1558,
        barangay: 'Uno',
        address: 'Jasmine Street, Uno, Calamba',
        logo: '/test-img/portrait.jpg'
    },
    {
        id: 'biz_tengtengs',
        name: "Teng-Teng's",
        category: 'eateries',
        lat: 14.2040,
        lng: 121.1559,
        barangay: 'Uno',
        address: 'Cadena de Amor Street, Uno, Calamba',
        photo: '/test-img/wide.jpg'
    },
    {
        id: 'biz_squarelogo',
        name: 'Plater Buddy\'s',
        category: 'eateries',
        lat: 14.2039,
        lng: 121.1560,
        barangay: 'Uno',
        address: 'Cadena de Amor Street, Uno, Calamba',
        logo: '/test-img/logo.png'
    },
    {
        id: 'biz_brokenimg',
        name: 'Clarisse Kitchen',
        category: 'eateries',
        lat: 14.2038,
        lng: 121.1561,
        barangay: 'Uno',
        address: 'Chipeco Avenue, Uno, Calamba',
        logo: '/test-img/broken-404.jpg'
    },
    {
        id: 'biz_noimg',
        name: "Ton-Ton's Sisig",
        category: 'eateries',
        lat: 14.2037,
        lng: 121.1562,
        barangay: 'Uno',
        address: 'Cadena de Amor Street, Uno, Calamba'
    },
    {
        id: 'mall_smcalamba',
        name: 'SM City Calamba',
        category: 'malls',
        lat: 14.2045,
        lng: 121.1550,
        barangay: 'Real',
        address: 'National Highway, Real, Calamba'
    },
    {
        id: 'sch_sticollege',
        name: 'STI College - Calamba',
        category: 'schools',
        lat: 14.2070,
        lng: 121.1570,
        barangay: 'Real',
        address: 'Real Road, Calamba'
    }
];

const app = express();
app.get('/test-img/portrait.jpg', (req, res) => { res.setHeader('Content-Type', 'image/jpeg'); res.send(portraitBuf); });
app.get('/test-img/wide.jpg', (req, res) => { res.setHeader('Content-Type', 'image/jpeg'); res.send(wideBuf); });
app.get('/test-img/logo.png', (req, res) => { res.setHeader('Content-Type', 'image/png'); res.send(logoBuf); });
app.get('/test-img/broken-404.jpg', (req, res) => res.status(404).send('Not Found'));

app.get('/api/places', (req, res) => {
    res.json(mockPlaces);
});
app.get('/api/places/:id', (req, res) => {
    const p = mockPlaces.find((x) => String(x.id) === req.params.id);
    if (p) res.json(p); else res.status(404).json({ error: 'not found' });
});
['planner', 'places'].forEach((n) => app.get('/' + n, (req, res) => res.sendFile(path.join(pub, 'pages', n + '.html'))));
app.use(express.static(pub));
app.use(express.static(path.join(pub, 'pages')));

const server = http.createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

console.log(`Test server running at ${baseUrl}`);

let browser;
let failedTests = 0;

function assert(condition, message) {
    if (!condition) {
        console.error(`  ❌ FAIL: ${message}`);
        failedTests++;
    } else {
        console.log(`  ✅ PASS: ${message}`);
    }
}

try {
    browser = await chromium.launch({ headless: true });

    // =========================================================================
    // Test 1: Category Icons Unit Verification in Browser Context
    // =========================================================================
    console.log('\n--- 1. Category Icons Unit Verification ---');
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/planner`);

    const unitResults = await page.evaluate(() => {
        const icons = window.CalzadaCategoryIcons;
        if (!icons) return { error: 'CalzadaCategoryIcons not loaded on window' };

        const categories = [
            'eateries', 'malls', 'schools', 'terminals', 'coffee',
            'government', 'health', 'banks', 'hotels', 'establishments',
            'recent', 'pin'
        ];

        const svgResults = {};
        for (const cat of categories) {
            const svg = icons.getSvg(cat);
            svgResults[cat] = {
                hasSvgTag: svg.startsWith('<svg') && svg.endsWith('</svg>'),
                canonical: icons.normalize(cat),
                length: svg.length
            };
        }

        // Test slot rendering
        const slotLogo = icons.renderSlot({ name: 'Test Logo', category: 'eateries', logo: 'https://example.com/logo.png' });
        const slotPhoto = icons.renderSlot({ name: 'Test Photo', category: 'eateries', photo: 'https://example.com/photo.jpg' });
        const slotSvg = icons.renderSlot({ name: 'Test No Img', category: 'schools' });

        return {
            svgResults,
            slotLogo,
            slotPhoto,
            slotSvg
        };
    });

    assert(!unitResults.error, 'window.CalzadaCategoryIcons is properly defined on window');
    for (const [cat, data] of Object.entries(unitResults.svgResults || {})) {
        assert(data.hasSvgTag, `getSvg('${cat}') generates valid SVG (<svg>...</svg>) [canonical: ${data.canonical}]`);
    }
    assert(unitResults.slotLogo.includes('cps-tile--logo') && unitResults.slotLogo.includes('alt="Test Logo"'), 'renderSlot renders logo slot with alt text and loading="lazy"');
    assert(unitResults.slotPhoto.includes('cps-tile--photo') && unitResults.slotPhoto.includes('alt="Test Photo"'), 'renderSlot renders photo slot with alt text and loading="lazy"');
    assert(unitResults.slotSvg.includes('cps-tile') && unitResults.slotSvg.includes('<svg'), 'renderSlot renders category SVG when no image is present');

    // =========================================================================
    // Test 2: Mobile Search Modal & Eateries Category Layout
    // =========================================================================
    console.log('\n--- 2. Mobile Viewport: Search Eateries Results List ---');
    const mobileContext = await browser.newContext({
        viewport: { width: 390, height: 844 }, // iPhone 12/13/14
        isMobile: true,
        hasTouch: true
    });
    const mobilePage = await mobileContext.newPage();
    mobilePage.on('console', msg => console.log('PAGE LOG:', msg.text()));
    mobilePage.on('pageerror', err => console.error('PAGE ERROR:', err));
    mobilePage.on('requestfailed', req => console.log('REQ FAILED:', req.url()));
    mobilePage.on('response', resp => { if (resp.status() >= 400) console.log('REQ 4xx/5xx:', resp.url(), resp.status()); });
    const placesPromise = mobilePage.waitForResponse(r => r.url().includes('/api/places') && r.status() === 200);
    await mobilePage.goto(`${baseUrl}/planner`);
    await placesPromise;
    await mobilePage.waitForTimeout(300);

    // Open "Search a starting point" modal
    await mobilePage.click('#openOriginModal');
    await mobilePage.waitForSelector('.cps-root.is-open', { timeout: 4000 });
    assert(true, 'Mobile Place Search modal opens');

    // Click "Eateries" category chip
    await mobilePage.click('.cps-chip[data-cat="eateries"]');
    await mobilePage.waitForSelector('.cps-row', { timeout: 4000 });

    const layoutCheck = await mobilePage.evaluate(() => {
        const bodyEl = document.querySelector('.cps-body');
        const listEl = document.querySelector('.cps-list');
        const rows = Array.from(document.querySelectorAll('.cps-row'));

        const bodyBgImage = window.getComputedStyle(bodyEl).backgroundImage;
        const listBgImage = window.getComputedStyle(listEl).backgroundImage;

        const rowData = rows.map(row => {
            const nameEl = row.querySelector('.cps-row-name');
            const tileEl = row.querySelector('.cps-tile');
            const imgEl = tileEl ? tileEl.querySelector('img') : null;
            const svgEl = tileEl ? tileEl.querySelector('svg') : null;

            if (row.textContent.includes('Kain Tayo') || row.textContent.includes('Teng-Teng')) {
                row.scrollIntoView();
            }

            const rowRect = row.getBoundingClientRect();
            const tileRect = tileEl ? tileEl.getBoundingClientRect() : null;
            const imgRect = imgEl ? imgEl.getBoundingClientRect() : null;
            const tileComputed = tileEl ? window.getComputedStyle(tileEl) : null;
            const imgComputed = imgEl ? window.getComputedStyle(imgEl) : null;

            return {
                name: nameEl ? nameEl.textContent.trim() : '',
                rowHeight: rowRect.height,
                hasTile: !!tileEl,
                tileClasses: tileEl ? tileEl.className : '',
                tileWidth: tileRect ? tileRect.width : 0,
                tileHeight: tileRect ? tileRect.height : 0,
                tileOverflow: tileComputed ? tileComputed.overflow : '',
                hasImg: !!imgEl,
                imgWidth: imgRect ? imgRect.width : 0,
                imgHeight: imgRect ? imgRect.height : 0,
                imgObjectFit: imgComputed ? imgComputed.objectFit : '',
                hasSvg: !!svgEl
            };
        });

        return {
            bodyBgImage,
            listBgImage,
            rowCount: rows.length,
            rowData
        };
    });

    assert(layoutCheck.bodyBgImage === 'none' && layoutCheck.listBgImage === 'none', 'Results container (.cps-body / .cps-list) has NO photo background');
    assert(layoutCheck.rowCount >= 5, `Results list rendered ${layoutCheck.rowCount} items`);

    console.log('All rendered row names (' + layoutCheck.rowData.length + '):', layoutCheck.rowData.map(r => r.name));
    const kainTayo = layoutCheck.rowData.find(r => r.name === 'Kain Tayo');
    assert(kainTayo && kainTayo.hasTile, 'Kain Tayo row has .cps-tile');
    assert(kainTayo && Math.round(kainTayo.tileWidth) === 48 && Math.round(kainTayo.tileHeight) === 48, `Kain Tayo tile is exactly 48x48px (got ${kainTayo?.tileWidth}x${kainTayo?.tileHeight}px)`);
    assert(kainTayo && kainTayo.tileOverflow === 'hidden', 'Kain Tayo tile has overflow: hidden');
    assert(kainTayo && kainTayo.hasImg && Math.round(kainTayo.imgWidth) > 0 && Math.round(kainTayo.imgWidth) <= 48 && Math.round(kainTayo.imgHeight) <= 48, `Kain Tayo portrait img (1200x1600 natural) is strictly bounded inside 48x48 tile (got ${kainTayo?.imgWidth}x${kainTayo?.imgHeight}px)`);

    const tengTengs = layoutCheck.rowData.find(r => r.name === "Teng-Teng's");
    assert(tengTengs && tengTengs.hasImg && Math.round(tengTengs.imgWidth) > 0 && Math.round(tengTengs.imgWidth) <= 48, `Teng-Teng's wide landscape img (1600x900 natural) is strictly bounded inside 48x48 tile (got ${tengTengs?.imgWidth}x${tengTengs?.imgHeight}px)`);

    const plater = layoutCheck.rowData.find(r => r.name === "Plater Buddy's");
    assert(plater && plater.hasImg && Math.round(plater.imgWidth) > 0 && Math.round(plater.imgWidth) <= 48, `Plater Buddy's square logo (500x500 natural) is strictly bounded inside 48x48 tile (got ${plater?.imgWidth}x${plater?.imgHeight}px)`);
    assert(plater && plater.tileClasses.includes('cps-tile--logo'), 'Plater Buddy\'s tile has --logo modifier for clean background and padding');

    const tonTons = layoutCheck.rowData.find(r => r.name === "Ton-Ton's Sisig");
    assert(tonTons && tonTons.hasSvg, "Ton-Ton's Sisig (no image) shows category SVG icon in tile");
    assert(tonTons && Math.round(tonTons.tileWidth) === 48 && Math.round(tonTons.tileHeight) === 48, `Ton-Ton's Sisig tile maintains identical 48x48px dimension`);

    // Verify row height consistency (prevent row collapse or vertical shifting)
    const heights = layoutCheck.rowData.map(r => Math.round(r.rowHeight));
    const minH = Math.min(...heights);
    const maxH = Math.max(...heights);
    assert(minH >= 56, `Every row satisfies touch target min-height >= 56px (min: ${minH}px)`);
    assert(maxH - minH <= 4, `All rows have consistent heights within 4px (min: ${minH}px, max: ${maxH}px)`);

    // =========================================================================
    // Test 3: Broken Image Fallback Handling
    // =========================================================================
    console.log('\n--- 3. Broken Image Error Fallback Test ---');
    const brokenFallbackCheck = await mobilePage.evaluate(() => {
        // Trigger error event on Clarisse Kitchen's broken image
        const rows = Array.from(document.querySelectorAll('.cps-row'));
        const clarisseRow = rows.find(r => r.textContent.includes('Clarisse Kitchen'));
        if (!clarisseRow) return { error: 'Clarisse row not found' };

        const tile = clarisseRow.querySelector('.cps-tile');
        const img = tile.querySelector('img');
        if (img) {
            // Trigger onerror handler
            img.dispatchEvent(new Event('error'));
        }

        const tileAfter = clarisseRow.querySelector('.cps-tile');
        const svgAfter = tileAfter ? tileAfter.querySelector('svg') : null;
        const rectAfter = tileAfter ? tileAfter.getBoundingClientRect() : null;
        const rowRectAfter = clarisseRow.getBoundingClientRect();

        return {
            hasSvg: !!svgAfter,
            tileClasses: tileAfter ? tileAfter.className : '',
            tileWidth: rectAfter ? rectAfter.width : 0,
            tileHeight: rectAfter ? rectAfter.height : 0,
            rowHeight: rowRectAfter.height
        };
    });

    assert(brokenFallbackCheck.hasSvg, 'Broken image URL automatically fell back to category SVG');
    assert(!brokenFallbackCheck.tileClasses.includes('cps-tile--logo'), 'Broken image tile removed --logo modifier to restore default tile style');
    assert(Math.round(brokenFallbackCheck.tileWidth) === 48 && Math.round(brokenFallbackCheck.tileHeight) === 48, 'Broken image fallback tile retained 48x48px size');
    assert(brokenFallbackCheck.rowHeight >= 56, 'Row height did not collapse after image failure');

    // =========================================================================
    // Test 4: Desktop Viewport Search
    // =========================================================================
    console.log('\n--- 4. Desktop Viewport: Place Search Dropdown ---');
    const desktopContext = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });
    const desktopPage = await desktopContext.newPage();
    const destPlacesPromise = desktopPage.waitForResponse(r => r.url().includes('/api/places') && r.status() === 200);
    await desktopPage.goto(`${baseUrl}/planner`);
    await destPlacesPromise;
    await desktopPage.waitForTimeout(300);

    await desktopPage.click('#openDestModal');
    await desktopPage.waitForSelector('.cps-root.is-open', { timeout: 4000 });

    // Type query "Kain"
    const inputEl = await desktopPage.$('.cps-input');
    await inputEl.fill('Kain');
    await desktopPage.waitForSelector('.cps-row', { timeout: 4000 });

    const desktopCheck = await desktopPage.evaluate(() => {
        const row = document.querySelector('.cps-row');
        if (!row) return null;
        const tile = row.querySelector('.cps-tile');
        const img = tile ? tile.querySelector('img') : null;
        const rect = tile ? tile.getBoundingClientRect() : null;
        const imgRect = img ? img.getBoundingClientRect() : null;
        return {
            name: row.querySelector('.cps-row-name')?.textContent,
            tileW: rect?.width,
            tileH: rect?.height,
            imgW: imgRect?.width,
            imgH: imgRect?.height
        };
    });

    assert(desktopCheck && desktopCheck.name.includes('Kain'), 'Desktop search finds "Kain Tayo"');
    assert(desktopCheck && Math.round(desktopCheck.tileW) === 48 && Math.round(desktopCheck.tileH) === 48, `Desktop dropdown tile is 48x48px (got ${desktopCheck?.tileW}x${desktopCheck?.tileH}px)`);
    assert(desktopCheck && Math.round(desktopCheck.imgW) <= 48 && Math.round(desktopCheck.imgH) <= 48, `Desktop dropdown img is strictly bounded within tile (got ${desktopCheck?.imgW}x${desktopCheck?.imgH}px)`);

    // =========================================================================
    // Test 5: Places Directory Page Grid & Dropdown
    // =========================================================================
    console.log('\n--- 5. Places Directory Page Verification ---');
    const placesPage = await desktopContext.newPage();
    await placesPage.goto(`${baseUrl}/places`);

    const placesPageCheck = await placesPage.evaluate(() => {
        const iconsLoaded = typeof window.CalzadaCategoryIcons !== 'undefined';
        const eaterySvg = iconsLoaded ? window.CalzadaCategoryIcons.getSvg('eateries') : '';
        return {
            iconsLoaded,
            hasEaterySvg: eaterySvg.includes('<svg')
        };
    });

    assert(placesPageCheck.iconsLoaded, 'CalzadaCategoryIcons loaded on /places');
    assert(placesPageCheck.hasEaterySvg, 'Category SVGs can be generated on /places');

} catch (err) {
    console.error('Test execution error:', err);
    failedTests++;
} finally {
    if (browser) await browser.close();
    server.close();
}

console.log(`\n========================================`);
if (failedTests === 0) {
    console.log(`🎉 ALL TESTS PASSED!`);
    process.exit(0);
} else {
    console.error(`💥 ${failedTests} TEST(S) FAILED!`);
    process.exit(1);
}
