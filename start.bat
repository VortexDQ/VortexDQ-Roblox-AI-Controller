@echo off
echo VortexDQ AI Controller - Startup
echo ================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo Error: npm install failed
        pause
        exit /b 1
    )
)

REM Check if .env exists
if not exist ".env" (
    echo.
    echo ⚠️  .env file not found!
    echo Please create .env with:
    echo   ANTHROPIC_API_KEY=sk-ant-your-key-here
    echo   PORT=7777
    echo.
    pause
    exit /b 1
)

REM Start server
echo Starting VortexDQ AI Server...
echo Server will run on: ws://127.0.0.1:7777
echo.
echo Plugin Status: Open Roblox Studio and click Plugins ^> VortexDQ AI
echo.
echo Press Ctrl+C to stop server
echo.

node server/index.js

pause
