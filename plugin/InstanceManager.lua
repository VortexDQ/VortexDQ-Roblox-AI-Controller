local InstanceManager = {}
InstanceManager.__index = InstanceManager

function InstanceManager.new()
	local self = setmetatable({}, InstanceManager)
	return self
end

function InstanceManager:getInstance(path)
	if not path or path == "" then
		return nil
	end

	local parts = string.split(path, "/")
	local current = nil

	for i, part in ipairs(parts) do
		if i == 1 then
			if part == "Workspace" then
				current = workspace
			elseif part == "StarterPlayer" then
				current = game:GetService("StarterPlayer")
			elseif part == "ReplicatedStorage" then
				current = game:GetService("ReplicatedStorage")
			elseif part == "ServerScriptService" then
				current = game:GetService("ServerScriptService")
			elseif part == "StarterGui" then
				current = game:GetService("StarterGui")
			else
				return nil
			end
		else
			if current == nil then
				return nil
			end

			current = current:FindFirstChild(part)
			if current == nil then
				return nil
			end
		end
	end

	return current
end

function InstanceManager:getPath(instance)
	local path = {}

	local current = instance
	while current and current ~= workspace and current ~= game do
		table.insert(path, 1, current.Name)
		current = current.Parent
	end

	if current then
		table.insert(path, 1, current.Name)
	end

	return table.concat(path, "/")
end

function InstanceManager:createInstance(className, parentPath, name, properties)
	local parent = self:getInstance(parentPath)
	if not parent then
		return nil, "Parent not found: " .. parentPath
	end

	local success, instance = pcall(function()
		local newInstance = Instance.new(className)
		if name then
			newInstance.Name = name
		end

		if properties then
			for prop, value in pairs(properties) do
				local ok, err = pcall(function()
					instance[prop] = value
				end)
				if not ok then
					print("[InstanceManager] Failed to set property " .. prop .. ": " .. tostring(err))
				end
			end
		end

		newInstance.Parent = parent
		return newInstance
	end)

	if success then
		return instance, nil
	else
		return nil, tostring(instance)
	end
end

function InstanceManager:createPart(parentPath, name, shape, properties)
	local parent = self:getInstance(parentPath)
	if not parent then
		return nil, "Parent not found: " .. parentPath
	end

	shape = shape or "Block"
	name = name or shape

	local success, part = pcall(function()
		local newPart = Instance.new("Part")
		newPart.Name = name

		if shape == "Ball" then
			newPart.Shape = Enum.PartType.Ball
		elseif shape == "Cylinder" then
			newPart.Shape = Enum.PartType.Cylinder
		elseif shape == "Wedge" then
			newPart = Instance.new("WedgePart")
		else
			newPart.Shape = Enum.PartType.Block
		end

		if properties then
			self:_applyProperties(newPart, properties)
		end

		newPart.Parent = parent
		return newPart
	end)

	if success then
		return part, nil
	else
		return nil, tostring(part)
	end
end

function InstanceManager:createScript(parentPath, name, code, isLocalScript)
	local parent = self:getInstance(parentPath)
	if not parent then
		return nil, "Parent not found: " .. parentPath
	end

	local success, script = pcall(function()
		local scriptClass = isLocalScript and "LocalScript" or "Script"
		local newScript = Instance.new(scriptClass)
		newScript.Name = name or "Script"
		newScript.Source = code
		newScript.Parent = parent
		return newScript
	end)

	if success then
		return script, nil
	else
		return nil, tostring(script)
	end
end

function InstanceManager:createFolder(parentPath, name)
	local parent = self:getInstance(parentPath)
	if not parent then
		return nil, "Parent not found: " .. parentPath
	end

	local success, folder = pcall(function()
		local newFolder = Instance.new("Folder")
		newFolder.Name = name or "Folder"
		newFolder.Parent = parent
		return newFolder
	end)

	if success then
		return folder, nil
	else
		return nil, tostring(folder)
	end
end

function InstanceManager:createUI(parentPath, uiType, name, properties)
	local parent = self:getInstance(parentPath)
	if not parent then
		return nil, "Parent not found: " .. parentPath
	end

	local validTypes = {
		["ScreenGui"] = true,
		["Frame"] = true,
		["TextLabel"] = true,
		["TextButton"] = true,
		["TextBox"] = true,
		["ImageLabel"] = true,
		["ImageButton"] = true,
		["ScrollingFrame"] = true,
		["UICorner"] = true,
		["UIPadding"] = true,
		["UIListLayout"] = true,
		["UIGridLayout"] = true
	}

	if not validTypes[uiType] then
		return nil, "Invalid UI type: " .. uiType
	end

	local success, ui = pcall(function()
		local newUI = Instance.new(uiType)
		newUI.Name = name or uiType
		newUI.Parent = parent

		if properties then
			self:_applyProperties(newUI, properties)
		end

		return newUI
	end)

	if success then
		return ui, nil
	else
		return nil, tostring(ui)
	end
end

function InstanceManager:setProperty(instancePath, propertyName, value)
	local instance = self:getInstance(instancePath)
	if not instance then
		return false, "Instance not found: " .. instancePath
	end

	local success, err = pcall(function()
		instance[propertyName] = value
	end)

	if success then
		return true, nil
	else
		return false, tostring(err)
	end
end

function InstanceManager:getProperty(instancePath, propertyName)
	local instance = self:getInstance(instancePath)
	if not instance then
		return nil, "Instance not found: " .. instancePath
	end

	local success, value = pcall(function()
		return instance[propertyName]
	end)

	if success then
		return value, nil
	else
		return nil, tostring(value)
	end
end

function InstanceManager:deleteInstance(instancePath)
	local instance = self:getInstance(instancePath)
	if not instance then
		return false, "Instance not found: " .. instancePath
	end

	local success, err = pcall(function()
		instance:Destroy()
	end)

	return success, err and tostring(err) or nil
end

function InstanceManager:renameInstance(instancePath, newName)
	local instance = self:getInstance(instancePath)
	if not instance then
		return false, "Instance not found: " .. instancePath
	end

	local success, err = pcall(function()
		instance.Name = newName
	end)

	return success, err and tostring(err) or nil
end

function InstanceManager:moveInstance(instancePath, newParentPath)
	local instance = self:getInstance(instancePath)
	if not instance then
		return false, "Instance not found: " .. instancePath
	end

	local newParent = self:getInstance(newParentPath)
	if not newParent then
		return false, "Parent not found: " .. newParentPath
	end

	local success, err = pcall(function()
		instance.Parent = newParent
	end)

	return success, err and tostring(err) or nil
end

function InstanceManager:cloneInstance(instancePath, newParentPath, newName)
	local instance = self:getInstance(instancePath)
	if not instance then
		return nil, "Instance not found: " .. instancePath
	end

	local newParent = newParentPath and self:getInstance(newParentPath) or instance.Parent
	if not newParent then
		return nil, "Parent not found"
	end

	local success, clone = pcall(function()
		local cloned = instance:Clone()
		if newName then
			cloned.Name = newName
		end
		cloned.Parent = newParent
		return cloned
	end)

	if success then
		return clone, nil
	else
		return nil, tostring(clone)
	end
end

function InstanceManager:editScript(instancePath, code)
	local instance = self:getInstance(instancePath)
	if not instance then
		return false, "Instance not found: " .. instancePath
	end

	if not (instance:IsA("Script") or instance:IsA("LocalScript")) then
		return false, "Instance is not a script"
	end

	local success, err = pcall(function()
		instance.Source = code
	end)

	return success, err and tostring(err) or nil
end

function InstanceManager:getExplorerTree(maxDepth)
	maxDepth = maxDepth or 10

	local function buildTree(instance, depth)
		if depth > maxDepth then
			return nil
		end

		local node = {
			name = instance.Name,
			className = instance.ClassName,
			children = {}
		}

		for _, child in ipairs(instance:GetChildren()) do
			local childNode = buildTree(child, depth + 1)
			if childNode then
				table.insert(node.children, childNode)
			end
		end

		return node
	end

	local tree = {
		Workspace = buildTree(workspace, 1),
		StarterGui = buildTree(game:GetService("StarterGui"), 1),
		ReplicatedStorage = buildTree(game:GetService("ReplicatedStorage"), 1),
		ServerScriptService = buildTree(game:GetService("ServerScriptService"), 1)
	}

	return tree
end

function InstanceManager:_applyProperties(instance, properties)
	for propName, propValue in pairs(properties) do
		local ok, err = pcall(function()
			instance[propName] = propValue
		end)

		if not ok then
			print("[InstanceManager] Failed to set " .. propName .. ": " .. tostring(err))
		end
	end
end

return InstanceManager
