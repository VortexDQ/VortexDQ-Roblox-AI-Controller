# 🚀 SUPER EASY SETUP GUIDE

**For Absolute Beginners (Even 11-Year-Olds!)**

No coding knowledge needed. Just follow these steps!

---

## WHAT YOU NEED

Before starting, make sure you have:

✓ **Roblox Studio** - Download from roblox.com  
✓ **Node.js** - Download from nodejs.org (just click download, it's easy!)  
✓ **This folder** - You got it!  
✓ **Internet** - To download stuff

That's it!

---

## STEP 1: Install Node.js (5 minutes)

### What is Node.js?
Node.js lets your computer run the server. It's like the engine that powers everything.

### How to Install:

1. Go to: **https://nodejs.org/**

2. Click the **big green button** that says "Download LTS"
   - LTS is the safe, stable version

3. **Run the installer** you downloaded
   - Keep clicking "Next" and "Install"
   - Don't change anything
   - Say "Yes" when it asks for permission

4. **Wait for it to finish**
   - Don't restart your computer yet!

5. **Open Command Prompt** to check it worked:
   - **Windows:** Press `Win + R`, type `cmd`, press Enter
   - **Mac:** Press `Cmd + Space`, type `terminal`, press Enter

6. **Type this:**
   ```
   node --version
   ```
   
7. **Press Enter**
   - If you see a version number (like v18.0.0), it worked! ✓

---

## STEP 2: Download the VortexDQ Folder

You should have a folder that looks like this:

```
VortexDQ Roblox Editor/
├── server/
├── plugin/
├── ui/
├── ... other files
```

**This folder is your game builder!**

Make sure it's somewhere easy to find, like your Desktop or Documents.

---

## STEP 3: Open This Folder in Command Prompt (EASY!)

### On Windows:

1. Open File Explorer (Windows Explorer)
2. Find the "VortexDQ Roblox Editor" folder
3. **Right-click in empty space** inside the folder
4. Click **"Open in Terminal"** or **"Open Command Prompt here"**
   - (If you don't see it, type `cmd` in the search box at top and press Enter)

### On Mac:

1. Open Finder
2. Find the VortexDQ folder
3. Right-click it
4. Click "New Terminal at Folder"

You should now see a terminal window with lots of text!

---

## STEP 4: Install Dependencies (30 seconds)

In the terminal, **copy and paste this:**

```bash
npm install
```

Then press Enter and **wait**.

You'll see lots of green text and stuff downloading. That's normal!

**When it's done**, you'll see:
```
added 150+ packages
```

Perfect! ✓

---

## STEP 5: Start the Server (10 seconds)

In the **same terminal**, copy and paste:

```bash
npm start
```

Press Enter and wait a few seconds.

You should see:
```
╔════════════════════════════════════════════╗
║  VortexDQ AI Controller - Ready             ║
╚════════════════════════════════════════════╝

🌐 Web UI:  http://127.0.0.1:7777
```

**IMPORTANT:** Keep this terminal **OPEN**! Don't close it while building!

---

## STEP 6: Open Your Web Browser

1. Open Chrome, Firefox, Safari, or Edge
2. In the **address bar**, type:
   ```
   http://127.0.0.1:7777
   ```
3. Press Enter

You should see a **beautiful dark interface** with a chat window!

If it doesn't load:
- Wait 5 seconds and refresh (press F5)
- Check that the terminal from Step 5 is still open

---

## STEP 7: Get an API Key (OPTIONAL BUT RECOMMENDED)

The system works WITHOUT a key, but Claude makes better creations.

### Option A: Use Claude (Best Quality)

1. Go to: **https://console.anthropic.com/api/keys**
2. Create a free account (takes 2 minutes)
3. Click "Copy" on your API key
4. Go back to this VortexDQ folder
5. Create a new text file called `.env`
   - **Important:** The filename starts with a **dot**!
6. In that file, paste:
   ```
   ANTHROPIC_API_KEY=your-key-here
   PORT=7777
   ```
   - Replace "your-key-here" with the key you copied
   - Don't remove the `sk-ant-` part!
7. Save the file
8. Go back to your terminal and:
   - Press **Ctrl+C** to stop the server
   - Type `npm start` again
   - Check the terminal - it should say "Claude API Integration: Ready"

### Option B: Use Ollama (Free, No Account)

1. Go to: **https://ollama.ai**
2. Download for your computer
3. Install it (just click next)
4. Open Ollama and leave it running
5. When you start VortexDQ, it will auto-detect it!

**No API key needed!** 🎉

---

## STEP 8: Install the Roblox Plugin

This is the part that makes Roblox Studio update automatically!

### Step 8a: Copy 4 Files

In your VortexDQ folder, go to the **plugin** folder.

You should see 4 files:
- Main.lua
- WebSocketClient.lua
- Controller.lua
- InstanceManager.lua

**Copy ALL 4 files** (select all, right-click, copy)

### Step 8b: Go to Roblox Plugins Folder

#### On Windows:
1. Press **Windows Key + R**
2. Copy and paste this:
   ```
   %APPDATA%\Roblox\Plugins\
   ```
3. Press Enter
4. A folder will open!

#### On Mac:
1. Open Finder
2. Press **Cmd + Shift + G**
3. Paste:
   ```
   ~/Library/Application Support/Roblox/Plugins/
   ```
4. Click Go
5. A folder will open!

### Step 8c: Paste the Files

**Right-click** in the empty Plugins folder and paste the 4 files!

You should now see:
- Main.lua
- WebSocketClient.lua
- Controller.lua
- InstanceManager.lua

---

## STEP 9: Restart Roblox Studio

**Close Roblox Studio completely.**

Then **open Roblox Studio again.**

---

## STEP 10: Test It!

1. Open any place in Roblox Studio
2. Look at the top menu
3. Click **Plugins**
4. You should see **"VortexDQ AI"** button!
5. Click it
6. You should see a status window appear

If you see a **green dot** ✓ Connected, it worked!

---

## STEP 11: Build Your First Thing!

Go back to your **web browser** (http://127.0.0.1:7777)

In the chat box, type:

```
create a red part in workspace
```

Click Send!

**Watch your Roblox Studio update automatically!** 🎮

---

## TROUBLESHOOTING FOR BEGINNERS

### "I see an error when starting npm install"

**Solution:**
- Make sure you installed Node.js correctly
- Restart your computer
- Try again

### "The web page won't load"

**Solution:**
- Is your terminal still running? (From Step 5)
- Try refreshing the page (press F5)
- Wait 10 seconds and try again

### "Plugin won't connect"

**Solution:**
- Did you copy ALL 4 .lua files?
- Did you restart Roblox Studio?
- Check the terminal - is the server still running?

### "Commands don't work"

**Solution:**
- Try a simple command: "create a part"
- Check the Errors tab in web UI (shows what went wrong)
- Close web browser and open again: http://127.0.0.1:7777

### "I see error about Node.js version"

**Solution:**
- You might have an old version
- Download latest Node.js from nodejs.org
- Reinstall it

---

## COMMON COMMANDS TO TRY

Once it's working, try these:

**Easy:**
```
create a blue part
make a red folder
```

**Medium:**
```
create a staircase with 5 steps
build a platform with a checkpoint
```

**Hard:**
```
create an obstacle course with 10 platforms, 
each different color, with checkpoints
```

---

## WHAT TO DO NEXT

1. **Read the chat:** It explains what it's doing
2. **Try different models:** Click "Models" tab to switch
3. **Check Errors:** Click "Errors" tab to see what went wrong (if anything)
4. **View Stats:** Click "Stats" tab to see performance
5. **Check Plugin Status:** Click "Plugin" tab to see connection

---

## IF YOU'RE STUCK

**Read these in order:**

1. **START_HERE.txt** - Quick overview
2. **GETTING_STARTED.txt** - Step-by-step
3. **README.md** - Full documentation

---

## REMEMBER:

✓ Keep the terminal open while using the builder  
✓ The web browser is http://127.0.0.1:7777  
✓ The plugin is in Roblox Studio's Plugins menu  
✓ If something breaks, just restart everything  

---

## YOU'RE ALL SET!

You now have a professional AI game builder!

**Have fun building amazing games!** 🎮🚀

---

## For Parents/Teachers:

This system:
- Uses local processing (no cloud)
- No personal data collection
- Free to use (optional paid AI models)
- Safe for kids
- Educational value
- Learns Roblox development

Created with ❤️ for developers of all ages!
