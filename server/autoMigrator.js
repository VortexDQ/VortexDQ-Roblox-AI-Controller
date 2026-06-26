const fs = require('fs');
const path = require('path');

class AutoMigrator {
  constructor() {
    this.migrationLog = [];
    this.dataDir = path.join(__dirname, '../data');
    this.ensureDataDir();
  }

  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  migrateModifiedFiles(files) {
    console.log('[AutoMigrator] Migrating modified files...');

    const migration = {
      timestamp: new Date().toISOString(),
      files: [],
      status: 'completed'
    };

    files.forEach(file => {
      try {
        const result = this._migrateFile(file);
        migration.files.push(result);
      } catch (error) {
        migration.files.push({
          source: file.source,
          success: false,
          error: error.message
        });
        migration.status = 'partial-failure';
      }
    });

    this.migrationLog.push(migration);
    this._saveMigrationLog();

    return migration;
  }

  _migrateFile(fileData) {
    const { source, type, data } = fileData;

    let destination;
    let migratedData = data;

    switch (type) {
      case 'script':
        destination = path.join(this.dataDir, 'scripts', `${Date.now()}_${path.basename(source)}`);
        break;

      case 'config':
        destination = path.join(this.dataDir, 'configs', `${path.basename(source)}`);
        break;

      case 'state':
        destination = path.join(this.dataDir, 'states', `${Date.now()}_state.json`);
        break;

      case 'backup':
        destination = path.join(this.dataDir, 'backups', `${Date.now()}_backup.json`);
        break;

      default:
        destination = path.join(this.dataDir, 'other', `${Date.now()}_${path.basename(source)}`);
    }

    // Ensure directory exists
    const dir = path.dirname(destination);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write file
    const content = typeof migratedData === 'string' ? migratedData : JSON.stringify(migratedData, null, 2);
    fs.writeFileSync(destination, content);

    return {
      source,
      destination,
      type,
      success: true,
      timestamp: new Date().toISOString(),
      sizeBytes: content.length
    };
  }

  migrateGameState(state) {
    const migration = {
      timestamp: new Date().toISOString(),
      file: `game_state_${Date.now()}.json`,
      success: false
    };

    try {
      const destination = path.join(this.dataDir, 'states', migration.file);
      const dir = path.dirname(destination);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(destination, JSON.stringify(state, null, 2));
      migration.success = true;
      migration.location = destination;

      this.migrationLog.push(migration);
      this._saveMigrationLog();

      return migration;
    } catch (error) {
      migration.error = error.message;
      return migration;
    }
  }

  migrateErrorLog(errorLog) {
    const migration = {
      timestamp: new Date().toISOString(),
      file: `error_log_${Date.now()}.json`,
      success: false
    };

    try {
      const destination = path.join(this.dataDir, 'logs', migration.file);
      const dir = path.dirname(destination);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(destination, JSON.stringify(errorLog, null, 2));
      migration.success = true;
      migration.location = destination;

      this.migrationLog.push(migration);
      this._saveMigrationLog();

      return migration;
    } catch (error) {
      migration.error = error.message;
      return migration;
    }
  }

  backupGameState(state) {
    const backup = {
      timestamp: new Date().toISOString(),
      file: `backup_${Date.now()}.json`,
      success: false
    };

    try {
      const destination = path.join(this.dataDir, 'backups', backup.file);
      const dir = path.dirname(destination);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(destination, JSON.stringify(state, null, 2));
      backup.success = true;
      backup.location = destination;

      return backup;
    } catch (error) {
      backup.error = error.message;
      return backup;
    }
  }

  cleanupOldFiles(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    console.log('[AutoMigrator] Cleaning up old files...');

    const now = Date.now();
    const cleanup = {
      timestamp: new Date().toISOString(),
      deletedCount: 0,
      folders: {}
    };

    const folders = ['states', 'logs', 'backups', 'scripts'];

    folders.forEach(folder => {
      const folderPath = path.join(this.dataDir, folder);
      if (!fs.existsSync(folderPath)) return;

      const files = fs.readdirSync(folderPath);
      let deletedInFolder = 0;

      files.forEach(file => {
        const filePath = path.join(folderPath, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAgeMs) {
          try {
            fs.unlinkSync(filePath);
            deletedInFolder++;
            cleanup.deletedCount++;
          } catch (error) {
            console.error(`[AutoMigrator] Failed to delete ${file}:`, error.message);
          }
        }
      });

      if (deletedInFolder > 0) {
        cleanup.folders[folder] = deletedInFolder;
      }
    });

    console.log(`[AutoMigrator] Cleaned up ${cleanup.deletedCount} files`);
    return cleanup;
  }

  getOrganizedFiles() {
    const organized = {
      states: this._getFilesInFolder('states'),
      logs: this._getFilesInFolder('logs'),
      backups: this._getFilesInFolder('backups'),
      scripts: this._getFilesInFolder('scripts')
    };

    return organized;
  }

  _getFilesInFolder(folder) {
    const folderPath = path.join(this.dataDir, folder);
    if (!fs.existsSync(folderPath)) return [];

    return fs.readdirSync(folderPath)
      .map(file => ({
        name: file,
        path: path.join(folderPath, file),
        size: fs.statSync(path.join(folderPath, file)).size,
        modified: fs.statSync(path.join(folderPath, file)).mtime
      }))
      .sort((a, b) => b.modified - a.modified);
  }

  _saveMigrationLog() {
    const logPath = path.join(this.dataDir, 'migration_log.json');
    try {
      fs.writeFileSync(logPath, JSON.stringify(this.migrationLog, null, 2));
    } catch (error) {
      console.error('[AutoMigrator] Failed to save migration log:', error.message);
    }
  }

  getMigrationHistory() {
    return this.migrationLog.slice(-20); // Last 20 migrations
  }

  getStats() {
    return {
      totalMigrations: this.migrationLog.length,
      successful: this.migrationLog.filter(m => m.success !== false).length,
      failed: this.migrationLog.filter(m => m.success === false).length,
      organized: this.getOrganizedFiles(),
      dataDirectory: this.dataDir,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = AutoMigrator;
