# VSCode SSH Server Deploy 🚀

A powerful Visual Studio Code extension that allows you to deploy your local workspace to a remote Linux server via SSH, run scripts/commands, view live terminal output, pull output files, and monitor the remote server's CPU, RAM, and Disk space – all from a native sidebar in VSCode!

## Features ✨

* **One-Click Deploy**: Uses `rsync` under the hood to lightning-fast synchronize your workspace with a remote server (e.g. `~/Projekte/YourProjectName`). Excludes `.git`, `node_modules`, `__pycache__`, etc. automatically.
* **Live Terminal Streaming**: Click "Run" and watch the `stdout` and `stderr` stream directly into the extension's sidebar in VSCode!
* **Run Auto-Detection**: Automatically detects what command to run based on your project (`package.json`, `.py`, `Cargo.toml`, `go.mod`, `Makefile`).
* **Output File Management**: Generates an `sshserver_output/` folder. Your server scripts can save `.csv`, `.json`, `.txt`, `.png` files, etc., into this directory. You can easily click "Download all" to pull them back to your local machine!
* **Server Health Monitoring**: Live, color-coded progress bars showing the remote server's CPU, RAM, and Disk Usage, updated continuously.
* **Stop Button**: Cancel long-running processes or infinite loops on the remote server with one click.
* **SSH Key & Password Support**: Connect using user/password or your `~/.ssh/id_rsa` private key.

## Requirements 📋

**On your Local Machine (Client):**
- **NodeJS** & **npm** (To build from source)
- **`rsync`** (Highly recommended for fast syncing. Fallback to SFTP is supported, but slower).
- **VSCode** 1.85.0+

**On your Remote Server:**
- **SSH Server** enabled.
- **`rsync`** installed.
- Standard unix commands for metrics (`top`, `free`, `df`, `hostname`, `uptime`).

## How to Build & Install from Source 🛠️

1. Clone this repository:
   ```bash
   git clone https://github.com/Jakob-Gmoser/VSCode-Extension-SSH-Server.git
   cd VSCode-Extension-SSH-Server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile the extension:
   ```bash
   npm run compile
   ```

4. Package it into a `.vsix` file (Requires `vsce`):
   ```bash
   npx @vscode/vsce package --allow-missing-repository
   ```

5. Install the generated `.vsix` file in VSCode:
   - Press `Cmd/Ctrl + Shift + P` -> **Extensions: Install from VSIX...**
   - Select the generated `ssh-server-deploy-x.x.x.vsix` file.
   - Reload VSCode.

## Usage 💡

1. Click on the new **SSH Server** icon in your VSCode activity bar (left menu).
2. Enter your server's IP address, username, and password (or leave password empty if you use an SSH key).
3. Click **⚡ Connect**.
4. Click **📦 Deploy Code** to push your workspace to the remote server.
5. Click **▶ Run** to execute your code natively on the server and watch the live output!

## Demo / Test Script

A `test_server.py` file is included in the project. If you deploy the extension and execute `python3 test_server.py` as your Custom Run Command, it will simulate terminal output, create sample files in the `sshserver_output/` folder, and test the realtime monitoring features.

## License 📜

MIT License. Open source and free to use!
