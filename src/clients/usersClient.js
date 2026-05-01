const { env } = require('../config/env');
const { AppError } = require('../middlewares/errorHandler');

const usersClient = {
  async getUserProfiles(userIds) {
    if (!userIds || !userIds.length) return [];

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

  // H5: sincroniza el flag is_private al users service para que el buscador lo filtre
  async updateUserPrivacy(userId, isPrivate) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(
        `${env.USERS_SERVICE_URL}/internal/users/${userId}/privacy`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isPrivate }),
          signal: controller.signal,
        }
      );
      if (!response.ok) throw new AppError(502, 'Error al actualizar privacidad en el servicio de usuarios');
    } catch (err) {
      if (err.name === 'AbortError') throw new AppError(504, 'Timeout al actualizar privacidad');
      if (err instanceof AppError) throw err;
      throw new AppError(502, 'Error de comunicación con el servicio de usuarios');
    } finally {
      clearTimeout(timer);
    }
  },

  // H6 CA.2: obtiene las preferencias del usuario (radio de búsqueda para el radar)
  async getPreferences(userId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(
        `${env.USERS_SERVICE_URL}/internal/users/${userId}/preferences`,
        { signal: controller.signal }
      );
      if (!response.ok) throw new AppError(502, 'Error al obtener preferencias del usuario');
      return await response.json();
    } catch (err) {
      if (err.name === 'AbortError') throw new AppError(504, 'Timeout al obtener preferencias');
      if (err instanceof AppError) throw err;
      throw new AppError(502, 'Error de comunicación con el servicio de usuarios');
    } finally {
      clearTimeout(timer);
    }
  },
};

module.exports = { usersClient };
