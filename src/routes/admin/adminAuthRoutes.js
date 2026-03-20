import express from "express";

// Admin authentication routes
import AdminLoginController from "../../controller/auth/admin/loginController.js";
import SignUpUserController from "../../controller/auth/users/userSignupController.js";
import SignUpAdminController from "../../controller/auth/admin/signupController.js";
import UserVerificationController from "../../controller/auth/users/userVerificationController.js";
import VerificationController from "../../controller/auth/admin/verificationController.js";

const router = express.Router();


// Login Routes
router.get("/", AdminLoginController.getLogin);

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