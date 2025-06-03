const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const cors = require('cors');

// Configuration
const CONFIG = {
    headless: false,
    timeout: 30000,
    cookiesFile: './openrouter-session.json',
    targetUrl: 'https://openrouter.ai/chat',
    userDataDir: './browser-session',
    
    // Server configuration
    serverPort: 3000,
    
    // Model selection - change this to switch models
    selectedModel: 'DeepSeek: Deepseek R1 0528 Qwen3 8B (free)',
    // Alternative models you can use:
    // selectedModel: 'OpenAI: GPT-4o',
    // selectedModel: 'Anthropic: Claude 3.5 Sonnet',
    // selectedModel: 'Google: Gemini Pro 1.5',
};

class OpenRouterAutoLogin {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isReady = false;
        this.pendingResponses = new Map();
        this.responseCallbacks = new Map();
        this.lastResponseId = 0;
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

    // Enhanced monitoring with better response capture
    async startMonitoring() {
        await this.page.evaluate(() => {
            let messageCount = 0;
            
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                const classes = node.className || '';
                                const text = node.textContent || '';
                                
                                // Detect AI responses more broadly
                                if (classes.includes('max-w-3xl') || 
                                    classes.includes('prose') ||
                                    (node.tagName === 'P' && text.length > 20)) {
                                    
                                    if (text.trim().length > 10) {
                                        console.log('🔄 New content detected:', text.substring(0, 50) + '...');
                                        
                                        // Update the global response tracker
                                        window.lastAIResponse = {
                                            text: text.trim(),
                                            timestamp: Date.now(),
                                            messageCount: ++messageCount
                                        };
                                    }
                                }
                            }
                        });
                    }
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: false
            });
            
            // Initialize response tracking
            window.lastAIResponse = null;
            console.log('👀 Enhanced monitoring started');
        });
    }

    // Post-login actions: Click "Add model" button and select configured model
    async performPostLoginActions() {
        try {
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            let addModelButton = null;
            
            try {
                const xpath = "//button[contains(., 'Add model')]";
                await this.page.waitForXPath(xpath, { timeout: 5000 });
                const elements = await this.page.$x(xpath);
                if (elements.length > 0) {
                    addModelButton = elements[0];
                }
            } catch (e) {
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
                
                let modelOption = null;
                
                try {
                    await this.page.waitForSelector('[cmdk-item]', { timeout: 5000 });
                } catch (e) {
                    // Continue anyway
                }
                
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

    // Send message via API - IMPROVED VERSION
    async sendMessage(message) {
        try {
            if (!this.isReady) {
                throw new Error('Browser not ready. Please login first.');
            }
            
            console.log(`📤 Sending message: "${message}"`);
            
            // Get initial message count before sending
            const initialMessageCount = await this.page.evaluate(() => {
                window.lastAIResponse = null;
                const messages = document.querySelectorAll('.max-w-3xl');
                return messages.length;
            });
            
            // Find and use chat input
            let chatInput = await this.page.$('textarea[name="Chat Input"]');
            
            if (!chatInput) {
                chatInput = await this.page.$('textarea[placeholder*="Start a message"]');
            }
            
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
                    throw new Error('Chat input not found');
                }
            }
            
            // Clear existing text and type new message
            await chatInput.click();
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Select all and replace
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('KeyA');
            await this.page.keyboard.up('Control');
            
            await chatInput.type(message);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Send the message
            console.log('📨 Sending message...');
            await this.page.keyboard.press('Enter');
            
            // Wait for and capture response
            const response = await this.waitForLoadingAndResponse(initialMessageCount);
            console.log(`✅ Received response: "${response.substring(0, 100)}${response.length > 100 ? '...' : ''}"`);
            
            return {
                success: true,
                message: message,
                response: response
            };
            
        } catch (error) {
            console.error('❌ Send message failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // NEW: Wait for loading animation to disappear, then get complete response  
    async waitForLoadingAndResponse(initialMessageCount, timeoutMs = 60000) {
        const startTime = Date.now();
        console.log('⏳ Waiting for AI response...');
        
        // Step 1: Wait for loading indicator to appear and then disappear
        try {
            // First wait for loading animation to appear
            await this.page.waitForSelector('.animate-scale-pulse', { timeout: 10000 });
            console.log('🔄 Loading animation detected, waiting for it to finish...');
            
            // Then wait for it to disappear (response is ready)
            await this.page.waitForFunction(() => {
                const loadingElements = document.querySelectorAll('.animate-scale-pulse');
                return loadingElements.length === 0;
            }, { timeout: timeoutMs });
            
            console.log('✅ Loading animation finished!');
            
        } catch (e) {
            console.log('⚠️ Loading animation handling failed, trying direct response detection...');
        }
        
        // Step 2: Wait for response to appear and stabilize
        let lastResponse = '';
        let stableCount = 0;
        const stabilityThreshold = 1000; // 1 second of stability
        const pollInterval = 200; // Check every 200ms
        const requiredStableCycles = Math.ceil(stabilityThreshold / pollInterval); // 5 cycles
        
        console.log('📝 Waiting for response to stabilize...');
        
        const pollStartTime = Date.now();
        
        while (Date.now() - pollStartTime < timeoutMs) {
            try {
                // Get the latest AI response
                const currentResponse = await this.page.evaluate(() => {
                    // Find all potential AI response containers
                    const responseSelectors = [
                        'div.max-w-3xl.bg-slate-3',
                        'div[class*="bg-slate-3"]',
                        'div.max-w-3xl[class*="bg-slate"]'
                    ];
                    
                    let latestResponse = '';
                    let latestTimestamp = 0;
                    
                    for (const selector of responseSelectors) {
                        const elements = document.querySelectorAll(selector);
                        
                        for (const element of elements) {
                            // Skip if it contains loading animation
                            if (element.querySelector('.animate-scale-pulse')) {
                                continue;
                            }
                            
                            const text = element.textContent?.trim() || '';
                            if (text.length > 10) {
                                // Use DOM position as a rough timestamp indicator
                                const rect = element.getBoundingClientRect();
                                const pseudoTimestamp = rect.top + rect.left;
                                
                                if (text.length > latestResponse.length || pseudoTimestamp > latestTimestamp) {
                                    latestResponse = text;
                                    latestTimestamp = pseudoTimestamp;
                                }
                            }
                        }
                    }
                    
                    return latestResponse;
                });
                
                if (currentResponse && currentResponse.length > 10) {
                    if (currentResponse === lastResponse) {
                        // Response hasn't changed - increment stability counter
                        stableCount++;
                        console.log(`📊 Response stable for ${stableCount}/${requiredStableCycles} cycles`);
                        
                        if (stableCount >= requiredStableCycles) {
                            console.log('✅ Response fully stabilized!');
                            return currentResponse;
                        }
                    } else {
                        // Response changed - reset stability counter
                        console.log(`📝 Response updated: "${currentResponse.substring(0, 50)}${currentResponse.length > 50 ? '...' : ''}"`);
                        lastResponse = currentResponse;
                        stableCount = 0;
                    }
                } else if (currentResponse) {
                    // Found response but it's too short, keep waiting
                    console.log('⏳ Response too short, continuing to wait...');
                }
                
            } catch (error) {
                console.log('⚠️ Error during response detection:', error.message);
            }
            
            // Wait before next check
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
        
        // Timeout fallback
        if (lastResponse && lastResponse.length > 10) {
            console.log('⏰ Timeout reached, returning partial response');
            return lastResponse;
        }
        
        console.log('❌ No response captured within timeout');
        return 'No response received - please try again';
    }

    // Get available models
    async getAvailableModels() {
        try {
            const xpath = "//button[contains(., 'Add model')]";
            const elements = await this.page.$x(xpath);
            if (elements.length > 0) {
                await elements[0].click();
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const models = await this.page.evaluate(() => {
                    const options = document.querySelectorAll('[cmdk-item], [role="option"]');
                    return Array.from(options).map(opt => opt.textContent?.trim()).filter(Boolean);
                });
                
                // Close the dialog by pressing Escape
                await this.page.keyboard.press('Escape');
                
                return models;
            }
            
            return [];
        } catch (error) {
            return [];
        }
    }

    // Initialize the browser and login - FIXED VERSION
    async initialize() {
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
                this.isReady = true;
            } else {
                if (sessionLoaded) {
                    try {
                        await fs.unlink(CONFIG.cookiesFile);
                    } catch (e) {}
                }

                await this.waitForLogin();
                await this.saveSession();
                await this.performPostLoginActions();
                this.isReady = true;
            }

            await this.startMonitoring();
            console.log('🚀 OpenRouter API ready!');
            
            return true;
            
        } catch (error) {
            console.error('❌ Error during initialization:', error.message);
            throw error;
        }
    }

    // Get status
    getStatus() {
        return {
            ready: this.isReady,
            loggedIn: this.isReady,
            selectedModel: CONFIG.selectedModel
        };
    }

    // Clean shutdown
    async shutdown() {
        if (this.browser) {
            await this.browser.close();
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
}

// Express server setup
function createServer(openRouter) {
    const app = express();
    
    app.use(cors());
    app.use(express.json());
    
    // Status endpoint
    app.get('/status', (req, res) => {
        res.json(openRouter.getStatus());
    });
    
    // Test endpoint
    app.get('/test', (req, res) => {
        res.json({ message: 'Server is working!', timestamp: new Date().toISOString() });
    });
    
    // Send message endpoint
    app.post('/send', async (req, res) => {
        try {
            const { message } = req.body;
            
            if (!message) {
                return res.status(400).json({ error: 'Message is required' });
            }
            
            const result = await openRouter.sendMessage(message);
            res.json(result);
            
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    // Get available models
    app.get('/models', async (req, res) => {
        try {
            const models = await openRouter.getAvailableModels();
            res.json({ models });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    // Change model
    app.post('/model', async (req, res) => {
        try {
            const { model } = req.body;
            
            if (!model) {
                return res.status(400).json({ error: 'Model name is required' });
            }
            
            CONFIG.selectedModel = model;
            res.json({ success: true, message: `Model changed to: ${model}` });
            
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    // Debug endpoint to see page content
    app.get('/debug', async (req, res) => {
        try {
            const debugInfo = await openRouter.page.evaluate(() => {
                return {
                    url: window.location.href,
                    messageCount: document.querySelectorAll('.max-w-3xl').length,
                    textareas: document.querySelectorAll('textarea').length,
                    lastResponse: window.lastAIResponse,
                    sampleTexts: Array.from(document.querySelectorAll('p')).slice(0, 5).map(p => p.textContent?.substring(0, 100))
                };
            });
            
            res.json(debugInfo);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    // Health check
    app.get('/health', (req, res) => {
        res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });
    
    return app;
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

// Main execution - FIXED VERSION
async function main() {
    const openRouter = new OpenRouterAutoLogin();
    
    try {
        // Initialize OpenRouter (this replaces the old run() method)
        console.log('🚀 Starting OpenRouter automation...');
        await openRouter.initialize();
        
        // Start Express server AFTER initialization is complete
        const app = createServer(openRouter);
        const server = app.listen(CONFIG.serverPort, () => {
            console.log(`🌐 Server running on http://localhost:${CONFIG.serverPort}`);
            console.log('API Endpoints:');
            console.log(`  GET  /test       - Test connection`);
            console.log(`  GET  /status     - Check status`);
            console.log(`  POST /send       - Send message`);
            console.log(`  GET  /models     - Get available models`);
            console.log(`  POST /model      - Change model`);
            console.log(`  GET  /debug      - Debug page content`);
            console.log(`  GET  /health     - Health check`);
        });
        
        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n👋 Shutting down...');
            server.close();
            await openRouter.shutdown();
            process.exit(0);
        });
        
    } catch (error) {
        console.error('❌ Failed to start:', error.message);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down...');
    process.exit(0);
});

// Handle command line arguments
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.includes('--server')) {
        main();
    } else if (args.includes('--clear')) {
        clearSession();
    } else {
        console.log('Usage:');
        console.log('  node login-helper.js --server  # Start API server');
        console.log('  node login-helper.js --clear   # Clear saved session');
    }
}

module.exports = { OpenRouterAutoLogin, createServer, CONFIG };