import express from "express";

// Admin authentication routes
import AdminLoginController from "../../controller/auth/auth/loginController.js";
import AdminForgetPasswordController from "../../controller/auth/auth/forgetPasswordController.js";
import SignUpUserController from "../../controller/auth/users/userSignupController.js";
import SignUpAdminController from "../../controller/auth/admin/signupController.js";
import UserVerificationController from "../../controller/auth/users/userVerificationController.js";
import VerificationController from "../../controller/auth/admin/verificationController.js";
import authMiddleware from "../../middleware/auth.js";

const router = express.Router();


// Login Routes
router.get("/", authMiddleware.redirectIfAuthenticated, AdminLoginController.getLogin);
router.post("/login", AdminLoginController.handleLogin);
router.post("/logout", authMiddleware.ensureAuthenticated, AdminLoginController.handleLogout);

// Forget Password Routes
router.get("/forget-password", authMiddleware.redirectIfAuthenticated, AdminForgetPasswordController.getForgetPassword);
router.post('/forget-password/send-code', AdminForgetPasswordController.sendResetCode);
router.post('/forget-password/verify-code', AdminForgetPasswordController.verifyResetCode);
router.post('/forget-password/reset-password', AdminForgetPasswordController.resetPassword);

// ============ SignUp Routes =============
// (Users) 
router.post("/users/signup", SignUpUserController.handleUserSignUp);

// (Admin Staff, Dispatch Staff) 
router.post("/admin/signup", SignUpAdminController.handleAdminSignUp);

// ============ Verification Routes ============
// (Users) //
router.post("/users/verify", UserVerificationController.handleUserVerification);
router.post("/users/resend-verification", UserVerificationController.handleResendUserVerification);

// (Admin Staff, Dispatch Staff)
router.post("/admin/verify", VerificationController.handleVerification);
router.post("/admin/resend-verification", VerificationController.handleResendVerification);


export default router;