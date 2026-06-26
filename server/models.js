const axios = require('axios');

class ModelRouter {
  constructor() {
    this.models = {
      claude: new ClaudeModel(),
      gemini: new GeminiModel(),
      ollama: new OllamaModel(),
      deepseek: new DeepSeekModel(),
      codex: new CodexModel(),
      cursor: new CursorModel(),
      local: new LocalModel()
    };

    this.activeModel = 'claude';
    this.modelConfigs = {
      claude: {
        enabled: !!process.env.ANTHROPIC_API_KEY,
        speed: 0.8,
        quality: 0.95,
        cost: 'paid'
      },
      gemini: {
        enabled: !!process.env.GEMINI_API_KEY,
        speed: 0.9,
        quality: 0.90,
        cost: 'paid'
      },
      ollama: {
        enabled: true,
        speed: 0.95,
        quality: 0.75,
        cost: 'free',
        url: 'http://127.0.0.1:11434'
      },
      deepseek: {
        enabled: !!process.env.DEEPSEEK_API_KEY,
        speed: 0.85,
        quality: 0.88,
        cost: 'paid'
      },
      codex: {
        enabled: !!process.env.OPENAI_API_KEY,
        speed: 0.75,
        quality: 0.92,
        cost: 'paid'
      },
      cursor: {
        enabled: !!process.env.CURSOR_API_KEY,
        speed: 0.8,
        quality: 0.94,
        cost: 'paid'
      },
      local: {
        enabled: true,
        speed: 1.0,
        quality: 0.60,
        cost: 'free'
      }
    };
  }

  async generateCommands(prompt, options = {}) {
    const modelName = options.model || this.activeModel;
    const model = this.models[modelName];

    if (!model) {
      throw new Error(`Model not found: ${modelName}`);
    }

    const config = this.modelConfigs[modelName];
    if (!config.enabled) {
      throw new Error(`Model not enabled: ${modelName}`);
    }

    try {
      const result = await model.generateCommands(prompt);

      result.model = modelName;
      result.timestamp = new Date().toISOString();
      result.performance = {
        speed: config.speed,
        quality: config.quality
      };

      return result;
    } catch (error) {
      console.error(`[MODELS] Error with ${modelName}:`, error.message);

      if (modelName !== 'local') {
        console.log(`[MODELS] Fallback to local model`);
        return this.models.local.generateCommands(prompt);
      }

      throw error;
    }
  }

  setActiveModel(modelName) {
    if (!this.models[modelName]) {
      throw new Error(`Unknown model: ${modelName}`);
    }

    const config = this.modelConfigs[modelName];
    if (!config.enabled) {
      throw new Error(`Model not enabled: ${modelName}`);
    }

    this.activeModel = modelName;
    return { active: modelName, config };
  }

  getAvailableModels() {
    const available = [];

    for (const [name, config] of Object.entries(this.modelConfigs)) {
      if (config.enabled) {
        available.push({
          name,
          speed: config.speed,
          quality: config.quality,
          cost: config.cost,
          active: name === this.activeModel
        });
      }
    }

    return available;
  }

  getModelConfig(modelName) {
    return {
      name: modelName,
      ...this.modelConfigs[modelName],
      model: this.models[modelName]
    };
  }
}

class ClaudeModel {
  async generateCommands(prompt) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const systemPrompt = this._getSystemPrompt();

    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }]
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          timeout: 30000
        }
      );

      const text = response.data.content[0].text;
      const commands = this._parseCommands(text);

      return {
        success: true,
        commands,
        explanation: text,
        analysis: this._analyze(commands)
      };
    } catch (error) {
      throw new Error(`Claude API: ${error.message}`);
    }
  }

  _getSystemPrompt() {
    return `You are an expert Roblox game designer AI. Generate ONLY valid JSON command arrays.

STRICT: Return ONLY JSON array, no markdown, no explanations outside JSON.

ACTIONS: CreateInstance, CreatePart, CreateFolder, CreateScript, CreateUI, SetProperty, GetProperty, DeleteInstance, RenameInstance, MoveInstance, CloneInstance, GetExplorerTree, EditScript

ALWAYS:
1. Plan multi-step solutions (think step-by-step)
2. Add visual appeal (colors, sizes, positioning)
3. Add interactivity (scripts when relevant)
4. Fix errors automatically
5. Optimize performance

Example perfect response:
[
  {"action":"CreatePart","data":{"parent":"Workspace","name":"Platform1","shape":"Block","properties":{"Size":[4,1,4],"Color":[0,255,0],"Anchored":true}}},
  {"action":"CreatePart","data":{"parent":"Workspace","name":"Platform2","shape":"Block","properties":{"Size":[4,1,4],"Position":[5,2,0],"Color":[0,0,255],"Anchored":true}}}
]`;
  }

  _parseCommands(text) {
    let jsonStr = text.trim();

    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const commands = JSON.parse(jsonStr.trim());
    return Array.isArray(commands) ? commands : [commands];
  }

  _analyze(commands) {
    return {
      commandCount: commands.length,
      types: [...new Set(commands.map(c => c.action))],
      complexity: commands.length > 10 ? 'high' : commands.length > 5 ? 'medium' : 'low',
      estimatedExecutionTime: Math.ceil(commands.length * 50) + 'ms'
    };
  }
}

class GeminiModel {
  async generateCommands(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');

    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          contents: [{
            parts: [{
              text: this._getSystemPrompt() + '\n\nUser request: ' + prompt
            }]
          }]
        },
        { timeout: 30000 }
      );

      const text = response.data.candidates[0].content.parts[0].text;
      const commands = this._parseCommands(text);

      return {
        success: true,
        commands,
        explanation: text
      };
    } catch (error) {
      throw new Error(`Gemini API: ${error.message}`);
    }
  }

  _getSystemPrompt() {
    return 'Generate ONLY valid JSON Roblox commands array. No markdown.';
  }

  _parseCommands(text) {
    let jsonStr = text.match(/\[[\s\S]*\]/)?.[0] || text;
    return JSON.parse(jsonStr);
  }
}

class OllamaModel {
  async generateCommands(prompt) {
    const url = 'http://127.0.0.1:11434/api/generate';

    try {
      const response = await axios.post(
        url,
        {
          model: 'mistral',
          prompt: `Generate ONLY JSON Roblox commands: ${prompt}`,
          stream: false
        },
        { timeout: 120000 }
      );

      const text = response.data.response;
      const commands = this._parseCommands(text);

      return {
        success: true,
        commands,
        explanation: text,
        local: true
      };
    } catch (error) {
      throw new Error(`Ollama: ${error.message}. Make sure Ollama is running on port 11434`);
    }
  }

  _parseCommands(text) {
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) throw new Error('No JSON found in Ollama response');
    return JSON.parse(match[0]);
  }
}

class DeepSeekModel {
  async generateCommands(prompt) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

    try {
      const response = await axios.post(
        'https://api.deepseek.com/chat/completions',
        {
          model: 'deepseek-coder',
          messages: [
            {
              role: 'system',
              content: 'You are a Roblox AI. Generate ONLY JSON command arrays.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 4096
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const text = response.data.choices[0].message.content;
      const commands = this._parseCommands(text);

      return {
        success: true,
        commands,
        explanation: text
      };
    } catch (error) {
      throw new Error(`DeepSeek API: ${error.message}`);
    }
  }

  _parseCommands(text) {
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) throw new Error('No JSON found');
    return JSON.parse(match[0]);
  }
}

class CodexModel {
  async generateCommands(prompt) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'Generate ONLY JSON Roblox commands.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 4096
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const text = response.data.choices[0].message.content;
      const commands = this._parseCommands(text);

      return {
        success: true,
        commands,
        explanation: text
      };
    } catch (error) {
      throw new Error(`OpenAI/Codex API: ${error.message}`);
    }
  }

  _parseCommands(text) {
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) throw new Error('No JSON found');
    return JSON.parse(match[0]);
  }
}

class CursorModel {
  async generateCommands(prompt) {
    const apiKey = process.env.CURSOR_API_KEY;
    if (!apiKey) throw new Error('CURSOR_API_KEY not set');

    try {
      const response = await axios.post(
        'https://api.cursor.sh/v1/completions',
        {
          prompt: `Generate JSON Roblox commands:\n${prompt}`,
          max_tokens: 4096,
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const text = response.data.choices[0].text;
      const commands = this._parseCommands(text);

      return {
        success: true,
        commands,
        explanation: text
      };
    } catch (error) {
      throw new Error(`Cursor API: ${error.message}`);
    }
  }

  _parseCommands(text) {
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) throw new Error('No JSON found');
    return JSON.parse(match[0]);
  }
}

class LocalModel {
  async generateCommands(prompt) {
    // Simple local fallback - generates basic commands
    const commands = this._generateBasicCommands(prompt);

    return {
      success: true,
      commands,
      explanation: 'Generated with local model',
      local: true
    };
  }

  _generateBasicCommands(prompt) {
    const lowerPrompt = prompt.toLowerCase();

    const commands = [];

    if (lowerPrompt.includes('part') || lowerPrompt.includes('block') || lowerPrompt.includes('platform')) {
      commands.push({
        action: 'CreatePart',
        data: {
          parent: 'Workspace',
          name: 'Part',
          shape: 'Block',
          properties: {
            Size: [4, 1, 4],
            Anchored: true,
            Color: [Math.random() * 255, Math.random() * 255, Math.random() * 255]
          }
        }
      });
    }

    if (lowerPrompt.includes('folder')) {
      commands.push({
        action: 'CreateFolder',
        data: {
          parent: 'Workspace',
          name: 'Folder'
        }
      });
    }

    if (lowerPrompt.includes('script')) {
      commands.push({
        action: 'CreateScript',
        data: {
          parent: 'Workspace',
          name: 'Script',
          code: "print('Hello from local model')"
        }
      });
    }

    if (commands.length === 0) {
      commands.push({
        action: 'GetExplorerTree',
        data: {}
      });
    }

    return commands;
  }
}

module.exports = ModelRouter;
