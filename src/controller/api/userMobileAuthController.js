import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../../database/db.js';

class UserMobileAuthController {
  static buildTokenPayload(user) {
    return {
      sub: user.id,
      email: user.email,
      type: 'mobile_user'
    };
  }

  static normalizeStatus(status) {
    return String(status || '').trim().toLowerCase();
  }

  static async login(req, res) {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required.'
        });
      }

      const query = `
        SELECT id, first_name, last_name, email, password, status, is_verified, deleted_at
        FROM users
        WHERE LOWER(email) = $1
        LIMIT 1;
      `;

      const { rows } = await db.query(query, [email]);
      if (!rows.length) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password.'
        });
      }

      const user = rows[0];
      if (user.deleted_at) {
        return res.status(403).json({
          success: false,
          message: 'This account has been deleted. Please contact support.'
        });
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password.'
        });
      }

      const status = UserMobileAuthController.normalizeStatus(user.status);
      if (!user.is_verified) {
        return res.status(403).json({
          success: false,
          message: 'Account is not verified yet. Please verify your account first.'
        });
      }

      if (['inactive', 'suspended', 'banned', 'pending'].includes(status)) {
        return res.status(403).json({
          success: false,
          message: `Account status is ${status}. Please contact support.`
        });
      }

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        return res.status(500).json({
          success: false,
          message: 'JWT secret is not configured on the server.'
        });
      }

      const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
      const token = jwt.sign(
        UserMobileAuthController.buildTokenPayload(user),
        jwtSecret,
        { expiresIn }
      );

      return res.status(200).json({
        success: true,
        message: 'Login successful.',
        token,
        tokenType: 'Bearer',
        expiresIn,
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          status: user.status
        }
      });
    } catch (error) {
      console.error('Error in mobile login:', error);
      return res.status(500).json({
        success: false,
        message: 'An error occurred while logging in.'
      });
    }
  }

  static async me(req, res) {
    try {
      const userId = Number(req.mobileAuth?.sub);
      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token payload.'
        });
      }

      const query = `
        SELECT id, first_name, last_name, email, status, is_verified, deleted_at
        FROM users
        WHERE id = $1
        LIMIT 1;
      `;

      const { rows } = await db.query(query, [userId]);
      if (!rows.length) {
        return res.status(401).json({
          success: false,
          message: 'User not found for this session.'
        });
      }

      const user = rows[0];
      const status = UserMobileAuthController.normalizeStatus(user.status);

      if (user.deleted_at || !user.is_verified || ['inactive', 'suspended', 'banned', 'pending'].includes(status)) {
        return res.status(401).json({
          success: false,
          message: 'Session is no longer valid for this account.'
        });
      }

      return res.status(200).json({
        success: true,
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          status: user.status
        }
      });
    } catch (error) {
      console.error('Error fetching mobile session profile:', error);
      return res.status(500).json({
        success: false,
        message: 'An error occurred while validating session.'
      });
    }
  }

  static async changePassword(req, res) {
    try {
      const userId = Number(req.mobileAuth?.sub);
      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token payload.'
        });
      }

      const currentPassword = String(req.body?.currentPassword || '');
      const newPassword = String(req.body?.newPassword || '');
      const confirmPassword = String(req.body?.confirmPassword || '');

      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({
          success: false,
          message: 'All password fields are required.'
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'New password must be at least 8 characters.'
        });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          success: false,
          message: 'New password and confirm password do not match.'
        });
      }

      if (currentPassword === newPassword) {
        return res.status(400).json({
          success: false,
          message: 'New password must be different from current password.'
        });
      }

      const query = `
        SELECT id, password, status, is_verified, deleted_at
        FROM users
        WHERE id = $1
        LIMIT 1;
      `;

      const { rows } = await db.query(query, [userId]);
      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: 'User not found.'
        });
      }

      const user = rows[0];
      const status = UserMobileAuthController.normalizeStatus(user.status);
      if (user.deleted_at || !user.is_verified || ['inactive', 'suspended', 'banned', 'pending'].includes(status)) {
        return res.status(403).json({
          success: false,
          message: 'Account is not allowed to change password.'
        });
      }

      const currentMatch = await bcrypt.compare(currentPassword, user.password);
      if (!currentMatch) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect.'
        });
      }

      const saltRounds = 12;
      const newHashedPassword = await bcrypt.hash(newPassword, saltRounds);

      await db.query(
        `
          UPDATE users
          SET password = $1,
              updated_at = NOW()
          WHERE id = $2;
        `,
        [newHashedPassword, userId]
      );

      return res.status(200).json({
        success: true,
        message: 'Password updated successfully.'
      });
    } catch (error) {
      console.error('Error changing mobile user password:', error);
      return res.status(500).json({
        success: false,
        message: 'An error occurred while changing password.'
      });
    }
  }
}

export default UserMobileAuthController;
