module.exports = {
  testMatch: ['<rootDir>/src/modules/locations/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'src/modules/locations/location.service.js',
  ],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
};
