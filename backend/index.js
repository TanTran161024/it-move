require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const path = require('path');
const routes = require('./routes');
const { resumeDubbingJobs } = require('./services/dubbingService');

const app = express();
const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function isLocalDevelopmentOrigin(origin) {
  return /^http:\/\/localhost:\d+$/.test(origin);
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || configuredOrigins.includes(origin) || isLocalDevelopmentOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));

// Kết nối MySQL
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'movie_website',
});

app.locals.db = db;
app.use('/media/dubbing', express.static(path.join(__dirname, 'storage', 'dubbing')));
app.use('/api', routes);

app.get('/', (req, res) => {
  res.send('Movie Website API is running!');
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || 'localhost';
app.listen(PORT, HOST, () => {
  console.log(`Server is running at http://${HOST}:${PORT}`);
  resumeDubbingJobs(db).catch((error) => {
    console.error(`Cannot resume dubbing jobs: ${error.message}`);
  });
}); 
