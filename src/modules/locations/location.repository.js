const { Location } = require('./location.model');

const locationRepository = {
  // Devuelve la última ubicación registrada de un usuario
  async findLastByUser(userId) {
    return Location.findOne({ userId }).sort({ createdAt: -1 }).lean();
  },

  // Guarda una nueva actualización de ubicación
  async save(userId, latitude, longitude) {
    return Location.create({ userId, latitude, longitude });
  },
};

module.exports = { locationRepository };
