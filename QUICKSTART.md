# VortexDQ Quick Start Guide

Get up and running in **5 minutes**.

## Step 1: Install Dependencies (1 min)

**Windows:**
```powershell
npm install
```

**Mac/Linux:**
```bash
npm install
```

This downloads all required packages.

---

## Step 2: Add API Key (1 min) - OPTIONAL

You can use Ollama instead (offline, no key needed).

### Option A: Claude (Recommended)
1. Get key from: https://console.anthropic.com/
2. Create file `.env` in this folder:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### Option B: Use Ollama (Offline, Free)
1. Install from: https://ollama.ai
2. Run in terminal: `ollama serve`
3. No API key needed - system will auto-use Ollama

### Option C: Other Models
```
GEMINI_API_KEY=...
OPENAI_API_KEY=...
DEEPSEEK_API_KEY=...
```

---

## Step 3: Start Server (1 min)

**Windows:**
```powershell
npm start
```

Or double-click `start.bat`

**Mac/Linux:**
```bash
npm start
```

Or run: `bash start.sh`

You should see:
```
╔════════════════════════════════════════════╗
║  VortexDQ AI Controller - Ready             ║
╚════════════════════════════════════════════╝

🌐 Web UI:  http://127.0.0.1:7777
📡 WebSocket: ws://127.0.0.1:7777
🤖 Models: claude, ollama, ...
```

---

## Step 4: Open Web Interface (1 min)

Open your browser and go to:
```
http://127.0.0.1:7777
```

You should see a beautiful dark UI with a chat interface.

---

## Step 5: Install Roblox Plugin (1 min)

### Find Plugins Folder

**Windows:**
```
C:\Users\[YourUsername]\AppData\Roaming\Roblox\Plugins\
```

**Mac:**
```
~/Library/Application Support/Roblox/Plugins/
```

### Copy These Files

Copy these 4 files from `plugin/` folder to your Plugins folder:
1. `Main.lua`
2. `WebSocketClient.lua`
3. `Controller.lua`
4. `InstanceManager.lua`

### Restart Roblox Studio

Close and reopen Roblox Studio.

Open any game place and look for **Plugins** menu → **VortexDQ AI** button.

---

## You're Ready!

### Try This:

1. **Web UI:** Type in chat:
   ```
   create a red part in workspace
   ```

2. **Watch:** Studio updates in real-time!

3. **More Commands:**
   ```
   build an obstacle course with 5 platforms
   create a GUI with a button
   make a blue folder in workspace
   create a script that prints Hello World
   ```

---

## Common Issues

### "Web UI not loading"
- Server stopped? Run `npm start` again
- Wrong URL? Try `http://127.0.0.1:7777`
- Port in use? Check `.env` or restart

### "Plugin shows disconnected"
- Did you copy `.lua` files? (4 files needed)
- Did you restart Roblox? Close and reopen it
- Is server running? Check terminal output

### "API key error"
- No key needed if using Ollama!
- Wrong format? Check it starts with `sk-ant-`
- Quotes in `.env`? Remove them!

### "Commands don't work"
- Check the **Errors** tab in UI
- Click plugin button in Studio: **Plugins → VortexDQ AI**
- Restart server and Studio

---

## What To Do Next

1. **Try Complex Commands:**
   ```
   build a complete obstacle course with checkpoints and a win platform
   ```

2. **Switch Models:**
   In web UI, go to **Models** tab, click a model to switch

3. **Track Errors:**
   Go to **Errors** tab to see what went wrong and suggested fixes

4. **View Stats:**
   Go to **Stats** tab to see performance metrics

5. **Use Terminal (Optional):**
   ```bash
   node test-client.js    # Interactive WebSocket tester
   node examples.js       # Run test scenarios
   ```

---

## Full Documentation

See `README.md` for complete documentation including:
- All API endpoints
- All Roblox commands
- Advanced features
- Configuration options
- Troubleshooting guide

---

## Getting Help

1. **Check Errors Tab** - AI suggests fixes
2. **Check Plugin Status** - See connection status
3. **Check Logs** - Server logs appear in terminal
4. **Restart** - Close server, close Studio, restart both

---

**Enjoy building! 🚀**

Created with Claude AI + Roblox ❤️
