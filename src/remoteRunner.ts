import * as vscode from 'vscode';
import { SSHManager } from './sshManager';
import { ClientChannel } from 'ssh2';

export class RemoteRunner {
    private sshManager: SSHManager;
    private currentChannel: ClientChannel | null = null;
    private terminal: vscode.Terminal | null = null;
    private writeEmitter = new vscode.EventEmitter<string>();

    constructor() {
        this.sshManager = SSHManager.getInstance();
    }

    public async run(remoteProjectDir: string, customCommand?: string): Promise<void> {
        if (!this.sshManager.isConnected()) {
            throw new Error('Not connected to SSH server');
        }

        const command = customCommand || await this.detectRunCommand(remoteProjectDir);
        if (!command) {
            throw new Error('Could not detect run command. Please set sshServer.runCommand in settings.');
        }

        // Create pseudo terminal
        this.writeEmitter = new vscode.EventEmitter<string>();
        const closeEmitter = new vscode.EventEmitter<number | void>();

        const pty: vscode.Pseudoterminal = {
            onDidWrite: this.writeEmitter.event,
            onDidClose: closeEmitter.event,
            open: () => {},
            close: () => {
                // Closing terminal just disconnects the tail stream, does NOT stop the script
                if (this.currentChannel) {
                    try {
                        this.currentChannel.close();
                    } catch (e) {}
                    this.currentChannel = null;
                }
            },
            handleInput: (data: string) => {
                // We cannot send input to a nohup process easily.
                // We could forward it to the tail stream, but it wouldn't reach the process.
                // For now, input is disabled in background mode.
            },
        };

        this.terminal = vscode.window.createTerminal({
            name: '🖥️ SSH Server (Background)',
            pty,
        });
        this.terminal.show();

        const outputDir = `${remoteProjectDir}/sshserver_output`;
        const logFile = `${outputDir}/live_run.log`;
        const pidFile = `${outputDir}/live_run.pid`;

        try {
            // Unify environment and directory
            this.writeEmitter.fire(`\x1b[1;36m⚡ Directory:\x1b[0m ${remoteProjectDir}\r\n`);
            this.writeEmitter.fire('\x1b[90m' + '─'.repeat(60) + '\x1b[0m\r\n');

            // 1. Check if process is already running
            const checkCmd = `
                mkdir -p "${outputDir}"
                if [ -f "${pidFile}" ]; then
                    PID=$(cat "${pidFile}")
                    if ps -p $PID > /dev/null; then
                        echo "RUNNING:$PID"
                    else
                        echo "STALE"
                    fi
                else
                    echo "NONE"
                fi
            `;
            const checkResult = await this.sshManager.exec(checkCmd);
            const status = checkResult.stdout.trim();

            let pid = '';

            if (status.startsWith('RUNNING:')) {
                pid = status.split(':')[1];
                this.writeEmitter.fire(`\x1b[1;33m⚠️ Script is already running in background (PID: ${pid}).\x1b[0m\r\n`);
                this.writeEmitter.fire(`\x1b[1;33m⚠️ Re-attaching to live log stream...\x1b[0m\r\n`);
            } else {
                this.writeEmitter.fire(`\x1b[1;36m▶ Starting new background process:\x1b[0m ${command}\r\n`);
                // 2. Start process in background
                const startCmd = `
                    cd "${remoteProjectDir}"
                    nohup ${command} > "${logFile}" 2>&1 &
                    PID=$!
                    echo $PID > "${pidFile}"
                    echo $PID
                `;
                const startResult = await this.sshManager.exec(startCmd);
                pid = startResult.stdout.trim().split('\n').pop()?.trim() || '';
                
                if (!pid || !/^\d+$/.test(pid)) {
                    throw new Error(`Failed to start process or retrieve PID. Output: ${startResult.stdout}`);
                }
                this.writeEmitter.fire(`\x1b[1;32m✅ Started with PID: ${pid}\x1b[0m\r\n`);
            }

            this.writeEmitter.fire('\x1b[90m' + '─'.repeat(60) + '\x1b[0m\r\n');

            // 3. Stream the log file
            // tail --pid exits when the process dies
            const tailCmd = `tail -f "${logFile}" --pid=${pid}`;
            
            this.currentChannel = await this.sshManager.execStream(
                tailCmd,
                (data: string) => {
                    this.writeEmitter.fire(data.replace(/\n/g, '\r\n'));
                },
                (data: string) => {
                    this.writeEmitter.fire(`\x1b[31m${data.replace(/\n/g, '\r\n')}\x1b[0m`);
                },
                (code: number) => {
                    this.writeEmitter.fire('\r\n\x1b[90m' + '─'.repeat(60) + '\x1b[0m\r\n');
                    this.writeEmitter.fire(`\x1b[1;36mℹ️ Stream disconnected or process ended.\x1b[0m\r\n`);
                    this.currentChannel = null;
                }
            );
        } catch (err: any) {
            this.writeEmitter.fire(`\x1b[1;31m❌ Error: ${err.message}\x1b[0m\r\n`);
        }
    }

    public async stop(remoteProjectDir?: string): Promise<void> {
        // Disconnect the tail stream if it's running
        if (this.currentChannel) {
            try {
                this.currentChannel.close();
            } catch (e) {}
            this.currentChannel = null;
            if (this.terminal) {
                this.writeEmitter.fire(`\x1b[1;33m🔌 Detached from stream.\x1b[0m\r\n`);
            }
        }

        // Kill the actual background process on the server
        if (remoteProjectDir && this.sshManager.isConnected()) {
            try {
                const pidFile = `${remoteProjectDir}/sshserver_output/live_run.pid`;
                const killCmd = `
                    if [ -f "${pidFile}" ]; then
                        PID=$(cat "${pidFile}")
                        if ps -p $PID > /dev/null; then
                            kill -TERM $PID 2>/dev/null
                            sleep 1
                            kill -9 $PID 2>/dev/null
                            rm -f "${pidFile}"
                            echo "KILLED"
                        fi
                    fi
                `;
                await this.sshManager.exec(killCmd);
                if (this.terminal) {
                    this.writeEmitter.fire(`\x1b[1;31m🛑 Background process stopped.\x1b[0m\r\n`);
                }
            } catch (err) {
                console.error('Failed to kill background process', err);
            }
        }
    }

    // Changing signature of isRunning since we can have detached processes
    public async checkIsRunning(remoteProjectDir: string): Promise<boolean> {
        if (!this.sshManager.isConnected()) return false;
        try {
            const pidFile = `${remoteProjectDir}/sshserver_output/live_run.pid`;
            const checkCmd = `
                if [ -f "${pidFile}" ]; then
                    PID=$(cat "${pidFile}")
                    if ps -p $PID > /dev/null; then
                        echo "YES"
                    else
                        echo "NO"
                    fi
                else
                    echo "NO"
                fi
            `;
            const result = await this.sshManager.exec(checkCmd);
            return result.stdout.trim() === 'YES';
        } catch {
            return false;
        }
    }

    private async detectRunCommand(remoteProjectDir: string): Promise<string | null> {
        // Check settings first
        const config = vscode.workspace.getConfiguration('sshServer');
        const customCmd = config.get<string>('runCommand');
        if (customCmd && customCmd.trim() !== '') {
            return customCmd;
        }

        // Try to detect based on files
        const result = await this.sshManager.exec(`ls -1 "${remoteProjectDir}"`);
        const files = result.stdout.split('\n').map(f => f.trim()).filter(f => f);

        // Check for common project types
        if (files.includes('package.json')) {
            // Check if there's a start script
            const pkgResult = await this.sshManager.exec(
                `cat "${remoteProjectDir}/package.json" | grep -c '"start"'`
            );
            if (parseInt(pkgResult.stdout.trim()) > 0) {
                return 'npm start';
            }
            return 'node index.js';
        }

        if (files.includes('main.py')) {
            return 'python3 main.py';
        }

        if (files.includes('app.py')) {
            return 'python3 app.py';
        }

        if (files.includes('train.py')) {
            return 'python3 train.py';
        }

        if (files.includes('requirements.txt')) {
            // Has python requirements, look for .py file
            const pyFiles = files.filter(f => f.endsWith('.py'));
            if (pyFiles.length === 1) {
                return `python3 ${pyFiles[0]}`;
            }
        }

        if (files.includes('Makefile')) {
            return 'make';
        }

        if (files.includes('Cargo.toml')) {
            return 'cargo run';
        }

        if (files.includes('go.mod')) {
            return 'go run .';
        }

        // Ask user if we can't detect
        const cmd = await vscode.window.showInputBox({
            prompt: 'Could not auto-detect run command. Enter the command to run:',
            placeHolder: 'e.g., python3 main.py',
            ignoreFocusOut: true,
        });

        return cmd || null;
    }

    public dispose(): void {
        this.stop();
        this.writeEmitter.dispose();
    }
}
