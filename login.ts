import 'dotenv/config';
import puppeteer, { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import os from 'os';

const userDataPath: string = process.env.USER_DATA_PATH || path.resolve(__dirname, 'user-data');
const preferencesPath: string = `${userDataPath}/Default/Preferences`;

const executablePath: string = os.platform() === 'win32' 
    ? 'C:\\Program Files (x86)\\Microsoft\\Edge Dev\\Application\\msedge.exe'
    : '/usr/bin/chromium-browser';

async function updatePreferences(): Promise<void> {
    if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
    }
    
    _log("Checking for Preferences file...");
    
    if (!fs.existsSync(preferencesPath)) {
        console.error("Preferences file still does not exist. Skipping update.");
        return;
    }

    let preferences: Record<string, any> = {};
    try {
        preferences = JSON.parse(fs.readFileSync(preferencesPath, 'utf8'));
    } catch (error) {
        console.error("Error reading Preferences file:", error);
    }

    preferences.profile = {
        ...preferences.profile,
        password_manager_leak_detection: false,
        password_manager_enabled: false
    };
    preferences.credentials_enable_service = false;
    preferences.credentials_enable_autosignin = false;
    
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
    webapp: { url: 'https://activ.rfs.nsw.gov.au/webapp' },
    dashboard: { url: 'https://activ.rfs.nsw.gov.au/webapp/dashboard' }
};

const browserArgs: string[] = [
    '--no-sandbox',
    '--disable-password-manager',
    '--disable-save-password-bubble',
    '--suppress-message-center-popups',
    '--hide-crash-restore-bubble',
    '--disable-setuid-sandbox',
    '--start-fullscreen',
    '--disable-notifications',
    '--disable-infobars',
    '--disable-autofill-profile-save',
    '--disable-translate',
    '--disable-sync',
    '--disable-extensions',
    '--password-store=basic',
    '--use-mock-keychain'
];

async function loginToRFSActiv(): Promise<void> {
    try {
        const browser: Browser = await puppeteer.launch({
            headless: false,
            executablePath,
            userDataDir: userDataPath,
            args: browserArgs,
            defaultViewport: null,
            ignoreDefaultArgs: ['--enable-automation']
        });

        const page: Page = await browser.newPage();
        await page.keyboard.press('F11');

        const openPages = await browser.pages();
        if (openPages.length > 1) await openPages[0].close();

        let loginAttempts = 0;
        const maxLoginAttempts = 5;
        const retryDelay = 5000;

        while (loginAttempts < maxLoginAttempts) {
            try {
                await page.goto(pages.login.url, { waitUntil: 'networkidle2' });

                if (await page.$(pages.login.username)) {
                    _log("Login form detected. Logging in...");
                    await page.waitForSelector(pages.login.username, { visible: true, timeout: 10000 });
                    await page.type(pages.login.username, process.env.USERNAME || '');

                    const rememberMeCheckbox = await page.$(pages.login.rememberMe);
                    if (rememberMeCheckbox) await rememberMeCheckbox.click();

                    await page.waitForSelector(pages.login.nextButton, { visible: true, timeout: 5000 });
                    await page.click(pages.login.nextButton);
                    await page.waitForSelector(pages.login.password, { visible: true, timeout: 10000 });
                    await page.type(pages.login.password, process.env.PASSWORD || '');

                    await page.waitForSelector(pages.login.verifyButton, { visible: true, timeout: 5000 });
                    await page.click(pages.login.verifyButton);

                    await page.waitForNavigation({ waitUntil: 'domcontentloaded' });

                    if (isloggedInPage(page)) {
                        _log("Login successful!");
                        break;
                    } else {
                        _log("Login failed. Retrying...");
                    }
                } else {
                    if (isloggedInPage(page)) {
                        _log("Login successful!");
                        break;
                    }

                    _log("Login form not detected. Retrying...");
                }
            } catch (error) {
                _log(`Login attempt ${loginAttempts + 1} failed. Retrying in ${retryDelay / 1000} seconds...`);
            }
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            loginAttempts++;
        }

        if (loginAttempts === maxLoginAttempts) {
            throw new Error("Max login attempts reached. Unable to login.");
        }

        let navigationAttempts = 0;
        const maxNavigationAttempts = 5;

        while (navigationAttempts < maxNavigationAttempts) {
            try {
                _log("Navigating to dashboard...");
                await page.goto(pages.dashboard.url, { waitUntil: 'networkidle0' });

                if (page.url().includes(pages.dashboard.url)) {
                    _log("Dashboard loaded.");
                    break;
                }
            } catch (error) {
                _log(`Navigation attempt ${navigationAttempts + 1} failed. Retrying in ${retryDelay / 1000} seconds...`);
            }
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            navigationAttempts++;
        }

        if (navigationAttempts === maxNavigationAttempts) {
            throw new Error("Max navigation attempts reached. Unable to navigate to dashboard.");
        }

        await page.evaluate(() => document.body.style.zoom = '1.25');
        setInterval(async () => {
            _log("Refreshing page...");
            await page.reload({ waitUntil: 'networkidle0' });
        }, 3600000 * 6);
    } catch (error) {
        console.error("Error during login:", error);
    }
}

function isloggedInPage(page: Page): boolean {
    if (page.url().includes(pages.dashboard.url) || page.url().includes(pages.webapp.url)) {
        return true;
    }

    return false;
}

function _log(msg: string): void {
    console.log(msg);
}

(async () => {
    await updatePreferences();
    await loginToRFSActiv();
})();