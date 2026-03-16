//Import NPM
import express from "express";                    
import bodyParser from "body-parser";
import { createServer } from "http";
import { WebSocketServer } from "ws";

import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

// Create HTTP server for both Express and WebSocket
const server = createServer(app);

// WebSocket Server Setup for real-time GPS tracking
const wss = new WebSocketServer({ server, path: '/ws/tracking' });

// Store active WebSocket connections
const wsConnections = new Map();
let connectionIdCounter = 0;

wss.on('connection', (ws, req) => {
    const connectionId = ++connectionIdCounter;
    wsConnections.set(connectionId, ws);
    
    console.log(`[WebSocket] Client ${connectionId} connected. Total: ${wsConnections.size}`);
    
    // Send welcome message
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

// Tell Express where the View folder 
app.set("views", join(__dirname, "src", "views")); // Views Folder
app.set("view engine", "ejs");

//Public Folder
app.use(express.static(join(__dirname, "src", "public")));

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


// Attach user to views
// app.use(attachUserToViews);

//Import Routes
import adminRoutes from "./src/routes/admin/adminRoutes.js";
import locationRoutes from "./src/routes/api/locationRoutes.js";
import driverRoutes from "./src/routes/api/driverRoutes.js";
import incidentRoutes from "./src/routes/api/incidentRoutes.js";
import { setWsConnections } from "./src/controller/api/locationController.js";
import { setIncidentWsConnections } from "./src/controller/api/incidentController.js";

// Pass WebSocket connections to controllers
setWsConnections(wsConnections);
setIncidentWsConnections(wsConnections);

//Auth Routes (simplified to direct routes)
app.use("/", adminRoutes);

// API Routes for GPS tracking (Arduino devices)
app.use("/api", locationRoutes);

// API Routes for Weight & Incident tracking (Arduino devices)
app.use("/api", incidentRoutes);

// API Routes for Driver Mobile App
app.use("/api/driver", driverRoutes);


server.listen(port, () => {
    console.log(`Backend server is running on http://localhost:${port}`);
    console.log(`WebSocket tracking available at ws://localhost:${port}/ws/tracking`);
});