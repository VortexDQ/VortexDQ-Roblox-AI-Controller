local Controller = {}
Controller.__index = Controller

local InstanceManager = require(script.Parent:WaitForChild("InstanceManager"))

function Controller.new(wsClient)
	local self = setmetatable({}, Controller)

	self.wsClient = wsClient
	self.instanceManager = InstanceManager.new()
	self.executingCommands = {}
	self.commandHistory = {}
	self.maxHistorySize = 100

	return self
end

function Controller:start()
	print("[Controller] Starting command handler")

	self.wsClient:on("message", function(message)
		self:handleMessage(message)
	end)

	self.wsClient:on("connect", function()
		print("[Controller] WebSocket connected, reporting state")
		self:reportState()
	end)

	self.wsClient:on("close", function()
		print("[Controller] WebSocket disconnected")
	end)
end

function Controller:handleMessage(messageJson)
	local success, message = pcall(function()
		if type(messageJson) == "string" then
			return game:GetService("HttpService"):JSONDecode(messageJson)
		end
		return messageJson
	end)

	if not success then
		print("[Controller] Failed to parse message: " .. tostring(message))
		return
	end

	if not message.type then
		print("[Controller] Message missing type")
		return
	end

	if message.type == "command" then
		self:executeCommand(message)
	elseif message.type == "system" then
		self:handleSystemMessage(message)
	else
		print("[Controller] Unknown message type: " .. message.type)
	end
end

function Controller:executeCommand(message)
	local commandId = message.id
	local action = message.action
	local data = message.data or {}

	print("[Controller] Executing command: " .. action .. " (id: " .. commandId .. ")")

	self.executingCommands[commandId] = {
		action = action,
		startTime = tick()
	}

	local success, result, errorMsg = self:_executeAction(action, data)

	self:addToHistory({
		id = commandId,
		action = action,
		success = success,
		timestamp = os.time()
	})

	local state = self:getCurrentState()

	self.wsClient:sendResult(commandId, success, result or {}, errorMsg or "", state)

	self.executingCommands[commandId] = nil
end

function Controller:_executeAction(action, data)
	if action == "CreateInstance" then
		return self:_createInstance(data)
	elseif action == "CreatePart" then
		return self:_createPart(data)
	elseif action == "CreateFolder" then
		return self:_createFolder(data)
	elseif action == "CreateScript" then
		return self:_createScript(data)
	elseif action == "CreateUI" then
		return self:_createUI(data)
	elseif action == "SetProperty" then
		return self:_setProperty(data)
	elseif action == "GetProperty" then
		return self:_getProperty(data)
	elseif action == "DeleteInstance" then
		return self:_deleteInstance(data)
	elseif action == "RenameInstance" then
		return self:_renameInstance(data)
	elseif action == "MoveInstance" then
		return self:_moveInstance(data)
	elseif action == "CloneInstance" then
		return self:_cloneInstance(data)
	elseif action == "GetExplorerTree" then
		return self:_getExplorerTree(data)
	elseif action == "EditScript" then
		return self:_editScript(data)
	else
		return false, nil, "Unknown action: " .. action
	end
end

function Controller:_createInstance(data)
	if not data.className then
		return false, nil, "Missing className"
	end
	if not data.parent then
		return false, nil, "Missing parent"
	end

	local instance, err = self.instanceManager:createInstance(
		data.className,
		data.parent,
		data.name,
		data.properties
	)

	if instance then
		return true, { path = self.instanceManager:getPath(instance) }, nil
	else
		return false, nil, err
	end
end

function Controller:_createPart(data)
	if not data.parent then
		return false, nil, "Missing parent"
	end

	local part, err = self.instanceManager:createPart(
		data.parent,
		data.name,
		data.shape,
		data.properties
	)

	if part then
		return true, { path = self.instanceManager:getPath(part) }, nil
	else
		return false, nil, err
	end
end

function Controller:_createFolder(data)
	if not data.parent then
		return false, nil, "Missing parent"
	end

	local folder, err = self.instanceManager:createFolder(data.parent, data.name)

	if folder then
		return true, { path = self.instanceManager:getPath(folder) }, nil
	else
		return false, nil, err
	end
end

function Controller:_createScript(data)
	if not data.parent then
		return false, nil, "Missing parent"
	end
	if not data.code then
		return false, nil, "Missing code"
	end

	local script, err = self.instanceManager:createScript(
		data.parent,
		data.name or "Script",
		data.code,
		data.isLocalScript
	)

	if script then
		return true, { path = self.instanceManager:getPath(script) }, nil
	else
		return false, nil, err
	end
end

function Controller:_createUI(data)
	if not data.parent then
		return false, nil, "Missing parent"
	end
	if not data.type then
		return false, nil, "Missing UI type"
	end

	local ui, err = self.instanceManager:createUI(
		data.parent,
		data.type,
		data.name,
		data.properties
	)

	if ui then
		return true, { path = self.instanceManager:getPath(ui) }, nil
	else
		return false, nil, err
	end
end

function Controller:_setProperty(data)
	if not data.path then
		return false, nil, "Missing path"
	end
	if not data.property then
		return false, nil, "Missing property"
	end

	local success, err = self.instanceManager:setProperty(data.path, data.property, data.value)

	if success then
		return true, {}, nil
	else
		return false, nil, err
	end
end

function Controller:_getProperty(data)
	if not data.path then
		return false, nil, "Missing path"
	end
	if not data.property then
		return false, nil, "Missing property"
	end

	local value, err = self.instanceManager:getProperty(data.path, data.property)

	if err == nil then
		return true, { value = value }, nil
	else
		return false, nil, err
	end
end

function Controller:_deleteInstance(data)
	if not data.path then
		return false, nil, "Missing path"
	end

	local success, err = self.instanceManager:deleteInstance(data.path)

	if success then
		return true, {}, nil
	else
		return false, nil, err
	end
end

function Controller:_renameInstance(data)
	if not data.path then
		return false, nil, "Missing path"
	end
	if not data.newName then
		return false, nil, "Missing newName"
	end

	local success, err = self.instanceManager:renameInstance(data.path, data.newName)

	if success then
		return true, {}, nil
	else
		return false, nil, err
	end
end

function Controller:_moveInstance(data)
	if not data.path then
		return false, nil, "Missing path"
	end
	if not data.newParent then
		return false, nil, "Missing newParent"
	end

	local success, err = self.instanceManager:moveInstance(data.path, data.newParent)

	if success then
		return true, {}, nil
	else
		return false, nil, err
	end
end

function Controller:_cloneInstance(data)
	if not data.path then
		return false, nil, "Missing path"
	end

	local clone, err = self.instanceManager:cloneInstance(data.path, data.newParent, data.newName)

	if clone then
		return true, { path = self.instanceManager:getPath(clone) }, nil
	else
		return false, nil, err
	end
end

function Controller:_getExplorerTree(data)
	local tree = self.instanceManager:getExplorerTree(data.maxDepth or 10)
	return true, tree, nil
end

function Controller:_editScript(data)
	if not data.path then
		return false, nil, "Missing path"
	end
	if not data.code then
		return false, nil, "Missing code"
	end

	local success, err = self.instanceManager:editScript(data.path, data.code)

	if success then
		return true, {}, nil
	else
		return false, nil, err
	end
end

function Controller:handleSystemMessage(message)
	if message.action == "connected" then
		print("[Controller] System connected with ID: " .. (message.id or "unknown"))
	end
end

function Controller:getCurrentState()
	return {
		workspace = self:_serializeWorkspace(),
		executing = self:_getExecutingCommandCount()
	}
end

function Controller:_serializeWorkspace()
	local function serializeInstance(instance)
		local data = {
			name = instance.Name,
			className = instance.ClassName
		}
		return data
	end

	return {
		childCount = #workspace:GetChildren()
	}
end

function Controller:_getExecutingCommandCount()
	local count = 0
	for _, _ in pairs(self.executingCommands) do
		count = count + 1
	end
	return count
end

function Controller:reportState()
	local state = self:getCurrentState()
	self.wsClient:sendState(state)
end

function Controller:addToHistory(entry)
	table.insert(self.commandHistory, 1, entry)
	if #self.commandHistory > self.maxHistorySize then
		table.remove(self.commandHistory)
	end
end

function Controller:getHistory()
	return self.commandHistory
end

return Controller
