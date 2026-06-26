// All valid actions — kept in sync with plugin dispatch table
const VALID_ACTIONS = new Set([
  'CreateInstance','CreatePart','CreateFolder','CreateScript','CreateUI',
  'SetProperty','GetProperty','DeleteInstance','RenameInstance',
  'MoveInstance','CloneInstance','EditScript',
  'BulkSetProperty','BulkDelete',
  'GetExplorerTree','GetScriptSource','GetAllScripts','GetAllProperties',
  'SearchInstances','GetDescendants','GetChildren',
  'GetSelection','SetSelection',
  'GetGameInfo','GetPlaceInfo',
  'GetServiceProperties','SetServiceProperty',
  'GetLighting','SetLighting',
  'GetWorkspaceSettings','SetWorkspaceSettings',
  'GetPlayers','GetTeams',
  'GetTags','AddTag','RemoveTag','GetTagged',
  'GetAttribute','SetAttribute','GetAttributes',
  'GetStudioTheme',
  'GetHistory','GetStats','Ping',
]);

class Protocol {
  static validateCommand(command) {
    if (!command || typeof command !== 'object') throw new Error('Command must be an object');
    if (!command.action || typeof command.action !== 'string') throw new Error('Command must have action (string)');
    if (!VALID_ACTIONS.has(command.action)) throw new Error(`Unknown action: ${command.action}`);
    if (command.data !== undefined && typeof command.data !== 'object') throw new Error('data must be object');
    return true;
  }

  static validateCommandBatch(commands) {
    if (!Array.isArray(commands)) throw new Error('Commands must be an array');
    if (commands.length === 0) throw new Error('Commands array cannot be empty');
    if (commands.length > 200) throw new Error('Too many commands (max 200)');
    commands.forEach((cmd, i) => {
      try { this.validateCommand(cmd); }
      catch (e) { throw new Error(`Command[${i}]: ${e.message}`); }
    });
    return true;
  }

  static sanitizePath(p) {
    return p.replace(/\.\./g, '').replace(/[<>:"|?*\0]/g, '').trim();
  }

  static isValidPath(p) {
    return typeof p === 'string' && !p.includes('..') && !p.includes('\0');
  }
}

module.exports = Protocol;
