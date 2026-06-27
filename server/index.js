require('dotenv').config();

const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const WebSocketManager = require('./websocket');
const ModelRouter = require('./models');
const CommandEngine = require('./commandEngine');
const SmartExecutor = require('./smartExecutor');
const ErrorTracker = require('./errorTracker');
const GameAnalyzer = require('./gameAnalyzer');
const GameAntivirus = require('./antivirus');
const AutoMigrator = require('./autoMigrator');
const AutoUpdater = require('./autoUpdater');
const Protocol = require('./protocol');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 7777;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../ui')));

const wsManager = new WebSocketManager(server);
const modelRouter = new ModelRouter();
const commandEngine = new CommandEngine(wsManager);
const errorTracker = new ErrorTracker();
const smartExecutor = new SmartExecutor(commandEngine, errorTracker);
const gameAnalyzer = new GameAnalyzer(wsManager);
const gameAntivirus = new GameAntivirus();
const autoMigrator = new AutoMigrator();
const autoUpdater = new AutoUpdater();

// Lightweight game context — skip slow Studio round-trips unless debugging/fixing
async function resolveGameContext(prompt) {
  const cached = wsManager.getLastKnownState();
  const needsLive = /\b(current|existing|fix|update|modify|edit|change|debug|broken|not working|what's in|show me)\b/i.test(prompt);

  if (!needsLive) {
    return cached && Object.keys(cached).length ? { lastKnownState: cached } : null;
  }

  const conn = commandEngine.getActiveConnection();
  if (!conn) return cached ? { lastKnownState: cached } : null;

  try {
    const gameInfo = await commandEngine.executeCommand({ action: 'GetGameInfo', data: {} });
    return { gameInfo, lastKnownState: cached };
  } catch (_) {
    return cached ? { lastKnownState: cached } : null;
  }
}

// ── Plugin HTTP transport endpoints (Roblox can't use WebSockets) ──────────
app.get('/plugin/poll', (req, res) => wsManager.pluginPoll(req, res));
app.post('/plugin',     (req, res) => wsManager.pluginReceive(req, res));

// ── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status:        'ok',
    pluginOnline:  wsManager.isPluginConnected(),
    wsConnections: wsManager.getConnectionCount(),
    models:        modelRouter.getAvailableModels(),
    timestamp:     new Date().toISOString(),
  });
});

// Generate AI plan (chat + commands) — no Studio execution
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, model, history } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt required' });

    const gameContext = await resolveGameContext(prompt);
    const generation = await modelRouter.generateCommands(prompt, { model, gameContext, history: history || [] });

    if (!generation.commands || !Array.isArray(generation.commands)) {
      throw new Error('Invalid response from AI model - no commands generated');
    }

    if (generation.commands.length > 0) {
      Protocol.validateCommandBatch(generation.commands);
    }

    res.json({
      success:  true,
      message:  generation.message || '',
      commands: generation.commands,
      model:    generation.model,
      analysis: generation.analysis,
    });
  } catch (error) {
    errorTracker.logError(error, { endpoint: '/api/generate', type: 'generation' });
    res.status(500).json({ error: error.message, success: false });
  }
});

// Apply commands to Studio only
app.post('/api/apply', async (req, res) => {
  try {
    const { commands, enhance } = req.body;
    if (!commands || !Array.isArray(commands) || commands.length === 0) {
      return res.status(400).json({ error: 'Commands array required' });
    }

    Protocol.validateCommandBatch(commands);
    const startTime = Date.now();
    const execution = await smartExecutor.executeWithAnalysis(commands, {
      skipEnhancements: !enhance,
      includeExplorer: false,
    });

    res.json({
      success: execution.success,
      results: execution.results,
      analysis: {
        commandCount: commands.length,
        executionTime: (Date.now() - startTime) + 'ms',
      },
    });
  } catch (error) {
    errorTracker.logError(error, { endpoint: '/api/apply', type: 'execution' });
    res.status(500).json({ error: error.message, success: false });
  }
});

// Execute with AI (generate + apply in one call)
app.post('/api/execute', async (req, res) => {
  try {
    const { prompt, model, enhance, history } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt required' });
    }

    const startTime = Date.now();
    const gameContext = await resolveGameContext(prompt);
    const generation = await modelRouter.generateCommands(prompt, { model, gameContext, history: history || [] });

    if (!generation.commands || !Array.isArray(generation.commands)) {
      throw new Error('Invalid response from AI model - no commands generated');
    }

    if (generation.commands.length > 0) {
      Protocol.validateCommandBatch(generation.commands);
    }

    let execution = { success: true, results: [] };
    if (generation.commands.length > 0) {
      execution = await smartExecutor.executeWithAnalysis(generation.commands, {
        skipEnhancements: !enhance,
        includeExplorer: false,
      });
    }

    const duration = Date.now() - startTime;

    if (execution.success && generation.commands.length > 0) {
      autoMigrator.migrateGameState({
        commands: generation.commands.length,
        executedAt: new Date().toISOString(),
        model: generation.model,
      });
    }

    res.json({
      success: execution.success,
      message: generation.message || '',
      model: generation.model,
      commands: generation.commands,
      results: execution.results,
      analysis: {
        ...generation.analysis,
        executionTime: duration + 'ms',
      },
    });
  } catch (error) {
    errorTracker.logError(error, { endpoint: '/api/execute', type: 'execution' });
    res.status(500).json({
      error: error.message,
      success: false,
    });
  }
});

// Analyze game workspace
app.post('/api/analyze', async (req, res) => {
  try {
    const { deep } = req.body;

    const analysis = deep
      ? await gameAnalyzer.deepAnalyze(true)
      : await gameAnalyzer.analyzeWorkspace();

    res.json({
      success: true,
      analysis,
      examples: analysis.examples,
      suggestions: analysis.suggestions
    });
  } catch (error) {
    errorTracker.logError(error, { endpoint: '/api/analyze', type: 'analysis' });
    res.status(500).json({
      error: error.message,
      success: false
    });
  }
});

// Scan game for issues (Antivirus)
app.post('/api/scan', async (req, res) => {
  try {
    // Get workspace tree
    const analysis = await gameAnalyzer.analyzeWorkspace();

    // Scan for issues
    const scanReport = await gameAntivirus.scanWorkspace(
      analysis.structure,
      analysis.scripts || []
    );

    const formatted = gameAntivirus.formatReportForChat();

    res.json({
      success: true,
      scan: scanReport,
      report: formatted,
      shouldPatch: scanReport.status !== 'clean'
    });
  } catch (error) {
    errorTracker.logError(error, { endpoint: '/api/scan', type: 'security' });
    res.status(500).json({
      error: error.message,
      success: false
    });
  }
});

// Get scan recommendations
app.get('/api/scan/recommendations', (req, res) => {
  const results = gameAntivirus.getScanResults();

  if (!results || !results.findings) {
    return res.json({
      message: 'No scan performed yet',
      recommendations: []
    });
  }

  const recommendations = results.findings
    .filter(f => f.type === 'risk' || f.type === 'warning')
    .map(f => ({
      severity: f.severity,
      issue: f.issue,
      location: f.location,
      file: f.file,
      line: f.line,
      suggestion: f.suggestion,
      shouldPatch: gameAntivirus.shouldPatch(f),
      patchSuggestion: gameAntivirus.patchSuggestion(f)
    }));

  res.json({
    count: recommendations.length,
    recommendations
  });
});

// Get workspace examples
app.get('/api/analyze/examples', async (req, res) => {
  try {
    const analysis = gameAnalyzer.getSummary();
    res.json({
      examples: analysis.examples || [
        'create a red part',
        'build a platform',
        'add a checkpoint'
      ]
    });
  } catch (error) {
    res.json({
      examples: ['create a red part', 'build a platform', 'add a script']
    });
  }
});

// Get models
app.get('/api/models', (req, res) => {
  res.json({
    available: modelRouter.getAvailableModels(),
    active: modelRouter.activeModel
  });
});

// Set active model
app.post('/api/models/set', (req, res) => {
  try {
    const { model } = req.body;
    if (!model) {
      return res.status(400).json({ error: 'Model name required' });
    }

    const result = modelRouter.setActiveModel(model);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
      success: false
    });
  }
});

// Error tracking
app.get('/api/errors', (req, res) => {
  res.json(errorTracker.getErrorStats());
});

app.get('/api/errors/export', (req, res) => {
  const format = req.query.format || 'json';
  const data = errorTracker.exportErrors(format);

  if (format === 'csv') {
    res.type('text/csv').send(data);
  } else {
    res.json(JSON.parse(data));
  }
});

// Stats
app.get('/api/stats', (req, res) => {
  res.json({
    smartExecutor: smartExecutor.getStats(),
    errors: errorTracker.getErrorStats(),
    connections: wsManager.getConnectionCount(),
    migrator: autoMigrator.getStats()
  });
});

// Game state
app.get('/api/state', (req, res) => {
  const state = wsManager.getLastKnownState();
  res.json(state || { ready: false });
});

// Plugin status
app.get('/api/status', (req, res) => {
  res.json({
    connections: wsManager.getAllConnections().map(conn => ({
      id: conn.id,
      connected: conn.connected ?? conn.ready ?? conn.readyState === 1,
      lastUpdate: conn.lastUpdate
    }))
  });
});

// Migration stats
app.get('/api/migrations', (req, res) => {
  res.json(autoMigrator.getStats());
});

// Version info
app.get('/api/version', (req, res) => {
  res.json(autoUpdater.getVersionInfo());
});

// Check for updates
app.get('/api/version/check', async (req, res) => {
  try {
    const result = await autoUpdater.checkAndNotify();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get update instructions
app.get('/api/version/update-info', async (req, res) => {
  try {
    const result = await autoUpdater.checkAndNotify();
    const instructions = autoUpdater.versionManager.getUpdateInstructions();
    res.json({
      ...result,
      instructions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get changelog
app.get('/api/version/changelog', (req, res) => {
  const changelog = autoUpdater.versionManager.getChangelog();
  res.type('text/markdown').send(changelog);
});

// ── API key config ──────────────────────────────────────────────────────────
const ENV_PATH = path.join(__dirname, '..', '.env');

app.get('/api/config', (req, res) => {
  res.json({
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    gemini:    !!process.env.GEMINI_API_KEY,
    deepseek:  !!process.env.DEEPSEEK_API_KEY,
  });
});

app.post('/api/config', (req, res) => {
  const { anthropicKey, geminiKey, deepseekKey } = req.body;

  if (anthropicKey !== undefined) process.env.ANTHROPIC_API_KEY = anthropicKey || '';
  if (geminiKey    !== undefined) process.env.GEMINI_API_KEY    = geminiKey    || '';
  if (deepseekKey  !== undefined) process.env.DEEPSEEK_API_KEY  = deepseekKey  || '';

  const lines = [];
  if (process.env.ANTHROPIC_API_KEY) lines.push(`ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`);
  if (process.env.GEMINI_API_KEY)    lines.push(`GEMINI_API_KEY=${process.env.GEMINI_API_KEY}`);
  if (process.env.DEEPSEEK_API_KEY)  lines.push(`DEEPSEEK_API_KEY=${process.env.DEEPSEEK_API_KEY}`);
  if (process.env.PORT && process.env.PORT !== '7777') lines.push(`PORT=${process.env.PORT}`);
  if (process.env.OLLAMA_MODEL)      lines.push(`OLLAMA_MODEL=${process.env.OLLAMA_MODEL}`);

  try { fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n'); } catch (e) { console.warn('[config] Could not write .env:', e.message); }

  modelRouter.refreshConfigs();

  res.json({ success: true, models: modelRouter.getAvailableModels() });
});

// UI root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../ui/index.html'));
});

// Initialize
wsManager.initialize();

// Check for updates on launch
(async () => {
  await autoUpdater.checkAndNotify();
})();

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`\n╔════════════════════════════════════════════╗`);
  console.log(`║  VortexDQ AI Controller - Ready             ║`);
  console.log(`╚════════════════════════════════════════════╝\n`);
  console.log(`🌐 Web UI:  http://127.0.0.1:${PORT}`);
  console.log(`📡 WebSocket: ws://127.0.0.1:${PORT}`);
  console.log(`🤖 Models: ${modelRouter.getAvailableModels().map(m => m.name).join(', ')}\n`);
});

process.on('unhandledRejection', (reason, promise) => {
  errorTracker.logError(reason, { type: 'unhandledRejection' });
});

process.on('uncaughtException', (error) => {
  errorTracker.logError(error, { type: 'uncaughtException' });
});

module.exports = {
  app,
  server,
  wsManager,
  modelRouter,
  commandEngine,
  errorTracker,
  smartExecutor,
  gameAnalyzer,
  gameAntivirus,
  autoMigrator
};
