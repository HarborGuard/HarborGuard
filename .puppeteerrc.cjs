const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Use system-installed Chromium in Docker
  skipDownload: process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD === 'true',

  // Cache directory for local development
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};