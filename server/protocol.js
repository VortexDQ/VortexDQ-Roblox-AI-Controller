class Protocol {
  static VALID_ACTIONS = [
    'CreateInstance',
    'CreatePart',
    'CreateFolder',
    'CreateScript',
    'CreateUI',
    'SetProperty',
    'GetProperty',
    'DeleteInstance',
    'RenameInstance',
    'MoveInstance',
    'CloneInstance',
    'GetExplorerTree',
    'EditScript'
  ];

  static UI_TYPES = [
    'ScreenGui',
    'Frame',
    'TextLabel',
    'TextButton',
    'TextBox',
    'ImageLabel',
    'ImageButton',
    'ScrollingFrame',
    'UICorner',
    'UIPadding',
    'UIListLayout',
    'UIGridLayout'
  ];

  static PART_SHAPES = ['Block', 'Ball', 'Cylinder', 'Wedge', 'Terrain'];

  static VALID_PROPERTIES = {
    Size: 'vector3',
    Position: 'vector3',
    Rotation: 'vector3',
    Color: 'color',
    Material: 'string',
    Anchored: 'boolean',
    CanCollide: 'boolean',
    Transparency: 'number',
    Text: 'string',
    TextSize: 'number',
    TextColor: 'color',
    TextScaled: 'boolean',
    BackgroundColor: 'color',
    BackgroundTransparency: 'number',
    Visible: 'boolean',
    Parent: 'string',
    CFrame: 'cframe',
    Velocity: 'vector3',
    TopSurface: 'string',
    BottomSurface: 'string',
    TopSurfaceStuds: 'number',
    BottomSurfaceStuds: 'number',
    FormFactor: 'string'
  };

  static validateCommand(command) {
    if (!command || typeof command !== 'object') {
      throw new Error('Command must be an object');
    }

    if (!command.action || typeof command.action !== 'string') {
      throw new Error('Command must have action (string)');
    }

    if (!this.VALID_ACTIONS.includes(command.action)) {
      throw new Error(`Invalid action: ${command.action}`);
    }

    if (!command.data || typeof command.data !== 'object') {
      throw new Error('Command must have data (object)');
    }

    this.validateActionData(command.action, command.data);
    return true;
  }

  static validateCommandBatch(commands) {
    if (!Array.isArray(commands)) {
      throw new Error('Commands must be an array');
    }

    if (commands.length === 0) {
      throw new Error('Commands array cannot be empty');
    }

    if (commands.length > 100) {
      throw new Error('Too many commands (max 100)');
    }

    commands.forEach((cmd, idx) => {
      try {
        this.validateCommand(cmd);
      } catch (error) {
        throw new Error(`Command ${idx}: ${error.message}`);
      }
    });

    return true;
  }

  static validateActionData(action, data) {
    switch (action) {
      case 'CreateInstance':
        this.validateCreateInstance(data);
        break;
      case 'CreatePart':
        this.validateCreatePart(data);
        break;
      case 'CreateFolder':
        this.validateCreateFolder(data);
        break;
      case 'CreateScript':
        this.validateCreateScript(data);
        break;
      case 'CreateUI':
        this.validateCreateUI(data);
        break;
      case 'SetProperty':
        this.validateSetProperty(data);
        break;
      case 'GetProperty':
        this.validateGetProperty(data);
        break;
      case 'DeleteInstance':
        this.validateDeleteInstance(data);
        break;
      case 'RenameInstance':
        this.validateRenameInstance(data);
        break;
      case 'MoveInstance':
        this.validateMoveInstance(data);
        break;
      case 'CloneInstance':
        this.validateCloneInstance(data);
        break;
      case 'EditScript':
        this.validateEditScript(data);
        break;
      case 'GetExplorerTree':
        // No validation needed
        break;
    }
  }

  static validateCreateInstance(data) {
    if (!data.className || typeof data.className !== 'string') {
      throw new Error('CreateInstance: className required (string)');
    }
    if (!data.parent || typeof data.parent !== 'string') {
      throw new Error('CreateInstance: parent required (string)');
    }
    if (data.name && typeof data.name !== 'string') {
      throw new Error('CreateInstance: name must be string');
    }
    if (data.properties && typeof data.properties !== 'object') {
      throw new Error('CreateInstance: properties must be object');
    }
  }

  static validateCreatePart(data) {
    if (!data.parent || typeof data.parent !== 'string') {
      throw new Error('CreatePart: parent required (string)');
    }
    if (data.shape && !this.PART_SHAPES.includes(data.shape)) {
      throw new Error(`CreatePart: invalid shape ${data.shape}`);
    }
    if (data.properties && typeof data.properties !== 'object') {
      throw new Error('CreatePart: properties must be object');
    }
  }

  static validateCreateFolder(data) {
    if (!data.parent || typeof data.parent !== 'string') {
      throw new Error('CreateFolder: parent required (string)');
    }
  }

  static validateCreateScript(data) {
    if (!data.parent || typeof data.parent !== 'string') {
      throw new Error('CreateScript: parent required (string)');
    }
    if (!data.code || typeof data.code !== 'string') {
      throw new Error('CreateScript: code required (string)');
    }
    if (data.code.length > 1000000) {
      throw new Error('CreateScript: code too large');
    }
  }

  static validateCreateUI(data) {
    if (!data.parent || typeof data.parent !== 'string') {
      throw new Error('CreateUI: parent required (string)');
    }
    if (!data.type || !this.UI_TYPES.includes(data.type)) {
      throw new Error(`CreateUI: invalid type ${data.type}`);
    }
    if (data.properties && typeof data.properties !== 'object') {
      throw new Error('CreateUI: properties must be object');
    }
  }

  static validateSetProperty(data) {
    if (!data.path || typeof data.path !== 'string') {
      throw new Error('SetProperty: path required (string)');
    }
    if (!data.property || typeof data.property !== 'string') {
      throw new Error('SetProperty: property required (string)');
    }
    if (data.value === undefined) {
      throw new Error('SetProperty: value required');
    }
  }

  static validateGetProperty(data) {
    if (!data.path || typeof data.path !== 'string') {
      throw new Error('GetProperty: path required (string)');
    }
    if (!data.property || typeof data.property !== 'string') {
      throw new Error('GetProperty: property required (string)');
    }
  }

  static validateDeleteInstance(data) {
    if (!data.path || typeof data.path !== 'string') {
      throw new Error('DeleteInstance: path required (string)');
    }
  }

  static validateRenameInstance(data) {
    if (!data.path || typeof data.path !== 'string') {
      throw new Error('RenameInstance: path required (string)');
    }
    if (!data.newName || typeof data.newName !== 'string') {
      throw new Error('RenameInstance: newName required (string)');
    }
  }

  static validateMoveInstance(data) {
    if (!data.path || typeof data.path !== 'string') {
      throw new Error('MoveInstance: path required (string)');
    }
    if (!data.newParent || typeof data.newParent !== 'string') {
      throw new Error('MoveInstance: newParent required (string)');
    }
  }

  static validateCloneInstance(data) {
    if (!data.path || typeof data.path !== 'string') {
      throw new Error('CloneInstance: path required (string)');
    }
  }

  static validateEditScript(data) {
    if (!data.path || typeof data.path !== 'string') {
      throw new Error('EditScript: path required (string)');
    }
    if (!data.code || typeof data.code !== 'string') {
      throw new Error('EditScript: code required (string)');
    }
  }

  static sanitizePath(path) {
    return path
      .replace(/\.\./g, '')
      .replace(/[<>:"|?*]/g, '')
      .trim();
  }

  static isValidPath(path) {
    if (!path || typeof path !== 'string') return false;
    if (path.includes('..')) return false;
    if (path.includes('\0')) return false;
    return true;
  }
}

module.exports = Protocol;
