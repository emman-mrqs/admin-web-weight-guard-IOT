import bcrypt from 'bcrypt';
import db from '../../../database/db.js';
import nodemailerService from '../../../utils/emailService.js'; // Ensure path is correct

class forgetPasswordController {
    
    // Renders the Frontend Page
    static getForgetPassword(req, res) {
        res.render('auth/adminForgetPassword');
    }

    // STEP 1: Generate and Send the 6-Digit Code
    static async handleForgetPassword(req, res) {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({ success: false, message: 'Admin email is required.' });
            }

            // 1. Check if admin exists AND fetch their name for the email template
            const adminCheck = await db.query(
                'SELECT id, first_name, last_name, role FROM administrator WHERE email = $1',
                [email]
            );

            if (adminCheck.rowCount === 0) {
                // Return success to prevent email enumeration attacks
                return res.status(200).json({ success: true, message: 'If an account exists, a code has been sent.' });
            }

            const admin = adminCheck.rows[0];

            // 2. Generate code and set expiration to 5 minutes (matching your email template)
            const resetCode = nodemailerService.generateVerificationCode();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); 

            // 3. Clear existing reset codes for this email
            await db.query('DELETE FROM password_reset WHERE email = $1', [email]);

            // 4. Insert the new reset code
            await db.query(
                `INSERT INTO password_reset (user_type, email, reset_code, expires_at) 
                 VALUES ($1, $2, $3, $4)`,
                [admin.role , email, resetCode, expiresAt]
            );

            // 5. Send the email using your specific service method
            const emailResult = await nodemailerService.sendStaffPasswordResetEmail(
                email, 
                admin.first_name, 
                admin.last_name, 
                resetCode
            );

            // Handle potential email failure
            if (!emailResult.success) {
                return res.status(500).json({ success: false, message: 'Failed to send verification email. Please try again later.' });
            }

            return res.status(200).json({ success: true, message: 'Code sent successfully.' });

        } catch (error) {
            console.error('Error in handleForgetPassword:', error);
            return res.status(500).json({ success: false, message: 'Internal server error.' });
        }
    }

    // STEP 1.5: Resend the Verification Code
    static async handleResendCode(req, res) {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({ success: false, message: 'Admin email is required.' });
            }

            // 1. Fetch admin details for the email template
            const adminCheck = await db.query(
                'SELECT id, first_name, last_name FROM administrator WHERE email = $1',
                [email]
            );

            // If the email isn't in our system, return success to prevent enumeration attacks
            if (adminCheck.rowCount === 0) {
                return res.status(200).json({ success: true, message: 'If an account exists, a new code has been sent.' });
            }

            const admin = adminCheck.rows[0];

            // 2. Generate a fresh code and a new 5-minute expiration
            const resetCode = nodemailerService.generateVerificationCode();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); 

            // 3. Clear any old/expired reset codes for this email
            await db.query('DELETE FROM password_reset WHERE email = $1', [email]);

            // 4. Insert the newly generated code
            await db.query(
                `INSERT INTO password_reset (user_type, email, reset_code, expires_at) 
                 VALUES ($1, $2, $3, $4)`,
                ['administrator', email, resetCode, expiresAt]
            );

            // 5. Send the new email
            const emailResult = await nodemailerService.sendStaffPasswordResetEmail(
                email, 
                admin.first_name, 
                admin.last_name, 
                resetCode
            );

            if (!emailResult.success) {
                return res.status(500).json({ success: false, message: 'Failed to resend the verification email. Please try again.' });
            }

            return res.status(200).json({ success: true, message: 'A new code has been sent successfully.' });

        } catch (error) {
            console.error('Error in handleResendCode:', error);
            return res.status(500).json({ success: false, message: 'Internal server error.' });
        }
    }

    // STEP 2: Verify the 6-Digit Code
    static async handleVerifyCode(req, res) {
        try {
            const { email, code } = req.body;

            if (!email || !code) {
                return res.status(400).json({ success: false, message: 'Email and verification code are required.' });
            }

            // Check if code matches and is not expired
            const codeCheck = await db.query(
                'SELECT * FROM password_reset WHERE email = $1 AND reset_code = $2 AND expires_at > NOW()',
                [email, code]
            );

            if (codeCheck.rows.length === 0) {
                return res.status(400).json({ success: false, message: 'Invalid or expired verification code.' });
            }

            return res.status(200).json({ success: true, message: 'Code verified successfully.' });

        } catch (error) {
            console.error('Error in handleVerifyCode:', error);
            return res.status(500).json({ success: false, message: 'Internal server error.' });
        }
    }

    // STEP 3: Hash and Update the New Password
    static async handleResetPassword(req, res) {
        try {
            const { email, code, newPassword, confirmPassword } = req.body;

            if (!email || !code || !newPassword || !confirmPassword) {
                return res.status(400).json({ success: false, message: 'Missing required fields.' });
            }

            if (newPassword !== confirmPassword) {
                return res.status(400).json({ success: false, message: 'Passwords do not match.' });
            }

            // Verify the code ONE MORE TIME to prevent bypass
            const codeCheck = await db.query(
                'SELECT * FROM password_reset WHERE email = $1 AND reset_code = $2 AND expires_at > NOW()',
                [email, code]
            );

            if (codeCheck.rows.length === 0) {
                return res.status(400).json({ success: false, message: 'Security token invalid or expired. Please restart the process.' });
            }

            // Hash the new password
            const saltRounds = 12;
            const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

            // Update the administrator table
            await db.query(
                'UPDATE administrator SET password = $1, updated_at = NOW() WHERE email = $2',
                [hashedPassword, email]
            );

            // Delete the used reset code
            await db.query('DELETE FROM password_reset WHERE email = $1', [email]);

            return res.status(200).json({ success: true, message: 'Password updated successfully.' });

        } catch (error) {
            console.error('Error in handleResetPassword:', error);
            return res.status(500).json({ success: false, message: 'Internal server error.' });
        }
    }
}

export default forgetPasswordController;