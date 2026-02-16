const fs = require('fs');

if (!fs.existsSync('./points.json')) {
  fs.writeFileSync('./points.json', JSON.stringify({}));
}

const readDatabase = () => {
  try {
    const data = fs.readFileSync('./points.json', 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading database:', err);
    return {};
  }
};

const saveDatabase = (data) => {
  try {
    fs.writeFileSync('./points.json', JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('Error saving to database:', err);
    return false;
  }
};

const getUserPoints = (userId) => {
  const db = readDatabase();
  return db[userId] || 0;
};

const addPoints = (userId, points = 1) => {
  const client = require('./index.js').client;
  const user = client.users.cache.get(userId);
  if (user && user.bot) return false;

  const db = readDatabase();
  db[userId] = (db[userId] || 0) + points;
  return saveDatabase(db);
};

const setPoints = (userId, points = 0) => {
  const db = readDatabase();
  db[userId] = points;
  return saveDatabase(db);
};

const resetAllPoints = () => {
  return saveDatabase({});
};

const getTopUsers = (limit = 10) => {
  const db = readDatabase();
  return Object.entries(db)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
};

const removePoints = (userId, points = 1) => {
  const db = readDatabase();
  if (db[userId]) {
    db[userId] = Math.max(0, db[userId] - points);
    return saveDatabase(db);
  }
  return false;
};

const removePointsFromAll = (points = 1) => {
  const db = readDatabase();
  for (const userId in db) {
    db[userId] = Math.max(0, db[userId] - points);
  }
  return saveDatabase(db);
};

module.exports = {
  readDatabase,
  saveDatabase,
  getUserPoints,
  addPoints,
  setPoints,
  resetAllPoints,
  getTopUsers,
  removePoints,
  removePointsFromAll
};