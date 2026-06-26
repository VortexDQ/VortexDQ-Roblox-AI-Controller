#!/bin/bash

echo "VortexDQ AI Controller - Startup"
echo "================================"
echo

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "Error: npm install failed"
        exit 1
    fi
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo
    echo "⚠️  .env file not found!"
    echo "Please create .env with:"
    echo "  ANTHROPIC_API_KEY=sk-ant-your-key-here"
    echo "  PORT=7777"
    echo
    exit 1
fi

# Start server
echo "Starting VortexDQ AI Server..."
echo "Server will run on: ws://127.0.0.1:7777"
echo
echo "Plugin Status: Open Roblox Studio and click Plugins > VortexDQ AI"
echo
echo "Press Ctrl+C to stop server"
echo

node server/index.js
