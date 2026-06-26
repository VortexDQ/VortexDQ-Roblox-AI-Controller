const { execSync } = require('child_process');
const VersionManager = require('./versionManager');

class AutoUpdater {
  constructor() {
    this.versionManager = new VersionManager();
    this.updateLog      = [];
  }

  async checkAndNotify() {
    console.log('\n[AutoUpdater] Checking for updates...');

    let versionInfo;
    try {
      versionInfo = await this.versionManager.checkForUpdates();
    } catch (error) {
      console.warn(`[AutoUpdater] Update check failed: ${error.message}`);
      this._log('CHECK_FAILED', { error: error.message });
      return { available: false, checkFailed: true, error: error.message };
    }

    const status = this.versionManager.getCheckStatus();

    if (status === 'no-releases') {
      // Repo has no git tags yet — this is normal, not an error
      console.log(`[AutoUpdater] Running v${versionInfo.version} (no release tags found — update check skipped)\n`);
      this._log('NO_RELEASES', versionInfo);
      return { available: false, checkSkipped: true, current: versionInfo.version };
    }

    if (versionInfo.updateAvailable) {
      this._log('UPDATE_AVAILABLE', versionInfo);
      this._printUpdateNotice(versionInfo);
      return {
        available: true,
        current:   versionInfo.version,
        latest:    versionInfo.latestVersion,
      };
    }

    console.log(`[AutoUpdater] v${versionInfo.version} is up to date.\n`);
    this._log('UP_TO_DATE', versionInfo);
    return { available: false, current: versionInfo.version };
  }

  _printUpdateNotice(v) {
    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║         UPDATE AVAILABLE                  ║');
    console.log('╚═══════════════════════════════════════════╝');
    console.log(`  Current: ${v.version}  ->  Latest: ${v.latestVersion}`);
    console.log('  Run:  git pull origin main && npm install && npm start\n');
  }

  async autoUpdate() {
    try {
      const versionInfo = await this.versionManager.checkForUpdates();
      if (!versionInfo.updateAvailable) {
        return { success: true, updated: false };
      }
      execSync('git pull origin main', { stdio: 'inherit', timeout: 120000 });
      execSync('npm install',          { stdio: 'inherit', timeout: 300000 });
      this._log('AUTO_UPDATE_SUCCESS', versionInfo);
      return { success: true, updated: true, from: versionInfo.version, to: versionInfo.latestVersion };
    } catch (error) {
      this._log('AUTO_UPDATE_FAILED', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  _log(status, data) {
    this.updateLog.push({ timestamp: new Date().toISOString(), status, data });
    if (this.updateLog.length > 100) this.updateLog.shift();
  }

  getUpdateLog()  { return this.updateLog; }
  getVersionInfo() { return this.versionManager.getVersionInfo(); }
}

module.exports = AutoUpdater;
