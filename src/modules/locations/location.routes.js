const { Router } = require('express');
const { locationController } = require('./location.controller');
const { validate } = require('../../middlewares/validate');
const { authenticate } = require('../../middlewares/authenticate');
const { updateLocationSchema, getFriendsLocationsSchema, updateLabelSchema, setPrivacySchema, radarSchema, updatePinColorSchema } = require('./location.schemas');

const router = Router();

// POST /api/locations — H1: enviar ubicación actual
router.post('/', authenticate, validate(updateLocationSchema), locationController.updateLocation);

// POST /api/locations/friends — H2: ubicaciones de amigos + distancia
// Se usa POST porque el cliente envía su posición actual en el body para calcular distancias
router.post('/friends', authenticate, validate(getFriendsLocationsSchema), locationController.getFriendsLocations);

// PATCH /api/locations/privacy — H5: activar o desactivar modo privado
router.patch('/privacy', authenticate, validate(setPrivacySchema), locationController.setPrivacyStatus);

// GET /api/locations/privacy — H5: consultar estado actual del modo privado
router.get('/privacy', authenticate, locationController.getPrivacyStatus);

// POST /api/locations/radar — H6: descubrir usuarios cercanos no-amigos con modo privado desactivado
router.post('/radar', authenticate, validate(radarSchema), locationController.getRadar);

// PUT /api/locations/label — H7: crear o actualizar etiqueta de lugar manual
router.put('/label', authenticate, validate(updateLabelSchema), locationController.updateLabel);

// DELETE /api/locations/label — H7 CA.3: borrar etiqueta
router.delete('/label', authenticate, locationController.deleteLabel);

// PATCH /api/locations/pin-color — H9: guardar el color del pin del usuario
router.patch('/pin-color', authenticate, validate(updatePinColorSchema), locationController.updatePinColor);

// GET /api/locations/friends/:friendId/profile — Visualizar perfil detallado (biografía, presencia, e historial) de un amigo
router.get('/friends/:friendId/profile', authenticate, locationController.getFriendProfile);

module.exports = router;
