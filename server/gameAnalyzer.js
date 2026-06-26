const fs = require('fs');
const path = require('path');

class GameAnalyzer {
  constructor(wsManager) {
    this.wsManager = wsManager;
    this.lastAnalysis = null;
    this.cache = {};
  }

  async analyzeWorkspace() {
    console.log('[GameAnalyzer] Starting workspace analysis...');

    try {
      const connectionId = this.wsManager.getActiveConnection();
      if (!connectionId) {
        throw new Error('No plugin connected');
      }

      // Request workspace tree from plugin
      const tree = await this._requestExplorerTree(connectionId);

      const analysis = {
        timestamp: new Date().toISOString(),
        summary: this._summarizeTree(tree),
        structure: tree,
        stats: this._getStats(tree),
        suggestions: this._generateSuggestions(tree),
        examples: this._generateExamples(tree)
      };

      this.lastAnalysis = analysis;
      this.cache.workspace = tree;

      return analysis;
    } catch (error) {
      console.error('[GameAnalyzer] Error:', error.message);
      throw error;
    }
  }

  async deepAnalyze(includeScripts = true) {
    console.log('[GameAnalyzer] Deep analysis starting...');

    try {
      const basic = await this.analyzeWorkspace();

      const deep = {
        ...basic,
        scripts: includeScripts ? this._analyzeScripts(basic.structure) : [],
        hierarchy: this._analyzeHierarchy(basic.structure),
        complexity: this._calculateComplexity(basic.structure),
        recommendations: this._getRecommendations(basic.structure),
        issues: this._detectIssues(basic.structure)
      };

      return deep;
    } catch (error) {
      console.error('[GameAnalyzer] Deep analyze error:', error.message);
      throw error;
    }
  }

  _requestExplorerTree(connectionId) {
    return new Promise((resolve, reject) => {
      const command = {
        id: `analyze_${Date.now()}`,
        action: 'GetExplorerTree',
        data: { maxDepth: 20 }
      };

      const timeout = setTimeout(() => {
        reject(new Error('Explorer tree request timeout'));
      }, 30000);

      const handler = (result) => {
        if (result.commandId === command.id) {
          clearTimeout(timeout);
          this.wsManager.removeListener('result', handler);

          if (result.success) {
            resolve(result.result);
          } else {
            reject(new Error(result.error || 'Failed to get explorer tree'));
          }
        }
      };

      this.wsManager.on('result', handler);

      try {
        this.wsManager.sendCommand(connectionId, command);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  _summarizeTree(tree) {
    const summary = {
      workspaceItems: tree.Workspace ? this._countItems(tree.Workspace) : 0,
      guiItems: tree.StarterGui ? this._countItems(tree.StarterGui) : 0,
      storageItems: tree.ReplicatedStorage ? this._countItems(tree.ReplicatedStorage) : 0,
      serverItems: tree.ServerScriptService ? this._countItems(tree.ServerScriptService) : 0
    };

    return summary;
  }

  _countItems(node) {
    if (!node || !node.children) return 1;
    return 1 + node.children.reduce((sum, child) => sum + this._countItems(child), 0);
  }

  _getStats(tree) {
    const stats = {
      totalInstances: 0,
      byType: {},
      depth: 0,
      largestBranch: '',
      complexity: 'simple'
    };

    const analyze = (node, depth = 0) => {
      if (!node) return;

      stats.totalInstances++;
      stats.depth = Math.max(stats.depth, depth);

      const type = node.className || 'Unknown';
      stats.byType[type] = (stats.byType[type] || 0) + 1;

      if (node.children && node.children.length > 0) {
        node.children.forEach(child => analyze(child, depth + 1));
      }
    };

    // Analyze all areas
    Object.values(tree).forEach(node => analyze(node, 0));

    // Determine complexity
    if (stats.totalInstances > 100) {
      stats.complexity = 'very-complex';
    } else if (stats.totalInstances > 50) {
      stats.complexity = 'complex';
    } else if (stats.totalInstances > 20) {
      stats.complexity = 'moderate';
    } else {
      stats.complexity = 'simple';
    }

    return stats;
  }

  _generateSuggestions(tree) {
    const suggestions = [];

    // Analyze structure and suggest improvements
    const workspace = tree.Workspace;
    if (!workspace || !workspace.children || workspace.children.length === 0) {
      suggestions.push({
        type: 'structure',
        priority: 'low',
        message: 'Workspace is empty. Consider building some game elements.',
        example: 'create a spawn platform and some obstacles'
      });
    }

    const gui = tree.StarterGui;
    if (!gui || !gui.children || gui.children.length === 0) {
      suggestions.push({
        type: 'ui',
        priority: 'low',
        message: 'No UI found. Game could benefit from a user interface.',
        example: 'create a ScreenGui with a welcome message and start button'
      });
    }

    // Suggest based on workspace size
    const stats = this._getStats(tree);
    if (stats.totalInstances < 10) {
      suggestions.push({
        type: 'content',
        priority: 'medium',
        message: 'Game seems small. Consider adding more content.',
        example: 'build an obstacle course with multiple sections'
      });
    }

    return suggestions;
  }

  _generateExamples(tree) {
    const examples = [];

    // Generate contextual examples based on what exists
    const stats = this._getStats(tree);

    if (stats.byType.Part || stats.byType.Folder) {
      examples.push('add platforms in a row to create a path');
      examples.push('create a staircase by placing parts at increasing heights');
    }

    if (!stats.byType.Script && !stats.byType.LocalScript) {
      examples.push('add a script to make parts rotate');
      examples.push('create a script that makes players lose health on lava');
    }

    if (!stats.byType.ScreenGui) {
      examples.push('create a score counter GUI');
      examples.push('add a start button to begin the game');
    }

    // Always include some basic examples
    examples.push('create a checkpoint system');
    examples.push('build a finish platform with win detection');
    examples.push('add teleporting pads between sections');

    return examples.slice(0, 5); // Return top 5
  }

  _analyzeScripts(tree) {
    const scripts = [];

    const findScripts = (node) => {
      if (!node) return;

      if (node.className === 'Script' || node.className === 'LocalScript') {
        scripts.push({
          name: node.name,
          type: node.className,
          path: node.name // Would be full path in real implementation
        });
      }

      if (node.children) {
        node.children.forEach(findScripts);
      }
    };

    Object.values(tree).forEach(findScripts);
    return scripts;
  }

  _analyzeHierarchy(tree) {
    const hierarchy = {};

    const analyze = (node, area) => {
      if (!node) return;

      if (!hierarchy[area]) {
        hierarchy[area] = {
          root: node.name,
          depth: 0,
          itemCount: 0,
          children: []
        };
      }

      hierarchy[area].itemCount = this._countItems(node);
      hierarchy[area].depth = this._getDepth(node);
    };

    Object.entries(tree).forEach(([area, node]) => {
      analyze(node, area);
    });

    return hierarchy;
  }

  _getDepth(node) {
    if (!node || !node.children || node.children.length === 0) return 1;
    return 1 + Math.max(...node.children.map(child => this._getDepth(child)));
  }

  _calculateComplexity(tree) {
    const stats = this._getStats(tree);

    return {
      score: Math.min(100, Math.round((stats.totalInstances / 100) * 100)),
      level: stats.complexity,
      breakdown: {
        instanceCount: stats.totalInstances,
        uniqueTypes: Object.keys(stats.byType).length,
        maxDepth: stats.depth
      }
    };
  }

  _getRecommendations(tree) {
    const recommendations = [];
    const stats = this._getStats(tree);

    if (stats.totalInstances > 200) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: 'Consider optimizing - lots of instances',
        action: 'Consider grouping objects into models or using unions'
      });
    }

    if (stats.depth > 15) {
      recommendations.push({
        type: 'structure',
        priority: 'medium',
        message: 'Deep hierarchy might impact performance',
        action: 'Consider flattening some object groups'
      });
    }

    if (!stats.byType.Script && !stats.byType.LocalScript) {
      recommendations.push({
        type: 'gameplay',
        priority: 'low',
        message: 'No scripts found',
        action: 'Consider adding interactive elements with scripts'
      });
    }

    return recommendations;
  }

  _detectIssues(tree) {
    const issues = [];

    // Look for common issues
    const detectIssuesRecursive = (node, path = '') => {
      if (!node) return;

      const currentPath = path ? `${path}/${node.name}` : node.name;

      // Check for parts floating in space without anchors
      if (node.className === 'Part') {
        // Would need actual property inspection here
        // This is placeholder for structure
      }

      if (node.children) {
        node.children.forEach(child => detectIssuesRecursive(child, currentPath));
      }
    };

    Object.values(tree).forEach(node => detectIssuesRecursive(node));

    return issues;
  }

  getSummary() {
    if (!this.lastAnalysis) {
      return { error: 'No analysis performed yet' };
    }

    return {
      timestamp: this.lastAnalysis.timestamp,
      stats: this.lastAnalysis.stats,
      suggestions: this.lastAnalysis.suggestions,
      examples: this.lastAnalysis.examples
    };
  }

  getExamples() {
    if (!this.lastAnalysis) {
      return ['create a red part', 'build a platform', 'add a script'];
    }

    return this.lastAnalysis.examples;
  }
}

module.exports = GameAnalyzer;
