import { Client, ConnectConfig, ClientChannel } from 'ssh2';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface SSHConfig {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKeyPath?: string;
}

export class SSHManager {
    private static instance: SSHManager;
    private client: Client | null = null;
    private connected: boolean = false;
    private config: SSHConfig | null = null;

    private onStatusChangeEmitter = new vscode.EventEmitter<boolean>();
    public readonly onStatusChange = this.onStatusChangeEmitter.event;

    private constructor() {}

    public static getInstance(): SSHManager {
        if (!SSHManager.instance) {
            SSHManager.instance = new SSHManager();
        }
        return SSHManager.instance;
    }

    public async connect(config: SSHConfig): Promise<void> {
        if (this.connected) {
            await this.disconnect();
        }

        this.config = config;
        this.client = new Client();

        const connectConfig: ConnectConfig = {
            host: config.host,
            port: config.port,
            username: config.username,
        };

        if (config.privateKeyPath && config.privateKeyPath.trim() !== '') {
            const keyPath = config.privateKeyPath.replace('~', process.env.HOME || '');
            try {
                connectConfig.privateKey = fs.readFileSync(keyPath);
            } catch (err) {
                throw new Error(`Could not read private key at: ${keyPath}`);
            }
        } else if (config.password) {
            connectConfig.password = config.password;
        } else {
            // Prompt for password
            const password = await vscode.window.showInputBox({
                prompt: `Password for ${config.username}@${config.host}`,
                password: true,
                ignoreFocusOut: true,
            });
            if (!password) {
                throw new Error('No password provided');
            }
            connectConfig.password = password;
        }

        return new Promise<void>((resolve, reject) => {
            this.client!.on('ready', () => {
                this.connected = true;
                this.onStatusChangeEmitter.fire(true);
                resolve();
            });

            this.client!.on('error', (err: Error) => {
                this.connected = false;
                this.onStatusChangeEmitter.fire(false);
                reject(err);
            });

            this.client!.on('close', () => {
                this.connected = false;
                this.onStatusChangeEmitter.fire(false);
            });

            this.client!.connect(connectConfig);
        });
    }

    public async disconnect(): Promise<void> {
        if (this.client) {
            this.client.end();
            this.client = null;
            this.connected = false;
            this.onStatusChangeEmitter.fire(false);
        }
    }

    public isConnected(): boolean {
        return this.connected;
    }

    public getConfig(): SSHConfig | null {
        return this.config;
    }

    public getClient(): Client | null {
        return this.client;
    }

    public async exec(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
        if (!this.client || !this.connected) {
            throw new Error('Not connected to SSH server');
        }

        return new Promise((resolve, reject) => {
            this.client!.exec(command, (err: Error | undefined, stream: ClientChannel) => {
                if (err) {
                    reject(err);
                    return;
                }

                let stdout = '';
                let stderr = '';

                stream.on('close', (code: number) => {
                    resolve({ stdout, stderr, code: code || 0 });
                });

                stream.on('data', (data: Buffer) => {
                    stdout += data.toString();
                });

                stream.stderr.on('data', (data: Buffer) => {
                    stderr += data.toString();
                });
            });
        });
    }

    public async execStream(
        command: string,
        onStdout: (data: string) => void,
        onStderr: (data: string) => void,
        onClose?: (code: number) => void
    ): Promise<ClientChannel> {
        if (!this.client || !this.connected) {
            throw new Error('Not connected to SSH server');
        }

        return new Promise((resolve, reject) => {
            this.client!.exec(command, (err: Error | undefined, stream: ClientChannel) => {
                if (err) {
                    reject(err);
                    return;
                }

                stream.on('data', (data: Buffer) => {
                    onStdout(data.toString());
                });

                stream.stderr.on('data', (data: Buffer) => {
                    onStderr(data.toString());
                });

                stream.on('close', (code: number) => {
                    if (onClose) {
                        onClose(code || 0);
                    }
                });

                resolve(stream);
            });
        });
    }

    public async sftp(): Promise<any> {
        if (!this.client || !this.connected) {
            throw new Error('Not connected to SSH server');
        }

        return new Promise((resolve, reject) => {
            this.client!.sftp((err: Error | undefined, sftp: any) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(sftp);
            });
        });
    }

    public dispose(): void {
        this.disconnect();
        this.onStatusChangeEmitter.dispose();
    }
}
