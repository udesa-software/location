const { Router } = require('express');
const { locationController } = require('./location.controller');
const { validate } = require('../../middlewares/validate');
const { authenticate } = require('../../middlewares/authenticate');
const { updateLocationSchema, getFriendsLocationsSchema, updateLabelSchema } = require('./location.schemas');

const router = Router();

// POST /api/locations — H1: enviar ubicación actual
router.post('/', authenticate, validate(updateLocationSchema), locationController.updateLocation);

// POST /api/locations/friends — H2: ubicaciones de amigos + distancia
// Se usa POST porque el cliente envía su posición actual en el body para calcular distancias
router.post('/friends', authenticate, validate(getFriendsLocationsSchema), locationController.getFriendsLocations);

// PUT /api/locations/label — H7: crear o actualizar etiqueta de lugar manual
router.put('/label', authenticate, validate(updateLabelSchema), locationController.updateLabel);

// DELETE /api/locations/label — H7 CA.3: borrar etiqueta
router.delete('/label', authenticate, locationController.deleteLabel);

module.exports = router;
