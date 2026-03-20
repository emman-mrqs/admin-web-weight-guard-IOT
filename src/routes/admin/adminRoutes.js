import express from 'express';

// Import Individual Admin Controllers
import AdminDashboardController from '../../controller/admin/adminDashboardController.js';
import AdminFleetController from '../../controller/admin/adminFleetController.js';
import AdminAddFleetController from '../../controller/admin/adminAddFleetController.js';
import AdminFleetMapsController from '../../controller/admin/adminFleetMapsController.js';
import AdminUserController from '../../controller/admin/adminUserController.js';
import AdminStaffController from '../../controller/admin/adminStaffController.js';
import AdminDispatchController from '../../controller/admin/adminDispatchController.js';
import AdminReportsController from '../../controller/admin/adminReportController.js';
import AdminIncidentsController from '../../controller/admin/adminIncidentsController.js';
import AdminNotificationController from '../../controller/admin/adminNotificationController.js';
import AdminSettingsController from '../../controller/admin/adminSettingsController.js';
import AdminAuditLogsController from '../../controller/admin/adminAuditLogsController.js';

const router = express.Router();

// Admin Dashboard Routes
router.get("/admin", AdminDashboardController.getDashboard);

// Admin Fleet Routes
router.get("/admin/fleet", AdminFleetController.getFleet);
router.get("/admin/fleet/add", AdminAddFleetController.getAddFleet);

// Admin Fleet Maps Routes
router.get("/admin/fleet-maps", AdminFleetMapsController.getFleetMaps);

// Admin User Routes
router.get("/admin/users", AdminUserController.getUsers);

// Admin Staff Routes
router.get("/admin/staff", AdminStaffController.getStaffList);

// Admin Task Dispatch Routes
router.get("/admin/task-dispatch", AdminDispatchController.getTaskDispatch);

// Admin Reports Routes
router.get("/admin/reports", AdminReportsController.getReports);

// Admin Incidents Routes
router.get("/admin/incidents", AdminIncidentsController.getIncidents);

// Admin Notifications Routes
router.get("/admin/notifications", AdminNotificationController.getNotifications);

// Admin Settings Routes
router.get("/admin/settings", AdminSettingsController.getSettings);

// Admin Audit Logs Routes
router.get("/admin/audit-logs", AdminAuditLogsController.getAuditLogs);

export default router;
