import db from '../../../database/db.js';
import bcrypt from 'bcrypt';

import nodemailerService from '../../../utils/emailService.js';

class SignUpUserController {
    static async handleUserSignUp(req, res) {
        try {
            const {fName, lName, email, password, confirmPassword} = req.body;

            // Basic validation
            if (!fName || !lName || !email || !password || !confirmPassword) {
                return res.status(400).json({ error: "All fields are required." });
            }

            if (password !== confirmPassword) {
                return res.status(400).json({ error: "Passwords do not match." });
            }

            if (password.length < 8) {
                return res.status(400).json({ error: "Password must be at least 8 characters long." });
            }

            // Email format validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({ error: "Invalid email format." });
            }

            // Check if email already exists
            const checkQuery = `SELECT * FROM users WHERE email = $1`;
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
                        UPDATE users
                        SET verification_code = $1, verification_expires = $2, updated_at = NOW()
                        WHERE id = $3
                    `;

                    await db.query(updateQuery, [verificationCode, expiryTime, existingUser.id]);

                    // Send verification email
                    const emailResult = await nodemailerService.sendVerificationEmail(email, fName, lName, verificationCode, password);

                    if(!emailResult.success) {
                       return res.status(500).json({ error: "Failed to send verification email. Please try again later." });
                    }

                    return res.status(200).json({
                        message: "An account with this email already exists but is not verified. A new verification code has been sent to your email.",
                        requiresVerification: true,
                        verificationExpiresAt: expiryTime.toISOString(),
                        user: {
                            id: existingUser.id,
                            first_name: existingUser.first_name,
                            last_name: existingUser.last_name,
                            email: existingUser.email,
                            is_verified: existingUser.is_verified,
                            created_at: existingUser.created_at
                        }
                    });
                }
            }

           // Hash the password
           const saltRounds = 12;
           const hashedPassword = await bcrypt.hash(password, saltRounds);

           // Create new user
           const createQuery = `
                INSERT INTO users (first_name, last_name, email, password, is_verified, status, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, 'Pending', NOW(), NOW())
             RETURNING id, first_name, last_name, email, is_verified, created_at
           `;
           
           const createValues =[fName, lName, email, hashedPassword, false];
           const createResult = await db.query(createQuery, createValues);
           const createdUser = createResult.rows[0];

            // Generate verification code and expiry time
            const verificationCode = nodemailerService.generateVerificationCode();
            const expiryTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

            const updateQuery = `
                UPDATE users
                SET verification_code = $1, verification_expires = $2, updated_at = NOW()
                WHERE id = $3
            `;

            await db.query(updateQuery, [verificationCode, expiryTime, createdUser.id]);

            // Send verification email
            const emailResult = await nodemailerService.sendVerificationEmail(email, fName, lName, verificationCode, password);


            if(!emailResult.success) {
                return res.status(500).json({ error: "Failed to send verification email. Please try again later." });
            }

            res.status(201).json({
                message: "Signup successful. A verification code has been sent to your email.",
                requiresVerification: true,
                verificationExpiresAt: expiryTime.toISOString(),
                user: createdUser
            });

        } catch (error) {
            console.error("Error handling sign-up:", error);
            res.status(500).json({ error: "An error occurred during sign-up." });
        }
    }   
}


export default SignUpUserController;