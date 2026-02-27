
const sqlite3 = require('sqlite3').verbose();
let db;
const databasePath = process.env.DATABASE_PATH || './urlshortener.db';

function initDb(callback) {
    db = new sqlite3.Database(databasePath, (err) => {
        if (err) {
            console.error(err.message);
            callback(err);
        } else {
            console.log('Connected to the urlshortener database.');
            db.serialize(() => {
                db.run(`CREATE TABLE IF NOT EXISTS urls (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    long_url TEXT NOT NULL,
                    short_id TEXT NOT NULL UNIQUE,
                    password TEXT,
                    expires_at INTEGER,
                    visits INTEGER DEFAULT 0
                )`, (err) => {
                    if (err) {
                        console.error(err.message);
                        callback(err);
                    } else {
                        console.log('URLs table created or already exists.');
                        db.run(`CREATE TABLE IF NOT EXISTS visits (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            url_id INTEGER NOT NULL,
                            visited_at INTEGER NOT NULL,
                            ip_address TEXT,
                            user_agent TEXT,
                            FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE
                        )`, (err) => {
                            if (err) {
                                console.error(err.message);
                                callback(err);
                            } else {
                                console.log('Visits table created or already exists.');
                                db.run(`CREATE TABLE IF NOT EXISTS settings (
                                    key TEXT PRIMARY KEY,
                                    value TEXT
                                )`, (err) => {
                                    if (err) {
                                        console.error(err.message);
                                        callback(err);
                                    } else {
                                        console.log('Settings table created or already exists.');
                                        callback(null, db);
                                    }
                                });
                            }
                        });
                    }
                });
            });
        }
    });
}

function getDb() {
    if (!db) {
        throw new Error('Db has not been initialized. Please call initDb first.');
    }
    return db;
}

module.exports = { initDb, getDb };
