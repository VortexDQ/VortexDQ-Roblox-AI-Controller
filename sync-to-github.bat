@echo off
REM VortexDQ - Auto Sync to GitHub
REM This script pushes all changes to your GitHub repository

echo.
echo ╔════════════════════════════════════════════╗
echo ║   VortexDQ GitHub Sync Tool                ║
echo ╚════════════════════════════════════════════╝
echo.

REM Check if git is installed
git --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git is not installed!
    echo Please install Git from https://git-scm.com/
    pause
    exit /b 1
)

REM Check git status
echo Checking repository status...
git status >nul 2>&1
if errorlevel 1 (
    echo ERROR: Not in a git repository!
    echo Run: git init
    pause
    exit /b 1
)

echo.
echo 📊 Current Status:
git status --short
echo.

REM Check if there are changes
git diff --quiet
if %errorlevel% equ 0 (
    git diff --cached --quiet
    if %errorlevel% equ 0 (
        echo No changes to commit.
        pause
        exit /b 0
    )
)

REM Get commit message
echo.
set /p COMMIT_MSG="Enter commit message (or press Enter for default): "
if "%COMMIT_MSG%"=="" (
    set COMMIT_MSG=Update: VortexDQ changes
)

echo.
echo 🔄 Syncing to GitHub...
echo.

REM Add all changes
echo Step 1: Adding files...
git add .
if errorlevel 1 (
    echo ERROR: Failed to add files
    pause
    exit /b 1
)

REM Create commit
echo Step 2: Creating commit...
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    echo ERROR: Failed to create commit
    echo (This might be normal if there are no new changes)
    REM Don't exit, push might still work
)

REM Push to GitHub
echo Step 3: Pushing to GitHub...
git push origin main
if errorlevel 1 (
    echo ERROR: Failed to push to GitHub!
    echo Make sure you have:
    echo   1. Created the repository on github.com
    echo   2. Configured the remote: git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
    echo   3. Have permission to push
    pause
    exit /b 1
)

echo.
echo ╔════════════════════════════════════════════╗
echo ║  ✓ Successfully synced to GitHub!          ║
echo ╚════════════════════════════════════════════╝
echo.
echo Your changes are now on GitHub!
echo Repository: https://github.com/VortexDQ/VortexDQ-Roblox-AI-Controller
echo.
pause
