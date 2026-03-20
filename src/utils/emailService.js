import nodemailer from 'nodemailer';

// Create a transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS 
    }
});

class nodemailerService {
    static generateVerificationCode () {
        return Math.floor(100000 + Math.random() * 900000).toString(); // Generate a 6-digit code
    }

    // ===========================
    // User Emails (Driver)
    //  ==========================

    // Send verification Code to email (users - Driver)
    static async sendVerificationEmail(email, firstName, lastName, verificationCode, password) {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your New Account Verification Code - WeighGuard',
            html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    @media screen and (max-width: 600px) {
                        .content-table { width: 100% !important; }
                    }
                </style>
            </head>
            <body style="margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #cbd5e1; -webkit-font-smoothing: antialiased;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #020617; padding: 40px 20px;">
                    <tr>
                        <td align="center">
                            <table class="content-table" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; border-collapse: separate; overflow: hidden; width: 100%; max-width: 600px; text-align: left;">
                                
                                <tr>
                                    <td style="height: 6px; background-color: #10b981; line-height: 6px; font-size: 6px;">&nbsp;</td>
                                </tr>

                                <tr>
                                    <td style="padding: 32px 40px 16px 40px; text-align: center; background-color: #0f172a;">
                                        <table align="center" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
                                            <tr>
                                                <td style="height: 56px; width: 56px; border-radius: 50%; background-color: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); text-align: center; vertical-align: middle;">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle;">
                                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                                    </svg>
                                                </td>
                                            </tr>
                                        </table>
                                        <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">Account Verification</h1>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding: 0 40px 40px 40px;">
                                        <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #94a3b8; text-align: center;">
                                            Hi ${firstName} ${lastName},<br><br>
                                            You have been added to the <strong style="color: #ffffff;">WeighGuard</strong> platform. To verify your email address and access your temporary login credentials, please enter the following 6-digit verification code.
                                        </p>
                                        
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 28px;">
                                            <tr>
                                                <td align="center">
                                                    <p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #64748b;">
                                                        Your Verification Code
                                                    </p>
                                                    <p style="margin: 0; display: inline-block; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #34d399; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background-color: rgba(16, 185, 129, 0.05); padding: 12px 24px; border-radius: 12px; border: 1px dashed rgba(16, 185, 129, 0.3);">
                                                        ${verificationCode}
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>

                                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #020617; border: 1px solid #1e293b; border-radius: 12px; margin-bottom: 24px;">
                                            <tr>
                                                <td style="padding: 24px;">
                                                    <h4 style="margin: 0 0 16px 0; font-size: 12px; font-weight: 700; color: #ffffff; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">Your Account Details</h4>
                                                    
                                                    <p style="margin: 0 0 4px 0; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Registered Email</p>
                                                    <p style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; color: #f8fafc;">${email}</p>

                                                    <p style="margin: 0 0 4px 0; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Temporary Password</p>
                                                    <p style="margin: 0; font-size: 16px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 700; color: #f8fafc; background-color: #0f172a; padding: 8px 12px; border-radius: 8px; display: inline-block; border: 1px solid #1e293b;">
                                                        ${password}
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>

                                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: rgba(245, 158, 11, 0.05); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 12px; margin-bottom: 28px;">
                                            <tr>
                                                <td style="padding: 16px;">
                                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                                                        <tr>
                                                            <td width="24" valign="top" style="padding-right: 12px; padding-top: 2px;">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
                                                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                                                </svg>
                                                            </td>
                                                            <td valign="top" style="font-size: 12px; color: #fbbf24; line-height: 1.5; margin: 0;">
                                                                <strong style="color: #fcd34d;">Security Notice:</strong> For your security, you will be required to change this temporary password immediately upon your first login.
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <p style="margin: 0; font-size: 13px; line-height: 22px; color: #64748b; text-align: center;">
                                            This code will expire in <strong>5 minutes</strong>. If you did not request this account creation, you can safely ignore this email.
                                        </p>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding: 24px 40px; background-color: #020617; border-top: 1px solid #1e293b; text-align: center;">
                                        <p style="margin: 0; font-size: 12px; color: #64748b;">
                                            &copy; ${new Date().getFullYear()} WeighGuard System. All rights reserved.
                                        </p>
                                    </td>
                                </tr>

                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            return { success: true };
        } catch (error) {
            console.error('Error sending email:', error);
            return { success: false, error: 'Failed to send verification email' };
        }
    }

    // Send 6-digit Password Reset Code to email (users - Driver)
    static async sendPasswordResetEmail(email, resetCode, firstName, lastName) {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Password Reset Request - WeighGuard',
            html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    @media screen and (max-width: 600px) {
                        .content-table { width: 100% !important; }
                    }
                </style>
            </head>
            <body style="margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #cbd5e1; -webkit-font-smoothing: antialiased;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #020617; padding: 40px 20px;">
                    <tr>
                        <td align="center">
                            <table class="content-table" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; border-collapse: separate; overflow: hidden; width: 100%; max-width: 600px; text-align: left;">
                                
                                <tr>
                                    <td style="height: 6px; background-color: #3b82f6; line-height: 6px; font-size: 6px;">&nbsp;</td>
                                </tr>

                                <tr>
                                    <td style="padding: 32px 40px 16px 40px; text-align: center; background-color: #0f172a;">
                                        <table align="center" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
                                            <tr>
                                                <td style="height: 56px; width: 56px; border-radius: 50%; background-color: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); text-align: center; vertical-align: middle;">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle;">
                                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                                    </svg>
                                                </td>
                                            </tr>
                                        </table>
                                        <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">Reset Your Password</h1>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding: 0 40px 40px 40px;">
                                        <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #94a3b8; text-align: center;">
                                            Hi ${firstName} ${lastName},<br><br>
                                            We received a request to reset the password for your <strong style="color: #ffffff;">WeighGuard</strong> account. Please use the 6-digit verification code below to proceed with setting up a new password.
                                        </p>
                                        
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 28px;">
                                            <tr>
                                                <td align="center">
                                                    <p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #64748b;">
                                                        Password Reset Code
                                                    </p>
                                                    <p style="margin: 0; display: inline-block; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #3b82f6; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background-color: rgba(59, 130, 246, 0.05); padding: 12px 24px; border-radius: 12px; border: 1px dashed rgba(59, 130, 246, 0.3);">
                                                        ${resetCode}
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: rgba(244, 63, 94, 0.05); border: 1px solid rgba(244, 63, 94, 0.2); border-radius: 12px;">
                                            <tr>
                                                <td style="padding: 16px;">
                                                    <p style="margin: 0 0 8px 0; font-size: 13px; color: #cbd5e1;">
                                                        This code will expire in <strong>5 minutes</strong>.
                                                    </p>
                                                    <p style="margin: 0; font-size: 12px; line-height: 18px; color: #94a3b8;">
                                                        <strong style="color: #fb7185;">Didn't request this?</strong> If you did not ask to reset your password, please safely ignore this email. Your password will not change until you verify this code.
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding: 24px 40px; background-color: #020617; border-top: 1px solid #1e293b; text-align: center;">
                                        <p style="margin: 0; font-size: 12px; color: #64748b;">
                                            &copy; ${new Date().getFullYear()} WeighGuard System. All rights reserved.
                                        </p>
                                    </td>
                                </tr>

                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            `
        };
        try {
            await transporter.sendMail(mailOptions);
            return { success: true };
        } catch (error) {
            console.error('Error sending password reset email:', error);
            return { success: false, error: 'Failed to send password reset email' };
        }
    }
    
    // ===============================================
    // Staff Emails (Dispatch Staff, Admin Staff) 
    // ===============================================

   // Staff welcome email (Staff - dispatch_staff, admin_staff)
    static async sendStaffWelcomeEmail(email, firstName, lastName, role, password, verificationCode) {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Action Required: Welcome to WeighGuard',
            html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    @media screen and (max-width: 600px) {
                        .content-table { width: 100% !important; }
                    }
                </style>
            </head>
            <body style="margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #cbd5e1; -webkit-font-smoothing: antialiased;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #020617; padding: 40px 20px;">
                    <tr>
                        <td align="center">
                            <table class="content-table" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; border-collapse: separate; overflow: hidden; width: 100%; max-width: 600px; text-align: left;">
                                
                                <tr>
                                    <td style="height: 6px; background-color: #10b981; line-height: 6px; font-size: 6px;">&nbsp;</td>
                                </tr>

                                <tr>
                                    <td style="padding: 32px 40px 16px 40px; text-align: center; background-color: #0f172a;">
                                        <table align="center" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
                                            <tr>
                                                <td style="height: 56px; width: 56px; border-radius: 50%; background-color: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); text-align: center; vertical-align: middle;">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle;">
                                                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                                                        <circle cx="9" cy="7" r="4"></circle>
                                                        <polyline points="16 11 18 13 22 9"></polyline>
                                                    </svg>
                                                </td>
                                            </tr>
                                        </table>
                                        <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">Welcome to the Team!</h1>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding: 0 40px 40px 40px;">
                                        <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #94a3b8; text-align: center;">
                                            Hello ${firstName} ${lastName},<br><br>
                                            An administrator has created a <strong style="color: #ffffff;">WeighGuard</strong> staff account for you. Before you can log in, your account must be activated. Please provide the verification code below to your administrator to complete the setup.
                                        </p>
                                        
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 28px;">
                                            <tr>
                                                <td align="center">
                                                    <p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #64748b;">
                                                        Your Verification Code
                                                    </p>
                                                    <p style="margin: 0; display: inline-block; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #34d399; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background-color: rgba(16, 185, 129, 0.05); padding: 12px 24px; border-radius: 12px; border: 1px dashed rgba(16, 185, 129, 0.3);">
                                                        ${verificationCode}
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>

                                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #020617; border: 1px solid #1e293b; border-radius: 12px; margin-bottom: 24px;">
                                            <tr>
                                                <td style="padding: 24px;">
                                                    <h4 style="margin: 0 0 16px 0; font-size: 12px; font-weight: 700; color: #ffffff; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">Your Account Details</h4>
                                                    
                                                    <p style="margin: 0 0 4px 0; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Assigned Role</p>
                                                    <p style="margin: 0 0 16px 0;">
                                                        <span style="display: inline-block; font-size: 11px; font-weight: 700; color: #34d399; background-color: rgba(16, 185, 129, 0.1); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.2); text-transform: uppercase;">
                                                            ${role}
                                                        </span>
                                                    </p>

                                                    <p style="margin: 0 0 4px 0; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Registered Email</p>
                                                    <p style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; color: #f8fafc;">${email}</p>

                                                    <p style="margin: 0 0 4px 0; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Temporary Password</p>
                                                    <p style="margin: 0; font-size: 16px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 700; color: #f8fafc; background-color: #0f172a; padding: 8px 12px; border-radius: 8px; display: inline-block; border: 1px solid #1e293b;">
                                                        ${password}
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>

                                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: rgba(245, 158, 11, 0.05); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 12px; margin-bottom: 32px;">
                                            <tr>
                                                <td style="padding: 16px;">
                                                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                                        <tr>
                                                            <td width="24" valign="top" style="padding-right: 12px; padding-top: 2px;">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
                                                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                                                </svg>
                                                            </td>
                                                            <td valign="top" style="font-size: 12px; color: #fbbf24; line-height: 1.5; margin: 0;">
                                                                <strong style="color: #fcd34d;">Security Notice:</strong> For your security, you will be required to change this temporary password immediately upon your first login.
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding: 24px 40px; background-color: #020617; border-top: 1px solid #1e293b; text-align: center;">
                                        <p style="margin: 0; font-size: 12px; color: #64748b;">
                                            &copy; ${new Date().getFullYear()} WeighGuard System. All rights reserved.
                                        </p>
                                    </td>
                                </tr>

                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            return { success: true };
        } catch (error) {
            console.error('Error sending staff welcome email:', error);
            return { success: false, error: 'Failed to send staff welcome email' };
        }
    }

    // Password Reset Email (For Staff - dispatch_staff, admin_staff)
    static async sendPasswordResetEmail(email, firstName, lastName, resetCode) {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Reset Your Password - WeighGuard",
            html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    @media screen and (max-width: 600px) {
                        .content-table { width: 100% !important; }
                    }
                </style>
            </head>
            <body style="margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #cbd5e1; -webkit-font-smoothing: antialiased;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #020617; padding: 40px 20px;">
                    <tr>
                        <td align="center">
                            <table class="content-table" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; border-collapse: separate; overflow: hidden; width: 100%; max-width: 600px; text-align: left;">
                                
                                <tr>
                                    <td style="height: 6px; background-color: #3b82f6; line-height: 6px; font-size: 6px;">&nbsp;</td>
                                </tr>

                                <tr>
                                    <td style="padding: 32px 40px 16px 40px; text-align: center; background-color: #0f172a;">
                                        <table align="center" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
                                            <tr>
                                                <td style="height: 56px; width: 56px; border-radius: 50%; background-color: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); text-align: center; vertical-align: middle;">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle;">
                                                        <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
                                                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                                    </svg>
                                                </td>
                                            </tr>
                                        </table>
                                        <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">Reset Your Password</h1>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding: 0 40px 40px 40px;">
                                        <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #94a3b8; text-align: center;">
                                            Hello ${firstName} ${lastName},<br><br>
                                            We received a request to reset the password for your <strong style="color: #ffffff;">WeighGuard</strong> staff account. Enter the following code to proceed.
                                        </p>
                                        
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 32px;">
                                            <tr>
                                                <td align="center">
                                                    <p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #64748b;">
                                                        Password Reset Code
                                                    </p>
                                                    <p style="margin: 0; display: inline-block; font-size: 36px; font-weight: 800; letter-spacing: 12px; color: #3b82f6; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background-color: rgba(59, 130, 246, 0.05); padding: 12px 24px; border-radius: 12px; border: 1px dashed rgba(59, 130, 246, 0.3);">
                                                        ${resetCode}
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: rgba(245, 158, 11, 0.05); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 12px; margin: 0;">
                                            <tr>
                                                <td style="padding: 16px;">
                                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                                                        <tr>
                                                            <td width="24" valign="top" style="padding-right: 12px; padding-top: 2px;">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
                                                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                                                </svg>
                                                            </td>
                                                            <td valign="top" style="font-size: 13px; color: #cbd5e1; line-height: 1.6; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                                                                <strong style="color: #fbbf24;">Didn't request this?</strong> You can safely ignore this email. Your password will not be changed unless you enter this code. This code will expire in <strong style="color: #f8fafc;">5 minutes</strong>.
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding: 24px 40px; background-color: #020617; border-top: 1px solid #1e293b; text-align: center;">
                                        <p style="margin: 0; font-size: 12px; color: #64748b;">
                                            &copy; ${new Date().getFullYear()} WeighGuard System. All rights reserved.
                                        </p>
                                    </td>
                                </tr>

                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            return { success: true };
        } catch (error) {
            console.error('Error sending password reset email:', error);
            return { success: false, error: 'Failed to send password reset email' };
        }
    }

    // =============================================== 
    // General Emails (Account Suspension Notice) 
    // ===============================================

    // Resend Verification Code Email (Dynamic for both Users and Staff)
    static async sendResendVerificationEmail(email, verificationCode, firstName, lastName, role = null) {
        
        // Ternary operator to switch text based on whether a role is provided
        const accountTypeText = role ? `${role} account` : 'account';
        
        // Conditionally render the role block only if a role exists
        const roleHtmlBlock = role ? `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #020617; border: 1px solid #1e293b; border-radius: 12px; margin-bottom: 24px;">
            <tr>
                <td style="padding: 20px 24px;">
                    <p style="margin: 0 0 4px 0; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Assigned Role</p>
                    <p style="margin: 0;">
                        <span style="display: inline-block; font-size: 11px; font-weight: 700; color: #34d399; background-color: rgba(16, 185, 129, 0.1); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.2); text-transform: uppercase;">
                            ${role}
                        </span>
                    </p>
                </td>
            </tr>
        </table>
        ` : '';

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'New Verification Code - WeighGuard',
            html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    @media screen and (max-width: 600px) {
                        .content-table { width: 100% !important; }
                    }
                </style>
            </head>
            <body style="margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #cbd5e1; -webkit-font-smoothing: antialiased;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #020617; padding: 40px 20px;">
                    <tr>
                        <td align="center">
                            <table class="content-table" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; border-collapse: separate; overflow: hidden; width: 100%; max-width: 600px; text-align: left;">
                                
                                <tr>
                                    <td style="height: 6px; background-color: #10b981; line-height: 6px; font-size: 6px;">&nbsp;</td>
                                </tr>

                                <tr>
                                    <td style="padding: 32px 40px 16px 40px; text-align: center; background-color: #0f172a;">
                                        <table align="center" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
                                            <tr>
                                                <td style="height: 56px; width: 56px; border-radius: 50%; background-color: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); text-align: center; vertical-align: middle;">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle;">
                                                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                                                        <path d="M3 3v5h5"></path>
                                                    </svg>
                                                </td>
                                            </tr>
                                        </table>
                                        <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">New Verification Code</h1>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding: 0 40px 40px 40px;">
                                        <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #94a3b8; text-align: center;">
                                            Hi ${firstName} ${lastName},<br><br>
                                            We received a request to resend the verification code for your <strong style="color: #ffffff;">WeighGuard</strong> ${accountTypeText}. Enter the 6-digit code below to proceed.
                                        </p>
                                        
                                        ${roleHtmlBlock}

                                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 28px;">
                                            <tr>
                                                <td align="center">
                                                    <p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #64748b;">
                                                        Your Verification Code
                                                    </p>
                                                    <p style="margin: 0; display: inline-block; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #34d399; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background-color: rgba(16, 185, 129, 0.05); padding: 12px 24px; border-radius: 12px; border: 1px dashed rgba(16, 185, 129, 0.3);">
                                                        ${verificationCode}
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <p style="margin: 0; font-size: 13px; line-height: 22px; color: #64748b; text-align: center;">
                                            This code will expire in <strong>5 minutes</strong>. If you did not request this code, you can safely ignore this email.
                                        </p>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding: 24px 40px; background-color: #020617; border-top: 1px solid #1e293b; text-align: center;">
                                        <p style="margin: 0; font-size: 12px; color: #64748b;">
                                            &copy; ${new Date().getFullYear()} WeighGuard System. All rights reserved.
                                        </p>
                                    </td>
                                </tr>

                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            return { success: true };
        } catch (error) {
            console.error('Error sending resend verification email:', error);
            return { success: false, error: 'Failed to resend verification email' };
        }
    }

    // Send Suspension Notice Email
    static async sendSuspensionNoticeEmail(email, firstName, lastName, reason, endDate) {
        const isPermanent = endDate === null;
        const suspensionDuration = isPermanent
        ? 'Permanent' 
        : `Until ${new Date(endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at ${new Date(endDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true })}`;

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Notice of Account Suspension - WeighGuard',
            html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    @media screen and (max-width: 600px) {
                        .content-table { width: 100% !important; }
                    }
                </style>
            </head>
            <body style="margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #cbd5e1; -webkit-font-smoothing: antialiased;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #020617; padding: 40px 20px;">
                    <tr>
                        <td align="center">
                            <table class="content-table" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; border-collapse: separate; overflow: hidden; width: 100%; max-width: 600px; text-align: left;">
                                
                                <tr>
                                    <td style="height: 6px; background-color: #f43f5e; line-height: 6px; font-size: 6px;">&nbsp;</td>
                                </tr>

                                <tr>
                                    <td style="padding: 32px 40px 16px 40px; text-align: center; background-color: #0f172a;">
                                        <table align="center" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
                                            <tr>
                                                <td style="height: 56px; width: 56px; border-radius: 50%; background-color: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.2); text-align: center; vertical-align: middle;">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fb7185" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle;">
                                                        <circle cx="12" cy="12" r="10"></circle>
                                                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                                                    </svg>
                                                </td>
                                            </tr>
                                        </table>
                                        <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">Account Suspended</h1>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding: 0 40px 40px 40px;">
                                        <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #94a3b8; text-align: center;">
                                            Hello ${firstName} ${lastName},<br><br>
                                            Your <strong style="color: #ffffff;">WeighGuard</strong> account has been suspended by an administrator due to a violation of platform policies.
                                        </p>
                                        
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #020617; border: 1px solid #1e293b; border-radius: 12px; margin-bottom: 24px;">
                                            <tr>
                                                <td style="padding: 24px;">
                                                    <h4 style="margin: 0 0 16px 0; font-size: 12px; font-weight: 700; color: #ffffff; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">Suspension Details</h4>
                                                    
                                                    <p style="margin: 0 0 4px 0; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Reason for Action</p>
                                                    <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 22px; color: #f8fafc;">${reason}</p>

                                                    <p style="margin: 0 0 4px 0; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">${isPermanent ? "Status" : "Suspended Until"}</p>
                                                    <p style="margin: 0;">
                                                        <span style="display: inline-block; font-size: 12px; font-weight: 800; color: #fb7185; background-color: rgba(244, 63, 94, 0.1); padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(244, 63, 94, 0.2); letter-spacing: 0.5px;">
                                                            ${suspensionDuration}
                                                        </span>
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <p style="margin: 0; font-size: 13px; line-height: 22px; color: #64748b; text-align: center;">
                                            During this period, you will not be able to log into the platform or accept assignments. If you believe this action was taken in error, please contact your dispatch administrator immediately.
                                        </p>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding: 24px 40px; background-color: #020617; border-top: 1px solid #1e293b; text-align: center;">
                                        <p style="margin: 0; font-size: 12px; color: #64748b;">
                                            &copy; ${new Date().getFullYear()} WeighGuard System. All rights reserved.
                                        </p>
                                    </td>
                                </tr>

                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            return { success: true };
        } catch (error) {
            console.error('Error sending suspension notice email:', error);
            return { success: false, error: 'Failed to send suspension notice email' };
        }
    }

    // Send Suspension Lifted Email
    static async sendSuspensionLiftedEmail(email, firstName, lastName) {
        const mailOptions = {   
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Account Access Restored - WeighGuard',
            html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    @media screen and (max-width: 600px) {
                        .content-table { width: 100% !important; }
                    }
                </style>
            </head>
            <body style="margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #cbd5e1; -webkit-font-smoothing: antialiased;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #020617; padding: 40px 20px;">
                    <tr>
                        <td align="center">
                            <table class="content-table" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; border-collapse: separate; overflow: hidden; width: 100%; max-width: 600px; text-align: left;">
                                
                                <tr>
                                    <td style="height: 6px; background-color: #10b981; line-height: 6px; font-size: 6px;">&nbsp;</td>
                                </tr>

                                <tr>
                                    <td style="padding: 32px 40px 16px 40px; text-align: center; background-color: #0f172a;">
                                        <table align="center" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
                                            <tr>
                                                <td style="height: 56px; width: 56px; border-radius: 50%; background-color: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); text-align: center; vertical-align: middle;">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle;">
                                                        <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
                                                        <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                                                    </svg>
                                                </td>
                                            </tr>
                                        </table>
                                        <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">Account Access Restored</h1>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding: 0 40px 40px 40px;">
                                        <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #94a3b8; text-align: center;">
                                            Hello ${firstName} ${lastName},<br><br>
                                            Good news! Your temporary account suspension has concluded, and full access to your <strong style="color: #ffffff;">WeighGuard</strong> platform has been successfully restored.
                                        </p>
                                        
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #020617; border: 1px solid #1e293b; border-radius: 12px; margin-bottom: 32px;">
                                            <tr>
                                                <td style="padding: 24px;">
                                                    
                                                    <p style="margin: 0 0 4px 0; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Current Status</p>
                                                    <p style="margin: 0 0 16px 0;">
                                                        <span style="display: inline-block; font-size: 12px; font-weight: 800; color: #34d399; background-color: rgba(16, 185, 129, 0.1); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.2); text-transform: uppercase; letter-spacing: 0.5px;">
                                                            Active & Verified
                                                        </span>
                                                    </p>

                                                    <p style="margin: 0 0 4px 0; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">What you can do now</p>
                                                    <p style="margin: 0; font-size: 14px; line-height: 22px; color: #cbd5e1;">
                                                        You may now log back into the system to view your dashboard, check vehicle assignments, and resume normal platform activity.
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <p style="margin: 0; font-size: 13px; line-height: 22px; color: #64748b; text-align: center;">
                                            As a friendly reminder, please ensure all future platform interactions adhere to our operational guidelines. Welcome back to the team!
                                        </p>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding: 24px 40px; background-color: #020617; border-top: 1px solid #1e293b; text-align: center;">
                                        <p style="margin: 0; font-size: 12px; color: #64748b;">
                                            &copy; ${new Date().getFullYear()} WeighGuard System. All rights reserved.
                                        </p>
                                    </td>
                                </tr>

                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            `
        }
        try {
            await transporter.sendMail(mailOptions);
            return { success: true };
        } catch (error) {
            console.error('Error sending suspension lifted email:', error);
            return { success: false, error: 'Failed to send suspension lifted email' };
        }
    }

    // =============================== 
    // Super Admin Emails 
    // ===============================

    // Super Admin Email Change Verification
    static async sendSuperAdminEmailChangeCode(email, firstName, lastName, verificationCode) {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Action Required: Verify Email Address Update - WeighGuard",
            html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    @media screen and (max-width: 600px) {
                        .content-table { width: 100% !important; }
                    }
                </style>
            </head>
            <body style="margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #cbd5e1; -webkit-font-smoothing: antialiased;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #020617; padding: 40px 20px;">
                    <tr>
                        <td align="center">
                            <table class="content-table" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; border-collapse: separate; overflow: hidden; width: 100%; max-width: 600px; text-align: left;">
                                
                                <tr>
                                    <td style="height: 6px; background-color: #3b82f6; line-height: 6px; font-size: 6px;">&nbsp;</td>
                                </tr>

                                <tr>
                                    <td style="padding: 32px 40px 16px 40px; text-align: center; background-color: #0f172a;">
                                        <table align="center" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;">
                                            <tr>
                                                <td style="height: 56px; width: 56px; border-radius: 50%; background-color: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); text-align: center; vertical-align: middle;">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle;">
                                                        <path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z"></path>
                                                        <path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10"></path>
                                                        <path d="M12 14v.01"></path>
                                                        <path d="M12 18v.01"></path>
                                                    </svg>
                                                </td>
                                            </tr>
                                        </table>
                                        <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">Confirm Email Change</h1>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding: 0 40px 40px 40px;">
                                        <p style="margin: 0 0 32px 0; font-size: 15px; line-height: 24px; color: #94a3b8; text-align: center;">
                                            Hello ${firstName} ${lastName},<br><br>
                                            We received a request to update the email address linked to your <strong style="color: #ffffff;">Super Admin</strong> account on WeighGuard. To authorize this change, please enter the verification code below.
                                        </p>
                                        
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 32px;">
                                            <tr>
                                                <td align="center">
                                                    <p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #64748b;">
                                                        Authorization Code
                                                    </p>
                                                    <p style="margin: 0; display: inline-block; font-size: 36px; font-weight: 800; letter-spacing: 12px; color: #3b82f6; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background-color: rgba(59, 130, 246, 0.05); padding: 12px 24px; border-radius: 12px; border: 1px dashed rgba(59, 130, 246, 0.3);">
                                                        ${verificationCode}
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: rgba(245, 158, 11, 0.05); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 12px; margin-bottom: 24px;">
                                            <tr>
                                                <td style="padding: 16px;">
                                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                                                        <tr>
                                                            <td width="24" valign="top" style="padding-right: 12px; padding-top: 2px;">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
                                                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                                                </svg>
                                                            </td>
                                                            <td valign="top" style="font-size: 13px; color: #cbd5e1; line-height: 1.6; margin: 0;">
                                                                <strong style="color: #fbbf24;">Security Alert:</strong> As a Super Admin, your account has root privileges. If you did not initiate this change, <strong style="color: #f8fafc;">do not share this code</strong>. Your current email will remain unchanged.
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <p style="margin: 0; font-size: 12px; line-height: 20px; color: #64748b; text-align: center;">
                                            This code will expire in exactly <strong>5 minutes</strong>.
                                        </p>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding: 24px 40px; background-color: #020617; border-top: 1px solid #1e293b; text-align: center;">
                                        <p style="margin: 0; font-size: 12px; color: #64748b;">
                                            &copy; ${new Date().getFullYear()} WeighGuard System. All rights reserved.
                                        </p>
                                    </td>
                                </tr>

                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            return { success: true };
        } catch (error) {
            console.error('Error sending Super Admin email change code:', error);
            return { success: false, error: 'Failed to send Super Admin verification email' };
        }
    }

}

export default nodemailerService;