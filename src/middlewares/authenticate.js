const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { AppError } = require('./errorHandler');

async function authenticate(req, _res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return next(new AppError(401, 'Token de autenticación requerido'));
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);

    // Solo usuarios regulares pueden enviar ubicación (no admins)
    if (payload.role) {
      return next(new AppError(403, 'Acceso denegado'));
    }

    req.user = payload;
    next();
  } catch {
    next(new AppError(401, 'Token inválido o expirado'));
  }
}

module.exports = { authenticate };
