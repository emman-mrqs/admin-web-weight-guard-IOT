import db from '../../../database/db.js';

import nodemailerService from '../../../utils/emailService.js';

class verificationUserController {
    static async handleUserVerification(req, res) {
        try {
            const { email, verificationCode } = req.body;

            // Basic validation
            if (!email || !verificationCode) {
                return res.status(400).json({ error: "Email and verification code are required." });
            }

            if (verificationCode.length !== 6) {
                return res.status(400).json({ error: "Verification code must be 6 characters long." });
            }

            // verify the code and email against the database
            const checkQuery = `
                SELECT id, first_name, last_name, verification_code, verification_expires, is_verified
                FROM users
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

            // set the staff as verified and clear the verification code and expiry
            const updateQuery = `
                UPDATE users
                SET is_verified = true, verification_code = NULL, verification_expires = NULL, updated_at = NOW()
                WHERE id = $1
            `;
            
            await db.query(updateQuery, [user.id]);

            // ADDED: Send a success response back to the frontend so the modal can close!
            return res.status(200).json({ message: "Email verified successfully. You can now log in." });

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
            return res.status(200).json({ message: "A new verification code has been sent to your email." });
        } catch (error) {
            console.error("Error during resend user verification:", error);
            res.status(500).json({ error: "An error occurred while resending verification. Please try again later." });
        }
    }
}


export default verificationUserController;