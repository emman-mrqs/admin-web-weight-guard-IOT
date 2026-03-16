// Admin User Controller
import db from "../../database/db.js"
import bcrypt from "bcrypt";

class AdminUserController {
    static getUsers (req, res) {
        try {
            res.render("admin/adminUser", {
                currentPage: "user"
            });
        } catch (error) {
            console.error(error);
        }
    }

    static async fetchUsers (req, res) {
        try {
            const result = await db.query(`
                SELECT 
                    u.id, 
                    u.full_name, 
                    u.email, 
                    u.status, 
                    u.created_at,
                    a.id as assignment_id,
                    a.vehicle_number,
                    a.status as assignment_status,
                    a.distance_km,
                    a.est_duration_min,
                    a.pickup_lat,
                    a.pickup_lng,
                    a.dest_lat,
                    a.dest_lng,
                    a.created_at as assigned_at
                FROM users u
                LEFT JOIN assignments a ON u.id = a.driver_id AND a.status IN ('pending', 'active')
                ORDER BY u.created_at DESC
            `);
            // Send user data as JSON
            res.status(200).json({ users: result.rows});

            // console.log("Fetched users:", result.rows);
        } catch (error) {
            console.error("Error fetching users:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    }

    static async createUser (req, res) {
        // Implementation for creating a user
        try {
            const { firstName, lastName, email, password, confirmPassword, vehicle } = req.body;

            // Basic Validation
            if (!firstName || !lastName || !email || !password || !confirmPassword) {
                return res.status(400).json({ error: "All fields are required" });
            } 

            // Email format validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; 
            if (!emailRegex.test(email)) {
                return res.status(400).json({ error: "Invalid email format" });
            }

            if(password.length < 8) {
                return res.status(400).json({ error: "Password must be at least 8 characters long" });
            }

            if (password !== confirmPassword) {
                return res.status(400).json({ error: "Passwords do not match" });
            }       
    
            // Check if email already exists
            const checkQuery = `SELECT * FROM users WHERE email = $1`;
            const existingUser = await db.query(checkQuery, [email]);

            if (existingUser.rows.length > 0) {
                return res.status(400).json({ error: "Email is already registered" });
            }

            // Combine first and last name
            const fullName = `${firstName} ${lastName}`;

            // Hash the password
            const saltRounds = 12;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Create new user
            const createQuery = `
                INSERT INTO users (full_name, email, password, status, created_at, updated_at)
                VALUES ($1, $2, $3, 'active', NOW(), NOW())
                RETURNING id
            `;

            const result = await db.query(createQuery, [fullName, email, hashedPassword]);
            const newUserId = result.rows[0].id;
            res.status(201).json({ message: "User created successfully", userId: newUserId });
        } catch (error) {
            console.error("Error creating user:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    }

    static async assignTaskToUser (req, res) {
        // Implementation for assigning a task to a user
        try {
            const { 
                driverId, 
                vehicleNumber, 
                pickupLat, 
                pickupLng, 
                destLat, 
                destLng, 
                distanceKm, 
                estDurationMin 
            } = req.body;

            // Validate required fields
            if (!driverId || !vehicleNumber || !pickupLat || !pickupLng || !destLat || !destLng) {
                return res.status(400).json({ error: "All fields are required" });
            }

            // Check if driver exists
            const driverCheck = await db.query("SELECT id FROM users WHERE id = $1", [driverId]);
            if (driverCheck.rows.length === 0) {
                return res.status(404).json({ error: "Driver not found" });
            }

            // Check if driver already has an active assignment
            const activeCheck = await db.query(
                "SELECT id FROM assignments WHERE driver_id = $1 AND status IN ('pending', 'active')",
                [driverId]
            );
            if (activeCheck.rows.length > 0) {
                return res.status(400).json({ error: "Driver already has an active assignment" });
            }

            // Create new assignment
            const createQuery = `
                INSERT INTO assignments (
                    driver_id, vehicle_number, 
                    pickup_lat, pickup_lng, 
                    dest_lat, dest_lng, 
                    distance_km, est_duration_min, 
                    status, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW())
                RETURNING id
            `;

            const result = await db.query(createQuery, [
                driverId, 
                vehicleNumber, 
                pickupLat, 
                pickupLng, 
                destLat, 
                destLng, 
                distanceKm || null, 
                estDurationMin || null
            ]);

            const assignmentId = result.rows[0].id;
            res.status(201).json({ 
                message: "Task assigned successfully", 
                assignmentId: assignmentId 
            });

        } catch (error) {
            console.error("Error assigning task:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    }

    static async fetchAvailableDrivers (req, res) {
        // Fetch users who don't have active/pending assignments
        try {
            const query = `
                SELECT u.id, u.full_name, u.email, u.status
                FROM users u
                WHERE u.status = 'active'
                AND u.id NOT IN (
                    SELECT driver_id FROM assignments 
                    WHERE status IN ('pending', 'active')
                    AND driver_id IS NOT NULL
                )
                ORDER BY u.full_name ASC
            `;
            const result = await db.query(query);
            res.status(200).json({ drivers: result.rows });
        } catch (error) {
            console.error("Error fetching available drivers:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    }

    static async fetchAssignments (req, res) {
        // Fetch all assignments with driver info
        try {
            const query = `
                SELECT a.*, u.full_name as driver_name, u.email as driver_email
                FROM assignments a
                LEFT JOIN users u ON a.driver_id = u.id
                ORDER BY a.created_at DESC
            `;
            const result = await db.query(query);
            res.status(200).json({ assignments: result.rows });
        } catch (error) {
            console.error("Error fetching assignments:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    }

    static async updateUser (req, res) {
        try {
            // Implementation for editing a user
            const id = req.params.id;
            const { firstName, lastName, status } = req.body;

            // Basic Validation
            if (!firstName || !lastName  || !status) {
                return res.status(400).json({ error: "All fields are required" });
            }

            // Combine first and last name  
            const fullName = `${firstName} ${lastName}`;

            // Update user details
            const updateQuery = `
                UPDATE users
                SET full_name = $1, status = $2, updated_at = NOW()
                WHERE id = $3
            `;

            const result = await db.query(updateQuery, [fullName, status, id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: "User not found" });
            }

            res.status(200).json({ message: "User updated successfully" });
            
        } catch (error) {
            console.error("Error editing user:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    }

    static async deleteUser (req, res) {
        // Implementation for deleting a user
        try {
            const id = req.params.id;
            const deleteQuery = `DELETE FROM users WHERE id = $1`;

            const result = await db.query(deleteQuery, [id]);

            if(result.rowCount === 0) {
                return res.status(404).json({ error: "User not found" });
            }
            res.status(200).json({ message: "User deleted successfully" });

        } catch (error) {
            console.error("Error deleting user:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    }

    static async updateAssignment (req, res) {
        // Implementation for updating an assignment
        try {
            const id = req.params.id;
            const { vehicle_number, status, pickup_lat, pickup_lng, dest_lat, dest_lng } = req.body;

            // Basic Validation
            if (!vehicle_number || !status) {
                return res.status(400).json({ error: "Vehicle number and status are required" });
            }

            // Check if assignment exists
            const assignmentCheck = await db.query("SELECT id FROM assignments WHERE id = $1", [id]);
            if (assignmentCheck.rows.length === 0) {
                return res.status(404).json({ error: "Assignment not found" });
            }

            // Update assignment
            const updateQuery = `
                UPDATE assignments
                SET vehicle_number = $1, 
                    status = $2, 
                    pickup_lat = $3, 
                    pickup_lng = $4, 
                    dest_lat = $5, 
                    dest_lng = $6,
                    updated_at = NOW()
                WHERE id = $7
            `;

            await db.query(updateQuery, [
                vehicle_number, 
                status, 
                pickup_lat, 
                pickup_lng, 
                dest_lat, 
                dest_lng, 
                id
            ]);

            res.status(200).json({ message: "Assignment updated successfully" });
            
        } catch (error) {
            console.error("Error updating assignment:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    }

    static async deleteAssignment (req, res) {
        // Implementation for deleting/cancelling an assignment
        try {
            const id = req.params.id;

            // Check if assignment exists
            const assignmentCheck = await db.query("SELECT id FROM assignments WHERE id = $1", [id]);
            if (assignmentCheck.rows.length === 0) {
                return res.status(404).json({ error: "Assignment not found" });
            }

            // Delete the assignment
            const deleteQuery = `DELETE FROM assignments WHERE id = $1`;
            await db.query(deleteQuery, [id]);

            res.status(200).json({ message: "Assignment cancelled successfully" });

        } catch (error) {
            console.error("Error deleting assignment:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    }
}

export default AdminUserController;