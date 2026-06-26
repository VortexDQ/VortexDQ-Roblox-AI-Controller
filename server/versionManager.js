const fs = require('fs');
const path = require('path');
const axios = require('axios');

class VersionManager {
  constructor() {
    this.versionFile = path.join(__dirname, '../version.json');
    this.changelogFile = path.join(__dirname, '../CHANGELOG.md');
    this.currentVersion = this._loadVersion();
    this.updateCheckInterval = 24 * 60 * 60 * 1000; // 24 hours
  }

  _loadVersion() {
    try {
      if (fs.existsSync(this.versionFile)) {
        const data = JSON.parse(fs.readFileSync(this.versionFile, 'utf8'));
        return data;
      }
    } catch (error) {
      console.error('[VersionManager] Failed to load version:', error.message);
    }

    // Default version if file doesn't exist
    return {
      version: '2.0.0',
      releaseDate: new Date().toISOString(),
      lastUpdateCheck: null,
      updateAvailable: false,
      latestVersion: null
    };
  }

  async checkForUpdates() {
    console.log('[VersionManager] Checking for updates...');

    try {
      // Check GitHub API for latest release
      const response = await axios.get(
        'https://api.github.com/repos/VortexDQ/VortexDQ-Roblox-AI-Controller/releases/latest',
        {
          timeout: 10000,
          headers: {
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      const latestVersion = response.data.tag_name.replace('v', '');
      const currentVersion = this.currentVersion.version;

      const updateAvailable = this._compareVersions(latestVersion, currentVersion) > 0;

      this.currentVersion.lastUpdateCheck = new Date().toISOString();
      this.currentVersion.latestVersion = latestVersion;
      this.currentVersion.updateAvailable = updateAvailable;

      if (updateAvailable) {
        console.log(`[VersionManager] Update available: ${latestVersion}`);
        console.log(`[VersionManager] Current: ${currentVersion}`);
        console.log(`[VersionManager] Release notes: ${response.data.html_url}`);
      } else {
        console.log('[VersionManager] Already on latest version');
      }

      this._saveVersion();
      return this.currentVersion;
    } catch (error) {
      console.error('[VersionManager] Update check failed:', error.message);
      this.currentVersion.lastUpdateCheck = new Date().toISOString();
      this._saveVersion();
      return this.currentVersion;
    }
  }

  _compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      if ((parts1[i] || 0) > (parts2[i] || 0)) return 1;
      if ((parts1[i] || 0) < (parts2[i] || 0)) return -1;
    }

    return 0;
  }

  getUpdateInstructions() {
    if (!this.currentVersion.updateAvailable) {
      return {
        available: false,
        message: 'You are on the latest version'
      };
    }

    return {
      available: true,
      current: this.currentVersion.version,
      latest: this.currentVersion.latestVersion,
      instructions: `
To update to version ${this.currentVersion.latestVersion}:

1. Pull latest changes from GitHub:
   git pull origin main

2. Install dependencies:
   npm install

3. Restart the server:
   npm start

4. Check if everything works:
   Open http://127.0.0.1:7777

If something breaks:
   - Check CHANGELOG.md for breaking changes
   - Roll back: git checkout ${this.currentVersion.version}
   - Report issue on GitHub
      `
    };
  }

  recordVersionUpdate(newVersion, changesSummary) {
    this.currentVersion.version = newVersion;
    this.currentVersion.releaseDate = new Date().toISOString();
    this.currentVersion.updateAvailable = false;
    this.currentVersion.latestVersion = null;

    this._saveVersion();
    this._updateChangelog(newVersion, changesSummary);

    console.log(`[VersionManager] Updated to version ${newVersion}`);
  }

  _updateChangelog(version, changesSummary) {
    const date = new Date().toLocaleDateString();
    const entry = `\n## [${version}] - ${date}\n\n${changesSummary}\n`;

    try {
      if (fs.existsSync(this.changelogFile)) {
        const content = fs.readFileSync(this.changelogFile, 'utf8');
        fs.writeFileSync(this.changelogFile, entry + content);
      } else {
        const header = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n';
        fs.writeFileSync(this.changelogFile, header + entry);
      }
    } catch (error) {
      console.error('[VersionManager] Failed to update changelog:', error.message);
    }
  }

  _saveVersion() {
    try {
      fs.writeFileSync(this.versionFile, JSON.stringify(this.currentVersion, null, 2));
    } catch (error) {
      console.error('[VersionManager] Failed to save version:', error.message);
    }
  }

  getVersionInfo() {
    return {
      current: this.currentVersion.version,
      releaseDate: this.currentVersion.releaseDate,
      lastUpdateCheck: this.currentVersion.lastUpdateCheck,
      updateAvailable: this.currentVersion.updateAvailable,
      latestVersion: this.currentVersion.latestVersion
    };
  }

  getChangelog(lines = 50) {
    try {
      if (!fs.existsSync(this.changelogFile)) {
        return 'No changelog available';
      }

      const content = fs.readFileSync(this.changelogFile, 'utf8');
      return content.split('\n').slice(0, lines).join('\n');
    } catch (error) {
      return 'Failed to read changelog';
    }
  }
}

module.exports = VersionManager;
