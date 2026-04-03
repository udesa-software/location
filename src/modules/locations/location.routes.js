const { Router } = require('express');
const { locationController } = require('./location.controller');
const { validate } = require('../../middlewares/validate');
const { authenticate } = require('../../middlewares/authenticate');
const { updateLocationSchema } = require('./location.schemas');

const router = Router();

// POST /api/locations — H1: enviar ubicación actual
router.post('/', authenticate, validate(updateLocationSchema), locationController.updateLocation);

module.exports = router;
