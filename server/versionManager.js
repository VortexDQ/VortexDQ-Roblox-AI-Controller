const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CURRENT_VERSION = '2.0.0';

class VersionManager {
  constructor() {
    this.versionFile   = path.join(__dirname, '../version.json');
    this.changelogFile = path.join(__dirname, '../CHANGELOG.md');
    this.currentVersion = this._loadVersion();
    this._checkStatus   = null;
  }

  _loadVersion() {
    try {
      if (fs.existsSync(this.versionFile)) {
        const data = JSON.parse(fs.readFileSync(this.versionFile, 'utf8'));
        if (data && data.version) return data;
      }
    } catch (_) {}

    return {
      version:         CURRENT_VERSION,
      releaseDate:     new Date().toISOString(),
      lastUpdateCheck: null,
      updateAvailable: false,
      latestVersion:   null,
      checkStatus:     null,
    };
  }

  async checkForUpdates() {
    console.log('[VersionManager] Checking for updates...');

    // Try git tags — works without GitHub Releases
    try {
      const tag = execSync('git describe --tags --abbrev=0', {
        cwd:   path.join(__dirname, '..'),
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).toString().trim().replace(/^v/, '');

      if (tag) {
        const updateAvailable = this._compareVersions(tag, this.currentVersion.version) > 0;
        this.currentVersion = {
          ...this.currentVersion,
          lastUpdateCheck: new Date().toISOString(),
          latestVersion:   tag,
          updateAvailable,
          checkStatus:     'ok',
        };
        console.log(`[VersionManager] Latest tag: ${tag} | update=${updateAvailable}`);
        this._save();
        this._checkStatus = 'ok';
        return this.currentVersion;
      }
    } catch (_) {
      // no git or no tags — expected on fresh clones with no releases
    }

    // No tags found — silently skip, don't error
    console.log('[VersionManager] No release tags found — update check skipped.');
    this.currentVersion = {
      ...this.currentVersion,
      lastUpdateCheck: new Date().toISOString(),
      updateAvailable: false,
      latestVersion:   null,
      checkStatus:     'no-releases',
    };
    this._save();
    this._checkStatus = 'no-releases';
    return this.currentVersion;
  }

  _compareVersions(v1, v2) {
    const p1 = String(v1).split('.').map(Number);
    const p2 = String(v2).split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((p1[i] || 0) > (p2[i] || 0)) return  1;
      if ((p1[i] || 0) < (p2[i] || 0)) return -1;
    }
    return 0;
  }

  getCheckStatus() { return this._checkStatus; }

  getUpdateInstructions() {
    if (!this.currentVersion.updateAvailable) {
      return { available: false, message: 'You are already on the latest version.' };
    }
    return {
      available: true,
      current:   this.currentVersion.version,
      latest:    this.currentVersion.latestVersion,
      instructions: 'To update:\n  git pull origin main\n  npm install\n  npm start',
    };
  }

  getVersionInfo() {
    return {
      current:         this.currentVersion.version,
      releaseDate:     this.currentVersion.releaseDate,
      lastUpdateCheck: this.currentVersion.lastUpdateCheck,
      updateAvailable: this.currentVersion.updateAvailable,
      latestVersion:   this.currentVersion.latestVersion,
      checkStatus:     this.currentVersion.checkStatus,
    };
  }

  getChangelog(lines = 50) {
    try {
      if (!fs.existsSync(this.changelogFile)) return 'No changelog available.';
      return fs.readFileSync(this.changelogFile, 'utf8').split('\n').slice(0, lines).join('\n');
    } catch (_) {
      return 'Could not read changelog.';
    }
  }

  _save() {
    try {
      fs.writeFileSync(this.versionFile, JSON.stringify(this.currentVersion, null, 2));
    } catch (_) {}
  }
}

module.exports = VersionManager;
