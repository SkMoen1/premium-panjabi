
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

let db;
try {
    const serviceAccount = require('./firebase-key.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: 'https:
    });
    db = admin.database();
    console.log('Firebase connected.');
} catch (e) {
    console.error('Firebase init failed:', e.message);
    process.exit(1);
}

async function cleanupFirebase() {
    try {
        
        const snapshot = await db.ref('users').once('value');
        const fbUsers = snapshot.val() || {};
        console.log('Current Firebase users:', Object.keys(fbUsers));

        
        const oldDefaultKeys = Object.keys(fbUsers).filter(key => {
            const u = fbUsers[key];
            return u.username === 'admin' || key === 'admin';
        });

        if (oldDefaultKeys.length === 0) {
            console.log('No old admin user found in Firebase. Already clean!');
        } else {
            for (const key of oldDefaultKeys) {
                await db.ref(`users/${key}`).remove();
                console.log(`Removed old user from Firebase: ${key}`);
            }
        }

        
        const USERS_FILE = path.join(__dirname, 'data', 'users.json');
        let localUsers = [];
        if (fs.existsSync(USERS_FILE)) {
            localUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        }
        console.log('Local users to sync:', localUsers.map(u => u.username));

        
        const updates = {};
        localUsers.forEach(u => {
            updates[u.username] = u;
        });

        if (Object.keys(updates).length > 0) {
            await db.ref('users').set(updates); 
            console.log('Local users synced to Firebase successfully.');
        } else {
            console.log('No local users to sync. Firebase users cleared.');
            await db.ref('users').remove();
        }

        console.log('\nDone! Firebase is now in sync with your local users.json');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

cleanupFirebase();

