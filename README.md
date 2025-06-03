# OpenRouter AI Chat Automation

Hacked OpenRouter API services via a REST API.
For learning and development ONLY

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Chrome/Chromium browser (for Puppeteer)

## 🛠️ Installation

1. **Clone or download the project into your project folder**
```bash
git clone
cd ai_api
```

2. **Install dependencies**
```bash
npm install puppeteer express cors
```

3. **Configure the model** (optional)
Edit `server.js` and change the `selectedModel` in the CONFIG section:
```javascript
selectedModel: 'DeepSeek: Deepseek R1 0528 Qwen3 8B (free)',
// Or choose from:
// selectedModel: 'OpenAI: GPT-4o',
// selectedModel: 'Anthropic: Claude 3.5 Sonnet',
// selectedModel: 'Google: Gemini Pro 1.5',
```

## 🎯 Usage

### Step 1: Start the Server

```bash
node server.js
```

The script will:
1. Launch a Chrome browser window
2. Navigate to OpenRouter.ai
3. Check if you're already logged in
4. If not logged in, wait for you to login manually
5. Save your login session as json cookie
6. Select your configured AI model
7. Start the API server on `http://localhost:3000`

### Step 2: Login (First Time User Only)

If you see `🔐 Login required - please log in manually in the browser`:
1. The browser window will open automatically
2. Login to OpenRouter.ai manually in that browser
3. Once logged in, the script will detect it automatically
4. Your session will be saved - no need to login again!

### Step 3: Use the API

Once you see `✅ System ready!` and `🌐 Server running on http://localhost:3000`, you can open a new terminal and start sending messages.

## 📡 API Endpoints

### GET `/test`
Test if the server is running.

**Example:**
```bash
curl http://localhost:3000/test
```

**Response:**
```json
{
  "message": "Server is working!",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

### GET `/status`
Check the system status.

**Example:**
```bash
curl http://localhost:3000/status
```

**Response:**
```json
{
  "ready": true,
  "loggedIn": true,
  "selectedModel": "DeepSeek: Deepseek R1 0528 Qwen3 8B (free)"
}
```

### POST `/send`
Send a message and get AI response.

**Example:**
```bash
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the capital of France?"}'
```

**Response:**
```json
{
  "success": true,
  "message": "What is the capital of France?",
  "response": "The capital of France is Paris. It is located in the north-central part of the country and serves as the political, economic, and cultural center of France."
}
```

## 💻 Programming Examples

### JavaScript/Node.js
```javascript
const axios = require('axios');

async function askAI(question) {
  try {
    const response = await axios.post('http://localhost:3000/send', {
      message: question
    });
    
    console.log('Question:', question);
    console.log('Answer:', response.data.response);
    return response.data.response;
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Usage
askAI("Explain quantum computing in simple terms");
```

### Python
```python
import requests
import json

def ask_ai(question):
    try:
        response = requests.post('http://localhost:3000/send', 
                               json={'message': question})
        
        if response.status_code == 200:
            result = response.json()
            print(f"Question: {question}")
            print(f"Answer: {result['response']}")
            return result['response']
        else:
            print(f"Error: {response.status_code}")
    except Exception as e:
        print(f"Error: {e}")

# Usage
ask_ai("What are the benefits of renewable energy?")
```

### cURL Examples
```bash
# Simple question
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello! How are you today?"}'

# Complex question
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{"message": "Write a Python function to calculate fibonacci numbers"}'

# Check status
curl http://localhost:3000/status
```

## ⚙️ Configuration

Edit the `CONFIG` object in `server.js`:

```javascript
const CONFIG = {
    headless: false,              // Set to true to run browser in background
    timeout: 30000,               // Timeout for operations (ms)
    serverPort: 3000,             // API server port
    selectedModel: 'DeepSeek: Deepseek R1 0528 Qwen3 8B (free)', // AI model
    cookiesFile: './openrouter-session.json',    // Session file location
    userDataDir: './browser-session',            // Browser data directory
};
```

## 🔧 Command Line Options

```bash
# Start the server (default)
node server.js
node server.js --server

# Clear saved session (logout)
node server.js --clear
```

## 🐛 Troubleshooting

### "Browser not ready" Error
- Make sure you've completed the login process
- Check if the browser window is still open
- Restart the script: `Ctrl+C` then `node server.js`

### "Login timeout" Error
- The script waited 5 minutes for login
- Restart and login faster, or increase timeout in code

### "Chat input not found" Error
- OpenRouter's interface may have changed
- Try refreshing the browser page manually
- Check if you're on the correct OpenRouter chat page

### "Model selection failed" Error
- The specified model might not be available
- Check available models on OpenRouter.ai
- Update the `selectedModel` in configuration

### Session Issues
```bash
# Clear session and start fresh
node server.js --clear
node server.js
```

### Port Already in Use
```bash
# Kill process using port 3000
lsof -ti:3000 | xargs kill -9
# Or change port in CONFIG.serverPort
```

## 📁 Files Created

- `openrouter-session.json` - Saved login session
- `browser-session/` - Browser profile data
- Both files/folders can be deleted to start fresh

## 🛡️ Security Notes

- Your login session is saved locally in `openrouter-session.json`
- The browser profile is saved in `browser-session/` folder
- No credentials are transmitted to external servers
- Session files contain authentication cookies - keep them secure

## 🔄 Updates

To update your session or change models:
1. Stop the server (`Ctrl+C`)
2. Edit configuration in `server.js`
3. Restart: `node server.js`

## 📝 Example Use Cases

- **Chatbots**: Build custom chatbots using OpenRouter models
- **Content generation**: Automate content creation workflows
- **Research**: Batch process questions for research
- **Education**: Create interactive learning tools
- **Development**: Integrate AI into your applications

## 🤝 Contributing

Feel free to submit issues, feature requests, or pull requests!

## 📄 License

MIT License - feel free to use in your projects.