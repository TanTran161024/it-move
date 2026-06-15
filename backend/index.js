require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const routes = require('./routes');

const app = express();
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));
app.use(express.json());

// Kết nối MySQL
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'movie_website',
});

app.locals.db = db;
app.use('/api', routes);

app.get('/', (req, res) => {
  res.send('Movie Website API is running!');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 
