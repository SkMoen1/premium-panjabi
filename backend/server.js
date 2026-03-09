const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const https = require('https');


const sha256 = (text) => {
    if (!text) return '';
    return crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
};

const sendFacebookEvent = async (eventName, userData, customData, req) => {
    try {
        const settings = readData(SETTINGS_FILE);
        const pixelId = settings.fbPixelId;
        const accessToken = settings.fbAccessToken;
        const testCode = settings.fbTestEventCode;

        if (!pixelId || !accessToken) {
            console.warn('FB CAPI: Missing Pixel ID or Access Token. Skipping event.');
            return;
        }

        const payload = {
            data: [{
                event_name: eventName,
                event_time: Math.floor(Date.now() / 1000),
                action_source: "website",
                event_source_url: req.headers.referer || '',
                user_data: {
                    client_ip_address: req.ip || req.connection.remoteAddress,
                    client_user_agent: req.headers['user-agent'],
                    ph: userData.phone ? [sha256(userData.phone)] : [],
                    fn: userData.name ? [sha256(userData.name.split(' ')[0])] : [],
                    ln: userData.name && userData.name.split(' ').length > 1 ? [sha256(userData.name.split(' ').slice(1).join(' '))] : []
                },
                custom_data: customData
            }]
        };

        if (testCode) {
            payload.test_event_code = testCode;
        }

        const data = JSON.stringify(payload);
        const options = {
            hostname: 'graph.facebook.com',
            port: 443,
            path: `/v18.0/${pixelId}/events?access_token=${accessToken}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const fbReq = https.request(options, (res) => {
            let resData = '';
            res.on('data', (chunk) => resData += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    console.error('FB CAPI Error:', resData);
                } else {
                    console.log(`FB CAPI Event Sent: ${eventName}`);
                }
            });
        });

        fbReq.on('error', (error) => {
            console.error('FB CAPI Request Error:', error);
        });

        fbReq.write(data);
        fbReq.end();
    } catch (err) {
        console.error('FB CAPI Helper Error:', err);
    }
};

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'supersecretkey123'; 


app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.error('Invalid JSON received:', err.message);
        return res.status(400).json({ message: 'Invalid JSON request body' });
    }
    next();
});


app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

app.use(express.static(path.join(__dirname, '..', 'frontend'))); 
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


const admin = require('firebase-admin');
let db;

try {
    const serviceAccount = require('./firebase-key.json');
    const settings = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'settings.json')) || '{}');
    const dbUrl = settings.firebaseConfig?.databaseURL || "https://panjabi-gallery-default-rtdb.firebaseio.com/";

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: dbUrl
    });
    db = admin.database();
    console.log('Firebase Admin initialized with DB:', dbUrl);
} catch (err) {
    console.warn('Firebase initialization failed. Make sure firebase-key.json is valid.');
    console.error(err);
}


const DATA_DIR = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'subscribers.json');


if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}


if (!fs.existsSync(PRODUCTS_FILE)) fs.writeFileSync(PRODUCTS_FILE, '[]');
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]');
if (!fs.existsSync(REVIEWS_FILE)) fs.writeFileSync(REVIEWS_FILE, '[]');
if (!fs.existsSync(SUBSCRIBERS_FILE)) fs.writeFileSync(SUBSCRIBERS_FILE, '[]');




async function migrateOrders() {
    if (!db) return;
    const localOrders = JSON.parse(fs.readFileSync(ORDERS_FILE) || '[]');
    const ordersRef = db.ref('orders');
    const snapshot = await ordersRef.once('value');
    if (!snapshot.exists() && localOrders.length > 0) {
        console.log('Migrating local orders to Firebase...');
        const updates = {};
        localOrders.forEach(order => {
            updates[order.id] = order;
        });
        await ordersRef.update(updates);
        console.log('Migration complete');
    }
}
migrateOrders().catch(console.error);


const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images and videos are allowed!'), false);
        }
    }
});


const readData = (file) => {
    try {
        return JSON.parse(fs.readFileSync(file));
    } catch (e) {
        return [];
    }
};
const writeData = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));


let cachedUsers = readData(USERS_FILE);

if (db) {
    console.log('Setting up Realtime User Sync...');
    db.ref('users').on('value', (snapshot) => {
        const usersData = snapshot.val();
        if (usersData) {
            
            const incomingUsers = Object.values(usersData);
            cachedUsers = incomingUsers;
            writeData(USERS_FILE, cachedUsers);
            console.log('Users synced from Firebase Realtime Database');
        } else if (cachedUsers.length > 0) {
            
            
            console.log('Firebase empty, syncing local users UP to Firebase...');
            const updates = {};
            cachedUsers.forEach(u => {
                updates[u.username] = u;
            });
            db.ref('users').update(updates);
        }
    });
} else {
    console.warn('Firebase DB not available. Using local users.json only.');
}


const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Missing Authorization Token' });

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Invalid or Expired Session' });

        
        const currentUser = cachedUsers.find(u => u.username === decoded.username);

        if (!currentUser) {
            console.warn(`Blocked request from REVOKED user: ${decoded.username}`);
            return res.status(401).json({ message: 'Access Denied: Account no longer exists' });
        }

        if (!currentUser.approved) {
            return res.status(403).json({ message: 'Access Denied: Account pending approval' });
        }

        req.user = currentUser;
        next();
    });
};




app.get('/api/users/me', authenticateToken, (req, res) => {
    const { password, ...safeUser } = req.user;
    res.json(safeUser);
});


app.get('/api/users', authenticateToken, (req, res) => {
    const safeUsers = cachedUsers.map(({ password, ...rest }) => rest);
    res.json(safeUsers);
});

app.post('/api/users', authenticateToken, async (req, res) => {
    try {
        const users = readData(USERS_FILE);
        const { username, password, email, role } = req.body;

        if (users.find(u => u.username === username || u.email === email)) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(password, salt);

        const newUser = {
            username,
            password: hash,
            email,
            role: role || 'maintenance',
            approved: true, 
            status: 'active',
            createdAt: new Date().toISOString()
        };
        users.push(newUser);
        writeData(USERS_FILE, users);

        
        if (db) {
            await db.ref(`users/${username}`).set(newUser);
        }

        res.json({ message: 'User added successfully' });
    } catch (err) {
        console.error('User creation error:', err);
        res.status(500).json({ message: 'Server error during user creation' });
    }
});


app.post('/api/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const users = readData(USERS_FILE);

        if (!username || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (users.find(u => u.username === username || u.email === email)) {
            return res.status(400).json({ message: 'Username or Email already exists' });
        }

        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(password, salt);

        const newUser = {
            username,
            email,
            password: hash,
            role: 'maintenance',
            approved: false,
            status: 'pending',
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        writeData(USERS_FILE, users);

        if (db) {
            await db.ref(`users/${username}`).set(newUser);
        }

        res.json({ message: 'Signup successful! Please wait for admin approval.' });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ message: 'Server error during signup' });
    }
});


app.post('/api/users/approve/:username', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'full_admin') {
            return res.status(403).json({ message: 'Only full admins can approve users' });
        }

        const username = req.params.username;
        const users = readData(USERS_FILE);
        const userIndex = users.findIndex(u => u.username === username);

        if (userIndex === -1) {
            return res.status(404).json({ message: 'User not found' });
        }

        users[userIndex].approved = true;
        users[userIndex].status = 'active';
        writeData(USERS_FILE, users);

        if (db) {
            await db.ref(`users/${username}`).update({ approved: true, status: 'active' });
        }

        res.json({ message: `User ${username} approved successfully` });
    } catch (err) {
        console.error('Approval error:', err);
        res.status(500).json({ message: 'Server error during approval' });
    }
});

app.delete('/api/users/:username', authenticateToken, async (req, res) => {
    try {
        const targetUsername = req.params.username;
        let users = readData(USERS_FILE);

        if (targetUsername === 'admin') {
            return res.status(400).json({ message: 'Cannot delete primary admin' });
        }

        const userCountBefore = users.length;
        users = users.filter(u => u.username !== targetUsername);

        if (users.length === userCountBefore) {
            return res.status(404).json({ message: 'User not found' });
        }

        writeData(USERS_FILE, users);

        
        if (db) {
            await db.ref(`users/${targetUsername}`).remove();

            
            try {
                await admin.auth().deleteUser(targetUsername);
                console.log(`Successfully deleted user ${targetUsername} from Firebase Auth`);
            } catch (authErr) {
                
                console.log(`Firebase Auth delete note: ${authErr.message}`);
            }
        }

        res.json({ message: 'User deleted and access revoked' });
    } catch (err) {
        console.error('User delete error:', err);
        res.status(500).json({ message: 'Server error during user deletion' });
    }
});





app.post('/api/auth/firebase-email', async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) return res.status(400).json({ message: 'Missing ID token' });

        
        let decoded;
        try {
            decoded = await admin.auth().verifyIdToken(idToken);
        } catch (e) {
            return res.status(401).json({ message: 'Invalid session. Please sign in again.' });
        }

        const email = decoded.email;
        if (!email) return res.status(400).json({ message: 'No email found in token.' });

        
        let user = cachedUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());

        if (user) {
            
            if (!user.approved) {
                return res.status(403).json({
                    message: 'Your account is pending approval. Please contact the admin.'
                });
            }
        } else {
            
            
            
            const hasAnyAdmin = cachedUsers.some(u => u.role === 'full_admin' && u.approved);

            if (!hasAnyAdmin) {
                console.log(`⚡ First-time admin setup: provisioning ${email} as full_admin`);

                
                const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                let username = baseUsername;
                let counter = 1;
                while (cachedUsers.find(u => u.username === username)) {
                    username = `${baseUsername}${counter++}`;
                }

                const newAdmin = {
                    username,
                    email: email.toLowerCase(),
                    password: '', 
                    role: 'full_admin',
                    approved: true,
                    status: 'active',
                    authProvider: 'firebase-email',
                    createdAt: new Date().toISOString()
                };

                cachedUsers.unshift(newAdmin);
                writeData(USERS_FILE, cachedUsers);
                if (db) await db.ref(`users/${username}`).set(newAdmin);

                user = newAdmin;
                console.log(`✓ Admin provisioned: ${username} (${email})`);
            } else {
                return res.status(403).json({
                    message: 'This email has no access. Please request access first.'
                });
            }
        }

        
        const token = jwt.sign({ username: user.username }, SECRET_KEY, { expiresIn: '12h' });
        res.json({ token, role: user.role, username: user.username });

    } catch (err) {
        console.error('Firebase email login error:', err);
        res.status(500).json({ message: 'Server error during login' });
    }
});


app.post('/api/auth/google', async (req, res) => {
    try {
        const { idToken, email, displayName } = req.body;
        if (!idToken) return res.status(400).json({ message: 'Missing ID token' });

        
        let decoded;
        try {
            decoded = await admin.auth().verifyIdToken(idToken);
        } catch (e) {
            return res.status(401).json({ message: 'Invalid Google token. Please sign in again.' });
        }

        
        const user = cachedUsers.find(u => u.email === decoded.email || u.email === email);

        if (!user) {
            return res.status(403).json({
                message: 'This Google account has no access. Please request access first.'
            });
        }

        if (!user.approved) {
            return res.status(403).json({
                message: 'Your account is pending approval. Please contact the admin.'
            });
        }

        
        const token = jwt.sign({ username: user.username }, SECRET_KEY, { expiresIn: '12h' });
        res.json({ token, role: user.role || 'maintenance', username: user.username });

    } catch (err) {
        console.error('Google login error:', err);
        res.status(500).json({ message: 'Server error during Google login' });
    }
});


app.post('/api/auth/google/signup', async (req, res) => {
    try {
        const { email, displayName, uid } = req.body;
        if (!email) return res.status(400).json({ message: 'Missing email from Google account' });

        
        const existing = cachedUsers.find(u => u.email === email);
        if (existing) {
            if (existing.approved) {
                return res.status(400).json({ message: 'This Google account already has access. Please sign in.' });
            } else {
                return res.status(400).json({ message: 'Your request is already pending approval.' });
            }
        }

        
        const baseUsername = (displayName || email.split('@')[0]).replace(/\s+/g, '').toLowerCase();
        let username = baseUsername;
        let counter = 1;
        while (cachedUsers.find(u => u.username === username)) {
            username = `${baseUsername}${counter++}`;
        }

        const newUser = {
            username,
            email,
            displayName: displayName || '',
            password: '', 
            role: 'maintenance',
            approved: false,
            status: 'pending',
            authProvider: 'google',
            googleUid: uid || '',
            createdAt: new Date().toISOString()
        };

        cachedUsers.push(newUser);
        writeData(USERS_FILE, cachedUsers);

        if (db) {
            await db.ref(`users/${username}`).set(newUser);
        }

        res.json({ message: 'Access request submitted! The admin will review your request.' });

    } catch (err) {
        console.error('Google signup error:', err);
        res.status(500).json({ message: 'Server error during Google sign-up' });
    }
});


app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    
    const user = cachedUsers.find(u => u.username === username || u.email === username);

    if (user && bcrypt.compareSync(password, user.password)) {
        if (!user.approved) {
            return res.status(403).json({
                message: 'Your account is pending approval. Please contact the admin.'
            });
        }

        const token = jwt.sign({ username: user.username }, SECRET_KEY, { expiresIn: '12h' });

        if (db) {
            admin.auth().createCustomToken(user.username)
                .then((customToken) => {
                    res.json({ token, firebaseToken: customToken, role: user.role || 'full_admin' });
                })
                .catch((error) => {
                    res.json({ token, role: user.role || 'full_admin' });
                });
        } else {
            res.json({ token, role: user.role || 'full_admin' });
        }
    } else {
        res.status(401).json({ message: 'Invalid credentials' });
    }
});


app.get('/api/settings', (req, res) => {
    const settings = readData(SETTINGS_FILE);
    res.json(settings);
});

app.post('/api/settings', authenticateToken, (req, res) => {
    const { newPassword, ...otherSettings } = req.body;

    
    if (newPassword) {
        const adminIndex = cachedUsers.findIndex(u => u.role === 'full_admin');
        if (adminIndex !== -1) {
            const salt = bcrypt.genSaltSync(12);
            cachedUsers[adminIndex].password = bcrypt.hashSync(newPassword, salt);
            writeData(USERS_FILE, cachedUsers);
            if (db) {
                db.ref(`users/${cachedUsers[adminIndex].username}`).update({
                    password: cachedUsers[adminIndex].password
                });
            }
            console.log(`Admin password updated for: ${cachedUsers[adminIndex].username}`);
        }
    }

    
    writeData(SETTINGS_FILE, otherSettings);

    
    try {
        
        if (otherSettings.firebaseConfig && Object.keys(otherSettings.firebaseConfig).length > 0) {
            const configJsPath = path.join(__dirname, '..', 'frontend', 'firebase-config.js');
            const fc = otherSettings.firebaseConfig;
            const configContent = `// Auto-generated by server — do not edit manually
const firebaseConfig = {
  apiKey: "${fc.apiKey || ''}",
  authDomain: "${fc.authDomain || ''}",
  databaseURL: "${fc.databaseURL || ''}",
  projectId: "${fc.projectId || ''}",
  storageBucket: "${fc.storageBucket || ''}",
  messagingSenderId: "${fc.messagingSenderId || ''}",
  appId: "${fc.appId || ''}",
  measurementId: "${fc.measurementId || ''}"
};
export default firebaseConfig;
`;
            fs.writeFileSync(configJsPath, configContent);
            console.log('✓ Successfully synchronized firebase-config.js');
        }

        
        if (otherSettings.firebaseServiceAccount) {
            let serviceKeyObj;
            if (typeof otherSettings.firebaseServiceAccount === 'string') {
                try {
                    serviceKeyObj = JSON.parse(otherSettings.firebaseServiceAccount);
                } catch (e) {
                    console.error('Invalid JSON in firebaseServiceAccount string');
                }
            } else {
                serviceKeyObj = otherSettings.firebaseServiceAccount;
            }

            if (serviceKeyObj && serviceKeyObj.project_id) {
                const keyPath = path.join(__dirname, 'firebase-key.json');
                fs.writeFileSync(keyPath, JSON.stringify(serviceKeyObj, null, 2));
                console.log('✓ Successfully synchronized firebase-key.json');
            }
        }
    } catch (err) {
        console.error('Error synchronizing Firebase config files:', err);
    }

    res.json({ message: 'Settings updated successfully. Firebase config synchronized.' });
});


app.get('/api/products', (req, res) => {
    const products = readData(PRODUCTS_FILE);
    res.json(products);
});

app.post('/api/products', authenticateToken, upload.fields([{ name: 'images', maxCount: 10 }, { name: 'videos', maxCount: 5 }]), (req, res) => {
    const products = readData(PRODUCTS_FILE);

    const uploadedImages = req.files && req.files['images'] ? req.files['images'].map(f => `uploads/${f.filename}`) : [];
    const uploadedVideos = req.files && req.files['videos'] ? req.files['videos'].map(f => `uploads/${f.filename}`) : [];

    const imageLinks = req.body.imageLinks ? JSON.parse(req.body.imageLinks) : [];
    const videoLinks = req.body.videoLinks ? JSON.parse(req.body.videoLinks) : [];

    const newProduct = {
        id: Date.now(),
        name: req.body.name,
        category: req.body.category,
        tag: req.body.tag || '',
        price: parseInt(req.body.price),
        oldPrice: parseInt(req.body.oldPrice || 0),
        description: req.body.description,
        features: JSON.parse(req.body.features || '[]'),
        images: [...uploadedImages, ...imageLinks],
        videos: [...uploadedVideos, ...videoLinks]
    };
    products.push(newProduct);
    writeData(PRODUCTS_FILE, products);
    res.json(newProduct);
});

app.put('/api/products/:id', authenticateToken, upload.fields([{ name: 'images', maxCount: 10 }, { name: 'videos', maxCount: 5 }]), (req, res) => {
    const products = readData(PRODUCTS_FILE);
    const index = products.findIndex(p => p.id == req.params.id);
    if (index !== -1) {
        const currentProduct = products[index];

        
        let uploadedImages = (currentProduct.images || []).filter(img => img.startsWith('uploads/'));
        let uploadedVideos = (currentProduct.videos || []).filter(v => v.startsWith('uploads/'));

        
        if (req.files) {
            if (req.files['images']) {
                const newImgs = req.files['images'].map(f => `uploads/${f.filename}`);
                uploadedImages = [...uploadedImages, ...newImgs];
            }
            if (req.files['videos']) {
                const newVids = req.files['videos'].map(f => `uploads/${f.filename}`);
                uploadedVideos = [...uploadedVideos, ...newVids];
            }
        }

        
        const imageLinks = req.body.imageLinks ? JSON.parse(req.body.imageLinks) : [];
        const videoLinks = req.body.videoLinks ? JSON.parse(req.body.videoLinks) : [];

        products[index] = {
            ...currentProduct,
            ...req.body,
            id: currentProduct.id,
            price: parseInt(req.body.price),
            oldPrice: parseInt(req.body.oldPrice || 0),
            features: req.body.features ? JSON.parse(req.body.features) : currentProduct.features,
            images: [...uploadedImages, ...imageLinks],
            videos: [...uploadedVideos, ...videoLinks]
        };
        writeData(PRODUCTS_FILE, products);
        res.json(products[index]);
    } else {
        res.status(404).json({ message: 'Product not found' });
    }
});

app.delete('/api/products/:id', authenticateToken, (req, res) => {
    let products = readData(PRODUCTS_FILE);
    products = products.filter(p => p.id != req.params.id);
    writeData(PRODUCTS_FILE, products);
    res.json({ message: 'Product deleted' });
});


app.get('/api/orders', authenticateToken, async (req, res) => {
    if (db) {
        try {
            const snapshot = await db.ref('orders').once('value');
            const orders = snapshot.val() || {};
            
            const ordersArray = Object.values(orders).sort((a, b) => a.id - b.id);
            res.json(ordersArray);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch orders from Firebase' });
        }
    } else {
        const orders = readData(ORDERS_FILE);
        res.json(orders);
    }
});

app.post('/api/orders', async (req, res) => {
    const newOrder = {
        id: Date.now(),
        date: new Date().toISOString(),
        status: 'Pending',
        ...req.body
    };

    if (db) {
        try {
            await db.ref(`orders/${newOrder.id}`).set(newOrder);

            
            sendFacebookEvent('Purchase', {
                phone: req.body.customer?.phone,
                name: req.body.customer?.name
            }, {
                value: req.body.total,
                currency: 'BDT',
                content_name: req.body.product
            }, req);

            res.json(newOrder);
        } catch (err) {
            res.status(500).json({ error: 'Failed to save order to Firebase' });
        }
    } else {
        const orders = readData(ORDERS_FILE);
        orders.push(newOrder);
        writeData(ORDERS_FILE, orders);

        
        sendFacebookEvent('Purchase', {
            phone: req.body.customer?.phone,
            name: req.body.customer?.name
        }, {
            value: req.body.total,
            currency: 'BDT',
            content_name: req.body.product
        }, req);

        res.json(newOrder);
    }
});

app.put('/api/orders/:id', authenticateToken, async (req, res) => {
    if (db) {
        try {
            await db.ref(`orders/${req.params.id}`).update(req.body);
            res.json({ message: 'Order updated' });
        } catch (err) {
            res.status(500).json({ error: 'Failed to update order in Firebase' });
        }
    } else {
        const orders = readData(ORDERS_FILE);
        const index = orders.findIndex(o => o.id == req.params.id);
        if (index !== -1) {
            orders[index] = { ...orders[index], ...req.body };
            writeData(ORDERS_FILE, orders);
            res.json(orders[index]);
        } else {
            res.status(404).json({ message: 'Order not found' });
        }
    }
});

app.delete('/api/orders/:id', authenticateToken, async (req, res) => {
    if (db) {
        try {
            await db.ref(`orders/${req.params.id}`).remove();
            res.json({ message: 'Order deleted' });
        } catch (err) {
            res.status(500).json({ error: 'Failed to delete order from Firebase' });
        }
    } else {
        let orders = readData(ORDERS_FILE);
        orders = orders.filter(o => o.id != req.params.id);
        writeData(ORDERS_FILE, orders);
        res.json({ message: 'Order deleted' });
    }
});


app.get('/api/reviews', (req, res) => {
    const reviews = readData(REVIEWS_FILE);
    res.json(reviews);
});

app.post('/api/reviews', authenticateToken, upload.single('image'), (req, res) => {
    const reviews = readData(REVIEWS_FILE);
    const newReview = {
        id: Date.now(),
        name: req.body.name,
        role: req.body.role || 'Verified Customer',
        text: req.body.text,
        stars: parseInt(req.body.stars) || 5,
        bought: req.body.bought || '',
        image: req.file ? `uploads/${req.file.filename}` : (req.body.image || 'https://via.placeholder.com/400'),
    };
    reviews.push(newReview);
    writeData(REVIEWS_FILE, reviews);
    res.json(newReview);
});

app.put('/api/reviews/:id', authenticateToken, upload.single('image'), (req, res) => {
    const reviews = readData(REVIEWS_FILE);
    const index = reviews.findIndex(r => r.id == req.params.id);
    if (index !== -1) {
        let updatedImage = reviews[index].image;
        if (req.file) {
            updatedImage = `uploads/${req.file.filename}`;
        } else if (req.body.image) {
            updatedImage = req.body.image;
        }

        reviews[index] = {
            ...reviews[index],
            ...req.body,
            id: reviews[index].id, 
            stars: parseInt(req.body.stars) || reviews[index].stars,
            image: updatedImage
        };
        writeData(REVIEWS_FILE, reviews);
        res.json(reviews[index]);
    } else {
        res.status(404).json({ message: 'Review not found' });
    }
});

app.delete('/api/reviews/:id', authenticateToken, (req, res) => {
    let reviews = readData(REVIEWS_FILE);
    reviews = reviews.filter(r => r.id != req.params.id);
    writeData(REVIEWS_FILE, reviews);
    res.json({ message: 'Review deleted' });
});


app.get('/api/subscribers', authenticateToken, async (req, res) => {
    if (db) {
        try {
            const snapshot = await db.ref('subscribers').once('value');
            const subscribers = snapshot.val() || {};
            const subscribersArray = Object.values(subscribers).sort((a, b) => b.id - a.id);
            res.json(subscribersArray);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch subscribers from Firebase' });
        }
    } else {
        const subscribers = readData(SUBSCRIBERS_FILE);
        res.json(subscribers.sort((a, b) => b.id - a.id));
    }
});

app.post('/api/subscribe', async (req, res) => {
    const { email } = req.body;
    console.log('Subscribe request for:', email);
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const newSubscriber = {
        id: Date.now(),
        email: email,
        date: new Date().toISOString()
    };

    if (db) {
        try {
            console.log('Checking Firebase for existing subscriber...');
            const snapshot = await db.ref('subscribers').once('value');
            const subscribers = snapshot.val() || {};
            const exists = Object.values(subscribers).some(s => s.email === email);

            if (exists) {
                console.log('Subscriber already exists in Firebase');
                return res.status(400).json({ message: 'আপনার ইমেইলটি ইতিপূর্বে সাবস্ক্রাইব করা হয়েছে।' });
            }

            console.log('Saving new subscriber to Firebase...');
            await db.ref(`subscribers/${newSubscriber.id}`).set(newSubscriber);
            console.log('Subscriber saved to Firebase');
            res.json({ message: 'সাবস্ক্রাইব করার জন্য ধন্যবাদ!' });
        } catch (err) {
            console.error('Firebase Subscribe Error:', err);
            res.status(500).json({ message: 'সার্ভার ত্রুটি: সাবস্ক্রাইব করা সম্ভব হয়নি।' });
        }
    } else {
        console.log('Saving new subscriber to local file...');
        const subscribers = readData(SUBSCRIBERS_FILE);
        if (subscribers.find(s => s.email === email)) {
            return res.status(400).json({ message: 'আপনার ইমেইলটি ইতিপূর্বে সাবস্ক্রাইব করা হয়েছে।' });
        }
        subscribers.push(newSubscriber);
        writeData(SUBSCRIBERS_FILE, subscribers);
        res.json({ message: 'সাবস্ক্রাইব করার জন্য ধন্যবাদ!' });
    }
});

app.post('/api/newsletter/send', authenticateToken, async (req, res) => {
    const { subject, title, banner, body, ctaText, ctaLink } = req.body;

    
    const settings = readData(SETTINGS_FILE);
    const smtp = settings.smtp;

    if (!smtp || !smtp.host || !smtp.user || !smtp.pass) {
        return res.status(400).json({
            message: 'SMTP is not configured. Please go to App Settings and set up your email configuration first.'
        });
    }

    
    let subscribers = [];
    if (db) {
        const snapshot = await db.ref('subscribers').once('value');
        subscribers = Object.values(snapshot.val() || {});
    } else {
        subscribers = readData(SUBSCRIBERS_FILE);
    }

    if (subscribers.length === 0) {
        return res.status(400).json({ message: 'No subscribers found to send to.' });
    }

    
    const htmlTemplate = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .wrapper { width: 100%; background: #f4f4f7; padding: 40px 0; }
                .content { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                .header { background: #0f172a; padding: 30px; text-align: center; }
                .header h1 { color: #f59e0b; margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 2px; }
                .banner { width: 100%; display: block; border: 0; }
                .body { padding: 40px; }
                .body h2 { color: #1e293b; margin-top: 0; }
                .body p { font-size: 16px; color: #475569; }
                .cta-box { text-align: center; margin: 40px 0; }
                .btn { background: #4f46e5; color: #ffffff !important; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 18px; display: inline-block; }
                .footer { background: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0; }
                .footer p { font-size: 13px; color: #94a3b8; margin: 5px 0; }
            </style>
        </head>
        <body>
            <div class="wrapper">
                <div class="content">
                    <div class="header">
                        <h1>${settings.logo?.text || 'Luxury Panjabi'}</h1>
                    </div>
                    ${banner ? `<img src="${banner}" class="banner" alt="Newsletter Banner">` : ''}
                    <div class="body">
                        ${title ? `<h2>${title}</h2>` : ''}
                        <p>${body.replace(/\n/g, '<br>')}</p>
                        ${ctaText && ctaLink ? `
                        <div class="cta-box">
                            <a href="${ctaLink}" class="btn">${ctaText}</a>
                        </div>
                        ` : ''}
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} ${settings.logo?.text || 'Luxury Panjabi'}. All rights reserved.</p>
                        <p>Dhanmondi, Dhaka, Bangladesh</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;

    
    const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure, 
        auth: {
            user: smtp.user,
            pass: smtp.pass
        }
    });

    try {
        const recipientList = subscribers.map(s => s.email).join(', ');

        await transporter.sendMail({
            from: `"${settings.logo?.text || 'Luxury Panjabi'}" <${smtp.user}>`,
            to: recipientList,
            subject: subject,
            html: htmlTemplate
        });

        console.log(`Newsletter sent to ${subscribers.length} recipients`);
        res.json({ message: `Campaign sent successfully to ${subscribers.length} subscribers!` });
    } catch (err) {
        console.error('Nodemailer Error:', err);
        res.status(500).json({ message: 'Failed to send emails. Please check your SMTP settings and try again.' });
    }
});

app.post('/api/newsletter/test-smtp', authenticateToken, async (req, res) => {
    console.log('--- SMTP TEST REQUEST RECEIVED ---');
    const { host, port, secure, user, pass } = req.body;

    if (!host || !user || !pass) {
        return res.status(400).json({ message: 'Host, User, and Password are required for testing.' });
    }

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass }
    });

    try {
        await transporter.verify();

        
        await transporter.sendMail({
            from: `"SMTP Test" <${user}>`,
            to: user,
            subject: 'SMTP Test Connection Successful',
            text: 'Congratulations! Your SMTP settings are correct. This is a test email sent from your Landing Page Admin Panel.',
            html: '<h3>Congratulations!</h3><p>Your SMTP settings are correct. This is a test email sent from your <b>Landing Page Admin Panel</b>.</p>'
        });

        res.json({ message: 'Successfully connected and a test email has been sent to your inbox!' });
    } catch (err) {
        console.error('SMTP Test Error:', err);
        res.status(500).json({ message: `Authentication Failed: ${err.message}` });
    }
});

app.delete('/api/subscribers/:id', authenticateToken, async (req, res) => {
    if (db) {
        try {
            await db.ref(`subscribers/${req.params.id}`).remove();
            res.json({ message: 'Subscriber removed' });
        } catch (err) {
            res.status(500).json({ error: 'Failed to delete subscriber from Firebase' });
        }
    } else {
        let subscribers = readData(SUBSCRIBERS_FILE);
        subscribers = subscribers.filter(s => s.id != req.params.id);
        writeData(SUBSCRIBERS_FILE, subscribers);
        res.json({ message: 'Subscriber removed' });
    }
});


const ADMIN_URL_SEGMENT = 'admin-xyz92d73l';
app.get(`/${ADMIN_URL_SEGMENT}`, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'admin', 'index.html'));
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Admin Panel hidden at: http://localhost:${PORT}/${ADMIN_URL_SEGMENT}`);
});


