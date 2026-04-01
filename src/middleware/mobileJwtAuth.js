import jwt from 'jsonwebtoken';

class MobileJwtAuth {
  static extractToken(req) {
    const authHeader = String(req.headers?.authorization || '').trim();
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return null;
    }

    return authHeader.slice(7).trim() || null;
  }

  static verify(req, res, next) {
    const token = MobileJwtAuth.extractToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Missing or invalid authorization token.'
      });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({
        success: false,
        message: 'JWT secret is not configured on the server.'
      });
    }

    try {
      const payload = jwt.verify(token, jwtSecret);
      req.mobileAuth = payload;
      return next();
    } catch (_error) {
      return res.status(401).json({
        success: false,
        message: 'Session expired or invalid token.'
      });
    }
  }
}

export default MobileJwtAuth;
