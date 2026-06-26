#!/bin/bash

# VortexDQ - Auto Sync to GitHub
# This script pushes all changes to your GitHub repository

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║   VortexDQ GitHub Sync Tool                ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "ERROR: Git is not installed!"
    echo "Please install Git from https://git-scm.com/"
    exit 1
fi

# Check if in git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "ERROR: Not in a git repository!"
    echo "Run: git init"
    exit 1
fi

echo "📊 Current Status:"
git status --short
echo ""

# Check if there are changes
if git diff --quiet && git diff --cached --quiet; then
    echo "No changes to commit."
    exit 0
fi

# Get commit message
read -p "Enter commit message (or press Enter for default): " COMMIT_MSG
if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="Update: VortexDQ changes"
fi

echo ""
echo "🔄 Syncing to GitHub..."
echo ""

# Add all changes
echo "Step 1: Adding files..."
git add .
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to add files"
    exit 1
fi

# Create commit
echo "Step 2: Creating commit..."
git commit -m "$COMMIT_MSG"
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to create commit"
    echo "(This might be normal if there are no new changes)"
fi

# Push to GitHub
echo "Step 3: Pushing to GitHub..."
git push origin main
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to push to GitHub!"
    echo "Make sure you have:"
    echo "  1. Created the repository on github.com"
    echo "  2. Configured the remote: git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git"
    echo "  3. Have permission to push"
    exit 1
fi

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║  ✓ Successfully synced to GitHub!          ║"
echo "╚════════════════════════════════════════════╝"
echo ""
echo "Your changes are now on GitHub!"
echo "Repository: https://github.com/VortexDQ/VortexDQ-Roblox-AI-Controller"
echo ""
