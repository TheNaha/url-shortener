
const express = require('express');
const { getDb } = require('./database.js');
const { nanoid } = require('nanoid');
const bcrypt = require('bcrypt');
const ms = require('ms');
const saltRounds = 10;

// API Key Authentication Middleware
async function authenticateApiKey(req, res, next) {
    const db = getDb();
    const apiKeyHeader = req.header('X-API-Key');

    if (!apiKeyHeader) {
        return res.status(401).json({ error: 'Access Denied: No API Key Provided!' });
    }

    db.get('SELECT value FROM settings WHERE key = ?', ['api_key'], async (err, row) => {
        if (err) {
            console.error('Error retrieving API key from DB:', err.message);
            return res.status(500).json({ error: 'Internal Server Error.' });
        }
        if (!row || !row.value) {
            return res.status(401).json({ error: 'Access Denied: API Key not configured.' });
        }

        const storedHashedApiKey = row.value;

        try {
            const isMatch = await bcrypt.compare(apiKeyHeader, storedHashedApiKey);
            if (isMatch) {
                next();
            } else {
                return res.status(401).json({ error: 'Access Denied: Invalid API Key.' });
            }
        } catch (compareErr) {
            console.error('Error comparing API keys:', compareErr);
            return res.status(500).json({ error: 'Internal Server Error.' });
        }
    });
}

const router = express.Router();

// GET all URLs
router.get('/urls', (req, res) => {
    const db = getDb();
    const query = 'SELECT id, short_id, long_url, visits, password IS NOT NULL as has_password, expires_at FROM urls';
    db.all(query, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ urls: rows });
    });
});

// GET a single URL by ID
router.get('/urls/:id', (req, res) => {
    const db = getDb();
    const { id } = req.params;
    const query = 'SELECT id, short_id, long_url, visits, password IS NOT NULL as has_password, expires_at FROM urls WHERE id = ?';
    db.get(query, [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'URL not found' });
        }
        res.json(row);
    });
});

// GET metrics for a single URL by short ID
router.get('/urls/metrics/:shortId', (req, res) => {
    const db = getDb();
    const { shortId } = req.params;
    const query = 'SELECT * FROM visits WHERE url_id = (SELECT id FROM urls WHERE short_id = ?)';
    db.all(query, [shortId], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ visits: rows });
    });
});

// POST a new URL
router.post('/urls', (req, res) => {
    const db = getDb();
    const { long_url, custom_id, length, password, expires_in } = req.body;

    if (!long_url) {
        return res.status(400).json({ error: 'Long URL is required' });
    }

    // Basic URL validation
    const urlRegex = /^(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})$/;
    if (!urlRegex.test(long_url)) {
        return res.status(400).json({ error: 'Invalid long URL format' });
    }

    let expires_at = null;
    if (expires_in) {
        try {
            const expiresInMs = ms(expires_in);
            expires_at = Date.now() + expiresInMs;
        } catch (error) {
            return res.status(400).json({ error: 'Invalid expiry format' });
        }
    }

    const handleInsert = (short_id) => {
        if (password) {
            bcrypt.hash(password, saltRounds, (err, hash) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                const insert = 'INSERT INTO urls (long_url, short_id, password, expires_at) VALUES (?,?,?,?)';
                db.run(insert, [long_url, short_id, hash, expires_at], function(err) {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    res.status(201).json({ id: this.lastID, short_id, long_url, expires_at });
                });
            });
        } else {
            const insert = 'INSERT INTO urls (long_url, short_id, expires_at) VALUES (?,?,?)';
            db.run(insert, [long_url, short_id, expires_at], function(err) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.status(201).json({ id: this.lastID, short_id, long_url, expires_at });
            });
        }
    };

    if (custom_id) {
        if (custom_id === 'admin' || custom_id === 'not-found') {
            return res.status(400).json({ error: 'Custom ID is not allowed' });
        }
        const query = 'SELECT * FROM urls WHERE short_id = ?';
        db.get(query, [custom_id], (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (row) {
                return res.status(400).json({ error: 'Custom ID already exists' });
            }
            handleInsert(custom_id);
        });
    } else {
        const short_id = nanoid(length || 7);
        handleInsert(short_id);
    }
});

// PUT (update) a URL
router.put('/urls/:id', (req, res) => {
    const db = getDb();
    const { long_url, password } = req.body;
    const { id } = req.params;

    if (password) {
        bcrypt.hash(password, saltRounds, (err, hash) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            const query = 'UPDATE urls SET long_url = ?, password = ? WHERE id = ?';
            db.run(query, [long_url, hash, id], function(err) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.json({ message: 'URL updated successfully' });
            });
        });
    } else {
        const query = 'UPDATE urls SET long_url = ?, password = NULL WHERE id = ?';
        db.run(query, [long_url, id], function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'URL updated successfully' });
        });
    }
});

// DELETE a URL
router.delete('/urls/:id', (req, res) => {
    const db = getDb();
    const { id } = req.params;
    const query = 'DELETE FROM urls WHERE id = ?';
    db.run(query, [id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'URL deleted successfully' });
    });
});

// Generate API Key
router.post('/generate-api-key', async (req, res) => {
    const db = getDb();
    const apiKey = nanoid(32); // Generate a 32-character random API key
    const hashedApiKey = await bcrypt.hash(apiKey, saltRounds);

    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['api_key', hashedApiKey], function(err) {
        if (err) {
            console.error('Error storing API key:', err.message);
            return res.status(500).json({ error: 'Failed to generate and store API key.' });
        }
        res.status(200).json({ apiKey: apiKey, message: 'API key generated and stored successfully.' });
    });
});

module.exports = router;
