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
            console.log('⚠️ Error checking login status:', error.message);
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
            };
            
            await fs.writeFile(CONFIG.cookiesFile, JSON.stringify(sessionData, null, 2));
            console.log('💾 Session saved');
            return true;
        } catch (error) {
            console.log('⚠️ Failed to save session:', error.message);
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
            console.log('🔑 Session restored');
            return true;
        } catch (error) {
            console.log('ℹ️ No existing session found');
            return false;
        }
    }

    // Initialize browser with better error handling
    async initBrowser() {
        try {
            console.log('🌐 Launching browser...');
            
            // Create user data directory
            try {
                await fs.mkdir(CONFIG.userDataDir, { recursive: true });
            } catch (error) {
                // Directory might already exist, ignore
            }

            this.browser = await puppeteer.launch({
                headless: CONFIG.headless,
                userDataDir: CONFIG.userDataDir,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-features=VizDisplayCompositor'
                ],
                timeout: 30000 // Add timeout for browser launch
            });

            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1280, height: 720 });
            
            console.log('✅ Browser launched successfully');
            return true;
            
        } catch (error) {
            console.error('❌ Failed to launch browser:', error.message);
            throw error;
        }
    }

    // Wait for manual login with timeout
    async waitForLogin(timeoutMs = 300000) { // 5 minute timeout
        console.log('🔐 Login required - please log in manually in the browser');
        
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkLogin = async () => {
                try {
                    // Check timeout
                    if (Date.now() - startTime > timeoutMs) {
                        reject(new Error('Login timeout - please try again'));
                        return;
                    }
                    
                    const loggedIn = await this.isLoggedIn();
                    if (loggedIn) {
                        console.log('✅ Login successful!');
                        resolve(true);
                    } else {
                        setTimeout(checkLogin, 2000);
                    }
                } catch (error) {
                    console.log('⚠️ Error during login check:', error.message);
                    setTimeout(checkLogin, 2000);
                }
            };
            
            checkLogin();
        });
    }

    // Post-login actions with better error handling
    async performPostLoginActions() {
        try {
            console.log('🔧 Setting up model selection...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Try to find and click "Add model" button
            const addModelClicked = await this.clickAddModelButton();
            
            if (addModelClicked) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                await this.selectModel();
            } else {
                console.log('⚠️ Model selection skipped - button not found');
            }
            
        } catch (error) {
            console.log('⚠️ Post-login actions failed:', error.message);
        }
    }

    // Helper method to click "Add model" button
    async clickAddModelButton() {
        try {
            // Method 1: XPath
            try {
                const xpath = "//button[contains(., 'Add model')]";
                await this.page.waitForXPath(xpath, { timeout: 5000 });
                const elements = await this.page.$x(xpath);
                if (elements.length > 0) {
                    await elements[0].click();
                    return true;
                }
            } catch (e) {
                // Continue to method 2
            }
            
            // Method 2: Evaluate and find button
            const buttonFound = await this.page.evaluate(() => {
                const buttons = document.querySelectorAll('button');
                for (const button of buttons) {
                    if (button.textContent && button.textContent.includes('Add model')) {
                        button.click();
                        return true;
                    }
                }
                return false;
            });
            
            return buttonFound;
            
        } catch (error) {
            console.log('⚠️ Could not find Add model button:', error.message);
            return false;
        }
    }

    // Helper method to select model
    async selectModel() {
        try {
            // Wait for model options to appear
            try {
                await this.page.waitForSelector('[cmdk-item]', { timeout: 5000 });
            } catch (e) {
                console.log('⚠️ Model selector not found');
                return false;
            }
            
            // Try to find and click the selected model
            const modelSelected = await this.page.evaluate((selectedModel) => {
                const options = document.querySelectorAll('[cmdk-item], [role="option"], .option');
                for (const option of options) {
                    const text = option.textContent || '';
                    if (text.includes(selectedModel)) {
                        option.click();
                        return true;
                    }
                }
                return false;
            }, CONFIG.selectedModel);
            
            if (modelSelected) {
                console.log(`✅ Model selected: ${CONFIG.selectedModel}`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                return true;
            } else {
                console.log(`❌ Model "${CONFIG.selectedModel}" not found`);
                return false;
            }
            
        } catch (error) {
            console.log('⚠️ Model selection failed:', error.message);
            return false;
        }
    }

    // Send message with improved error handling
    async sendMessage(message) {
        try {
            if (!this.isReady) {
                throw new Error('Browser not ready. Please login first.');
            }
            
            console.log(`📤 Sending message: "${message}"`);
            
            // Find chat input
            const chatInput = await this.findChatInput();
            if (!chatInput) {
                throw new Error('Chat input not found');
            }
            
            // Clear and type message
            await chatInput.click();
            await new Promise(resolve => setTimeout(resolve, 500));
            
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('KeyA');
            await this.page.keyboard.up('Control');
            
            await chatInput.type(message);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Send message
            await this.page.keyboard.press('Enter');
            
            // Wait for response
            const response = await this.waitForStableResponse();
            console.log(`✅ Response received (${response.length} chars)`);
            
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

    // Helper method to find chat input
    async findChatInput() {
        // Try different selectors
        const selectors = [
            'textarea[name="Chat Input"]',
            'textarea[placeholder*="Start a message"]',
            'textarea[placeholder*="message"]'
        ];
        
        for (const selector of selectors) {
            try {
                const input = await this.page.$(selector);
                if (input) return input;
            } catch (e) {
                continue;
            }
        }
        
        // Last resort: find any textarea
        return await this.page.evaluateHandle(() => {
            const textareas = document.querySelectorAll('textarea');
            return textareas.length > 0 ? textareas[0] : null;
        });
    }

    // Wait for response to stabilize
    async waitForStableResponse(timeoutMs = 45000) {
        console.log('⏳ Waiting for AI response...');
        
        try {
            // Wait for loading animation to appear and disappear
            await this.page.waitForSelector('.animate-scale-pulse', { timeout: 10000 })
                .catch(() => console.log('⚠️ No loading animation detected'));
            
            await this.page.waitForFunction(() => {
                return document.querySelectorAll('.animate-scale-pulse').length === 0;
            }, { timeout: timeoutMs }).catch(() => console.log('⚠️ Loading animation timeout'));
            
        } catch (e) {
            console.log('⚠️ Loading detection failed, proceeding...');
        }
        
        // Wait for response to stabilize
        let lastResponse = '';
        let stableCount = 0;
        const requiredStableCycles = 5; // 1 second of stability (5 * 200ms)
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeoutMs) {
            try {
                const currentResponse = await this.page.evaluate(() => {
                    const responseSelectors = [
                        'div.max-w-3xl.bg-slate-3',
                        'div[class*="bg-slate-3"]'
                    ];
                    
                    let bestResponse = '';
                    
                    for (const selector of responseSelectors) {
                        const elements = document.querySelectorAll(selector);
                        for (const element of elements) {
                            if (element.querySelector('.animate-scale-pulse')) continue;
                            
                            const text = element.textContent?.trim() || '';
                            if (text.length > bestResponse.length) {
                                bestResponse = text;
                            }
                        }
                    }
                    
                    return bestResponse;
                });
                
                if (currentResponse && currentResponse.length > 10) {
                    if (currentResponse === lastResponse) {
                        stableCount++;
                        if (stableCount >= requiredStableCycles) {
                            console.log('✅ Response stabilized');
                            return currentResponse;
                        }
                    } else {
                        lastResponse = currentResponse;
                        stableCount = 0;
                    }
                }
                
            } catch (error) {
                console.log('⚠️ Response detection error:', error.message);
            }
            
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        return lastResponse || 'No response received';
    }

    // Initialize with better error handling and progress logging
    async initialize() {
        try {
            console.log('🚀 Starting initialization...');
            
            // Step 1: Launch browser
            await this.initBrowser();
            
            // Step 2: Load existing session
            const sessionLoaded = await this.loadSession();
            
            // Step 3: Navigate to OpenRouter
            console.log('📱 Navigating to OpenRouter...');
            await this.page.goto(CONFIG.targetUrl, { 
                waitUntil: 'networkidle2',
                timeout: CONFIG.timeout 
            });
            
            // Step 4: Check if already logged in
            await new Promise(resolve => setTimeout(resolve, 3000));
            const alreadyLoggedIn = await this.isLoggedIn();
            
            if (alreadyLoggedIn) {
                console.log('✅ Already logged in');
                await this.saveSession();
            } else {
                console.log('🔐 Login required');
                
                // Clear invalid session
                if (sessionLoaded) {
                    try {
                        await fs.unlink(CONFIG.cookiesFile);
                    } catch (e) {}
                }
                
                await this.waitForLogin();
                await this.saveSession();
            }
            
            // Step 5: Post-login setup
            await this.performPostLoginActions();
            
            this.isReady = true;
            console.log('✅ System ready!');
            
            return true;
            
        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
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
        try {
            if (this.browser) {
                await this.browser.close();
                console.log('👋 Browser closed');
            }
        } catch (error) {
            console.log('⚠️ Error during shutdown:', error.message);
        }
    }
}

// Create Express server
function createServer(openRouter) {
    const app = express();
    
    app.use(cors());
    app.use(express.json());
    
    // Test endpoint
    app.get('/test', (req, res) => {
        res.json({ 
            message: 'Server is working!',
            timestamp: new Date().toISOString()
        });
    });
    
    // Status endpoint
    app.get('/status', (req, res) => {
        res.json(openRouter.getStatus());
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
    
    return app;
}

// Main function with better error handling
async function main() {
    const openRouter = new OpenRouterAutoLogin();
    
    try {
        // Initialize the system
        await openRouter.initialize();
        
        // Start the server
        const app = createServer(openRouter);
        const server = app.listen(CONFIG.serverPort, () => {
            console.log(`🌐 Server running on http://localhost:${CONFIG.serverPort}`);
            console.log('📡 API Endpoints:');
            console.log(`  GET  /test   - Test connection`);
            console.log(`  GET  /status - Check status`);
            console.log(`  POST /send   - Send message`);
        });
        
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n🔄 Shutting down...');
            server.close();
            await openRouter.shutdown();
            process.exit(0);
        });
        
    } catch (error) {
        console.error('💥 Failed to start:', error.message);
        await openRouter.shutdown();
        process.exit(1);
    }
}

// Command line handling
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.includes('--server') || args.length === 0) {
        main().catch(console.error);
    } else if (args.includes('--clear')) {
        // Clear session function
        (async () => {
            try {
                await fs.unlink(CONFIG.cookiesFile);
                await fs.rmdir(CONFIG.userDataDir, { recursive: true });
                console.log('🗑️ Session cleared');
            } catch (error) {
                console.log('ℹ️ No session to clear');
            }
        })();
    } else {
        console.log('Usage:');
        console.log('  node server.js          # Start server');
        console.log('  node server.js --server # Start server');
        console.log('  node server.js --clear  # Clear session');
    }
}

module.exports = { OpenRouterAutoLogin, CONFIG };