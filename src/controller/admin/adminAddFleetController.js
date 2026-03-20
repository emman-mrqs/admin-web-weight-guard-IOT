// Admin Add Fleet Controller
import db from '../../database/db.js';

class AdminAddFleetController {
    static getAddFleet(req, res) {
        try {
            res.render("admin/adminAddFleet", {
                currentPage: "fleet"
            });
        } catch (error) {
            console.error("Error rendering add fleet page:", error);
            res.status(500).send("An error occurred while loading the add fleet page.");
        }
    }

    static async getAssignableDrivers(req, res) {
        try {
            const query = `
                SELECT
                    u.id,
                    u.first_name,
                    u.last_name,
                    u.email
                FROM users u
                WHERE u.status = 'active'
                  AND u.deleted_at IS NULL
                  AND NOT EXISTS (
                        SELECT 1
                        FROM vehicles v
                        WHERE v.assigned_driver_id = u.id
                  )
                ORDER BY u.first_name ASC, u.last_name ASC
            `;

            const result = await db.query(query);
            return res.status(200).json({ data: result.rows });
        } catch (error) {
            console.error("Error fetching assignable drivers:", error);
            return res.status(500).json({ error: "An error occurred while fetching assignable drivers." });
        }
    }

    static async createAddFleet(req, res) {
        try {
            const { vehicleType, plateNumber, maxCapacity, driverId } = req.body;
            const fieldErrors = {};

            const normalizedVehicleType = String(vehicleType || '').trim();
            const normalizedPlateNumber = String(plateNumber || '').trim().toUpperCase();
            const normalizedCapacity = Number(maxCapacity);
            const normalizedDriverId = driverId ? Number(driverId) : null;

            if (!normalizedVehicleType) {
                fieldErrors.vehicleType = 'Vehicle type is required.';
            }

            if (!normalizedPlateNumber) {
                fieldErrors.plateNumber = 'Plate number is required.';
            }

            if (!Number.isFinite(normalizedCapacity) || normalizedCapacity <= 0) {
                fieldErrors.maxCapacity = 'Max capacity must be greater than 0.';
            }

            if (normalizedPlateNumber) {
                const plateExistsResult = await db.query(
                    `SELECT id FROM vehicles WHERE UPPER(plate_number) = $1 LIMIT 1`,
                    [normalizedPlateNumber]
                );

                if (plateExistsResult.rows.length > 0) {
                    fieldErrors.plateNumber = 'Plate number already exists.';
                }
            }

            if (normalizedDriverId) {
                const driverResult = await db.query(
                    `
                        SELECT id, status, deleted_at
                        FROM users
                        WHERE id = $1
                        LIMIT 1
                    `,
                    [normalizedDriverId]
                );

                if (driverResult.rows.length === 0 || driverResult.rows[0].deleted_at) {
                    fieldErrors.driverId = 'Selected driver was not found.';
                } else if (driverResult.rows[0].status !== 'active') {
                    fieldErrors.driverId = 'Selected driver must be active.';
                } else {
                    const assignmentResult = await db.query(
                        `
                            SELECT id
                            FROM vehicles
                            WHERE assigned_driver_id = $1
                            LIMIT 1
                        `,
                        [normalizedDriverId]
                    );

                    if (assignmentResult.rows.length > 0) {
                        fieldErrors.driverId = 'Selected driver already has an assigned vehicle.';
                    }
                }
            }

            if (Object.keys(fieldErrors).length > 0) {
                return res.status(400).json({
                    error: 'Validation failed.',
                    fieldErrors
                });
            }

            const insertResult = await db.query(
                `
                    INSERT INTO vehicles (
                        assigned_driver_id,
                        vehicle_type,
                        plate_number,
                        max_capacity_kg,
                        current_state,
                        current_load_status
                    )
                    VALUES ($1, $2, $3, $4, 'available', 'empty')
                    RETURNING id, assigned_driver_id, vehicle_type, plate_number, max_capacity_kg, current_state, current_load_status, created_at
                `,
                [normalizedDriverId, normalizedVehicleType, normalizedPlateNumber, normalizedCapacity]
            );

            return res.status(201).json({
                message: 'Vehicle added successfully.',
                vehicle: insertResult.rows[0]
            });
        } catch (error) {
            console.error("Error creating vehicle:", error);
            return res.status(500).json({ error: "An error occurred while creating the vehicle." });
        }
    }
}

export default AdminAddFleetController;