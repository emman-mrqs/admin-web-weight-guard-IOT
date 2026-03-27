import db from '../../../database/db.js';

import nodemailerService from '../../../utils/emailService.js';

class verificationUserController {
    static async handleUserVerification(req, res) {
        try {
            const { email, verificationCode } = req.body;
            const normalizedEmail = String(email || '').trim().toLowerCase();
            const normalizedCode = String(verificationCode || '').trim();

            // Basic validation
            if (!normalizedEmail || !normalizedCode) {
                return res.status(400).json({ error: "Email and verification code are required." });
            }

            if (!/^\d{6}$/.test(normalizedCode)) {
                return res.status(400).json({ error: "Verification code must be 6 characters long." });
            }

            // Fetch user first, then validate code/expiry explicitly.
            const checkQuery = `
                SELECT id, first_name, last_name, status, verification_code, verification_expires, is_verified
                FROM users
                WHERE LOWER(email) = $1
                LIMIT 1
            `;

            const result = await db.query(checkQuery, [normalizedEmail]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: "User account not found." });
            }

            const user = result.rows[0];

            if (Boolean(user.is_verified)) {
                return res.status(400).json({ error: "This account is already verified." });
            }

            if (!user.verification_code || String(user.verification_code).trim() !== normalizedCode) {
                return res.status(400).json({ error: "Invalid verification code." });
            }

            const expiresAt = user.verification_expires ? new Date(user.verification_expires) : null;
            if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
                return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
            }

            // Check if the code has expired
            if (new Date() > expiresAt) {
                return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
            }

            // Mark user verified, activate account, and clear verification fields.
            const updateQuery = `
                UPDATE users
                SET
                    is_verified = true,
                    status = CASE
                        WHEN LOWER(COALESCE(status, 'pending')) = 'pending' THEN 'active'
                        ELSE status
                    END,
                    verification_code = NULL,
                    verification_expires = NULL,
                    updated_at = NOW()
                WHERE id = $1
                RETURNING id, first_name, last_name, email, status, is_verified, verification_expires, updated_at
            `;
            
            const updateResult = await db.query(updateQuery, [user.id]);

            return res.status(200).json({
                message: "Email verified successfully. Account is now active.",
                user: updateResult.rows[0]
            });

        } catch (error) {
            console.error("Error during user verification:", error);
            res.status(500).json({ error: "An error occurred during verification. Please try again later." });
        }

    }

    static async handleResendUserVerification(req, res) {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({ error: "Email is required." });
            }
            
            // Find the user (Combined into one clean query)
            const checkQuery = `
                SELECT id, first_name, last_name, is_verified
                FROM users
                WHERE email = $1
            `;

            const findResult = await db.query(checkQuery, [email]);

            if (findResult.rows.length === 0) {
                return res.status(400).json({ error: "No account found with this email." });
            }

            const user = findResult.rows[0];

            // Prevent resending if already verified
            if (user.is_verified) {
                return res.status(400).json({ error: "This account is already verified. Please log in." });
            }


            // Generate a BRAND NEW 6-digit code and 5-minute Expiry
            const verificationCode = nodemailerService.generateVerificationCode();
            const expiryTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

            // Overwrite the existing code and expiry in the database with the new ones
            const updateQuery = `
                UPDATE users
                SET verification_code = $1, verification_expires = $2, updated_at = NOW()
                WHERE id = $3
            `;

            await db.query(updateQuery, [verificationCode, expiryTime, user.id]);

            const emaailResult = await nodemailerService.sendResendVerificationEmail(
                email, 
                verificationCode, 
                user.first_name, 
                user.last_name
            );

            if(!emaailResult.success) {
                return res.status(500).json({ error: "Failed to send verification email. Please try again later." });
            }

            // Audit Logs here

            // Send success response
            return res.status(200).json({
                message: "A new verification code has been sent to your email.",
                verificationExpiresAt: expiryTime.toISOString()
            });
        } catch (error) {
            console.error("Error during resend user verification:", error);
            res.status(500).json({ error: "An error occurred while resending verification. Please try again later." });
        }
    }
}


export default verificationUserController;