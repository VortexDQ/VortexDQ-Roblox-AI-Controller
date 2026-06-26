# VortexDQ AI Controller v2.0 - Professional AI Game Builder

**The fastest, smartest way to build games in Roblox Studio using AI.**

No terminal. Beautiful web UI. Multi-model support. Error tracking & fixing. Everything offline.

```
💬 Chat with AI → 🤖 Pick Model (Claude/Gemini/Ollama/etc) → ⚡ Instant Studio Updates
```

## Features

✨ **Web UI** - ChatGPT/Claude-style interface (no terminal needed)  
🤖 **Multi-Model** - Claude, Gemini, Ollama, DeepSeek, Codex, Cursor (switch instantly)  
⚡ **Real-time Updates** - WebSocket (NOT polling) - instant game changes  
🧠 **Smart Executor** - Auto-optimizes commands, adds improvements  
📊 **Error Tracking** - Logs errors, suggests fixes, learns from mistakes  
🔧 **Auto-Fix** - Automatically fixes common errors on launch  
💾 **Offline** - Everything runs locally, no cloud dependency  
🚀 **Fast** - <100ms command delivery, batch execution  
🎨 **Beautiful** - Modern dark UI with real-time stats & error analytics  

## Quick Start (2 minutes)

### 1. Install Dependencies
```bash
npm install
```

### 2. Set API Key (Optional - can use local Ollama instead)
```bash
# Windows PowerShell
$env:ANTHROPIC_API_KEY = "sk-ant-your-key-here"

# Windows CMD
set ANTHROPIC_API_KEY=sk-ant-your-key-here

# Linux/Mac
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Or create `.env`:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
PORT=7777
```

### 3. Start Server
```bash
npm start
```

You'll see:
```
╔════════════════════════════════════════════╗
║  VortexDQ AI Controller - Ready             ║
╚════════════════════════════════════════════╝

🌐 Web UI:  http://127.0.0.1:7777
📡 WebSocket: ws://127.0.0.1:7777
🤖 Models: claude, ollama, ...
```

### 4. Open Browser
**http://127.0.0.1:7777** - Chat with AI, see real-time stats

### 5. Install Plugin
Copy to Roblox Plugins folder:
- Windows: `%APPDATA%\Roblox\Plugins\`
- Mac: `~/Library/Application Support/Roblox/Plugins/`

Files:
- `plugin/Main.lua`
- `plugin/WebSocketClient.lua`
- `plugin/Controller.lua`
- `plugin/InstanceManager.lua`

Restart Roblox Studio. Click **Plugins → VortexDQ AI**

### 6. Start Building
Type in chat: `"build an obstacle course with 10 platforms and checkpoints"`

Done. Watch Studio update in real-time.

---

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│ YOU (Web Browser)                                       │
│ "build an obby with checkpoints and finish"            │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│ NODE.JS SERVER (Your Computer)                          │
│                                                         │
│ 🤖 AI Model Picker                                      │
│    ├─ Claude (best quality, slowest)                    │
│    ├─ Gemini (fast, good quality)                       │
│    ├─ Ollama (local, offline)                           │
│    ├─ DeepSeek, Codex, Cursor...                        │
│    └─ Local (always available)                          │
│                                                         │
│ 🧠 Smart Executor                                       │
│    ├─ Analyzes commands                                 │
│    ├─ Optimizes for performance                         │
│    ├─ Adds visual improvements                          │
│    └─ Fixes errors automatically                        │
│                                                         │
│ 📊 Error Tracker                                        │
│    ├─ Logs all errors                                   │
│    ├─ Learns from fixes                                 │
│    └─ Suggests solutions                                │
│                                                         │
└──────────────┬──────────────────────────────────────────┘
               │ WebSocket (INSTANT)
               ▼
┌─────────────────────────────────────────────────────────┐
│ ROBLOX STUDIO PLUGIN                                    │
│                                                         │
│ ✓ Receives commands instantly                           │
│ ✓ Executes in Studio safely (pcall wrapped)            │
│ ✓ Returns results & state                              │
│ ✓ Auto-reconnects on disconnect                        │
│                                                         │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
        🎮 YOUR GAME UPDATES!
```

---

## AI Models (Choose Your Weapon)

### Claude (Recommended)
```
Speed: 80%  Quality: 95%  Type: Paid
Best for: Complex creations, high-quality results
```
Set: `ANTHROPIC_API_KEY=sk-ant-...`

### Gemini
```
Speed: 90%  Quality: 90%  Type: Paid
Best for: Fast execution, good balance
```
Set: `GEMINI_API_KEY=...`

### Ollama (Offline)
```
Speed: 95%  Quality: 75%  Type: Free/Local
Best for: Privacy, no API keys, offline work
Installation: https://ollama.ai
```
Run: `ollama serve` in another terminal

### DeepSeek
```
Speed: 85%  Quality: 88%  Type: Paid
Best for: Cost-effective, decent quality
```
Set: `DEEPSEEK_API_KEY=...`

### Codex (OpenAI)
```
Speed: 75%  Quality: 92%  Type: Paid
Best for: Code-focused creations
```
Set: `OPENAI_API_KEY=...`

### Cursor
```
Speed: 80%  Quality: 94%  Type: Paid
Best for: High-quality AI assistance
```
Set: `CURSOR_API_KEY=...`

### Local Fallback (Always Works)
```
Speed: 100%  Quality: 60%  Type: Free
Best for: When APIs are down, testing
Doesn't require any API key
```

**Switch models instantly** - just click in the UI!

---

## Web UI Features

### 💬 Chat Tab
- Chat with AI naturally
- See execution stats in real-time
- Toggle "Enhance Output" for extra improvements
- Visual feedback on success/errors

### 🤖 Models Tab
- See all available models
- Click to switch instantly
- Compare speed/quality/cost
- Info table with stats

### ⚠️ Errors Tab
- Total errors, fixed, unfixed
- Breakdown by severity (Critical, High, Medium, Low)
- Most common errors with suggested fixes
- Export errors as CSV

### 📊 Stats Tab
- Total executions
- Success rate
- Average commands per execution
- Active connections
- Recent execution history

### 🔌 Plugin Tab
- Live plugin connection status
- Installation guide
- Connected plugins list
- Real-time connection updates

---

## API Endpoints (For Advanced Users)

### POST /api/execute
**Execute AI command with optional model selection**
```bash
curl -X POST http://127.0.0.1:7777/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "create a blue part in workspace",
    "model": "claude",
    "enhance": true
  }'
```

Response:
```json
{
  "success": true,
  "model": "claude",
  "commands": [...],
  "results": [...],
  "analysis": {
    "commandCount": 5,
    "executionTime": "234ms",
    "types": ["CreatePart", "SetProperty"]
  }
}
```

### GET /api/models
**List available models**

### POST /api/models/set
**Switch active model**
```bash
curl -X POST http://127.0.0.1:7777/api/models/set \
  -H "Content-Type: application/json" \
  -d '{"model": "gemini"}'
```

### GET /api/errors
**Get error stats & log**

### GET /api/errors/export
**Export errors as CSV or JSON**

### GET /api/stats
**Get performance statistics**

### GET /api/health
**Server status check**

### GET /api/status
**Plugin connection status**

---

## Advanced Features

### Error Tracking & Auto-Fix

The system automatically:
- 📝 Logs every error with context
- 🔍 Detects error patterns
- 💡 Suggests fixes
- 🧠 Learns from successful fixes
- 🔧 Proposes solutions on next similar error

View errors in **Errors** tab → most common with fixes

### Smart Executor

Commands are automatically:
- ✅ Validated against schema
- 🔄 Reordered (Creates before SetProperty)
- ⭐ Enhanced with visual improvements
- 📦 Batch executed (10 at a time)
- 🛡️ Wrapped in error handling

### Command Batching

- Up to 100 commands per request
- Executed in batches of 10
- 50ms delay between batches
- Error recovery built-in

### Multi-Model Fallback

If your chosen model fails:
1. Retries 3 times
2. Falls back to Ollama (if available)
3. Falls back to Local model
4. Logs error for analysis

---

## Roblox Commands (All 13+)

### CreatePart
```json
{
  "action": "CreatePart",
  "data": {
    "parent": "Workspace",
    "name": "Platform",
    "shape": "Block",
    "properties": {
      "Size": [4, 1, 4],
      "Color": [0, 255, 0],
      "Anchored": true
    }
  }
}
```

### CreateInstance
```json
{
  "action": "CreateInstance",
  "data": {
    "className": "Folder",
    "parent": "Workspace",
    "name": "Folder"
  }
}
```

### CreateScript
```json
{
  "action": "CreateScript",
  "data": {
    "parent": "Workspace",
    "code": "print('Hello!')"
  }
}
```

### CreateUI
```json
{
  "action": "CreateUI",
  "data": {
    "parent": "StarterGui",
    "type": "ScreenGui",
    "properties": { "Size": { "X": 300, "Y": 400 } }
  }
}
```

### SetProperty / GetProperty / DeleteInstance / MoveInstance / RenameInstance / CloneInstance / EditScript / GetExplorerTree

See `server/protocol.js` for full schema.

---

## Terminal (Optional)

You don't need the terminal, but it's there:

### Test Client
```bash
node test-client.js
```
Interactive WebSocket debugger.

### Examples
```bash
node examples.js
```
Run predefined test scenarios.

---

## Configuration

### .env File
```
ANTHROPIC_API_KEY=sk-ant-...    # Claude API (optional)
GEMINI_API_KEY=...              # Gemini (optional)
DEEPSEEK_API_KEY=...            # DeepSeek (optional)
OPENAI_API_KEY=...              # OpenAI/Codex (optional)
CURSOR_API_KEY=...              # Cursor (optional)
PORT=7777                       # Server port
NODE_ENV=development            # development or production
```

### Model Settings
Edit `server/models.js` to customize model behavior, timeouts, retry logic.

---

## Project Structure

```
VortexDQ Roblox Editor/
├── server/
│   ├── index.js              # Main server with all endpoints
│   ├── models.js             # Multi-model router & implementations
│   ├── smartExecutor.js      # Smart command optimizer
│   ├── errorTracker.js       # Error logging & analytics
│   ├── websocket.js          # WebSocket server
│   ├── commandEngine.js      # Command execution
│   ├── claude.js             # (Legacy, use models.js)
│   └── protocol.js           # Command validation
│
├── plugin/
│   ├── Main.lua              # Plugin entry + GUI
│   ├── WebSocketClient.lua   # WebSocket Lua client
│   ├── Controller.lua        # Command dispatcher
│   └── InstanceManager.lua   # Roblox API wrapper
│
├── ui/
│   ├── index.html            # Web UI layout
│   ├── style.css             # Dark modern theme
│   └── app.js                # Frontend logic
│
├── logs/
│   └── errors.json           # Error log (auto-created)
│
├── package.json              # Dependencies
├── .env.example              # Configuration template
├── start.bat / start.sh       # Quick launchers
└── README.md                 # This file
```

---

## Troubleshooting

### "Web UI won't load"
```bash
# Restart server
npm start

# Check port
netstat -an | grep 7777
```

### "Plugin disconnected"
1. Server running? `npm start`
2. Plugin installed? Copy `.lua` files to Plugins folder
3. Roblox restarted? Yes? Good.
4. Check **Plugins** tab → click **VortexDQ AI** button

### "Claude API fails"
- Valid key? `sk-ant-...`
- `.env` correct? No spaces
- Quota remaining? Check Anthropic dashboard

### "Commands don't execute"
- Instance path correct? Use GetExplorerTree to verify
- Properties valid? Check `server/protocol.js`
- pcall errors? Check Roblox Output panel

### "Model switch failed"
- Model enabled? Need API key
- Ollama running? `ollama serve`
- Try fallback Local model (always works)

---

## Performance

| Metric | Time |
|--------|------|
| API → Plugin | <100ms |
| Command parsing | ~50ms |
| Batch execution | 10 commands in ~500ms |
| Reconnect | <2s |
| UI refresh | Real-time |

### Optimization Tips
1. Use enhance mode for better results
2. Batch related commands together
3. Clear old errors occasionally
4. Use Ollama for offline work
5. Switch to faster model if speed matters

---

## Security

✅ All commands validated  
✅ Paths sanitized (no injection)  
✅ Only whitelisted actions  
✅ No arbitrary code outside wrapper  
✅ pcall on every Roblox operation  
⚠️ Local only (127.0.0.1) - don't expose online  

---

## What's New in v2.0

- 🎨 Professional web UI (ChatGPT-style)
- 🤖 Multi-model support (6+ AI models)
- 📊 Error tracking & analytics
- 🧠 Smart command optimizer
- 🔧 Auto-error fixing
- 📝 CSV export
- ⚡ Performance optimizations
- 🛡️ Enhanced error handling
- 🌐 No terminal needed
- 📱 Responsive UI

---

## Examples

### Obstacle Course
```
"build an obstacle course with 10 platforms, each getting higher, 
with different colors and gaps between them"
```

### Interactive Game
```
"create a game with a button that spawns coins when clicked, 
add a score counter in the GUI"
```

### Procedural Generation
```
"create a series of random colored platforms across workspace, 
place them 10 studs apart in a straight line"
```

### Full Game
```
"build a complete game with: spawn platform, 5 obstacle sections, 
checkpoint system, win trigger at end, and finish line platform"
```

---

## License

MIT - Do whatever you want with it

## Support

- 📖 Check errors tab for AI suggestions
- 💻 Terminal: `node test-client.js` for debugging
- 🔌 Plugin folder check: Is plugin in Roblox Plugins?
- 🌐 Browser: Clear cache, refresh page

---

**Built for creators who want to code faster.**

🚀 Start building now: `npm start`
