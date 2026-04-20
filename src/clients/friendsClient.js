// Cliente HTTP para consultar el servicio de friends.
// Se usa para verificar la lista de amigos antes de devolver ubicaciones (H2 CA.2).

const { env } = require('../config/env');
const { AppError } = require('../middlewares/errorHandler');

const friendsClient = {
  // Devuelve los IDs de los amigos confirmados de un usuario.
  // Llama al endpoint interno del friends service (sin autenticación — red Docker privada).
  async getFriendIds(userId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(
        `${env.FRIENDS_SERVICE_URL}/api/friends/user/${userId}/friends`,
        { signal: controller.signal }
      );

      if (!response.ok) {
        throw new AppError(502, 'Error al consultar el servicio de amigos');
      }

      const data = await response.json();
      return data.friendIds ?? [];
    } catch (err) {
      if (err.name === 'AbortError') throw new AppError(504, 'Timeout al consultar el servicio de amigos');
      if (err instanceof AppError) throw err;
      throw new AppError(502, 'Error de comunicación con el servicio de amigos');
    } finally {
      clearTimeout(timer);
    }
  },
};

module.exports = { friendsClient };
