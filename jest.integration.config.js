module.exports = {
  testMatch: ['<rootDir>/tests/integration/**/*.integration.test.js'],
  setupFiles: ['<rootDir>/tests/setupEnv.integration.js'],
  testTimeout: 30000,
  maxWorkers: 1,    // evita condiciones de carrera sobre la misma DB de test
  forceExit: true,  // mongoose mantiene handles abiertos — forzar salida al terminar
  coverageDirectory: 'coverage-integration',
  collectCoverageFrom: [
    'src/modules/locations/location.routes.js',
    'src/modules/locations/location.controller.js',
    'src/modules/locations/location.service.js',
    'src/modules/locations/location.repository.js',
    'src/middlewares/authenticate.js',
    'src/middlewares/validate.js',
  ],
};
