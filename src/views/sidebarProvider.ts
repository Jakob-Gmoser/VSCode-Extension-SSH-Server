import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SSHManager, SSHConfig } from '../sshManager';
import { Deployer } from '../deployer';
import { RemoteRunner } from '../remoteRunner';
import { OutputManager } from '../outputManager';
import { ServerStatus, ServerStatusData } from '../serverStatus';

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'sshServer.sidebar';

    private webviewView?: vscode.WebviewView;
    private sshManager: SSHManager;
    private deployer: Deployer;
    private runner: RemoteRunner;
    private outputManager: OutputManager;
    private serverStatus: ServerStatus;
    private remoteProjectDir: string = '';
    private logs: string[] = ['Ready.'];

    constructor(
        private readonly extensionUri: vscode.Uri,
        deployer: Deployer,
        runner: RemoteRunner,
        outputManager: OutputManager,
        serverStatus: ServerStatus
    ) {
        this.sshManager = SSHManager.getInstance();
        this.deployer = deployer;
        this.runner = runner;
        this.outputManager = outputManager;
        this.serverStatus = serverStatus;

        // Listen for status updates
        this.serverStatus.onUpdate((data) => {
            this.postMessage({ type: 'serverStatus', data });
        });

        this.sshManager.onStatusChange((connected) => {
            this.postMessage({ type: 'connectionStatus', connected });
            if (connected) {
                this.serverStatus.startMonitoring();
            } else {
                this.serverStatus.stopMonitoring();
            }
        });
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void {
        this.webviewView = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri],
        };

        // Keep the webview alive when it's not visible
        webviewView.title = "SSH Server";

        webviewView.webview.html = this.getHtmlContent(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'connect':
                    await this.handleConnect(message.data);
                    break;
                case 'disconnect':
                    await this.handleDisconnect();
                    break;
                case 'deploy':
                    await this.handleDeploy();
                    break;
                case 'run':
                    await this.handleRun(message.data?.command);
                    break;
                case 'stop':
                    await this.handleStop();
                    break;
                case 'pullOutput':
                    await this.handlePullOutput();
                    break;
                case 'refreshStatus':
                    await this.handleRefreshStatus();
                    break;
                case 'refreshFiles':
                    await this.handleRefreshFiles();
                    break;
                case 'downloadFile':
                    await this.handleDownloadFile(message.data.path);
                    break;
                case 'getInitialState':
                    this.sendInitialState();
                    break;
            }
        });

        // Start checking for running processes
        this.startPeriodicUpdates();
    }

    private updateInterval: NodeJS.Timeout | null = null;

    private startPeriodicUpdates(): void {
        this.updateInterval = setInterval(async () => {
            if (this.sshManager.isConnected() && this.remoteProjectDir) {
                const isRunning = await this.runner.checkIsRunning(this.remoteProjectDir);
                this.postMessage({
                    type: 'runStatus',
                    running: isRunning
                });
            } else {
                this.postMessage({
                    type: 'runStatus',
                    running: false
                });
            }
        }, 2000);
    }

    private sendInitialState(): void {
        const config = vscode.workspace.getConfiguration('sshServer');

        if (this.sshManager.isConnected() && !this.remoteProjectDir) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                const remoteBaseDir = config.get<string>('remoteBaseDir') || '~/Projekte';
                const projectName = path.basename(workspaceFolder.uri.fsPath);
                this.remoteProjectDir = `${remoteBaseDir}/${projectName}`;
            }
        }

        this.postMessage({
            type: 'initialState',
            data: {
                host: config.get<string>('host') || '',
                port: config.get<number>('port') || 22,
                username: config.get<string>('username') || '',
                privateKeyPath: config.get<string>('privateKeyPath') || '',
                runCommand: config.get<string>('runCommand') || '',
                connected: this.sshManager.isConnected(),
                logs: this.logs
            }
        });

        if (this.sshManager.isConnected()) {
            const lastStatus = this.serverStatus.getLastStatus();
            if (lastStatus) {
                this.postMessage({ type: 'serverStatus', data: lastStatus });
            }
        }
    }

    private async handleConnect(data: { host: string; port: number; username: string; password?: string; privateKeyPath?: string }): Promise<void> {
        try {
            this.postMessage({ type: 'log', message: `Connecting to ${data.host}...` });

            const config: SSHConfig = {
                host: data.host,
                port: data.port || 22,
                username: data.username,
                password: data.password,
                privateKeyPath: data.privateKeyPath,
            };

            await this.sshManager.connect(config);

            // Save to VS Code settings
            const vsConfig = vscode.workspace.getConfiguration('sshServer');
            await vsConfig.update('host', data.host, vscode.ConfigurationTarget.Global);
            await vsConfig.update('port', data.port, vscode.ConfigurationTarget.Global);
            await vsConfig.update('username', data.username, vscode.ConfigurationTarget.Global);
            if (data.privateKeyPath) {
                await vsConfig.update('privateKeyPath', data.privateKeyPath, vscode.ConfigurationTarget.Global);
            }

            // Restore remoteProjectDir to allow background polling immediately
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                let remoteBaseDir = vsConfig.get<string>('remoteBaseDir') || '~/Projekte';
                if (remoteBaseDir.startsWith('~/')) {
                    const homeResult = await this.sshManager.exec('echo $HOME');
                    const homeDir = homeResult.stdout.trim();
                    remoteBaseDir = remoteBaseDir.replace(/^~/, homeDir);
                }
                const projectName = path.basename(workspaceFolder.uri.fsPath);
                this.remoteProjectDir = `${remoteBaseDir}/${projectName}`;
            }

            this.postMessage({ type: 'log', message: '✅ Connected!' });
            vscode.window.showInformationMessage(`Connected to ${data.host}`);
        } catch (err: any) {
            this.postMessage({ type: 'log', message: `❌ Connection failed: ${err.message}` });
            vscode.window.showErrorMessage(`Connection failed: ${err.message}`);
        }
    }

    private async handleDisconnect(): Promise<void> {
        await this.sshManager.disconnect();
        this.postMessage({ type: 'log', message: 'Disconnected' });
        vscode.window.showInformationMessage('Disconnected from server');
    }

    private async handleDeploy(): Promise<void> {
        try {
            this.postMessage({ type: 'deployStatus', status: 'deploying' });

            const result = await this.deployer.deploy((msg) => {
                this.postMessage({ type: 'log', message: msg });
            });

            this.remoteProjectDir = result.remoteProjectDir;
            this.postMessage({ type: 'deployStatus', status: 'done', projectName: result.projectName });
            this.postMessage({ type: 'log', message: `✅ Deployed to ${result.remoteProjectDir}` });
            vscode.window.showInformationMessage(`Deployed "${result.projectName}" to server`);

            // Refresh output files
            await this.handleRefreshFiles();
        } catch (err: any) {
            this.postMessage({ type: 'deployStatus', status: 'error' });
            this.postMessage({ type: 'log', message: `❌ Deploy failed: ${err.message}` });
            vscode.window.showErrorMessage(`Deploy failed: ${err.message}`);
        }
    }

    private async handleRun(customCommand?: string): Promise<void> {
        if (!this.remoteProjectDir) {
            vscode.window.showErrorMessage('Please deploy first before running.');
            return;
        }

        try {
            this.postMessage({ type: 'log', message: 'Starting run...' });
            await this.runner.run(this.remoteProjectDir, customCommand);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Run failed: ${err.message}`);
            this.postMessage({ type: 'log', message: `Run failed: ${err.message}` });
        }
    }

    private async handleStop(): Promise<void> {
        try {
            await this.runner.stop(this.remoteProjectDir);
            this.postMessage({ type: 'log', message: 'Process stopped' });
        } catch (err: any) {
            vscode.window.showErrorMessage(`Stop failed: ${err.message}`);
        }
    }

    private async handlePullOutput(): Promise<void> {
        try {
            if (!this.remoteProjectDir) {
                vscode.window.showErrorMessage('Deploy first before pulling output!');
                return;
            }

            this.postMessage({ type: 'log', message: 'Pulling output files...' });

            const localDir = await this.outputManager.downloadAllOutput(
                this.remoteProjectDir,
                (msg) => this.postMessage({ type: 'log', message: msg })
            );

            vscode.window.showInformationMessage(`Output files downloaded to ${localDir}`);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Pull output failed: ${err.message}`);
        }
    }

    private async handleRefreshStatus(): Promise<void> {
        const status = await this.serverStatus.refresh();
        if (status) {
            this.postMessage({ type: 'serverStatus', data: status });
        }
    }

    private async handleRefreshFiles(): Promise<void> {
        if (!this.remoteProjectDir) { return; }

        try {
            const files = await this.outputManager.listOutputFiles(this.remoteProjectDir);
            const formattedFiles = files.map(f => ({
                ...f,
                sizeFormatted: this.outputManager.formatFileSize(f.size),
            }));
            this.postMessage({ type: 'outputFiles', files: formattedFiles });
        } catch (err) {
            // ignore
        }
    }

    private async handleDownloadFile(remotePath: string): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) { return; }

        try {
            const localOutputDir = path.join(workspaceFolder.uri.fsPath, 'sshserver_output');
            const localPath = await this.outputManager.downloadFile(remotePath, localOutputDir, (msg) => {
                this.postMessage({ type: 'log', message: msg });
            });
            vscode.window.showInformationMessage(`Downloaded to ${localPath}`);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Download failed: ${err.message}`);
        }
    }

    private postMessage(message: any): void {
        if (message.type === 'log') {
            const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            this.logs.push(`[${time}] ${message.message}`);
            if (this.logs.length > 50) {
                this.logs.shift();
            }
        }
        this.webviewView?.webview.postMessage(message);
    }

    private getHtmlContent(webview: vscode.Webview): string {
        const htmlPath = path.join(this.extensionUri.fsPath, 'media', 'sidebar.html');
        let html = fs.readFileSync(htmlPath, 'utf-8');
        return html;
    }

    public dispose(): void {
        // nothing
    }
}
