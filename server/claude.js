const axios = require('axios');

class ClaudeIntegration {
  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
    this.model = 'claude-3-5-sonnet-20241022';
    this.baseURL = 'https://api.anthropic.com/v1';
    this.maxTokens = 4096;
    this.conversationHistory = [];
    this.maxHistoryLength = 20;
  }

  isConfigured() {
    return this.apiKey.length > 0;
  }

  async generateCommands(userPrompt) {
    if (!this.isConfigured()) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }

    const systemPrompt = `You are an AI assistant that controls a Roblox game development environment through JSON commands only.

STRICT REQUIREMENTS:
1. Output ONLY valid JSON array of commands
2. NO markdown, NO explanations, NO text before/after JSON
3. Each command must have: action, data
4. Commands are case-sensitive

AVAILABLE ACTIONS:
- CreateInstance: {action: "CreateInstance", data: {className: string, parent: string, name?: string, properties?: object}}
- CreatePart: {action: "CreatePart", data: {parent: string, name?: string, shape?: "Block"|"Ball"|"Cylinder", properties?: object}}
- CreateFolder: {action: "CreateFolder", data: {parent: string, name?: string}}
- CreateScript: {action: "CreateScript", data: {parent: string, name?: string, code: string}}
- CreateUI: {action: "CreateUI", data: {parent: string, type: "ScreenGui"|"Frame"|"TextLabel"|"Button"|"TextBox", name?: string, properties?: object}}
- SetProperty: {action: "SetProperty", data: {path: string, property: string, value: any}}
- GetProperty: {action: "GetProperty", data: {path: string, property: string}}
- RenameInstance: {action: "RenameInstance", data: {path: string, newName: string}}
- DeleteInstance: {action: "DeleteInstance", data: {path: string}}
- MoveInstance: {action: "MoveInstance", data: {path: string, newParent: string}}
- CloneInstance: {action: "CloneInstance", data: {path: string, newParent?: string, newName?: string}}
- GetExplorerTree: {action: "GetExplorerTree", data: {}}
- EditScript: {action: "EditScript", data: {path: string, code: string}}

PROPERTY EXAMPLES:
- Size: [x, y, z] for parts
- Color: [r, g, b] (0-255)
- Position: [x, y, z]
- Anchored: true/false
- CanCollide: true/false
- Transparency: 0-1
- Text: string (for UI)
- TextSize: number

Return commands as a valid JSON array. Example:
[
  {"action": "CreatePart", "data": {"parent": "Workspace", "name": "Platform", "properties": {"Size": [4, 1, 4], "Color": [0, 255, 0]}}},
  {"action": "SetProperty", "data": {"path": "Workspace/Platform", "property": "Anchored", "value": true}}
]`;

    this.conversationHistory.push({
      role: 'user',
      content: userPrompt
    });

    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory.shift();
    }

    try {
      const response = await axios.post(
        `${this.baseURL}/messages`,
        {
          model: this.model,
          max_tokens: this.maxTokens,
          system: systemPrompt,
          messages: this.conversationHistory
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          timeout: 30000
        }
      );

      const assistantMessage = response.data.content[0].text;

      this.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage
      });

      // Parse JSON from response, handling potential markdown code blocks
      let jsonStr = assistantMessage.trim();

      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      jsonStr = jsonStr.trim();
      const commands = JSON.parse(jsonStr);

      if (!Array.isArray(commands)) {
        throw new Error('Claude response must be a JSON array');
      }

      return commands;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('Invalid ANTHROPIC_API_KEY');
      }
      throw new Error(`Claude API error: ${error.message}`);
    }
  }

  async executePromptWithFeedback(prompt, previousResults) {
    const feedbackPrompt = previousResults
      ? `${prompt}\n\nPrevious execution results:\n${JSON.stringify(previousResults, null, 2)}`
      : prompt;

    return this.generateCommands(feedbackPrompt);
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  getHistory() {
    return [...this.conversationHistory];
  }
}

module.exports = ClaudeIntegration;
