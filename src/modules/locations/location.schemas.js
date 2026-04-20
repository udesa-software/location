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

  // CA.4: la app puede pasar la frecuencia configurada por el usuario (de preferences)
  // para que el rate limiting use ese valor en vez del global de env.
  // Valores válidos: 5, 15, 30 minutos.
  locationUpdateFrequency: z
    .number()
    .refine((val) => [5, 15, 30].includes(val), {
      message: 'La frecuencia debe ser 5, 15 o 30 minutos',
    })
    .optional(),
});

// H2: coordenadas del usuario para calcular distancias a sus amigos
const getFriendsLocationsSchema = z.object({
  latitude: z
    .number({ required_error: 'La latitud es obligatoria', invalid_type_error: 'La latitud debe ser un número' })
    .min(-90).max(90),
  longitude: z
    .number({ required_error: 'La longitud es obligatoria', invalid_type_error: 'La longitud debe ser un número' })
    .min(-180).max(180),
});

// H7 CA.1: etiqueta máx 30 chars, puede ser null/vacío para borrar (CA.3)
const updateLabelSchema = z.object({
  label: z
    .string()
    .max(30, 'La etiqueta no puede superar los 30 caracteres')
    .nullable()
    .optional(),
});

module.exports = { updateLocationSchema, getFriendsLocationsSchema, updateLabelSchema };
