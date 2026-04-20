const { z } = require('zod');

const envSchema = z.object({
  PORT: z.string().default('3002'),

  MONGODB_URI: z.string(),

  JWT_SECRET: z.string(),

  // CA.4: intervalo mínimo entre actualizaciones de ubicación (en segundos).
  // Actúa como fallback si el cliente no envía su locationUpdateFrequency configurada.
  MIN_UPDATE_INTERVAL_SECONDS: z.string().default('60'),

  // H2 CA.2: URL del servicio de friends para verificar amistades antes de devolver ubicaciones
  FRIENDS_SERVICE_URL: z.string().url(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

module.exports = { env };
