const { locationRepository } = require('./location.repository');
const { friendsClient } = require('../../clients/friendsClient');
const { AppError } = require('../../middlewares/errorHandler');
const { env } = require('../../config/env');

// H7 CA.4: distancia en metros entre dos coordenadas (fórmula de Haversine)
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // radio de la Tierra en metros
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// H2 CA.1: distancia legible en km o metros
function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// H7 CA.4: verifica si la etiqueta sigue siendo válida (no pasaron 6h ni se alejó >500m)
function isLabelStillValid(location, currentLat, currentLon) {
  if (!location.label) return false;

  // Más de 6 horas desde que se creó la etiqueta
  const sixHoursMs = 6 * 60 * 60 * 1000;
  if (Date.now() - new Date(location.labelCreatedAt).getTime() > sixHoursMs) return false;

  // Se alejó más de 500 metros del punto donde creó la etiqueta
  const dist = haversineMeters(
    location.labelLatitude, location.labelLongitude,
    currentLat, currentLon
  );
  if (dist > 500) return false;

  return true;
}

const locationService = {
  // H1: actualizar ubicación del usuario
  async updateLocation(userId, { latitude, longitude, locationUpdateFrequency }) {
    // CA.4: el cliente puede pasar su frecuencia configurada (de preferences).
    // Si no la pasa, se usa el valor global de env como fallback.
    const minIntervalSeconds = locationUpdateFrequency
      ? locationUpdateFrequency * 60
      : parseInt(env.MIN_UPDATE_INTERVAL_SECONDS, 10);

    const lastLocation = await locationRepository.findLastByUser(userId);

    if (lastLocation) {
      const secondsSinceLastUpdate = (Date.now() - new Date(lastLocation.createdAt).getTime()) / 1000;
      if (secondsSinceLastUpdate < minIntervalSeconds) {
        throw new AppError(
          429,
          `Demasiadas actualizaciones. Esperá al menos ${Math.ceil(minIntervalSeconds / 60)} minutos entre envíos.`
        );
      }
    }

    // H7 CA.4: si había etiqueta, verificar si sigue siendo válida según la nueva posición.
    // Si ya no es válida, se guarda sin etiqueta (auto-invalidación).
    let labelData = null;
    if (lastLocation?.label && isLabelStillValid(lastLocation, latitude, longitude)) {
      labelData = {
        label: lastLocation.label,
        labelLatitude: lastLocation.labelLatitude,
        labelLongitude: lastLocation.labelLongitude,
        labelCreatedAt: lastLocation.labelCreatedAt,
      };
    }

    await locationRepository.save(userId, latitude, longitude, labelData);
    return { message: 'Ubicación actualizada' };
  },

  // H2: devuelve las ubicaciones de los amigos del usuario con distancia calculada.
  // CA.2: solo amigos confirmados — se consulta el servicio de friends internamente.
  async getFriendsLocations(userId, { latitude, longitude }) {
    const friendIds = await friendsClient.getFriendIds(userId);

    if (friendIds.length === 0) {
      return { friends: [] };
    }

    const locations = await locationRepository.findLastByUsers(friendIds);

    // H7 CA.4: filtrar etiquetas expiradas en la respuesta
    const friends = locations.map((loc) => {
      const distanceMeters = haversineMeters(latitude, longitude, loc.latitude, loc.longitude);

      const labelValid = loc.label && isLabelStillValid(
        { label: loc.label, labelCreatedAt: loc.labelCreatedAt, labelLatitude: loc.latitude, labelLongitude: loc.longitude },
        loc.latitude, loc.longitude
      );

      return {
        userId: loc._id,
        latitude: loc.latitude,
        longitude: loc.longitude,
        distanceMeters: Math.round(distanceMeters),
        distance: formatDistance(distanceMeters),
        label: labelValid ? loc.label : null,
        updatedAt: loc.updatedAt,
      };
    });

    return { friends };
  },

  // H7: guardar o actualizar la etiqueta de lugar manual del usuario.
  // CA.1: máx 30 chars. CA.5: sanitiza HTML. CA.3: null/vacío limpia la etiqueta.
  async updateLabel(userId, { label }) {
    const lastLocation = await locationRepository.findLastByUser(userId);
    if (!lastLocation) {
      throw new AppError(400, 'Debés enviar tu ubicación antes de crear una etiqueta');
    }

    let sanitized = null;
    if (label && label.trim().length > 0) {
      // CA.5: eliminar tags HTML para prevenir XSS
      sanitized = label.replace(/<[^>]*>/g, '').trim();
    }

    await locationRepository.updateLabel(
      userId,
      sanitized,
      lastLocation.latitude,
      lastLocation.longitude
    );

    return { message: sanitized ? 'Etiqueta actualizada' : 'Etiqueta eliminada' };
  },
};

module.exports = { locationService };
