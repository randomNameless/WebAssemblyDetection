const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Load URLs from urls.txt
const urlsFilePath = path.join(__dirname, 'urls.txt');
const outputFilePath = path.join(__dirname, 'output.txt');

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const urls = fs.readFileSync(urlsFilePath, 'utf8').split('\n').map(url => url.trim()).filter(url => url);

  for (const url of urls) {
    console.log(`Visiting URL: ${url}`);

    try {
      const page = await browser.newPage();
      let wasmSizeUnder1MB = false;

      // Listen to all network requests
      page.on('response', async (response) => {
        try {
          const requestUrl = response.url();

          // Skip redirects to avoid response body errors
          if (response.status() >= 300 && response.status() < 400) return;

          // Check if the request is directly loading a WebAssembly file
          if (requestUrl.endsWith('.wasm')) {
            const buffer = await response.buffer();
            const wasmSize = buffer.length;

            // Check if the WebAssembly file size is below 1MB
            if (wasmSize < 1048576) {
              wasmSizeUnder1MB = true;
              fs.appendFileSync(outputFilePath, `URL: ${url}\n`);
              fs.appendFileSync(outputFilePath, `  - WebAssembly loaded with size ${wasmSize} bytes (less than 1MB)\n`);
              console.log(`URL recorded: ${url} with WebAssembly size under 1MB`);
            }
          }
        } catch (err) {
          console.error(`Error processing response for ${response.url()}:`, err.message);
        }
      });

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      } catch (err) {
        console.error(`Error navigating to URL ${url}:`, err.message);
        continue; // Skip to the next URL on navigation error
      }

      await page.close();
    } catch (error) {
      console.error(`Error processing URL ${url}:`, error.message);
    }
  }

  await browser.close();
}

main().catch(console.error);

