const { z } = require('zod');

// CA.2: validar que las coordenadas tengan formato válido
const updateLocationSchema = z.object({
  latitude: z
    .number({ required_error: 'La latitud es obligatoria', invalid_type_error: 'La latitud debe ser un número' })
    .min(-90, 'La latitud debe estar entre -90 y 90')
    .max(90, 'La latitud debe estar entre -90 y 90'),

  longitude: z
    .number({ required_error: 'La longitud es obligatoria', invalid_type_error: 'La longitud debe ser un número' })
    .min(-180, 'La longitud debe estar entre -180 y 180')
    .max(180, 'La longitud debe estar entre -180 y 180'),
});

module.exports = { updateLocationSchema };
