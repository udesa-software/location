const { env } = require('../config/env');
const { AppError } = require('../middlewares/errorHandler');

const usersClient = {
  // Devuelve los perfiles (id + username) de una lista de userIds.
  // Llama al endpoint interno del users service (sin autenticación — red Docker privada).
  async getUserProfiles(userIds) {
    if (!userIds.length) return [];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(
        `${env.USERS_SERVICE_URL}/internal/users/profiles`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        throw new AppError(502, 'Error al consultar el servicio de usuarios');
      }

      const data = await response.json();
      return data.users ?? [];
    } catch (err) {
      if (err.name === 'AbortError') throw new AppError(504, 'Timeout al consultar el servicio de usuarios');
      if (err instanceof AppError) throw err;
      throw new AppError(502, 'Error de comunicación con el servicio de usuarios');
    } finally {
      clearTimeout(timer);
    }
  },
};

module.exports = { usersClient };
