const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const CONFIG = {
    headless: false,
    timeout: 30000,
    cookiesFile: './openrouter-session.json',
    targetUrl: 'https://openrouter.ai/chat',
    userDataDir: './browser-session',
    
    // Model selection - change this to switch models
    selectedModel: 'DeepSeek: Deepseek R1 0528 Qwen3 8B (free)', // Change this to your preferred model
    // Alternative models you can use:
    // selectedModel: 'OpenAI: GPT-4o',
    // selectedModel: 'Anthropic: Claude 3.5 Sonnet',
    // selectedModel: 'Google: Gemini Pro 1.5',
};

class OpenRouterAutoLogin {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    // Check if user is logged in by looking for avatar
    async isLoggedIn() {
        try {
            return await this.page.evaluate(() => {
                const avatarPicture = document.querySelector('picture.flex-shrink-0.overflow-hidden.rounded-full');
                const avatarImg = document.querySelector('img[src*="images.clerk.dev"]') || 
                                 document.querySelector('img[alt*="Avatar"]');
                return !!(avatarPicture && avatarImg);
            });
        } catch (error) {
            return false;
        }
    }

    // Save current session cookies
    async saveSession() {
        try {
            const cookies = await this.page.cookies();
            const sessionData = {
                timestamp: new Date().toISOString(),
                url: await this.page.url(),
                cookies: cookies,
                userAgent: await this.page.evaluate(() => navigator.userAgent)
            };
            
            await fs.writeFile(CONFIG.cookiesFile, JSON.stringify(sessionData, null, 2));
            return true;
        } catch (error) {
            return false;
        }
    }

    // Load and apply saved session
    async loadSession() {
        try {
            const sessionData = await fs.readFile(CONFIG.cookiesFile, 'utf8');
            const data = JSON.parse(sessionData);
            
            if (!data.cookies || data.cookies.length === 0) {
                return false;
            }

            await this.page.setCookie(...data.cookies);
            return true;
        } catch (error) {
            return false;
        }
    }

    // Initialize browser with persistent session
    async initBrowser() {
        try {
            await fs.mkdir(CONFIG.userDataDir, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }

        this.browser = await puppeteer.launch({
            headless: CONFIG.headless,
            userDataDir: CONFIG.userDataDir,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=VizDisplayCompositor'
            ]
        });

        this.page = await this.browser.newPage();
    }

    // Wait for manual login and detect success
    async waitForLogin() {
        console.log('🔐 Login required - please log in manually in the browser');
        
        return new Promise((resolve) => {
            const checkLogin = async () => {
                const loggedIn = await this.isLoggedIn();
                if (loggedIn) {
                    console.log('✅ Login successful!');
                    resolve(true);
                } else {
                    setTimeout(checkLogin, 2000);
                }
            };
            checkLogin();
        });
    }

    // Start component change monitoring (minimal logging)
    async startMonitoring() {
        await this.page.evaluate(() => {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                const classes = node.className || '';
                                
                                // Detect new chat messages/responses
                                if (classes.includes('max-w-3xl') && classes.includes('rounded-lg') ||
                                    classes.includes('prose-slate') ||
                                    node.tagName === 'P' && node.closest('[class*="prose"]')) {
                                    
                                    // Extract and log response text
                                    const textContent = node.textContent || '';
                                    if (textContent.trim().length > 10) { // Only log substantial content
                                        console.log('🔄 New message detected:', textContent.slice(0, 100) + (textContent.length > 100 ? '...' : ''));
                                    }
                                }
                            }
                        });
                    }
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
    }

    // Post-login actions: Click "Add model" button and select configured model
    async performPostLoginActions() {
        try {
            // Wait for page to stabilize
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Step 1: Find and click "Add model" button
            let addModelButton = null;
            
            // Try XPath first
            try {
                const xpath = "//button[contains(., 'Add model')]";
                await this.page.waitForXPath(xpath, { timeout: 5000 });
                const elements = await this.page.$x(xpath);
                if (elements.length > 0) {
                    addModelButton = elements[0];
                }
            } catch (e) {
                // Try alternative method
                addModelButton = await this.page.evaluateHandle(() => {
                    const buttons = document.querySelectorAll('button');
                    for (const button of buttons) {
                        if (button.textContent && button.textContent.includes('Add model')) {
                            return button;
                        }
                    }
                    return null;
                });
                
                if (!addModelButton || !(await addModelButton.asElement())) {
                    addModelButton = null;
                }
            }
            
            if (addModelButton && await addModelButton.asElement()) {
                await addModelButton.asElement().click();
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Step 2: Find and select the configured model
                let modelOption = null;
                
                // Wait for command items to appear
                try {
                    await this.page.waitForSelector('[cmdk-item]', { timeout: 5000 });
                } catch (e) {
                    // Continue anyway
                }
                
                // Look for the specific model
                modelOption = await this.page.evaluateHandle((selectedModel) => {
                    const options = document.querySelectorAll('[cmdk-item], [role="option"], .option');
                    for (const option of options) {
                        const text = option.textContent || '';
                        if (text.includes(selectedModel)) {
                            return option;
                        }
                    }
                    return null;
                }, CONFIG.selectedModel);
                
                if (modelOption && await modelOption.asElement()) {
                    await modelOption.asElement().click();
                    console.log(`✅ Model selected: ${CONFIG.selectedModel}`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    console.log(`❌ Model selection required - "${CONFIG.selectedModel}" not found`);
                    
                    // Show available models for user reference
                    const availableModels = await this.page.evaluate(() => {
                        const options = document.querySelectorAll('[cmdk-item], [role="option"]');
                        return Array.from(options).map(opt => opt.textContent?.trim()).filter(Boolean).slice(0, 10);
                    });
                    
                    if (availableModels.length > 0) {
                        console.log('Available models:', availableModels.join(', '));
                    }
                }
                
            } else {
                console.log('❌ Model selection required - "Add model" button not found');
            }
            
        } catch (error) {
            console.log('❌ Model selection failed');
        }
    }

    // Send a test message to verify chat functionality
    async sendTestMessage(message = "Hello! Testing the chat functionality.") {
        try {
            console.log('💬 Sending test message...');
            
            // Wait for chat interface to be ready
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Find the textarea by name attribute
            let chatInput = await this.page.$('textarea[name="Chat Input"]');
            
            // If not found, try by placeholder
            if (!chatInput) {
                chatInput = await this.page.$('textarea[placeholder*="Start a message"]');
            }
            
            // If still not found, try more generic approach
            if (!chatInput) {
                chatInput = await this.page.evaluateHandle(() => {
                    const textareas = document.querySelectorAll('textarea');
                    for (const textarea of textareas) {
                        if (textarea.placeholder && 
                            (textarea.placeholder.includes('message') || 
                             textarea.placeholder.includes('chat') ||
                             textarea.name === 'Chat Input')) {
                            return textarea;
                        }
                    }
                    return null;
                });
                
                if (!chatInput || !(await chatInput.asElement())) {
                    chatInput = null;
                }
            }
            
            if (chatInput) {
                // Click on the textarea to focus it
                await chatInput.click();
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Type the message
                await chatInput.type(message);
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Find and click the send button
                let sendButton = null;
                
                // Strategy 1: Look for send button with common patterns
                const sendSelectors = [
                    'button[aria-label*="send" i]',
                    'button[title*="send" i]',
                    'button:has(svg[data-icon="send"])',
                    'button[type="submit"]'
                ];
                
                for (const selector of sendSelectors) {
                    try {
                        sendButton = await this.page.$(selector);
                        if (sendButton) break;
                    } catch (e) {
                        continue;
                    }
                }
                
                // Strategy 2: Look for button near the textarea
                if (!sendButton) {
                    sendButton = await this.page.evaluateHandle(() => {
                        const textarea = document.querySelector('textarea[name="Chat Input"]') || 
                                        document.querySelector('textarea[placeholder*="Start a message"]');
                        if (textarea) {
                            // Look for buttons in the same container
                            const container = textarea.closest('div');
                            if (container) {
                                const buttons = container.querySelectorAll('button');
                                for (const button of buttons) {
                                    // Look for send-related attributes or icons
                                    if (button.getAttribute('aria-label')?.toLowerCase().includes('send') ||
                                        button.getAttribute('title')?.toLowerCase().includes('send') ||
                                        button.querySelector('svg') ||
                                        button.type === 'submit') {
                                        return button;
                                    }
                                }
                            }
                        }
                        return null;
                    });
                    
                    if (!sendButton || !(await sendButton.asElement())) {
                        sendButton = null;
                    }
                }
                
                // Strategy 3: Try keyboard shortcut (Enter)
                if (!sendButton) {
                    console.log('📤 Sending message with Enter key...');
                    await this.page.keyboard.press('Enter');
                } else {
                    console.log('📤 Clicking send button...');
                    await sendButton.click();
                }
                
                console.log(`✅ Message sent: "${message}"`);
                
                // Wait for and capture the response
                await this.waitForResponse();
                
                return true;
                
            } else {
                console.log('❌ Chat input not found');
                return false;
            }
            
        } catch (error) {
            console.log('❌ Failed to send message:', error.message);
            return false;
        }
    }

    // Wait for and capture AI response
    async waitForResponse() {
        try {
            console.log('⏳ Waiting for AI response...');
            
            // Wait for response to appear (up to 30 seconds)
            const responseFound = await this.page.waitForFunction(() => {
                // Look for response messages with the specific structure
                const responseSelectors = [
                    '.max-w-3xl.py-3.pl-4.pr-4.rounded-lg.rounded-tl-none',
                    '.prose-slate p',
                    '[class*="prose"] p'
                ];
                
                for (const selector of responseSelectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        // Check if any element has recent content
                        for (const element of elements) {
                            if (element.textContent && element.textContent.trim().length > 0) {
                                return true;
                            }
                        }
                    }
                }
                return false;
            }, { timeout: 30000 });
            
            if (responseFound) {
                // Extract and print the response
                const responses = await this.page.evaluate(() => {
                    const responseMessages = [];
                    
                    // Strategy 1: Look for the specific response structure
                    const responseContainers = document.querySelectorAll('.max-w-3xl.py-3.pl-4.pr-4.rounded-lg.rounded-tl-none');
                    for (const container of responseContainers) {
                        const textElement = container.querySelector('p');
                        if (textElement && textElement.textContent) {
                            responseMessages.push({
                                text: textElement.textContent.trim(),
                                method: 'specific-selector'
                            });
                        }
                    }
                    
                    // Strategy 2: Look for prose paragraphs (fallback)
                    if (responseMessages.length === 0) {
                        const proseElements = document.querySelectorAll('.prose-slate p, [class*="prose"] p');
                        for (const element of proseElements) {
                            if (element.textContent && element.textContent.trim().length > 0) {
                                responseMessages.push({
                                    text: element.textContent.trim(),
                                    method: 'prose-selector'
                                });
                            }
                        }
                    }
                    
                    // Return the latest/last response
                    return responseMessages.length > 0 ? responseMessages[responseMessages.length - 1] : null;
                });
                
                if (responses && responses.text) {
                    console.log('🤖 AI Response:');
                    console.log('─'.repeat(50));
                    console.log(responses.text);
                    console.log('─'.repeat(50));
                } else {
                    console.log('⚠️ Response detected but could not extract text');
                }
            } else {
                console.log('⏱️ No response received within timeout');
            }
            
        } catch (error) {
            console.log('❌ Error waiting for response:', error.message);
        }
    }

    // Main execution flow
    async run() {
        try {
            await this.initBrowser();
            const sessionLoaded = await this.loadSession();
            
            await this.page.goto(CONFIG.targetUrl, { 
                waitUntil: 'networkidle2',
                timeout: CONFIG.timeout 
            });

            await new Promise(resolve => setTimeout(resolve, 3000));
            const alreadyLoggedIn = await this.isLoggedIn();

            if (alreadyLoggedIn) {
                console.log('✅ Automatic login successful');
                await this.saveSession();
                await this.performPostLoginActions();
                
                // Send a test message after model selection
                await this.sendTestMessage();
                
            } else {
                if (sessionLoaded) {
                    try {
                        await fs.unlink(CONFIG.cookiesFile);
                    } catch (e) {}
                }

                await this.waitForLogin();
                await this.saveSession();
                await this.performPostLoginActions();
                
                // Send a test message after model selection
                await this.sendTestMessage();
            }

            await this.startMonitoring();
            
            // Keep running silently
            await new Promise(() => {});

        } catch (error) {
            console.error('❌ Error:', error.message);
        } finally {
            if (this.browser) {
                await this.browser.close();
            }
        }
    }

    // Check session health (only when explicitly called)
    async checkSession() {
        try {
            const sessionData = await fs.readFile(CONFIG.cookiesFile, 'utf8');
            const data = JSON.parse(sessionData);
            
            const age = Math.floor((Date.now() - new Date(data.timestamp)) / (1000 * 60 * 60 * 24));
            const hasAuthCookies = data.cookies.some(c => 
                c.name.includes('session') || 
                c.name.includes('auth') || 
                c.name.includes('clerk')
            );
            
            console.log('Session Info:');
            console.log(`  Age: ${age} days`);
            console.log(`  Cookies: ${data.cookies.length}`);
            console.log(`  Auth cookies: ${hasAuthCookies ? 'Yes' : 'No'}`);
            
            return { age, hasAuthCookies, cookieCount: data.cookies.length };
        } catch (error) {
            console.log('❌ No session file found');
            return null;
        }
    }

    // Send custom message (for interactive use)
    async sendMessage(message) {
        return await this.sendTestMessage(message);
    }
}

// Utility functions
async function clearSession() {
    try {
        await fs.unlink(CONFIG.cookiesFile);
        await fs.rmdir(CONFIG.userDataDir, { recursive: true });
        console.log('🗑️ Session cleared');
    } catch (error) {
        console.log('ℹ️ No session to clear');
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down...');
    process.exit(0);
});

// Main execution
if (require.main === module) {
    const autoLogin = new OpenRouterAutoLogin();
    
    const args = process.argv.slice(2);
    if (args.includes('--clear')) {
        clearSession();
    } else if (args.includes('--check')) {
        autoLogin.checkSession();
    } else {
        autoLogin.run();
    }
}

module.exports = { OpenRouterAutoLogin, clearSession, CONFIG };

