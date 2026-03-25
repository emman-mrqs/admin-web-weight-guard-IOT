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
import userMobileRoutes from "./src/routes/api/userMobileRoutes.js";
import userMobileAuthRoutes from "./src/routes/api/userMobileAuthRoutes.js";
// import { setWsConnections } from "./src/controller/api/locationController.js";
// import { setIncidentWsConnections } from "./src/controller/api/incidentController.js";
import { initTrackingWebSocket } from "./src/realtime/trackingWebSocket.js";
import passport from "passport";
import PassportConfig from './src/config/passport.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

 // Only if you're behind nginx/Heroku/etc.
 if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Import Middleware
import authMiddleware from "./src/middleware/auth.js";

// Express session Middleware 
app.use(authMiddleware.sessionMiddleware);
PassportConfig.initialize();
app.use(passport.initialize());
app.use(passport.session());
app.use((req, res, next) => {
    res.locals.currentAdmin = req.user || null;
    next();
});

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
// setWsConnections(wsConnections);
// setIncidentWsConnections(wsConnections); 

// ================ Declare Routes ===============
app.use("/", adminRoutes);
app.use("/", adminAuthRoutes);
app.use("/api/mobile", userMobileRoutes);
app.use("/api/mobile/auth", userMobileAuthRoutes);

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`WebSocket tracking available at server ${port}/ws/tracking`);
});