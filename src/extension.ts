import * as vscode from 'vscode';
import { SSHManager } from './sshManager';
import { Deployer } from './deployer';
import { RemoteRunner } from './remoteRunner';
import { OutputManager } from './outputManager';
import { ServerStatus } from './serverStatus';
import { SidebarProvider } from './views/sidebarProvider';

let sshManager: SSHManager;
let deployer: Deployer;
let runner: RemoteRunner;
let outputManager: OutputManager;
let serverStatus: ServerStatus;

export function activate(context: vscode.ExtensionContext) {
    console.log('SSH Server Deploy extension is now active');

    // Initialize services
    sshManager = SSHManager.getInstance();
    deployer = new Deployer();
    runner = new RemoteRunner();
    outputManager = new OutputManager();
    serverStatus = new ServerStatus();

    // Register sidebar
    const sidebarProvider = new SidebarProvider(
        context.extensionUri,
        deployer,
        runner,
        outputManager,
        serverStatus
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            SidebarProvider.viewType,
            sidebarProvider
        )
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('sshServer.connect', async () => {
            const config = vscode.workspace.getConfiguration('sshServer');
            const host = config.get<string>('host');
            const username = config.get<string>('username');

            if (!host || !username) {
                vscode.window.showWarningMessage('Please configure SSH host and username in the sidebar or settings.');
                return;
            }

            try {
                await sshManager.connect({
                    host,
                    port: config.get<number>('port') || 22,
                    username,
                    privateKeyPath: config.get<string>('privateKeyPath'),
                });
                vscode.window.showInformationMessage(`Connected to ${host}`);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Connection failed: ${err.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sshServer.disconnect', async () => {
            await sshManager.disconnect();
            vscode.window.showInformationMessage('Disconnected from server');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sshServer.deploy', async () => {
            if (!sshManager.isConnected()) {
                vscode.window.showWarningMessage('Not connected. Please connect first.');
                return;
            }

            try {
                const result = await deployer.deploy((msg) => {
                    vscode.window.setStatusBarMessage(`SSH Deploy: ${msg}`, 3000);
                });
                vscode.window.showInformationMessage(`Deployed "${result.projectName}" to server`);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Deploy failed: ${err.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sshServer.run', async () => {
            if (!sshManager.isConnected()) {
                vscode.window.showWarningMessage('Not connected. Please connect first.');
                return;
            }

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const config = vscode.workspace.getConfiguration('sshServer');
            const remoteBaseDir = config.get<string>('remoteBaseDir') || '~/Projekte';
            const projectName = require('path').basename(workspaceFolder.uri.fsPath);
            const remoteProjectDir = `${remoteBaseDir}/${projectName}`;

            try {
                await runner.run(remoteProjectDir);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Run failed: ${err.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sshServer.stop', async () => {
            await runner.stop();
            vscode.window.showInformationMessage('Process stopped');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sshServer.pullOutput', async () => {
            if (!sshManager.isConnected()) {
                vscode.window.showWarningMessage('Not connected. Please connect first.');
                return;
            }

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const config = vscode.workspace.getConfiguration('sshServer');
            const remoteBaseDir = config.get<string>('remoteBaseDir') || '~/Projekte';
            const projectName = require('path').basename(workspaceFolder.uri.fsPath);
            const remoteProjectDir = `${remoteBaseDir}/${projectName}`;

            try {
                await outputManager.downloadAllOutput(remoteProjectDir, (msg) => {
                    vscode.window.setStatusBarMessage(`SSH: ${msg}`, 3000);
                });
                vscode.window.showInformationMessage('Output files downloaded');
            } catch (err: any) {
                vscode.window.showErrorMessage(`Pull output failed: ${err.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sshServer.refreshStatus', async () => {
            await serverStatus.refresh();
        })
    );

    // Status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(plug) SSH: Offline';
    statusBarItem.tooltip = 'SSH Server Deploy';
    statusBarItem.command = 'sshServer.connect';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    sshManager.onStatusChange((connected) => {
        if (connected) {
            const config = sshManager.getConfig();
            statusBarItem.text = `$(plug) SSH: ${config?.host || 'Connected'}`;
            statusBarItem.command = 'sshServer.disconnect';
        } else {
            statusBarItem.text = '$(plug) SSH: Offline';
            statusBarItem.command = 'sshServer.connect';
        }
    });
}

export function deactivate() {
    sshManager?.dispose();
    runner?.dispose();
    serverStatus?.dispose();
}
