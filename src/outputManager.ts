import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SSHManager } from './sshManager';

export interface RemoteFile {
    name: string;
    path: string;
    size: number;
    isDirectory: boolean;
    modified: Date;
}

export class OutputManager {
    private sshManager: SSHManager;

    constructor() {
        this.sshManager = SSHManager.getInstance();
    }

    public async listOutputFiles(remoteProjectDir: string): Promise<RemoteFile[]> {
        if (!this.sshManager.isConnected()) {
            throw new Error('Not connected to SSH server');
        }

        const outputDir = `${remoteProjectDir}/sshserver_output`;

        try {
            const result = await this.sshManager.exec(
                `find "${outputDir}" -maxdepth 3 -type f -printf '%s\\t%T@\\t%p\\n' 2>/dev/null || ` +
                `find "${outputDir}" -maxdepth 3 -type f -exec stat -f '%z\t%m\t%N' {} \\; 2>/dev/null`
            );

            if (!result.stdout.trim()) {
                return [];
            }

            const files: RemoteFile[] = [];
            const lines = result.stdout.trim().split('\n');

            for (const line of lines) {
                const parts = line.split('\t');
                if (parts.length >= 3) {
                    const size = parseInt(parts[0]) || 0;
                    const mtime = parseFloat(parts[1]) || Date.now() / 1000;
                    const filePath = parts[2];
                    const name = path.posix.basename(filePath);
                    const relativePath = filePath.replace(outputDir + '/', '');

                    files.push({
                        name: relativePath,
                        path: filePath,
                        size,
                        isDirectory: false,
                        modified: new Date(mtime * 1000),
                    });
                }
            }

            return files.sort((a, b) => b.modified.getTime() - a.modified.getTime());
        } catch (err) {
            return [];
        }
    }

    public async downloadFile(
        remotePath: string,
        localDir: string,
        onProgress?: (message: string) => void
    ): Promise<string> {
        if (!this.sshManager.isConnected()) {
            throw new Error('Not connected to SSH server');
        }

        const fileName = path.posix.basename(remotePath);
        const localPath = path.join(localDir, fileName);

        // Ensure local directory exists
        fs.mkdirSync(path.dirname(localPath), { recursive: true });

        const sftp = await this.sshManager.sftp();

        onProgress?.(`Downloading ${fileName}...`);

        await new Promise<void>((resolve, reject) => {
            sftp.fastGet(remotePath, localPath, (err: Error | undefined) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        onProgress?.(`Downloaded ${fileName}`);
        return localPath;
    }

    public async downloadAllOutput(
        remoteProjectDir: string,
        onProgress?: (message: string) => void
    ): Promise<string> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder open');
        }

        const localOutputDir = path.join(workspaceFolder.uri.fsPath, 'sshserver_output');
        fs.mkdirSync(localOutputDir, { recursive: true });

        const files = await this.listOutputFiles(remoteProjectDir);

        if (files.length === 0) {
            onProgress?.('No output files found');
            return localOutputDir;
        }

        onProgress?.(`Downloading ${files.length} files...`);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const relativePath = file.name;
            const localFilePath = path.join(localOutputDir, relativePath);

            fs.mkdirSync(path.dirname(localFilePath), { recursive: true });

            const sftp = await this.sshManager.sftp();
            await new Promise<void>((resolve, reject) => {
                sftp.fastGet(file.path, localFilePath, (err: Error | undefined) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            onProgress?.(`Downloaded ${i + 1}/${files.length}: ${relativePath}`);
        }

        onProgress?.(`All ${files.length} files downloaded!`);
        return localOutputDir;
    }

    public formatFileSize(bytes: number): string {
        if (bytes < 1024) { return bytes + ' B'; }
        if (bytes < 1024 * 1024) { return (bytes / 1024).toFixed(1) + ' KB'; }
        if (bytes < 1024 * 1024 * 1024) { return (bytes / (1024 * 1024)).toFixed(1) + ' MB'; }
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }
}
