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

const userDataPath = '/home/hill-top/Documents/chrome';
const preferencesPath = `${userDataPath}/Default/Preferences`;



// Function to update Preferences file
async function updatePreferences() {
    // Ensure userDataPath exists
    if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
    }
    
    console.log("Checking for Preferences file...");
    
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
        console.log("Updated Chrome preferences to disable password saving.");
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
        verifyButton: 'input.button.button-primary[type="submit"][value="Verify"]'
    },
    dashboard: {
        url: 'https://activ.rfs.nsw.gov.au/webapp/dashboard'
    }
}

async function loginToRFSActiv() {
    try {
        const browser = await puppeteer.launch({
                headless: false,
                executablePath: '/usr/bin/chromium-browser',
                userDataDir: userDataPath, // Ensures settings persist
                args: [
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
                ],
                defaultViewport: null,
                ignoreDefaultArgs: ['--enable-automation']
        });

        const page = await browser.newPage();
        // await updatePreferences();
        await page.keyboard.press('F11');

        // Close the first blank tab if it exists
        const pages = await browser.pages();
        if (pages.length > 1) {
            await pages[0].close();
        }

        // Navigate to the login page
        await page.goto(pages.login.url, { waitUntil: 'networkidle2' });

        // Check if login form exists
        const isLoginPage = await page.$('#input28, #input60') !== null;

        if (isLoginPage) {
            console.log("Login form detected. Proceeding with login...");

            const usernameFieldExists = await page.$(pages.login.username) !== null;

            if (usernameFieldExists) {
                await page.type(pages.login.username, process.env.USERNAME);

                const rememberMeCheckbox = await page.$('label[for="input36"]');
                if (rememberMeCheckbox) {
                    await page.click('label[for="input36"]');
                }

                // Ensure the "Next" button is clickable
                const nextButton = await page.$('input.button.button-primary[type="submit"][value="Next"]');
                if (nextButton) {
                    const box = await nextButton.boundingBox();
                    if (box) {
                        await nextButton.click();
                        console.log("Next button clicked!");
                    } else {
                        console.log("Next button is not clickable.");
                    }
                } else {
                    console.log("Next button not found.");
                }
            } else {
                console.log("Username field is prefilled, proceeding to password...");
            }

            // Wait for password field
            await page.waitForSelector(pages.login.password, { visible: true });

            // Enter password
            await page.type(pages.login.password, process.env.PASSWORD);

            // Click "Verify" button
            const verifyButtonSelector = 'input.button.button-primary[type="submit"][value="Verify"]';
            await page.waitForSelector(verifyButtonSelector, { visible: true, timeout: 5000 });

            const verifyButton = await page.$(verifyButtonSelector);
            if (verifyButton) {
                const box = await verifyButton.boundingBox();
                if (box) {
                    await verifyButton.click();
                    console.log("Verify button clicked!");
                } else {
                    console.log("Verify button is not clickable.");
                }
            } else {
                console.log("Verify button not found.");
            }

            // Wait for navigation after login
            await page.waitForNavigation({ waitUntil: 'networkidle0' });

            console.log('Logged in successfully');
        } else {
            console.log("User is already logged in. Skipping login process.");
            await page.waitForNavigation({ waitUntil: 'networkidle0' });
        }
		
        // Navigate to the dashboard
        await page.goto(pages.dashboard.url, { waitUntil: 'networkidle0' });

        console.log("Navigated to Dashboard.");
        
        await page.evaluate(() => document.body.style.zoom = 1.4  );
        
        // Refresh the page every 6 hours (21,600,000 milliseconds)
        setInterval(async () => {
            console.log("Refreshing page...");
            await page.reload({ waitUntil: 'networkidle0' });
        }, 21600000);

    } catch (error) {
        console.error('Error during login:', error);
    }
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
                console.log('Blocking password manager request');
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
    await updatePreferences(); // Modify Preferences file
    await loginToRFSActiv(); // Start Puppeteer
})();
