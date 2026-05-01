const { Location, LocationPrivacy } = require('./location.model');

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
      // H5 CA.2: filtrar amigos que tienen el modo privado activo
      {
        $lookup: {
          from: 'locationprivacies',
          localField: '_id',
          foreignField: 'userId',
          as: 'privacy',
        },
      },
      {
        $match: {
          $or: [
            { privacy: { $size: 0 } },
            { 'privacy.0.isPrivate': false },
          ],
        },
      },
    ]);
  },

  // H6 CA.1+CA.2: busca la última ubicación de usuarios cercanos (bounding box grueso),
  // excluyendo a los usuarios indicados (el propio userId + sus amigos) y a los privados.
  // El filtro exacto por Haversine se aplica en el service sobre el resultado de esta query.
  async findNearbyUsers(lat, lon, radiusKm, excludeUserIds) {
    const deltaLat = radiusKm / 111;
    const deltaLon = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

    return Location.aggregate([
      {
        $match: {
          latitude: { $gte: lat - deltaLat, $lte: lat + deltaLat },
          longitude: { $gte: lon - deltaLon, $lte: lon + deltaLon },
          userId: { $nin: excludeUserIds },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$userId',
          latitude: { $first: '$latitude' },
          longitude: { $first: '$longitude' },
          updatedAt: { $first: '$createdAt' },
        },
      },
      // Unir con la colección de privacidad para filtrar usuarios en modo privado
      {
        $lookup: {
          from: 'locationprivacies',
          localField: '_id',
          foreignField: 'userId',
          as: 'privacy',
        },
      },
      // CA.1: excluir usuarios con modo privado activo.
      // Si no tienen registro de privacidad (array vacío), son públicos por defecto.
      {
        $match: {
          $or: [
            { privacy: { $size: 0 } },
            { 'privacy.0.isPrivate': false },
          ],
        },
      },
    ]);
  },

  // H5: devuelve el registro de privacidad del usuario, o null si no existe (=público por defecto)
  async findPrivacyByUser(userId) {
    return LocationPrivacy.findOne({ userId }).lean();
  },

  // H5: crea o actualiza el flag de modo privado para el usuario (upsert)
  async upsertPrivacy(userId, isPrivate) {
    return LocationPrivacy.findOneAndUpdate(
      { userId },
      { $set: { isPrivate } },
      { upsert: true, new: true }
    ).lean();
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
