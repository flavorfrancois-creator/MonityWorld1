/**
 * Monity World - WhatsApp Web Scraper Service
 * Uses Playwright to interact with web.whatsapp.com
 * 
 * Features:
 * - QR Code with auto-refresh every 2 minutes + manual refresh
 * - Phone number linking with country list scraped from WhatsApp Web
 * - Cloud API Meta Business (production alternative)
 */

const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.WHATSAPP_PORT || 8002;
const SESSIONS_DIR = path.join(__dirname, '.wa_sessions');
const QR_REFRESH_INTERVAL = 2 * 60 * 1000; // 2 minutes

// Find Chromium/Edge browser path dynamically
function findBrowserPath() {
    const searchDirs = [
        '/pw-browsers',
        path.join(require('os').homedir(), '.cache', 'ms-playwright'),
        '/root/.cache/ms-playwright',
    ];

    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        try {
            const entries = fs.readdirSync(dir);
            for (const entry of entries) {
                if (!entry.startsWith('chromium')) continue;
                const chromePath = path.join(dir, entry, 'chrome-linux', 'chrome');
                if (fs.existsSync(chromePath)) return chromePath;
                const headlessPath = path.join(dir, entry, 'chrome-linux', 'headless_shell');
                if (fs.existsSync(headlessPath)) return headlessPath;
            }
        } catch (e) {}
    }
    return null;
}

const BROWSER_PATH = findBrowserPath();
console.log(`Browser: Microsoft Edge (Chromium) at ${BROWSER_PATH || 'NOT FOUND'}`);

// Stores
const browserSessions = new Map();
const sessionData = new Map();
const cloudApiConfigs = new Map();
const qrRefreshTimers = new Map();

// Cached scraped countries
let scrapedCountries = null;
let countriesCacheTime = 0;
const COUNTRIES_CACHE_TTL = 30 * 60 * 1000; // 30 min cache

if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

const BROWSER_CONFIG = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    viewport: { width: 1920, height: 1080 },
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris'
};

/**
 * Launch browser and navigate to WhatsApp Web
 */
async function launchWhatsAppSession(sessionId) {
    console.log(`[${sessionId}] Launching WhatsApp Web session with Edge (Chromium)...`);

    await closeSession(sessionId);

    const userDataDir = path.join(SESSIONS_DIR, sessionId);
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
    }

    try {
        const launchOptions = {
            headless: true,
            viewport: BROWSER_CONFIG.viewport,
            userAgent: BROWSER_CONFIG.userAgent,
            locale: BROWSER_CONFIG.locale,
            timezoneId: BROWSER_CONFIG.timezoneId,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--window-size=1920,1080',
                '--disable-gpu'
            ],
            ignoreDefaultArgs: ['--enable-automation']
        };

        if (BROWSER_PATH) {
            launchOptions.executablePath = BROWSER_PATH;
        }

        const browser = await chromium.launchPersistentContext(userDataDir, launchOptions);

        const page = browser.pages()[0] || await browser.newPage();

        console.log(`[${sessionId}] Navigating to web.whatsapp.com...`);
        await page.goto('https://web.whatsapp.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // Wait for page to load enough
        await page.waitForTimeout(5000);

        browserSessions.set(sessionId, { browser, page, createdAt: Date.now() });
        sessionData.set(sessionId, {
            status: 'initializing',
            qr: null,
            qrTimestamp: null
        });

        // Extract QR once after page loads, then leave the page alone
        extractQROnce(sessionId);

        return { status: 'initializing', message: 'Session WhatsApp Web initialisee' };
    } catch (err) {
        console.error(`[${sessionId}] Launch error:`, err.message);
        throw err;
    }
}

/**
 * Extract QR code ONE TIME only, then stop touching the page.
 * This lets WhatsApp Web handle its own lifecycle (QR refresh, connection transition).
 */
async function extractQROnce(sessionId) {
    const session = browserSessions.get(sessionId);
    if (!session) return;

    // Try a few times to capture the initial QR (page might still be loading)
    for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise(r => setTimeout(r, 3000));

        const data = sessionData.get(sessionId);
        if (!data || data.status === 'ready') return;

        const result = await extractQRCode(sessionId);
        if (result.status === 'qr_ready' || result.status === 'ready') {
            console.log(`[${sessionId}] Initial QR captured. Page is now autonomous.`);
            return;
        }
        console.log(`[${sessionId}] Attempt ${attempt + 1}/8: ${result.status}`);
    }
    console.log(`[${sessionId}] Could not capture initial QR after 8 attempts.`);
}

/**
 * Extract QR code from the page
 */
async function extractQRCode(sessionId) {
    const session = browserSessions.get(sessionId);
    if (!session) return { status: 'not_initialized' };

    const { page } = session;

    try {
        // Check if already connected (chat list visible)
        const isConnected = await page.evaluate(() => {
            return !!document.querySelector('[data-testid="chat-list"]') ||
                   !!document.querySelector('[data-testid="chatlist"]') ||
                   !!document.querySelector('[aria-label="Liste de discussions"]') ||
                   !!document.querySelector('[aria-label="Chat list"]') ||
                   !!document.querySelector('div[data-testid="conversation-panel-wrapper"]');
        }).catch(() => false);

        if (isConnected) {
            console.log(`[${sessionId}] Connected!`);
            updateSessionData(sessionId, { status: 'ready', qr: null });
            stopQRPolling(sessionId);
            return { status: 'ready' };
        }

        // Try to extract QR from canvas
        const qrDataUrl = await page.evaluate(() => {
            const canvas = document.querySelector('canvas[aria-label="Scan this QR code to link a device!"]') ||
                          document.querySelector('canvas[aria-label]') ||
                          document.querySelector('canvas');
            if (canvas) {
                try {
                    return canvas.toDataURL('image/png');
                } catch (e) {
                    return null;
                }
            }
            return null;
        }).catch(() => null);

        if (qrDataUrl) {
            console.log(`[${sessionId}] QR code captured`);
            updateSessionData(sessionId, {
                status: 'qr_ready',
                qr: qrDataUrl,
                qrTimestamp: Date.now()
            });
            return { status: 'qr_ready', qr: qrDataUrl, timestamp: Date.now() };
        }

        // Check if QR has expired (refresh button visible)
        const hasRefreshBtn = await page.evaluate(() => {
            return !!document.querySelector('[data-testid="refresh-large"]') ||
                   !!document.querySelector('button[aria-label*="efresh"]') ||
                   !!document.querySelector('button[aria-label*="ctualiser"]');
        }).catch(() => false);

        if (hasRefreshBtn) {
            return { status: 'qr_expired', message: 'QR code expire, cliquez rafraichir' };
        }

        return { status: 'loading', message: 'Chargement de WhatsApp Web...' };
    } catch (err) {
        console.error(`[${sessionId}] QR extraction error:`, err.message);
        return { status: 'error', error: err.message };
    }
}

/**
 * Check if user is connected — called on-demand only (no polling).
 * This is the ONLY time we touch the page after initial QR capture.
 */
async function checkConnection(sessionId) {
    const session = browserSessions.get(sessionId);
    if (!session) return { status: 'not_initialized' };

    const { page } = session;

    try {
        const isConnected = await page.evaluate(() => {
            // WhatsApp Web shows these elements when connected
            return !!document.querySelector('[data-testid="chat-list"]') ||
                   !!document.querySelector('[data-testid="chatlist"]') ||
                   !!document.querySelector('[aria-label="Liste de discussions"]') ||
                   !!document.querySelector('[aria-label="Chat list"]') ||
                   !!document.querySelector('div[data-testid="conversation-panel-wrapper"]') ||
                   !!document.querySelector('header[data-testid="chatlist-header"]') ||
                   !!document.querySelector('[data-testid="menu-bar-search"]') ||
                   // No canvas means QR is gone = likely connected
                   (!document.querySelector('canvas') && !document.querySelector('[data-testid="qrcode"]'));
        }).catch(() => false);

        if (isConnected) {
            console.log(`[${sessionId}] Connection confirmed!`);
            updateSessionData(sessionId, { status: 'ready', qr: null });
            return { status: 'ready', connected: true };
        }

        // Check if QR is still there
        const hasQR = await page.evaluate(() => {
            return !!document.querySelector('canvas');
        }).catch(() => false);

        if (hasQR) {
            return { status: 'waiting_scan', connected: false, message: 'QR code toujours visible. Scannez-le avec votre telephone.' };
        }

        // Page might be in a loading/transition state
        return { status: 'checking', connected: false, message: 'Verification en cours...' };
    } catch (err) {
        console.error(`[${sessionId}] Check connection error:`, err.message);
        return { status: 'error', connected: false, error: err.message };
    }
}

// No more polling — page is autonomous
function stopQRPolling(sessionId) {
    const timers = qrRefreshTimers.get(sessionId);
    if (timers) {
        if (timers.statusTimer) clearInterval(timers.statusTimer);
        qrRefreshTimers.delete(sessionId);
    }
}

/**
 * Manually refresh QR code
 */
async function refreshQRCode(sessionId) {
    const session = browserSessions.get(sessionId);
    if (!session) throw new Error('Session non trouvee');

    const { page } = session;

    try {
        console.log(`[${sessionId}] Refreshing QR code...`);

        // Try clicking refresh button
        const clicked = await page.evaluate(() => {
            const refreshBtn = document.querySelector('[data-testid="refresh-large"]') ||
                              document.querySelector('button[aria-label*="efresh"]') ||
                              document.querySelector('button[aria-label*="ctualiser"]');
            if (refreshBtn) {
                refreshBtn.click();
                return true;
            }
            return false;
        }).catch(() => false);

        if (!clicked) {
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        }

        await page.waitForTimeout(3000);
        return await extractQRCode(sessionId);
    } catch (err) {
        console.error(`[${sessionId}] Refresh error:`, err.message);
        throw err;
    }
}

/**
 * Scrape country list from WhatsApp Web phone linking page
 */
async function scrapeCountriesFromWhatsApp(sessionId) {
    const session = browserSessions.get(sessionId);
    if (!session) throw new Error('Session non trouvee. Initialisez d\'abord.');

    // Use cache if available
    if (scrapedCountries && (Date.now() - countriesCacheTime) < COUNTRIES_CACHE_TTL) {
        return scrapedCountries;
    }

    const { page } = session;

    try {
        console.log(`[${sessionId}] Scraping countries from WhatsApp Web...`);

        // Click "Link with phone number" button
        await page.evaluate(() => {
            // Try various selectors for the phone link button
            const linkBtn = document.querySelector('[data-testid="link-device-phone-number-btn"]') ||
                           document.querySelector('[data-testid="link-with-phone-number"]');
            if (linkBtn) {
                linkBtn.click();
                return true;
            }
            // Fallback: find by text
            const spans = document.querySelectorAll('span');
            for (const s of spans) {
                const txt = s.textContent.toLowerCase();
                if (txt.includes('numéro de téléphone') || txt.includes('phone number') || txt.includes('link with phone')) {
                    s.closest('button, [role="button"], div[tabindex]')?.click();
                    return true;
                }
            }
            return false;
        });

        await page.waitForTimeout(2000);

        // Click the country dropdown to open it
        await page.evaluate(() => {
            const dropdown = document.querySelector('[data-testid="link-device-phone-number-country-code-dropdown-button"]') ||
                            document.querySelector('[role="button"][aria-haspopup="listbox"]') ||
                            document.querySelector('div[data-testid*="country"]');
            if (dropdown) {
                dropdown.click();
                return true;
            }
            // Fallback: find dropdown-like elements
            const btns = document.querySelectorAll('[role="button"]');
            for (const b of btns) {
                if (b.textContent.includes('+') && b.querySelector('span')) {
                    b.click();
                    return true;
                }
            }
            return false;
        });

        await page.waitForTimeout(1500);

        // Scrape all countries from the dropdown
        const countries = await page.evaluate(() => {
            const items = document.querySelectorAll('[role="option"], [role="listbox"] [role="option"], li[role="option"]');
            const result = [];
            
            for (const item of items) {
                const text = item.textContent.trim();
                // Parse country name and code like "France +33"
                const match = text.match(/^(.+?)\s*\+(\d+)\s*$/);
                if (match) {
                    result.push({
                        name: match[1].trim(),
                        code: '+' + match[2],
                        raw: text
                    });
                }
            }
            
            // If the listbox approach didn't work, try alternative selectors
            if (result.length === 0) {
                const listItems = document.querySelectorAll('[data-testid*="country"], .country-item, [class*="country"]');
                for (const li of listItems) {
                    const text = li.textContent.trim();
                    const match = text.match(/^(.+?)\s*\+(\d+)\s*$/);
                    if (match) {
                        result.push({ name: match[1].trim(), code: '+' + match[2], raw: text });
                    }
                }
            }

            return result;
        });

        // Close dropdown by pressing Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);

        // Go back to QR code view
        await page.evaluate(() => {
            const backBtn = document.querySelector('[data-testid="popup-controls-back"]') ||
                           document.querySelector('[aria-label="Back"]') ||
                           document.querySelector('[aria-label="Retour"]');
            if (backBtn) backBtn.click();
        });

        if (countries.length > 0) {
            console.log(`[${sessionId}] Scraped ${countries.length} countries from WhatsApp Web`);
            scrapedCountries = countries;
            countriesCacheTime = Date.now();
            return countries;
        }

        console.log(`[${sessionId}] No countries found from scraping, using fallback`);
        return getFallbackCountries();
    } catch (err) {
        console.error(`[${sessionId}] Country scraping error:`, err.message);
        return getFallbackCountries();
    }
}

/**
 * Fallback country list when scraping fails
 */
function getFallbackCountries() {
    return [
        { name: 'Afghanistan', code: '+93' },
        { name: 'Afrique du Sud', code: '+27' },
        { name: 'Algerie', code: '+213' },
        { name: 'Allemagne', code: '+49' },
        { name: 'Angola', code: '+244' },
        { name: 'Belgique', code: '+32' },
        { name: 'Benin', code: '+229' },
        { name: 'Burkina Faso', code: '+226' },
        { name: 'Burundi', code: '+257' },
        { name: 'Cameroun', code: '+237' },
        { name: 'Canada', code: '+1' },
        { name: 'Centrafrique', code: '+236' },
        { name: 'Congo Brazzaville', code: '+242' },
        { name: 'Cote d\'Ivoire', code: '+225' },
        { name: 'Egypte', code: '+20' },
        { name: 'Espagne', code: '+34' },
        { name: 'Etats-Unis', code: '+1' },
        { name: 'France', code: '+33' },
        { name: 'Gabon', code: '+241' },
        { name: 'Guinee', code: '+224' },
        { name: 'Italie', code: '+39' },
        { name: 'Kenya', code: '+254' },
        { name: 'Mali', code: '+223' },
        { name: 'Maroc', code: '+212' },
        { name: 'Mozambique', code: '+258' },
        { name: 'Niger', code: '+227' },
        { name: 'Nigeria', code: '+234' },
        { name: 'Ouganda', code: '+256' },
        { name: 'Portugal', code: '+351' },
        { name: 'RD Congo', code: '+243' },
        { name: 'Royaume-Uni', code: '+44' },
        { name: 'Rwanda', code: '+250' },
        { name: 'Senegal', code: '+221' },
        { name: 'Suisse', code: '+41' },
        { name: 'Tanzanie', code: '+255' },
        { name: 'Tchad', code: '+235' },
        { name: 'Togo', code: '+228' },
        { name: 'Tunisie', code: '+216' }
    ].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Request pairing code with country and phone number
 */
async function requestPairingCode(sessionId, countryCode, phoneNumber) {
    const session = browserSessions.get(sessionId);
    if (!session) throw new Error('Session non trouvee. Initialisez d\'abord.');

    const { page } = session;
    const cleanPhone = phoneNumber.replace(/^0+/, '').replace(/\s/g, '');
    console.log(`[${sessionId}] Requesting pairing code for ${countryCode}${cleanPhone.slice(0, 3)}***`);

    try {
        // Step 1: Click "Link with phone number" button
        const clickedLink = await page.evaluate(() => {
            const btn = document.querySelector('[data-testid="link-device-phone-number-btn"]') ||
                       document.querySelector('[data-testid="link-with-phone-number"]');
            if (btn) { btn.click(); return true; }
            const spans = document.querySelectorAll('span');
            for (const s of spans) {
                const txt = s.textContent.toLowerCase();
                if (txt.includes('phone number') || txt.includes('numéro de téléphone')) {
                    s.closest('button, [role="button"], div[tabindex]')?.click();
                    return true;
                }
            }
            return false;
        });
        console.log(`[${sessionId}] Clicked phone link button: ${clickedLink}`);
        await page.waitForTimeout(2000);

        // Step 2: Open country dropdown
        await page.evaluate(() => {
            const dropdown = document.querySelector('[data-testid="link-device-phone-number-country-code-dropdown-button"]') ||
                            document.querySelector('[role="button"][aria-haspopup="listbox"]');
            if (dropdown) dropdown.click();
        });
        await page.waitForTimeout(1000);

        // Step 3: Select the country from list
        const codeNum = countryCode.replace('+', '');
        const selected = await page.evaluate((code) => {
            const options = document.querySelectorAll('[role="option"]');
            for (const opt of options) {
                if (opt.textContent.includes('+' + code) || opt.textContent.includes(code)) {
                    opt.click();
                    return true;
                }
            }
            return false;
        }, codeNum);
        console.log(`[${sessionId}] Selected country ${countryCode}: ${selected}`);
        await page.waitForTimeout(500);

        // Step 4: Enter phone number in the input field
        const phoneInput = await page.$('input[data-testid="link-device-phone-number-input"]') ||
                          await page.$('input[type="text"]');
        if (phoneInput) {
            await phoneInput.fill('');
            await phoneInput.fill(cleanPhone);
            console.log(`[${sessionId}] Entered phone number`);
        } else {
            console.error(`[${sessionId}] Phone input not found`);
        }
        await page.waitForTimeout(500);

        // Step 5: Click "Next" / "Suivant" button
        await page.evaluate(() => {
            const nextBtn = document.querySelector('[data-testid="link-device-phone-number-next-button"]') ||
                           document.querySelector('button[type="submit"]');
            if (nextBtn) { nextBtn.click(); return true; }
            // Fallback: find button by text
            const buttons = document.querySelectorAll('button');
            for (const b of buttons) {
                const txt = b.textContent.toLowerCase();
                if (txt.includes('next') || txt.includes('suivant')) {
                    b.click();
                    return true;
                }
            }
            return false;
        });
        console.log(`[${sessionId}] Clicked next button`);

        // Step 6: Wait for pairing code to appear
        await page.waitForTimeout(8000);

        // Step 7: Extract the pairing code
        const code = await page.evaluate(() => {
            // Look for code display element
            const codeEl = document.querySelector('[data-testid="link-device-code"]') ||
                          document.querySelector('[data-link-code]');
            if (codeEl) return codeEl.textContent.trim();

            // Look for formatted code pattern (XXXX-XXXX)
            const allText = document.body.innerText;
            const match = allText.match(/([A-Z0-9]{4}[\s-][A-Z0-9]{4})/);
            if (match) return match[1];

            // Also try looking for a prominent displayed code
            const largeTexts = document.querySelectorAll('span[dir="ltr"], [data-testid*="code"]');
            for (const el of largeTexts) {
                const txt = el.textContent.trim();
                if (/^[A-Z0-9]{4}[\s-][A-Z0-9]{4}$/.test(txt)) {
                    return txt;
                }
            }

            return null;
        });

        if (code) {
            console.log(`[${sessionId}] Pairing code received: ${code.slice(0, 4)}****`);
            updateSessionData(sessionId, {
                status: 'pairing_code_ready',
                pairingCode: code,
                phone: countryCode + cleanPhone
            });
            return { status: 'pairing_code_ready', code, phone: countryCode + cleanPhone };
        }

        // Take a screenshot for debugging
        try {
            const screenshotPath = path.join(SESSIONS_DIR, `${sessionId}_debug.png`);
            await page.screenshot({ path: screenshotPath });
            console.log(`[${sessionId}] Debug screenshot saved at ${screenshotPath}`);
        } catch (e) {}

        return { status: 'waiting', message: 'Code en cours de generation. Veuillez patienter...' };
    } catch (err) {
        console.error(`[${sessionId}] Pairing error:`, err.message);
        throw err;
    }
}

function updateSessionData(sessionId, updates) {
    const current = sessionData.get(sessionId) || {};
    sessionData.set(sessionId, { ...current, ...updates, lastUpdate: Date.now() });
}

async function closeSession(sessionId) {
    stopQRPolling(sessionId);
    const session = browserSessions.get(sessionId);
    if (session) {
        try { await session.browser.close(); } catch (e) {}
        browserSessions.delete(sessionId);
    }
    sessionData.delete(sessionId);
    // Clean up stale lock files
    const userDataDir = path.join(SESSIONS_DIR, sessionId);
    for (const lockFile of ['lock', 'parent.lock', '.parentlock', 'SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
        const lockPath = path.join(userDataDir, lockFile);
        try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); } catch (e) {}
    }
}

// ============ API ROUTES ============

app.get('/health', (req, res) => {
    res.json({
        status: BROWSER_PATH ? 'ok' : 'degraded',
        service: 'whatsapp-web-scraper',
        activeSessions: browserSessions.size,
        browserType: 'edge (chromium)',
        browserPath: BROWSER_PATH || 'NOT_FOUND',
        browserAvailable: !!BROWSER_PATH
    });
});

app.get('/methods', (req, res) => {
    res.json({
        methods: [
            {
                id: 'qr_code',
                name: 'QR Code',
                description: 'Scannez le QR code avec WhatsApp sur votre telephone',
                autoRefresh: '2 minutes',
                manualRefresh: true,
                recommended: true
            },
            {
                id: 'phone_pairing',
                name: 'Numero de telephone',
                description: 'Selectionnez votre pays, entrez votre numero et recevez un code de liaison',
                source: 'web.whatsapp.com'
            },
            {
                id: 'cloud_api',
                name: 'WhatsApp Cloud API',
                description: 'API officielle Meta Business pour la production',
                production: true
            }
        ]
    });
});

// Get countries - try scraped first, fallback to static list
app.get('/countries', async (req, res) => {
    // If a session is active, try to scrape from WhatsApp
    const sessionId = req.query.sessionId;
    if (sessionId && browserSessions.has(sessionId)) {
        try {
            const countries = await scrapeCountriesFromWhatsApp(sessionId);
            return res.json({ countries, source: countries === scrapedCountries ? 'whatsapp_web' : 'fallback' });
        } catch (e) {
            console.error('Country scraping failed:', e.message);
        }
    }

    // Use cached scraped countries or fallback
    if (scrapedCountries && (Date.now() - countriesCacheTime) < COUNTRIES_CACHE_TTL) {
        return res.json({ countries: scrapedCountries, source: 'whatsapp_web_cached' });
    }

    return res.json({ countries: getFallbackCountries(), source: 'fallback' });
});

app.post('/session/init', async (req, res) => {
    const { sessionId, method } = req.body;

    if (!sessionId) {
        return res.status(400).json({ error: 'sessionId requis' });
    }

    try {
        if (method === 'cloud_api') {
            return res.json({ status: 'needs_configuration', method: 'cloud_api' });
        }

        // Return immediately — launch browser in background (production can take 30s+)
        sessionData.set(sessionId, { status: 'initializing', qr: null, qrTimestamp: null });
        res.json({ status: 'initializing', message: 'Session WhatsApp Web en cours de lancement' });

        // Fire and forget — browser launch happens asynchronously
        launchWhatsAppSession(sessionId).catch(err => {
            console.error(`[${sessionId}] Background launch failed:`, err.message);
            sessionData.set(sessionId, { status: 'error', error: err.message });
        });
    } catch (err) {
        console.error('Session init error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/session/:sessionId/qr', async (req, res) => {
    const { sessionId } = req.params;
    const data = sessionData.get(sessionId);

    if (!data) {
        return res.json({ status: 'not_initialized' });
    }

    if (data.status === 'ready') {
        return res.json({ status: 'ready' });
    }

    if (data.status === 'error') {
        return res.json({ status: 'error', error: data.error });
    }

    // Return cached QR if fresh
    if (data.qr && (Date.now() - data.qrTimestamp) < QR_REFRESH_INTERVAL) {
        return res.json({
            status: 'qr_ready',
            qr: data.qr,
            timestamp: data.qrTimestamp,
            refreshIn: QR_REFRESH_INTERVAL - (Date.now() - data.qrTimestamp)
        });
    }

    // If browser session exists, try extracting QR now
    const session = browserSessions.get(sessionId);
    if (session) {
        const result = await extractQRCode(sessionId);
        return res.json(result);
    }

    // Browser still launching — return initializing status
    return res.json({ status: 'initializing', message: 'Navigateur en cours de lancement...' });
});

app.post('/session/:sessionId/refresh-qr', async (req, res) => {
    const { sessionId } = req.params;

    try {
        const result = await refreshQRCode(sessionId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/session/:sessionId/pairing-code', async (req, res) => {
    const { sessionId } = req.params;
    const { countryCode, phoneNumber } = req.body;

    if (!countryCode || !phoneNumber) {
        return res.status(400).json({ error: 'countryCode et phoneNumber requis' });
    }

    try {
        const result = await requestPairingCode(sessionId, countryCode, phoneNumber);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Scrape countries for a specific session
app.get('/session/:sessionId/countries', async (req, res) => {
    const { sessionId } = req.params;

    if (!browserSessions.has(sessionId)) {
        return res.json({ countries: getFallbackCountries(), source: 'fallback' });
    }

    try {
        const countries = await scrapeCountriesFromWhatsApp(sessionId);
        res.json({ countries, source: scrapedCountries === countries ? 'whatsapp_web' : 'fallback' });
    } catch (err) {
        res.json({ countries: getFallbackCountries(), source: 'fallback', error: err.message });
    }
});

app.get('/session/:sessionId/status', async (req, res) => {
    const { sessionId } = req.params;

    const cloudConfig = cloudApiConfigs.get(sessionId);
    if (cloudConfig) {
        return res.json({
            status: 'ready',
            method: 'cloud_api',
            info: { phoneNumber: cloudConfig.phoneNumber }
        });
    }

    const data = sessionData.get(sessionId);
    if (!data) {
        return res.json({ status: 'not_initialized' });
    }

    // If session exists but not yet ready, try to extract QR to update status
    const session = browserSessions.get(sessionId);
    if (session && data.status !== 'ready') {
        const result = await extractQRCode(sessionId);
        return res.json({ sessionId, ...result });
    }

    res.json({ sessionId, ...data });
});

app.get('/sessions', (req, res) => {
    const sessions = [];

    for (const [sessionId] of browserSessions) {
        const data = sessionData.get(sessionId) || {};
        sessions.push({
            sessionId,
            status: data.status || 'unknown',
            method: 'whatsapp_web'
        });
    }

    for (const [sessionId, config] of cloudApiConfigs) {
        if (!browserSessions.has(sessionId)) {
            sessions.push({
                sessionId,
                status: 'ready',
                method: 'cloud_api',
                phoneNumber: config.phoneNumber
            });
        }
    }

    res.json({ sessions });
});

app.post('/session/:sessionId/configure', async (req, res) => {
    const { sessionId } = req.params;
    const { phoneNumberId, accessToken, businessAccountId } = req.body;

    if (!phoneNumberId || !accessToken) {
        return res.status(400).json({ error: 'phoneNumberId et accessToken requis' });
    }

    try {
        const response = await axios.get(
            `https://graph.facebook.com/v18.0/${phoneNumberId}`,
            { headers: { 'Authorization': `Bearer ${accessToken}` }, timeout: 10000 }
        );

        const phoneNumber = response.data.display_phone_number || response.data.verified_name;

        cloudApiConfigs.set(sessionId, {
            phoneNumberId,
            accessToken,
            businessAccountId,
            phoneNumber,
            configuredAt: new Date().toISOString()
        });

        res.json({ success: true, status: 'ready', phoneNumber });
    } catch (err) {
        res.status(400).json({
            success: false,
            error: err.response?.data?.error?.message || err.message
        });
    }
});

/**
 * Send a message via WhatsApp Web (Playwright) by opening a chat and typing the message
 */
async function sendViaWhatsAppWeb(sessionId, phone, message) {
    const session = browserSessions.get(sessionId);
    if (!session) throw new Error('Session non initialisee');

    const { page } = session;
    const cleanPhone = phone.replace(/[^0-9]/g, '');

    console.log(`[${sessionId}] Sending message to ${cleanPhone.slice(0, 5)}*** via WhatsApp Web`);

    try {
        // Navigate to chat with this phone number using wa.me deep link
        await page.goto(`https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Wait for the chat to load and the message input to appear
        await page.waitForTimeout(5000);

        // Check if we got an "invalid phone" popup
        const hasError = await page.evaluate(() => {
            const body = document.body.innerText.toLowerCase();
            return body.includes('numéro de téléphone') && body.includes('pas un numéro') ||
                   body.includes('phone number shared via') && body.includes('invalid') ||
                   body.includes('not on whatsapp');
        }).catch(() => false);

        if (hasError) {
            // Go back to main page
            await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
            return { success: false, error: 'Numero non inscrit sur WhatsApp' };
        }

        // Try to find and click the send button
        const sent = await page.evaluate(() => {
            // The send button
            const sendBtn = document.querySelector('[data-testid="send"]') ||
                           document.querySelector('button[aria-label="Send"]') ||
                           document.querySelector('button[aria-label="Envoyer"]') ||
                           document.querySelector('span[data-icon="send"]')?.closest('button');
            if (sendBtn) {
                sendBtn.click();
                return true;
            }
            return false;
        }).catch(() => false);

        if (!sent) {
            // Try pressing Enter in the message input as fallback
            const msgInput = await page.$('[data-testid="conversation-compose-box-input"]') ||
                            await page.$('div[contenteditable="true"][data-tab="10"]') ||
                            await page.$('footer div[contenteditable="true"]');
            if (msgInput) {
                await msgInput.press('Enter');
                console.log(`[${sessionId}] Sent via Enter key`);
            } else {
                await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
                return { success: false, error: 'Impossible de trouver le champ de saisie' };
            }
        }

        await page.waitForTimeout(2000);

        // Verify message was sent (check for delivery tick)
        const delivered = await page.evaluate(() => {
            const ticks = document.querySelectorAll('[data-icon="msg-check"], [data-icon="msg-dblcheck"], [data-testid="msg-check"], [data-testid="msg-dblcheck"]');
            return ticks.length > 0;
        }).catch(() => false);

        console.log(`[${sessionId}] Message ${delivered ? 'delivered' : 'sent (pending delivery)'}`);

        // Navigate back to main WhatsApp Web page
        await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });

        return { success: true, delivered, method: 'whatsapp_web' };
    } catch (err) {
        console.error(`[${sessionId}] Send error:`, err.message);
        // Try to recover by going back to main page
        try {
            await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        } catch (e) {}
        return { success: false, error: err.message };
    }
}

app.post('/send', async (req, res) => {
    const { sessionId, phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).json({ error: 'phone et message requis' });
    }

    // Try Cloud API first
    const cloudConfig = cloudApiConfigs.get(sessionId);
    if (cloudConfig) {
        try {
            const response = await axios.post(
                `https://graph.facebook.com/v18.0/${cloudConfig.phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to: phone.replace(/[^0-9]/g, ''),
                    type: 'text',
                    text: { body: message }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${cloudConfig.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );
            return res.json({ success: true, messageId: response.data.messages?.[0]?.id, method: 'cloud_api' });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    // Fallback to WhatsApp Web (Playwright)
    const session = browserSessions.get(sessionId);
    if (session) {
        try {
            const result = await sendViaWhatsAppWeb(sessionId, phone, message);
            return res.json(result);
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    res.status(400).json({ success: false, error: 'Aucune session active. Connectez d\'abord WhatsApp.' });
});

app.post('/session/:sessionId/disconnect', async (req, res) => {
    const { sessionId } = req.params;

    cloudApiConfigs.delete(sessionId);
    await closeSession(sessionId);

    const sessionDir = path.join(SESSIONS_DIR, sessionId);
    if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
    }

    res.json({ success: true });
});

// Check connection status — called on-demand by user clicking "Numéro connecté"
app.post('/session/:sessionId/check-connection', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const result = await checkConnection(sessionId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ status: 'error', connected: false, error: err.message });
    }
});

app.post('/session/:sessionId/confirm-pairing', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const result = await checkConnection(sessionId);
        res.json({ success: result.status === 'ready', ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`WhatsApp Web Scraper running on port ${PORT}`);
    console.log(`Browser: ${BROWSER_PATH} (exists: ${fs.existsSync(BROWSER_PATH)})`);
    console.log(`Mode: Autonomous page — no polling`);
    console.log(`Sessions dir: ${SESSIONS_DIR}`);
});

process.on('SIGINT', async () => {
    console.log('Shutting down...');
    for (const [sessionId] of browserSessions) {
        await closeSession(sessionId);
    }
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
});
