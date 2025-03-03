/**
 * @file login.js
 * @description 
 * This script automates the login process to the RFS Activ dashboard using Puppeteer.
 * It launches a headless Chromium browser, navigates to the login page, fills in the credentials, 
 * and verifies successful authentication before redirecting to the dashboard.
 * 
 * Features:
 * - Checks for existing login sessions to avoid redundant logins.
 * - Updates Chrome preferences to disable password saving prompt.
 * - Handles navigation and error recovery.
 * - Runs in a virtual display (Xvfb) when executed as a systemd service.
 * 
 * Requirements:
 * - Node.js
 * - Puppeteer (`npm install puppeteer`)
 * - Xvfb (for running in a systemd service)
 * - dotenv (`npm install -g dotenv`)
 * 
 * Usage:
 * - Run manually: `node login.js`
 * - Run as a systemd service: `systemctl --user start activ-login`
 * 
 * @author Tom Grant <tomgrant1993@gmail.com>
 * @version 1.0
 */

require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');

const userDataPath = process.env.USER_DATA_PATH || path.resolve(__dirname, 'user-data');
const preferencesPath = `${userDataPath}/Default/Preferences`;

const executablePath = os.platform() === 'win32' 
    ? 'C:\\Program Files (x86)\\Microsoft\\Edge Dev\\Application\\msedge.exe'
    : '/usr/bin/chromium-browser';

// Function to update Preferences file
async function updatePreferences() {
    // Ensure userDataPath exists
    if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
    }
    
    _log("Checking for Preferences file...");
    
    if (!fs.existsSync(preferencesPath)) {
        console.error("Preferences file still does not exist. Skipping update.");
        return;
    }

    let preferences = {};
    try {
        preferences = JSON.parse(fs.readFileSync(preferencesPath, 'utf8'));
    } catch (error) {
        console.error("Error reading Preferences file:", error);
    }

    // Disable password prompts
    preferences.profile = {
        ...preferences.profile,
        password_manager_leak_detection: false,
        password_manager_enabled: false
    };
    preferences.credentials_enable_service = false;
    preferences.credentials_enable_autosignin = false;
    
    // preference restore session bubble
    preferences.session = preferences.session || {};
    preferences.session.restore_on_startup = 0;
    preferences.session.restore_on_startup_urls = [];

    try {
        fs.writeFileSync(preferencesPath, JSON.stringify(preferences, null, 2));
        _log("Updated Chrome preferences to disable password saving.");
    } catch (error) {
        console.error("Error writing Preferences file:", error);
    }
}

const pages = {
    login: {
        url: 'https://activ.rfs.nsw.gov.au/webapp/loginu',
        username: '#input28',
        password: '#input60',
        nextButton: 'input.button.button-primary[type="submit"][value="Next"]',
        verifyButton: 'input.button.button-primary[type="submit"][value="Verify"]',
        rememberMe: 'label[for="input36"]'
    },
    dashboard: {
        url: 'https://activ.rfs.nsw.gov.au/webapp/dashboard'
    }
}

const browserArgs = [
    '--no-sandbox',
    '--disable-password-manager',
    '--disable-save-password-bubble',
    '--suppress-message-center-popups',
    '--hide-crash-restore-bubble',
    '--disable-setuid-sandbox',
    '--start-fullscreen',
    '--disable-notifications',
    '--disable-prompt-on-repost',
    '--disable-infobars',
    '--disable-autofill-keyboard-accessory-view',
    '--disable-password-generation',
    '--disable-autofill-profile-save',
    '--disable-translate',
    '--disable-sync',
    '--disable-extensions',
    '--password-store=basic',
    '--use-mock-keychain',
    '--disable-features=AutofillServerCommunication',
    '--disable-features=AutofillEnableAccountWalletStorage',
    '--disable-features=PasswordManagerOnboarding',
    '--disable-component-extensions-with-background-pages',
    '--disable-background-networking'
];

async function loginToRFSActiv() {
    try {
        const browser = await puppeteer.launch({
            headless: false,
            executablePath: executablePath,
            userDataDir: userDataPath,
            args: browserArgs,
            defaultViewport: null,
            ignoreDefaultArgs: ['--enable-automation']
        });

        const page = await browser.newPage();
        await page.keyboard.press('F11');

        // Close any blank tabs that open
        const openPages = await browser.pages();
        if (openPages.length > 1) await openPages[0].close();

        // Navigate to login page
        await page.goto(pages.login.url, { waitUntil: 'networkidle2' });

        // Check if login page is detected
        if (await page.$(`${pages.login.username}, ${pages.login.password}`)) {
            _log("Login form detected. Logging in...");
            
            // Wait until the username field is visible before typing
            await page.waitForSelector(pages.login.username, { visible: true, timeout: 10000 });
            await page.focus(pages.login.username);
            await page.type(pages.login.username, process.env.USERNAME);
            _log("Username entered.");

            // Click 'Remember Me' if available
            const rememberMeCheckbox = await page.$(pages.login.rememberMe);
            if (rememberMeCheckbox) await rememberMeCheckbox.click();
            _log("Remember Me clicked.");

            // Click "Next" and wait for the password field
            await page.waitForSelector(pages.login.nextButton, { visible: true, timeout: 5000 });
            await page.click(pages.login.nextButton);
            await page.waitForSelector(pages.login.password, { visible: true, timeout: 10000 });
            _log("Next clicked.");

            // Enter password and click "Verify"
            await page.type(pages.login.password, process.env.PASSWORD);
            await page.waitForSelector(pages.login.verifyButton, { visible: true, timeout: 5000 });
            await page.click(pages.login.verifyButton);
            _log("Password entered and attempting login.");

            // Wait for successful navigation before moving forward
            await page.waitForNavigation({ waitUntil: 'domcontentloaded' });

            _log("Login successful!");
        } else {
            _log("Already logged in. Skipping login process.");
        }

        // Ensure navigation to dashboard
        _log("Navigating to dashboard...");
        await page.goto(pages.dashboard.url, { waitUntil: 'networkidle0' });
        _log("Dashboard loaded.");

        // Zoom in for better readability
        await page.evaluate(() => document.body.style.zoom = '1.4');

        await page.goto(pages.dashboard.url, { waitUntil: 'networkidle0' });

        // Auto-refresh every 6 hours
        setInterval(async () => {
            _log("Refreshing page...");
            await page.reload({ waitUntil: 'networkidle0' });
        }, 3600000 * 6);

    } catch (error) {
        console.error("Error during login:", error);
    }
}

function _log(msg) {
    console.log(msg);
}

async function mannuallyUpdatePasswordManager(page){
     // Disable password saving settings directly in the browser if needed
     await page.evaluate(() => {
        try {
            window.localStorage.setItem('credentials_enable_service', false);
            window.localStorage.setItem('profile.password_manager_enabled', false);
        } catch (e) {
            console.error(e);
        }
    });
    
    // Try disabling it manually
    await page.evaluate(() => {
        window.chrome && window.chrome.passwords && window.chrome.passwords.disableAutoSave && window.chrome.passwords.disableAutoSave();
    });

    // Intercept requests to block the password manager
    await page.setRequestInterception(true);
    page.on('request', async (request) => {
        try {
            if (request.url().includes('chrome://password-manager')) {
                _log('Blocking password manager request');
                await request.abort();
            } else {
                await request.continue();
            }
        } catch (error) {
            console.error("Request interception error:", error);
            await request.continue();
        }
    });
}

(async () => {
    // await updatePreferences(); // Modify Preferences file
    await loginToRFSActiv(); // Start Puppeteer
})();
