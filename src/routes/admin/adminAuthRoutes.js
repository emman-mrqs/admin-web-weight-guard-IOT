import express from "express";

// Admin authentication routes
import AdminLoginController from "../../controller/auth/admin/loginController.js";

const router = express.Router();


// Login Routes
router.get("/", AdminLoginController.getLogin);


export default router;