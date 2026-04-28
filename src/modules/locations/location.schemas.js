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

// H5: body para activar/desactivar el modo privado
const setPrivacySchema = z.object({
  isPrivate: z.boolean({ required_error: 'isPrivate es obligatorio', invalid_type_error: 'isPrivate debe ser un booleano' }),
});

// H6: body del radar de descubrimiento — coordenadas + radio configurado por el usuario
const radarSchema = z.object({
  latitude: z
    .number({ required_error: 'La latitud es obligatoria', invalid_type_error: 'La latitud debe ser un número' })
    .min(-90).max(90),
  longitude: z
    .number({ required_error: 'La longitud es obligatoria', invalid_type_error: 'La longitud debe ser un número' })
    .min(-180).max(180),
  // CA.2: radio en km configurado en preferencias (mismo rango que search_radius_km: 1-50)
  radiusKm: z
    .number({ required_error: 'El radio es obligatorio', invalid_type_error: 'El radio debe ser un número' })
    .min(1, 'El radio mínimo es 1 km')
    .max(50, 'El radio máximo es 50 km'),
});

module.exports = { updateLocationSchema, getFriendsLocationsSchema, updateLabelSchema, setPrivacySchema, radarSchema };
