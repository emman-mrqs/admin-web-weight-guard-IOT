// This controller handles both verification and resend verification for Admin Staff and Dispatch Staff accounts.
import db from '../../../database/db.js';

import nodemailerService from '../../../utils/emailService.js';

class VerificationController {
    static async handleVerification(req, res) {
        try {
            const { email, verificationCode } = req.body;

            // Basic validation
            if (!email || !verificationCode) {
                return res.status(400).json({ error: "Email and verification code are required." });
            }

            if (verificationCode.length !== 6) {
                return res.status(400).json({ error: "Verification code must be 6 characters long." });
            }

            // Verify the code and email against the database
            const checkQuery = `
                SELECT id, first_name, last_name, verification_code, verification_expires, is_verified, status
                FROM administrator
                wHERE email = $1 AND verification_code = $2
            `;

            const result = await db.query(checkQuery, [email, verificationCode]);

            if (result.rows.length === 0) {
                return res.status(400).json({ error: "Invalid email or verification code." });
            }

            const user = result.rows[0];

            // Check if the code has expired
            if (new Date() > user.verification_expires) {
                return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
            }

            // Set the user as verified and clear the verification code and expiry
            const updateQuery = `
                UPDATE administrator
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
            `;

            await db.query(updateQuery, [user.id]);

            // ADDED: Send a success response back to the frontend so the modal can close!
            return res.status(200).json({ message: "Email verified successfully. You can now log in." });

        } catch (error) {
            console.error("Error during verification:", error);
            res.status(500).json({ error: "An error occurred during verification. Please try again later." });
        }
    }

    static async handleResendVerification(req, res) {
        try {
            const { email } = req.body; 

            if (!email) {
                return res.status(400).json({ error: "Email is required." });
            }

            // Find the user (Combined into one clean query)
            const checkQuery = `
                SELECT id, first_name, last_name, is_verified, role 
                FROM administrator
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

            // Overwrite the old code in the database with the new one
            const updateQuery = `
                UPDATE administrator
                SET verification_code = $1, verification_expires = $2, updated_at = NOW()
                WHERE id = $3
            `;
            await db.query(updateQuery, [verificationCode, expiryTime, user.id]);

            // Send the updated email
            const emailResult = await nodemailerService.sendResendVerificationEmail(
                email, 
                verificationCode, 
                user.first_name, 
                user.last_name, 
                user.role
            );

            if (!emailResult.success) {
                return res.status(500).json({ error: "Failed to send email. Please try again." });
            }

            // Audit Logs here


            // Send success response back to the frontend
            return res.status(200).json({
                message: "A new verification code has been sent.",
                verificationExpiresAt: expiryTime.toISOString()
            });
        } catch (error) {
            console.error("Error during resend verification:", error);
            res.status(500).json({ error: "An error occurred while resending verification email. Please try again later." });
        }
    }
}

export default VerificationController;