const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Load URLs from urls.txt
const urlsFilePath = path.join(__dirname, 'urls.txt');
const outputFilePath = path.join(__dirname, 'output.txt');

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'], });
  const urls = fs.readFileSync(urlsFilePath, 'utf8').split('\n').map(url => url.trim()).filter(url => url);

  for (const url of urls) {
    console.log(`Visiting URL: ${url}`); // Log each visited URL
    fs.appendFileSync(outputFilePath, `Visiting URL: ${url}\n`); // Log to output file

    try {
      const page = await browser.newPage();
      let wasmLoaded = false;
      let wasmSizeUnder1MB = false;
      let jsWasmInitiated = false;
      let base64InJsFound = false; // Track if Base64 strings are found in JavaScript
      const base64Strings = new Map(); // Map to store unique base64 strings and their source URLs

      // Listen to all network requests
      page.on('response', async (response) => {
        try {
          const requestUrl = response.url();
          
          // Skip redirects to avoid response body errors
          if (response.status() >= 300 && response.status() < 400) return;

          // Check if the request is directly loading a WebAssembly file
          if (requestUrl.endsWith('.wasm')) {
            wasmLoaded = true;
            
            // Get the content length of the WebAssembly file
            const buffer = await response.buffer();
            const wasmSize = buffer.length;
            
            // Check if the WebAssembly file size is below 1MB
            if (wasmSize < 1048576) {
              wasmSizeUnder1MB = true;
              fs.appendFileSync(outputFilePath, `URL: ${url}\n`);
              fs.appendFileSync(outputFilePath, `  - WebAssembly loaded with size ${wasmSize} bytes (less than 1MB)\n`);
            }
          }

          // Check if the request is for a JavaScript file that may initiate WebAssembly
          if (requestUrl.endsWith('.js')) {
            const text = await response.text();
            
            // Check for WebAssembly initiation and Base64 strings
            if (text.includes('WebAssembly')) {
              jsWasmInitiated = true;
              const base64Regex = /[A-Za-z0-9+/]{100,}={0,2}/g; // Base64 strings longer than 100
              const matches = text.match(base64Regex);
              
              if (matches) {
                base64InJsFound = true; // Set flag if any Base64 string >100 is found
                matches.forEach(str => {
                  if (!base64Strings.has(str)) {
                    base64Strings.set(str, requestUrl); // Store the unique string and its source URL
                  }
                });
              }
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

      // If WebAssembly is loaded, or JS initiates it with Base64 strings
      if (wasmSizeUnder1MB || (jsWasmInitiated && base64InJsFound)) {
        fs.appendFileSync(outputFilePath, `Conditions met for URL: ${url}\n`);
        if (jsWasmInitiated) {
          fs.appendFileSync(outputFilePath, '  - WebAssembly initiated in JS file\n');
          if (base64InJsFound) {
            fs.appendFileSync(outputFilePath, '  - Unique Base64 strings (length > 100) found:\n');
            base64Strings.forEach((scriptUrl, base64) => {
              fs.appendFileSync(outputFilePath, `    Script URL: ${scriptUrl}\n`);
              fs.appendFileSync(outputFilePath, `    Base64: ${base64}\n`);
            });
          }
        }
        fs.appendFileSync(outputFilePath, '\n');
        console.log(`Conditions met for URL: ${url}`);
      }

      await page.close();
    } catch (error) {
      console.error(`Error processing URL ${url}:`, error.message);
    }
  }

  await browser.close();
}

main().catch(console.error);


