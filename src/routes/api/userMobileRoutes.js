// src/routes/api/userMobileRoutes.js
import express from 'express';
import MobileJwtAuth from '../../middleware/mobileJwtAuth.js';
import UserMobileDashboardController from '../../controller/api/userMobileDashboardController.js';

const router = express.Router();

router.get('/dashboard', MobileJwtAuth.verify, UserMobileDashboardController.getDashboard);


export default router;