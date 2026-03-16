//=============== Import Npms ===============
import express from "express";                    
import bodyParser from "body-parser";
import { createServer } from "http";

// =========== Import Controllers =============
import { dirname, join } from "path";
import { fileURLToPath } from "url";

//======================== Import Routes =========================
import adminRoutes from "./src/routes/admin/adminRoutes.js";
import adminAuthRoutes from "./src/routes/admin/adminAuthRoutes.js";
import locationRoutes from "./src/routes/api/locationRoutes.js";
import driverRoutes from "./src/routes/api/driverRoutes.js";
import incidentRoutes from "./src/routes/api/incidentRoutes.js";
import { setWsConnections } from "./src/controller/api/locationController.js";
import { setIncidentWsConnections } from "./src/controller/api/incidentController.js";
import { initTrackingWebSocket } from "./src/realtime/trackingWebSocket.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

 // Only if you're behind nginx/Heroku/etc.
 if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Import Middleware
// this is where you would import any custom middleware, e.g. for authentication, logging, etc.

// Express session Middleware 
// This is where you would set up express-session if you were using it for authentication/session management. 

// Create HTTP server for both Express and WebSocket
const server = createServer(app);
const { wsConnections } = initTrackingWebSocket(server);

// Tell Express where the View folder 
app.set("views", join(__dirname, "src", "views")); // Views Folder
app.set("view engine", "ejs");

//Public Folder
app.use(express.static(join(__dirname, "src", "public")));

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Pass WebSocket connections to controllers
setWsConnections(wsConnections);
setIncidentWsConnections(wsConnections);

// ================ Declare Routes ===============
app.use("/", adminRoutes);
app.use("/", adminAuthRoutes);
app.use("/api", locationRoutes);
app.use("/api", incidentRoutes);
app.use("/api/driver", driverRoutes);


server.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`WebSocket tracking available at server ${port}/ws/tracking`);
});