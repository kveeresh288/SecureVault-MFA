const jwt = require('jsonwebtoken');

/**
 * Middleware that verifies the JWT stored in the HttpOnly cookie.
 * If valid, attaches the decoded user ID to `req.userId`.
 */
const authenticate = (req, res, next) => {
  const token = req.cookies.jwt;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    console.error('[AuthMiddleware] JWT verification failed:', err.message);

    // Clear the invalid cookie
    res.clearCookie('jwt', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    });

    return res.status(401).json({
      success: false,
      message: 'Session expired or invalid. Please log in again.',
    });
  }
};

module.exports = { authenticate };