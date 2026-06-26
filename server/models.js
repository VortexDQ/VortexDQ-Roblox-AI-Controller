const axios = require('axios');

// ─── System Prompts ───────────────────────────────────────────────────────────

const BASE_SYSTEM = `You are VortexDQ — an elite Roblox game designer and engineer with 15 years of Studio expertise.
You think like a AAA game developer: polished builds, optimised scripts, stunning visuals, responsive systems.

RESPONSE FORMAT
Return ONLY a raw JSON array of commands. Zero markdown. Zero explanation outside the array.
The array is executed immediately in Roblox Studio — every command must be valid and complete.

COMMAND SCHEMA
Each element: { "action": "ActionName", "data": { ...fields } }

AVAILABLE ACTIONS AND REQUIRED DATA FIELDS

CreatePart       → parent(str), name(str), shape("Block"|"Ball"|"Cylinder"|"Wedge"), properties(obj)
CreateFolder     → parent(str), name(str)
CreateScript     → parent(str), name(str), code(str), isLocalScript(bool)
CreateInstance   → className(str), parent(str), name(str), properties(obj)
CreateUI         → parent(str), type(str), name(str), properties(obj)
SetProperty      → path(str), property(str), value(any)
GetProperty      → path(str), property(str)
DeleteInstance   → path(str)
RenameInstance   → path(str), newName(str)
MoveInstance     → path(str), newParent(str)
CloneInstance    → path(str), newParent(str), newName(str)
EditScript       → path(str), code(str)
BulkSetProperty  → paths([str]), property(str), value(any)
BulkDelete       → paths([str])
GetExplorerTree  → (no data needed)
GetAllScripts    → includeSources(bool)
GetAllProperties → path(str)
GetChildren      → path(str)
GetDescendants   → path(str), className(str), limit(num)
SearchInstances  → name(str), className(str), tag(str), root(str), limit(num)
GetGameInfo      → (no data)
GetLighting      → (no data)
SetLighting      → properties(obj)
GetWorkspaceSettings → (no data)
SetWorkspaceSettings → properties(obj)
GetServiceProperties → service(str)
SetServiceProperty   → service(str), property(str), value(any)
GetPlayers       → (no data)
GetTags          → path(str)
AddTag           → path(str), tag(str)
RemoveTag        → path(str), tag(str)
GetTagged        → tag(str)
GetAttribute     → path(str), name(str)
SetAttribute     → path(str), name(str), value(any)
GetAttributes    → path(str)
SetSelection     → paths([str])
Ping             → (no data)

PROPERTY VALUES
Vector3  → [x, y, z]  e.g. [0, 10, 0]
Color3   → { r, g, b } in 0-255  e.g. { "r": 255, "g": 100, "b": 50 }
UDim2    → { xs, xo, ys, yo }  e.g. { "xs": 1, "xo": 0, "ys": 0, "yo": 40 }
Enum     → string  e.g. "Plastic", "SmoothPlastic", "Neon", "Glass"
Boolean  → true/false
Number   → number

DESIGN STANDARDS — ALWAYS APPLY THESE

BUILDS
- Never use default grey. Every part has a deliberate colour and material.
- SmoothPlastic for modern structures, Neon for glowing accents, Glass for windows/panels.
- Group related parts under named Model or Folder instances.
- Add subtle size variation — nothing is perfectly uniform in great builds.
- Use negative space, elevation changes, and lighting to create depth.
- Anchor everything unless intentionally physics-driven.
- Preferred materials: SmoothPlastic, Neon, Glass, Metal, DiamondPlate, Marble, Slate, Fabric.

LIGHTING
- Always set Lighting.Technology to "Future" for max quality.
- Use Atmosphere (child of Lighting) for depth/haze.
- Add PointLights or SpotLights to illuminate builds from inside.
- ClockTime around 14 for daylight scenes, 22 for night.

SCRIPTS — ALWAYS WRITE PRODUCTION-QUALITY LUA
- Use task.spawn / task.delay — never wait() or spawn().
- Use :Connect() event-driven patterns, not polling loops.
- LocalScripts in StarterPlayerScripts or StarterCharacterScripts.
- Server scripts in ServerScriptService.
- Use RemoteEvents in ReplicatedStorage for client↔server comms.
- Type-guard every external input: assert(type(x) == "number", "expected number").
- Use Services at the top: local Players = game:GetService("Players").
- Smooth tweens via TweenService with proper EasingStyle.
- Use CollectionService tags for multi-instance systems.
- Performance: disconnect events when done, use task.wait() not wait(), no BusyWait.
- Comment intent not mechanics — only where truly non-obvious.
- Variable names: camelCase for locals, PascalCase for modules.

FULL GAME CREATION (only when explicitly requested)
When asked to "create a full game" / "make a complete game":
1. Create organised folder structure (Maps, Systems, UI, Assets, Modules)
2. Build the map — themed, detailed, visually impressive
3. Write core game loop script (rounds, scoring, win conditions)
4. Write player setup (character customisation, spawn, stats)
5. Build professional UI (HUD, menus, leaderboard)
6. Add audio (ambient, music, SFX triggers)
7. Implement data persistence skeleton (DataStore)
8. Polish lighting and atmosphere

SPEED RULES
- Always emit the full command array in one shot.
- Use BulkSetProperty when setting the same property on multiple instances.
- Batch related creates together — don't interleave creates and sets.
- Use CloneInstance for repeated identical structures.
- Target: minimal commands to achieve maximum visual/functional impact.`;

const FAST_SYSTEM = `You are VortexDQ — elite Roblox AI. Return ONLY a JSON command array, no markdown.
Use SmoothPlastic/Neon/Glass materials. Anchor parts. Write modern Lua with task.* APIs.
Always use Future lighting technology. Make builds visually stunning.`;

// ─── Model implementations ────────────────────────────────────────────────────

class ClaudeModel {
  constructor(fast = false) {
    this.fast = fast;
  }

  async generateCommands(prompt, gameContext = null) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const isFullGame = /\b(full game|complete game|entire game|whole game|make a game|create a game)\b/i.test(prompt);
    const model      = isFullGame ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
    const maxTokens  = isFullGame ? 8192 : 4096;
    const system     = (this.fast && !isFullGame) ? FAST_SYSTEM : BASE_SYSTEM;

    // Inject game context so the AI knows what already exists
    let userContent = prompt;
    if (gameContext) {
      userContent = `CURRENT GAME STATE:\n${JSON.stringify(gameContext, null, 2)}\n\nUSER REQUEST:\n${prompt}`;
    }

    const t0 = Date.now();
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userContent }],
      },
      {
        headers: {
          'x-api-key':          apiKey,
          'anthropic-version':  '2023-06-01',
          'content-type':       'application/json',
        },
        timeout: isFullGame ? 90000 : 20000,
      }
    );

    const text     = response.data.content[0].text;
    const commands = this._parse(text);
    const latency  = Date.now() - t0;

    console.log(`[Claude/${model}] ${commands.length} commands in ${latency}ms`);

    return {
      success:  true,
      commands,
      model:    `claude/${model}`,
      latency,
      isFullGame,
      analysis: this._analyse(commands),
    };
  }

  _parse(text) {
    // Strip any accidental markdown fences
    let s = text.trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    // Find the outermost JSON array
    const start = s.indexOf('[');
    const end   = s.lastIndexOf(']');
    if (start === -1 || end === -1) throw new Error('No JSON array in AI response');
    const arr = JSON.parse(s.slice(start, end + 1));
    if (!Array.isArray(arr)) throw new Error('AI response is not an array');
    return arr;
  }

  _analyse(commands) {
    return {
      commandCount: commands.length,
      types:        [...new Set(commands.map(c => c.action))],
      hasScripts:   commands.some(c => ['CreateScript','EditScript'].includes(c.action)),
      hasUI:        commands.some(c => c.action === 'CreateUI'),
      complexity:   commands.length > 50 ? 'full-game' : commands.length > 20 ? 'high' : commands.length > 8 ? 'medium' : 'low',
    };
  }
}

class GeminiModel {
  async generateCommands(prompt, gameContext = null) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');

    const content = [BASE_SYSTEM, gameContext ? `GAME STATE:\n${JSON.stringify(gameContext)}` : '', 'REQUEST: ' + prompt].join('\n\n');

    const t0 = Date.now();
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      { contents: [{ parts: [{ text: content }] }] },
      { timeout: 20000 }
    );

    const text     = response.data.candidates[0].content.parts[0].text;
    const s        = text.trim().replace(/^```json\s*/i,'').replace(/\s*```$/i,'');
    const commands = JSON.parse(s.slice(s.indexOf('['), s.lastIndexOf(']') + 1));
    return { success: true, commands, model: 'gemini/2.0-flash', latency: Date.now() - t0 };
  }
}

class DeepSeekModel {
  async generateCommands(prompt, gameContext = null) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

    const userContent = gameContext
      ? `GAME STATE:\n${JSON.stringify(gameContext)}\n\nREQUEST: ${prompt}`
      : prompt;

    const t0 = Date.now();
    const response = await axios.post(
      'https://api.deepseek.com/chat/completions',
      {
        model: 'deepseek-coder',
        messages: [
          { role: 'system', content: BASE_SYSTEM },
          { role: 'user',   content: userContent },
        ],
        temperature: 0.6,
        max_tokens: 4096,
      },
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 25000,
      }
    );

    const text     = response.data.choices[0].message.content;
    const s        = text.trim().replace(/^```json\s*/i,'').replace(/\s*```$/i,'');
    const commands = JSON.parse(s.slice(s.indexOf('['), s.lastIndexOf(']') + 1));
    return { success: true, commands, model: 'deepseek/coder', latency: Date.now() - t0 };
  }
}

class OllamaModel {
  async generateCommands(prompt) {
    const t0 = Date.now();
    const response = await axios.post(
      'http://127.0.0.1:11434/api/generate',
      { model: process.env.OLLAMA_MODEL || 'mistral', prompt: `${FAST_SYSTEM}\n\nREQUEST: ${prompt}`, stream: false },
      { timeout: 120000 }
    );
    const text = response.data.response;
    const s    = text.match(/\[[\s\S]*\]/)?.[0];
    if (!s) throw new Error('No JSON array in Ollama response');
    return { success: true, commands: JSON.parse(s), model: 'ollama/local', latency: Date.now() - t0 };
  }
}

class LocalModel {
  async generateCommands(prompt) {
    const lower    = prompt.toLowerCase();
    const commands = [];

    if (lower.includes('part') || lower.includes('block') || lower.includes('platform')) {
      commands.push({
        action: 'CreatePart',
        data: {
          parent: 'Workspace', name: 'Part', shape: 'Block',
          properties: { Size: [4, 1, 4], Anchored: true, Material: 'SmoothPlastic',
                        Color: { r: 80, g: 120, b: 200 } },
        },
      });
    }
    if (lower.includes('folder')) {
      commands.push({ action: 'CreateFolder', data: { parent: 'Workspace', name: 'Folder' } });
    }
    if (lower.includes('script')) {
      commands.push({
        action: 'CreateScript',
        data: { parent: 'ServerScriptService', name: 'Script', code: "-- Generated script\nlocal Players = game:GetService('Players')\nprint('Script loaded')" },
      });
    }
    if (commands.length === 0) {
      commands.push({ action: 'GetExplorerTree', data: {} });
    }

    return { success: true, commands, model: 'local', latency: 0 };
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

class ModelRouter {
  constructor() {
    this.models = {
      claude:   new ClaudeModel(false),
      claudeFast: new ClaudeModel(true),
      gemini:   new GeminiModel(),
      deepseek: new DeepSeekModel(),
      ollama:   new OllamaModel(),
      local:    new LocalModel(),
    };

    this.modelConfigs = {
      claude:     { enabled: !!process.env.ANTHROPIC_API_KEY, speed: 0.85, quality: 1.00, cost: 'paid' },
      claudeFast: { enabled: !!process.env.ANTHROPIC_API_KEY, speed: 0.95, quality: 0.92, cost: 'paid' },
      gemini:     { enabled: !!process.env.GEMINI_API_KEY,    speed: 0.92, quality: 0.88, cost: 'paid' },
      deepseek:   { enabled: !!process.env.DEEPSEEK_API_KEY,  speed: 0.88, quality: 0.85, cost: 'paid' },
      ollama:     { enabled: true,                             speed: 0.90, quality: 0.70, cost: 'free' },
      local:      { enabled: true,                             speed: 1.00, quality: 0.30, cost: 'free' },
    };

    // Pick best available model by default
    this.activeModel = this._bestModel();
  }

  _bestModel() {
    const priority = ['claude','claudeFast','gemini','deepseek','ollama','local'];
    return priority.find(m => this.modelConfigs[m].enabled) || 'local';
  }

  async generateCommands(prompt, options = {}) {
    const modelName = options.model || this.activeModel;
    const model     = this.models[modelName];
    if (!model) throw new Error(`Model not found: ${modelName}`);
    if (!this.modelConfigs[modelName].enabled) throw new Error(`Model not enabled: ${modelName}`);

    try {
      const result = await model.generateCommands(prompt, options.gameContext || null);
      result.model     = modelName;
      result.timestamp = new Date().toISOString();
      return result;
    } catch (error) {
      console.error(`[MODELS] ${modelName} failed:`, error.message);
      // Fallback chain
      const fallbacks = ['claudeFast','gemini','deepseek','ollama','local'];
      for (const fb of fallbacks) {
        if (fb !== modelName && this.modelConfigs[fb].enabled) {
          console.log(`[MODELS] Falling back to ${fb}`);
          try {
            const r = await this.models[fb].generateCommands(prompt, null);
            r.model     = fb;
            r.fallback  = true;
            r.timestamp = new Date().toISOString();
            return r;
          } catch (_) {}
        }
      }
      throw error;
    }
  }

  setActiveModel(name) {
    if (!this.models[name]) throw new Error(`Unknown model: ${name}`);
    if (!this.modelConfigs[name].enabled) throw new Error(`Model not enabled: ${name}`);
    this.activeModel = name;
    return { active: name, config: this.modelConfigs[name] };
  }

  getAvailableModels() {
    return Object.entries(this.modelConfigs)
      .filter(([, c]) => c.enabled)
      .map(([name, c]) => ({ name, ...c, active: name === this.activeModel }));
  }
}

module.exports = ModelRouter;
