

const originHostname = window.location.hostname || 'localhost';
const API_URL = (window.location.protocol === 'file:' || ((originHostname === '127.0.0.1' || originHostname === 'localhost') && window.location.port !== '3000')) ? `http://${originHostname}:3000/api` : '/api';
let TOKEN = localStorage.getItem('adminToken');
let SETTINGS = {};
let PRODUCTS = [];
let ORDERS = [];
let REVIEWS = [];
let SUBSCRIBERS = [];


const reviewModal = document.getElementById('review-modal');
const reviewForm = document.getElementById('review-form');
const loginOverlay = document.getElementById('login-overlay');
const loginForm = document.getElementById('login-form');
const userModal = document.getElementById('user-modal');
const userForm = document.getElementById('user-form');
const sidebar = document.querySelector('.sidebar');
const mainContent = document.querySelector('.main-content');
const loading = document.getElementById('loading');
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');



document.addEventListener('DOMContentLoaded', () => {
    if (TOKEN) {
        showDashboard();
        
        setInterval(verifySession, 60000);
    }
});


async function apiFetch(endpoint, options = {}) {
    showLoading(true);
    const headers = options.headers || {};
    if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

    try {
        const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

        if (response.status === 401 || response.status === 403) {
            console.warn('Access Revoked by Server. Terminating session...');
            showAlert('Security Alert: Your access has been revoked or expired.', 'error');
            forceLogout();
            throw new Error('Unauthorized');
        }

        const contentType = response.headers.get('content-type');
        const isJson = contentType && contentType.includes('application/json');

        if (!response.ok) {
            let errorMessage = `API Error: ${response.status}`;
            if (isJson) {
                const errorData = await response.json();
                errorMessage = errorData.message || errorMessage;
            } else {
                const text = await response.text();
                console.error('Server returned non-JSON error:', text);
            }
            throw new Error(errorMessage);
        }

        return isJson ? await response.json() : await response.text();
    } catch (err) {
        if (err.message !== 'Unauthorized') console.error('Fetch Error:', err);
        throw err;
    } finally {
        showLoading(false);
    }
}

async function verifySession() {
    if (!TOKEN) return;
    try {
        
        await apiFetch('/users/me');
    } catch (e) {
        
    }
}

function forceLogout() {
    localStorage.clear();
    window.location.reload();
}




function togglePwd(fieldId, iconSpan) {
    const input = document.getElementById(fieldId);
    const icon = iconSpan.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}


document.getElementById('show-signup').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('signup-section').style.display = 'block';
    document.getElementById('login-error').style.display = 'none';
});

document.getElementById('show-login').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('signup-section').style.display = 'none';
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('signup-success').style.display = 'none';
});


function setLoginBtn(loading) {
    const btn = document.getElementById('login-submit-btn');
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading
        ? '<i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i> Signing In...'
        : '<i class="fas fa-lock" style="margin-right:6px;"></i> Sign In to Portal';
}


function showAuthError(msg) {
    const errorMsg = document.getElementById('login-error');
    errorMsg.innerText = msg;
    errorMsg.style.display = 'block';
}


document.getElementById('google-signin-btn').addEventListener('click', async () => {
    const errorMsg = document.getElementById('login-error');
    errorMsg.style.display = 'none';

    try {
        const auth = firebase.auth();
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await auth.signInWithPopup(provider);
        const { user } = result;

        
        const email = user.email;
        const idToken = await user.getIdToken();

        
        const data = await apiFetch('/auth/google', {
            method: 'POST',
            body: JSON.stringify({ email, idToken, displayName: user.displayName })
        });

        TOKEN = data.token;
        localStorage.setItem('adminToken', TOKEN);
        localStorage.setItem('adminUser', email);
        localStorage.setItem('adminRole', data.role || 'maintenance');
        showDashboard();

    } catch (err) {
        if (err.code === 'auth/popup-closed-by-user') return;
        showAuthError(err.message || 'Google Sign-In failed. Please try again.');
    }
});


document.getElementById('google-signup-btn').addEventListener('click', async () => {
    const errorMsg = document.getElementById('login-error');
    const successMsg = document.getElementById('signup-success');
    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';

    try {
        const auth = firebase.auth();
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await auth.signInWithPopup(provider);
        const { user } = result;

        
        const data = await apiFetch('/auth/google/signup', {
            method: 'POST',
            body: JSON.stringify({
                email: user.email,
                displayName: user.displayName,
                uid: user.uid
            })
        });

        successMsg.innerText = data.message || 'Request submitted! Wait for admin approval.';
        successMsg.style.display = 'block';

        
        await firebase.auth().signOut();

        setTimeout(() => {
            document.getElementById('show-login').click();
        }, 3000);

    } catch (err) {
        if (err.code === 'auth/popup-closed-by-user') return;
        showAuthError(err.message || 'Google Sign-Up failed.');
    }
});




loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const usernameOrEmail = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    setLoginBtn(true);

    try {
        
        const isEmail = usernameOrEmail.includes('@');

        if (isEmail) {
            
            
            try {
                const fbCredential = await firebase.auth().signInWithEmailAndPassword(
                    usernameOrEmail, password
                );
                const idToken = await fbCredential.user.getIdToken();

                
                const data = await apiFetch('/auth/firebase-email', {
                    method: 'POST',
                    body: JSON.stringify({ idToken })
                });

                TOKEN = data.token;
                localStorage.setItem('adminToken', TOKEN);
                localStorage.setItem('adminUser', data.username || usernameOrEmail);
                localStorage.setItem('adminRole', data.role || 'full_admin');
                showDashboard();
                return;

            } catch (fbErr) {
                
                if (fbErr.message === 'Unauthorized') throw fbErr; 

                
                console.log('Firebase auth failed, trying local login. Err:', fbErr.message || fbErr.code);
            }
        }

        
        
        const data = await apiFetch('/login', {
            method: 'POST',
            body: JSON.stringify({ username: usernameOrEmail, password })
        });

        TOKEN = data.token;
        localStorage.setItem('adminToken', TOKEN);
        localStorage.setItem('adminUser', data.username || usernameOrEmail);
        localStorage.setItem('adminRole', data.role || 'full_admin');
        if (data.firebaseToken) {
            localStorage.setItem('fbToken', data.firebaseToken);
            try { await firebase.auth().signInWithCustomToken(data.firebaseToken); } catch (e) { }
        }
        showDashboard();

    } catch (err) {
        
        const fbMessages = {
            'auth/user-not-found': 'No account found with this email.',
            'auth/wrong-password': 'Incorrect password.',
            'auth/invalid-email': 'Invalid email address.',
            'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
            'auth/user-disabled': 'This account has been disabled.'
        };
        const msg = fbMessages[err.code] || err.message || 'Login failed. Please check your credentials.';
        showAuthError(msg);
    } finally {
        setLoginBtn(false);
    }
});


const signupForm = document.getElementById('signup-form');
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('signup-username').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const successMsg = document.getElementById('signup-success');
    const errorMsg = document.getElementById('login-error');

    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';

    try {
        const data = await apiFetch('/signup', {
            method: 'POST',
            body: JSON.stringify({ username, email, password })
        });

        successMsg.innerText = data.message || 'Request submitted! Wait for admin approval.';
        successMsg.style.display = 'block';
        signupForm.reset();

        setTimeout(() => {
            document.getElementById('show-login').click();
        }, 3000);
    } catch (err) {
        showAuthError(err.message || 'Signup failed. Please try again.');
    }
});

document.getElementById('logout-btn').addEventListener('click', forceLogout);

function applyAccessControl() {
    const role = localStorage.getItem('adminRole');
    if (role === 'maintenance') {
        
        const restrictedTabs = ['content', 'settings', 'users'];
        navItems.forEach(item => {
            if (restrictedTabs.includes(item.getAttribute('data-tab'))) {
                item.style.display = 'none';
            }
        });

        
        const activeTab = document.querySelector('.nav-item.active')?.getAttribute('data-tab');
        if (restrictedTabs.includes(activeTab)) {
            
            document.querySelector('[data-tab="dashboard"]').click();
        }
    } else {
        
        navItems.forEach(item => item.style.display = 'flex');
    }
}

function showDashboard() {
    loginOverlay.style.display = 'none';
    sidebar.style.display = 'flex';
    mainContent.style.display = 'block';
    applyAccessControl();
    loadData();
}




let db;
try {
    if (typeof firebase !== 'undefined' && typeof firebaseConfig !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        console.log('Firebase initialized in Frontend');
    }
} catch (e) {
    console.error('Firebase initialization failed:', e);
}

async function loadData() {
    try {
        const fetchTasks = [
            apiFetch('/settings'),
            apiFetch('/products'),
            apiFetch('/reviews'),
            apiFetch('/orders'),
            apiFetch('/subscribers')
        ];

        const [settingsData, productsData, reviewsData, ordersData, subscribersData] = await Promise.all(fetchTasks);

        SETTINGS = settingsData;
        PRODUCTS = productsData;
        REVIEWS = reviewsData;
        ORDERS = Array.isArray(ordersData) ? ordersData : [];
        SUBSCRIBERS = Array.isArray(subscribersData) ? subscribersData : [];

        
        renderDashboard();
        renderOrders();
        renderProducts();
        renderReviews();
        renderSubscribers();
        renderContent();

        
        fetchUsersList();

        
        if (db) {
            const fbToken = localStorage.getItem('fbToken');
            const currentUsername = localStorage.getItem('adminUser');

            if (fbToken) {
                try {
                    await firebase.auth().signInWithCustomToken(fbToken);

                    
                    db.ref('orders').on('value', (snapshot) => {
                        const data = snapshot.val();
                        if (data) {
                            ORDERS = Object.values(data).sort((a, b) => b.id - a.id);
                            renderDashboard();
                            renderOrders();
                        }
                    });

                    
                    db.ref('subscribers').on('value', (snapshot) => {
                        const data = snapshot.val();
                        if (data) {
                            SUBSCRIBERS = Object.values(data).sort((a, b) => b.id - a.id);
                            renderSubscribers();
                            renderDashboard();
                        }
                    });

                    
                    db.ref('users').on('value', (snapshot) => {
                        const usersData = snapshot.val();
                        if (usersData) {
                            const usersList = Object.values(usersData);

                            
                            renderUsersList(usersList);

                            
                            const currentUserData = usersList.find(u => u.username === currentUsername);

                            if (currentUsername !== 'admin') {
                                if (!currentUserData) {
                                    console.warn('Current user deleted! Revoking access...');
                                    showAlert('Your access has been revoked by the administrator.', 'error');
                                    document.getElementById('logout-btn').click();
                                    return;
                                }

                                if (currentUserData.role !== localStorage.getItem('adminRole')) {
                                    console.log('Role changed detected! Applying new permissions...');
                                    localStorage.setItem('adminRole', currentUserData.role);
                                    applyAccessControl();
                                }
                            }
                        }
                    });
                } catch (authErr) {
                    console.error('Firebase Auth/Listener Error:', authErr);
                }
            }
        }
    } catch (err) {
        console.error('Data loading error:', err);
        if (err.message !== 'Unauthorized') showAlert('সার্ভার থেকে ডেটা লোড করা সম্ভব হয়নি।', 'error');
    }
}



navItems.forEach(item => {
    item.addEventListener('click', () => {
        if (item.id === 'logout-btn') return;
        const tab = item.getAttribute('data-tab');

        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        tabContents.forEach(content => {
            content.classList.remove('active');
            if (content.id === tab) content.classList.add('active');
        });

        
        if (window.innerWidth <= 1024) {
            sidebar.classList.remove('active');
            document.getElementById('sidebar-overlay').classList.remove('active');
        }
    });
});


const mobileToggle = document.getElementById('mobile-toggle');
const sidebarOverlay = document.getElementById('sidebar-overlay');

if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
        sidebarOverlay.classList.toggle('active');
    });
}

if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
    });
}



function renderDashboard() {
    document.getElementById('stat-total-orders').innerText = ORDERS.length;
    document.getElementById('stat-total-products').innerText = PRODUCTS.length;

    const totalSales = ORDERS.reduce((sum, order) => sum + (parseInt(order.total) || 0), 0);
    document.getElementById('stat-total-sales').innerText = `৳ ${totalSales.toLocaleString('bn-BD')}`;

    const pending = ORDERS.filter(o => o.status === 'Pending').length;
    document.getElementById('stat-pending-orders').innerText = pending;

    if (document.getElementById('stat-total-subscribers')) {
        document.getElementById('stat-total-subscribers').innerText = SUBSCRIBERS.length;
    }

    
    const tbody = document.querySelector('#recent-orders-table tbody');
    tbody.innerHTML = '';
    ORDERS.slice(-5).reverse().forEach(order => {
        const row = `
            <tr>
                <td>#${String(order.id).slice(-6)}</td>
                <td>${order.customer?.name || order.name}</td>
                <td>৳ ${order.total}</td>
                <td><span class="badge badge-${order.status?.toLowerCase()}">${order.status}</span></td>
                <td>${new Date(order.date).toLocaleDateString()}</td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

function renderOrders() {
    const tbody = document.querySelector('#full-orders-table tbody');
    tbody.innerHTML = '';
    ORDERS.slice().reverse().forEach(order => {
        const row = `
            <tr>
                <td>#${String(order.id).slice(-6)}</td>
                <td>${order.customer?.name || order.name}</td>
                <td>${order.customer?.phone || order.phone}</td>
                <td>${order.product}</td>
                <td>৳ ${order.total}</td>
                <td><span class="badge badge-${order.status?.toLowerCase()}">${order.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="viewOrder(${order.id})">View</button>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

function renderProducts() {
    const tbody = document.querySelector('#products-table tbody');
    tbody.innerHTML = '';
    PRODUCTS.slice().reverse().forEach(p => {
        const row = `
            <tr>
                <td><img src="${p.images[0]}" class="product-img-v"></td>
                <td>${p.name}</td>
                <td>${p.category}</td>
                <td>৳ ${p.price}</td>
                <td>Active</td>
                <td style="display: flex; gap: 5px;">
                    <button class="btn btn-sm btn-primary" onclick="editProduct(${p.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteProduct(${p.id})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });

    
    const catSelect = document.getElementById('prod-category');
    if (catSelect && SETTINGS.filters) {
        catSelect.innerHTML = SETTINGS.filters.map(f => `<option value="${f.value}">${f.label}</option>`).join('');
    }
}

function renderContent() {
    if (!SETTINGS.topBar) return;
    document.getElementById('edit-announcement').value = SETTINGS.topBar.discount;
    document.getElementById('edit-phone').value = SETTINGS.topBar.phone;

    
    if (SETTINGS.heroSlides && SETTINGS.heroSlides[0]) {
        const h0 = SETTINGS.heroSlides[0];
        document.getElementById('hero-0-badge').value = h0.badge || '';
        document.getElementById('hero-0-title').value = h0.title || '';
        document.getElementById('hero-0-highlight').value = h0.highlight || '';
        document.getElementById('hero-0-desc').value = h0.desc || '';
    }

    
    if (SETTINGS.about) {
        document.getElementById('about-title').value = SETTINGS.about.title || '';
        document.getElementById('about-highlight').value = SETTINGS.about.highlight || '';
        document.getElementById('about-desc').value = SETTINGS.about.desc || '';
        document.getElementById('about-exp').value = SETTINGS.about.experience || '';
    }

    
    if (SETTINGS.features) {
        SETTINGS.features.forEach((f, i) => {
            if (document.getElementById(`feat-${i}-title`)) {
                document.getElementById(`feat-${i}-title`).value = f.title;
                document.getElementById(`feat-${i}-desc`).value = f.desc;
            }
        });
    }

    
    const navContainer = document.getElementById('nav-items-container');
    navContainer.innerHTML = '';
    if (Array.isArray(SETTINGS.nav)) {
        SETTINGS.nav.forEach((item, index) => {
            navContainer.appendChild(createListItem('nav', item, index));
        });
    }

    
    const socialContainer = document.getElementById('social-items-container');
    socialContainer.innerHTML = '';
    if (Array.isArray(SETTINGS.social)) {
        SETTINGS.social.forEach((item, index) => {
            socialContainer.appendChild(createListItem('social', item, index));
        });
    }

    
    const filterContainer = document.getElementById('filter-items-container');
    filterContainer.innerHTML = '';
    if (Array.isArray(SETTINGS.filters)) {
        SETTINGS.filters.forEach((item, index) => {
            filterContainer.appendChild(createListItem('filter', item, index));
        });
    }

    
    if (SETTINGS.footer) {
        document.getElementById('foot-desc').value = SETTINGS.footer.desc || '';
        document.getElementById('foot-copy').value = SETTINGS.footer.copy || '';

        const footLinksContainer = document.getElementById('footer-links-container');
        footLinksContainer.innerHTML = '';
        if (Array.isArray(SETTINGS.footer.links)) {
            SETTINGS.footer.links.forEach((item, index) => {
                footLinksContainer.appendChild(createListItem('footLink', item, index));
            });
        }
    }

    
    document.getElementById('sett-logo-text').value = SETTINGS.logo?.text || '';
    document.getElementById('sett-logo-accent').value = SETTINGS.logo?.accent || '';
    document.getElementById('sett-fb-pixel').value = SETTINGS.fbPixelId || '';
    document.getElementById('sett-fb-token').value = SETTINGS.fbAccessToken || '';
    document.getElementById('sett-fb-test-code').value = SETTINGS.fbTestEventCode || '';
    document.getElementById('sett-fb-domain-verify').value = SETTINGS.fbDomainVerify || '';

    
    if (SETTINGS.smtp) {
        document.getElementById('sett-smtp-host').value = SETTINGS.smtp.host || '';
        document.getElementById('sett-smtp-port').value = SETTINGS.smtp.port || '';
        document.getElementById('sett-smtp-secure').value = SETTINGS.smtp.secure ? 'true' : 'false';
        document.getElementById('sett-smtp-user').value = SETTINGS.smtp.user || '';
        document.getElementById('sett-smtp-pass').value = SETTINGS.smtp.pass || '';
    }

    
    if (SETTINGS.firebaseConfig) {
        document.getElementById('sett-fb-api-key').value = SETTINGS.firebaseConfig.apiKey || '';
        document.getElementById('sett-fb-auth-domain').value = SETTINGS.firebaseConfig.authDomain || '';
        document.getElementById('sett-fb-db-url').value = SETTINGS.firebaseConfig.databaseURL || '';
        document.getElementById('sett-fb-project-id').value = SETTINGS.firebaseConfig.projectId || '';
        document.getElementById('sett-fb-storage-bucket').value = SETTINGS.firebaseConfig.storageBucket || '';
        document.getElementById('sett-fb-sender-id').value = SETTINGS.firebaseConfig.messagingSenderId || '';
        document.getElementById('sett-fb-app-id').value = SETTINGS.firebaseConfig.appId || '';
        document.getElementById('sett-fb-measure-id').value = SETTINGS.firebaseConfig.measurementId || '';
    }
    if (SETTINGS.firebaseServiceAccount) {
        document.getElementById('sett-fb-service-key').value = typeof SETTINGS.firebaseServiceAccount === 'string'
            ? SETTINGS.firebaseServiceAccount
            : JSON.stringify(SETTINGS.firebaseServiceAccount, null, 2);
    }
}

function createListItem(type, data = {}, index) {
    const div = document.createElement('div');
    div.className = 'list-item-row';
    div.dataset.type = type;

    if (type === 'nav' || type === 'footLink') {
        div.innerHTML = `
            <input type="text" placeholder="Label (e.g. Home)" value="${data.label || ''}" class="item-label">
            <input type="text" placeholder="Link (e.g. #home)" value="${data.link || ''}" class="item-link">
        `;
    } else if (type === 'social') {
        div.innerHTML = `
            <input type="text" placeholder="Icon Class (e.g. fab fa-facebook)" value="${data.icon || ''}" class="item-icon">
            <input type="text" placeholder="Link" value="${data.link || ''}" class="item-link">
        `;
    } else if (type === 'filter') {
        div.innerHTML = `
            <input type="text" placeholder="Label (e.g. Cotton)" value="${data.label || ''}" class="item-label">
            <input type="text" placeholder="Value (e.g. cotton)" value="${data.value || ''}" class="item-value">
        `;
    }

    div.innerHTML += `<button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>`;
    return div;
}

window.addNavItem = () => document.getElementById('nav-items-container').appendChild(createListItem('nav'));
window.addSocialItem = () => document.getElementById('social-items-container').appendChild(createListItem('social'));
window.addFilterItem = () => document.getElementById('filter-items-container').appendChild(createListItem('filter'));
window.addFooterLink = () => document.getElementById('footer-links-container').appendChild(createListItem('footLink'));

window.autoFillFirebaseConfig = () => {
    const rawData = document.getElementById('sett-fb-quick-paste').value;
    if (!rawData) return showAlert('Please paste the configuration first.', 'warning');

    try {
        
        let jsonStr = rawData;
        if (rawData.includes('{')) {
            jsonStr = rawData.substring(rawData.indexOf('{'), rawData.lastIndexOf('}') + 1);
        }

        
        
        let configObj;
        try {
            configObj = JSON.parse(jsonStr);
        } catch (e) {
            
            
            configObj = new Function(`return ${jsonStr}`)();
        }

        if (configObj) {
            if (configObj.apiKey) document.getElementById('sett-fb-api-key').value = configObj.apiKey;
            if (configObj.authDomain) document.getElementById('sett-fb-auth-domain').value = configObj.authDomain;
            if (configObj.databaseURL) document.getElementById('sett-fb-db-url').value = configObj.databaseURL;
            if (configObj.projectId) document.getElementById('sett-fb-project-id').value = configObj.projectId;
            if (configObj.storageBucket) document.getElementById('sett-fb-storage-bucket').value = configObj.storageBucket;
            if (configObj.messagingSenderId) document.getElementById('sett-fb-sender-id').value = configObj.messagingSenderId;
            if (configObj.appId) document.getElementById('sett-fb-app-id').value = configObj.appId;
            if (configObj.measurementId) document.getElementById('sett-fb-measure-id').value = configObj.measurementId;

            showAlert('Fields auto-filled! Don\'t forget to click Update to save.', 'success');
            document.getElementById('sett-fb-quick-paste').value = '';
        }
    } catch (err) {
        console.error('Parse error:', err);
        showAlert('Could not parse the configuration. Please make sure it\'s a valid object.', 'error');
    }
};


function renderReviews() {
    const tbody = document.querySelector('#reviews-table tbody');
    tbody.innerHTML = '';
    REVIEWS.forEach(r => {
        tbody.innerHTML += `
            <tr>
                <td><img src="${r.image}" class="product-img-v"> ${r.name}</td>
                <td>${r.text.substring(0, 50)}...</td>
                <td>${r.stars} <i class="fas fa-star" style="color: #f59e0b; font-size: 0.8rem;"></i></td>
                <td>${r.bought}</td>
                <td>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn btn-sm btn-primary" onclick="editReview(${r.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="deleteReview(${r.id})"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
}

window.editReview = (id) => {
    const r = REVIEWS.find(rev => rev.id == id);
    if (!r) return;

    document.getElementById('rev-id').value = r.id;
    document.getElementById('rev-name').value = r.name;
    document.getElementById('rev-text').value = r.text;
    document.getElementById('rev-stars').value = r.stars;
    document.getElementById('rev-bought').value = r.bought;
    document.getElementById('rev-image-url').value = (r.image && !r.image.startsWith('uploads/')) ? r.image : '';

    reviewModal.querySelector('h2').innerText = 'Edit Testimonial';
    reviewModal.querySelector('button[type="submit"]').innerText = 'Update Testimonial';
    reviewModal.style.display = 'flex';
};

function renderSubscribers() {
    const tbody = document.querySelector('#subscribers-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    SUBSCRIBERS.forEach(s => {
        tbody.innerHTML += `
            <tr>
                <td style="font-weight: 500;">${s.email}</td>
                <td class="wrap-text" style="font-size: 0.85rem; color: var(--text-light);">
                    ${new Date(s.date).toLocaleDateString()} <br>
                    <span style="font-size: 0.75rem;">${new Date(s.date).toLocaleTimeString()}</span>
                </td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-sm btn-danger" onclick="deleteSubscriber(${s.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                        <a href="mailto:${s.email}" class="btn btn-sm btn-primary">
                            <i class="fas fa-envelope"></i> Email
                        </a>
                    </div>
                </td>
            </tr>
        `;
    });
}

window.deleteSubscriber = async (id) => {
    if (!(await showConfirm('Remove Subscriber?', 'Are you sure you want to remove this email from your list?', 'error'))) return;
    try {
        await apiFetch(`/subscribers/${id}`, { method: 'DELETE' });
        loadData();
        showAlert('Subscriber removed', 'success');
    } catch (err) {
        if (err.message !== 'Unauthorized') showAlert(err.message || 'Error deleting subscriber', 'error');
    }
};



async function fetchUsersList() {
    try {
        const users = await apiFetch('/users');
        renderUsersList(users);
    } catch (e) {
        console.error('User Fetch Error:', e);
    }
}


function renderUsersList(users) {
    const tbody = document.querySelector('#users-table tbody');
    if (!tbody) return;

    
    users.sort((a, b) => {
        if (a.username === 'admin') return -1;
        if (b.username === 'admin') return 1;
        if (!a.approved && b.approved) return -1;
        if (a.approved && !b.approved) return 1;
        return 0;
    });

    tbody.innerHTML = '';
    users.forEach(u => {
        const isAdmin = u.username === 'admin';
        const isApproved = u.approved !== false; 
        const email = u.email || (isAdmin ? 'admin@gmail.com' : 'No Email Set');
        const userRole = (u.role || (isAdmin ? 'full_admin' : 'maintenance'));

        const roleText = userRole === 'full_admin' ? 'Administrative Access' : 'Maintenance Access';
        const accessBadge = userRole === 'full_admin' ? 'Superuser' : 'Limited';
        const badgeColor = isApproved ? (userRole === 'full_admin' ? 'success' : 'pending') : 'danger';
        const statusLabel = isApproved ? accessBadge : 'Blocked/Pending';

        tbody.innerHTML += `
            <tr>
                <td>
                    <div style="font-weight: 600;">${u.username}</div>
                    ${!isApproved ? '<div style="font-size: 0.7rem; color: var(--danger); font-weight: 700;">PENDING APPROVAL</div>' : ''}
                </td>
                <td>
                    <div style="color: var(--text-light); font-size: 0.85rem;">${email}</div>
                </td>
                <td>
                    <span class="badge badge-${badgeColor}">${statusLabel}</span>
                    <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 2px;">${roleText}</div>
                </td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        ${!isAdmin && !isApproved ?
                `<button class="btn btn-sm btn-success" onclick="approveUser('${u.username}')" title="Approve User">
                                <i class="fas fa-check"></i> Approve
                            </button>` : ''
            }
                        ${!isAdmin ?
                `<button class="btn btn-sm btn-danger" onclick="deleteUser('${u.username}')" title="Remove User">
                                <i class="fas fa-trash"></i>
                            </button>` :
                '<span style="font-size: 0.8rem; color: #94a3b8;">System Account</span>'
            }
                    </div>
                </td>
            </tr>
        `;
    });
}

window.approveUser = async (username) => {
    if (!(await showConfirm('Approve Access?', `Are you sure you want to approve access for "${username}"?`, 'warning'))) return;
    try {
        await apiFetch(`/users/approve/${encodeURIComponent(username)}`, { method: 'POST' });
        await fetchUsersList();
        showAlert(`User ${username} has been approved!`, 'success');
    } catch (e) {
        if (e.message !== 'Unauthorized') showAlert(e.message || 'Error approving user', 'error');
    }
};

document.getElementById('add-user-btn').addEventListener('click', () => {
    userForm.reset();
    userModal.style.display = 'flex';
});

userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        username: document.getElementById('user-username').value,
        email: document.getElementById('user-email').value,
        password: document.getElementById('user-password').value,
        role: document.getElementById('user-role').value
    };

    try {
        await apiFetch('/users', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        userModal.style.display = 'none';
        showAlert('New system access granted successfully!', 'success');
        await fetchUsersList();
    } catch (err) {
        if (err.message !== 'Unauthorized') showAlert(err.message || 'Error adding user', 'error');
    }
});

window.deleteUser = async (username) => {
    if (!(await showConfirm('Remove Access?', `Are you sure you want to remove access for "${username}"?`, 'error'))) return;

    try {
        await apiFetch(`/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
        await fetchUsersList();
    } catch (e) {
        if (e.message !== 'Unauthorized') showAlert(e.message || 'Error deleting user', 'error');
    }
};



const productModal = document.getElementById('product-modal');
const productForm = document.getElementById('product-form');

document.getElementById('add-product-btn').addEventListener('click', () => {
    productForm.reset();
    document.getElementById('prod-id').value = '';
    document.getElementById('modal-title').innerText = 'Add New Product';
    productModal.style.display = 'flex';
});

window.editProduct = (id) => {
    const p = PRODUCTS.find(prod => prod.id == id);
    if (!p) return;

    document.getElementById('prod-id').value = p.id;
    document.getElementById('prod-name').value = p.name;
    document.getElementById('prod-category').value = p.category;
    document.getElementById('prod-tag').value = p.tag;
    document.getElementById('prod-price').value = p.price;
    document.getElementById('prod-old-price').value = p.oldPrice;
    document.getElementById('prod-desc').value = p.description;
    document.getElementById('prod-features').value = p.features.join('\n');

    
    const imageLinks = (p.images || []).filter(img => img.startsWith('http'));
    document.getElementById('prod-image-links').value = imageLinks.join('\n');

    const videoLinks = (p.videos || []).filter(v => v.startsWith('http'));
    document.getElementById('prod-video-links').value = videoLinks.join('\n');

    document.getElementById('modal-title').innerText = 'Edit Product';
    productModal.style.display = 'flex';
};

window.deleteProduct = async (id) => {
    if (!(await showConfirm('Delete Product?', 'Are you sure you want to delete this product?', 'error'))) return;

    try {
        await apiFetch(`/products/${id}`, { method: 'DELETE' });
        await loadData();
    } catch (err) { showAlert('Error deleting product', 'error'); }
};

productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('prod-id').value;
    const formData = new FormData();

    formData.append('name', document.getElementById('prod-name').value);
    formData.append('category', document.getElementById('prod-category').value);
    formData.append('tag', document.getElementById('prod-tag').value);
    formData.append('price', document.getElementById('prod-price').value);
    formData.append('oldPrice', document.getElementById('prod-old-price').value);
    formData.append('description', document.getElementById('prod-desc').value);

    const features = document.getElementById('prod-features').value.split('\n').filter(f => f.trim() !== '');
    formData.append('features', JSON.stringify(features));

    const imageFiles = document.getElementById('prod-images').files;
    for (let i = 0; i < imageFiles.length; i++) {
        formData.append('images', imageFiles[i]);
    }

    const videoFiles = document.getElementById('prod-video-file').files;
    for (let i = 0; i < videoFiles.length; i++) {
        formData.append('videos', videoFiles[i]);
    }

    const imageLinks = document.getElementById('prod-image-links').value.split('\n').filter(l => l.trim() !== '');
    formData.append('imageLinks', JSON.stringify(imageLinks));

    const videoLinks = document.getElementById('prod-video-links').value.split('\n').filter(l => l.trim() !== '');
    formData.append('videoLinks', JSON.stringify(videoLinks));

    showLoading(true);
    try {
        const endpoint = id ? `/products/${id}` : '/products';
        const method = id ? 'PUT' : 'POST';

        await apiFetch(endpoint, {
            method,
            body: formData
        });

        productModal.style.display = 'none';
        await loadData();
        showAlert('Product saved successfully!', 'success');
    } catch (err) {
        console.error(err);
        if (err.message !== 'Unauthorized') showAlert('Error saving product: ' + err.message, 'error');
    }
    showLoading(false);
});



const orderModal = document.getElementById('order-modal');
let CURRENT_ORDER_ID = null;

window.viewOrder = (id) => {
    const order = ORDERS.find(o => o.id == id);
    if (!order) return;
    CURRENT_ORDER_ID = id;

    const content = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem;">
            <div>
                <p><strong>Customer:</strong> ${order.customer?.name || order.name}</p>
                <p><strong>Phone:</strong> ${order.customer?.phone || order.phone}</p>
                <p><strong>Address:</strong> ${order.customer?.address || order.address || 'N/A'}</p>
                <p><strong>City:</strong> ${order.customer?.district || order.city || 'N/A'}</p>
            </div>
            <div>
                <p><strong>Product:</strong> ${order.product}</p>
                <p><strong>Total:</strong> ৳ ${order.total}</p>
                <p><strong>Status:</strong> ${order.status}</p>
                <p><strong>Date:</strong> ${new Date(order.date).toLocaleString()}</p>
            </div>
        </div>
    `;

    document.getElementById('order-details-content').innerHTML = content;
    document.getElementById('update-order-status').value = order.status;
    orderModal.style.display = 'flex';
};

document.getElementById('save-order-status').addEventListener('click', async () => {
    const newStatus = document.getElementById('update-order-status').value;
    showLoading(true);
    try {
        const res = await fetch(`${API_URL}/orders/${CURRENT_ORDER_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`
            },
            body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
            orderModal.style.display = 'none';
            await loadData();
            showAlert('Order status updated successfully!', 'success');
        }
    } catch (err) { showAlert('Error updating status', 'error'); }
    showLoading(false);
});

document.getElementById('delete-order-btn').addEventListener('click', async () => {
    if (!(await showConfirm('Delete Order?', 'Are you sure you want to delete this order?', 'error'))) return;
    showLoading(true);
    try {
        await apiFetch(`/orders/${CURRENT_ORDER_ID}`, { method: 'DELETE' });
        orderModal.style.display = 'none';
        await loadData();
        showAlert('Order deleted successfully', 'success');
    } catch (err) { showAlert('Error deleting order', 'error'); }
    showLoading(false);
});



async function saveAllSettings() {
    const updatedSettings = { ...SETTINGS };

    
    if (document.getElementById('edit-announcement')) {
        updatedSettings.topBar = updatedSettings.topBar || {};
        updatedSettings.topBar.discount = document.getElementById('edit-announcement').value;
        updatedSettings.topBar.phone = document.getElementById('edit-phone').value;

        updatedSettings.heroSlides = updatedSettings.heroSlides || [{}];
        updatedSettings.heroSlides[0].badge = document.getElementById('hero-0-badge').value;
        updatedSettings.heroSlides[0].title = document.getElementById('hero-0-title').value;
        updatedSettings.heroSlides[0].highlight = document.getElementById('hero-0-highlight').value;
        updatedSettings.heroSlides[0].desc = document.getElementById('hero-0-desc').value;

        updatedSettings.about = updatedSettings.about || {};
        updatedSettings.about.title = document.getElementById('about-title').value;
        updatedSettings.about.highlight = document.getElementById('about-highlight').value;
        updatedSettings.about.desc = document.getElementById('about-desc').value;
        updatedSettings.about.experience = document.getElementById('about-exp').value;

        
        updatedSettings.features = [];
        for (let i = 0; i < 4; i++) {
            const title = document.getElementById(`feat-${i}-title`).value;
            const desc = document.getElementById(`feat-${i}-desc`).value;
            if (title) updatedSettings.features.push({ title, desc });
        }

        
        updatedSettings.filters = [];
        document.querySelectorAll('#filter-items-container .list-item-row').forEach(row => {
            const label = row.querySelector('.item-label').value;
            const value = row.querySelector('.item-value').value;
            if (label) updatedSettings.filters.push({ label, value });
        });

        
        updatedSettings.nav = [];
        document.querySelectorAll('#nav-items-container .list-item-row').forEach(row => {
            const label = row.querySelector('.item-label').value;
            const link = row.querySelector('.item-link').value;
            if (label) updatedSettings.nav.push({ label, link });
        });

        
        updatedSettings.social = [];
        document.querySelectorAll('#social-items-container .list-item-row').forEach(row => {
            const icon = row.querySelector('.item-icon').value;
            const link = row.querySelector('.item-link').value;
            if (icon) updatedSettings.social.push({ icon, link });
        });

        
        updatedSettings.footer = {
            desc: document.getElementById('foot-desc').value,
            copy: document.getElementById('foot-copy').value,
            links: []
        };
        document.querySelectorAll('#footer-links-container .list-item-row').forEach(row => {
            const label = row.querySelector('.item-label').value;
            const link = row.querySelector('.item-link').value;
            if (label) updatedSettings.footer.links.push({ label, link });
        });
    }


    
    if (document.getElementById('sett-logo-text')) {
        if (!updatedSettings.logo) updatedSettings.logo = {};
        updatedSettings.logo.text = document.getElementById('sett-logo-text').value;
        updatedSettings.logo.accent = document.getElementById('sett-logo-accent').value;
        updatedSettings.fbPixelId = document.getElementById('sett-fb-pixel').value;
        updatedSettings.fbAccessToken = document.getElementById('sett-fb-token').value;
        updatedSettings.fbTestEventCode = document.getElementById('sett-fb-test-code').value;
        updatedSettings.fbDomainVerify = document.getElementById('sett-fb-domain-verify').value;

        const newPass = document.getElementById('sett-admin-pass').value;
        if (newPass) updatedSettings.newPassword = newPass;

        
        if (document.getElementById('sett-smtp-host')) {
            updatedSettings.smtp = {
                host: document.getElementById('sett-smtp-host').value,
                port: parseInt(document.getElementById('sett-smtp-port').value),
                secure: document.getElementById('sett-smtp-secure').value === 'true',
                user: document.getElementById('sett-smtp-user').value,
                pass: document.getElementById('sett-smtp-pass').value
            };
        }

        
        if (document.getElementById('sett-fb-api-key')) {
            updatedSettings.firebaseConfig = {
                apiKey: document.getElementById('sett-fb-api-key').value,
                authDomain: document.getElementById('sett-fb-auth-domain').value,
                databaseURL: document.getElementById('sett-fb-db-url').value,
                projectId: document.getElementById('sett-fb-project-id').value,
                storageBucket: document.getElementById('sett-fb-storage-bucket').value,
                messagingSenderId: document.getElementById('sett-fb-sender-id').value,
                appId: document.getElementById('sett-fb-app-id').value,
                measurementId: document.getElementById('sett-fb-measure-id').value
            };
            updatedSettings.firebaseServiceAccount = document.getElementById('sett-fb-service-key').value;
        }
    }

    showLoading(true);
    try {
        const res = await fetch(`${API_URL}/settings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`
            },
            body: JSON.stringify(updatedSettings)
        });
        if (res.ok) {
            showAlert('Settings updated successfully!', 'success');
            if (document.getElementById('sett-admin-pass')) document.getElementById('sett-admin-pass').value = '';
            loadData();
        }
    } catch (err) { showAlert('Error saving settings', 'error'); }
    showLoading(false);
}

const contentBtn = document.getElementById('save-content-btn');
if (contentBtn) contentBtn.addEventListener('click', saveAllSettings);

const settingsBtn = document.getElementById('save-settings-btn');
if (settingsBtn) settingsBtn.addEventListener('click', saveAllSettings);

const smtpBtn = document.getElementById('save-smtp-btn');
if (smtpBtn) smtpBtn.addEventListener('click', saveAllSettings);

const firebaseBtn = document.getElementById('save-firebase-btn');
if (firebaseBtn) firebaseBtn.addEventListener('click', saveAllSettings);

const testSmtpBtn = document.getElementById('test-smtp-btn');
if (testSmtpBtn) {
    testSmtpBtn.addEventListener('click', async () => {
        const payload = {
            host: document.getElementById('sett-smtp-host').value,
            port: parseInt(document.getElementById('sett-smtp-port').value),
            secure: document.getElementById('sett-smtp-secure').value === 'true',
            user: document.getElementById('sett-smtp-user').value,
            pass: document.getElementById('sett-smtp-pass').value
        };

        if (!payload.host || !payload.user || !payload.pass) {
            return showAlert('Please fill in Host, User, and Password first.', 'warning');
        }

        testSmtpBtn.disabled = true;
        testSmtpBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';

        try {
            const res = await apiFetch('/newsletter/test-smtp', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showAlert(res.message, 'success');
        } catch (err) {
            showAlert(err.message || 'SMTP Test Failed', 'error');
        } finally {
            testSmtpBtn.disabled = false;
            testSmtpBtn.innerHTML = '<i class="fas fa-vial"></i> Test SMTP Connection';
        }
    });
}

window.applySmtpPreset = (service) => {
    const hostEl = document.getElementById('sett-smtp-host');
    const portEl = document.getElementById('sett-smtp-port');
    const secureEl = document.getElementById('sett-smtp-secure');

    const presets = {
        gmail: { host: 'smtp.gmail.com', port: 465, secure: 'true' },
        outlook: { host: 'smtp.office365.com', port: 587, secure: 'false' },
        yahoo: { host: 'smtp.mail.yahoo.com', port: 465, secure: 'true' },
        zoho: { host: 'smtp.zoho.com', port: 465, secure: 'true' }
    };

    if (presets[service]) {
        hostEl.value = presets[service].host;
        portEl.value = presets[service].port;
        secureEl.value = presets[service].secure;
    }
};



function showLoading(show) {
    loading.style.display = show ? 'block' : 'none';
}

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.onclick = () => {
        productModal.style.display = 'none';
        orderModal.style.display = 'none';
        userModal.style.display = 'none';
        document.getElementById('review-modal').style.display = 'none';
    };
});

window.onclick = (e) => {
    if (e.target == productModal) productModal.style.display = 'none';
    if (e.target == orderModal) orderModal.style.display = 'none';
    if (e.target == userModal) userModal.style.display = 'none';
    if (e.target == document.getElementById('review-modal')) document.getElementById('review-modal').style.display = 'none';
};



const campaignForm = document.getElementById('campaign-form');
if (campaignForm) {
    campaignForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const payload = {
            subject: document.getElementById('camp-subject').value,
            title: document.getElementById('camp-title').value,
            banner: document.getElementById('camp-banner').value,
            body: document.getElementById('camp-body').value,
            ctaText: document.getElementById('camp-cta-text').value,
            ctaLink: document.getElementById('camp-cta-link').value
        };

        if (!(await showConfirm('Send Newsletter?', `This will send an email to all ${SUBSCRIBERS.length} subscribers. Continue?`, 'warning'))) return;

        try {
            const res = await apiFetch('/newsletter/send', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            showAlert(res.message, 'success');
            campaignForm.reset();
        } catch (err) {
            if (err.message !== 'Unauthorized') showAlert(err.message || 'Failed to send newsletter', 'error');
        }
    });
}



document.getElementById('add-review-btn').addEventListener('click', () => {
    reviewForm.reset();
    document.getElementById('rev-id').value = '';
    reviewModal.querySelector('h2').innerText = 'Customer Feedback';
    reviewModal.querySelector('button[type="submit"]').innerText = 'Post Testimonial';
    reviewModal.style.display = 'flex';
});

if (reviewForm) {
    reviewForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = reviewForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const id = document.getElementById('rev-id').value;
            const formData = new FormData();

            const nameEl = document.getElementById('rev-name');
            const textEl = document.getElementById('rev-text');
            const starsEl = document.getElementById('rev-stars');
            const boughtEl = document.getElementById('rev-bought');
            const urlEl = document.getElementById('rev-image-url');
            const fileEl = document.getElementById('rev-image-file');

            if (!nameEl.value || !textEl.value) {
                showAlert('Please fill in Author Name and Review Text', 'warning');
                if (submitBtn) submitBtn.disabled = false;
                return;
            }

            formData.append('name', nameEl.value);
            formData.append('text', textEl.value);
            formData.append('stars', starsEl.value || 5);
            formData.append('bought', boughtEl.value || '');

            if (fileEl && fileEl.files[0]) {
                formData.append('image', fileEl.files[0]);
            } else if (urlEl && urlEl.value) {
                formData.append('image', urlEl.value);
            }

            const endpoint = id ? `/reviews/${id}` : '/reviews';
            const method = id ? 'PUT' : 'POST';

            await apiFetch(endpoint, {
                method: method,
                body: formData
            });

            reviewModal.style.display = 'none';
            await loadData();
            showAlert('Testimonial saved successfully!', 'success');
        } catch (err) {
            console.error('Save error:', err);
            if (err.message !== 'Unauthorized') showAlert(err.message || 'Error saving review', 'error');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}

window.deleteReview = async (id) => {
    if (!(await showConfirm('Delete this review?', 'This action cannot be undone.'))) return;
    try {
        await apiFetch(`/reviews/${id}`, { method: 'DELETE' });
        await loadData();
    } catch (e) {
        if (e.message !== 'Unauthorized') showAlert(e.message || 'Error deleting review', 'error');
    }
};


const customPopup = document.getElementById('custom-popup');

async function showPopup({ title, message, type = 'info', isConfirm = false }) {
    return new Promise((resolve) => {
        const icon = document.getElementById('popup-icon');
        const titleEl = document.getElementById('popup-title');
        const msgEl = document.getElementById('popup-message');
        const btnsEl = document.getElementById('popup-btns');

        
        let iconHtml = '';
        let iconColor = '#4f46e5';

        if (type === 'success') {
            iconHtml = '<i class="fas fa-check-circle"></i>';
            iconColor = '#10b981';
        } else if (type === 'error') {
            iconHtml = '<i class="fas fa-exclamation-circle"></i>';
            iconColor = '#ef4444';
        } else if (type === 'warning') {
            iconHtml = '<i class="fas fa-exclamation-triangle"></i>';
            iconColor = '#f59e0b';
        } else {
            iconHtml = '<i class="fas fa-info-circle"></i>';
            iconColor = '#4f46e5';
        }

        icon.innerHTML = iconHtml;
        icon.style.color = iconColor;
        titleEl.innerText = title;
        msgEl.innerText = message;

        
        btnsEl.innerHTML = '';
        if (isConfirm) {
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'btn btn-outline';
            cancelBtn.innerText = 'Cancel';
            cancelBtn.onclick = () => {
                customPopup.style.display = 'none';
                resolve(false);
            };

            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'btn btn-primary';
            confirmBtn.innerText = 'Confirm';
            confirmBtn.style.backgroundColor = type === 'error' || type === 'warning' ? iconColor : '';
            confirmBtn.onclick = () => {
                customPopup.style.display = 'none';
                resolve(true);
            };

            btnsEl.appendChild(cancelBtn);
            btnsEl.appendChild(confirmBtn);
        } else {
            const okBtn = document.createElement('button');
            okBtn.className = 'btn btn-primary';
            okBtn.innerText = 'OK';
            okBtn.onclick = () => {
                customPopup.style.display = 'none';
                resolve(true);
            };
            btnsEl.appendChild(okBtn);
        }

        customPopup.style.display = 'flex';
    });
}

window.showAlert = (message, type = 'info') => {
    return showPopup({
        title: type === 'error' ? 'Oops!' : (type === 'success' ? 'Success' : 'Notification'),
        message,
        type
    });
};

window.showConfirm = (title, message, type = 'warning') => {
    return showPopup({ title, message, type, isConfirm: true });
};



