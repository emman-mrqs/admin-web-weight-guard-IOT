// src/routes/api/userMobileRoutes.js
import express from 'express';
import MobileJwtAuth from '../../middleware/mobileJwtAuth.js';
import UserMobileDashboardController from '../../controller/api/userMobileDashboardController.js';
import UserMobileNotificationController from '../../controller/api/userMobileNotificationController.js';
import UserMobileTaskController from '../../controller/api/userMobileTaskController.js';
import UserMobileActivityController from '../../controller/api/userMobileActivityController.js';

const router = express.Router();

router.get('/dashboard', MobileJwtAuth.verify, UserMobileDashboardController.getDashboard);
router.get('/notifications', MobileJwtAuth.verify, UserMobileNotificationController.getInbox);
router.patch('/notifications/read-all', MobileJwtAuth.verify, UserMobileNotificationController.markAllAsRead);
router.get('/tasks/current', MobileJwtAuth.verify, UserMobileTaskController.getCurrentTask);
router.patch('/tasks/current/start', MobileJwtAuth.verify, UserMobileTaskController.startCurrentTask);
router.get('/activities', MobileJwtAuth.verify, UserMobileActivityController.getActivities);


export default router;