// Fleet Maps Controller for Admin Panel
import db from '../../database/db.js';

const VEHICLE_CLASSES = [
    { value: 'Trailer Truck', label: 'Trailer Truck', description: 'Class 8 heavy duty' },
    { value: 'Flatbed Truck', label: 'Flatbed Truck', description: 'Class 7-8 heavy duty' },
    { value: 'Reefer Box Truck', label: 'Reefer Box Truck', description: 'Class 6-7 medium duty' },
    { value: 'Small Truck', label: 'Small Truck', description: 'Class 3-4 light duty' },
    { value: 'Box Truck', label: 'Box Truck', description: 'General cargo hauler' }
];


class AdminFleetMapsController {
    static async getFleetMaps(req, res) {
        try {
            res.render('admin/adminFleetMaps', { 
                currentPage: 'fleet-maps',
                vehicleClasses: VEHICLE_CLASSES
            });

        } catch (error) {
            console.error('Error fetching fleet maps:', error);
            res.status(500).send('Error fetching fleet maps');
        }
    }

    static async getFleetMapLiveData(req, res) {
        try {
            const result = await db.query(
                `
                    SELECT
                        v.id AS vehicle_id,
                        COALESCE(v.plate_number, CONCAT('V-', v.id::text)) AS plate_number,
                        COALESCE(v.vehicle_type, 'Vehicle') AS vehicle_type,
                        COALESCE(v.current_load_status, 'normal') AS current_load_status,
                        COALESCE(v.current_state, 'idle') AS current_state,
                        COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), 'Unassigned') AS driver_name,
                        vls.current_latitude,
                        vls.current_longitude,
                        COALESCE(vls.current_speed_kmh, 0) AS current_speed_kmh,
                        vls.last_ping_at
                    FROM vehicles v
                    LEFT JOIN users u ON u.id = v.assigned_driver_id
                    LEFT JOIN vehicle_live_state vls ON vls.vehicle_id = v.id
                    ORDER BY v.id ASC
                `
            );

            const data = result.rows
                .filter((row) => row.current_latitude !== null && row.current_longitude !== null)
                .map((row) => ({
                    vehicleId: Number(row.vehicle_id),
                    plateNumber: String(row.plate_number),
                    vehicleType: String(row.vehicle_type),
                    driverName: String(row.driver_name),
                    status: String(row.current_load_status || 'normal').toLowerCase() === 'overload' ? 'overload' : 'in_transit',
                    currentState: String(row.current_state || 'idle').toLowerCase(),
                    latitude: Number(row.current_latitude),
                    longitude: Number(row.current_longitude),
                    speedKmh: Number(row.current_speed_kmh || 0),
                    lastPingAt: row.last_ping_at
                }));

            return res.status(200).json({ data });
        } catch (error) {
            console.error('Error fetching fleet map live data:', error);
            return res.status(500).json({
                error: 'An error occurred while fetching live fleet map data.'
            });
        }
    }

    static async getFleetMapTasks(req, res) {
        try {
            const vehicleType = String(req.query.vehicleType || '').trim();

            if (!vehicleType) {
                return res.status(200).json({ data: [] });
            }

            const result = await db.query(
                `
                    SELECT
                        dt.id AS assignment_id,
                        LOWER(COALESCE(dt.status, 'pending')) AS assignment_status,
                        dt.created_at,
                        dt.started_at,
                        v.id AS vehicle_id,
                        v.plate_number,
                        v.vehicle_type,
                        COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), 'Unassigned') AS driver_name,
                        dt.pickup_lat,
                        dt.pickup_lng,
                        dt.destination_lat,
                        dt.destination_lng
                    FROM dispatch_tasks dt
                    INNER JOIN vehicles v ON v.id = dt.vehicle_id
                    LEFT JOIN users u ON u.id = v.assigned_driver_id
                    WHERE LOWER(COALESCE(v.vehicle_type, '')) = LOWER($1)
                      AND LOWER(COALESCE(dt.status, '')) IN ('pending', 'active', 'in_transit')
                    ORDER BY
                        CASE LOWER(COALESCE(dt.status, ''))
                            WHEN 'active' THEN 0
                            WHEN 'in_transit' THEN 1
                            WHEN 'pending' THEN 2
                            ELSE 3
                        END,
                        dt.created_at DESC,
                        dt.id DESC
                    LIMIT 50
                `,
                [vehicleType]
            );

            const data = result.rows.map((row) => ({
                assignmentId: Number(row.assignment_id),
                vehicleId: Number(row.vehicle_id),
                vehicleType: String(row.vehicle_type || 'Vehicle'),
                plateNumber: String(row.plate_number || `V-${row.vehicle_id}`),
                driverName: String(row.driver_name || 'Unassigned'),
                assignmentStatus: String(row.assignment_status || 'pending'),
                pickupLatitude: row.pickup_lat === null ? null : Number(row.pickup_lat),
                pickupLongitude: row.pickup_lng === null ? null : Number(row.pickup_lng),
                destinationLatitude: row.destination_lat === null ? null : Number(row.destination_lat),
                destinationLongitude: row.destination_lng === null ? null : Number(row.destination_lng),
                pickupLabel: [row.pickup_lat, row.pickup_lng].every((value) => value !== null)
                    ? `${Number(row.pickup_lat).toFixed(8)}, ${Number(row.pickup_lng).toFixed(8)}`
                    : 'Pickup not set',
                destinationLabel: [row.destination_lat, row.destination_lng].every((value) => value !== null)
                    ? `${Number(row.destination_lat).toFixed(8)}, ${Number(row.destination_lng).toFixed(8)}`
                    : 'Destination not set',
                createdAt: row.created_at,
                startedAt: row.started_at
            }));

            return res.status(200).json({ data });
        } catch (error) {
            console.error('Error fetching fleet map task data:', error);
            return res.status(500).json({
                error: 'An error occurred while fetching fleet map task data.'
            });
        }
    }
}

export default AdminFleetMapsController;