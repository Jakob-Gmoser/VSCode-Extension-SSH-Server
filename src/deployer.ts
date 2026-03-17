import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SSHManager } from './sshManager';

export class Deployer {
    private sshManager: SSHManager;

    constructor() {
        this.sshManager = SSHManager.getInstance();
    }

    public async deploy(
        onProgress?: (message: string) => void
    ): Promise<{ remoteProjectDir: string; projectName: string }> {
        if (!this.sshManager.isConnected()) {
            throw new Error('Not connected to SSH server');
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder open');
        }

        const localDir = workspaceFolder.uri.fsPath;
        const projectName = path.basename(localDir);
        const config = vscode.workspace.getConfiguration('sshServer');
        let remoteBaseDir = config.get<string>('remoteBaseDir') || '~/Projekte';
        if (remoteBaseDir.startsWith('~/')) {
            const homeResult = await this.sshManager.exec('echo $HOME');
            const homeDir = homeResult.stdout.trim();
            remoteBaseDir = remoteBaseDir.replace(/^~/, homeDir);
        }
        const excludePatterns = config.get<string[]>('excludePatterns') || [];
        const sshConfig = this.sshManager.getConfig()!;

        const remoteProjectDir = `${remoteBaseDir}/${projectName}`;
        const remoteOutputDir = `${remoteProjectDir}/sshserver_output`;

        onProgress?.('Creating remote directories...');

        // Create directories on the server
        await this.sshManager.exec(`mkdir -p "${remoteProjectDir}" "${remoteOutputDir}"`);

        onProgress?.('Syncing files via rsync...');

        // Build rsync exclude args
        const excludeArgs = excludePatterns.map(p => `--exclude='${p}'`).join(' ');

        // Build SSH command for rsync
        const sshPort = sshConfig.port || 22;
        let sshCmd = `ssh -p ${sshPort} -o StrictHostKeyChecking=no`;

        if (sshConfig.privateKeyPath && sshConfig.privateKeyPath.trim() !== '') {
            const keyPath = sshConfig.privateKeyPath.replace('~', process.env.HOME || '');
            sshCmd += ` -i "${keyPath}"`;
        }

        // Build rsync command
        const rsyncCmd = [
            'rsync', '-avz', '--delete',
            "--exclude='sshserver_output/'",
            excludeArgs,
            `-e '${sshCmd}'`,
            `"${localDir}/"`,
            `"${sshConfig.username}@${sshConfig.host}:${remoteProjectDir}/"`
        ].join(' ');

        onProgress?.('Running rsync...');

        // Execute rsync locally
        const result = await this.execLocal(rsyncCmd);

        if (result.code !== 0) {
            // If rsync fails (maybe not installed on the client), fall back to SFTP
            onProgress?.('rsync failed, falling back to SFTP upload...');
            await this.uploadViaSFTP(localDir, remoteProjectDir, excludePatterns, onProgress);
        }

        onProgress?.('Deploy complete!');

        return { remoteProjectDir, projectName };
    }

    private async uploadViaSFTP(
        localDir: string,
        remoteDir: string,
        excludePatterns: string[],
        onProgress?: (message: string) => void
    ): Promise<void> {
        const sftp = await this.sshManager.sftp();
        const files = this.getFilesRecursive(localDir, excludePatterns);

        let uploaded = 0;
        const total = files.length;

        for (const file of files) {
            const relativePath = path.relative(localDir, file);
            const remotePath = `${remoteDir}/${relativePath.replace(/\\/g, '/')}`;
            const remoteFileDir = path.posix.dirname(remotePath);

            // Create directory
            await this.sshManager.exec(`mkdir -p "${remoteFileDir}"`);

            // Upload file
            await new Promise<void>((resolve, reject) => {
                sftp.fastPut(file, remotePath, (err: Error | undefined) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            uploaded++;
            if (uploaded % 10 === 0 || uploaded === total) {
                onProgress?.(`Uploaded ${uploaded}/${total} files...`);
            }
        }
    }

    private getFilesRecursive(dir: string, excludePatterns: string[]): string[] {
        const results: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            // Check excludes
            if (excludePatterns.some(pattern => {
                return entry.name === pattern || entry.name.match(new RegExp(pattern.replace('*', '.*')));
            })) {
                continue;
            }

            // Skip the sshserver_output folder
            if (entry.name === 'sshserver_output') {
                continue;
            }

            if (entry.isDirectory()) {
                results.push(...this.getFilesRecursive(fullPath, excludePatterns));
            } else {
                results.push(fullPath);
            }
        }

        return results;
    }

    private execLocal(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
        return new Promise((resolve) => {
            const { exec } = require('child_process');
            exec(command, { maxBuffer: 10 * 1024 * 1024 }, (err: any, stdout: string, stderr: string) => {
                resolve({
                    stdout: stdout || '',
                    stderr: stderr || '',
                    code: err ? err.code || 1 : 0,
                });
            });
        });
    }
}
