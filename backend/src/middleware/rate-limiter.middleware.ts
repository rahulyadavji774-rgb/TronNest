import rateLimit from 'express-rate-limit';

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes'
  }
});

export const sensitiveActionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 15, // Limit each IP to 15 sensitive requests per window (e.g. login, passcode, transfer)
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many high-frequency actions, security delay triggered. Please try again in 5 minutes'
  }
});
