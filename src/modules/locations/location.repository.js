const { Location } = require('./location.model');

const locationRepository = {
  // Devuelve la última ubicación registrada de un usuario
  async findLastByUser(userId) {
    return Location.findOne({ userId }).sort({ createdAt: -1 }).lean();
  },

  // Guarda una nueva actualización de ubicación.
  // Si el usuario tiene una etiqueta activa en el documento anterior, la transfiere
  // para que no se pierda al crear una nueva entrada de coordenadas.
  async save(userId, latitude, longitude, labelData = null) {
    return Location.create({
      userId,
      latitude,
      longitude,
      label: labelData?.label ?? null,
      labelLatitude: labelData?.labelLatitude ?? null,
      labelLongitude: labelData?.labelLongitude ?? null,
      labelCreatedAt: labelData?.labelCreatedAt ?? null,
    });
  },

  // H2: devuelve la última ubicación de cada userId de la lista (en una sola query)
  async findLastByUsers(userIds) {
    if (userIds.length === 0) return [];
    // Agrupación con $sort + $group para obtener el último doc por userId
    return Location.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$userId',
          latitude: { $first: '$latitude' },
          longitude: { $first: '$longitude' },
          label: { $first: '$label' },
          labelCreatedAt: { $first: '$labelCreatedAt' },
          updatedAt: { $first: '$createdAt' },
        },
      },
    ]);
  },

  // H7: actualiza la etiqueta en el documento más reciente del usuario.
  // Si label es null limpia la etiqueta (CA.3).
  async updateLabel(userId, label, latitude, longitude) {
    const now = label ? new Date() : null;
    return Location.findOneAndUpdate(
      { userId },
      {
        $set: {
          label,
          labelLatitude: label ? latitude : null,
          labelLongitude: label ? longitude : null,
          labelCreatedAt: now,
        },
      },
      { sort: { createdAt: -1 }, new: true }
    ).lean();
  },
};

module.exports = { locationRepository };
