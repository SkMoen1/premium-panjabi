
document.addEventListener('DOMContentLoaded', () => {
    
    const originHostname = window.location.hostname || 'localhost';
    // TIP: For Vercel, if your backend is on Render/Heroku, replace '/api' with your full URL
    const API_URL = (window.location.protocol === 'file:' || ((originHostname === '127.0.0.1' || originHostname === 'localhost') && window.location.port !== '3000')) ? `http://${originHostname}:3000/api` : '/api';
    
    async function initPage() {
        console.log('initPage starting...');
        try {
            const [settingsRes, productsRes, reviewsRes] = await Promise.all([
                fetch(`${API_URL}/settings`).catch(() => null),
                fetch(`${API_URL}/products`).catch(() => null),
                fetch(`${API_URL}/reviews`).catch(() => null)
            ]);

            const settings = settingsRes ? await settingsRes.json().catch(() => null) : null;
            const products = productsRes ? await productsRes.json().catch(() => null) : null;
            const reviews = reviewsRes ? await reviewsRes.json().catch(() => null) : null;

            if (settings) {
                console.log('Settings Loaded:', settings);
                applySettings(settings);
                if (settings.fbPixelId) initFacebookPixel(settings.fbPixelId);
            }
            if (products && products.length > 0) {
                console.log('Products Loaded:', products.length);
                renderProducts(products);
            }
            if (reviews && reviews.length > 0) {
                console.log('Reviews Loaded:', reviews.length);
                renderReviews(reviews);
            }

            initDynamicEvents();
        } catch (err) {
            console.warn('Error content loading:', err);
        }
    }

    function initFacebookPixel(pixelId) {
        if (!pixelId) return;
        !function (f, b, e, v, n, t, s) {
            if (f.fbq) return; n = f.fbq = function () {
                n.callMethod ?
                    n.callMethod.apply(n, arguments) : n.queue.push(arguments)
            };
            if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
            n.queue = []; t = b.createElement(e); t.async = !0;
            t.src = v; s = b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t, s)
        }(window, document, 'script',
            'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', pixelId);
        fbq('track', 'PageView');
        console.log('Facebook Pixel Initialized:', pixelId);
    }

    function applySettings(settings) {
        
        if (settings.topBar) {
            const topBarP = document.querySelector('.top-bar-content p');
            const topBarTel = document.querySelector('.top-contacts a');
            if (topBarP) topBarP.innerHTML = `<i class="fas fa-bullhorn"></i> ${settings.topBar.discount}`;
            if (topBarTel) {
                topBarTel.href = `tel:${settings.topBar.phone}`;
                topBarTel.innerHTML = `<i class="fas fa-phone"></i> ${settings.topBar.phone}`;
            }
        }

        
        if (settings.logo && (settings.logo.accent || settings.logo.text)) {
            const logos = document.querySelectorAll('.logo');
            logos.forEach(logo => {
                logo.innerHTML = `<span class="logo-accent">${settings.logo.accent || ''}</span> ${settings.logo.text || ''}`;
            });
        }

        
        if (settings.heroSlides && settings.heroSlides.length > 0) {
            const heroSlides = document.querySelectorAll('.hero-slide');
            settings.heroSlides.forEach((slideData, i) => {
                if (heroSlides[i]) {
                    const badge = heroSlides[i].querySelector('.badge');
                    const title = heroSlides[i].querySelector('h1');
                    const desc = heroSlides[i].querySelector('p');
                    const img = heroSlides[i].querySelector('.slide-image img');
                    const btn1 = heroSlides[i].querySelector('.hero-btns a:first-child');
                    const btn2 = heroSlides[i].querySelector('.hero-btns a:last-child');

                    if (badge) badge.innerText = slideData.badge;
                    if (title) title.innerHTML = `${slideData.title} <br><span class="highlight">${slideData.highlight}</span>`;
                    if (desc) desc.innerText = slideData.desc;
                    if (img) img.src = slideData.img;
                    if (btn1) {
                        btn1.innerText = slideData.btn1Text;
                        btn1.href = slideData.btn1Link;
                    }
                    if (btn2) {
                        btn2.innerText = slideData.btn2Text;
                        btn2.href = slideData.btn2Link;
                    }
                }
            });
        }

        
        if (settings.about) {
            const aboutSec = document.getElementById('about');
            if (aboutSec) {
                const title = aboutSec.querySelector('h2');
                const desc = aboutSec.querySelector('p');
                const years = aboutSec.querySelector('.years');
                if (title) title.innerHTML = `${settings.about.title} <br><span class="highlight">${settings.about.highlight}</span>`;
                if (desc) desc.innerText = settings.about.desc;
                if (years) years.innerText = settings.about.experience;
            }
        }

        
        if (settings.features) {
            settings.features.forEach((feat, i) => {
                const titleEl = document.querySelector(`.feat-${i}-title`);
                const descEl = document.querySelector(`.feat-${i}-desc`);
                if (titleEl) titleEl.innerText = feat.title;
                if (descEl) descEl.innerText = feat.desc;
            });
        }

        
        if (Array.isArray(settings.filters) && settings.filters.length > 0) {
            const filterContainer = document.querySelector('.filter-container');
            if (filterContainer) {
                const currentActiveFilter = filterContainer.querySelector('.active')?.dataset.filter || 'all';
                filterContainer.innerHTML = '';
                settings.filters.forEach(f => {
                    const btn = document.createElement('button');
                    btn.className = `filter-btn ${f.value === currentActiveFilter ? 'active' : ''}`;
                    btn.dataset.filter = f.value;
                    btn.innerText = f.label;
                    filterContainer.appendChild(btn);

                    
                    btn.addEventListener('click', () => {
                        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        const filterValue = btn.getAttribute('data-filter');
                        document.querySelectorAll('.product-card').forEach(card => {
                            card.style.display = (filterValue === 'all' || card.getAttribute('data-category') === filterValue) ? 'block' : 'none';
                        });
                    });
                });
            }
        }

        
        if (Array.isArray(settings.nav) && settings.nav.length > 0) {
            const navLinks = document.querySelector('.nav-links');
            const offcanvasLinks = document.querySelector('.offcanvas-links');

            const linksHTML = settings.nav.map(item => `<a href="${item.link}">${item.label}</a>`).join('');

            if (navLinks) navLinks.innerHTML = linksHTML;
            if (offcanvasLinks) offcanvasLinks.innerHTML = linksHTML;
        }

        
        if (Array.isArray(settings.social) && settings.social.length > 0) {
            const footerSocial = document.querySelector('.footer .social-links');
            const offcanvasSocial = document.querySelector('.offcanvas-social .social-icons');
            const waFloat = document.querySelector('.whatsapp-float');

            const socialHTML = settings.social.map(s => {
                let link = s.link;
                if (s.icon.includes('whatsapp') && !link.startsWith('http')) {
                    link = `https://wa.me/${s.link.replace(/\D/g, '')}`;
                    if (waFloat) waFloat.href = link;
                }
                return `<a href="${link}" target="_blank" aria-label="Social Link"><i class="${s.icon}"></i></a>`;
            }).join('');

            if (footerSocial) footerSocial.innerHTML = socialHTML;
            if (offcanvasSocial) offcanvasSocial.innerHTML = socialHTML;
        }

        
        if (settings.footer) {
            const footDesc = document.getElementById('foot-desc-p');
            const footCopy = document.getElementById('foot-copy-text');
            if (footDesc && settings.footer.desc) footDesc.innerText = settings.footer.desc;
            if (footCopy && settings.footer.copy) footCopy.innerText = settings.footer.copy;

            
            if (Array.isArray(settings.footer.links) && settings.footer.links.length > 0) {
                const footerCol = document.querySelectorAll('.footer-col')[1]; 
                if (footerCol) {
                    const ul = footerCol.querySelector('ul');
                    if (ul) {
                        ul.innerHTML = settings.footer.links.map(l => `<li><a href="${l.link}">${l.label}</a></li>`).join('');
                    }
                }
            }
        }

        
        if (settings.fbDomainVerify) {
            let meta = document.querySelector('meta[name="facebook-domain-verification"]');
            if (!meta) {
                meta = document.createElement('meta');
                meta.name = "facebook-domain-verification";
                document.head.appendChild(meta);
            }
            meta.content = settings.fbDomainVerify;
        }
    }

    function renderReviews(reviews) {
        const grid = document.getElementById('review-grid');
        if (!grid) return;
        grid.innerHTML = '';

        reviews.forEach((r, idx) => {
            const card = document.createElement('div');
            card.className = 'review-card reveal';

            let starsHTML = '';
            for (let i = 0; i < 5; i++) {
                starsHTML += `<i class="${i < r.stars ? 'fas' : 'far'} fa-star"></i>`;
            }

            
            const dates = ['২ দিন আগে', '৫ দিন আগে', '১ সপ্তাহ আগে', '১০ দিন আগে', '৩ দিন আগে'];
            const reviewDate = r.date || dates[idx % dates.length];

            card.innerHTML = `
                <div class="review-top">
                    <div class="user-profile">
                        <img src="${r.image}" alt="${r.name}" onerror="this.src='https://via.placeholder.com/100'">
                        <div class="user-name">
                            <h4>${r.name}</h4>
                            <span class="verified"><i class="fas fa-check-circle"></i> ভেরিফাইড ক্রেতা</span>
                        </div>
                    </div>
                </div>
                <div class="review-body">
                    <div class="review-stars">
                        ${starsHTML}
                    </div>
                    <p>${r.text}</p>
                </div>
                <div class="review-footer">
                    ${r.bought ? `
                    <div class="bought-item">
                        <i class="fas fa-shopping-bag"></i> <span>কালেকশন:</span> "${r.bought}"
                    </div>` : '<div></div>'}
                    <span class="review-date">${reviewDate}</span>
                </div>
            `;
            grid.appendChild(card);
            if (typeof observer !== 'undefined') observer.observe(card);
        });
    }

    function renderProducts(products) {
        const grid = document.querySelector('.product-grid');
        if (!grid) return;

        grid.innerHTML = ''; 

        products.forEach(p => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.setAttribute('data-category', p.category);

            let imgHTML = '';
            const renderMedia = (src, name) => {
                const fullSrc = src.startsWith('http') ? src : src; 
                if (src.endsWith('.mp4')) {
                    return `<video src="${fullSrc}" autoplay loop muted playsinline alt="${name}"></video>`;
                }
                return `<img src="${fullSrc}" alt="${name}" onerror="console.error('Image Load Failed:', this.src); this.onerror=null; this.src='https://via.placeholder.com/400?text=Error+Loading+Image';">`;
            };

            if (p.images.length > 1) {
                imgHTML = `
                    <div class="product-slider">
                        <div class="slider-wrapper">
                            ${p.images.map(src => `<div class="slide">${renderMedia(src, p.name)}</div>`).join('')}
                        </div>
                        <button class="slider-btn prev-btn"><i class="fas fa-chevron-left"></i></button>
                        <button class="slider-btn next-btn"><i class="fas fa-chevron-right"></i></button>
                        <div class="slider-dots"></div>
                    </div>
                `;
            } else {
                imgHTML = renderMedia(p.images[0], p.name);
            }

            card.innerHTML = `
                <div class="product-img">
                    ${imgHTML}
                    <span class="product-tag">${p.tag || ''}</span>
                </div>
                <div class="product-info">
                    <h3>${p.name}</h3>
                    <div class="product-brief-info">
                        ${p.features.slice(0, 2).map(f => `<span><i class="fas fa-check-circle"></i> ${f}</span>`).join('')}
                    </div>
                    <div class="price">
                        ${p.oldPrice ? `<span class="old-price">৳ ${p.oldPrice.toLocaleString('bn-BD')}</span>` : ''}
                        <span class="current-price">৳ ${p.price.toLocaleString('bn-BD')}</span>
                    </div>
                    <button class="btn btn-full btn-primary order-btn btn-animate">
                        <i class="fas fa-shopping-cart cart-icon-animate"></i> অর্ডার করুন
                    </button>
                </div>
            `;
            grid.appendChild(card);

            
            if (typeof observer !== 'undefined') observer.observe(card);
            card.classList.add('reveal');
        });

        
        initSliders();
    }

    function initDynamicEvents() {
        
        document.querySelectorAll('.order-btn, .product-info h3').forEach(element => {
            
            const newElement = element.cloneNode(true);
            element.parentNode.replaceChild(newElement, element);

            newElement.style.cursor = 'pointer';
            newElement.addEventListener('click', (e) => {
                e.preventDefault();
                const card = newElement.closest('.product-card');
                if (!card) return;

                const titleElement = card.querySelector('h3');
                const priceElement = card.querySelector('.current-price');

                if (!titleElement || !priceElement) return;

                const title = titleElement.innerText;
                
                const priceStr = priceElement.innerText.replace(/[৳,]/g, '').replace(/\s/g, '').trim();

                
                const bnToEn = n => n.replace(/[০-৯]/g, d => "০১২৩৪৫৬৭৮৯".indexOf(d));
                const price = parseInt(bnToEn(priceStr)) || 0;

                const slides = card.querySelectorAll('.slide img, .slide video');
                let imgsArr = [];

                if (slides.length > 0) {
                    slides.forEach(media => {
                        const src = media.getAttribute('src');
                        if (src) imgsArr.push(src);
                    });
                } else {
                    const singleMedia = card.querySelector('.product-img img, .product-img video');
                    if (singleMedia) {
                        const src = singleMedia.getAttribute('src');
                        if (src) imgsArr.push(src);
                    }
                }

                
                if (imgsArr.length === 0) {
                    const anyImg = card.querySelector('.product-img img');
                    if (anyImg) imgsArr.push(anyImg.getAttribute('src'));
                }

                const imgsParam = encodeURIComponent(imgsArr.join(','));
                const checkoutUrl = `checkout.html?product=${encodeURIComponent(title)}&price=${price}&imgs=${imgsParam}`;
                window.location.href = checkoutUrl;
            });
        });
    }

    
    initDynamicEvents();
    initSliders();

    
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.style.padding = '10px 0';
            navbar.style.background = 'rgba(255, 255, 255, 0.95)';
            navbar.style.boxShadow = '0 5px 20px rgba(0,0,0,0.1)';
        } else {
            navbar.style.padding = '15px 0';
            navbar.style.background = 'rgba(255, 255, 255, 0.8)';
            navbar.style.boxShadow = 'none';
        }
    });

    
    const menuToggle = document.querySelector('.menu-toggle');
    const closeOffcanvas = document.querySelector('.close-offcanvas');
    const offcanvasMenu = document.querySelector('.offcanvas-menu');
    const offcanvasOverlay = document.querySelector('.offcanvas-overlay');
    const offcanvasLinks = document.querySelectorAll('.offcanvas-links a');

    if (menuToggle && offcanvasMenu && offcanvasOverlay) {
        const toggleMenu = (show) => {
            if (show) {
                offcanvasMenu.classList.add('active');
                offcanvasOverlay.classList.add('active');
                document.body.style.overflow = 'hidden';
            } else {
                offcanvasMenu.classList.remove('active');
                offcanvasOverlay.classList.remove('active');
                document.body.style.overflow = 'auto';
            }
        };

        menuToggle.addEventListener('click', () => toggleMenu(true));

        if (closeOffcanvas) {
            closeOffcanvas.addEventListener('click', () => toggleMenu(false));
        }

        offcanvasOverlay.addEventListener('click', () => toggleMenu(false));

        
        offcanvasLinks.forEach(link => {
            link.addEventListener('click', () => toggleMenu(false));
        });
    }

    
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('reveal-active');
            }
        });
    }, observerOptions);

    
    const revealElements = [
        ...document.querySelectorAll('.feature-card'),
        ...document.querySelectorAll('.hero-text'),
        ...document.querySelectorAll('.section-header')
    ];

    revealElements.forEach(el => {
        el.classList.add('reveal');
        observer.observe(el);
    });

    
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });

    
    const filterBtns = document.querySelectorAll('.filter-btn');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filterValue = btn.getAttribute('data-filter');
            const productCards = document.querySelectorAll('.product-card'); 

            productCards.forEach(card => {
                card.style.display = 'none';
                card.classList.remove('reveal-active'); 

                if (filterValue === 'all' || card.getAttribute('data-category') === filterValue) {
                    card.style.display = 'block';
                    setTimeout(() => {
                        card.classList.add('reveal-active');
                    }, 50);
                }
            });
        });
    });

    
    

    
    function initSliders() {
        const sliders = document.querySelectorAll('.product-slider');

        sliders.forEach(slider => {
            if (slider.dataset.initialized) return; 
            slider.dataset.initialized = "true";

            const wrapper = slider.querySelector('.slider-wrapper');
            const slides = slider.querySelectorAll('.slide');
            const prevBtn = slider.querySelector('.prev-btn');
            const nextBtn = slider.querySelector('.next-btn');
            const dotsContainer = slider.querySelector('.slider-dots');

            let currentIndex = 0;
            const slideCount = slides.length;

            if (slideCount <= 1) {
                if (prevBtn) prevBtn.style.display = 'none';
                if (nextBtn) nextBtn.style.display = 'none';
                return;
            }

            
            dotsContainer.innerHTML = '';
            slides.forEach((_, i) => {
                const dot = document.createElement('div');
                dot.classList.add('dot');
                if (i === 0) dot.classList.add('active');
                dot.addEventListener('click', () => goToSlide(i));
                dotsContainer.appendChild(dot);
            });

            const updateSlider = () => {
                wrapper.style.transform = `translateX(-${currentIndex * 100}%)`;

                
                const dots = dotsContainer.querySelectorAll('.dot');
                dots.forEach((dot, i) => {
                    dot.classList.toggle('active', i === currentIndex);
                });
            };

            const goToSlide = (index) => {
                currentIndex = index;
                updateSlider();
            };

            nextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                currentIndex = (currentIndex + 1) % slideCount;
                updateSlider();
            });

            prevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                currentIndex = (currentIndex - 1 + slideCount) % slideCount;
                updateSlider();
            });

            
            let slideInterval;

            const startAutoSlide = () => {
                slideInterval = setInterval(() => {
                    currentIndex = (currentIndex + 1) % slideCount;
                    updateSlider();
                }, 4000); 
            };

            const stopAutoSlide = () => {
                clearInterval(slideInterval);
            };

            
            startAutoSlide();

            
            slider.addEventListener('mouseenter', stopAutoSlide);
            slider.addEventListener('mouseleave', startAutoSlide);

            
            nextBtn.addEventListener('click', () => {
                stopAutoSlide();
                startAutoSlide();
            });

            prevBtn.addEventListener('click', () => {
                stopAutoSlide();
                startAutoSlide();
            });

            slides.forEach((_, i) => {
                const dots = dotsContainer.querySelectorAll('.dot');
                if (dots[i]) {
                    dots[i].addEventListener('click', () => {
                        stopAutoSlide();
                        startAutoSlide();
                    });
                }
            });
        });
    };

    
    

    
    const heroSlides = document.querySelectorAll('.hero-slide');
    const heroDots = document.querySelectorAll('.slider-dot');
    let heroCurrentIndex = 0;
    let heroInterval;

    const showHeroSlide = (index) => {
        heroSlides.forEach(slide => slide.classList.remove('active'));
        heroDots.forEach(dot => dot.classList.remove('active'));

        if (heroSlides[index]) heroSlides[index].classList.add('active');
        if (heroDots[index]) heroDots[index].classList.add('active');
        heroCurrentIndex = index;
    };

    const nextHeroSlide = () => {
        if (heroSlides.length === 0) return; 
        heroCurrentIndex = (heroCurrentIndex + 1) % heroSlides.length;
        showHeroSlide(heroCurrentIndex);
    };

    const startHeroAutoSlide = () => {
        if (heroSlides.length === 0) return; 
        heroInterval = setInterval(nextHeroSlide, 5000);
    };

    heroDots.forEach((dot, i) => {
        dot.addEventListener('click', () => {
            clearInterval(heroInterval);
            showHeroSlide(i);
            startHeroAutoSlide();
        });
    });

    if (heroSlides.length > 0) {
        startHeroAutoSlide();
    }

    
    const newsletterForm = document.querySelector('.newsletter-form');
    if (newsletterForm) {
        newsletterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = newsletterForm.querySelector('input[type="email"]');
            const submitBtn = newsletterForm.querySelector('button');
            const email = emailInput.value.trim();

            if (!email) return;

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> প্রসেসিং...';

            try {
                const response = await fetch(`${API_URL}/subscribe`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });

                const contentType = response.headers.get('content-type');
                let data = {};
                if (contentType && contentType.includes('application/json')) {
                    data = await response.json();
                } else {
                    const text = await response.text();
                    console.error('Non-JSON response:', text);
                    throw new Error('Server returned non-JSON response');
                }

                if (response.ok) {
                    alert(data.message || 'সাবস্ক্রাইব করার জন্য ধন্যবাদ!');
                    emailInput.value = '';
                } else {
                    alert(data.message || 'কিছু ভুল হয়েছে। আবার চেষ্টা করুন।');
                }
            } catch (err) {
                console.error('Newsletter Error:', err);
                alert('সার্ভারের সাথে যোগাযোগ করা সম্ভব হচ্ছে না অথবা সার্ভার থেকে সঠিক উত্তর পাওয়া যাচ্ছে না।');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'জয়েন করুন';
            }
        });
    }

    
    initPage();
});


const revealStyle = document.createElement('style');
revealStyle.textContent = `
    .reveal {
        opacity: 0;
        transform: translateY(30px);
        transition: all 0.8s ease-out;
    }
    .reveal-active {
        opacity: 1;
        transform: translateY(0);
    }
`;
document.head.appendChild(revealStyle);
