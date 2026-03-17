import * as vscode from 'vscode';
import { SSHManager } from './sshManager';

export interface ServerStatusData {
    cpuUsage: number;        // percentage 0-100
    memoryUsed: number;      // MB
    memoryTotal: number;     // MB
    memoryPercent: number;   // percentage 0-100
    diskUsed: string;
    diskTotal: string;
    diskPercent: number;     // percentage 0-100
    uptime: string;
    hostname: string;
}

export class ServerStatus {
    private sshManager: SSHManager;
    private intervalId: NodeJS.Timeout | null = null;
    private statusData: ServerStatusData | null = null;

    private onUpdateEmitter = new vscode.EventEmitter<ServerStatusData>();
    public readonly onUpdate = this.onUpdateEmitter.event;

    constructor() {
        this.sshManager = SSHManager.getInstance();
    }

    public startMonitoring(intervalMs: number = 5000): void {
        this.stopMonitoring();
        this.refresh(); // Initial fetch

        this.intervalId = setInterval(() => {
            this.refresh();
        }, intervalMs);
    }

    public stopMonitoring(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    public async refresh(): Promise<ServerStatusData | null> {
        if (!this.sshManager.isConnected()) {
            return null;
        }

        try {
            const result = await this.sshManager.exec(`
                echo "===HOSTNAME==="
                hostname
                echo "===UPTIME==="
                uptime -p 2>/dev/null || uptime
                echo "===CPU==="
                top -bn1 | grep "Cpu(s)" | awk '{print $2}' 2>/dev/null || echo "0"
                echo "===MEMORY==="
                free -m | grep Mem
                echo "===DISK==="
                df -h / | tail -1
            `);

            const output = result.stdout;
            const status: ServerStatusData = {
                cpuUsage: 0,
                memoryUsed: 0,
                memoryTotal: 0,
                memoryPercent: 0,
                diskUsed: '0',
                diskTotal: '0',
                diskPercent: 0,
                uptime: '',
                hostname: '',
            };

            // Parse hostname
            const hostnameMatch = output.split('===HOSTNAME===')[1]?.split('===')[0]?.trim();
            status.hostname = hostnameMatch || 'Unknown';

            // Parse uptime
            const uptimeMatch = output.split('===UPTIME===')[1]?.split('===')[0]?.trim();
            status.uptime = uptimeMatch || 'Unknown';

            // Parse CPU
            const cpuSection = output.split('===CPU===')[1]?.split('===')[0]?.trim();
            if (cpuSection) {
                const cpuVal = parseFloat(cpuSection);
                status.cpuUsage = isNaN(cpuVal) ? 0 : Math.round(cpuVal);
            }

            // Parse memory
            const memSection = output.split('===MEMORY===')[1]?.split('===')[0]?.trim();
            if (memSection) {
                const memParts = memSection.split(/\s+/);
                if (memParts.length >= 3) {
                    status.memoryTotal = parseInt(memParts[1]) || 0;
                    status.memoryUsed = parseInt(memParts[2]) || 0;
                    if (status.memoryTotal > 0) {
                        status.memoryPercent = Math.round((status.memoryUsed / status.memoryTotal) * 100);
                    }
                }
            }

            // Parse disk
            const diskSection = output.split('===DISK===')[1]?.trim();
            if (diskSection) {
                const diskParts = diskSection.split(/\s+/);
                if (diskParts.length >= 5) {
                    status.diskTotal = diskParts[1] || '0';
                    status.diskUsed = diskParts[2] || '0';
                    const percentStr = diskParts[4]?.replace('%', '') || '0';
                    status.diskPercent = parseInt(percentStr) || 0;
                }
            }

            this.statusData = status;
            this.onUpdateEmitter.fire(status);
            return status;
        } catch (err) {
            return null;
        }
    }

    public getLastStatus(): ServerStatusData | null {
        return this.statusData;
    }

    public dispose(): void {
        this.stopMonitoring();
        this.onUpdateEmitter.dispose();
    }
}
