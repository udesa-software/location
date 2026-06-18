const express = require('express');
const locationRouter = require('./modules/locations/location.routes');
const { errorHandler } = require('./middlewares/errorHandler');
const { httpLogger } = require('./observability/httpMiddleware');

const app = express();

app.use(express.json());
app.use(httpLogger);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/locations', locationRouter);

// Global error handler — must be last
app.use(errorHandler);

module.exports = app;
