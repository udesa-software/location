require('dotenv').config();

const { env } = require('./config/env');
const { connectDB } = require('./config/database');
const app = require('./app');

async function start() {
  await connectDB();

  const port = parseInt(env.PORT, 10);
  app.listen(port, () => {
    console.log(`Location service running on port ${port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
