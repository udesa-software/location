// Carga las variables de entorno ANTES de que cualquier módulo las requiera.
// Jest ejecuta setupFiles antes de importar el archivo de tests.
process.env.PORT = '3002';

process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/location_test';

process.env.JWT_SECRET = 'test-jwt-secret-muy-largo-para-tests';

process.env.MIN_UPDATE_INTERVAL_SECONDS = '0';

// Estas URLs nunca se llaman (los clientes son mockeados), pero Zod las valida al cargar env.js
process.env.FRIENDS_SERVICE_URL = 'http://localhost:9998';
process.env.USERS_SERVICE_URL   = 'http://localhost:9999';
