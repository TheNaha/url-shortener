const express = require('express');
const { initDb, getDb } = require('./database.js');
const bcrypt = require('bcrypt');

const session = require('express-session');
const cookieParser = require('cookie-parser');
const apiRouter = require('./api.js');
const { authenticateApiKey } = require('./api.js');

const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./swagger.yaml');

const app = express();
const port = Number(process.env.PORT);
const isProduction = process.env.NODE_ENV === 'production';
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

app.set('trust proxy', 1); // Trust the first proxy

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(cookieParser());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: isProduction, httpOnly: true, sameSite: 'lax' }
}));

const checkAuth = (req, res, next) => {
    if (req.session.isAuthenticated) {
        next();
    } else {
        res.redirect('/login');
    }
};



app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

app.post('/login', async (req, res) => {
    const { password } = req.body;

    if (!adminPasswordHash) {
        return res.status(500).send('Admin password is not set.');
    }

    try {
        

        if (await bcrypt.compare(password, adminPasswordHash)) {
            req.session.isAuthenticated = true;
            res.redirect('/admin');
        } else {
            res.redirect('/login?error=1');
        }
    } catch (err) {
        res.status(500).send('An error occurred during login.');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/admin');
        }
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

app.get('/admin', checkAuth, (req, res) => {
    res.sendFile(__dirname + '/public/admin.html');
});

app.get('/metrics/:shortId', checkAuth, (req, res) => {
    res.sendFile(__dirname + '/public/metrics.html');
});

app.use('/api/v1', (req, res, next) => {
    if (req.session.isAuthenticated) {
        // If admin is logged in, proceed without API key check
        next();
    } else {
        // Otherwise, apply API key authentication
        authenticateApiKey(req, res, next);
    }
}, apiRouter);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/', (req, res) => {
    res.redirect('/not-found');
});

app.get('/not-found', (req, res) => {
    res.sendFile(__dirname + '/public/not-found.html');
});

app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.post('/:shortId', (req, res) => {
    const db = getDb();
    const shortId = req.params.shortId;
    const { password } = req.body;
    const query = 'SELECT * FROM urls WHERE short_id = ?';
    db.get(query, [shortId], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (row) {
            bcrypt.compare(password, row.password, (err, result) => {
                if (result) {
                    res.redirect(row.long_url);
                } else {
                    res.redirect(`/${shortId}?error=1`);
                }
            });
        } else {
            res.redirect('/not-found');
        }
    });
});

app.get('/:shortId', (req, res) => {
    const db = getDb();
    const shortId = req.params.shortId;
    if (shortId === 'admin' || shortId === 'not-found' || shortId === 'login' || shortId === 'logout' || shortId === 'metrics') {
        return res.redirect('/' + shortId);
    }
    const query = 'SELECT * FROM urls WHERE short_id = ?';
    db.get(query, [shortId], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (row) {
            if (row.expires_at && Date.now() > row.expires_at) {
                const deleteQuery = 'DELETE FROM urls WHERE id = ?';
                db.run(deleteQuery, [row.id], () => {
                    res.redirect('/not-found');
                });
                return;
            }

            const updateVisitsQuery = 'UPDATE urls SET visits = visits + 1 WHERE id = ?';
            db.run(updateVisitsQuery, [row.id]);

            const insertVisitQuery = 'INSERT INTO visits (url_id, visited_at, ip_address, user_agent) VALUES (?, ?, ?, ?)';
            db.run(insertVisitQuery, [row.id, Date.now(), req.ip, req.headers['user-agent']]);

            if (row.password) {
                res.sendFile(__dirname + '/public/password.html');
            } else {
                res.redirect(row.long_url);
            }
        } else {
            res.redirect('/not-found');
        }
    });
});

initDb((err, db) => {
    if (err) {
        console.error('Failed to initialize database', err);
        process.exit(1);
    }

    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}`)
    });
});

