import db from '../../../database/db.js';
import bcrypt from 'bcrypt';

import nodemailerService from '../../../utils/emailService.js';


class SignUpAdminController {
    static async handleAdminSignUp(req, res) {
        try {
            const {fName, lName, email, role, password, confirmPassword} = req.body;

            // Basic validation
            if (!fName || !lName || !email || !role ||!password || !confirmPassword) {
                return res.status(400).json({ error: "All fields are required." });
            }

            if (password !== confirmPassword) {
                return res.status(400).json({ error: "Passwords do not match." });
            }
            
            if (password.length < 8) {
                return res.status(400).json({ error: "Password must be at least 8 characters long." });
            }

            const normalizedRole = String(role || '').trim().toLowerCase();
            if (!['dispatch_staff', 'incident_staff'].includes(normalizedRole)) {
                return res.status(400).json({ error: "Invalid role. Allowed values: dispatch_staff, incident_staff." });
            }

            // Email format validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({ error: "Invalid email format." });
            }

            // Check if email already exists
            const checkQuery = `SELECT * FROM administrator WHERE email = $1`;
            const checkResult = await db.query(checkQuery, [email]);


            if (checkResult.rows.length > 0) {
                const existingUser = checkResult.rows[0];

                if (existingUser.deleted_at) {
                    return res.status(400).json({ error: "This email was previously registered but has been deleted. Please contact support if you wish to reactivate your account." });
                }

                if (existingUser.is_verified) {
                    return res.status(400).json({ error: "This email is already registered and verified. Please log in or use a different email." });
                } else {
                    // user exists but not verified, allow to create account with same email and password
                    const verificationCode = nodemailerService.generateVerificationCode();
                    const expiryTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

                    const updateQuery = `
                        UPDATE administrator
                        SET verification_code = $1, verification_expires = $2, updated_at = NOW()
                        WHERE id = $3
                    `;

                    await db.query(updateQuery, [verificationCode, expiryTime, existingUser.id]);

                    // Send verification email
                    const emailResult = await nodemailerService.sendStaffWelcomeEmail(email, fName, lName, role, password, verificationCode);

                    if(!emailResult.success) {
                       return res.status(500).json({ error: "Failed to send verification email. Please try again later." });
                    }

                    return res.status(200).json({
                        message: "An account with this email already exists but is not verified. A new verification code has been sent to your email.",
                        requiresVerification: true,
                        verificationExpiresAt: expiryTime.toISOString()
                    });
                }
            }

           // Hash the password
           const saltRounds = 12;
           const hashedPassword = await bcrypt.hash(password, saltRounds);

           // Create new user
           const createQuery = `
                INSERT INTO administrator (first_name, last_name, email, password, role, is_verified, status, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, 'Pending', NOW(), NOW())
                RETURNING id
           `;

           const createValues =[fName, lName, email, hashedPassword, normalizedRole, false];
           const createResult = await db.query(createQuery, createValues);
           const newStaff = createResult.rows[0];

            // Generate verification code and expiry time
            const verificationCode = nodemailerService.generateVerificationCode();
            const expiryTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now


            const updateQuery = `
                UPDATE administrator
                SET verification_code = $1, verification_expires = $2, updated_at = NOW()
                WHERE id = $3
            `;

            await db.query(updateQuery, [verificationCode, expiryTime, newStaff.id]);

            // Send verification email
            const emailResult = await nodemailerService.sendStaffWelcomeEmail(email, fName, lName, role, password, verificationCode);

            if(!emailResult.success) {
                return res.status(500).json({ error: "Failed to send verification email. Please try again later." });
            }

            res.status(201).json({
                message: "Signup successful. A verification code has been sent to your email.",
                verificationExpiresAt: expiryTime.toISOString()
            });

        } catch (error) {
            console.error("Error handling user signup:", error);
            res.status(500).json({ error: "An error occurred during signup. Please try again later." });
        }
    }
}

export default SignUpAdminController;