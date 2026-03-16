// Admin Incidents Controller
// Admin Controller for managing incidents and viewing incident data
import db from '../../database/db.js';

class AdminIncidentsController {
    /**
     * GET /admin/incidents
     * Render the incidents page
     */
    static async getIncidents(req, res) {
        try {
            res.render("admin/adminIncidents", {
                currentPage: "incidents"
            });
        } catch (error) {
            console.error('[AdminIncidentsController] getIncidents error:', error);
            res.status(500).send('Server error');
        }
    }

    /**
     * GET /admin/incidents/fetch
     * Fetch all incidents with filtering options
     * Query: ?status=open&type=cargo_loss&severity=critical&limit=50
     */
    static async fetchIncidents(req, res) {
        try {
            const { status, type, severity, limit = 100 } = req.query;

            let query = `
                SELECT 
                    i.*,
                    u.full_name as driver_name,
                    u.email as driver_email,
                    a.vehicle_number,
                    a.pickup_address,
                    a.dest_address
                FROM incidents i
                LEFT JOIN users u ON i.user_id = u.id
                LEFT JOIN assignments a ON i.assignment_id = a.id
                WHERE 1=1
            `;
            const params = [];
            let paramIndex = 1;

            if (status) {
                query += ` AND i.status = $${paramIndex++}`;
                params.push(status);
            }

            if (type) {
                query += ` AND i.incident_type = $${paramIndex++}`;
                params.push(type);
            }

            if (severity) {
                query += ` AND i.severity = $${paramIndex++}`;
                params.push(severity);
            }

            query += ` ORDER BY i.created_at DESC LIMIT $${paramIndex}`;
            params.push(parseInt(limit));

            const result = await db.query(query, params);

            res.json({
                success: true,
                count: result.rows.length,
                incidents: result.rows
            });
        } catch (error) {
            console.error('[AdminIncidentsController] fetchIncidents error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch incidents' });
        }
    }

    /**
     * GET /admin/incidents/:id
     * Get single incident details with full info
     */
    static async getIncidentById(req, res) {
        try {
            const { id } = req.params;

            const result = await db.query(
                `SELECT 
                    i.*,
                    u.full_name as driver_name,
                    u.email as driver_email,
                    a.vehicle_number,
                    a.pickup_lat, a.pickup_lng, a.pickup_address,
                    a.dest_lat, a.dest_lng, a.dest_address,
                    cm.initial_weight_kg as manifest_weight,
                    cm.cargo_description,
                    cm.item_count,
                    cm.max_allowed_kg
                FROM incidents i
                LEFT JOIN users u ON i.user_id = u.id
                LEFT JOIN assignments a ON i.assignment_id = a.id
                LEFT JOIN cargo_manifest cm ON i.assignment_id = cm.assignment_id
                WHERE i.id = $1`,
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Incident not found' });
            }

            // Get weight readings for this assignment (for timeline)
            const weightReadings = await db.query(
                `SELECT weight_kg, latitude, longitude, recorded_at
                 FROM weight_readings
                 WHERE assignment_id = $1
                 ORDER BY recorded_at ASC`,
                [result.rows[0].assignment_id]
            );

            res.json({
                success: true,
                incident: result.rows[0],
                weightTimeline: weightReadings.rows
            });
        } catch (error) {
            console.error('[AdminIncidentsController] getIncidentById error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch incident' });
        }
    }

    /**
     * PATCH /admin/incidents/:id/status
     * Update incident status
     * Body: { status: 'open' | 'acknowledged' | 'investigating' | 'resolved' | 'false_alarm', 
     *         resolution_notes?: string }
     */
    static async updateIncidentStatus(req, res) {
        try {
            const { id } = req.params;
            const { status, resolution_notes } = req.body;

            const validStatuses = ['open', 'acknowledged', 'investigating', 'resolved', 'false_alarm'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
                });
            }

            let query = `UPDATE incidents SET status = $1`;
            const params = [status];
            let paramIndex = 2;

            // Set acknowledged_at when status changes to acknowledged
            if (status === 'acknowledged') {
                query += `, acknowledged_at = CURRENT_TIMESTAMP`;
            }

            // Set resolved_at when status is resolved or false_alarm
            if (status === 'resolved' || status === 'false_alarm') {
                query += `, resolved_at = CURRENT_TIMESTAMP`;
                if (resolution_notes) {
                    query += `, resolution_notes = $${paramIndex++}`;
                    params.push(resolution_notes);
                }
            }

            query += ` WHERE id = $${paramIndex} RETURNING *`;
            params.push(id);

            const result = await db.query(query, params);

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Incident not found' });
            }

            res.json({
                success: true,
                message: `Incident status updated to ${status}`,
                incident: result.rows[0]
            });
        } catch (error) {
            console.error('[AdminIncidentsController] updateIncidentStatus error:', error);
            res.status(500).json({ success: false, error: 'Failed to update incident status' });
        }
    }

    /**
     * GET /admin/incidents/stats
     * Get incident statistics for dashboard
     */
    static async getIncidentStats(req, res) {
        try {
            // Count by status
            const statusStats = await db.query(
                `SELECT status, COUNT(*) as count
                 FROM incidents
                 GROUP BY status`
            );

            // Count by type
            const typeStats = await db.query(
                `SELECT incident_type, COUNT(*) as count
                 FROM incidents
                 GROUP BY incident_type`
            );

            // Count by severity (open incidents only)
            const severityStats = await db.query(
                `SELECT severity, COUNT(*) as count
                 FROM incidents
                 WHERE status = 'open'
                 GROUP BY severity`
            );

            // Recent 24h incidents
            const recentCount = await db.query(
                `SELECT COUNT(*) as count
                 FROM incidents
                 WHERE created_at > NOW() - INTERVAL '24 hours'`
            );

            res.json({
                success: true,
                stats: {
                    byStatus: statusStats.rows,
                    byType: typeStats.rows,
                    bySeverity: severityStats.rows,
                    last24Hours: parseInt(recentCount.rows[0].count)
                }
            });
        } catch (error) {
            console.error('[AdminIncidentsController] getIncidentStats error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch incident stats' });
        }
    }

    /**
     * GET /admin/incidents/active-locations
     * Get all open incidents with location data (for map display)
     */
    static async getActiveIncidentLocations(req, res) {
        try {
            const result = await db.query(
                `SELECT 
                    i.id, i.incident_type, i.severity, i.description,
                    i.latitude, i.longitude, i.created_at,
                    i.initial_weight_kg, i.current_weight_kg, i.weight_difference_kg,
                    u.full_name as driver_name,
                    a.vehicle_number
                FROM incidents i
                LEFT JOIN users u ON i.user_id = u.id
                LEFT JOIN assignments a ON i.assignment_id = a.id
                WHERE i.status IN ('open', 'acknowledged', 'investigating')
                    AND i.latitude IS NOT NULL
                    AND i.longitude IS NOT NULL
                ORDER BY 
                    CASE i.severity 
                        WHEN 'critical' THEN 1 
                        WHEN 'warning' THEN 2 
                        ELSE 3 
                    END,
                    i.created_at DESC`
            );

            res.json({
                success: true,
                count: result.rows.length,
                incidents: result.rows
            });
        } catch (error) {
            console.error('[AdminIncidentsController] getActiveIncidentLocations error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch incident locations' });
        }
    }

    /**
     * DELETE /admin/incidents/:id
     * Delete an incident (admin only, for false alarms or testing)
     */
    static async deleteIncident(req, res) {
        try {
            const { id } = req.params;

            const result = await db.query(
                `DELETE FROM incidents WHERE id = $1 RETURNING id`,
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Incident not found' });
            }

            res.json({
                success: true,
                message: 'Incident deleted',
                deletedId: result.rows[0].id
            });
        } catch (error) {
            console.error('[AdminIncidentsController] deleteIncident error:', error);
            res.status(500).json({ success: false, error: 'Failed to delete incident' });
        }
    }

    /**
     * GET /admin/cargo-manifest/:assignmentId
     * Get cargo manifest for an assignment
     */
    static async getCargoManifest(req, res) {
        try {
            const { assignmentId } = req.params;

            const result = await db.query(
                `SELECT cm.*, a.vehicle_number, u.full_name as driver_name
                 FROM cargo_manifest cm
                 LEFT JOIN assignments a ON cm.assignment_id = a.id
                 LEFT JOIN users u ON a.driver_id = u.id
                 WHERE cm.assignment_id = $1`,
                [assignmentId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Cargo manifest not found' });
            }

            res.json({
                success: true,
                manifest: result.rows[0]
            });
        } catch (error) {
            console.error('[AdminIncidentsController] getCargoManifest error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch cargo manifest' });
        }
    }
}

export default AdminIncidentsController;