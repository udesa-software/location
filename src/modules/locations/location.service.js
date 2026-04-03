const { locationRepository } = require('./location.repository');
const { AppError } = require('../../middlewares/errorHandler');
const { env } = require('../../config/env');

const locationService = {
  // H1: actualizar ubicación del usuario
  async updateLocation(userId, { latitude, longitude }) {
    // CA.4: verificar que no se supere la frecuencia configurada
    // Nota: cuando exista el servicio de preferencias de usuario, el intervalo
    // mínimo se obtendrá desde allí. Por ahora se usa el valor global de env.
    const minIntervalSeconds = parseInt(env.MIN_UPDATE_INTERVAL_SECONDS, 10);
    const lastLocation = await locationRepository.findLastByUser(userId);

    if (lastLocation) {
      const secondsSinceLastUpdate = (Date.now() - new Date(lastLocation.createdAt).getTime()) / 1000;
      if (secondsSinceLastUpdate < minIntervalSeconds) {
        throw new AppError(
          429,
          `Demasiadas actualizaciones. Esperá al menos ${minIntervalSeconds} segundos entre envíos.`
        );
      }
    }

    await locationRepository.save(userId, latitude, longitude);
    return { message: 'Ubicación actualizada' };
  },
};

module.exports = { locationService };
