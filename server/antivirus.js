class GameAntivirus {
  constructor() {
    this.scanResults = [];
    this.issues = [];
    this.riskPatterns = {
      malicious: [
        'game:Shutdown()',
        'os.execute',
        'loadstring',
        'require.*http',
        'getfenv',
        'setfenv',
        'pcall.*loadstring'
      ],
      suspicious: [
        'game:FindService',
        'BindToClose',
        'AncestryChanged',
        'workspace:ClearAllChildren'
      ],
      performance: [
        'while true do',
        'expensive loop patterns',
        'recursive without limit'
      ]
    };
  }

  async scanWorkspace(tree, scripts = []) {
    console.log('[Antivirus] Starting security scan...');

    const scanReport = {
      timestamp: new Date().toISOString(),
      status: 'clean',
      findings: [],
      statistics: {
        totalScripts: scripts.length,
        risksFound: 0,
        warningsFound: 0,
        infoFound: 0
      },
      recommendations: []
    };

    // Scan structure
    this._scanStructure(tree, scanReport);

    // Scan scripts
    if (scripts && scripts.length > 0) {
      for (const script of scripts) {
        this._scanScript(script, scanReport);
      }
    }

    // Scan for orphaned instances
    this._scanForOrphaned(tree, scanReport);

    // Determine overall status
    if (scanReport.statistics.risksFound > 0) {
      scanReport.status = 'at-risk';
    } else if (scanReport.statistics.warningsFound > 0) {
      scanReport.status = 'needs-review';
    }

    this.scanResults = scanReport;
    return scanReport;
  }

  _scanStructure(tree, report) {
    const analyze = (node, path = '') => {
      if (!node) return;

      const currentPath = path ? `${path}/${node.name}` : node.name;

      // Check for problematic instance types
      if (this._isProblematicType(node.className)) {
        report.findings.push({
          type: 'warning',
          severity: 'medium',
          location: currentPath,
          issue: `Potentially risky instance type: ${node.className}`,
          suggestion: `Review usage of ${node.className} - ensure it's necessary`,
          file: currentPath,
          line: 'N/A - instance property'
        });
        report.statistics.warningsFound++;
      }

      if (node.children) {
        node.children.forEach(child => analyze(child, currentPath));
      }
    };

    Object.entries(tree).forEach(([area, node]) => {
      analyze(node, area);
    });
  }

  _scanScript(script, report) {
    const fileName = script.name || 'Unknown';
    const code = script.code || '';

    if (!code) return;

    const lines = code.split('\n');

    lines.forEach((line, lineNumber) => {
      const lineNum = lineNumber + 1;

      // Check for malicious patterns
      for (const pattern of this.riskPatterns.malicious) {
        if (new RegExp(pattern, 'i').test(line)) {
          report.findings.push({
            type: 'risk',
            severity: 'critical',
            location: `${fileName}:${lineNum}`,
            issue: `Potentially malicious code detected: ${pattern}`,
            code: line.trim(),
            suggestion: 'Review and remove if not absolutely necessary',
            file: fileName,
            line: lineNum
          });
          report.statistics.risksFound++;
        }
      }

      // Check for suspicious patterns
      for (const pattern of this.riskPatterns.suspicious) {
        if (new RegExp(pattern, 'i').test(line)) {
          report.findings.push({
            type: 'warning',
            severity: 'medium',
            location: `${fileName}:${lineNum}`,
            issue: `Suspicious code pattern: ${pattern}`,
            code: line.trim(),
            suggestion: 'Verify this is intentional and safe',
            file: fileName,
            line: lineNum
          });
          report.statistics.warningsFound++;
        }
      }

      // Check for performance issues
      if (/while\s*true/i.test(line)) {
        report.findings.push({
          type: 'info',
          severity: 'low',
          location: `${fileName}:${lineNum}`,
          issue: 'Infinite loop detected - ensure proper exit condition',
          code: line.trim(),
          suggestion: 'Add a break statement or use RunService instead',
          file: fileName,
          line: lineNum
        });
        report.statistics.infoFound++;
      }
    });
  }

  _scanForOrphaned(tree, report) {
    // Look for instances that serve no apparent purpose
    const analyze = (node, parent = null) => {
      if (!node) return;

      // Check for empty folders
      if (node.className === 'Folder' && (!node.children || node.children.length === 0)) {
        report.findings.push({
          type: 'info',
          severity: 'low',
          location: node.name,
          issue: 'Empty folder found',
          suggestion: 'Consider removing empty folders to keep project clean',
          file: node.name,
          line: 'N/A'
        });
        report.statistics.infoFound++;
      }

      if (node.children) {
        node.children.forEach(child => analyze(child, node));
      }
    };

    Object.values(tree).forEach(node => analyze(node));
  }

  _isProblematicType(className) {
    const problematic = [
      'LocalizationTable',
      'RemoteFunction',
      'BindableFunction'
    ];

    return problematic.includes(className);
  }

  formatReportForChat() {
    if (!this.scanResults || this.scanResults.findings.length === 0) {
      return {
        summary: '✓ Game scan complete - no issues found!',
        status: 'clean',
        details: []
      };
    }

    const grouped = {
      risks: this.scanResults.findings.filter(f => f.type === 'risk'),
      warnings: this.scanResults.findings.filter(f => f.type === 'warning'),
      info: this.scanResults.findings.filter(f => f.type === 'info')
    };

    const report = {
      summary: `Scan found ${grouped.risks.length} risks, ${grouped.warnings.length} warnings, ${grouped.info.length} notes`,
      status: this.scanResults.status,
      details: []
    };

    if (grouped.risks.length > 0) {
      report.details.push({
        category: '🔴 Critical Risks',
        items: grouped.risks.map(f => ({
          location: f.location,
          issue: f.issue,
          code: f.code,
          suggestion: f.suggestion
        }))
      });
    }

    if (grouped.warnings.length > 0) {
      report.details.push({
        category: '🟡 Warnings',
        items: grouped.warnings.map(f => ({
          location: f.location,
          issue: f.issue,
          code: f.code || 'N/A',
          suggestion: f.suggestion
        }))
      });
    }

    if (grouped.info.length > 0) {
      report.details.push({
        category: '🔵 Info',
        items: grouped.info.map(f => ({
          location: f.location,
          issue: f.issue,
          suggestion: f.suggestion
        }))
      });
    }

    return report;
  }

  getScanResults() {
    return this.scanResults;
  }

  exportScanReport(format = 'json') {
    if (format === 'text') {
      return this._formatAsText();
    }

    return JSON.stringify(this.scanResults, null, 2);
  }

  _formatAsText() {
    let text = `SECURITY SCAN REPORT\n`;
    text += `Generated: ${this.scanResults.timestamp}\n`;
    text += `Status: ${this.scanResults.status.toUpperCase()}\n\n`;

    text += `STATISTICS:\n`;
    text += `- Total Scripts: ${this.scanResults.statistics.totalScripts}\n`;
    text += `- Risks Found: ${this.scanResults.statistics.risksFound}\n`;
    text += `- Warnings Found: ${this.scanResults.statistics.warningsFound}\n`;
    text += `- Info Notes: ${this.scanResults.statistics.infoFound}\n\n`;

    text += `FINDINGS:\n`;
    this.scanResults.findings.forEach((finding, idx) => {
      text += `\n${idx + 1}. [${finding.severity.toUpperCase()}] ${finding.issue}\n`;
      text += `   Location: ${finding.location}\n`;
      if (finding.code) text += `   Code: ${finding.code}\n`;
      text += `   Suggestion: ${finding.suggestion}\n`;
    });

    return text;
  }

  shouldPatch(finding) {
    // Return true if this finding should definitely be patched
    return finding.type === 'risk' && finding.severity === 'critical';
  }

  patchSuggestion(finding) {
    // Generate code patch suggestions
    const patches = {
      'loadstring': 'Remove and replace with proper code',
      'os.execute': 'This is not available in Roblox - remove it',
      'getfenv': 'Use _G or module variables instead',
      'while true': 'Use RunService.Heartbeat or task.wait instead'
    };

    for (const [pattern, suggestion] of Object.entries(patches)) {
      if (finding.issue.includes(pattern)) {
        return suggestion;
      }
    }

    return 'Review and remove if not necessary';
  }
}

module.exports = GameAntivirus;
