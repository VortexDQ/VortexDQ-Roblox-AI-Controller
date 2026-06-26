local WebSocketClient = require(script:WaitForChild("WebSocketClient"))
local Controller = require(script:WaitForChild("Controller"))

local WEBSOCKET_URL = "http://127.0.0.1:7777"
local CONNECTION_TIMEOUT = 10

local plugin = nil
local pluginGui = nil
local wsClient = nil
local controller = nil
local connectionStatus = "disconnected"

local function createPluginGui()
	if pluginGui then
		pluginGui:Destroy()
	end

	pluginGui = Instance.new("DockWidgetPluginGui")
	pluginGui.Name = "VortexDQ AI Controller"
	pluginGui.Title = "AI Controller - Status"
	pluginGui.InitialDockState = Enum.InitialDockState.Right
	pluginGui.FloatingSize = UDim2.new(0, 300, 0, 200)
	pluginGui.InitialEnabled = true

	local statusLabel = Instance.new("TextLabel")
	statusLabel.Parent = pluginGui
	statusLabel.BackgroundColor3 = Color3.fromRGB(30, 30, 30)
	statusLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
	statusLabel.TextSize = 14
	statusLabel.TextScaled = false
	statusLabel.Size = UDim2.new(1, 0, 1, 0)
	statusLabel.Text = "Initializing...\n\nConnecting to:\n" .. WEBSOCKET_URL

	return pluginGui, statusLabel
end

local function updateGuiStatus(statusLabel, status, details)
	local statusText = status
	local statusColor = Color3.fromRGB(100, 100, 100)

	if status == "connected" then
		statusColor = Color3.fromRGB(0, 200, 0)
		statusText = "✓ CONNECTED"
	elseif status == "connecting" then
		statusColor = Color3.fromRGB(200, 200, 0)
		statusText = "⟳ CONNECTING"
	elseif status == "failed" then
		statusColor = Color3.fromRGB(200, 0, 0)
		statusText = "✗ FAILED"
	end

	if statusLabel then
		statusLabel.BackgroundColor3 = Color3.new(statusColor.R * 0.3, statusColor.G * 0.3, statusColor.B * 0.3)
		statusLabel.Text = statusText .. "\n\n" .. (details or "")
	end

	connectionStatus = status
end

local function initializeWebSocket()
	print("[Plugin] Initializing WebSocket client")

	wsClient = WebSocketClient.new(WEBSOCKET_URL)

	wsClient:on("connect", function()
		print("[Plugin] WebSocket connected!")
		updateGuiStatus(pluginGui:FindFirstChild("StatusLabel"), "connected", WEBSOCKET_URL .. "\n\nStatus: Ready\nQueue: 0")
	end)

	wsClient:on("error", function(error)
		print("[Plugin] WebSocket error: " .. tostring(error))
		updateGuiStatus(pluginGui:FindFirstChild("StatusLabel"), "failed", "Error: " .. tostring(error))
	end)

	wsClient:on("close", function()
		print("[Plugin] WebSocket closed, attempting reconnect")
		updateGuiStatus(pluginGui:FindFirstChild("StatusLabel"), "connecting", WEBSOCKET_URL .. "\n\nStatus: Reconnecting...")
	end)

	controller = Controller.new(wsClient)
	controller:start()

	wsClient:connect()
end

local function startStatusMonitor()
	local lastUpdate = tick()

	game:GetService("RunService").Heartbeat:Connect(function()
		local now = tick()

		if now - lastUpdate >= 1 then
			lastUpdate = now

			local statusLabel = pluginGui:FindFirstChild("StatusLabel")
			if statusLabel then
				local statusText = connectionStatus
				if wsClient:isConnected() then
					statusText = "connected"
					statusLabel.TextColor3 = Color3.fromRGB(0, 200, 0)
				else
					statusText = "connecting"
					statusLabel.TextColor3 = Color3.fromRGB(200, 200, 0)
				end

				local queueSize = wsClient:getQueueSize()
				local details = WEBSOCKET_URL .. "\n\nStatus: " .. (wsClient:isConnected() and "Ready" or "Connecting...")
				if queueSize > 0 then
					details = details .. "\nQueue: " .. queueSize
				end

				updateGuiStatus(statusLabel, statusText, details)
			end
		end
	end)
end

local function setupPlugin()
	print("[Plugin] VortexDQ AI Controller Plugin Starting")

	local toolbar = plugin:CreateToolbar("VortexDQ AI")
	local button = toolbar:CreateButton(
		"AI Controller",
		"Open AI Controller Panel",
		"rbxasset://textures/Cursor.png"
	)

	button.Click:Connect(function()
		if pluginGui then
			pluginGui.Enabled = not pluginGui.Enabled
		end
	end)

	local pluginGuiCreate, statusLabel = createPluginGui()
	pluginGui = pluginGuiCreate

	-- Create proper status label
	if pluginGui:FindFirstChild("StatusLabel") then
		pluginGui:FindFirstChild("StatusLabel"):Destroy()
	end

	statusLabel = Instance.new("TextLabel")
	statusLabel.Name = "StatusLabel"
	statusLabel.Parent = pluginGui
	statusLabel.BackgroundColor3 = Color3.fromRGB(30, 30, 30)
	statusLabel.TextColor3 = Color3.fromRGB(255, 255, 0)
	statusLabel.TextSize = 14
	statusLabel.Size = UDim2.new(1, 0, 1, 0)
	statusLabel.Text = "Initializing WebSocket..."

	updateGuiStatus(statusLabel, "connecting", WEBSOCKET_URL .. "\n\nStatus: Initializing...")

	initializeWebSocket()
	startStatusMonitor()

	print("[Plugin] VortexDQ AI Controller Plugin Loaded")
end

if plugin == nil then
	plugin = script:FindFirstAncestorOfClass("Plugin")
end

if plugin then
	setupPlugin()
else
	print("[Plugin] Running in non-plugin environment")

	-- Fallback for testing
	local WebSocketClient = require(script:WaitForChild("WebSocketClient"))
	local Controller = require(script:WaitForChild("Controller"))

	local wsClient = WebSocketClient.new(WEBSOCKET_URL)

	wsClient:on("connect", function()
		print("[Plugin] Connected")
	end)

	wsClient:on("error", function(err)
		print("[Plugin] Error: " .. tostring(err))
	end)

	local controller = Controller.new(wsClient)
	controller:start()

	wsClient:connect()

	script.Parent:WaitForChild("InstanceManager")
end
