import express from 'express';
import UserMobileAuthController from '../../controller/api/userMobileAuthController.js';
import MobileJwtAuth from '../../middleware/mobileJwtAuth.js';

const router = express.Router();

router.post('/login', UserMobileAuthController.login);
router.get('/me', MobileJwtAuth.verify, UserMobileAuthController.me);
router.post('/change-password', MobileJwtAuth.verify, UserMobileAuthController.changePassword);


export default router;