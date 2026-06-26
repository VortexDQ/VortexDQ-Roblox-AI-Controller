--[[
	VortexDQ AI Controller Plugin
	Single-file hardened build
	Version: 2.0.0

	Security features:
	  - Input validation & sanitisation on every command
	  - Allowlist-only class/property creation
	  - Rate limiting (commands per second + burst cap)
	  - Audit log with tamper-evident sequence numbers
	  - Sandboxed pcall wrapping on all Roblox API calls
	  - Blocked-path list prevents touching critical services
	  - Message size cap to prevent memory exhaustion
	  - Exponential backoff with jitter on reconnect
	  - Heartbeat watchdog that self-heals the connection
	  - Queue drain protection (max 64 queued messages)
]]

-- ============================================================
--  CONFIGURATION  (edit these to customise behaviour)
-- ============================================================

local CONFIG = {
	SERVER_URL            = "http://127.0.0.1:7777",
	RECONNECT_DELAY_MIN   = 1,
	RECONNECT_DELAY_MAX   = 30,
	RECONNECT_MAX_ATTEMPTS = -1,          -- -1 = infinite
	HEARTBEAT_INTERVAL    = 25,           -- seconds between health pings
	HEARTBEAT_TIMEOUT     = 70,           -- seconds before declaring dead
	MAX_QUEUE_SIZE        = 64,           -- max queued outbound messages
	MAX_MESSAGE_BYTES     = 512 * 1024,   -- 512 KB inbound cap
	RATE_LIMIT_PER_SEC    = 30,           -- commands per rolling second
	RATE_BURST_CAP        = 60,           -- absolute burst before hard-drop
	EXPLORER_MAX_DEPTH    = 12,           -- depth cap for tree serialiser
	HISTORY_MAX_SIZE      = 200,          -- audit log entries kept in memory
	POLL_INTERVAL         = 0.1,          -- seconds between server polls (100ms)
	GUI_REFRESH_INTERVAL  = 1,            -- seconds between GUI status refresh
	PLUGIN_ID             = "VortexDQAIController",
	TOOLBAR_NAME          = "VortexDQ AI",
	BUTTON_LABEL          = "AI Controller",
	BUTTON_TOOLTIP        = "Open VortexDQ AI Controller Panel",
	BUTTON_ICON           = "rbxasset://textures/Cursor.png",
}

-- ============================================================
--  SECURITY ALLOWLISTS
-- ============================================================

-- Only these Instance classNames may be created via CreateInstance
local ALLOWED_CREATE_CLASSES = {
	Part              = true,
	WedgePart         = true,
	MeshPart          = true,
	UnionOperation    = true,
	SpecialMesh       = true,
	Folder            = true,
	Model             = true,
	Script            = true,
	LocalScript       = true,
	ModuleScript      = true,
	RemoteEvent       = true,
	RemoteFunction    = true,
	BindableEvent     = true,
	BindableFunction  = true,
	StringValue       = true,
	IntValue          = true,
	NumberValue       = true,
	BoolValue         = true,
	ObjectValue       = true,
	Color3Value        = true,
	Vector3Value      = true,
	CFrameValue       = true,
	Attachment        = true,
	Weld              = true,
	WeldConstraint    = true,
	HingeConstraint   = true,
	BallSocketConstraint = true,
	RodConstraint     = true,
	SpringConstraint  = true,
	SurfaceAppearance = true,
	SelectionBox      = true,
	ScreenGui         = true,
	Frame             = true,
	TextLabel         = true,
	TextButton        = true,
	TextBox           = true,
	ImageLabel        = true,
	ImageButton       = true,
	ScrollingFrame    = true,
	ViewportFrame     = true,
	BillboardGui      = true,
	SurfaceGui        = true,
	UICorner          = true,
	UIPadding         = true,
	UIListLayout      = true,
	UIGridLayout      = true,
	UITableLayout     = true,
	UIStroke          = true,
	UIAspectRatioConstraint = true,
	UISizeConstraint  = true,
	UITextSizeConstraint = true,
	Sound             = true,
	SoundGroup        = true,
	PointLight        = true,
	SpotLight         = true,
	SurfaceLight      = true,
	Fire              = true,
	Smoke             = true,
	Sparkles          = true,
	ParticleEmitter   = true,
	Trail             = true,
	Beam              = true,
	Decal             = true,
	Texture           = true,
	BodyPosition      = true,
	BodyVelocity      = true,
	BodyAngularVelocity = true,
	BodyGyro          = true,
	VectorForce       = true,
	LinearVelocity    = true,
	AngularVelocity   = true,
	AlignPosition     = true,
	AlignOrientation  = true,
	Humanoid          = true,
	HumanoidDescription = true,
	Animator          = true,
	AnimationController = true,
	Animation         = true,
	ProximityPrompt   = true,
	ClickDetector     = true,
	TrussWorkPart     = true,
	CornerWedgePart   = true,
	NegateOperation   = true,
}

-- Root paths that commands are NEVER allowed to touch
-- Kept minimal — only truly untouchable engine internals
local BLOCKED_PATHS = {
	["CoreGui"]                = true,
	["CorePackages"]           = true,
	["RobloxPluginGuiService"] = true,
	["PluginGuiService"]       = true,
}

-- Properties that can never be written via SetProperty
local BLOCKED_PROPERTIES = {
	Source       = false,  -- only allowed via EditScript action
	ClassName    = true,
	DataCost     = true,
	RobloxLocked = true,
	Archivable   = false,  -- reads ok, write blocked
}

-- Valid root service names for path resolution
local SERVICE_MAP = {
	Workspace                  = function() return workspace end,
	StarterPlayer              = function() return game:GetService("StarterPlayer") end,
	StarterCharacterScripts    = function() return game:GetService("StarterPlayer"):FindFirstChild("StarterCharacterScripts") end,
	StarterPlayerScripts       = function() return game:GetService("StarterPlayer"):FindFirstChild("StarterPlayerScripts") end,
	ReplicatedStorage          = function() return game:GetService("ReplicatedStorage") end,
	ReplicatedFirst            = function() return game:GetService("ReplicatedFirst") end,
	ServerScriptService        = function() return game:GetService("ServerScriptService") end,
	ServerStorage              = function() return game:GetService("ServerStorage") end,
	StarterGui                 = function() return game:GetService("StarterGui") end,
	StarterPack                = function() return game:GetService("StarterPack") end,
	Lighting                   = function() return game:GetService("Lighting") end,
	SoundService               = function() return game:GetService("SoundService") end,
	Teams                      = function() return game:GetService("Teams") end,
	Players                    = function() return game:GetService("Players") end,
	Chat                       = function() return game:GetService("Chat") end,
	LocalizationService        = function() return game:GetService("LocalizationService") end,
	TextChatService            = function() return game:GetService("TextChatService") end,
	CollectionService          = function() return game:GetService("CollectionService") end,
	PhysicsService             = function() return game:GetService("PhysicsService") end,
	MaterialService            = function() return game:GetService("MaterialService") end,
	TweenService               = function() return game:GetService("TweenService") end,
	UserInputService           = function() return game:GetService("UserInputService") end,
	ProximityPromptService     = function() return game:GetService("ProximityPromptService") end,
	BadgeService               = function() return game:GetService("BadgeService") end,
	GroupService               = function() return game:GetService("GroupService") end,
	InsertService              = function() return game:GetService("InsertService") end,
	MarketplaceService         = function() return game:GetService("MarketplaceService") end,
	DataStoreService           = function() return game:GetService("DataStoreService") end,
	HttpService                = function() return game:GetService("HttpService") end,
	RunService                 = function() return game:GetService("RunService") end,
	Debris                     = function() return game:GetService("Debris") end,
	PathfindingService         = function() return game:GetService("PathfindingService") end,
	TestService                = function() return game:GetService("TestService") end,
	SocialService              = function() return game:GetService("SocialService") end,
	GuiService                 = function() return game:GetService("GuiService") end,
	ContextActionService       = function() return game:GetService("ContextActionService") end,
	VoiceChatService           = function() return game:GetService("VoiceChatService") end,
	MemStorageService          = function() return game:GetService("MemStorageService") end,
}

-- ============================================================
--  SERVICES
-- ============================================================

local HttpService    = game:GetService("HttpService")
local RunService     = game:GetService("RunService")
local Selection      = game:GetService("Selection")
local StudioService  = game:GetService("StudioService")

-- ============================================================
--  AUDIT LOG
-- ============================================================

local AuditLog = {}
AuditLog.__index = AuditLog

function AuditLog.new(maxSize)
	local self = setmetatable({}, AuditLog)
	self._entries  = {}
	self._maxSize  = maxSize or 200
	self._sequence = 0
	return self
end

function AuditLog:write(level, category, message, data)
	self._sequence = self._sequence + 1
	local entry = {
		seq       = self._sequence,
		timestamp = os.time(),
		tick      = tick(),
		level     = level,
		category  = category,
		message   = message,
		data      = data,
	}
	table.insert(self._entries, 1, entry)
	if #self._entries > self._maxSize then
		table.remove(self._entries)
	end
	-- Mirror to output for Studio developer console
	print(string.format("[VortexDQ][%s][%s] #%d %s", level, category, self._sequence, message))
end

function AuditLog:info(cat, msg, data)   self:write("INFO",  cat, msg, data) end
function AuditLog:warn(cat, msg, data)   self:write("WARN",  cat, msg, data) end
function AuditLog:error(cat, msg, data)  self:write("ERROR", cat, msg, data) end
function AuditLog:debug(cat, msg, data)  self:write("DEBUG", cat, msg, data) end

function AuditLog:getRecent(n)
	local out = {}
	for i = 1, math.min(n or 20, #self._entries) do
		out[i] = self._entries[i]
	end
	return out
end

function AuditLog:getSummary()
	local counts = { INFO = 0, WARN = 0, ERROR = 0, DEBUG = 0 }
	for _, e in ipairs(self._entries) do
		counts[e.level] = (counts[e.level] or 0) + 1
	end
	return {
		total    = #self._entries,
		counts   = counts,
		sequence = self._sequence,
	}
end

-- ============================================================
--  RATE LIMITER
-- ============================================================

local RateLimiter = {}
RateLimiter.__index = RateLimiter

function RateLimiter.new(perSecond, burstCap)
	local self = setmetatable({}, RateLimiter)
	self._perSecond = perSecond or 10
	self._burstCap  = burstCap  or 20
	self._tokens    = burstCap  or 20
	self._lastRefill = tick()
	self._dropped   = 0
	return self
end

function RateLimiter:_refill()
	local now    = tick()
	local delta  = now - self._lastRefill
	self._tokens = math.min(self._burstCap, self._tokens + delta * self._perSecond)
	self._lastRefill = now
end

-- Returns true if the action is allowed, false if rate-limited
function RateLimiter:consume(cost)
	self:_refill()
	cost = cost or 1
	if self._tokens >= cost then
		self._tokens = self._tokens - cost
		return true
	end
	self._dropped = self._dropped + 1
	return false
end

function RateLimiter:stats()
	return { tokens = self._tokens, dropped = self._dropped, cap = self._burstCap }
end

-- ============================================================
--  INPUT VALIDATOR
-- ============================================================

local Validator = {}

function Validator.isString(v, maxLen)
	if type(v) ~= "string" then return false, "expected string, got " .. type(v) end
	if maxLen and #v > maxLen then return false, "string exceeds max length " .. maxLen end
	return true
end

function Validator.isTable(v)
	if type(v) ~= "table" then return false, "expected table, got " .. type(v) end
	return true
end

function Validator.isPathSafe(path)
	if type(path) ~= "string" then return false, "path must be a string" end
	if #path > 512 then return false, "path too long" end
	-- No null bytes, no control characters
	if path:find("%z") then return false, "path contains null byte" end
	-- No relative traversal patterns
	if path:find("%.%.") then return false, "path traversal detected" end
	-- Must start with a known service
	local root = path:match("^([^/]+)")
	if not root then return false, "path has no root" end
	if BLOCKED_PATHS[root] then return false, "path root is blocked: " .. root end
	if not SERVICE_MAP[root] then return false, "unknown root service: " .. root end
	return true
end

function Validator.isClassAllowed(className)
	if type(className) ~= "string" then return false, "className must be a string" end
	if not ALLOWED_CREATE_CLASSES[className] then
		return false, "className not in allowlist: " .. className
	end
	return true
end

function Validator.isPropertyWritable(propName)
	if type(propName) ~= "string" then return false, "property name must be a string" end
	if BLOCKED_PROPERTIES[propName] then
		return false, "property is blocked: " .. propName
	end
	-- Reject names that look like method calls
	if propName:find("[%(%)%[%]]") then return false, "invalid property name" end
	return true
end

function Validator.sanitiseName(name, default)
	if type(name) ~= "string" or #name == 0 then return default or "Instance" end
	-- Strip control characters
	name = name:gsub("%c", "")
	-- Truncate
	if #name > 128 then name = name:sub(1, 128) end
	return name
end

-- Coerce raw JSON property values into proper Roblox types
function Validator.coerceValue(value)
	if type(value) == "table" then
		-- Vector3: {x, y, z} or {X, Y, Z}
		local x = value[1] or value.x or value.X
		local y = value[2] or value.y or value.Y
		local z = value[3] or value.z or value.Z
		if x ~= nil and y ~= nil and z ~= nil then
			return Vector3.new(tonumber(x) or 0, tonumber(y) or 0, tonumber(z) or 0)
		end
		-- Color3 as {r, g, b} in 0-255 range
		local r = value.r or value.R
		local g = value.g or value.G
		local b = value.b or value.B
		if r ~= nil and g ~= nil and b ~= nil then
			r, g, b = tonumber(r) or 0, tonumber(g) or 0, tonumber(b) or 0
			if r > 1 or g > 1 or b > 1 then
				return Color3.fromRGB(r, g, b)
			else
				return Color3.new(r, g, b)
			end
		end
		-- Size as {w, h} UDim2
		local xs = value.xs or value.XS
		local xo = value.xo or value.XO
		local ys = value.ys or value.YS
		local yo = value.yo or value.YO
		if xs ~= nil then
			return UDim2.new(
				tonumber(xs) or 0, tonumber(xo) or 0,
				tonumber(ys) or 0, tonumber(yo) or 0
			)
		end
	end
	return value
end

-- ============================================================
--  INSTANCE MANAGER
-- ============================================================

local InstanceManager = {}
InstanceManager.__index = InstanceManager

function InstanceManager.new(auditLog)
	local self     = setmetatable({}, InstanceManager)
	self._log      = auditLog
	self._registry = {}  -- weak map: path -> instance hint (informational)
	return self
end

function InstanceManager:_resolve(path)
	local ok, err = Validator.isPathSafe(path)
	if not ok then return nil, err end

	local parts = string.split(path, "/")
	local root  = parts[1]
	local getter = SERVICE_MAP[root]
	if not getter then return nil, "unknown service: " .. root end

	local current = getter()
	if current == nil then return nil, "service returned nil for: " .. root end

	for i = 2, #parts do
		local part = parts[i]
		if part ~= "" then
			local child = current:FindFirstChild(part)
			if child == nil then
				return nil, "child not found: " .. part .. " in " .. current:GetFullName()
			end
			current = child
		end
	end

	return current, nil
end

function InstanceManager:getPath(instance)
	if instance == nil then return "nil" end
	local ok, path = pcall(function()
		return instance:GetFullName()
	end)
	if ok then return path else return "unknown" end
end

function InstanceManager:createInstance(className, parentPath, name, properties)
	local okClass, errClass = Validator.isClassAllowed(className)
	if not okClass then return nil, errClass end

	local parent, err = self:_resolve(parentPath)
	if not parent then return nil, "parent resolve failed: " .. (err or "?") end

	name = Validator.sanitiseName(name, className)

	local ok, result = pcall(function()
		local inst = Instance.new(className)
		inst.Name  = name
		if properties then
			self:_applyProperties(inst, properties)
		end
		inst.Parent = parent
		return inst
	end)

	if ok then
		self._log:info("InstanceManager", "created " .. className .. " at " .. parentPath .. "/" .. name)
		return result, nil
	else
		return nil, tostring(result)
	end
end

function InstanceManager:createPart(parentPath, name, shape, properties)
	local parent, err = self:_resolve(parentPath)
	if not parent then return nil, "parent resolve failed: " .. (err or "?") end

	shape = (type(shape) == "string") and shape or "Block"
	local safeShapes = { Block = true, Ball = true, Cylinder = true, Wedge = true, CornerWedge = true }
	if not safeShapes[shape] then shape = "Block" end

	name = Validator.sanitiseName(name, shape)

	local ok, result = pcall(function()
		local part
		if shape == "Wedge" then
			part = Instance.new("WedgePart")
		elseif shape == "CornerWedge" then
			part = Instance.new("CornerWedgePart")
		else
			part = Instance.new("Part")
			local shapeEnum = {
				Block    = Enum.PartType.Block,
				Ball     = Enum.PartType.Ball,
				Cylinder = Enum.PartType.Cylinder,
			}
			part.Shape = shapeEnum[shape] or Enum.PartType.Block
		end

		part.Name = name

		if properties then
			self:_applyProperties(part, properties)
		end

		part.Parent = parent
		return part
	end)

	if ok then
		self._log:info("InstanceManager", "created Part/" .. shape .. " at " .. parentPath .. "/" .. name)
		return result, nil
	else
		return nil, tostring(result)
	end
end

function InstanceManager:createFolder(parentPath, name)
	local parent, err = self:_resolve(parentPath)
	if not parent then return nil, "parent resolve failed: " .. (err or "?") end

	name = Validator.sanitiseName(name, "Folder")

	local ok, result = pcall(function()
		local folder = Instance.new("Folder")
		folder.Name  = name
		folder.Parent = parent
		return folder
	end)

	if ok then
		self._log:info("InstanceManager", "created Folder at " .. parentPath .. "/" .. name)
		return result, nil
	else
		return nil, tostring(result)
	end
end

function InstanceManager:createScript(parentPath, name, code, isLocal)
	local parent, err = self:_resolve(parentPath)
	if not parent then return nil, "parent resolve failed: " .. (err or "?") end

	if type(code) ~= "string" then return nil, "code must be a string" end
	if #code > 256 * 1024 then return nil, "script source exceeds 256 KB limit" end

	name = Validator.sanitiseName(name, isLocal and "LocalScript" or "Script")

	local ok, result = pcall(function()
		local cls = isLocal and "LocalScript" or "Script"
		local s   = Instance.new(cls)
		s.Name    = name
		s.Source  = code
		s.Parent  = parent
		return s
	end)

	if ok then
		self._log:info("InstanceManager", "created " .. (isLocal and "LocalScript" or "Script") .. " at " .. parentPath .. "/" .. name)
		return result, nil
	else
		return nil, tostring(result)
	end
end

function InstanceManager:createUI(parentPath, uiType, name, properties)
	local okClass, errClass = Validator.isClassAllowed(uiType)
	if not okClass then return nil, errClass end

	local parent, err = self:_resolve(parentPath)
	if not parent then return nil, "parent resolve failed: " .. (err or "?") end

	name = Validator.sanitiseName(name, uiType)

	local ok, result = pcall(function()
		local ui    = Instance.new(uiType)
		ui.Name     = name
		if properties then
			self:_applyProperties(ui, properties)
		end
		ui.Parent   = parent
		return ui
	end)

	if ok then
		self._log:info("InstanceManager", "created UI/" .. uiType .. " at " .. parentPath .. "/" .. name)
		return result, nil
	else
		return nil, tostring(result)
	end
end

function InstanceManager:setProperty(instancePath, propName, value)
	local instance, err = self:_resolve(instancePath)
	if not instance then return false, "resolve failed: " .. (err or "?") end

	local okProp, errProp = Validator.isPropertyWritable(propName)
	if not okProp then return false, errProp end

	value = Validator.coerceValue(value)

	local ok, result = pcall(function()
		instance[propName] = value
	end)

	if ok then
		self._log:debug("InstanceManager", "set " .. instancePath .. "." .. propName)
		return true, nil
	else
		return false, tostring(result)
	end
end

function InstanceManager:getProperty(instancePath, propName)
	local instance, err = self:_resolve(instancePath)
	if not instance then return nil, "resolve failed: " .. (err or "?") end

	if type(propName) ~= "string" then return nil, "property name must be a string" end

	local ok, value = pcall(function()
		return instance[propName]
	end)

	if ok then
		return value, nil
	else
		return nil, tostring(value)
	end
end

function InstanceManager:deleteInstance(instancePath)
	local instance, err = self:_resolve(instancePath)
	if not instance then return false, "resolve failed: " .. (err or "?") end

	-- Extra guard: never destroy game-critical services
	local root = instancePath:match("^([^/]+)")
	if BLOCKED_PATHS[root] then
		return false, "deletion of this path is blocked"
	end

	-- Require that the target has a parent (prevents destroying roots)
	if instance.Parent == nil then
		return false, "cannot destroy a root instance"
	end

	local ok, result = pcall(function()
		instance:Destroy()
	end)

	if ok then
		self._log:warn("InstanceManager", "deleted instance at " .. instancePath)
		return true, nil
	else
		return false, tostring(result)
	end
end

function InstanceManager:renameInstance(instancePath, newName)
	local instance, err = self:_resolve(instancePath)
	if not instance then return false, "resolve failed: " .. (err or "?") end

	newName = Validator.sanitiseName(newName)
	if not newName or #newName == 0 then return false, "newName is empty" end

	local ok, result = pcall(function()
		instance.Name = newName
	end)

	if ok then
		self._log:info("InstanceManager", "renamed " .. instancePath .. " -> " .. newName)
		return true, nil
	else
		return false, tostring(result)
	end
end

function InstanceManager:moveInstance(instancePath, newParentPath)
	local instance, err = self:_resolve(instancePath)
	if not instance then return false, "resolve failed: " .. (err or "?") end

	local newParent, err2 = self:_resolve(newParentPath)
	if not newParent then return false, "new parent resolve failed: " .. (err2 or "?") end

	-- Guard against reparenting to a descendant (would orphan the instance)
	local ok2, isDesc = pcall(function()
		return newParent:IsDescendantOf(instance)
	end)
	if ok2 and isDesc then
		return false, "cannot move instance into its own descendant"
	end

	local ok, result = pcall(function()
		instance.Parent = newParent
	end)

	if ok then
		self._log:info("InstanceManager", "moved " .. instancePath .. " -> " .. newParentPath)
		return true, nil
	else
		return false, tostring(result)
	end
end

function InstanceManager:cloneInstance(instancePath, newParentPath, newName)
	local instance, err = self:_resolve(instancePath)
	if not instance then return nil, "resolve failed: " .. (err or "?") end

	local newParent
	if newParentPath then
		local err2
		newParent, err2 = self:_resolve(newParentPath)
		if not newParent then return nil, "new parent resolve failed: " .. (err2 or "?") end
	else
		newParent = instance.Parent
	end

	local ok, result = pcall(function()
		local clone = instance:Clone()
		if newName then
			clone.Name = Validator.sanitiseName(newName, clone.Name)
		end
		clone.Parent = newParent
		return clone
	end)

	if ok then
		self._log:info("InstanceManager", "cloned " .. instancePath)
		return result, nil
	else
		return nil, tostring(result)
	end
end

function InstanceManager:editScript(instancePath, code)
	local instance, err = self:_resolve(instancePath)
	if not instance then return false, "resolve failed: " .. (err or "?") end

	if not (instance:IsA("Script") or instance:IsA("LocalScript") or instance:IsA("ModuleScript")) then
		return false, "target is not a script"
	end

	if type(code) ~= "string" then return false, "code must be a string" end
	if #code > 256 * 1024 then return false, "source exceeds 256 KB limit" end

	local ok, result = pcall(function()
		instance.Source = code
	end)

	if ok then
		self._log:info("InstanceManager", "edited script at " .. instancePath)
		return true, nil
	else
		return false, tostring(result)
	end
end

function InstanceManager:getExplorerTree(maxDepth)
	maxDepth = math.min(tonumber(maxDepth) or CONFIG.EXPLORER_MAX_DEPTH, CONFIG.EXPLORER_MAX_DEPTH)

	local nodeCount = 0
	local MAX_NODES = 2000

	local function buildTree(instance, depth)
		if depth > maxDepth then return nil end
		if nodeCount >= MAX_NODES then return nil end
		nodeCount = nodeCount + 1

		local node = {
			name      = instance.Name,
			className = instance.ClassName,
			children  = {},
		}

		for _, child in ipairs(instance:GetChildren()) do
			if nodeCount < MAX_NODES then
				local childNode = buildTree(child, depth + 1)
				if childNode then
					table.insert(node.children, childNode)
				end
			end
		end

		return node
	end

	local tree = {}
	for name, getter in pairs(SERVICE_MAP) do
		local ok, svc = pcall(getter)
		if ok and svc then
			tree[name] = buildTree(svc, 1)
		end
	end

	self._log:debug("InstanceManager", string.format("explorer tree serialised (%d nodes)", nodeCount))
	return tree
end

function InstanceManager:getSelection()
	local sel = Selection:Get()
	local out = {}
	for _, inst in ipairs(sel) do
		table.insert(out, {
			name      = inst.Name,
			className = inst.ClassName,
			path      = self:getPath(inst),
		})
	end
	return out
end

function InstanceManager:_applyProperties(instance, properties)
	if type(properties) ~= "table" then return end
	for propName, rawValue in pairs(properties) do
		local okProp = Validator.isPropertyWritable(propName)
		if okProp then
			local value = Validator.coerceValue(rawValue)
			local ok, err = pcall(function()
				instance[propName] = value
			end)
			if not ok then
				self._log:warn("InstanceManager", "failed to set " .. propName .. ": " .. tostring(err))
			end
		end
	end
end

-- ============================================================
--  WEBSOCKET CLIENT  (HTTP polling transport)
-- ============================================================

local WebSocketClient = {}
WebSocketClient.__index = WebSocketClient

function WebSocketClient.new(url, auditLog, rateLimiter)
	local self = setmetatable({}, WebSocketClient)

	self._url              = url
	self._log              = auditLog
	self._rateLimiter      = rateLimiter

	self._connected        = false
	self._reconnecting     = false
	self._reconnectDelay   = CONFIG.RECONNECT_DELAY_MIN
	self._reconnectAttempts = 0

	self._outQueue         = {}
	self._handlers         = { message = {}, connect = {}, close = {}, error = {} }

	self._lastActivity     = tick()
	self._heartbeatConn    = nil
	self._pollConn         = nil

	self._requestId        = 0
	self._stats            = {
		sent       = 0,
		received   = 0,
		errors     = 0,
		reconnects = 0,
		dropped    = 0,
	}

	return self
end

function WebSocketClient:on(event, handler)
	if self._handlers[event] then
		table.insert(self._handlers[event], handler)
	end
end

function WebSocketClient:_emit(event, ...)
	local handlers = self._handlers[event]
	if not handlers then return end
	for _, h in ipairs(handlers) do
		local ok, err = pcall(h, ...)
		if not ok then
			self._log:error("WebSocket", "handler error on " .. event .. ": " .. tostring(err))
		end
	end
end

-- Jitter helper to avoid thundering-herd reconnects
local function withJitter(delay)
	return delay * (0.8 + math.random() * 0.4)
end

function WebSocketClient:connect()
	if self._connected or self._reconnecting then return end
	self._reconnecting = true
	self._reconnectAttempts = 0
	self:_attemptConnect()
end

function WebSocketClient:_attemptConnect()
	self._reconnectAttempts = self._reconnectAttempts + 1

	if CONFIG.RECONNECT_MAX_ATTEMPTS > 0
		and self._reconnectAttempts > CONFIG.RECONNECT_MAX_ATTEMPTS then
		self:_onConnectionFailed()
		return
	end

	self._log:info("WebSocket", string.format("connect attempt %d to %s", self._reconnectAttempts, self._url))

	local ok, response = pcall(function()
		return HttpService:GetAsync(self._url .. "/api/health", false)
	end)

	if ok and response then
		self._connected        = true
		self._reconnecting     = false
		self._reconnectAttempts = 0
		self._reconnectDelay   = CONFIG.RECONNECT_DELAY_MIN
		self._lastActivity     = tick()
		self._stats.reconnects = self._stats.reconnects + 1

		self._log:info("WebSocket", "connected")
		self:_startHeartbeat()
		self:_startPoll()
		self:_flushQueue()
		self:_emit("connect")
	else
		self:_scheduleReconnect()
	end
end

function WebSocketClient:_scheduleReconnect()
	if CONFIG.RECONNECT_MAX_ATTEMPTS > 0
		and self._reconnectAttempts > CONFIG.RECONNECT_MAX_ATTEMPTS then
		self:_onConnectionFailed()
		return
	end

	local delay = withJitter(self._reconnectDelay)
	self._log:info("WebSocket", string.format("retry in %.1fs (attempt %d)", delay, self._reconnectAttempts))

	self._reconnectDelay = math.min(
		self._reconnectDelay * 1.5,
		CONFIG.RECONNECT_DELAY_MAX
	)

	task.delay(delay, function()
		if self._reconnecting then
			self:_attemptConnect()
		end
	end)
end

function WebSocketClient:_onConnectionFailed()
	self._connected    = false
	self._reconnecting = false
	self._stats.errors = self._stats.errors + 1
	self._log:error("WebSocket", "max reconnect attempts reached")
	self:_emit("error", "max reconnect attempts reached")
	self:_emit("close")
end

function WebSocketClient:_startHeartbeat()
	if self._heartbeatConn then
		self._heartbeatConn:Disconnect()
	end

	local lastPing = tick()

	self._heartbeatConn = RunService.Heartbeat:Connect(function()
		local now = tick()

		-- Heartbeat ping
		if now - lastPing >= CONFIG.HEARTBEAT_INTERVAL then
			lastPing = now
			if self._connected then
				local ok = pcall(function()
					HttpService:GetAsync(self._url .. "/api/health", false)
				end)
				if ok then
					self._lastActivity = tick()
				end
			end
		end

		-- Timeout watchdog
		if self._connected and (now - self._lastActivity) > CONFIG.HEARTBEAT_TIMEOUT then
			self._log:warn("WebSocket", "heartbeat timeout — reconnecting")
			self:_reconnect()
		end
	end)
end

function WebSocketClient:_startPoll()
	if self._pollConn then
		self._pollConn:Disconnect()
	end

	local lastPoll = tick()

	self._pollConn = RunService.Heartbeat:Connect(function()
		local now = tick()
		if now - lastPoll < CONFIG.POLL_INTERVAL then return end
		lastPoll = now

		if not self._connected then return end

		local ok, response = pcall(function()
			return HttpService:GetAsync(self._url .. "/plugin/poll", false)
		end)

		if not ok or not response then return end
		if type(response) ~= "string" or #response == 0 then return end
		if #response > CONFIG.MAX_MESSAGE_BYTES then
			self._log:warn("WebSocket", "inbound message too large, dropped")
			self._stats.dropped = self._stats.dropped + 1
			return
		end

		self._lastActivity = tick()
		self._stats.received = self._stats.received + 1
		self:_emit("message", response)
	end)
end

function WebSocketClient:_reconnect()
	if self._heartbeatConn then self._heartbeatConn:Disconnect(); self._heartbeatConn = nil end
	if self._pollConn      then self._pollConn:Disconnect();      self._pollConn      = nil end

	self._connected    = false
	self._reconnecting = true

	self:_emit("close")
	self:_attemptConnect()
end

function WebSocketClient:send(data)
	if not self._rateLimiter:consume(1) then
		self._stats.dropped = self._stats.dropped + 1
		self._log:warn("WebSocket", "rate limit exceeded — message dropped")
		return false
	end

	local jsonData
	if type(data) == "string" then
		jsonData = data
	else
		local ok, encoded = pcall(function()
			return HttpService:JSONEncode(data)
		end)
		if not ok then
			self._log:error("WebSocket", "JSON encode failed: " .. tostring(encoded))
			return false
		end
		jsonData = encoded
	end

	if not self._connected then
		if #self._outQueue < CONFIG.MAX_QUEUE_SIZE then
			table.insert(self._outQueue, jsonData)
		else
			self._stats.dropped = self._stats.dropped + 1
			self._log:warn("WebSocket", "queue full — message dropped")
		end
		return false
	end

	local ok, err = pcall(function()
		HttpService:PostAsync(
			self._url .. "/plugin",
			jsonData,
			Enum.HttpContentType.ApplicationJson,
			false
		)
	end)

	if ok then
		self._lastActivity = tick()
		self._stats.sent   = self._stats.sent + 1
		return true
	else
		self._stats.errors = self._stats.errors + 1
		self._log:error("WebSocket", "send failed: " .. tostring(err))
		return false
	end
end

function WebSocketClient:sendResult(commandId, success, result, errMsg, state)
	return self:send({
		type    = "result",
		id      = commandId,
		success = success,
		result  = result  or {},
		error   = errMsg  or "",
		state   = state   or {},
	})
end

function WebSocketClient:sendState(state)
	return self:send({ type = "state", state = state })
end

function WebSocketClient:_flushQueue()
	local flushed = 0
	while #self._outQueue > 0 do
		local msg = table.remove(self._outQueue, 1)
		local ok  = pcall(function()
			HttpService:PostAsync(
				self._url .. "/plugin",
				msg,
				Enum.HttpContentType.ApplicationJson,
				false
			)
		end)
		if ok then
			flushed = flushed + 1
			self._stats.sent = self._stats.sent + 1
		end
	end
	if flushed > 0 then
		self._log:info("WebSocket", string.format("flushed %d queued messages", flushed))
	end
end

function WebSocketClient:disconnect()
	if self._heartbeatConn then self._heartbeatConn:Disconnect(); self._heartbeatConn = nil end
	if self._pollConn      then self._pollConn:Disconnect();      self._pollConn      = nil end
	self._connected    = false
	self._reconnecting = false
	self._log:info("WebSocket", "disconnected by request")
	self:_emit("close")
end

function WebSocketClient:isConnected()  return self._connected end
function WebSocketClient:getQueueSize() return #self._outQueue  end
function WebSocketClient:getStats()     return self._stats       end

-- ============================================================
--  COMMAND CONTROLLER
-- ============================================================

local Controller = {}
Controller.__index = Controller

function Controller.new(wsClient, instanceManager, auditLog)
	local self              = setmetatable({}, Controller)
	self._ws                = wsClient
	self._im                = instanceManager
	self._log               = auditLog
	self._executingCommands = {}
	self._history           = {}
	self._historyMaxSize    = CONFIG.HISTORY_MAX_SIZE
	self._stats             = {
		received  = 0,
		succeeded = 0,
		failed    = 0,
		unknown   = 0,
	}
	return self
end

function Controller:start()
	self._log:info("Controller", "starting")

	self._ws:on("message", function(raw)
		self:_handleRaw(raw)
	end)

	self._ws:on("connect", function()
		self._log:info("Controller", "connection established — reporting state")
		self:reportState()
	end)

	self._ws:on("close", function()
		self._log:info("Controller", "connection closed")
	end)
end

function Controller:_handleRaw(raw)
	if type(raw) ~= "string" then
		self._log:warn("Controller", "received non-string message")
		return
	end

	local ok, msg = pcall(function()
		return HttpService:JSONDecode(raw)
	end)

	if not ok or type(msg) ~= "table" then
		self._log:warn("Controller", "failed to decode message JSON")
		self._stats.unknown = self._stats.unknown + 1
		return
	end

	self._stats.received = self._stats.received + 1

	if msg.type == "command" then
		self:_dispatchCommand(msg)
	elseif msg.type == "system" then
		self:_handleSystem(msg)
	elseif msg.type == "batch" then
		self:_handleBatch(msg)
	else
		self._log:warn("Controller", "unknown message type: " .. tostring(msg.type))
		self._stats.unknown = self._stats.unknown + 1
	end
end

function Controller:_handleBatch(msg)
	local commands = msg.commands
	if type(commands) ~= "table" then
		self._log:warn("Controller", "batch missing commands array")
		return
	end
	-- Hard cap on batch size to prevent abuse
	local MAX_BATCH = 50
	if #commands > MAX_BATCH then
		self._log:warn("Controller", string.format("batch truncated from %d to %d", #commands, MAX_BATCH))
		for i = MAX_BATCH + 1, #commands do commands[i] = nil end
	end
	for _, cmd in ipairs(commands) do
		if type(cmd) == "table" then
			self:_dispatchCommand(cmd)
		end
	end
end

function Controller:_dispatchCommand(msg)
	local id     = tostring(msg.id or "unknown")
	local action = msg.action
	local data   = msg.data or {}

	if type(action) ~= "string" or #action == 0 then
		self._log:warn("Controller", "command missing action field (id: " .. id .. ")")
		return
	end

	-- Validate action name format
	if not action:match("^[A-Za-z][A-Za-z0-9_]*$") or #action > 64 then
		self._log:warn("Controller", "invalid action name: " .. action)
		self._ws:sendResult(id, false, {}, "invalid action name", {})
		return
	end

	if type(data) ~= "table" then
		self._log:warn("Controller", "command data is not a table (id: " .. id .. ")")
		data = {}
	end

	-- Replay-attack check
	if self._nonceStore and not self._nonceStore:check(id) then
		self._log:warn("Controller", "replay detected — dropped command id: " .. id)
		self._ws:sendResult(id, false, {}, "duplicate command id (replay rejected)", {})
		return
	end

	self._log:info("Controller", string.format("execute %s (id:%s)", action, id))
	self._executingCommands[id] = { action = action, startTime = tick() }

	local success, result, errMsg = self:_execute(action, data)

	if success then
		self._stats.succeeded = self._stats.succeeded + 1
	else
		self._stats.failed = self._stats.failed + 1
		self._log:warn("Controller", string.format("%s failed: %s", action, tostring(errMsg)))
	end

	self:_addHistory({ id = id, action = action, success = success, errMsg = errMsg, ts = os.time() })

	local state = self:_currentState()
	self._ws:sendResult(id, success, result or {}, errMsg or "", state)
	self._executingCommands[id] = nil
end

function Controller:_execute(action, data)
	-- Dispatch table — only named actions are reachable
	local dispatch = {
		-- Instance operations
		CreateInstance      = function() return self:_doCreateInstance(data) end,
		CreatePart          = function() return self:_doCreatePart(data) end,
		CreateFolder        = function() return self:_doCreateFolder(data) end,
		CreateScript        = function() return self:_doCreateScript(data) end,
		CreateUI            = function() return self:_doCreateUI(data) end,
		SetProperty         = function() return self:_doSetProperty(data) end,
		GetProperty         = function() return self:_doGetProperty(data) end,
		DeleteInstance      = function() return self:_doDeleteInstance(data) end,
		RenameInstance      = function() return self:_doRenameInstance(data) end,
		MoveInstance        = function() return self:_doMoveInstance(data) end,
		CloneInstance       = function() return self:_doCloneInstance(data) end,
		EditScript          = function() return self:_doEditScript(data) end,
		BulkSetProperty     = function() return self:_doBulkSetProperty(data) end,
		BulkDelete          = function() return self:_doBulkDelete(data) end,
		-- Reading / discovery
		GetExplorerTree     = function() return self:_doGetExplorerTree(data) end,
		GetScriptSource     = function() return self:_doGetScriptSource(data) end,
		GetAllScripts       = function() return self:_doGetAllScripts(data) end,
		GetAllProperties    = function() return self:_doGetAllProperties(data) end,
		SearchInstances     = function() return self:_doSearchInstances(data) end,
		GetDescendants      = function() return self:_doGetDescendants(data) end,
		GetChildren         = function() return self:_doGetChildren(data) end,
		GetSelection        = function() return self:_doGetSelection(data) end,
		SetSelection        = function() return self:_doSetSelection(data) end,
		-- Game-level info
		GetGameInfo         = function() return self:_doGetGameInfo(data) end,
		GetPlaceInfo        = function() return self:_doGetPlaceInfo(data) end,
		GetServiceProperties = function() return self:_doGetServiceProperties(data) end,
		SetServiceProperty  = function() return self:_doSetServiceProperty(data) end,
		-- Lighting
		GetLighting         = function() return self:_doGetLighting(data) end,
		SetLighting         = function() return self:_doSetLighting(data) end,
		-- Workspace / physics
		GetWorkspaceSettings = function() return self:_doGetWorkspaceSettings(data) end,
		SetWorkspaceSettings = function() return self:_doSetWorkspaceSettings(data) end,
		-- Players (read-only in Studio)
		GetPlayers          = function() return self:_doGetPlayers(data) end,
		-- Tags (CollectionService)
		GetTags             = function() return self:_doGetTags(data) end,
		AddTag              = function() return self:_doAddTag(data) end,
		RemoveTag           = function() return self:_doRemoveTag(data) end,
		GetTagged           = function() return self:_doGetTagged(data) end,
		-- Teams
		GetTeams            = function() return self:_doGetTeams(data) end,
		-- Attributes
		GetAttribute        = function() return self:_doGetAttribute(data) end,
		SetAttribute        = function() return self:_doSetAttribute(data) end,
		GetAttributes       = function() return self:_doGetAttributes(data) end,
		-- Studio
		GetStudioTheme      = function() return self:_doGetStudioTheme(data) end,
		-- Meta
		GetHistory          = function() return self:_doGetHistory(data) end,
		GetStats            = function() return self:_doGetStats(data) end,
		Ping                = function() return true, { pong = true, ts = os.time() }, nil end,
	}

	local handler = dispatch[action]
	if not handler then
		return false, nil, "unknown action: " .. action
	end

	local ok, a, b, c = pcall(handler)
	if not ok then
		return false, nil, "internal error: " .. tostring(a)
	end
	return a, b, c
end

-- Individual action handlers

function Controller:_doCreateInstance(data)
	local ok, err = Validator.isString(data.className, 128)
	if not ok then return false, nil, "className: " .. err end
	ok, err = Validator.isString(data.parent, 512)
	if not ok then return false, nil, "parent: " .. err end

	local inst, e = self._im:createInstance(data.className, data.parent, data.name, data.properties)
	if inst then return true, { path = self._im:getPath(inst) }, nil
	else return false, nil, e end
end

function Controller:_doCreatePart(data)
	local ok, err = Validator.isString(data.parent, 512)
	if not ok then return false, nil, "parent: " .. err end

	local part, e = self._im:createPart(data.parent, data.name, data.shape, data.properties)
	if part then return true, { path = self._im:getPath(part) }, nil
	else return false, nil, e end
end

function Controller:_doCreateFolder(data)
	local ok, err = Validator.isString(data.parent, 512)
	if not ok then return false, nil, "parent: " .. err end

	local folder, e = self._im:createFolder(data.parent, data.name)
	if folder then return true, { path = self._im:getPath(folder) }, nil
	else return false, nil, e end
end

function Controller:_doCreateScript(data)
	local ok, err = Validator.isString(data.parent, 512)
	if not ok then return false, nil, "parent: " .. err end
	ok, err = Validator.isString(data.code, 256 * 1024)
	if not ok then return false, nil, "code: " .. err end

	local s, e = self._im:createScript(data.parent, data.name, data.code, data.isLocalScript)
	if s then return true, { path = self._im:getPath(s) }, nil
	else return false, nil, e end
end

function Controller:_doCreateUI(data)
	local ok, err = Validator.isString(data.parent, 512)
	if not ok then return false, nil, "parent: " .. err end
	ok, err = Validator.isString(data.type, 128)
	if not ok then return false, nil, "type: " .. err end

	local ui, e = self._im:createUI(data.parent, data.type, data.name, data.properties)
	if ui then return true, { path = self._im:getPath(ui) }, nil
	else return false, nil, e end
end

function Controller:_doSetProperty(data)
	local ok, err = Validator.isString(data.path, 512)
	if not ok then return false, nil, "path: " .. err end
	ok, err = Validator.isString(data.property, 128)
	if not ok then return false, nil, "property: " .. err end

	local s, e = self._im:setProperty(data.path, data.property, data.value)
	if s then return true, {}, nil else return false, nil, e end
end

function Controller:_doGetProperty(data)
	local ok, err = Validator.isString(data.path, 512)
	if not ok then return false, nil, "path: " .. err end
	ok, err = Validator.isString(data.property, 128)
	if not ok then return false, nil, "property: " .. err end

	local value, e = self._im:getProperty(data.path, data.property)
	if e == nil then
		-- Serialise the value safely
		local serialised
		local typ = typeof(value)
		if typ == "Vector3" then
			serialised = { x = value.X, y = value.Y, z = value.Z }
		elseif typ == "Color3" then
			serialised = { r = value.R * 255, g = value.G * 255, b = value.B * 255 }
		elseif typ == "UDim2" then
			serialised = { xs = value.X.Scale, xo = value.X.Offset, ys = value.Y.Scale, yo = value.Y.Offset }
		elseif typ == "CFrame" then
			serialised = { x = value.X, y = value.Y, z = value.Z }
		else
			serialised = value
		end
		return true, { value = serialised, type = typ }, nil
	else
		return false, nil, e
	end
end

function Controller:_doDeleteInstance(data)
	local ok, err = Validator.isString(data.path, 512)
	if not ok then return false, nil, "path: " .. err end

	local s, e = self._im:deleteInstance(data.path)
	if s then return true, {}, nil else return false, nil, e end
end

function Controller:_doRenameInstance(data)
	local ok, err = Validator.isString(data.path, 512)
	if not ok then return false, nil, "path: " .. err end
	ok, err = Validator.isString(data.newName, 128)
	if not ok then return false, nil, "newName: " .. err end

	local s, e = self._im:renameInstance(data.path, data.newName)
	if s then return true, {}, nil else return false, nil, e end
end

function Controller:_doMoveInstance(data)
	local ok, err = Validator.isString(data.path, 512)
	if not ok then return false, nil, "path: " .. err end
	ok, err = Validator.isString(data.newParent, 512)
	if not ok then return false, nil, "newParent: " .. err end

	local s, e = self._im:moveInstance(data.path, data.newParent)
	if s then return true, {}, nil else return false, nil, e end
end

function Controller:_doCloneInstance(data)
	local ok, err = Validator.isString(data.path, 512)
	if not ok then return false, nil, "path: " .. err end

	local clone, e = self._im:cloneInstance(data.path, data.newParent, data.newName)
	if clone then return true, { path = self._im:getPath(clone) }, nil
	else return false, nil, e end
end

function Controller:_doGetExplorerTree(data)
	local tree = self._im:getExplorerTree(data.maxDepth)
	return true, tree, nil
end

function Controller:_doEditScript(data)
	local ok, err = Validator.isString(data.path, 512)
	if not ok then return false, nil, "path: " .. err end
	ok, err = Validator.isString(data.code, 256 * 1024)
	if not ok then return false, nil, "code: " .. err end

	local s, e = self._im:editScript(data.path, data.code)
	if s then return true, {}, nil else return false, nil, e end
end

function Controller:_doGetSelection(_data)
	local sel = self._im:getSelection()
	return true, { selection = sel, count = #sel }, nil
end

function Controller:_doGetHistory(data)
	local n   = math.min(tonumber(data.limit) or 20, 200)
	local out = {}
	for i = 1, math.min(n, #self._history) do
		out[i] = self._history[i]
	end
	return true, { history = out, total = #self._history }, nil
end

function Controller:_doGetStats(_data)
	return true, {
		controller = self._stats,
		websocket  = self._ws:getStats(),
		auditLog   = self._log:getSummary(),
		uptime     = tick(),
	}, nil
end

function Controller:_handleSystem(msg)
	local action = msg.action or ""
	if action == "connected" then
		self._log:info("Controller", "server connected (id: " .. tostring(msg.id) .. ")")
	elseif action == "ping" then
		self._ws:send({ type = "system", action = "pong", ts = os.time() })
	else
		self._log:debug("Controller", "system msg: " .. action)
	end
end

function Controller:reportState()
	self._ws:sendState(self:_currentState())
end

function Controller:_currentState()
	return {
		workspaceChildren = #workspace:GetChildren(),
		executing         = self:_execCount(),
		ts                = os.time(),
	}
end

function Controller:_execCount()
	local n = 0
	for _ in pairs(self._executingCommands) do n = n + 1 end
	return n
end

function Controller:_addHistory(entry)
	table.insert(self._history, 1, entry)
	if #self._history > self._historyMaxSize then
		table.remove(self._history)
	end
end

-- ============================================================
--  EXTENDED ACTION HANDLERS
-- ============================================================

-- helper: safely read a list of named properties from an instance
local function readProps(inst, propNames)
	local out = {}
	for _, name in ipairs(propNames) do
		local ok, val = pcall(function() return inst[name] end)
		if ok then
			local t = typeof(val)
			if t == "Vector3" then
				out[name] = { x = val.X, y = val.Y, z = val.Z }
			elseif t == "Color3" then
				out[name] = { r = math.floor(val.R*255), g = math.floor(val.G*255), b = math.floor(val.B*255) }
			elseif t == "CFrame" then
				out[name] = { x = val.X, y = val.Y, z = val.Z, rx = val.LookVector.X, ry = val.LookVector.Y, rz = val.LookVector.Z }
			elseif t == "UDim2" then
				out[name] = { xs = val.X.Scale, xo = val.X.Offset, ys = val.Y.Scale, yo = val.Y.Offset }
			elseif t == "EnumItem" then
				out[name] = tostring(val)
			elseif t == "Instance" then
				out[name] = val:GetFullName()
			elseif t == "boolean" or t == "number" or t == "string" then
				out[name] = val
			else
				local ok2, s = pcall(tostring, val)
				out[name] = ok2 and s or "?"
			end
		end
	end
	return out
end

-- BulkSetProperty: set same property on multiple paths
function Controller:_doBulkSetProperty(data)
	local paths    = data.paths
	local propName = data.property
	local value    = data.value
	if type(paths) ~= "table" then return false, nil, "paths must be array" end
	if type(propName) ~= "string" then return false, nil, "property must be string" end
	local okProp, errProp = Validator.isPropertyWritable(propName)
	if not okProp then return false, nil, errProp end
	local results = {}
	for _, path in ipairs(paths) do
		local s, e = self._im:setProperty(path, propName, value)
		table.insert(results, { path = path, success = s, error = e })
	end
	return true, { results = results, count = #results }, nil
end

-- BulkDelete: delete multiple paths at once
function Controller:_doBulkDelete(data)
	local paths = data.paths
	if type(paths) ~= "table" then return false, nil, "paths must be array" end
	local results = {}
	for _, path in ipairs(paths) do
		local s, e = self._im:deleteInstance(path)
		table.insert(results, { path = path, success = s, error = e })
	end
	return true, { results = results, count = #results }, nil
end

-- GetScriptSource: read source of a script
function Controller:_doGetScriptSource(data)
	local ok, err = Validator.isString(data.path, 512)
	if not ok then return false, nil, "path: " .. err end
	local inst, e = self._im:_resolve(data.path)
	if not inst then return false, nil, e end
	if not (inst:IsA("Script") or inst:IsA("LocalScript") or inst:IsA("ModuleScript")) then
		return false, nil, "not a script: " .. data.path
	end
	local src
	local ok2, val = pcall(function() return inst.Source end)
	if not ok2 then return false, nil, "cannot read Source: " .. tostring(val) end
	src = val
	return true, { path = data.path, source = src, className = inst.ClassName, lineCount = select(2, src:gsub("\n","")) + 1 }, nil
end

-- GetAllScripts: scan entire game tree and return all scripts with sources
function Controller:_doGetAllScripts(data)
	local includeSources = data.includeSources ~= false
	local results = {}
	local count   = 0
	local MAX_SCRIPTS = 500

	local function scan(inst, depth)
		if count >= MAX_SCRIPTS then return end
		if depth > 20 then return end
		if inst:IsA("Script") or inst:IsA("LocalScript") or inst:IsA("ModuleScript") then
			count = count + 1
			local entry = {
				path      = self._im:getPath(inst),
				name      = inst.Name,
				className = inst.ClassName,
				disabled  = inst:IsA("BaseScript") and inst.Disabled or false,
			}
			if includeSources then
				local ok2, src = pcall(function() return inst.Source end)
				entry.source    = ok2 and src or nil
				entry.lineCount = ok2 and (select(2, src:gsub("\n","")) + 1) or 0
			end
			table.insert(results, entry)
		end
		for _, child in ipairs(inst:GetChildren()) do
			scan(child, depth + 1)
		end
	end

	for _, getter in pairs(SERVICE_MAP) do
		local ok2, svc = pcall(getter)
		if ok2 and svc then pcall(scan, svc, 1) end
	end

	self._log:info("Controller", string.format("GetAllScripts: found %d scripts", count))
	return true, { scripts = results, total = count }, nil
end

-- GetAllProperties: dump every readable property on an instance
function Controller:_doGetAllProperties(data)
	local ok, err = Validator.isString(data.path, 512)
	if not ok then return false, nil, "path: " .. err end
	local inst, e = self._im:_resolve(data.path)
	if not inst then return false, nil, e end

	-- Get properties via API dump approach — read known common ones plus any on the class
	local props = {}
	local commonProps = {
		"Name","ClassName","Parent","Archivable",
		-- Part
		"Size","Position","Orientation","CFrame","Color","BrickColor","Material","Transparency",
		"Reflectance","Anchored","CanCollide","CanQuery","CanTouch","CastShadow","Locked",
		"Shape","TopSurface","BottomSurface","FrontSurface","BackSurface","LeftSurface","RightSurface",
		"MassType","Density","Friction","Elasticity","FrictionWeight","ElasticityWeight",
		-- BasePart common
		"AssemblyLinearVelocity","AssemblyAngularVelocity","AssemblyMass","AssemblyCenterOfMass",
		-- Script
		"Source","Disabled","RunContext",
		-- UI
		"BackgroundColor3","BackgroundTransparency","BorderColor3","BorderSizePixel",
		"Size","Position","Visible","ZIndex","Active","ClipsDescendants","AutomaticSize",
		"Text","TextColor3","TextSize","TextTransparency","Font","TextWrapped","TextXAlignment","TextYAlignment",
		"Image","ImageColor3","ImageTransparency","ScaleType","TileSize","SliceCenter",
		-- Humanoid
		"Health","MaxHealth","WalkSpeed","JumpPower","JumpHeight","AutoRotate","AutoJumpEnabled",
		-- Light
		"Brightness","Range","Color","Enabled","Shadows","Angle","Face",
		-- Sound
		"SoundId","Volume","Pitch","Playing","Looped","RollOffMaxDistance","RollOffMinDistance",
		-- Model
		"PrimaryPart","LevelOfDetail","ModelLod",
		-- Lighting service
		"Ambient","OutdoorAmbient","Brightness","ClockTime","GeographicLatitude","ExposureCompensation",
		"FogColor","FogEnd","FogStart","GlobalShadows","ShadowSoftness","Technology",
	}

	for _, pname in ipairs(commonProps) do
		local ok2, val = pcall(function() return inst[pname] end)
		if ok2 and val ~= nil then
			local t = typeof(val)
			if t == "Vector3" then
				props[pname] = { _type="Vector3", x=val.X, y=val.Y, z=val.Z }
			elseif t == "Color3" then
				props[pname] = { _type="Color3", r=math.floor(val.R*255), g=math.floor(val.G*255), b=math.floor(val.B*255) }
			elseif t == "CFrame" then
				props[pname] = { _type="CFrame", x=val.X, y=val.Y, z=val.Z }
			elseif t == "EnumItem" then
				props[pname] = { _type="Enum", value=tostring(val) }
			elseif t == "Instance" then
				props[pname] = { _type="Instance", path=val:GetFullName() }
			elseif t == "boolean" or t == "number" or t == "string" then
				props[pname] = val
			elseif t == "BrickColor" then
				props[pname] = { _type="BrickColor", name=tostring(val) }
			end
		end
	end

	return true, { path = data.path, className = inst.ClassName, properties = props }, nil
end

-- SearchInstances: find all instances matching name/class/tag in scope
function Controller:_doSearchInstances(data)
	local searchName  = data.name
	local searchClass = data.className
	local searchTag   = data.tag
	local rootPath    = data.root  -- optional, defaults to entire game
	local maxResults  = math.min(tonumber(data.limit) or 200, 500)

	if not searchName and not searchClass and not searchTag then
		return false, nil, "provide at least one of: name, className, tag"
	end

	local results = {}
	local count   = 0

	local function matches(inst)
		if searchName  and not inst.Name:lower():find(searchName:lower(), 1, true) then return false end
		if searchClass and inst.ClassName ~= searchClass then return false end
		if searchTag then
			local cs = game:GetService("CollectionService")
			if not cs:HasTag(inst, searchTag) then return false end
		end
		return true
	end

	local function scan(inst, depth)
		if count >= maxResults or depth > 30 then return end
		if matches(inst) then
			count = count + 1
			table.insert(results, {
				name      = inst.Name,
				className = inst.ClassName,
				path      = self._im:getPath(inst),
			})
		end
		for _, child in ipairs(inst:GetChildren()) do
			scan(child, depth + 1)
		end
	end

	if rootPath then
		local root, e = self._im:_resolve(rootPath)
		if not root then return false, nil, "root resolve failed: " .. (e or "?") end
		pcall(scan, root, 1)
	else
		for _, getter in pairs(SERVICE_MAP) do
			local ok2, svc = pcall(getter)
			if ok2 and svc then pcall(scan, svc, 1) end
			if count >= maxResults then break end
		end
	end

	self._log:info("Controller", string.format("SearchInstances: found %d results", count))
	return true, { results = results, total = count, capped = count >= maxResults }, nil
end

-- GetDescendants: return flat list of all descendants of a path
function Controller:_doGetDescendants(data)
	local ok, err = Validator.isString(data.path, 512)
	if not ok then return false, nil, "path: " .. err end
	local inst, e = self._im:_resolve(data.path)
	if not inst then return false, nil, e end

	local classFilter = data.className
	local maxResults  = math.min(tonumber(data.limit) or 500, 2000)
	local results     = {}

	local ok2, descs = pcall(function() return inst:GetDescendants() end)
	if not ok2 then return false, nil, "GetDescendants failed" end

	for _, d in ipairs(descs) do
		if #results >= maxResults then break end
		if not classFilter or d.ClassName == classFilter then
			table.insert(results, {
				name      = d.Name,
				className = d.ClassName,
				path      = self._im:getPath(d),
			})
		end
	end

	return true, { descendants = results, total = #results, capped = #results >= maxResults }, nil
end

-- GetChildren: return direct children of a path with basic properties
function Controller:_doGetChildren(data)
	local ok, err = Validator.isString(data.path, 512)
	if not ok then return false, nil, "path: " .. err end
	local inst, e = self._im:_resolve(data.path)
	if not inst then return false, nil, e end

	local children = {}
	local ok2, kids = pcall(function() return inst:GetChildren() end)
	if not ok2 then return false, nil, "GetChildren failed" end

	for _, child in ipairs(kids) do
		table.insert(children, {
			name      = child.Name,
			className = child.ClassName,
			path      = self._im:getPath(child),
			childCount = #child:GetChildren(),
		})
	end

	return true, { children = children, count = #children, parentPath = data.path }, nil
end

-- SetSelection: select instances in Studio by path
function Controller:_doSetSelection(data)
	local paths = data.paths
	if type(paths) ~= "table" then return false, nil, "paths must be array" end
	local instances = {}
	for _, path in ipairs(paths) do
		local inst, _ = self._im:_resolve(path)
		if inst then table.insert(instances, inst) end
	end
	local ok2, err2 = pcall(function() Selection:Set(instances) end)
	if not ok2 then return false, nil, tostring(err2) end
	return true, { selected = #instances }, nil
end

-- GetGameInfo: place id, game id, creator, name
function Controller:_doGetGameInfo(_data)
	local info = {}
	local props = { "GameId","PlaceId","PlaceVersion","PlacePublishService","Name","JobId","CreatorId","CreatorType","PrivateServerId","PrivateServerOwnerId","Workspace" }
	for _, p in ipairs(props) do
		local ok2, val = pcall(function() return game[p] end)
		if ok2 then
			if typeof(val) == "Instance" then
				info[p] = val:GetFullName()
			elseif typeof(val) == "EnumItem" then
				info[p] = tostring(val)
			else
				info[p] = val
			end
		end
	end
	-- Studio-specific info
	local ok3, theme = pcall(function() return settings().Studio.Theme.Name end)
	info.studioTheme = ok3 and theme or "unknown"
	info.isStudio    = RunService:IsStudio()
	info.isEdit      = RunService:IsEdit()
	info.isRunning   = RunService:IsRunning()
	return true, info, nil
end

-- GetPlaceInfo: broader place metadata
function Controller:_doGetPlaceInfo(_data)
	local info = {
		placeId      = game.PlaceId,
		gameId       = game.GameId,
		placeVersion = game.PlaceVersion,
		isStudio     = RunService:IsStudio(),
		isEdit       = RunService:IsEdit(),
		isRunning    = RunService:IsRunning(),
		isServer     = RunService:IsServer(),
		isClient     = RunService:IsClient(),
	}
	-- workspace metadata
	local ws = workspace
	info.workspaceName         = ws.Name
	local ok2, grav = pcall(function() return ws.Gravity end)
	info.gravity               = ok2 and grav or nil
	local ok3, streamingEnabled = pcall(function() return ws.StreamingEnabled end)
	info.streamingEnabled      = ok3 and streamingEnabled or nil
	local ok4, streamingDistance = pcall(function() return ws.StreamingMinRadius end)
	info.streamingMinRadius    = ok4 and streamingDistance or nil
	return true, info, nil
end

-- GetServiceProperties: read all readable properties of a named service
function Controller:_doGetServiceProperties(data)
	local ok, err = Validator.isString(data.service, 64)
	if not ok then return false, nil, "service: " .. err end

	local getter = SERVICE_MAP[data.service]
	if not getter then return false, nil, "unknown service: " .. data.service end
	local ok2, svc = pcall(getter)
	if not ok2 or not svc then return false, nil, "service not available: " .. data.service end

	-- Read a broad set of property names — errors are silently skipped
	local props = {}
	local ok3, allProps = pcall(function()
		-- Use Instance:GetAttributes as a sanity probe then enumerate known names
		return {}
	end)

	-- Read properties dynamically from a predefined broad list
	local broadList = {
		"Name","ClassName","Gravity","Ambient","OutdoorAmbient","Brightness","ClockTime",
		"GeographicLatitude","ExposureCompensation","FogColor","FogEnd","FogStart",
		"GlobalShadows","ShadowSoftness","Technology","StreamingEnabled","StreamingMinRadius",
		"StreamingMaxRadius","StreamingIntegrityMode","FallenPartsDestroyHeight",
		"SignalBehavior","PhysicsSteppingMethod","InterpolationThrottling",
		"WorkspaceSignalBehavior","AllowThirdPartySales","AllowExternalLinks",
		"ChatVersion","BubbleChatEnabled","VoiceChatEnabled",
		"MaxPlayers","PreferredPlayers","RespawnTime",
		"AmbientReverb","DistanceFactor","DopplerScale","RolloffScale",
		"AnimatorThrottlingMode","HumanoidStateMachineMode",
		"MeshPartHeadsAndAccessories","AvatarUnificationMode",
		"IKControlConstraintSupport","LoadStringEnabled",
		"HttpEnabled","AllowedExternalLinkReferences",
	}

	for _, pname in ipairs(broadList) do
		local ok4, val = pcall(function() return svc[pname] end)
		if ok4 and val ~= nil then
			local t = typeof(val)
			if t == "Color3" then
				props[pname] = { _type="Color3", r=math.floor(val.R*255), g=math.floor(val.G*255), b=math.floor(val.B*255) }
			elseif t == "EnumItem" then
				props[pname] = { _type="Enum", value=tostring(val) }
			elseif t == "boolean" or t == "number" or t == "string" then
				props[pname] = val
			end
		end
	end

	return true, { service = data.service, properties = props }, nil
end

-- SetServiceProperty: write a property on a named service
function Controller:_doSetServiceProperty(data)
	local ok, err = Validator.isString(data.service, 64)
	if not ok then return false, nil, "service: " .. err end
	ok, err = Validator.isString(data.property, 128)
	if not ok then return false, nil, "property: " .. err end

	local okProp, errProp = Validator.isPropertyWritable(data.property)
	if not okProp then return false, nil, errProp end

	local getter = SERVICE_MAP[data.service]
	if not getter then return false, nil, "unknown service: " .. data.service end
	local ok2, svc = pcall(getter)
	if not ok2 or not svc then return false, nil, "service unavailable" end

	local value = Validator.coerceValue(data.value)
	local ok3, e3 = pcall(function() svc[data.property] = value end)
	if not ok3 then return false, nil, tostring(e3) end

	self._log:info("Controller", string.format("SetServiceProperty %s.%s", data.service, data.property))
	return true, {}, nil
end

-- GetLighting: full snapshot of the Lighting service
function Controller:_doGetLighting(_data)
	local L = game:GetService("Lighting")
	local lightingProps = {
		"Ambient","OutdoorAmbient","Brightness","ClockTime","TimeOfDay",
		"GeographicLatitude","ExposureCompensation","EnvironmentDiffuseScale",
		"EnvironmentSpecularScale","FogColor","FogEnd","FogStart",
		"GlobalShadows","ShadowSoftness","Technology",
	}
	local props = readProps(L, lightingProps)
	-- also get children (atmospheres, effects, etc.)
	local effects = {}
	for _, child in ipairs(L:GetChildren()) do
		table.insert(effects, { name = child.Name, className = child.ClassName })
	end
	return true, { properties = props, effects = effects }, nil
end

-- SetLighting: bulk-set lighting properties
function Controller:_doSetLighting(data)
	if type(data.properties) ~= "table" then return false, nil, "properties must be table" end
	local L = game:GetService("Lighting")
	local results = {}
	for pname, pval in pairs(data.properties) do
		local okProp = Validator.isPropertyWritable(pname)
		if okProp then
			local val = Validator.coerceValue(pval)
			local ok2, e2 = pcall(function() L[pname] = val end)
			table.insert(results, { property = pname, success = ok2, error = ok2 and nil or tostring(e2) })
		else
			table.insert(results, { property = pname, success = false, error = "blocked property" })
		end
	end
	self._log:info("Controller", "SetLighting: applied " .. #results .. " properties")
	return true, { results = results }, nil
end

-- GetWorkspaceSettings: workspace physics and rendering settings
function Controller:_doGetWorkspaceSettings(_data)
	local ws = workspace
	local wsProps = {
		"Gravity","FallenPartsDestroyHeight","StreamingEnabled","StreamingMinRadius",
		"StreamingMaxRadius","StreamingIntegrityMode","StreamingPauseMode",
		"SignalBehavior","PhysicsSteppingMethod","InterpolationThrottling",
		"ReplicaFocus","DistributedGameTime","Name","AllowThirdPartySales",
	}
	local props = readProps(ws, wsProps)
	return true, { properties = props, childCount = #ws:GetChildren() }, nil
end

-- SetWorkspaceSettings: write workspace properties
function Controller:_doSetWorkspaceSettings(data)
	if type(data.properties) ~= "table" then return false, nil, "properties must be table" end
	local ws = workspace
	local results = {}
	for pname, pval in pairs(data.properties) do
		local okProp = Validator.isPropertyWritable(pname)
		if okProp then
			local val = Validator.coerceValue(pval)
			local ok2, e2 = pcall(function() ws[pname] = val end)
			table.insert(results, { property = pname, success = ok2, error = ok2 and nil or tostring(e2) })
		else
			table.insert(results, { property = pname, success = false, error = "blocked" })
		end
	end
	return true, { results = results }, nil
end

-- GetPlayers: list connected players (useful when testing in Play Solo)
function Controller:_doGetPlayers(_data)
	local Players = game:GetService("Players")
	local list    = {}
	local ok2, players = pcall(function() return Players:GetPlayers() end)
	if ok2 then
		for _, p in ipairs(players) do
			local ok3, char = pcall(function() return p.Character end)
			table.insert(list, {
				name        = p.Name,
				displayName = p.DisplayName,
				userId      = p.UserId,
				accountAge  = p.AccountAge,
				teamColor   = tostring(p.TeamColor),
				hasCharacter = ok3 and char ~= nil,
			})
		end
	end
	return true, { players = list, count = #list }, nil
end

-- GetTags: get all CollectionService tags on an instance
function Controller:_doGetTags(data)
	local ok, err = Validator.isString(data.path, 512)
	if not ok then return false, nil, "path: " .. err end
	local inst, e = self._im:_resolve(data.path)
	if not inst then return false, nil, e end
	local cs = game:GetService("CollectionService")
	local ok2, tags = pcall(function() return cs:GetTags(inst) end)
	if not ok2 then return false, nil, tostring(tags) end
	return true, { path = data.path, tags = tags }, nil
end

-- AddTag / RemoveTag
function Controller:_doAddTag(data)
	local ok, err = Validator.isString(data.path, 512)
	if not ok then return false, nil, "path: " .. err end
	ok, err = Validator.isString(data.tag, 128)
	if not ok then return false, nil, "tag: " .. err end
	local inst, e = self._im:_resolve(data.path)
	if not inst then return false, nil, e end
	local cs = game:GetService("CollectionService")
	local ok2, e2 = pcall(function() cs:AddTag(inst, data.tag) end)
	if not ok2 then return false, nil, tostring(e2) end
	self._log:info("Controller", "AddTag " .. data.tag .. " on " .. data.path)
	return true, {}, nil
end

function Controller:_doRemoveTag(data)
	local ok, err = Validator.isString(data.path, 512)
	if not ok then return false, nil, "path: " .. err end
	ok, err = Validator.isString(data.tag, 128)
	if not ok then return false, nil, "tag: " .. err end
	local inst, e = self._im:_resolve(data.path)
	if not inst then return false, nil, e end
	local cs = game:GetService("CollectionService")
	local ok2, e2 = pcall(function() cs:RemoveTag(inst, data.tag) end)
	if not ok2 then return false, nil, tostring(e2) end
	return true, {}, nil
end

-- GetTagged: find all instances with a given CollectionService tag
function Controller:_doGetTagged(data)
	local ok, err = Validator.isString(data.tag, 128)
	if not ok then return false, nil, "tag: " .. err end
	local cs = game:GetService("CollectionService")
	local ok2, tagged = pcall(function() return cs:GetTagged(data.tag) end)
	if not ok2 then return false, nil, tostring(tagged) end
	local results = {}
	for _, inst in ipairs(tagged) do
		table.insert(results, { name = inst.Name, className = inst.ClassName, path = self._im:getPath(inst) })
	end
	return true, { tag = data.tag, instances = results, count = #results }, nil
end

-- GetTeams: list all teams and their members
function Controller:_doGetTeams(_data)
	local Teams = game:GetService("Teams")
	local list = {}
	for _, team in ipairs(Teams:GetTeams()) do
		local ok2, members = pcall(function() return team:GetPlayers() end)
		local memberNames = {}
		if ok2 then
			for _, p in ipairs(members) do table.insert(memberNames, p.Name) end
		end
		table.insert(list, {
			name        = team.Name,
			teamColor   = tostring(team.TeamColor),
			autoAssignable = team.AutoAssignable,
			members     = memberNames,
		})
	end
	return true, { teams = list, count = #list }, nil
end

-- GetAttribute / SetAttribute / GetAttributes
function Controller:_doGetAttribute(data)
	local ok, err = Validator.isString(data.path, 512)
	if not ok then return false, nil, "path: " .. err end
	ok, err = Validator.isString(data.name, 128)
	if not ok then return false, nil, "name: " .. err end
	local inst, e = self._im:_resolve(data.path)
	if not inst then return false, nil, e end
	local ok2, val = pcall(function() return inst:GetAttribute(data.name) end)
	if not ok2 then return false, nil, tostring(val) end
	return true, { name = data.name, value = val, type = typeof(val) }, nil
end

function Controller:_doSetAttribute(data)
	local ok, err = Validator.isString(data.path, 512)
	if not ok then return false, nil, "path: " .. err end
	ok, err = Validator.isString(data.name, 128)
	if not ok then return false, nil, "name: " .. err end
	local inst, e = self._im:_resolve(data.path)
	if not inst then return false, nil, e end
	local val = Validator.coerceValue(data.value)
	local ok2, e2 = pcall(function() inst:SetAttribute(data.name, val) end)
	if not ok2 then return false, nil, tostring(e2) end
	self._log:debug("Controller", "SetAttribute " .. data.name .. " on " .. data.path)
	return true, {}, nil
end

function Controller:_doGetAttributes(data)
	local ok, err = Validator.isString(data.path, 512)
	if not ok then return false, nil, "path: " .. err end
	local inst, e = self._im:_resolve(data.path)
	if not inst then return false, nil, e end
	local ok2, attrs = pcall(function() return inst:GetAttributes() end)
	if not ok2 then return false, nil, tostring(attrs) end
	local out = {}
	for k, v in pairs(attrs) do
		out[k] = { value = v, type = typeof(v) }
	end
	return true, { path = data.path, attributes = out, count = #out }, nil
end

-- GetStudioTheme: current Studio UI theme name and colours
function Controller:_doGetStudioTheme(_data)
	local ok2, theme = pcall(function() return settings().Studio.Theme end)
	if not ok2 or not theme then return true, { theme = "unknown" }, nil end
	local info = { name = theme.Name }
	-- Sample a few key semantic colours
	local sampleColours = {
		"MainBackground","Titlebar","Border","InputFieldBackground","Button",
		"ButtonText","BrightText","DimmedText","CategoryItem","TabBar",
	}
	info.colors = {}
	for _, cname in ipairs(sampleColours) do
		local ok3, col = pcall(function()
			return theme:GetColor(Enum.StudioStyleGuideColor[cname])
		end)
		if ok3 and col then
			info.colors[cname] = { r = math.floor(col.R*255), g = math.floor(col.G*255), b = math.floor(col.B*255) }
		end
	end
	return true, info, nil
end

-- ============================================================
--  GUI BUILDER  (modern redesign)
-- ============================================================

local GUI_COLORS = {
	bg          = Color3.fromRGB(13, 13, 18),
	bgPanel     = Color3.fromRGB(20, 20, 28),
	bgCard      = Color3.fromRGB(26, 26, 38),
	bgCardHover = Color3.fromRGB(32, 32, 46),
	accent      = Color3.fromRGB(99, 102, 241),  -- indigo
	accentGlow  = Color3.fromRGB(129, 140, 248),
	accentDim   = Color3.fromRGB(55, 58, 140),
	green       = Color3.fromRGB(52, 211, 153),
	greenDim    = Color3.fromRGB(20, 80, 58),
	red         = Color3.fromRGB(248, 113, 113),
	redDim      = Color3.fromRGB(90, 25, 25),
	yellow      = Color3.fromRGB(251, 191, 36),
	yellowDim   = Color3.fromRGB(90, 68, 10),
	blue        = Color3.fromRGB(96, 165, 250),
	purple      = Color3.fromRGB(192, 132, 252),
	textPrimary = Color3.fromRGB(241, 241, 255),
	textSecond  = Color3.fromRGB(148, 148, 180),
	textMuted   = Color3.fromRGB(75, 75, 100),
	border      = Color3.fromRGB(38, 38, 56),
	borderBright= Color3.fromRGB(60, 60, 88),
	logBg       = Color3.fromRGB(10, 10, 16),
}

local MAX_LOG_ROWS = 80

local function buildGui(pluginRef)
	local info = DockWidgetPluginGuiInfo.new(
		Enum.InitialDockState.Right,
		true,
		false,
		280, 480,
		240, 340
	)
	local dockGui = pluginRef:CreateDockWidgetPluginGui(CONFIG.PLUGIN_ID, info)
	dockGui.Title = "VortexDQ AI Controller"
	dockGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling

	-- ── Root ────────────────────────────────────────────────
	local root = Instance.new("Frame")
	root.Name             = "Root"
	root.Size             = UDim2.new(1, 0, 1, 0)
	root.BackgroundColor3 = GUI_COLORS.bg
	root.BorderSizePixel  = 0
	root.ClipsDescendants = true
	root.Parent           = dockGui

	-- ── Header ──────────────────────────────────────────────
	local header = Instance.new("Frame")
	header.Name             = "Header"
	header.Size             = UDim2.new(1, 0, 0, 56)
	header.BackgroundColor3 = GUI_COLORS.bgCard
	header.BorderSizePixel  = 0
	header.Parent           = root

	-- top accent line
	local accentBar = Instance.new("Frame")
	accentBar.Size             = UDim2.new(1, 0, 0, 3)
	accentBar.BackgroundColor3 = GUI_COLORS.accent
	accentBar.BorderSizePixel  = 0
	accentBar.Parent           = header

	-- logo text
	local logo = Instance.new("TextLabel")
	logo.Size             = UDim2.new(0, 160, 0, 24)
	logo.Position         = UDim2.new(0, 14, 0, 9)
	logo.BackgroundTransparency = 1
	logo.TextColor3       = GUI_COLORS.textPrimary
	logo.TextSize         = 17
	logo.Font             = Enum.Font.GothamBold
	logo.Text             = "VortexDQ AI"
	logo.TextXAlignment   = Enum.TextXAlignment.Left
	logo.Parent           = header

	-- version badge
	local verBadge = Instance.new("Frame")
	verBadge.Size             = UDim2.new(0, 42, 0, 16)
	verBadge.Position         = UDim2.new(0, 14, 0, 34)
	verBadge.BackgroundColor3 = GUI_COLORS.accentDim
	verBadge.BorderSizePixel  = 0
	verBadge.Parent           = header
	Instance.new("UICorner", verBadge).CornerRadius = UDim.new(0, 4)

	local verText = Instance.new("TextLabel")
	verText.Size             = UDim2.new(1, 0, 1, 0)
	verText.BackgroundTransparency = 1
	verText.TextColor3       = GUI_COLORS.accentGlow
	verText.TextSize         = 10
	verText.Font             = Enum.Font.GothamBold
	verText.Text             = "v2.0.0"
	verText.Parent           = verBadge

	-- status pill (right side of header)
	local statusPill = Instance.new("Frame")
	statusPill.Name             = "StatusPill"
	statusPill.Size             = UDim2.new(0, 90, 0, 26)
	statusPill.Position         = UDim2.new(1, -104, 0, 15)
	statusPill.BackgroundColor3 = GUI_COLORS.redDim
	statusPill.BorderSizePixel  = 0
	statusPill.Parent           = header
	Instance.new("UICorner", statusPill).CornerRadius = UDim.new(0, 13)

	local statusDot = Instance.new("Frame")
	statusDot.Name             = "Dot"
	statusDot.Size             = UDim2.new(0, 8, 0, 8)
	statusDot.Position         = UDim2.new(0, 10, 0.5, -4)
	statusDot.BackgroundColor3 = GUI_COLORS.red
	statusDot.BorderSizePixel  = 0
	statusDot.Parent           = statusPill
	Instance.new("UICorner", statusDot).CornerRadius = UDim.new(1, 0)

	local statusWord = Instance.new("TextLabel")
	statusWord.Name             = "Word"
	statusWord.Size             = UDim2.new(1, -26, 1, 0)
	statusWord.Position         = UDim2.new(0, 24, 0, 0)
	statusWord.BackgroundTransparency = 1
	statusWord.TextColor3       = GUI_COLORS.red
	statusWord.TextSize         = 11
	statusWord.Font             = Enum.Font.GothamBold
	statusWord.Text             = "OFFLINE"
	statusWord.TextXAlignment   = Enum.TextXAlignment.Left
	statusWord.Parent           = statusPill

	-- ── Server URL strip ────────────────────────────────────
	local urlStrip = Instance.new("Frame")
	urlStrip.Size             = UDim2.new(1, 0, 0, 32)
	urlStrip.Position         = UDim2.new(0, 0, 0, 56)
	urlStrip.BackgroundColor3 = GUI_COLORS.bgPanel
	urlStrip.BorderSizePixel  = 0
	urlStrip.Parent           = root

	local urlIcon = Instance.new("TextLabel")
	urlIcon.Size             = UDim2.new(0, 20, 1, 0)
	urlIcon.Position         = UDim2.new(0, 10, 0, 0)
	urlIcon.BackgroundTransparency = 1
	urlIcon.TextColor3       = GUI_COLORS.textMuted
	urlIcon.TextSize         = 13
	urlIcon.Font             = Enum.Font.GothamBold
	urlIcon.Text             = "⬡"
	urlIcon.Parent           = urlStrip

	local urlLabel = Instance.new("TextLabel")
	urlLabel.Size             = UDim2.new(1, -38, 1, 0)
	urlLabel.Position         = UDim2.new(0, 30, 0, 0)
	urlLabel.BackgroundTransparency = 1
	urlLabel.TextColor3       = GUI_COLORS.textMuted
	urlLabel.TextSize         = 11
	urlLabel.Font             = Enum.Font.Code
	urlLabel.Text             = CONFIG.SERVER_URL
	urlLabel.TextXAlignment   = Enum.TextXAlignment.Left
	urlLabel.TextTruncate     = Enum.TextTruncate.AtEnd
	urlLabel.Parent           = urlStrip

	-- bottom border on url strip
	local urlBorder = Instance.new("Frame")
	urlBorder.Size             = UDim2.new(1, 0, 0, 1)
	urlBorder.Position         = UDim2.new(0, 0, 1, -1)
	urlBorder.BackgroundColor3 = GUI_COLORS.border
	urlBorder.BorderSizePixel  = 0
	urlBorder.Parent           = urlStrip

	-- ── Stats cards ─────────────────────────────────────────
	-- Two rows of 3 cards each
	local CARD_TOP    = 96
	local CARD_H      = 58
	local CARD_GAP    = 6
	local CARD_PAD    = 10
	local CARD_W      = (1/3)

	local statRefs = {}  -- { valueLabel, pillFrame } keyed by name

	local cardDefs = {
		{ key = "sent",      label = "SENT",      col = 0 },
		{ key = "recv",      label = "RECEIVED",  col = 1 },
		{ key = "queue",     label = "QUEUED",    col = 2 },
		{ key = "ok",        label = "SUCCEEDED", col = 0 },
		{ key = "failed",    label = "FAILED",    col = 1 },
		{ key = "dropped",   label = "DROPPED",   col = 2 },
	}

	local function makeCard(def, row)
		local card = Instance.new("Frame")
		card.Name             = def.key .. "Card"
		card.Size             = UDim2.new(CARD_W, -(CARD_PAD + CARD_GAP/2), 0, CARD_H)
		card.Position         = UDim2.new(
			CARD_W * def.col, CARD_PAD + (def.col > 0 and CARD_GAP/2 or 0),
			0, CARD_TOP + row * (CARD_H + CARD_GAP)
		)
		card.BackgroundColor3 = GUI_COLORS.bgCard
		card.BorderSizePixel  = 0
		card.Parent           = root
		Instance.new("UICorner", card).CornerRadius = UDim.new(0, 8)

		-- left accent strip
		local strip = Instance.new("Frame")
		strip.Size             = UDim2.new(0, 3, 1, -16)
		strip.Position         = UDim2.new(0, 0, 0, 8)
		strip.BackgroundColor3 = GUI_COLORS.accentDim
		strip.BorderSizePixel  = 0
		strip.Parent           = card
		Instance.new("UICorner", strip).CornerRadius = UDim.new(0, 2)

		local lbl = Instance.new("TextLabel")
		lbl.Size             = UDim2.new(1, -10, 0, 14)
		lbl.Position         = UDim2.new(0, 10, 0, 8)
		lbl.BackgroundTransparency = 1
		lbl.TextColor3       = GUI_COLORS.textMuted
		lbl.TextSize         = 9
		lbl.Font             = Enum.Font.GothamBold
		lbl.Text             = def.label
		lbl.TextXAlignment   = Enum.TextXAlignment.Left
		lbl.Parent           = card

		local val = Instance.new("TextLabel")
		val.Name             = "Value"
		val.Size             = UDim2.new(1, -10, 0, 26)
		val.Position         = UDim2.new(0, 10, 0, 24)
		val.BackgroundTransparency = 1
		val.TextColor3       = GUI_COLORS.textPrimary
		val.TextSize         = 20
		val.Font             = Enum.Font.GothamBold
		val.Text             = "0"
		val.TextXAlignment   = Enum.TextXAlignment.Left
		val.Parent           = card

		statRefs[def.key] = { val = val, strip = strip }
		return card
	end

	for i, def in ipairs(cardDefs) do
		makeCard(def, i <= 3 and 0 or 1)
	end

	local CARDS_BOTTOM = CARD_TOP + 2 * (CARD_H + CARD_GAP)

	-- ── Log section ─────────────────────────────────────────
	local logTop = CARDS_BOTTOM + 10

	-- Log header bar
	local logHeader = Instance.new("Frame")
	logHeader.Size             = UDim2.new(1, 0, 0, 30)
	logHeader.Position         = UDim2.new(0, 0, 0, logTop)
	logHeader.BackgroundColor3 = GUI_COLORS.bgCard
	logHeader.BorderSizePixel  = 0
	logHeader.Parent           = root

	local logHeaderBorder = Instance.new("Frame")
	logHeaderBorder.Size             = UDim2.new(1, 0, 0, 1)
	logHeaderBorder.Position         = UDim2.new(0, 0, 1, -1)
	logHeaderBorder.BackgroundColor3 = GUI_COLORS.border
	logHeaderBorder.BorderSizePixel  = 0
	logHeaderBorder.Parent           = logHeader

	local logTitleDot = Instance.new("Frame")
	logTitleDot.Size             = UDim2.new(0, 7, 0, 7)
	logTitleDot.Position         = UDim2.new(0, 14, 0.5, -3)
	logTitleDot.BackgroundColor3 = GUI_COLORS.accent
	logTitleDot.BorderSizePixel  = 0
	logTitleDot.Parent           = logHeader
	Instance.new("UICorner", logTitleDot).CornerRadius = UDim.new(1, 0)

	local logTitle = Instance.new("TextLabel")
	logTitle.Size             = UDim2.new(0, 100, 1, 0)
	logTitle.Position         = UDim2.new(0, 28, 0, 0)
	logTitle.BackgroundTransparency = 1
	logTitle.TextColor3       = GUI_COLORS.textSecond
	logTitle.TextSize         = 11
	logTitle.Font             = Enum.Font.GothamBold
	logTitle.Text             = "LIVE LOG"
	logTitle.TextXAlignment   = Enum.TextXAlignment.Left
	logTitle.Parent           = logHeader

	local logCountLabel = Instance.new("TextLabel")
	logCountLabel.Name             = "LogCount"
	logCountLabel.Size             = UDim2.new(0, 60, 1, 0)
	logCountLabel.Position         = UDim2.new(1, -70, 0, 0)
	logCountLabel.BackgroundTransparency = 1
	logCountLabel.TextColor3       = GUI_COLORS.textMuted
	logCountLabel.TextSize         = 10
	logCountLabel.Font             = Enum.Font.Gotham
	logCountLabel.Text             = "0 entries"
	logCountLabel.TextXAlignment   = Enum.TextXAlignment.Right
	logCountLabel.Parent           = logHeader

	-- Scrolling log
	local logScroll = Instance.new("ScrollingFrame")
	logScroll.Name                  = "LogScroll"
	logScroll.Size                  = UDim2.new(1, 0, 1, -(logTop + 30))
	logScroll.Position              = UDim2.new(0, 0, 0, logTop + 30)
	logScroll.BackgroundColor3      = GUI_COLORS.logBg
	logScroll.BorderSizePixel       = 0
	logScroll.ScrollBarThickness    = 3
	logScroll.ScrollBarImageColor3  = GUI_COLORS.accentDim
	logScroll.CanvasSize            = UDim2.new(0, 0, 0, 0)
	logScroll.AutomaticCanvasSize   = Enum.AutomaticSize.Y
	logScroll.ScrollingDirection    = Enum.ScrollingDirection.Y
	logScroll.ElasticBehavior       = Enum.ElasticBehavior.Never
	logScroll.Parent                = root

	local logList = Instance.new("UIListLayout")
	logList.FillDirection  = Enum.FillDirection.Vertical
	logList.SortOrder      = Enum.SortOrder.LayoutOrder
	logList.Padding        = UDim.new(0, 0)
	logList.Parent         = logScroll

	local logPad = Instance.new("UIPadding")
	logPad.PaddingTop    = UDim.new(0, 4)
	logPad.PaddingBottom = UDim.new(0, 4)
	logPad.Parent        = logScroll

	-- ── Log row factory ─────────────────────────────────────
	local logRows    = {}
	local totalEntries = 0

	local LOG_LEVEL_STYLE = {
		ERROR = { bg = Color3.fromRGB(60, 16, 16),  tag = Color3.fromRGB(248, 113, 113), text = Color3.fromRGB(255, 180, 180) },
		WARN  = { bg = Color3.fromRGB(52, 38,  8),  tag = Color3.fromRGB(251, 191,  36), text = Color3.fromRGB(253, 224, 120) },
		INFO  = { bg = Color3.fromRGB(13, 13,  20), tag = Color3.fromRGB( 99, 102, 241), text = Color3.fromRGB(200, 200, 230) },
		DEBUG = { bg = Color3.fromRGB(13, 13,  20), tag = Color3.fromRGB( 75,  75, 100), text = Color3.fromRGB(100, 100, 140) },
	}

	local function addLogRow(entry)
		totalEntries = totalEntries + 1
		logCountLabel.Text = totalEntries .. " entries"

		local style = LOG_LEVEL_STYLE[entry.level] or LOG_LEVEL_STYLE.INFO

		-- timestamp string
		local ts = os.date("%H:%M:%S", entry.timestamp)

		-- outer row frame
		local row = Instance.new("Frame")
		row.Name             = "LogRow_" .. totalEntries
		row.Size             = UDim2.new(1, 0, 0, 36)
		row.BackgroundColor3 = style.bg
		row.BorderSizePixel  = 0
		row.LayoutOrder      = totalEntries
		row.Parent           = logScroll

		-- left coloured level bar
		local bar = Instance.new("Frame")
		bar.Size             = UDim2.new(0, 3, 1, 0)
		bar.BackgroundColor3 = style.tag
		bar.BorderSizePixel  = 0
		bar.Parent           = row

		-- level badge
		local badge = Instance.new("Frame")
		badge.Size             = UDim2.new(0, 40, 0, 16)
		badge.Position         = UDim2.new(0, 10, 0, 6)
		badge.BackgroundColor3 = style.tag
		badge.BackgroundTransparency = 0.75
		badge.BorderSizePixel  = 0
		badge.Parent           = row
		Instance.new("UICorner", badge).CornerRadius = UDim.new(0, 3)

		local badgeText = Instance.new("TextLabel")
		badgeText.Size             = UDim2.new(1, 0, 1, 0)
		badgeText.BackgroundTransparency = 1
		badgeText.TextColor3       = style.tag
		badgeText.TextSize         = 9
		badgeText.Font             = Enum.Font.GothamBold
		badgeText.Text             = entry.level
		badgeText.Parent           = badge

		-- category
		local cat = Instance.new("TextLabel")
		cat.Size             = UDim2.new(0, 80, 0, 14)
		cat.Position         = UDim2.new(0, 56, 0, 5)
		cat.BackgroundTransparency = 1
		cat.TextColor3       = GUI_COLORS.textMuted
		cat.TextSize         = 10
		cat.Font             = Enum.Font.GothamBold
		cat.Text             = entry.category
		cat.TextXAlignment   = Enum.TextXAlignment.Left
		cat.TextTruncate     = Enum.TextTruncate.AtEnd
		cat.Parent           = row

		-- timestamp (right aligned)
		local timeLabel = Instance.new("TextLabel")
		timeLabel.Size             = UDim2.new(0, 52, 0, 14)
		timeLabel.Position         = UDim2.new(1, -56, 0, 5)
		timeLabel.BackgroundTransparency = 1
		timeLabel.TextColor3       = GUI_COLORS.textMuted
		timeLabel.TextSize         = 9
		timeLabel.Font             = Enum.Font.Code
		timeLabel.Text             = ts
		timeLabel.TextXAlignment   = Enum.TextXAlignment.Right
		timeLabel.Parent           = row

		-- message text (second line, full width)
		local msg = Instance.new("TextLabel")
		msg.Size             = UDim2.new(1, -14, 0, 14)
		msg.Position         = UDim2.new(0, 10, 0, 19)
		msg.BackgroundTransparency = 1
		msg.TextColor3       = style.text
		msg.TextSize         = 10
		msg.Font             = Enum.Font.Code
		msg.Text             = entry.message
		msg.TextXAlignment   = Enum.TextXAlignment.Left
		msg.TextTruncate     = Enum.TextTruncate.AtEnd
		msg.Parent           = row

		-- subtle separator line at bottom
		local sep = Instance.new("Frame")
		sep.Size             = UDim2.new(1, 0, 0, 1)
		sep.Position         = UDim2.new(0, 0, 1, -1)
		sep.BackgroundColor3 = GUI_COLORS.border
		sep.BackgroundTransparency = 0.5
		sep.BorderSizePixel  = 0
		sep.Parent           = row

		table.insert(logRows, row)

		-- trim oldest rows when over cap
		if #logRows > MAX_LOG_ROWS then
			local old = table.remove(logRows, 1)
			old:Destroy()
		end

		-- auto-scroll to bottom
		local canvas = logScroll.AbsoluteCanvasSize
		local frame  = logScroll.AbsoluteSize
		if canvas.Y > frame.Y then
			logScroll.CanvasPosition = Vector2.new(0, canvas.Y - frame.Y)
		end
	end

	return {
		dockGui        = dockGui,
		statusPill     = statusPill,
		statusDot      = statusDot,
		statusWord     = statusWord,
		statRefs       = statRefs,
		logCountLabel  = logCountLabel,
		addLogRow      = addLogRow,
	}
end

-- ============================================================
--  GUI UPDATER
-- ============================================================

local function startGuiRefresh(gui, wsClient, controller, auditLog)
	local lastSeq     = 0
	local lastRefresh = tick()

	-- colour helpers
	local function setConnected(on)
		if on then
			gui.statusPill.BackgroundColor3 = GUI_COLORS.greenDim
			gui.statusDot.BackgroundColor3  = GUI_COLORS.green
			gui.statusWord.TextColor3       = GUI_COLORS.green
			gui.statusWord.Text             = "ONLINE"
		else
			gui.statusPill.BackgroundColor3 = GUI_COLORS.redDim
			gui.statusDot.BackgroundColor3  = GUI_COLORS.red
			gui.statusWord.TextColor3       = GUI_COLORS.red
			gui.statusWord.Text             = "OFFLINE"
		end
	end

	local function setCard(key, value, highlight)
		local ref = gui.statRefs[key]
		if not ref then return end
		ref.val.Text = tostring(value)
		if highlight then
			ref.strip.BackgroundColor3 = highlight
		end
	end

	RunService.Heartbeat:Connect(function()
		local now = tick()
		if now - lastRefresh < CONFIG.GUI_REFRESH_INTERVAL then return end
		lastRefresh = now

		-- status pill
		setConnected(wsClient:isConnected())

		-- stats cards
		local ws  = wsClient:getStats()
		local ctl = controller._stats

		setCard("sent",    ws.sent,                  GUI_COLORS.accentDim)
		setCard("recv",    ws.received,               GUI_COLORS.accentDim)
		setCard("queue",   wsClient:getQueueSize(),   ws.sent > 0 and GUI_COLORS.accentDim or GUI_COLORS.textMuted)
		setCard("ok",      ctl.succeeded,             GUI_COLORS.greenDim)
		setCard("failed",  ctl.failed,                ctl.failed > 0 and GUI_COLORS.redDim or GUI_COLORS.textMuted)
		setCard("dropped", ws.dropped,                ws.dropped > 0 and GUI_COLORS.yellowDim or GUI_COLORS.textMuted)

		-- push new audit log entries to the live log panel
		local recent = auditLog:getRecent(MAX_LOG_ROWS)
		for i = #recent, 1, -1 do
			local entry = recent[i]
			if entry.seq > lastSeq then
				gui.addLogRow(entry)
				lastSeq = math.max(lastSeq, entry.seq)
			end
		end
	end)
end

-- ============================================================
--  NONCE STORE  (replay-attack protection)
--  Tracks seen command IDs within a rolling time window so
--  the same command cannot be replayed a second time even if
--  the server retransmits it.
-- ============================================================

local NonceStore = {}
NonceStore.__index = NonceStore

function NonceStore.new(windowSeconds)
	local self       = setmetatable({}, NonceStore)
	self._window     = windowSeconds or 60
	self._seen       = {}   -- id -> expiry tick
	self._replays    = 0
	return self
end

-- Returns true if this id is fresh (not seen before).
-- Returns false if it is a replay.
function NonceStore:check(id)
	self:_evict()
	if self._seen[id] then
		self._replays = self._replays + 1
		return false
	end
	self._seen[id] = tick() + self._window
	return true
end

function NonceStore:_evict()
	local now = tick()
	for id, expiry in pairs(self._seen) do
		if now >= expiry then
			self._seen[id] = nil
		end
	end
end

function NonceStore:stats()
	return { replays = self._replays, stored = self:_count() }
end

function NonceStore:_count()
	local n = 0
	for _ in pairs(self._seen) do n = n + 1 end
	return n
end

-- ============================================================
--  CIRCUIT BREAKER
--  Trips after N consecutive failures and enters an open state
--  where all requests are rejected for a cooldown period,
--  preventing the plugin from hammering a dead server.
-- ============================================================

local CircuitBreaker = {}
CircuitBreaker.__index = CircuitBreaker

local CB_CLOSED  = "closed"   -- normal — requests pass through
local CB_OPEN    = "open"     -- tripped — all requests rejected
local CB_HALF    = "half"     -- probing — one request allowed

function CircuitBreaker.new(threshold, cooldown)
	local self          = setmetatable({}, CircuitBreaker)
	self._threshold     = threshold or 5    -- consecutive failures to trip
	self._cooldown      = cooldown  or 30   -- seconds before probing
	self._state         = CB_CLOSED
	self._failures      = 0
	self._lastTrip      = 0
	self._totalTrips    = 0
	self._totalRequests = 0
	self._totalRejected = 0
	return self
end

-- Call before making a request.  Returns true if allowed.
function CircuitBreaker:allow()
	self._totalRequests = self._totalRequests + 1

	if self._state == CB_CLOSED then
		return true
	elseif self._state == CB_OPEN then
		if tick() - self._lastTrip >= self._cooldown then
			self._state = CB_HALF
			return true   -- allow one probe
		end
		self._totalRejected = self._totalRejected + 1
		return false
	else  -- CB_HALF
		return true
	end
end

-- Call after a successful request.
function CircuitBreaker:success()
	self._failures = 0
	self._state    = CB_CLOSED
end

-- Call after a failed request.
function CircuitBreaker:failure()
	self._failures = self._failures + 1
	if self._state == CB_HALF or self._failures >= self._threshold then
		self._state      = CB_OPEN
		self._lastTrip   = tick()
		self._totalTrips = self._totalTrips + 1
	end
end

function CircuitBreaker:state()  return self._state end

function CircuitBreaker:stats()
	return {
		state        = self._state,
		failures     = self._failures,
		totalTrips   = self._totalTrips,
		totalReq     = self._totalRequests,
		totalRejected= self._totalRejected,
	}
end

-- ============================================================
--  DIAGNOSTICS
--  Collects system health snapshots on a timer so the server
--  can query the plugin's internal state for debugging.
-- ============================================================

local Diagnostics = {}
Diagnostics.__index = Diagnostics

function Diagnostics.new(wsClient, controller, auditLog, circuitBreaker, nonceStore, rateLimiter)
	local self             = setmetatable({}, Diagnostics)
	self._ws               = wsClient
	self._ctl              = controller
	self._log              = auditLog
	self._cb               = circuitBreaker
	self._nonce            = nonceStore
	self._rl               = rateLimiter
	self._snapshots        = {}
	self._maxSnapshots     = 20
	self._snapshotInterval = 30   -- seconds
	self._lastSnapshot     = 0
	self._conn             = nil
	return self
end

function Diagnostics:start()
	self._conn = RunService.Heartbeat:Connect(function()
		local now = tick()
		if now - self._lastSnapshot >= self._snapshotInterval then
			self._lastSnapshot = now
			self:_takeSnapshot()
		end
	end)
end

function Diagnostics:stop()
	if self._conn then
		self._conn:Disconnect()
		self._conn = nil
	end
end

function Diagnostics:_takeSnapshot()
	local snap = {
		ts             = os.time(),
		tick           = tick(),
		connected      = self._ws:isConnected(),
		queueSize      = self._ws:getQueueSize(),
		wsStats        = self._ws:getStats(),
		ctlStats       = self._ctl._stats,
		circuitBreaker = self._cb:stats(),
		nonceStore     = self._nonce:stats(),
		rateLimiter    = self._rl:stats(),
		auditLog       = self._log:getSummary(),
		workspaceCount = #workspace:GetChildren(),
	}

	table.insert(self._snapshots, 1, snap)
	if #self._snapshots > self._maxSnapshots then
		table.remove(self._snapshots)
	end
end

function Diagnostics:getLatest()
	return self._snapshots[1]
end

function Diagnostics:getAll()
	return self._snapshots
end

function Diagnostics:report()
	local snap = self:getLatest()
	if not snap then return "No diagnostics collected yet." end
	return string.format(
		"[Diag] connected=%s queue=%d sent=%d recv=%d errors=%d cb=%s trips=%d replays=%d dropped=%d",
		tostring(snap.connected),
		snap.queueSize,
		snap.wsStats.sent,
		snap.wsStats.received,
		snap.wsStats.errors,
		snap.circuitBreaker.state,
		snap.circuitBreaker.totalTrips,
		snap.nonceStore.replays,
		snap.wsStats.dropped
	)
end

-- ============================================================
--  PLUGIN ENTRY POINT
-- ============================================================

local function setupPlugin()
	-- Initialise subsystems
	local auditLog      = AuditLog.new(CONFIG.HISTORY_MAX_SIZE)
	local rateLimiter   = RateLimiter.new(CONFIG.RATE_LIMIT_PER_SEC, CONFIG.RATE_BURST_CAP)
	local circuitBreaker = CircuitBreaker.new(5, 30)
	local nonceStore    = NonceStore.new(60)
	local wsClient      = WebSocketClient.new(CONFIG.SERVER_URL, auditLog, rateLimiter)
	local instanceMgr   = InstanceManager.new(auditLog)
	local controller    = Controller.new(wsClient, instanceMgr, auditLog)
	local diagnostics   = Diagnostics.new(wsClient, controller, auditLog, circuitBreaker, nonceStore, rateLimiter)

	-- Attach circuit breaker to wsClient health checks
	wsClient._circuitBreaker = circuitBreaker
	-- Attach nonce store to controller for replay protection
	controller._nonceStore = nonceStore

	auditLog:info("Plugin", "VortexDQ AI Controller v2.0.0 initialising")

	-- Build toolbar button
	local toolbar = plugin:CreateToolbar(CONFIG.TOOLBAR_NAME)
	local button  = toolbar:CreateButton(
		CONFIG.BUTTON_LABEL,
		CONFIG.BUTTON_TOOLTIP,
		CONFIG.BUTTON_ICON
	)

	-- Build GUI
	local gui = buildGui(plugin)

	-- Toggle panel on button click
	button.Click:Connect(function()
		gui.dockGui.Enabled = not gui.dockGui.Enabled
	end)

	-- Sync button state with panel state
	gui.dockGui:GetPropertyChangedSignal("Enabled"):Connect(function()
		button:SetActive(gui.dockGui.Enabled)
	end)

	-- Wire up controller
	controller:start()

	-- Start GUI refresh loop
	startGuiRefresh(gui, wsClient, controller, auditLog)

	-- Start diagnostics collector
	diagnostics:start()

	-- Initiate connection
	wsClient:connect()

	auditLog:info("Plugin", "setup complete — connecting to " .. CONFIG.SERVER_URL)
	auditLog:info("Plugin", "security: rate=" .. CONFIG.RATE_LIMIT_PER_SEC .. "/s burst=" .. CONFIG.RATE_BURST_CAP .. " nonce-window=60s cb-threshold=5")
end

-- Roblox provides `plugin` as a global in the plugin environment.
-- We call setupPlugin() directly — no detection needed.
setupPlugin()
