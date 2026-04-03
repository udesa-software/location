const { z } = require('zod');

const envSchema = z.object({
  PORT: z.string().default('3002'),

  MONGODB_URI: z.string(),

  JWT_SECRET: z.string(),

  // CA.4: intervalo mínimo entre actualizaciones de ubicación (en segundos)
  // Cuando exista el servicio de preferencias de usuario, se usará el valor configurado por el usuario.
  MIN_UPDATE_INTERVAL_SECONDS: z.string().default('60'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

module.exports = { env };
