
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const args = process.argv.slice(2);
const [username, email, password] = args;

console.log('\n╔══════════════════════════════════════════╗');
console.log('║       ADMIN PANEL — SECURE SETUP         ║');
console.log('╚══════════════════════════════════════════╝\n');

if (!username || !email || !password) {
    console.log('  Usage: node setup-admin.js <username> <email> <password>');
    console.log('  Example: node setup-admin.js mahbub mahbub@gmail.com MyPass@2026\n');
    process.exit(1);
}

if (!email.includes('@')) { console.log('  ✗ Invalid email.\n'); process.exit(1); }
if (password.length < 6) { console.log('  ✗ Password must be at least 6 characters.\n'); process.exit(1); }

let users = [];
if (fs.existsSync(USERS_FILE)) {
    try { users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch (e) { users = []; }
}


const oldAdmins = users.filter(u => u.role === 'full_admin');
if (oldAdmins.length > 0) {
    console.log('  Removing old admin accounts:');
    oldAdmins.forEach(u => console.log(`    ✗ Removed: ${u.username}`));
}
users = users.filter(u => u.role !== 'full_admin');


process.stdout.write('  Hashing password securely... ');
const salt = bcrypt.genSaltSync(12);
const hash = bcrypt.hashSync(password, salt);
console.log('done.');

const newAdmin = {
    username: username.trim(),
    email: email.trim().toLowerCase(),
    password: hash,
    role: 'full_admin',
    approved: true,
    status: 'active',
    createdAt: new Date().toISOString()
};

users.unshift(newAdmin);
fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

console.log('\n  ✓ Admin account created!');
console.log(`  ✓ Username : ${newAdmin.username}`);
console.log(`  ✓ Email    : ${newAdmin.email}`);
console.log('  ✓ Password : [bcrypt hashed — plain text discarded]');


let syncedToFirebase = false;
try {
    const admin = require('firebase-admin');
    
    if (!admin.apps.length) {
        const serviceAccount = require('./firebase-key.json');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: 'https:
        });
    }
    const db = admin.database();

    process.stdout.write('  Syncing to Firebase...');
    
    const updates = {};
    users.forEach(u => { updates[u.username] = u; });

    db.ref('users').set(updates)
        .then(() => {
            console.log(' done.');
            console.log('  ✓ Firebase Realtime Database updated!');
            finalize();
        })
        .catch(err => {
            console.log(` warning: ${err.message}`);
            finalize();
        });
} catch (e) {
    console.log('  ℹ Firebase sync skipped (will sync on server start).');
    finalize();
}

function finalize() {
    console.log('\n  ┌─────────────────────────────────────────┐');
    console.log('  │  Setup complete! Now run: npm start     │');
    console.log('  └─────────────────────────────────────────┘\n');
    setTimeout(() => process.exit(0), 500);
}

