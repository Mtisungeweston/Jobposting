const { chromium, firefox } = require('playwright');
const fs = require('fs');
const path = require('path');

// Max retries for navigation
const MAX_RETRIES = 3;

// Function to clear Playwright's cache directory
function clearPlaywrightCache() {
    const cacheDir = path.join(process.cwd(), 'playwright-cache');
    if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true });
        console.log('Playwright cache cleared.');
    }
}

// Function to log messages to a log file
function logToFile(message) {
    const logFilePath = path.join(process.cwd(), 'linkedin.log');
    fs.appendFileSync(logFilePath, `${new Date().toISOString()} - ${message}\n`);
    console.log(message);
}

// Function to add a delay in milliseconds
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const scrapeLinkedInJobs = async () => {
    const filePath = 'linkedin_detailed_jobs.json';
    let allJobDetails = [];

    // Load existing data or initialize empty array
    try {
        if (fs.existsSync(filePath)) {
            const existingData = fs.readFileSync(filePath, 'utf-8');
            allJobDetails = JSON.parse(existingData);
            logToFile('Existing job details loaded successfully.');
        }
    } catch (err) {
        logToFile(`Error reading or parsing JSON file: ${err.message}`);
        allJobDetails = [];
    }

    const countries = [

'Greenland',
'Seychelles',
'Trinidad and Tobago',
'Norway',
'Kuwait',
'Guam',
'Luxembourg',
'Iceland',
'United Kingdom',
'United States',
'Switzerland',
'Netherlands',
'Philippines',
'United Arab Emirates',
'India',
'Saudi Arabia',
'Ireland',
'New Zealand',
'Italy',
'Nigeria',
'Israel',
'Qatar',
'Portugal',
'Poland',
'Gibraltar',
'Greece',
'Grenada',
'Latvia',
'Lebanon',
'Lesotho',
'Liberia',
'Liechtenstein',
'Lithuania',
'Macau Sar China',
'Macedonia',
'Madagascar',
'Malawi',
'Malaysia',
'Maldives',
'South Korea',


    ];

    while (true) { // Loop forever over the countries list
        for (const country of countries) {
            clearPlaywrightCache();

            let retries = 0;
            let success = false;

            while (retries < MAX_RETRIES && !success) {
                const browser = await chromium.launch({
                    headless: true,
                    args: ['--no-sandbox'], // Add '--no-sandbox' for certain environments
                });

                const context = await browser.newContext({
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
                });

                const page = await context.newPage();
                const searchURL = `https://www.linkedin.com/jobs/search/?location=${encodeURIComponent(country)}`;

                try {
                    logToFile(`Navigating to LinkedIn jobs page for country: ${country}`);
                    await page.goto(searchURL, { waitUntil: 'domcontentloaded', timeout: 60000 });

                    // Handle "Sign in to view more jobs" modal
                    try {
                        const dismissButtonSelector = 'button.modal__dismiss';
                        if (await page.isVisible(dismissButtonSelector)) {
                            await page.click(dismissButtonSelector);
                            logToFile('Modal dismissed successfully.');
                        }
                    } catch (err) {
                        logToFile(`Error dismissing modal: ${err.message}`);
                    }

                    let jobLinks = [];
                    let filterApplied = false;

                    let filterError = false;

                    // Attempt to apply "Past 24 hours" filter
                    try {
                        const filterButtonSelector = 'button.filter-button';
                        const past24HoursSelector = 'label[for="f_TPR-3"]';
                        const doneButtonSelector = 'button.filter__submit-button';

                        await page.click(filterButtonSelector);
                        await page.waitForSelector(past24HoursSelector, { timeout: 5000 });
                        await page.click(past24HoursSelector);
                        await page.click(doneButtonSelector);
                        logToFile('"Past 24 hours" filter applied successfully.');
                        filterApplied = true;

                        // Fetch the first 10 job links after applying the filter
                        jobLinks = await page.$$eval('.base-card__full-link', links =>
                            links.slice(0, 10).map(link => ({
                                title: link.querySelector('.sr-only')?.textContent?.trim() || 'N/A',
                                link: link.href.replace(/^.*linkedin\.com/, 'https://www.linkedin.com') || 'N/A',
                            }))
                        );
                    } catch (err) {
                        logToFile(`Failed to apply "Past 24 hours" filter: ${err.message}`);
                        filterError = true;
                    }

                    // If filter failed or no job links are found after applying the filter, navigate again without any filter
                    if ((filterApplied && jobLinks.length === 0) || filterError) {
                        logToFile(`No job links found or filter failed for country: ${country}. Navigating again without filter...`);
                        await page.goto(searchURL, { waitUntil: 'domcontentloaded', timeout: 60000 });

                        // Fetch the first 10 job links without applying filters
                        jobLinks = await page.$$eval('.base-card__full-link', links =>
                            links.slice(0, 10).map(link => ({
                                title: link.querySelector('.sr-only')?.textContent?.trim() || 'N/A',
                                link: link.href.replace(/^.*linkedin\.com/, 'https://www.linkedin.com') || 'N/A',
                            }))
                        );
                    }

                    logToFile(`Found ${jobLinks.length} job links in ${country}. Proceeding to fetch job details...`);

                    for (const job of jobLinks) {
                        try {
                            // --- Use Firefox for job details ---
                            const jobBrowser = await firefox.launch({ headless: true });
                            const jobContext = await jobBrowser.newContext({
                                userAgent: context._options.userAgent,
                            });
                            const jobPage = await jobContext.newPage();
                            await jobPage.goto(job.link, { waitUntil: 'domcontentloaded', timeout: 60000 });

                            // Wait for the main job title to appear (or timeout after 10s)
                            await jobPage.waitForSelector('.top-card-layout__title, .topcard__title', { timeout: 15000 });

                            // Helper to safely extract text
                            async function safeText(selector) {
                                try {
                                    await jobPage.waitForSelector(selector, { timeout: 6000 });
                                    return await jobPage.$eval(selector, el => el.textContent?.trim() || 'N/A');
                                } catch {
                                    return 'N/A';
                                }
                            }

                            const title = await safeText('.top-card-layout__title') !== 'N/A'
                                ? await safeText('.top-card-layout__title')
                                : await safeText('.topcard__title');
                            const company = await safeText('.topcard__org-name-link');
                            const companyDescription = await safeText('.topcard__flavor-row');
                            const locationFull = await safeText('.topcard__flavor--bullet');
                            const jobDescription = await safeText('.show-more-less-html__markup');
                            const postedTime = await safeText('.posted-time-ago__text');

                            const location = locationFull.split(',')[0].trim();

                            // Fetch job category if available
                            let jobCategory = 'N/A';
                            try {
                                jobCategory = await jobPage.$$eval('.description__job-criteria-list li', items => {
                                    for (const li of items) {
                                        const label = li.querySelector('.description__job-criteria-subheader');
                                        if (label && /function/i.test(label.textContent)) {
                                            const value = li.querySelector('.description__job-criteria-text');
                                            return value ? value.textContent.trim() : 'N/A';
                                        }
                                    }
                                    return 'N/A';
                                });
                            } catch (e) {
                                // fallback: ignore if not found
                            }

                            const jobDetails = {
                                title,
                                company,
                                companyDescription,
                                location,
                                jobDescription,
                                link: job.link,
                                country,
                                postedTime,
                                jobCategory
                            };

                            allJobDetails.push(jobDetails);
                            fs.writeFileSync(filePath, JSON.stringify(allJobDetails, null, 2));
                            logToFile(`Details fetched and saved for job: ${job.title}`);
                            await jobPage.close();
                            await jobContext.close();
                            await jobBrowser.close();
                        } catch (err) {
                            logToFile(`Failed to fetch details for job: ${job.title}: ${err.message}`);
                        }
                    }

                    success = true;
                } catch (err) {
                    logToFile(`Error processing country: ${country}: ${err.message}`);
                    retries++;
                    if (retries < MAX_RETRIES) {
                        logToFile(`Retrying country ${country} (${retries}/${MAX_RETRIES})...`);
                    }
                } finally {
                    await browser.close();
                    logToFile(`Browser closed for country: ${country}`);
                }
            }

            if (!success) {
                logToFile(`Failed to process country ${country} after ${MAX_RETRIES} retries.`);
            }

            // Add a 20-second delay before processing the next country
            logToFile(`Waiting for 10 seconds before processing the next country...`);
            await delay(10000);
        }
        logToFile("Country list finished. Restarting from top...");
    }
};

scrapeLinkedInJobs().catch(err => {
    logToFile(`Error scraping LinkedIn jobs: ${err.message}`);
});
