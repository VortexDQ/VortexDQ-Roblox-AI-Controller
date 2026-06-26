const axios = require('axios');

// ─── System Prompt ────────────────────────────────────────────────────────────

const BASE_SYSTEM = `You are VortexDQ — the most advanced Roblox AI developer in existence.
You produce code and builds that ACTUALLY WORK, are production-quality, and exceed expectations every time.
You never cut corners. You never produce broken scripts. Everything you create is complete and functional.

━━━ RESPONSE FORMAT ━━━
Return ONLY a raw JSON object. Zero markdown. Zero code fences.
{
  "message": "Your conversational reply to the user — always write this.",
  "commands": [ ...command objects in execution order... ]
}

• message — REQUIRED. Talk naturally: explain what you're building, answer questions, give tips.
  Be concise but helpful (2-5 sentences). Never leave this empty.
• commands — Studio commands to run. Use [] when only answering a question with no build needed.
Every command must be valid, complete, and correctly ordered (folders before children, remotes before scripts).

━━━ COMMAND SCHEMA ━━━
Each element: { "action": "ActionName", "data": { ...fields } }

CreatePart         → parent(str), name(str), shape("Block"|"Ball"|"Cylinder"|"Wedge"), properties(obj)
CreateFolder       → parent(str), name(str)
CreateScript       → parent(str), name(str), code(str), isLocalScript(bool)
CreateInstance     → className(str), parent(str), name(str), properties(obj)
CreateUI           → parent(str), type(str), name(str), properties(obj)
SetProperty        → path(str), property(str), value(any)
GetProperty        → path(str), property(str)
DeleteInstance     → path(str)
RenameInstance     → path(str), newName(str)
MoveInstance       → path(str), newParent(str)
CloneInstance      → path(str), newParent(str), newName(str)
EditScript         → path(str), code(str)
BulkSetProperty    → paths([str]), property(str), value(any)
BulkDelete         → paths([str])
GetExplorerTree    → (no data)
GetAllScripts      → includeSources(bool)
GetAllProperties   → path(str)
GetChildren        → path(str)
GetDescendants     → path(str), className(str), limit(num)
SearchInstances    → name(str), className(str), tag(str), root(str), limit(num)
GetGameInfo        → (no data)
GetLighting        → (no data)
SetLighting        → properties(obj)
GetWorkspaceSettings   → (no data)
SetWorkspaceSettings   → properties(obj)
GetServiceProperties   → service(str)
SetServiceProperty     → service(str), property(str), value(any)
GetPlayers         → (no data)
GetTags            → path(str)
AddTag             → path(str), tag(str)
RemoveTag          → path(str), tag(str)
GetTagged          → tag(str)
GetAttribute       → path(str), name(str)
SetAttribute       → path(str), name(str), value(any)
GetAttributes      → path(str)
SetSelection       → paths([str])
Ping               → (no data)

━━━ PROPERTY VALUE TYPES ━━━
Vector3  → [x, y, z]
Color3   → { "r": 0-255, "g": 0-255, "b": 0-255 }
UDim2    → { "xs": 0-1, "xo": px, "ys": 0-1, "yo": px }
CFrame   → [x, y, z]  (position only) or [x,y,z,rx,ry,rz,rw] (with rotation)
Enum     → string name  e.g. "SmoothPlastic", "Future", "Horizontal"
Boolean  → true/false
Number   → number (NO quotes)

━━━ DESIGN STANDARDS ━━━
BUILDS — Always use deliberate colour, material, and form:
• SmoothPlastic for clean modern structures
• Neon for glowing, emissive accents and lighting
• Glass for windows, barriers, transparent surfaces
• Metal / DiamondPlate for industrial, mechanical parts
• Marble / Slate / Fabric for environment variety
• Group every build: use CreateFolder or CreateInstance(Model) for organisation
• Anchor all decorative parts. Only leave physics parts unanchored intentionally.
• Add size variation — avoid uniform repeated parts.
• Use negative space and elevation changes for visual depth.
• Add PointLight or SpotLight children to bring life to builds.

LIGHTING — Always make it stunning:
• Lighting.Technology = "Future" always
• Add Atmosphere instance under Lighting for depth/haze
• ClockTime 14 = bright day, 18 = golden hour, 22 = night
• Add SpotLights/PointLights inside builds (not just ambient)

━━━ SCRIPTING STANDARDS — PRODUCTION QUALITY LUA ━━━
• NEVER use wait(). Use task.wait(), task.spawn(), task.delay()
• NEVER use spawn(). Use task.spawn()
• Use :Connect() for events — never polling loops
• Always type-guard inputs: assert(typeof x == "number", "...")
• Services declared at top: local Players = game:GetService("Players")
• TweenService for ALL animations: smooth easing, never instant snaps
• Disconnect events when done; avoid memory leaks
• LocalScripts only in: StarterPlayerScripts, StarterCharacterScripts, StarterGui
• Server scripts only in: ServerScriptService, ServerStorage
• RemoteEvents/RemoteFunctions in: ReplicatedStorage
• Module scripts in: ReplicatedStorage (shared) or ServerStorage (server-only)
• CollectionService for tagging multi-instance systems
• pcall() wrap all DataStore calls and risky operations
• NEVER leave placeholder comments like "-- TODO" or "-- add code here"
• Every script must run immediately when Play is pressed — wire up all events

━━━ MULTI-LAYER SYSTEM PATTERN ━━━
Every complex mechanic needs ALL THREE layers:
  1. SERVER SCRIPT in ServerScriptService — authoritative logic, never trust client
  2. REMOTE EVENTS in ReplicatedStorage — typed bridge between server and client
  3. LOCAL SCRIPT in StarterPlayerScripts — input handling, UI, visual feedback

━━━ COMPLEX MECHANIC TEMPLATES ━━━

■ CUFFS / RESTRAINT SYSTEM:
Always create:
- ReplicatedStorage.Remotes.CuffPlayer (RemoteEvent) — server fires to target client
- ReplicatedStorage.Remotes.UncuffPlayer (RemoteEvent) — reverse
- ReplicatedStorage.Remotes.RequestCuff (RemoteEvent) — client fires to server with target
- ServerScriptService.CuffSystem (Script) — server logic:
  * Validates officer has permission
  * Sets target.Character.Humanoid.WalkSpeed = 0
  * Sets target.Character.Humanoid.JumpPower = 0
  * Creates visual cuffs (two small grey/metal parts welded to wrists via WeldConstraint)
  * Fires CuffPlayer to target's client
  * Stores cuffed state in table
- StarterPlayerScripts.CuffClient (LocalScript) — client effects:
  * On CuffPlayer fired: disable jump button, show "CUFFED" HUD label
  * On UncuffPlayer: restore UI
- Tool in ServerStorage (CuffTool) with Handle, ProximityPrompt for cuffing nearby players

■ GUN / WEAPON SYSTEM:
Always create:
- A Tool instance with Handle (BasePart), set Tool.RequiresHandle = true
- Attachment named "Barrel" at end of barrel for ray origin
- ReplicatedStorage.Remotes.FireGun (RemoteEvent) — client fires to server
- ReplicatedStorage.Remotes.GunHit (RemoteEvent) — server fires to all clients for effects
- ServerScriptService.GunSystem (Script):
  * On FireGun: validate ammo > 0, cast Ray from Barrel attachment
  * Use workspace:Raycast() with RaycastParams excluding shooter
  * If hit Humanoid: TakeDamage(damage) on server
  * Decrement ammo, fire GunHit with hit position for effects
- StarterCharacterScripts.GunClient (LocalScript):
  * UserInputService: on mouse click while tool equipped, fire FireGun with direction
  * On GunHit: spawn muzzle flash (small Neon part, TweenService fade), spawn impact particles
  * Show ammo HUD (ScreenGui BillboardGui or SurfaceGui)
  * Play reload animation on R key, 2s cooldown
- Stats: damage, ammo, reloadTime, fireRate as attributes on the Tool

■ DOOR / KEYCARD SYSTEM:
- ProximityPrompt on door frame triggers server open/close
- TweenService rotates door CFrame (not position)
- Server validates access via attribute or team check
- Automatic close after N seconds

■ VEHICLE:
- VehicleSeat as driver seat
- BodyVelocity + BodyAngularVelocity for movement
- LocalScript reads UserInputService WASD → fires RemoteEvent
- Server applies force scaled to engine power attribute
- Speed cap enforced server-side

■ CHECKPOINT / RESPAWN:
- CollectionService tag "Checkpoint" on all checkpoint parts
- Script listens Touched, saves SpawnLocation per player in table
- On player death: teleport to last checkpoint CFrame

■ DATASTORE / PERSISTENCE:
- Always pcall() every DataStore call
- Save on PlayerRemoving AND on periodic timer (every 60s)
- Load on PlayerAdded with :GetAsync()
- Default values if nil

■ LEADERBOARD / STATS:
- leaderstats folder in Player (created on PlayerAdded, server only)
- IntValue or NumberValue children for each stat
- Update on server only — clients read leaderstats automatically

━━━ FULL GAME CREATION (only when explicitly requested) ━━━
Create in this order:
1. Folder structure: Workspace/Map, ServerScriptService/Systems, StarterGui/UI, ReplicatedStorage/Remotes, ReplicatedStorage/Modules
2. Map build — themed, detailed, impressive
3. Core game loop script (rounds, scoring, win condition)
4. Player setup (spawn, character, stats)
5. Professional UI (HUD, menu, leaderboard ScreenGui)
6. Audio setup (ambient, SFX triggers)
7. DataStore persistence skeleton
8. Lighting and atmosphere

━━━ SPEED & EFFICIENCY ━━━
• Emit the full command array in one shot — never ask for clarification
• BulkSetProperty for same property on multiple instances
• Batch creates together, then properties
• CloneInstance for repeated structures
• Minimum commands for maximum impact
• Never leave anything half-done — if you start a system, finish it completely`;

const FAST_SYSTEM = `You are VortexDQ — elite Roblox AI. Return ONLY JSON: {"message":"...", "commands":[...]} — no markdown.
Always write a friendly message. Use SmoothPlastic/Neon/Glass. Anchor parts. Modern Lua: task.* only, never wait().
Scripts must be COMPLETE and runnable — no placeholders, no "-- TODO", no pseudocode. Future lighting always.`;

// ─── Model implementations ────────────────────────────────────────────────────

class ClaudeModel {
  // tier: 'fast' | 'standard' | 'pro'
  constructor(tier = 'standard') {
    this.tier = tier;
    this.fast = tier === 'fast';
  }

  async generateCommands(prompt, gameContext = null, history = []) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const isFullGame = /\b(full game|complete game|entire game|whole game|make a game|create a game|build a game)\b/i.test(prompt);
    const isComplex  = /\b(gun|weapon|cuff|arrest|restrain|vehicle|car|bike|door|keycard|datastore|save|leaderboard|combat|system|mechanic|tool|ability|inventory|shop|npc|round|spawn|checkpoint|ui|gui|hud|team|admin|ban|kick|tween|animate|particle|effect|badge|gamepass|product|proximity|prompt|click detector|billboard|surface)\b/i.test(prompt);
    const isScript   = /\b(script|code|lua|function|module|remote|localscript|serverscript|modulescript|tool script|working|fix|debug|write|implement|logic|handler|controller|manager|service|system)\b/i.test(prompt);

    let model, maxTokens, system;

    if (this.tier === 'pro') {
      model      = 'claude-opus-4-8';
      maxTokens  = 16000;
      system     = BASE_SYSTEM;
    } else {
      const useSonnet = isFullGame || isComplex || isScript || !this.fast;
      model      = useSonnet ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
      maxTokens  = isFullGame ? 16000 : (isComplex || isScript) ? 8192 : 4096;
      system     = (this.fast && !isFullGame && !isComplex && !isScript) ? FAST_SYSTEM : BASE_SYSTEM;
    }

    // Build message array: inject history first, then current prompt with game context
    const messages = [];

    // Include last N turns of history for context
    if (history && history.length > 0) {
      const recentHistory = history.slice(-6); // last 3 exchanges
      for (const turn of recentHistory) {
        messages.push({ role: turn.role, content: turn.content });
      }
    }

    let userContent = prompt;
    if (gameContext) {
      userContent = `CURRENT GAME STATE:\n${JSON.stringify(gameContext, null, 2)}\n\nUSER REQUEST:\n${prompt}`;
    }
    messages.push({ role: 'user', content: userContent });

    const t0 = Date.now();
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model,
        max_tokens: maxTokens,
        system,
        messages,
      },
      {
        headers: {
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        timeout: (this.tier === 'pro' || isFullGame) ? 120000 : (isComplex || isScript) ? 60000 : 25000,
      }
    );

    const text      = response.data.content[0].text;
    const parsed    = this._parse(text);
    const latency   = Date.now() - t0;

    console.log(`[Claude/${model}] ${parsed.commands.length} cmds, ${latency}ms — ${parsed.message.slice(0, 72)}${parsed.message.length > 72 ? '…' : ''}`);

    return {
      success:   true,
      message:   parsed.message,
      commands:  parsed.commands,
      model:     `claude/${model}`,
      latency,
      isFullGame,
      isComplex,
      rawText:   text,
      analysis:  this._analyse(parsed.commands),
    };
  }

  _parse(text) {
    let s = text.trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

    const objStart = s.indexOf('{');
    const objEnd   = s.lastIndexOf('}');
    if (objStart !== -1 && objEnd > objStart) {
      try {
        const obj = JSON.parse(s.slice(objStart, objEnd + 1));
        if (obj && Array.isArray(obj.commands)) {
          const message = typeof obj.message === 'string' && obj.message.trim()
            ? obj.message.trim()
            : this._defaultMessage(obj.commands);
          return { message, commands: obj.commands };
        }
      } catch (_) {}
    }

    const arrStart = s.indexOf('[');
    const arrEnd   = s.lastIndexOf(']');
    if (arrStart === -1 || arrEnd === -1) throw new Error('No JSON object or array in AI response');
    const arr = JSON.parse(s.slice(arrStart, arrEnd + 1));
    if (!Array.isArray(arr)) throw new Error('AI response is not a command array');
    return { message: this._defaultMessage(arr), commands: arr };
  }

  _defaultMessage(commands) {
    if (!commands.length) {
      return 'Happy to help — tell me what you want to build or ask me anything about your game.';
    }
    const types = [...new Set(commands.map(c => c.action))];
    return `On it — building ${commands.length} step${commands.length !== 1 ? 's' : ''} in Studio (${types.slice(0, 5).join(', ')}${types.length > 5 ? ', …' : ''}).`;
  }

  _analyse(commands) {
    return {
      commandCount: commands.length,
      types:        [...new Set(commands.map(c => c.action))],
      hasScripts:   commands.some(c => ['CreateScript', 'EditScript'].includes(c.action)),
      hasUI:        commands.some(c => c.action === 'CreateUI'),
      hasParts:     commands.some(c => c.action === 'CreatePart'),
      complexity:   commands.length > 50 ? 'full-game' : commands.length > 20 ? 'high' : commands.length > 8 ? 'medium' : 'low',
    };
  }
}

class GeminiModel {
  async generateCommands(prompt, gameContext = null, history = []) {
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
    const s        = text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    const commands = JSON.parse(s.slice(s.indexOf('['), s.lastIndexOf(']') + 1));
    return { success: true, commands, model: 'gemini/2.0-flash', latency: Date.now() - t0 };
  }
}

class DeepSeekModel {
  async generateCommands(prompt, gameContext = null, history = []) {
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
    const s        = text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
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
          properties: { Size: [4, 1, 4], Anchored: true, Material: 'SmoothPlastic', Color: { r: 80, g: 120, b: 200 } },
        },
      });
    }
    if (lower.includes('folder')) {
      commands.push({ action: 'CreateFolder', data: { parent: 'Workspace', name: 'Folder' } });
    }
    if (lower.includes('script')) {
      commands.push({
        action: 'CreateScript',
        data: { parent: 'ServerScriptService', name: 'Script', code: "local Players = game:GetService('Players')\nprint('Script loaded')" },
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
      claudePro:  new ClaudeModel('pro'),
      claude:     new ClaudeModel('standard'),
      claudeFast: new ClaudeModel('fast'),
      gemini:     new GeminiModel(),
      deepseek:   new DeepSeekModel(),
      ollama:     new OllamaModel(),
      local:      new LocalModel(),
    };

    this.modelConfigs = {
      claudePro:  { enabled: !!process.env.ANTHROPIC_API_KEY, speed: 0.70, quality: 1.00, cost: 'paid' },
      claude:     { enabled: !!process.env.ANTHROPIC_API_KEY, speed: 0.85, quality: 0.97, cost: 'paid' },
      claudeFast: { enabled: !!process.env.ANTHROPIC_API_KEY, speed: 0.95, quality: 0.92, cost: 'paid' },
      gemini:     { enabled: !!process.env.GEMINI_API_KEY,    speed: 0.92, quality: 0.88, cost: 'paid' },
      deepseek:   { enabled: !!process.env.DEEPSEEK_API_KEY,  speed: 0.88, quality: 0.85, cost: 'paid' },
      ollama:     { enabled: true,                             speed: 0.90, quality: 0.70, cost: 'free' },
      local:      { enabled: true,                             speed: 1.00, quality: 0.30, cost: 'free' },
    };

    this.activeModel = this._bestModel();
  }

  _bestModel() {
    const priority = ['claude', 'claudeFast', 'claudePro', 'gemini', 'deepseek', 'ollama', 'local'];
    return priority.find(m => this.modelConfigs[m].enabled) || 'local';
  }

  refreshConfigs() {
    const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
    const hasGemini    = !!process.env.GEMINI_API_KEY;
    const hasDeepSeek  = !!process.env.DEEPSEEK_API_KEY;
    this.modelConfigs.claudePro.enabled  = hasAnthropic;
    this.modelConfigs.claude.enabled     = hasAnthropic;
    this.modelConfigs.claudeFast.enabled = hasAnthropic;
    this.modelConfigs.gemini.enabled     = hasGemini;
    this.modelConfigs.deepseek.enabled   = hasDeepSeek;
    if (!this.modelConfigs[this.activeModel]?.enabled) {
      this.activeModel = this._bestModel();
    }
  }

  async generateCommands(prompt, options = {}) {
    const modelName = options.model || this.activeModel;
    const model     = this.models[modelName];
    if (!model) throw new Error(`Model not found: ${modelName}`);
    if (!this.modelConfigs[modelName].enabled) throw new Error(`Model not enabled: ${modelName}`);

    try {
      const result = await model.generateCommands(
        prompt,
        options.gameContext || null,
        options.history     || []
      );
      result.model     = modelName;
      result.timestamp = new Date().toISOString();
      return result;
    } catch (error) {
      console.error(`[MODELS] ${modelName} failed:`, error.message);
      const fallbacks = ['claudeFast', 'gemini', 'deepseek', 'ollama', 'local'];
      for (const fb of fallbacks) {
        if (fb !== modelName && this.modelConfigs[fb].enabled) {
          console.log(`[MODELS] Falling back to ${fb}`);
          try {
            const r      = await this.models[fb].generateCommands(prompt, null, []);
            r.model      = fb;
            r.fallback   = true;
            r.timestamp  = new Date().toISOString();
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
