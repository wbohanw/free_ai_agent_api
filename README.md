# OpenRouter Chat Automation

This script automates interaction with the OpenRouter chat page. It opens the page, inputs "helloworld" in the chat input box, and sends the message.

## Features

- Automatically navigates to https://openrouter.ai/chat?
- Finds the chat input box using multiple selector strategies
- Types "helloworld" into the input
- Automatically clicks the send button or uses Enter key as fallback
- Provides detailed console logging for debugging
- Handles various UI patterns commonly found in chat interfaces

## Prerequisites

- Node.js (version 14 or higher)
- npm (comes with Node.js)

## Installation

1. Install dependencies:
```bash
npm install
```

This will install Puppeteer, which includes a bundled version of Chromium.

## Usage

### Method 1: Using npm script
```bash
npm start
```

### Method 2: Direct execution
```bash
node openrouter-automation.js
```

## Configuration

### Headless Mode
By default, the script runs with the browser visible (`headless: false`). To run without showing the browser window, edit `openrouter-automation.js` and change:

```javascript
headless: false, // Change to true for headless mode
```

### Timeouts and Delays
You can adjust various timeouts in the script:
- Page load timeout: `timeout: 30000` (30 seconds)
- Element wait timeout: `timeout: 2000` (2 seconds per selector)
- General delays: `await page.waitForTimeout(3000)` (3 seconds)

## How It Works

1. **Browser Launch**: Starts a Chromium browser instance
2. **Navigation**: Goes to the OpenRouter chat page
3. **Element Detection**: Uses multiple strategies to find the chat input:
   - Standard textarea selectors
   - Input elements with message-related placeholders
   - Contenteditable elements
   - Elements with chat-related CSS classes
   - Fallback to any focusable elements
4. **Input**: Types "helloworld" into the detected input field
5. **Send**: Attempts to find and click the send button using various strategies:
   - Submit buttons
   - Buttons with "Send" text
   - Buttons with send-related ARIA labels
   - Icon buttons (paper plane, etc.)
   - Fallback to Enter key
6. **Cleanup**: Waits briefly to see results, then closes the browser

## Troubleshooting

### Common Issues

1. **"Input element not found"**: The script includes debugging output that will show available input elements on the page. This helps identify the correct selectors.

2. **"Send button not found"**: The script will fallback to using the Enter key if no send button is detected.

3. **Page load timeout**: If the page takes longer than 30 seconds to load, increase the timeout value.

4. **Network issues**: Ensure you have a stable internet connection.

### Debug Mode

The script includes extensive logging. Watch the console output to see:
- Which selectors successfully found elements
- Available input elements on the page
- Page title and structure information

## Files

- `openrouter-automation.js` - Main automation script
- `package.json` - Node.js dependencies and scripts
- `open_openrouter.sh` - Original shell script for opening the page
- `README.md` - This documentation

## Security Note

This script automates browser interaction with OpenRouter. Make sure you comply with OpenRouter's terms of service and use this responsibly. The script does not store or transmit any credentials or personal information.

## License

MIT License 