import { WebSocketServer } from 'ws';

/**
 * Initialize the tracking WebSocket server and connection registry.
 * Returns the shared connection map used by controllers for broadcasts.
 */
export function initTrackingWebSocket(server) {
    const wss = new WebSocketServer({ server, path: '/ws/tracking' });

    const wsConnections = new Map();
    let connectionIdCounter = 0;

    wss.on('connection', (ws) => {
        const connectionId = ++connectionIdCounter;
        wsConnections.set(connectionId, ws);

        console.log(`[WebSocket] Client ${connectionId} connected. Total: ${wsConnections.size}`);

        ws.send(JSON.stringify({
            type: 'connected',
            message: 'Real-time GPS tracking connected',
            connectionId
        }));

        ws.on('close', () => {
            wsConnections.delete(connectionId);
            console.log(`[WebSocket] Client ${connectionId} disconnected. Total: ${wsConnections.size}`);
        });

        ws.on('error', (error) => {
            console.error(`[WebSocket] Error on client ${connectionId}:`, error);
            wsConnections.delete(connectionId);
        });
    });

    return { wss, wsConnections };
}
