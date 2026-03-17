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

        // Stop any existing process
        await this.stop();

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
            open: () => {
                this.writeEmitter.fire(`\x1b[1;36m⚡ Running on remote server:\x1b[0m ${command}\r\n`);
                this.writeEmitter.fire(`\x1b[1;36m📁 Directory:\x1b[0m ${remoteProjectDir}\r\n`);
                this.writeEmitter.fire('\x1b[90m' + '─'.repeat(60) + '\x1b[0m\r\n');
            },
            close: () => {
                this.stop();
            },
            handleInput: (data: string) => {
                // Forward input to remote process
                if (this.currentChannel) {
                    this.currentChannel.write(data);
                }
            },
        };

        this.terminal = vscode.window.createTerminal({
            name: '🖥️ SSH Server',
            pty,
        });
        this.terminal.show();

        // Execute command on remote server
        const fullCommand = `cd "${remoteProjectDir}" && ${command}`;

        try {
            this.currentChannel = await this.sshManager.execStream(
                fullCommand,
                (data: string) => {
                    // Convert \n to \r\n for terminal
                    this.writeEmitter.fire(data.replace(/\n/g, '\r\n'));
                },
                (data: string) => {
                    this.writeEmitter.fire(`\x1b[31m${data.replace(/\n/g, '\r\n')}\x1b[0m`);
                },
                (code: number) => {
                    this.writeEmitter.fire('\r\n\x1b[90m' + '─'.repeat(60) + '\x1b[0m\r\n');
                    if (code === 0) {
                        this.writeEmitter.fire(`\x1b[1;32m✅ Process exited with code ${code}\x1b[0m\r\n`);
                    } else {
                        this.writeEmitter.fire(`\x1b[1;31m❌ Process exited with code ${code}\x1b[0m\r\n`);
                    }
                    this.currentChannel = null;
                }
            );
        } catch (err: any) {
            this.writeEmitter.fire(`\x1b[1;31m❌ Error: ${err.message}\x1b[0m\r\n`);
        }
    }

    public async stop(): Promise<void> {
        if (this.currentChannel) {
            this.currentChannel.signal('TERM');
            // Give it a moment, then force kill
            setTimeout(() => {
                if (this.currentChannel) {
                    try {
                        this.currentChannel.signal('KILL');
                    } catch (e) {
                        // ignore
                    }
                    this.currentChannel.close();
                    this.currentChannel = null;
                }
            }, 2000);
        }
    }

    public isRunning(): boolean {
        return this.currentChannel !== null;
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
