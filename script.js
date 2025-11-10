// script.js - Логика приложения МотоДиагностика PRO

// Модульная архитектура с базовой обработкой ошибок
const app = {
    modules: {},
    config: {
        modelsDatabase: {
            "Yamaha": ["MT-07", "MT-09", "YZF-R1", "YZF-R6", "YZF-R3", "XMAX", "TMAX", "Tracer 9", "XSR900"],
            "Honda": ["CBR1000RR", "CBR650R", "CB500F", "Africa Twin", "Rebel 500", "Gold Wing", "NC750X"],
            "Kawasaki": ["Ninja ZX-10R", "Ninja 650", "Z900", "Versys 650", "Vulcan S", "KLX230"],
            "Suzuki": ["GSX-R1000", "GSX-R750", "GSX-S1000", "V-Strom 650", "SV650", "Hayabusa"],
            "BMW": ["S1000RR", "R1250GS", "F900R", "R18", "C400X"],
            "KTM": ["1290 Super Duke R", "790 Duke", "390 Duke", "690 Enduro"],
            "Ducati": ["Panigale V4", "Monster", "Scrambler", "Multistrada", "Streetfighter"],
            "Triumph": ["Street Triple", "Speed Triple", "Tiger 900", "Bonneville", "Rocket 3"],
            "Harley-Davidson": ["Street Glide", "Sportster", "Fat Boy", "Softail", "Pan America"],
            "Другая марка": ["Другая модель"]
        }
    },
    state: {
        reportsDatabase: [],
        inspectionsDatabase: [],
        deferredPrompt: null,
        notificationTimeouts: []
    },
    init() {
        try {
            // Безопасная загрузка из localStorage
            this.state.reportsDatabase = JSON.parse(localStorage.getItem('motodiag_reports') || '[]');
            this.state.inspectionsDatabase = JSON.parse(localStorage.getItem('motodiag_inspections') || '[]');
        } catch (e) {
            console.warn('Ошибка загрузки данных из localStorage:', e);
            this.state.reportsDatabase = [];
            this.state.inspectionsDatabase = [];
        }

        // Инициализация всех модулей с обработкой ошибок
        Object.entries(this.modules).forEach(([name, module]) => {
            try {
                if (module.init) module.init();
            } catch (e) {
                console.error(`Ошибка инициализации модуля ${name}:`, e);
                this.showError('Ошибка загрузки модуля: ' + name);
            }
        });

        // Service Worker для PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('data:text/javascript,' + encodeURIComponent(`
                const CACHE_NAME = 'motodiag-v2.4.0';
                const urlsToCache = ['/', '/index.html'];
                self.addEventListener('install', event => {
                    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
                });
                self.addEventListener('fetch', event => {
                    event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
                });
            `)).catch(() => console.log('SW registration failed'));
        }

        const versionDateEl = document.getElementById('appVersionDate');
        if (versionDateEl) versionDateEl.textContent = new Date().getFullYear();
    },
    showError(message) {
        const container = document.getElementById('toastContainer');
        if (container) {
            const toast = document.createElement('div');
            toast.className = 'toast toast-warning';
            toast.textContent = message;
            container.appendChild(toast);
            setTimeout(() => toast.classList.add('show'), 10);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 5000);
        }
    }
};

// Модуль утилит
app.modules.utils = (function() {
    let audioContext = null;
    
    function parseMoneyValue(value) {
        if (!value) return 0;
        const clean = value.toString().replace(/\s/g, '').replace(',', '.');
        return parseFloat(clean) || 0;
    }

    function formatMoney(amount) {
        return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0 }).format(amount);
    }

    function escapeHtml(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function debounce(fn, wait) {
        let t;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), wait);
        };
    }

    function beep(durationSec = 0.1, freq = 880) {
        try {
            if (!audioContext) {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                if (!Ctx) return;
                audioContext = new Ctx();
            }
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            osc.connect(gain);
            gain.connect(audioContext.destination);
            gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.06, audioContext.currentTime + 0.02);
            osc.start();
            osc.stop(audioContext.currentTime + durationSec);
        } catch (_) {}
    }

    return {
        parseMoneyValue,
        formatMoney,
        escapeHtml,
        debounce,
        beep
    };
})();

// Модуль уведомлений
app.modules.notifications = (function() {
    function showAlert(message, type = 'info') {
        try {
            const container = document.getElementById('toastContainer');
            if (!container) return;
            
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.setAttribute('role','status');
            toast.textContent = message;
            container.appendChild(toast);

            // Аудио/вибро по настройкам
            const vibrationEl = document.getElementById('vibration');
            const soundEl = document.getElementById('soundNotifications');
            if (vibrationEl && vibrationEl.checked && navigator.vibrate) navigator.vibrate(80);
            if (soundEl && soundEl.checked) app.modules.utils.beep(0.12);

            requestAnimationFrame(() => toast.classList.add('show'));
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 4000);
        } catch (e) {
            alert(message);
        }
    }
    
    function showSaveIndicator() {
        const indicator = document.getElementById('saveIndicator');
        if (indicator) {
            indicator.classList.add('visible');
            setTimeout(() => indicator.classList.remove('visible'), 2000);
        }
    }

    return {
        showAlert,
        showSaveIndicator
    };
})();

// Модуль темы
app.modules.theme = (function() {
    function init() {
        const savedTheme = localStorage.getItem('motodiag_theme') || 'light';
        document.body.setAttribute('data-theme', savedTheme);
        const themeCheckbox = document.getElementById('darkTheme');
        if (themeCheckbox) themeCheckbox.checked = savedTheme === 'dark';
        
        const darkThemeEl = document.getElementById('darkTheme');
        const themeToggleEl = document.getElementById('themeToggleHeader');
        
        if (darkThemeEl) darkThemeEl.addEventListener('change', toggleTheme);
        if (themeToggleEl) themeToggleEl.addEventListener('click', toggleThemeManual);
    }

    function toggleTheme() {
        const isDark = document.getElementById('darkTheme').checked;
        const theme = isDark ? 'dark' : 'light';
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('motodiag_theme', theme);
    }

    function toggleThemeManual() {
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';
        document.body.setAttribute('data-theme', newTheme);
        const darkThemeEl = document.getElementById('darkTheme');
        if (darkThemeEl) darkThemeEl.checked = !isDark;
        localStorage.setItem('motodiag_theme', newTheme);
    }

    return {
        init,
        toggleTheme,
        toggleThemeManual
    };
})();

// Модуль навигации
app.modules.navigation = (function() {
    function init() {
        const navTabs = document.querySelectorAll('.nav-tab');
        const tabContents = document.querySelectorAll('.tab-content');
        
        navTabs.forEach(tab => {
            tab.addEventListener('click', function() {
                const tabId = this.getAttribute('data-tab');
                if (!tabId) return;
                
                navTabs.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                tabContents.forEach(c => {
                    c.classList.toggle('active', c.id === `${tabId}-tab`);
                });
                
                // Обновление данных при переходе на вкладки
                if (tabId === 'database' && app.modules.database) app.modules.database.loadReportsList();
                if (tabId === 'inspections' && app.modules.inspections) app.modules.inspections.loadInspectionsList();
                if (tabId === 'stats' && app.modules.statistics) app.modules.statistics.updateStatistics();
            });
        });
    }

    return {
        init
    };
})();

// Модуль работы с формой
app.modules.form = (function() {
    function init() {
        try {
            // Год: макс текущий + 1
            const yearInput = document.getElementById('year');
            if (yearInput) yearInput.max = String(new Date().getFullYear() + 1);

            loadFormData();
            updateProgress();

            const brandEl = document.getElementById('brand');
            const modelEl = document.getElementById('model');
            if (brandEl && modelEl) {
                const savedBrand = brandEl.value;
                const savedModel = modelEl.value;
                if (savedBrand) updateModelOptions(savedBrand, savedModel);
            }

            const reminderTimeEl = document.getElementById('reminderTime');
            const savedReminderTime = localStorage.getItem('motodiag_reminder_time');
            if (reminderTimeEl && savedReminderTime) reminderTimeEl.value = savedReminderTime;

            // Разрешения уведомлений
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission().catch(() => {});
            }

            // Основные кнопки
            const generateBtn = document.getElementById('generateBtn');
            const copyBtn = document.getElementById('copyBtn');
            const saveToDbBtn = document.getElementById('saveToDbBtn');
            const clearFormBtn = document.getElementById('clearFormBtn');
            
            if (generateBtn) generateBtn.addEventListener('click', generateReport);
            if (copyBtn) copyBtn.addEventListener('click', copyToClipboard);
            if (saveToDbBtn) saveToDbBtn.addEventListener('click', saveReportToDatabase);
            if (clearFormBtn) clearFormBtn.addEventListener('click', clearForm);

            // Решение
            const decisionEl = document.getElementById('decision');
            if (decisionEl) decisionEl.addEventListener('change', function() {
                const fields = document.getElementById('inspectionFields');
                if (!fields) return;
                
                if (this.value === '📅 Запланировать проверку') {
                    fields.classList.remove('hidden');
                    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
                    const dateEl = document.getElementById('inspection_date');
                    const timeEl = document.getElementById('inspection_time');
                    if (dateEl) dateEl.value = tomorrow.toISOString().split('T')[0];
                    if (timeEl) timeEl.value = '10:00';
                } else {
                    fields.classList.add('hidden');
                }
            });

            // Выбор марки и модели
            if (brandEl) brandEl.addEventListener('change', function() {
                updateModelOptions(this.value);
                const brandCustom = document.getElementById('brand_custom');
                if (brandCustom) brandCustom.classList.toggle('hidden', this.value !== 'Другая марка');
                updateProgress();
            });
            
            if (modelEl) modelEl.addEventListener('change', function() {
                const modelCustom = document.getElementById('model_custom');
                if (modelCustom) modelCustom.classList.toggle('hidden', this.value !== 'Другая модель');
                updateProgress();
            });

            // Кастомные поля марки и модели
            const brandCustomEl = document.getElementById('brand_custom');
            const modelCustomEl = document.getElementById('model_custom');
            if (brandCustomEl) brandCustomEl.addEventListener('input', updateProgress);
            if (modelCustomEl) modelCustomEl.addEventListener('input', updateProgress);

            // Автосохранение и прогресс
            document.querySelectorAll('#diagnosticForm input, #diagnosticForm select, #diagnosticForm textarea').forEach(el => {
                el.addEventListener('input', app.modules.utils.debounce(() => {
                    updateProgress();
                    const autoSaveEl = document.getElementById('autoSave');
                    if (autoSaveEl && autoSaveEl.checked) {
                        saveFormData();
                        app.modules.notifications.showSaveIndicator();
                    }
                }, 400));
            });
        } catch (e) {
            console.error('Ошибка инициализации формы:', e);
            app.showError('Не удалось загрузить форму');
        }
    }

    function updateModelOptions(brand, preselect = null) {
        const modelSelect = document.getElementById('model');
        if (!modelSelect) return;
        
        modelSelect.innerHTML = '<option value="">-- Выберите модель --</option>';
        if (brand && app.config.modelsDatabase[brand]) {
            app.config.modelsDatabase[brand].forEach(model => {
                const opt = document.createElement('option');
                opt.value = model; opt.textContent = model;
                modelSelect.appendChild(opt);
            });
        }
        const customOption = document.createElement('option');
        customOption.value = 'Другая модель';
        customOption.textContent = 'Другая модель';
        modelSelect.appendChild(customOption);

        if (preselect) {
            modelSelect.value = preselect;
            const modelCustom = document.getElementById('model_custom');
            if (modelCustom) modelCustom.classList.toggle('hidden', preselect !== 'Другая модель');
        }
    }

    function updateProgress() {
        const brandEl = document.getElementById('brand');
        const modelEl = document.getElementById('model');
        const yearEl = document.getElementById('year');
        if (!brandEl || !modelEl || !yearEl) return;

        let brandFilled = brandEl.value && brandEl.value !== '';
        let modelFilled = modelEl.value && modelEl.value !== '';
        
        if (brandEl.value === 'Другая марка') {
            const brandCustom = document.getElementById('brand_custom');
            brandFilled = brandCustom && brandCustom.value.trim() !== '';
        }
        if (modelEl.value === 'Другая модель') {
            const modelCustom = document.getElementById('model_custom');
            modelFilled = modelCustom && modelCustom.value.trim() !== '';
        }

        const filled = (brandFilled ? 1 : 0) + (modelFilled ? 1 : 0) + (yearEl.value ? 1 : 0);
        const progress = (filled / 3) * 100;
        
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        if (progressFill) progressFill.style.width = `${progress}%`;
        if (progressText) {
            if (progress === 100) {
                progressText.textContent = '✅ Все основные данные заполнены!';
                progressText.style.color = 'var(--success-color)';
            } else {
                progressText.textContent = `Заполнено ${filled} из 3 основных полей`;
                progressText.style.color = 'var(--text-light)';
            }
        }
    }

    function saveFormData() {
        try {
            const formData = new FormData(document.getElementById('diagnosticForm'));
            const data = {};
            for (const [k, v] of formData.entries()) data[k] = v;
            localStorage.setItem('motodiag_form_data', JSON.stringify(data));
        } catch (e) {
            console.warn('Ошибка сохранения формы:', e);
        }
    }

    function loadFormData() {
        try {
            const savedData = localStorage.getItem('motodiag_form_data');
            if (!savedData) return;
            const data = JSON.parse(savedData);
            Object.keys(data).forEach(key => {
                const el = document.getElementById(key);
                if (el) el.value = data[key];
            });
            if (data.brand) {
                updateModelOptions(data.brand, data.model || null);
                const brandCustom = document.getElementById('brand_custom');
                const modelCustom = document.getElementById('model_custom');
                const inspectionFields = document.getElementById('inspectionFields');
                
                if (brandCustom) brandCustom.classList.toggle('hidden', data.brand !== 'Другая марка');
                if (modelCustom) modelCustom.classList.toggle('hidden', data.model !== 'Другая модель');
                if (inspectionFields) inspectionFields.classList.toggle('hidden', data.decision !== '📅 Запланировать проверку');
            }
        } catch (e) {
            console.warn('Ошибка загрузки формы:', e);
        }
    }

    function clearForm() {
        if (!confirm('Вы уверены, что хотите очистить все поля формы?')) return;
        
        const form = document.getElementById('diagnosticForm');
        if (form) form.reset();
        
        localStorage.removeItem('motodiag_form_data');
        
        const outputCard = document.getElementById('outputCard');
        const savingsAlert = document.getElementById('savingsAlert');
        const inspectionFields = document.getElementById('inspectionFields');
        const brandCustom = document.getElementById('brand_custom');
        const modelCustom = document.getElementById('model_custom');
        
        if (outputCard) outputCard.classList.add('hidden');
        if (savingsAlert) savingsAlert.classList.add('hidden');
        if (inspectionFields) inspectionFields.classList.add('hidden');
        if (brandCustom) brandCustom.classList.add('hidden');
        if (modelCustom) modelCustom.classList.add('hidden');
        
        updateModelOptions('', null);
        updateProgress();
        app.modules.notifications.showAlert('Форма очищена', 'success');
    }

    function validateForm() {
        let ok = true, msg = '';

        const brandEl = document.getElementById('brand');
        const modelEl = document.getElementById('model');
        const yearEl = document.getElementById('year');
        if (!brandEl || !modelEl || !yearEl) return false;

        // Базовые обязательные
        if (!brandEl.value) { ok = false; brandEl.style.borderColor = 'var(--danger-color)'; }
        else brandEl.style.borderColor = '';

        if (!modelEl.value) { ok = false; modelEl.style.borderColor = 'var(--danger-color)'; }
        else modelEl.style.borderColor = '';

        if (!yearEl.value) { ok = false; yearEl.style.borderColor = 'var(--danger-color)'; }
        else yearEl.style.borderColor = '';

        // Кастомные поля
        if (brandEl.value === 'Другая марка') {
            const bc = document.getElementById('brand_custom');
            if (bc && !bc.value.trim()) { 
                ok = false; 
                bc.style.borderColor = 'var(--danger-color)'; 
                msg = 'Укажите марку в поле "Введите марку"'; 
            } else if (bc) {
                bc.style.borderColor = '';
            }
        }
        if (modelEl.value === 'Другая модель') {
            const mc = document.getElementById('model_custom');
            if (mc && !mc.value.trim()) { 
                ok = false; 
                mc.style.borderColor = 'var(--danger-color)'; 
                msg = 'Укажите модель в поле "Введите модель"'; 
            } else if (mc) {
                mc.style.borderColor = '';
            }
        }

        // Диапазон года
        const y = parseInt(yearEl.value, 10);
        const minY = parseInt(yearEl.min || '1990', 10);
        const maxY = parseInt(yearEl.max || String(new Date().getFullYear() + 1), 10);
        if (isFinite(y) && (y < minY || y > maxY)) {
            ok = false; yearEl.style.borderColor = 'var(--danger-color)'; 
            msg = `Год выпуска должен быть между ${minY} и ${maxY}`;
        }

        // Пробег
        const mileageEl = document.getElementById('mileage');
        if (mileageEl && mileageEl.value !== '' && parseFloat(mileageEl.value) < 0) {
            ok = false; mileageEl.style.borderColor = 'var(--danger-color)'; 
            msg = 'Пробег не может быть отрицательным';
        } else if (mileageEl) {
            mileageEl.style.borderColor = '';
        }

        // Рейтинги 1-5
        ['appearance_rating','engine_rating','electronics_rating','suspension_rating'].forEach(id => {
            const el = document.getElementById(id);
            if (el && el.value !== '') {
                const v = parseInt(el.value, 10);
                if (v < 1 || v > 5) { 
                    ok = false; 
                    el.style.borderColor = 'var(--danger-color)'; 
                    msg = 'Рейтинги должны быть от 1 до 5'; 
                } else {
                    el.style.borderColor = '';
                }
            } else if (el) {
                el.style.borderColor = '';
            }
        });

        // Если планируем проверку — дата и время обязательны
        const decision = document.getElementById('decision')?.value;
        if (decision === '📅 Запланировать проверку') {
            ['inspection_date','inspection_time','inspection_address','customer_phone'].forEach(id => {
                const el = document.getElementById(id);
                if (el && !el.value.trim()) { 
                    ok = false; 
                    el.style.borderColor = 'var(--danger-color)'; 
                } else if (el) {
                    el.style.borderColor = '';
                }
            });
            if (!msg) msg = 'Укажите дату, время, адрес и телефон заказчика для проверки';
        }

        if (!ok) {
            app.modules.notifications.showAlert(msg || 'Пожалуйста, заполните все обязательные поля', 'warning');
            const generateBtn = document.getElementById('generateBtn');
            if (generateBtn) {
                generateBtn.classList.add('shake');
                setTimeout(() => generateBtn.classList.remove('shake'), 500);
            }
        }
        return ok;
    }

    function generateReport() {
        if (!validateForm()) return;
        
        try {
            const formData = new FormData(document.getElementById('diagnosticForm'));
            const data = Object.fromEntries(formData.entries());
            const report = generateReportText(data);
            
            const output = document.getElementById('output');
            const outputCard = document.getElementById('outputCard');
            const copyBtn = document.getElementById('copyBtn');
            
            if (output) output.textContent = report;
            if (outputCard) outputCard.classList.remove('hidden');
            if (copyBtn) copyBtn.classList.remove('hidden');

            calculateAndShowSavings(data);

            if (data.decision === '📅 Запланировать проверку' && app.modules.inspections) {
                app.modules.inspections.scheduleInspection(data);
            }

            if (outputCard) outputCard.scrollIntoView({ behavior: 'smooth' });
            app.modules.notifications.showAlert('Отчет успешно сгенерирован!', 'success');
        } catch (e) {
            console.error('Ошибка генерации отчета:', e);
            app.modules.notifications.showAlert('Ошибка при создании отчета', 'warning');
        }
    }

    function generateReportText(data) {
        const brand = data.brand === 'Другая марка' ? data.brand_custom : data.brand;
        const model = data.model === 'Другая модель' ? data.model_custom : data.model;
        
        let report = `🏍️ Мотоподбор, осмотр мотоцикла перед покупкой, выездная диагностика, подбор под ключ.\n`;
        report += `📞 Сергей Ландик 8 950 005-05-08\n`;
        report += `🌐 Сайт: motopodbor.ru\n\n`;
        
        report += `🏍️ ${brand} ${model}\n`;
        if (data.year) report += `📅 Год выпуска: ${data.year}\n`;
        if (data.mileage) report += `🛣️ Пробег: ${data.mileage} тыс. км\n`;
        if (data.motorcycle_class) report += `🏷️ Класс: ${data.motorcycle_class}\n`;
        if (data.legal_check) report += `📋 Юридическая проверка: ${data.legal_check}\n\n`;
        
        report += `🔍 РЕЗУЛЬТАТЫ ДИАГНОСТИКИ:\n\n`;
        const ratings = {
            '👁️ Внешний вид': data.appearance_rating,
            '⚙️ Двигатель/КПП': data.engine_rating,
            '🔌 Электрооборудование': data.electronics_rating,
            '🛠️ Подвеска': data.suspension_rating
        };
        Object.entries(ratings).forEach(([label, rating]) => {
            if (rating) {
                const r = parseInt(rating, 10);
                const stars = '★'.repeat(r) + '☆'.repeat(5 - r);
                report += `${label}: ${stars}\n`;
            }
        });
        
        report += `\n💼 ВЫВОДЫ:\n`;
        if (data.key_finding) report += `🔑 Ключевая находка: ${data.key_finding}\n`;
        if (data.expert_verdict) report += `👨‍💼 Вердикт эксперта: ${data.expert_verdict}\n`;
        if (data.decision) {
            report += `🤔 Решение: ${data.decision}\n`;
            if (data.decision === '📅 Запланировать проверку') {
                if (data.inspection_date && data.inspection_time) {
                    const inspectionDate = new Date(data.inspection_date + 'T' + data.inspection_time);
                    report += `📅 Запланированная проверка: ${inspectionDate.toLocaleString('ru-RU')}\n`;
                }
                if (data.inspection_address) report += `📍 Адрес: ${data.inspection_address}\n`;
            }
        }
        
        if (data.price || data.objective_cost || data.seller_discount || data.investment_cost) {
            report += `\n💰 ФИНАНСОВАЯ ИНФОРМАЦИЯ:\n`;
            if (data.price) report += `💵 Цена продавца: ${data.price}\n`;
            if (data.objective_cost) report += `📊 Объективная стоимость: ${data.objective_cost}\n`;
            if (data.seller_discount) report += `🎁 Скидка с продавца: ${data.seller_discount}\n`;
            if (data.investment_cost) report += `🔧 Стоимость вложений: ${data.investment_cost}\n`;
        }
        
        report += `\n────────────────────────────\n`;
        report += `📞 Готовы найти свой идеальный мотоцикл?\n`;
        report += `Звоните: 8 950 005-05-08\n`;
        report += `Мы поможем сделать правильный выбор! ✅`;
        return report;
    }

    function calculateAndShowSavings(data) {
        const price = app.modules.utils.parseMoneyValue(data.price);
        const objectiveCost = app.modules.utils.parseMoneyValue(data.objective_cost);
        const sellerDiscount = app.modules.utils.parseMoneyValue(data.seller_discount);
        const investmentCost = app.modules.utils.parseMoneyValue(data.investment_cost);
        const savingsAlert = document.getElementById('savingsAlert');

        if (price && objectiveCost && savingsAlert) {
            const savings = (objectiveCost - (price - sellerDiscount)) - investmentCost;
            if (savings > 0) {
                savingsAlert.textContent = `💵 Общая экономия для клиента: ${app.modules.utils.formatMoney(savings)}`;
                savingsAlert.classList.remove('hidden');
            } else {
                savingsAlert.classList.add('hidden');
            }
        } else if (savingsAlert) {
            savingsAlert.classList.add('hidden');
        }
    }

    function saveReportToDatabase() {
        if (!validateForm()) return;
        
        try {
            const formData = new FormData(document.getElementById('diagnosticForm'));
            const data = Object.fromEntries(formData.entries());
            const brand = data.brand === 'Другая марка' ? data.brand_custom : data.brand;
            const model = data.model === 'Другая модель' ? data.model_custom : data.model;

            const report = {
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                ...data,
                brand, model,
                generated_text: document.getElementById('output')?.textContent || ''
            };
            
            app.state.reportsDatabase.push(report);
            localStorage.setItem('motodiag_reports', JSON.stringify(app.state.reportsDatabase));
            app.modules.notifications.showAlert('Отчет успешно сохранен в базу данных!', 'success');
            
            if (app.modules.database) app.modules.database.loadReportsList();
            if (app.modules.statistics) app.modules.statistics.updateStatistics();
        } catch (e) {
            console.error('Ошибка сохранения отчета:', e);
            app.modules.notifications.showAlert('Ошибка при сохранении отчета', 'warning');
        }
    }

    function copyToClipboard() {
        try {
            const text = document.getElementById('output')?.textContent || '';
            navigator.clipboard.writeText(text).then(() => {
                app.modules.notifications.showAlert('Отчет скопирован в буфер обмена!', 'success');
            }).catch(() => {
                const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
                document.execCommand('copy'); document.body.removeChild(ta);
                app.modules.notifications.showAlert('Отчет скопирован в буфер обмена!', 'success');
            });
        } catch (e) {
            console.error('Ошибка копирования:', e);
            app.modules.notifications.showAlert('Ошибка при копировании', 'warning');
        }
    }

    return {
        init,
        updateModelOptions,
        updateProgress,
        saveFormData,
        loadFormData,
        clearForm,
        validateForm,
        generateReport,
        generateReportText,
        calculateAndShowSavings,
        saveReportToDatabase,
        copyToClipboard
    };
})();

// Модуль базы данных
app.modules.database = (function() {
    function init() {
        const searchReportsEl = document.getElementById('searchReports');
        const exportBtnEl = document.getElementById('exportBtn');
        const importBtnEl = document.getElementById('importBtn');
        
        if (searchReportsEl) searchReportsEl.addEventListener('input', loadReportsList);
        if (exportBtnEl) exportBtnEl.addEventListener('click', exportDatabase);
        if (importBtnEl) importBtnEl.addEventListener('click', importDatabase);
    }

    function loadReportsList() {
        const reportsList = document.getElementById('reportsList');
        if (!reportsList) return;
        
        const searchValue = (document.getElementById('searchReports')?.value || '').toLowerCase();

        if (app.state.reportsDatabase.length === 0) {
            reportsList.innerHTML = '<div class="text-center" style="padding: 20px; color: var(--text-light);">Нет сохраненных отчетов</div>';
            return;
        }

        const filtered = app.state.reportsDatabase.filter(r => {
            if (!searchValue) return true;
            return (
                r.brand?.toLowerCase().includes(searchValue) ||
                r.model?.toLowerCase().includes(searchValue) ||
                (r.year && String(r.year).includes(searchValue)) ||
                r.vin?.toLowerCase().includes(searchValue) ||
                r.license_plate?.toLowerCase().includes(searchValue)
            );
        }).reverse();

        if (filtered.length === 0) {
            reportsList.innerHTML = '<div class="text-center" style="padding: 20px; color: var(--text-light);">Отчеты не найдены</div>';
            return;
        }

        reportsList.innerHTML = filtered.map(report => `
            <div class="report-item">
                <div class="report-header">
                    <div class="report-title">${app.modules.utils.escapeHtml(report.brand)} ${app.modules.utils.escapeHtml(report.model)} (${app.modules.utils.escapeHtml(report.year)})</div>
                    <div class="report-actions">
                        <button class="action-btn" style="background: var(--secondary-color); color: white;" onclick="app.modules.report.viewReport('${report.id}')" aria-label="Просмотреть отчет">👁️</button>
                        <button class="action-btn" style="background: var(--warning-color); color: white;" onclick="app.modules.report.editReport('${report.id}')" aria-label="Редактировать отчет">✏️</button>
                        <button class="action-btn" style="background: var(--danger-color); color: white;" onclick="app.modules.report.deleteReport('${report.id}')" aria-label="Удалить отчет">🗑️</button>
                    </div>
                </div>
                <div class="report-meta">
                    <div>Пробег: ${app.modules.utils.escapeHtml(report.mileage || '0')} тыс.км</div>
                    <div>Цена: ${app.modules.utils.escapeHtml(report.price || 'Не указана')}</div>
                    <div>${report.vin ? `VIN: ${app.modules.utils.escapeHtml(report.vin)}` : 'VIN: Не указан'}</div>
                    <div>${report.license_plate ? `Номер: ${app.modules.utils.escapeHtml(report.license_plate)}` : 'Номер: Не указан'}</div>
                    <div>Класс: ${app.modules.utils.escapeHtml(report.motorcycle_class || 'Не указан')}</div>
                    <div>Решение: ${app.modules.utils.escapeHtml(report.decision || 'Не указано')}</div>
                </div>
            </div>
        `).join('');
    }

    function exportDatabase() {
        try {
            const dataStr = JSON.stringify(app.state.reportsDatabase, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.href = url;
            link.download = `motodiag_reports_${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 100);
            app.modules.notifications.showAlert('База данных успешно экспортирована', 'success');
        } catch { 
            app.modules.notifications.showAlert('Ошибка при экспорте данных', 'warning');
        }
    }

    function importDatabase() {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json';
        input.onchange = e => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = evt => {
                try {
                    const imported = JSON.parse(evt.target.result);
                    if (!Array.isArray(imported)) throw new Error('format');
                    if (confirm(`Найдено ${imported.length} отчетов. Добавить к существующим?`)) {
                        app.state.reportsDatabase = [...app.state.reportsDatabase, ...imported];
                        localStorage.setItem('motodiag_reports', JSON.stringify(app.state.reportsDatabase));
                        loadReportsList();
                        if (app.modules.statistics) app.modules.statistics.updateStatistics();
                        app.modules.notifications.showAlert(`Успешно импортировано ${imported.length} отчетов`, 'success');
                    }
                } catch { app.modules.notifications.showAlert('Ошибка при чтении файла', 'warning'); }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    return {
        init,
        loadReportsList,
        exportDatabase,
        importDatabase
    };
})();

// Модуль проверок
app.modules.inspections = (function() {
    function init() {
        const searchInspectionsEl = document.getElementById('searchInspections');
        const exportInspectionsBtnEl = document.getElementById('exportInspectionsBtn');
        const importInspectionsBtnEl = document.getElementById('importInspectionsBtn');
        
        if (searchInspectionsEl) searchInspectionsEl.addEventListener('input', loadInspectionsList);
        if (exportInspectionsBtnEl) exportInspectionsBtnEl.addEventListener('click', exportInspections);
        if (importInspectionsBtnEl) importInspectionsBtnEl.addEventListener('click', importInspections);
        
        scheduleInspectionNotifications();
    }

    function loadInspectionsList() {
        const inspectionsList = document.getElementById('inspectionsList');
        if (!inspectionsList) return;
        
        const searchValue = (document.getElementById('searchInspections')?.value || '').toLowerCase();

        if (app.state.inspectionsDatabase.length === 0) {
            inspectionsList.innerHTML = '<div class="text-center" style="padding: 20px; color: var(--text-light);">Нет запланированных проверок</div>';
            return;
        }

        const filtered = app.state.inspectionsDatabase.filter(inspection => {
            if (!searchValue) return true;
            return (
                inspection.brand?.toLowerCase().includes(searchValue) ||
                inspection.model?.toLowerCase().includes(searchValue) ||
                inspection.inspection_address?.toLowerCase().includes(searchValue)
            );
        }).sort((a, b) => new Date(a.inspection_date + 'T' + a.inspection_time) - new Date(b.inspection_date + 'T' + b.inspection_time));

        if (filtered.length === 0) {
            inspectionsList.innerHTML = '<div class="text-center" style="padding: 20px; color: var(--text-light);">Проверки не найдены</div>';
            return;
        }

        inspectionsList.innerHTML = filtered.map(inspection => {
            const inspectionDateTime = new Date(inspection.inspection_date + 'T' + inspection.inspection_time);
            const now = new Date();
            const timeDiff = inspectionDateTime.getTime() - now.getTime();
            const hoursDiff = timeDiff / (1000 * 60 * 60);

            const isUrgent = hoursDiff < 24 && hoursDiff > 0;
            const isOverdue = timeDiff < 0 && inspection.status === 'planned';

            let statusBadge = '';
            if (inspection.status === 'completed') statusBadge = '<span class="badge badge-success">✅ Выполнено</span>';
            else if (isOverdue) statusBadge = '<span class="badge badge-warning">⚠️ Просрочено</span>';
            else if (isUrgent) statusBadge = '<span class="badge badge-warning">🔔 Срочно</span>';
            else statusBadge = '<span class="badge badge-info">📅 Запланировано</span>';

            return `
            <div class="inspection-item ${isUrgent ? 'urgent' : ''} ${inspection.status === 'completed' ? 'completed' : ''}">
                <div class="inspection-header">
                    <div class="inspection-title">${app.modules.utils.escapeHtml(inspection.brand)} ${app.modules.utils.escapeHtml(inspection.model)} (${app.modules.utils.escapeHtml(inspection.year)})</div>
                    <div class="inspection-date">${inspectionDateTime.toLocaleDateString('ru-RU')} ${app.modules.utils.escapeHtml(inspection.inspection_time)}</div>
                </div>
                <div class="inspection-details">
                    <div><strong>Адрес:</strong> ${app.modules.utils.escapeHtml(inspection.inspection_address || '')}</div>
                    <div><strong>Заказчик:</strong> ${app.modules.utils.escapeHtml(inspection.customer_phone || '')}</div>
                    <div><strong>Продавец:</strong> ${app.modules.utils.escapeHtml(inspection.seller_phone || 'Не указан')}</div>
                    <div><strong>Статус:</strong> ${statusBadge}</div>
                </div>
                ${inspection.inspection_notes ? `<div style="margin-bottom: 12px;"><strong>Заметки:</strong> ${app.modules.utils.escapeHtml(inspection.inspection_notes)}</div>` : ''}
                <div class="inspection-actions">
                    <button class="action-btn" style="background: var(--secondary-color); color: white;" onclick="app.modules.inspections.viewInspection('${inspection.id}')" aria-label="Просмотреть проверку">👁️</button>
                    <button class="action-btn" style="background: var(--success-color); color: white;" onclick="app.modules.inspections.completeInspection('${inspection.id}')" aria-label="Отметить как выполнено">✅</button>
                    <button class="action-btn" style="background: var(--warning-color); color: white;" onclick="app.modules.inspections.editInspection('${inspection.id}')" aria-label="Редактировать проверку">✏️</button>
                    <button class="action-btn" style="background: var(--danger-color); color: white;" onclick="app.modules.inspections.deleteInspection('${inspection.id}')" aria-label="Удалить проверку">🗑️</button>
                </div>
            </div>`;
        }).join('');
    }

    function scheduleInspection(data) {
        try {
            const brand = data.brand === 'Другая марка' ? data.brand_custom : data.brand;
            const model = data.model === 'Другая модель' ? data.model_custom : data.model;
            
            const inspection = {
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                brand, model,
                year: data.year,
                inspection_date: data.inspection_date,
                inspection_time: data.inspection_time,
                inspection_address: data.inspection_address,
                customer_phone: data.customer_phone,
                seller_phone: data.seller_phone || '',
                inspection_notes: data.inspection_notes || '',
                status: 'planned',
                reminder_sent: false
            };
            app.state.inspectionsDatabase.push(inspection);
            localStorage.setItem('motodiag_inspections', JSON.stringify(app.state.inspectionsDatabase));
            scheduleInspectionNotification(inspection);
            app.modules.notifications.showAlert('Проверка успешно запланирована!', 'success');
            loadInspectionsList();
            if (app.modules.statistics) app.modules.statistics.updateStatistics();
        } catch (e) {
            console.error('Ошибка планирования проверки:', e);
            app.modules.notifications.showAlert('Ошибка при планировании проверки', 'warning');
        }
    }

    function scheduleInspectionNotification(inspection) {
        try {
            const inspectionDateTime = new Date(inspection.inspection_date + 'T' + inspection.inspection_time);
            const reminderHours = parseInt(document.getElementById('reminderTime')?.value || 2);
            const reminderDateTime = new Date(inspectionDateTime.getTime() - (reminderHours * 60 * 60 * 1000));
            const now = new Date();

            if (reminderDateTime > now) {
                const timeout = reminderDateTime.getTime() - now.getTime();
                const timeoutId = setTimeout(() => {
                    const inspectionNotificationsEl = document.getElementById('inspectionNotifications');
                    if (inspectionNotificationsEl && inspectionNotificationsEl.checked) {
                        showInspectionNotification(inspection, reminderHours);
                    }
                }, timeout);
                app.state.notificationTimeouts.push({ id: inspection.id, timeoutId });
            }
        } catch (e) {
            console.error('Ошибка scheduling notification:', e);
        }
    }

    function scheduleInspectionNotifications() {
        app.state.notificationTimeouts.forEach(t => clearTimeout(t.timeoutId));
        app.state.notificationTimeouts = [];
        app.state.inspectionsDatabase.forEach(i => {
            if (i.status === 'planned' && !i.reminder_sent) scheduleInspectionNotification(i);
        });
    }

    function showInspectionNotification(inspection, reminderHours) {
        try {
            const inspectionIndex = app.state.inspectionsDatabase.findIndex(i => i.id === inspection.id);
            if (inspectionIndex !== -1) {
                app.state.inspectionsDatabase[inspectionIndex].reminder_sent = true;
                localStorage.setItem('motodiag_inspections', JSON.stringify(app.state.inspectionsDatabase));
            }
            
            if (Notification.permission === 'granted') {
                try {
                    new Notification('🔔 Напоминание о проверке', {
                        body: `Проверка ${inspection.brand} ${inspection.model} через ${reminderHours} ч.\nАдрес: ${inspection.inspection_address}`,
                        tag: 'inspection-reminder'
                    });
                } catch (_) {}
            }
            app.modules.notifications.showAlert(`🔔 Напоминание: Проверка ${inspection.brand} ${inspection.model} через ${reminderHours} ч.`, 'info');
        } catch (e) {
            console.error('Ошибка показа уведомления:', e);
        }
    }

    function viewInspection(inspectionId) {
        const inspection = app.state.inspectionsDatabase.find(i => i.id === inspectionId);
        if (!inspection) return;
        const dt = new Date(inspection.inspection_date + 'T' + inspection.inspection_time);
        const txt = `
🏍️ Детали запланированной проверки:

Мотоцикл: ${inspection.brand} ${inspection.model} (${inspection.year})
📅 Дата и время: ${dt.toLocaleString('ru-RU')}
📍 Адрес: ${inspection.inspection_address}
📞 Телефон заказчика: ${inspection.customer_phone}
📞 Телефон продавца: ${inspection.seller_phone || 'Не указан'}
${inspection.inspection_notes ? `📝 Заметки: ${inspection.inspection_notes}` : ''}
📊 Статус: ${inspection.status === 'completed' ? '✅ Выполнено' : '📅 Запланировано'}

Для связи: 8 950 005-05-08
        `;
        const output = document.getElementById('output');
        const outputCard = document.getElementById('outputCard');
        const copyBtn = document.getElementById('copyBtn');
        
        if (output) output.textContent = txt;
        if (outputCard) outputCard.classList.remove('hidden');
        if (copyBtn) copyBtn.classList.remove('hidden');
        
        const reportTab = document.querySelector('.nav-tab[data-tab="report"]');
        if (reportTab) reportTab.click();
        if (outputCard) outputCard.scrollIntoView({ behavior: 'smooth' });
    }

    function completeInspection(inspectionId) {
        const inspection = app.state.inspectionsDatabase.find(i => i.id === inspectionId);
        if (!inspection) return;
        inspection.status = 'completed';
        localStorage.setItem('motodiag_inspections', JSON.stringify(app.state.inspectionsDatabase));
        loadInspectionsList();
        if (app.modules.statistics) app.modules.statistics.updateStatistics();
        app.modules.notifications.showAlert('Проверка отмечена как выполненная!', 'success');
    }

    function editInspection(inspectionId) {
        const inspection = app.state.inspectionsDatabase.find(i => i.id === inspectionId);
        if (!inspection) return;

        Object.keys(inspection).forEach(key => {
            const el = document.getElementById(key);
            if (el && inspection[key] !== undefined && inspection[key] !== null) el.value = inspection[key];
        });
        
        const brandEl = document.getElementById('brand');
        if (brandEl && inspection.brand) {
            app.modules.form.updateModelOptions(inspection.brand, inspection.model || null);
        }

        const brandCustom = document.getElementById('brand_custom');
        const modelCustom = document.getElementById('model_custom');
        const inspectionFields = document.getElementById('inspectionFields');
        
        if (brandCustom) brandCustom.classList.toggle('hidden', inspection.brand !== 'Другая марка');
        if (modelCustom) modelCustom.classList.toggle('hidden', inspection.model !== 'Другая модель');
        if (inspectionFields) inspectionFields.classList.toggle('hidden', inspection.decision !== '📅 Запланировать проверку');
        
        app.modules.form.updateProgress();

        deleteInspection(inspectionId, true, true);

        const reportTab = document.querySelector('.nav-tab[data-tab="report"]');
        if (reportTab) reportTab.click();
        app.modules.notifications.showAlert('Данные проверки загружены в форму для редактирования', 'info');
    }

    function deleteInspection(inspectionId, skipConfirm = false, silent = false) {
        if (skipConfirm || confirm('Вы уверены, что хотите удалить эту проверку?')) {
            app.state.inspectionsDatabase = app.state.inspectionsDatabase.filter(i => i.id !== inspectionId);
            localStorage.setItem('motodiag_inspections', JSON.stringify(app.state.inspectionsDatabase));
            loadInspectionsList();
            if (app.modules.statistics) app.modules.statistics.updateStatistics();
            if (!silent) app.modules.notifications.showAlert('Проверка успешно удалена', 'success');
        }
    }

    function exportInspections() {
        try {
            const dataStr = JSON.stringify(app.state.inspectionsDatabase, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.href = url;
            link.download = `motodiag_inspections_${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 100);
            app.modules.notifications.showAlert('Проверки успешно экспортированы', 'success');
        } catch { 
            app.modules.notifications.showAlert('Ошибка при экспорте проверок', 'warning');
        }
    }

    function importInspections() {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json';
        input.onchange = e => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = evt => {
                try {
                    const imported = JSON.parse(evt.target.result);
                    if (!Array.isArray(imported)) throw new Error('format');
                    if (confirm(`Найдено ${imported.length} проверок. Добавить к существующим?`)) {
                        app.state.inspectionsDatabase = [...app.state.inspectionsDatabase, ...imported];
                        localStorage.setItem('motodiag_inspections', JSON.stringify(app.state.inspectionsDatabase));
                        loadInspectionsList();
                        if (app.modules.statistics) app.modules.statistics.updateStatistics();
                        scheduleInspectionNotifications();
                        app.modules.notifications.showAlert(`Успешно импортировано ${imported.length} проверок`, 'success');
                    }
                } catch { app.modules.notifications.showAlert('Ошибка при чтении файла', 'warning'); }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    return {
        init,
        loadInspectionsList,
        scheduleInspection,
        scheduleInspectionNotification,
        scheduleInspectionNotifications,
        viewInspection,
        completeInspection,
        editInspection,
        deleteInspection,
        exportInspections,
        importInspections
    };
})();

// Модуль статистики
app.modules.statistics = (function() {
    function init() {
        document.querySelectorAll('.grid-btn[data-period]').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.grid-btn[data-period]').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                updateStatistics(this.getAttribute('data-period'));
            });
        });
        
        const generateStatsBtn = document.getElementById('generateStatsBtn');
        const copyStatsBtn = document.getElementById('copyStatsBtn');
        
        if (generateStatsBtn) generateStatsBtn.addEventListener('click', generateStatsPost);
        if (copyStatsBtn) copyStatsBtn.addEventListener('click', copyStatsToClipboard);
    }

    function updateStatistics(period = 'week') {
        const now = new Date();
        let startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        if (period === 'month') startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        if (period === 'quarter') { const q = Math.floor(now.getMonth() / 3); startDate = new Date(now.getFullYear(), q * 3, 1); }
        if (period === 'year') startDate = new Date(now.getFullYear(), 0, 1);

        const periodReports = app.state.reportsDatabase.filter(r => new Date(r.timestamp) >= startDate);
        const totalReports = periodReports.length;
        const purchased = periodReports.filter(r => r.decision === '✅ Куплен').length;

        let totalSavings = 0;
        periodReports.forEach(r => {
            const price = app.modules.utils.parseMoneyValue(r.price);
            const objectiveCost = app.modules.utils.parseMoneyValue(r.objective_cost);
            const sellerDiscount = app.modules.utils.parseMoneyValue(r.seller_discount);
            const investmentCost = app.modules.utils.parseMoneyValue(r.investment_cost);
            if (price && objectiveCost) {
                const s = (objectiveCost - (price - sellerDiscount)) - investmentCost;
                if (s > 0) totalSavings += s;
            }
        });
        const avgSavings = purchased > 0 ? totalSavings / purchased : 0;

        const brandCounts = {};
        periodReports.forEach(r => { if (r.brand) brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1; });
        const brandKeys = Object.keys(brandCounts);
        const popularBrand = brandKeys.length ? brandKeys.reduce((a, b) => brandCounts[a] > brandCounts[b] ? a : b) : 'Нет данных';

        const plannedInspections = app.state.inspectionsDatabase.filter(i => i.status === 'planned').length;
        const completedInspections = app.state.inspectionsDatabase.filter(i => i.status === 'completed').length;

        const totalReportsEl = document.getElementById('totalReports');
        const successfulDealsEl = document.getElementById('successfulDeals');
        const avgSavingsEl = document.getElementById('avgSavings');
        const popularBrandEl = document.getElementById('popularBrand');
        const plannedInspectionsEl = document.getElementById('plannedInspections');
        const completedInspectionsEl = document.getElementById('completedInspections');
        
        if (totalReportsEl) totalReportsEl.textContent = totalReports;
        if (successfulDealsEl) successfulDealsEl.textContent = purchased;
        if (avgSavingsEl) avgSavingsEl.textContent = app.modules.utils.formatMoney(Math.round(avgSavings));
        if (popularBrandEl) popularBrandEl.textContent = popularBrand;
        if (plannedInspectionsEl) plannedInspectionsEl.textContent = plannedInspections;
        if (completedInspectionsEl) completedInspectionsEl.textContent = completedInspections;
    }

    function generateStatsPost() {
        const totalReports = app.state.reportsDatabase.length;
        const purchased = app.state.reportsDatabase.filter(r => r.decision === '✅ Куплен').length;
        const successRate = totalReports > 0 ? Math.round((purchased / totalReports) * 100) : 0;

        let totalSavings = 0;
        app.state.reportsDatabase.forEach(r => {
            const price = app.modules.utils.parseMoneyValue(r.price);
            const objectiveCost = app.modules.utils.parseMoneyValue(r.objective_cost);
            const sellerDiscount = app.modules.utils.parseMoneyValue(r.seller_discount);
            const investmentCost = app.modules.utils.parseMoneyValue(r.investment_cost);
            if (price && objectiveCost) {
                const s = (objectiveCost - (price - sellerDiscount)) - investmentCost;
                if (s > 0) totalSavings += s;
            }
        });

        const post = `
📊 СТАТИСТИКА МОТОПОДБОРА

За все время работы:

🏍️ Просмотрено мотоциклов: ${totalReports}
✅ Успешных сделок: ${purchased}
📈 Процент успеха: ${successRate}%
💵 Общая экономия клиентов: ${app.modules.utils.formatMoney(totalSavings)}
📅 Запланировано проверок: ${app.state.inspectionsDatabase.filter(i => i.status === 'planned').length}
✅ Выполнено проверок: ${app.state.inspectionsDatabase.filter(i => i.status === 'completed').length}

🔧 Профессиональная диагностика = уверенность в покупке!
📞 Звоните: 8 950 005-05-08
🌐 Сайт: motopodbor.ru
        `.trim();

        const statsOutput = document.getElementById('statsOutput');
        const copyStatsBtn = document.getElementById('copyStatsBtn');
        
        if (statsOutput) statsOutput.textContent = post;
        if (statsOutput) statsOutput.classList.remove('hidden');
        if (copyStatsBtn) copyStatsBtn.classList.remove('hidden');
        if (statsOutput) statsOutput.scrollIntoView({ behavior: 'smooth' });
    }

    function copyStatsToClipboard() {
        try {
            const text = document.getElementById('statsOutput')?.textContent || '';
            navigator.clipboard.writeText(text).then(() => {
                app.modules.notifications.showAlert('Статистика скопирована в буфер обмена!', 'success');
            }).catch(() => {
                const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
                document.execCommand('copy'); document.body.removeChild(ta);
                app.modules.notifications.showAlert('Статистика скопирована в буфер обмена!', 'success');
            });
        } catch (e) {
            console.error('Ошибка копирования статистики:', e);
        }
    }

    return {
        init,
        updateStatistics,
        generateStatsPost,
        copyStatsToClipboard
    };
})();

// Модуль отчетов
app.modules.report = (function() {
    function viewReport(reportId) {
        const report = app.state.reportsDatabase.find(r => r.id === reportId);
        if (!report) return;
        
        const modalVin = document.getElementById('modalVin');
        const modalLicensePlate = document.getElementById('modalLicensePlate');
        const modalBikeInfo = document.getElementById('modalBikeInfo');
        const modalOutput = document.getElementById('modalOutput');
        
        if (modalVin) modalVin.textContent = report.vin ? app.modules.utils.escapeHtml(report.vin) : 'Не указан';
        if (modalLicensePlate) modalLicensePlate.textContent = report.license_plate ? app.modules.utils.escapeHtml(report.license_plate) : 'Не указан';
        if (modalBikeInfo) modalBikeInfo.textContent = `${app.modules.utils.escapeHtml(report.brand)} ${app.modules.utils.escapeHtml(report.model)} (${app.modules.utils.escapeHtml(report.year)})`;
        if (modalOutput) modalOutput.textContent = report.generated_text || '';
        
        const reportModal = document.getElementById('reportModal');
        if (reportModal) reportModal.classList.remove('hidden');
    }

    function closeReportModal() { 
        const reportModal = document.getElementById('reportModal');
        if (reportModal) reportModal.classList.add('hidden'); 
    }

    function copyModalReport() {
        try {
            const text = document.getElementById('modalOutput')?.textContent || '';
            navigator.clipboard.writeText(text).then(() => {
                app.modules.notifications.showAlert('Отчет скопирован в буфер обмена!', 'success');
            }).catch(() => {
                const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
                document.execCommand('copy'); document.body.removeChild(ta);
                app.modules.notifications.showAlert('Отчет скопирован в буфер обмена!', 'success');
            });
        } catch (e) {
            console.error('Ошибка копирования:', e);
        }
    }

    function editReport(reportId) {
        const report = app.state.reportsDatabase.find(r => r.id === reportId);
        if (!report) return;

        Object.keys(report).forEach(key => {
            const el = document.getElementById(key);
            if (el && report[key] !== undefined && report[key] !== null) el.value = report[key];
        });
        
        const brandEl = document.getElementById('brand');
        if (brandEl && report.brand) {
            app.modules.form.updateModelOptions(report.brand, report.model || null);
        }

        const brandCustom = document.getElementById('brand_custom');
        const modelCustom = document.getElementById('model_custom');
        
        if (brandCustom) brandCustom.classList.toggle('hidden', report.brand !== 'Другая марка');
        if (modelCustom) modelCustom.classList.toggle('hidden', report.model !== 'Другая модель');

        app.modules.notifications.showAlert(
            `Редактирование отчета: ${report.brand} ${report.model}` +
            (report.vin ? ` | VIN: ${report.vin}` : '') +
            (report.license_plate ? ` | Номер: ${report.license_plate}` : ''),
            'info'
        );

        const reportTab = document.querySelector('.nav-tab[data-tab="report"]');
        if (reportTab) reportTab.click();
        
        const diagnosticForm = document.getElementById('diagnosticForm');
        if (diagnosticForm) diagnosticForm.scrollIntoView({ behavior: 'smooth' });
        
        app.modules.form.updateProgress();
    }

    function deleteReport(reportId) {
        if (!confirm('Вы уверены, что хотите удалить этот отчет?')) return;
        app.state.reportsDatabase = app.state.reportsDatabase.filter(r => r.id !== reportId);
        localStorage.setItem('motodiag_reports', JSON.stringify(app.state.reportsDatabase));
        if (app.modules.database) app.modules.database.loadReportsList();
        if (app.modules.statistics) app.modules.statistics.updateStatistics();
        app.modules.notifications.showAlert('Отчет успешно удален', 'success');
    }

    return {
        viewReport,
        closeReportModal,
        copyModalReport,
        editReport,
        deleteReport
    };
})();

// Модуль PWA
app.modules.pwa = (function() {
    function init() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            app.state.deferredPrompt = e;
            const installBtn = document.getElementById('installBtn');
            if (installBtn) installBtn.style.display = 'block';
        });
        
        const installBtn = document.getElementById('installBtn');
        if (installBtn) installBtn.addEventListener('click', installPWA);
    }

    function installPWA() {
        if (!app.state.deferredPrompt) return;
        app.state.deferredPrompt.prompt();
        app.state.deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                app.modules.notifications.showAlert('Приложение успешно установлено!', 'success');
                const installBtn = document.getElementById('installBtn');
                if (installBtn) installBtn.style.display = 'none';
            }
            app.state.deferredPrompt = null;
        });
    }

    return {
        init,
        installPWA
    };
})();

// Модуль настроек
app.modules.settings = (function() {
    function init() {
        const clearStorageBtn = document.getElementById('clearStorageBtn');
        const exportSettingsBtn = document.getElementById('exportSettingsBtn');
        const importSettingsBtn = document.getElementById('importSettingsBtn');
        
        if (clearStorageBtn) clearStorageBtn.addEventListener('click', clearAllData);
        if (exportSettingsBtn) exportSettingsBtn.addEventListener('click', exportSettings);
        if (importSettingsBtn) importSettingsBtn.addEventListener('click', importSettings);
        
        // Сохранение времени напоминания
        const reminderTimeEl = document.getElementById('reminderTime');
        if (reminderTimeEl) reminderTimeEl.addEventListener('change', function() {
            localStorage.setItem('motodiag_reminder_time', this.value);
            if (app.modules.inspections) app.modules.inspections.scheduleInspectionNotifications();
        });
    }

    function exportSettings() {
        try {
            const settings = {
                theme: localStorage.getItem('motodiag_theme'),
                formData: localStorage.getItem('motodiag_form_data'),
                autoSave: document.getElementById('autoSave')?.checked,
                soundNotifications: document.getElementById('soundNotifications')?.checked,
                vibration: document.getElementById('vibration')?.checked,
                inspectionNotifications: document.getElementById('inspectionNotifications')?.checked,
                reminderTime: document.getElementById('reminderTime')?.value
            };
            const dataStr = JSON.stringify(settings, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.href = url; link.download = `motodiag_settings_${new Date().toISOString().split('T')[0]}.json`;
            link.click(); setTimeout(() => URL.revokeObjectURL(url), 100);
            app.modules.notifications.showAlert('Настройки успешно экспортированы', 'success');
        } catch { 
            app.modules.notifications.showAlert('Ошибка при экспорте настроек', 'warning');
        }
    }

    function importSettings() {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json';
        input.onchange = e => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = evt => {
                try {
                    const s = JSON.parse(evt.target.result);
                    if (!confirm('Заменить текущие настройки импортированными?')) return;

                    if (s.theme) { 
                        document.body.setAttribute('data-theme', s.theme); 
                        const darkThemeEl = document.getElementById('darkTheme');
                        if (darkThemeEl) darkThemeEl.checked = s.theme === 'dark'; 
                        localStorage.setItem('motodiag_theme', s.theme); 
                    }
                    if (s.formData) { 
                        localStorage.setItem('motodiag_form_data', s.formData); 
                        if (app.modules.form) {
                            app.modules.form.loadFormData(); 
                            app.modules.form.updateProgress(); 
                        }
                    }
                    if (typeof s.autoSave === 'boolean') {
                        const autoSaveEl = document.getElementById('autoSave');
                        if (autoSaveEl) autoSaveEl.checked = s.autoSave;
                    }
                    if (typeof s.soundNotifications === 'boolean') {
                        const soundEl = document.getElementById('soundNotifications');
                        if (soundEl) soundEl.checked = s.soundNotifications;
                    }
                    if (typeof s.vibration === 'boolean') {
                        const vibrationEl = document.getElementById('vibration');
                        if (vibrationEl) vibrationEl.checked = s.vibration;
                    }
                    if (typeof s.inspectionNotifications === 'boolean') {
                        const inspectionNotificationsEl = document.getElementById('inspectionNotifications');
                        if (inspectionNotificationsEl) inspectionNotificationsEl.checked = s.inspectionNotifications;
                    }
                    if (s.reminderTime !== undefined) { 
                        const reminderTimeEl = document.getElementById('reminderTime');
                        if (reminderTimeEl) reminderTimeEl.value = s.reminderTime; 
                        localStorage.setItem('motodiag_reminder_time', s.reminderTime); 
                    }

                    app.modules.notifications.showAlert('Настройки успешно импортированы', 'success');
                } catch { 
                    app.modules.notifications.showAlert('Ошибка при чтении файла настроек', 'warning'); 
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    function clearAllData() {
        if (!confirm('ВНИМАНИЕ! Это действие удалит все отчеты, проверки и настройки. Продолжить?')) return;
        
        const keysToRemove = Object.keys(localStorage).filter(key => key.startsWith('motodiag_'));
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        app.state.reportsDatabase = [];
        app.state.inspectionsDatabase = [];
        if (app.modules.database) app.modules.database.loadReportsList();
        if (app.modules.inspections) app.modules.inspections.loadInspectionsList();
        if (app.modules.form) app.modules.form.clearForm();
        if (app.modules.statistics) app.modules.statistics.updateStatistics();
        app.modules.notifications.showAlert('Все данные успешно очищены', 'success');
    }

    return {
        init,
        exportSettings,
        importSettings,
        clearAllData
    };
})();

// Модуль скролла
app.modules.scroll = (function() {
    function init() {
        const btn = document.getElementById('scrollToTopBtn');
        if (!btn) return;
        
        window.addEventListener('scroll', () => {
            btn.classList.toggle('visible', window.pageYOffset > 300);
        });
        btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    return {
        init
    };
})();

// Инициализация приложения после загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    try {
        app.init();
    } catch (e) {
        console.error('Критическая ошибка инициализации:', e);
        alert('Ошибка загрузки приложения. Попробуйте обновить страницу.');
    }
});

// Закрытие модалки по клику вне
const reportModal = document.getElementById('reportModal');
if (reportModal) {
    reportModal.addEventListener('click', function(e) {
        if (e.target === this) app.modules.report.closeReportModal();
    });
}