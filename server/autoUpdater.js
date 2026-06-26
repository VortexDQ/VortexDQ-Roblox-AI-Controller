const { spawn, execSync } = require('child_process');
const VersionManager = require('./versionManager');

class AutoUpdater {
  constructor() {
    this.versionManager = new VersionManager();
    this.updateLog = [];
  }

  async checkAndNotify() {
    console.log('\n[AutoUpdater] Checking for updates on launch...');

    try {
      const versionInfo = await this.versionManager.checkForUpdates();

      if (versionInfo.updateAvailable) {
        this._logUpdate('UPDATE_AVAILABLE', versionInfo);
        this._printUpdateNotice(versionInfo);
        return {
          available: true,
          current: versionInfo.version,
          latest: versionInfo.latestVersion
        };
      } else {
        this._logUpdate('UP_TO_DATE', versionInfo);
        console.log('[AutoUpdater] ✓ You are on the latest version\n');
        return {
          available: false,
          current: versionInfo.version
        };
      }
    } catch (error) {
      console.error('[AutoUpdater] Check failed:', error.message);
      return {
        available: false,
        error: error.message
      };
    }
  }

  _printUpdateNotice(versionInfo) {
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║         🔔 UPDATE AVAILABLE 🔔            ║');
    console.log('╚════════════════════════════════════════════╝\n');
    console.log(`Current Version: ${versionInfo.version}`);
    console.log(`Latest Version:  ${versionInfo.latestVersion}\n`);
    console.log('To update, run:\n');
    console.log('  git pull origin main');
    console.log('  npm install');
    console.log('  npm start\n');
    console.log('Or wait for auto-update on next launch.\n');
  }

  async autoUpdate() {
    console.log('[AutoUpdater] Starting automatic update process...');

    try {
      const versionInfo = await this.versionManager.checkForUpdates();

      if (!versionInfo.updateAvailable) {
        console.log('[AutoUpdater] No updates needed');
        return { success: true, updated: false };
      }

      console.log('[AutoUpdater] Pulling latest changes from GitHub...');
      this._executeCommand('git pull origin main');

      console.log('[AutoUpdater] Installing dependencies...');
      this._executeCommand('npm install');

      console.log('[AutoUpdater] Update complete!');
      this._logUpdate('AUTO_UPDATE_SUCCESS', versionInfo);

      return {
        success: true,
        updated: true,
        from: versionInfo.version,
        to: versionInfo.latestVersion
      };
    } catch (error) {
      console.error('[AutoUpdater] Auto-update failed:', error.message);
      this._logUpdate('AUTO_UPDATE_FAILED', { error: error.message });

      return {
        success: false,
        error: error.message,
        message: 'Manual update required. Run: git pull origin main && npm install'
      };
    }
  }

  _executeCommand(command) {
    try {
      const output = execSync(command, {
        stdio: 'inherit',
        timeout: 300000 // 5 minutes
      });
      return output;
    } catch (error) {
      throw new Error(`Command failed: ${command}\n${error.message}`);
    }
  }

  _logUpdate(status, data) {
    const log = {
      timestamp: new Date().toISOString(),
      status,
      data
    };

    this.updateLog.push(log);

    // Keep only last 100 logs
    if (this.updateLog.length > 100) {
      this.updateLog.shift();
    }
  }

  getUpdateLog() {
    return this.updateLog;
  }

  rollback(version) {
    console.log(`[AutoUpdater] Rolling back to version ${version}...`);

    try {
      this._executeCommand(`git checkout v${version}`);
      this._executeCommand('npm install');
      console.log('[AutoUpdater] Rollback successful');

      this._logUpdate('ROLLBACK_SUCCESS', { version });
      return { success: true, version };
    } catch (error) {
      console.error('[AutoUpdater] Rollback failed:', error.message);
      this._logUpdate('ROLLBACK_FAILED', { version, error: error.message });

      return {
        success: false,
        error: error.message
      };
    }
  }

  getVersionInfo() {
    return this.versionManager.getVersionInfo();
  }
}

module.exports = AutoUpdater;
