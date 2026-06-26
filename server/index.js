require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const WebSocketManager = require('./websocket');
const ModelRouter = require('./models');
const CommandEngine = require('./commandEngine');
const SmartExecutor = require('./smartExecutor');
const ErrorTracker = require('./errorTracker');
const GameAnalyzer = require('./gameAnalyzer');
const GameAntivirus = require('./antivirus');
const AutoMigrator = require('./autoMigrator');
const Protocol = require('./protocol');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 7777;

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    wsConnections: wsManager.getConnectionCount(),
    models: modelRouter.getAvailableModels(),
    timestamp: new Date().toISOString()
  });
});

// Execute with AI
app.post('/api/execute', async (req, res) => {
  try {
    const { prompt, model, enhance } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt required' });
    }

    const startTime = Date.now();

    // Generate commands
    const generation = await modelRouter.generateCommands(prompt, { model });

    if (!generation.commands || !Array.isArray(generation.commands)) {
      throw new Error('Invalid response from AI model - no commands generated');
    }

    Protocol.validateCommandBatch(generation.commands);

    // Smart execution
    const execution = await smartExecutor.executeWithAnalysis(generation.commands, {
      skipEnhancements: !enhance,
      includeExplorer: false
    });

    const duration = Date.now() - startTime;

    // Auto-migrate any state changes
    if (execution.success) {
      autoMigrator.migrateGameState({
        commands: generation.commands.length,
        executedAt: new Date().toISOString(),
        model: generation.model
      });
    }

    res.json({
      success: execution.success,
      model: generation.model,
      commands: generation.commands,
      results: execution.results,
      analysis: {
        ...generation.analysis,
        executionTime: duration + 'ms'
      }
    });
  } catch (error) {
    errorTracker.logError(error, { endpoint: '/api/execute', type: 'execution' });
    res.status(500).json({
      error: error.message,
      success: false
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
      connected: conn.readyState === 1,
      lastUpdate: conn.lastUpdate
    }))
  });
});

// Migration stats
app.get('/api/migrations', (req, res) => {
  res.json(autoMigrator.getStats());
});

// UI root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../ui/index.html'));
});

// Initialize
wsManager.initialize();

server.listen(PORT, '127.0.0.1', () => {
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
