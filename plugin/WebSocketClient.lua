local WebSocketClient = {}
WebSocketClient.__index = WebSocketClient

local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")

function WebSocketClient.new(url)
	local self = setmetatable({}, WebSocketClient)

	self.url = url
	self.connected = false
	self.reconnecting = false
	self.reconnectDelay = 1
	self.maxReconnectDelay = 30
	self.reconnectAttempts = 0
	self.maxReconnectAttempts = -1 -- Infinite

	self.messageQueue = {}
	self.messageHandlers = {}
	self.errorHandlers = {}
	self.connectHandlers = {}
	self.closeHandlers = {}

	self.lastMessageTime = tick()
	self.heartbeatInterval = 30
	self.heartbeatTimeout = 60

	self.requestId = 0
	self.pendingResponses = {}

	return self
end

function WebSocketClient:on(event, handler)
	if event == "message" then
		table.insert(self.messageHandlers, handler)
	elseif event == "error" then
		table.insert(self.errorHandlers, handler)
	elseif event == "connect" then
		table.insert(self.connectHandlers, handler)
	elseif event == "close" then
		table.insert(self.closeHandlers, handler)
	end
end

function WebSocketClient:emit(event, ...)
	if event == "message" then
		for _, handler in ipairs(self.messageHandlers) do
			pcall(handler, ...)
		end
	elseif event == "error" then
		for _, handler in ipairs(self.errorHandlers) do
			pcall(handler, ...)
		end
	elseif event == "connect" then
		for _, handler in ipairs(self.connectHandlers) do
			pcall(handler)
		end
	elseif event == "close" then
		for _, handler in ipairs(self.closeHandlers) do
			pcall(handler)
		end
	end
end

function WebSocketClient:connect()
	if self.connected or self.reconnecting then
		return false
	end

	self.reconnecting = true
	self.reconnectAttempts = 0

	return self:_attemptConnect()
end

function WebSocketClient:_attemptConnect()
	self.reconnectAttempts = self.reconnectAttempts + 1

	if self.maxReconnectAttempts > 0 and self.reconnectAttempts > self.maxReconnectAttempts then
		self:_handleConnectionFailed()
		return false
	end

	print("[WebSocket] Attempting connection " .. self.reconnectAttempts .. " to " .. self.url)

	local success = false
	local response = nil

	pcall(function()
		response = HttpService:GetAsync(self.url .. "/health", false)
		success = response ~= nil
	end)

	if success then
		self.connected = true
		self.reconnecting = false
		self.reconnectAttempts = 0
		self.reconnectDelay = 1

		print("[WebSocket] Connected successfully")
		self:_startHeartbeat()
		self:emit("connect")

		-- Process any queued messages
		self:_flushQueue()

		return true
	else
		self:_scheduleReconnect()
		return false
	end
end

function WebSocketClient:_scheduleReconnect()
	if self.maxReconnectAttempts > 0 and self.reconnectAttempts > self.maxReconnectAttempts then
		self:_handleConnectionFailed()
		return
	end

	print("[WebSocket] Connection failed, retrying in " .. self.reconnectDelay .. "s")

	local delay = self.reconnectDelay
	self.reconnectDelay = math.min(self.reconnectDelay * 1.5, self.maxReconnectDelay)

	-- Proper async delay handling
	task.delay(delay, function()
		if self.reconnecting then
			self:_attemptConnect()
		end
	end)
end

function WebSocketClient:_handleConnectionFailed()
	self.connected = false
	self.reconnecting = false
	print("[WebSocket] Connection failed - max retries exceeded")
	self:emit("error", "Connection failed after max retries")
	self:emit("close")
end

function WebSocketClient:send(data)
	if not self.connected then
		table.insert(self.messageQueue, data)
		return false
	end

	local jsonData = type(data) == "string" and data or HttpService:JSONEncode(data)

	pcall(function()
		HttpService:PostAsync(self.url .. "/plugin", jsonData, Enum.HttpContentType.ApplicationJson, false)
	end)

	self.lastMessageTime = tick()
	return true
end

function WebSocketClient:sendCommand(action, commandData)
	self.requestId = self.requestId + 1

	local message = {
		type = "command",
		id = "cmd_" .. self.requestId,
		action = action,
		data = commandData or {}
	}

	self:send(message)
	return message.id
end

function WebSocketClient:sendResult(commandId, success, result, error, state)
	self:send({
		type = "result",
		id = commandId,
		success = success,
		result = result or {},
		error = error or "",
		state = state or {}
	})
end

function WebSocketClient:sendState(state)
	self:send({
		type = "state",
		state = state
	})
end

function WebSocketClient:_flushQueue()
	while #self.messageQueue > 0 do
		local message = table.remove(self.messageQueue, 1)
		local jsonData = type(message) == "string" and message or HttpService:JSONEncode(message)

		pcall(function()
			HttpService:PostAsync(self.url .. "/plugin", jsonData, Enum.HttpContentType.ApplicationJson, false)
		end)
	end
end

function WebSocketClient:_startHeartbeat()
	if self.heartbeatConnection then
		self.heartbeatConnection:Disconnect()
	end

	local lastHeartbeat = tick()

	self.heartbeatConnection = RunService.Heartbeat:Connect(function()
		local now = tick()

		if now - lastHeartbeat >= self.heartbeatInterval then
			lastHeartbeat = now

			if self.connected then
				-- Attempt to fetch state to verify connection
				pcall(function()
					HttpService:GetAsync(self.url .. "/health", false)
				end)
			end
		end

		-- Check for timeout
		if self.connected and (now - self.lastMessageTime) > self.heartbeatTimeout then
			print("[WebSocket] Heartbeat timeout")
			self:disconnect()
		end
	end)
end

function WebSocketClient:disconnect()
	if self.heartbeatConnection then
		self.heartbeatConnection:Disconnect()
		self.heartbeatConnection = nil
	end

	self.connected = false
	self.reconnecting = false

	print("[WebSocket] Disconnected")
	self:emit("close")
end

function WebSocketClient:isConnected()
	return self.connected
end

function WebSocketClient:getQueueSize()
	return #self.messageQueue
end

return WebSocketClient
