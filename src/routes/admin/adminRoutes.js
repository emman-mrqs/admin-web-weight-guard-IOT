import express from 'express';

// Import Individual Admin Controllers
import AdminDashboardController from '../../controller/admin/adminDashboardController.js';
import AdminFleetController from '../../controller/admin/adminFleetController.js';
import AdminAddFleetController from '../../controller/admin/adminAddFleetController.js';
import AdminIncidentsController from '../../controller/admin/adminIncidentsController.js';
import AdminUserController from '../../controller/admin/adminUserController.js';
import AdminReportsController from '../../controller/admin/adminReportController.js';
import AdminSettingsController from '../../controller/admin/adminSettingsController.js';

const router = express.Router();

// Admin Dashboard Routes
router.get("/admin", AdminDashboardController.getDashboard);

// Admin Fleet Routes
router.get("/admin/fleet", AdminFleetController.getFleet);
router.get("/admin/fleet/add", AdminAddFleetController.getAddFleet);

// Admin Incidents Routes
router.get("/admin/incidents", AdminIncidentsController.getIncidents);
router.get("/admin/incidents/fetch", AdminIncidentsController.fetchIncidents);
router.get("/admin/incidents/stats", AdminIncidentsController.getIncidentStats);
router.get("/admin/incidents/active-locations", AdminIncidentsController.getActiveIncidentLocations);
router.get("/admin/incidents/:id", AdminIncidentsController.getIncidentById);
router.patch("/admin/incidents/:id/status", AdminIncidentsController.updateIncidentStatus);
router.delete("/admin/incidents/:id", AdminIncidentsController.deleteIncident);
router.get("/admin/cargo-manifest/:assignmentId", AdminIncidentsController.getCargoManifest);

// Admin Users Routes
router.get("/admin/users", AdminUserController.getUsers);
router.get("/admin/users/fetch", AdminUserController.fetchUsers);
router.get("/admin/users/available-drivers", AdminUserController.fetchAvailableDrivers);
router.post("/admin/users", AdminUserController.createUser);
router.put("/admin/users/:id", AdminUserController.updateUser);
router.delete("/admin/users/:id", AdminUserController.deleteUser);

// Admin Assignments Routes
router.get("/admin/assignments", AdminUserController.fetchAssignments);
router.post("/admin/assignments", AdminUserController.assignTaskToUser);
router.put("/admin/assignments/:id", AdminUserController.updateAssignment);
router.delete("/admin/assignments/:id", AdminUserController.deleteAssignment);

// Admin Reports Routes
router.get("/admin/reports", AdminReportsController.getReports);

// Admin Settings Routes
router.get("/admin/settings", AdminSettingsController.getSettings);


export default router;
