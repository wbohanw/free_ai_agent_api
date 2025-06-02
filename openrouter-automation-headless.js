const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const CONFIG = {
    headless: false,  // 后台运行，不显示浏览器
    message: 'helloworld',  // 要发送的消息
    timeout: 30000,  // 页面加载超时时间（毫秒）
    waitDelay: 2000,  // 等待延迟时间（毫秒）
    responseWaitTime: 10000,  // 等待AI回复的时间（毫秒）
    cookiesFile: './openrouter-cookies.json',  // Cookie保存文件
    maxLoginWaitMinutes: 10  // 最大等待登录时间（分钟）
};

// Helper function to wait for delay
const waitForDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Load cookies from file
async function loadCookies(page) {
    try {
        const cookiesString = await fs.readFile(CONFIG.cookiesFile, 'utf8');
        const cookies = JSON.parse(cookiesString);
        await page.setCookie(...cookies);
        console.log('🍪 已加载保存的登录信息');
        return true;
    } catch (error) {
        console.log('🍪 未找到保存的登录信息，需要手动登录');
        return false;
    }
}

// Save cookies to file
async function saveCookies(page) {
    try {
        const cookies = await page.cookies();
        await fs.writeFile(CONFIG.cookiesFile, JSON.stringify(cookies, null, 2));
        console.log('🍪 已保存登录信息到文件');
    } catch (error) {
        console.log('⚠️ 保存登录信息失败:', error.message);
    }
}

// Enhanced login status check
async function checkLoginStatus(page) {
    try {
        console.log('🔍 检查登录状态...');
        
        // Wait a bit for page to load
        await waitForDelay(2000);
        
        // Check for chat input (strong indicator of being logged in)
        const chatInput = await page.$('textarea[placeholder*="message"], textarea[placeholder*="Message"], textarea[placeholder*="Type"]');
        if (chatInput) {
            console.log('✅ 检测到聊天输入框 - 已登录');
            return true;
        }
        
        // Check for user profile indicators
        const profileSelectors = [
            'button[aria-label*="user"]',
            'button[aria-label*="profile"]',
            'img[alt*="avatar"]',
            'img[alt*="profile"]',
            '.user-avatar',
            '.profile-button',
            '[data-testid="user-menu"]'
        ];
        
        for (const selector of profileSelectors) {
            const element = await page.$(selector);
            if (element) {
                console.log(`✅ 检测到用户配置文件元素 - 已登录 (${selector})`);
                return true;
            }
        }
        
        // Check for login buttons (indicates not logged in)
        const loginSelectors = [
            'button:contains("Log in")',
            'button:contains("Sign in")',
            'button:contains("Login")',
            'a[href*="login"]',
            'a[href*="signin"]',
            '.login-btn',
            '.sign-in-btn'
        ];
        
        for (const selector of loginSelectors) {
            try {
                if (selector.includes(':contains')) {
                    const text = selector.split('"')[1];
                    const buttons = await page.$x(`//button[contains(text(), "${text}")]`);
                    if (buttons.length > 0) {
                        console.log(`❌ 检测到登录按钮 - 未登录 (${text})`);
                        return false;
                    }
                } else {
                    const element = await page.$(selector);
                    if (element) {
                        console.log(`❌ 检测到登录元素 - 未登录 (${selector})`);
                        return false;
                    }
                }
            } catch (error) {
                continue;
            }
        }
        
        // If we can't determine, assume not logged in
        console.log('❓ 无法确定登录状态，假设未登录');
        return false;
        
    } catch (error) {
        console.log('⚠️ 检查登录状态时出现错误:', error.message);
        return false;
    }
}

// Wait for manual login completion
async function waitForManualLogin(page) {
    console.log('\n' + '='.repeat(80));
    console.log('🔐 需要手动登录');
    console.log('='.repeat(80));
    console.log('💡 请在浏览器窗口中手动完成以下步骤：');
    console.log('   1. 点击登录按钮');
    console.log('   2. 输入您的账号和密码');
    console.log('   3. 完成任何额外的验证步骤');
    console.log('   4. 等待进入聊天页面');
    console.log('');
    console.log('⏳ 程序将自动检测登录完成并继续...');
    console.log('='.repeat(80) + '\n');
    
    let loginCompleted = false;
    let attempts = 0;
    const maxAttempts = CONFIG.maxLoginWaitMinutes * 60 / 5; // Check every 5 seconds
    
    while (!loginCompleted && attempts < maxAttempts) {
        attempts++;
        await waitForDelay(5000);
        
        // Check login status
        loginCompleted = await checkLoginStatus(page);
        
        if (!loginCompleted) {
            const totalSeconds = attempts * 5;
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            const remainingMinutes = CONFIG.maxLoginWaitMinutes - minutes;
            const remainingSeconds = 60 - seconds;
            
            console.log(`⏳ 等待手动登录... ${minutes}:${seconds.toString().padStart(2, '0')} (剩余约 ${remainingMinutes}:${remainingSeconds.toString().padStart(2, '0')})`);
        }
    }
    
    if (loginCompleted) {
        console.log('\n✅ 登录检测成功！');
        await saveCookies(page);
        console.log('🔄 刷新页面以确保登录状态...');
        await page.reload({ waitUntil: 'networkidle2' });
        await waitForDelay(CONFIG.waitDelay);
        return true;
    } else {
        console.log(`\n❌ 登录等待超时 (${CONFIG.maxLoginWaitMinutes}分钟)`);
        console.log('💡 请检查：');
        console.log('   - 网络连接是否正常');
        console.log('   - 是否成功完成登录');
        console.log('   - 浏览器是否显示聊天界面');
        return false;
    }
}

async function automateOpenRouterChat() {
    let browser;
    
    try {
        console.log('🚀 启动浏览器自动化（手动登录模式）...');
        
        // Launch browser (visible for manual login)
        browser = await puppeteer.launch({ 
            headless: CONFIG.headless,
            defaultViewport: { width: 1920, height: 1080 },
            args: [
                '--start-maximized',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });
        
        const page = await browser.newPage();
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Load saved cookies
        const cookiesLoaded = await loadCookies(page);
        
        console.log('🌐 正在导航到 OpenRouter 聊天页面...');
        await page.goto('https://openrouter.ai/chat?', { 
            waitUntil: 'networkidle2',
            timeout: CONFIG.timeout 
        });
        
        console.log('⏳ 页面已加载，检查登录状态...');
        await waitForDelay(CONFIG.waitDelay);
        
        // Check if already logged in
        const isLoggedIn = await checkLoginStatus(page);
        
        if (!isLoggedIn) {
            // Wait for manual login
            const loginSuccess = await waitForManualLogin(page);
            
            if (!loginSuccess) {
                console.log('❌ 登录过程失败或超时，程序结束');
                return;
            }
        } else {
            console.log('✅ 已经处于登录状态，继续执行...');
        }
        
        // Continue with chat automation
        console.log('\n🚀 开始聊天自动化...');
        await performChatAutomation(page);
        
    } catch (error) {
        console.error('❌ 自动化过程中出现错误:', error.message);
    } finally {
        if (browser) {
            console.log('🔒 5秒后关闭浏览器...');
            await waitForDelay(5000);
            await browser.close();
        }
    }
}

// Chat automation logic
async function performChatAutomation(page) {
    const inputSelectors = [
        'textarea[placeholder*="message"]',
        'textarea[placeholder*="Message"]',
        'textarea[placeholder*="Type"]',
        'input[type="text"]',
        'textarea',
        '[contenteditable="true"]',
        '.chat-input',
        '#message-input',
        '[data-testid="chat-input"]',
        '[role="textbox"]'
    ];
    
    let inputElement = null;
    let usedSelector = '';
    
    console.log('🔍 寻找聊天输入框...');
    
    // Try to find the input element
    for (const selector of inputSelectors) {
        try {
            await page.waitForSelector(selector, { timeout: 3000 });
            inputElement = await page.$(selector);
            if (inputElement) {
                usedSelector = selector;
                console.log(`✅ 找到输入框: ${selector}`);
                break;
            }
        } catch (error) {
            continue;
        }
    }
    
    if (!inputElement) {
        console.log('🔍 尝试备用方法寻找输入框...');
        const focusableElements = await page.$$('input, textarea, [contenteditable="true"], [role="textbox"]');
        if (focusableElements.length > 0) {
            inputElement = focusableElements[focusableElements.length - 1];
            console.log('✅ 使用备用方法找到输入框');
        }
    }
    
    if (inputElement) {
        console.log(`💬 正在输入消息: "${CONFIG.message}"`);
        
        // Focus and clear input
        await inputElement.click();
        await waitForDelay(500);
        
        // Clear existing content
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await waitForDelay(200);
        
        // Type the message
        await inputElement.type(CONFIG.message);
        await waitForDelay(500);
        
        console.log('🔍 寻找发送按钮...');
        
        // Send button selectors
        const sendButtonSelectors = [
            'button[type="submit"]',
            '[data-testid="send-button"]',
            'button[aria-label*="send"]',
            'button[aria-label*="Send"]',
            'button svg',
            'form button'
        ];
        
        let sendButton = null;
        
        for (const selector of sendButtonSelectors) {
            try {
                sendButton = await page.$(selector);
                if (sendButton) {
                    console.log(`✅ 找到发送按钮: ${selector}`);
                    break;
                }
            } catch (error) {
                continue;
            }
        }
        
        // Try to find by text
        if (!sendButton) {
            try {
                const buttons = await page.$x('//button[contains(text(), "Send") or contains(text(), "send")]');
                if (buttons.length > 0) {
                    sendButton = buttons[0];
                    console.log('✅ 通过文本找到发送按钮');
                }
            } catch (error) {
                // Continue
            }
        }
        
        if (sendButton) {
            console.log('📤 点击发送按钮...');
            await sendButton.click();
            console.log('✅ 消息发送成功！');
        } else {
            console.log('📤 未找到发送按钮，尝试Enter键...');
            await page.keyboard.press('Enter');
            console.log('✅ 使用Enter键发送消息');
        }
        
        // Wait for and capture response
        await captureAIResponse(page);
        
    } else {
        console.log('❌ 未找到聊天输入框');
        
        // Show debug info
        const pageTitle = await page.title();
        console.log(`页面标题: ${pageTitle}`);
        
        const url = page.url();
        console.log(`当前URL: ${url}`);
    }
}

// Function to capture AI response
async function captureAIResponse(page) {
    console.log('⏳ 等待AI回复...');
    await waitForDelay(3000);
    
    let attempts = 0;
    const maxAttempts = 6;
    let responseFound = false;
    
    while (attempts < maxAttempts && !responseFound) {
        attempts++;
        console.log(`🔍 尝试获取回复 (${attempts}/${maxAttempts})...`);
        
        try {
            // Look for AI response
            const messageSelectors = [
                '.message',
                '.chat-message',
                '[data-testid="message"]',
                '.prose',
                '.markdown',
                '.whitespace-pre-wrap',
                'p',
                'div'
            ];
            
            for (const selector of messageSelectors) {
                try {
                    const elements = await page.$$(selector);
                    if (elements.length > 1) {
                        const messages = await page.$$eval(selector, (elements) => {
                            return elements.map(el => {
                                const text = el.innerText || el.textContent || '';
                                return text.trim();
                            }).filter(text => text.length > 5 && text.length < 3000);
                        });
                        
                        // Look for AI response (not our sent message)
                        for (const msg of messages.reverse()) {
                            if (msg && 
                                msg !== CONFIG.message && 
                                !msg.includes(CONFIG.message) &&
                                msg.length > 10) {
                                
                                console.log('\n' + '='.repeat(80));
                                console.log('🤖 AI回复内容:');
                                console.log('='.repeat(80));
                                console.log(msg);
                                console.log('='.repeat(80) + '\n');
                                responseFound = true;
                                break;
                            }
                        }
                        
                        if (responseFound) break;
                    }
                } catch (error) {
                    continue;
                }
            }
            
            if (!responseFound && attempts < maxAttempts) {
                console.log(`⏳ 第${attempts}次未找到回复，继续等待...`);
                await waitForDelay(4000);
            }
            
        } catch (error) {
            console.log(`⚠️ 获取回复时出现错误: ${error.message}`);
            await waitForDelay(2000);
        }
    }
    
    if (!responseFound) {
        console.log('⚠️ 未能获取到AI回复，可能需要更长等待时间');
    }
    
    console.log('🎉 聊天自动化完成');
}

// 运行自动化脚本
console.log('🤖 OpenRouter 聊天自动化（手动登录模式）');
console.log(`📝 将发送消息: "${CONFIG.message}"`);
console.log(`🍪 Cookie文件: ${CONFIG.cookiesFile}`);
console.log(`⏰ 最大登录等待时间: ${CONFIG.maxLoginWaitMinutes}分钟`);
console.log('⚡ 开始执行...\n');

automateOpenRouterChat()
    .then(() => {
        console.log('\n✅ 自动化脚本执行完成');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ 脚本执行失败:', error.message);
        process.exit(1);
    }); 