/**
 * 工具函数库
 * 包含 LocalStorage 操作、数据验证、通用辅助函数
 */

const StorageKeys = {
    QUIZ_DATA: 'quiz_data',
    USER_ANSWERS: 'user_answers',
    CURRENT_QUESTION: 'current_question',
    QUIZ_CONFIG: 'quiz_config',
    UI_CONFIG: 'ui_config',
    PAYMENT_ORDER_NUMBER: 'payment_order_number',
    PAYMENT_TIME: 'payment_time',
    USED_ORDER_NUMBERS: 'used_order_numbers'
};

/** 与 default-quiz.json 一致；用于与其它测试共用 localStorage 时避免串题 */
const STRESS_CREATURE_QUIZ_ID = 'stress-creature';
const STRESS_CREATURE_QUIZ_NAME = '你的压力是哪种神秘生物';
const STORAGE_NAMESPACE = 'stress_creature_test';
const LEGACY_STORAGE_KEYS = new Set([
    StorageKeys.QUIZ_DATA,
    StorageKeys.USER_ANSWERS,
    StorageKeys.CURRENT_QUESTION,
    StorageKeys.QUIZ_CONFIG,
    StorageKeys.UI_CONFIG,
    StorageKeys.PAYMENT_ORDER_NUMBER,
    StorageKeys.PAYMENT_TIME,
    StorageKeys.USED_ORDER_NUMBERS,
    'question_option_order'
]);

function isStressCreatureQuizData(quizData) {
    if (!quizData || !quizData.scale_questions || !quizData.choice_questions) return false;
    if (quizData.quiz_id === STRESS_CREATURE_QUIZ_ID) return true;
    if (!quizData.quiz_id && quizData.quiz_name === STRESS_CREATURE_QUIZ_NAME) return true;
    return false;
}

function pruneUserAnswersForQuiz(answers, quizData) {
    if (!answers || typeof answers !== 'object' || !quizData) return {};
    const ids = new Set([
        ...(quizData.scale_questions || []).map(q => q.question_id),
        ...(quizData.choice_questions || []).map(q => q.question_id)
    ]);
    const pruned = {};
    Object.keys(answers).forEach((k) => {
        if (ids.has(k)) pruned[k] = answers[k];
    });
    return pruned;
}

class StorageUtil {
    static getScopedKey(key) {
        return `${STORAGE_NAMESPACE}:${String(key)}`;
    }

    static parseStoredValue(raw) {
        if (raw === null || raw === undefined) return null;
        if (raw === '') return '';
        try {
            return JSON.parse(raw);
        } catch (e) {
            return raw;
        }
    }

    static set(key, value) {
        try {
            localStorage.setItem(this.getScopedKey(key), JSON.stringify(value));
            return true;
        } catch (e) {
            console.error('Storage set error:', e);
            return false;
        }
    }

    static get(key, defaultValue = null) {
        try {
            const scopedKey = this.getScopedKey(key);
            const scopedItem = localStorage.getItem(scopedKey);
            if (scopedItem !== null) {
                return this.parseStoredValue(scopedItem);
            }

            const legacyItem = localStorage.getItem(key);
            if (legacyItem !== null) {
                const parsed = this.parseStoredValue(legacyItem);
                try {
                    localStorage.setItem(scopedKey, JSON.stringify(parsed));
                } catch (e) {
                    /* no-op */
                }
                localStorage.removeItem(key);
                return parsed;
            }

            return defaultValue;
        } catch (e) {
            console.error('Storage get error:', e);
            return defaultValue;
        }
    }

    static remove(key) {
        localStorage.removeItem(this.getScopedKey(key));
        localStorage.removeItem(key);
    }

    static clear() {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (!key) continue;
            if (key.startsWith(`${STORAGE_NAMESPACE}:`) || LEGACY_STORAGE_KEYS.has(key)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
    }

    static clearQuizProgress() {
        this.remove(StorageKeys.USER_ANSWERS);
        this.remove(StorageKeys.CURRENT_QUESTION);
        this.remove('question_option_order');
    }
}

class QuizValidator {
    static validate(quizData) {
        const errors = [];

        if (!quizData.quiz_name) {
            errors.push('缺少测试名称 (quiz_name)');
        }
        if (!quizData.nbr_question) {
            errors.push('缺少题目数量 (nbr_question)');
        }

        if (!quizData.dimensions || !Array.isArray(quizData.dimensions) || quizData.dimensions.length === 0) {
            errors.push('缺少维度定义表 (dimensions)');
        } else {
            quizData.dimensions.forEach((dim, index) => {
                if (!dim.dimension_id) {
                    errors.push(`维度表第 ${index + 1} 行缺少 dimension_id`);
                }
                if (!dim.dimension_name) {
                    errors.push(`维度表第 ${index + 1} 行缺少 dimension_name`);
                }
            });
        }

        if (!quizData.scale_questions || !Array.isArray(quizData.scale_questions)) {
            errors.push('缺少量表题数据表 (scale_questions)');
        } else {
            quizData.scale_questions.forEach((q, index) => {
                if (!q.question_id) {
                    errors.push(`量表题第 ${index + 1} 行缺少 question_id`);
                }
                if (!q.dimension_id) {
                    errors.push(`量表题第 ${index + 1} 行 (${q.question_id || '未知'}) 缺少 dimension_id`);
                }
                if (!q.question_text) {
                    errors.push(`量表题第 ${index + 1} 行 (${q.question_id || '未知'}) 缺少 question_text`);
                }
            });
        }

        if (quizData.choice_questions && Array.isArray(quizData.choice_questions)) {
            quizData.choice_questions.forEach((q, index) => {
                if (!q.question_id) {
                    errors.push(`选择题第 ${index + 1} 行缺少 question_id`);
                }
                if (!q.question_text) {
                    errors.push(`选择题第 ${index + 1} 行 (${q.question_id || '未知'}) 缺少 question_text`);
                }
                const options = ['a', 'b', 'c', 'd', 'e'];
                let hasValidOption = false;
                options.forEach(opt => {
                    if (q[`option_${opt}_text`] && q[`option_${opt}_dim`]) {
                        hasValidOption = true;
                    }
                });
                if (!hasValidOption) {
                    errors.push(`选择题 ${q.question_id || `第 ${index + 1} 行`} 没有有效的选项`);
                }
            });
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }
}

const Utils = {
    lazyLoadImages: {
        observer: null,
        imagesToLoad: [],

        init() {
            if ('IntersectionObserver' in window) {
                this.observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            this.loadImage(entry.target);
                            this.observer.unobserve(entry.target);
                        }
                    });
                }, {
                    rootMargin: '50px 0px',
                    threshold: 0.01
                });

                document.addEventListener('DOMContentLoaded', () => {
                    this.observeAll();
                });
            } else {
                this.loadAll();
            }
        },

        observeAll() {
            const lazyImages = document.querySelectorAll('img[loading="lazy"]');
            lazyImages.forEach(img => this.observer.observe(img));
        },

        loadImage(img) {
            if (!img.dataset.src) return;

            img.src = img.dataset.src;
            img.onload = () => {
                img.classList.add('loaded');
            };
            img.onerror = () => {
                console.warn('图片加载失败:', img.src);
            };
        },

        loadAll() {
            const lazyImages = document.querySelectorAll('img[loading="lazy"]');
            lazyImages.forEach(img => this.loadImage(img));
        }
    },

    preloadImages(urls) {
        urls.forEach(url => {
            const img = new Image();
            img.src = url;
        });
    },

    getResponsiveImageSrc(basePath, formats = ['webp', 'png', 'jpg']) {
        const dpr = window.devicePixelRatio || 1;
        const scale = dpr >= 2 ? '@2x' : '';
        const supportsWebP = this.checkWebPSupport();

        if (supportsWebP && formats.includes('webp')) {
            return `${basePath}${scale}.webp`;
        } else if (formats.includes('png')) {
            return `${basePath}${scale}.png`;
        } else if (formats.includes('jpg')) {
            return `${basePath}${scale}.jpg`;
        }

        return `${basePath}${scale}.${formats[0]}`;
    },

    checkWebPSupport() {
        const canvas = document.createElement('canvas');
        return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    readJSONFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    resolve(data);
                } catch (err) {
                    reject(new Error('文件格式错误，请上传有效的 JSON 文件'));
                }
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsText(file);
        });
    },

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    formatPercent(value, decimals = 1) {
        return (value * 100).toFixed(decimals) + '%';
    },

    scrollToElement(element, offset = 0) {
        const top = element.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top, behavior: 'smooth' });
    }
};

const DefaultUIConfig = {
    theme: 'default',
    primaryColor: '#C4956A',
    secondaryColor: '#F0E4D0',
    backgroundColor: '#fdf8ef',
    fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: {
        title: '2rem',
        subtitle: '1.25rem',
        body: '1rem',
        small: '0.875rem'
    },
    borderRadius: '12px',
    maxWidth: '800px'
};

function getUIConfig() {
    const customConfig = StorageUtil.get(StorageKeys.UI_CONFIG, {});
    return { ...DefaultUIConfig, ...customConfig };
}

function applyUIConfig(config = null) {
    const uiConfig = config || getUIConfig();
    const root = document.documentElement;

    root.style.setProperty('--primary-color', uiConfig.primaryColor);
    root.style.setProperty('--primary-dark', '#A67B4A');
    root.style.setProperty('--primary-mid', '#D4B896');
    root.style.setProperty('--secondary-color', uiConfig.secondaryColor);
    root.style.setProperty('--background-color', uiConfig.backgroundColor);
    root.style.setProperty('--font-family', uiConfig.fontFamily);
    root.style.setProperty('--border-radius', uiConfig.borderRadius);
    root.style.setProperty('--max-width', uiConfig.maxWidth);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        StorageKeys,
        StorageUtil,
        QuizValidator,
        Utils,
        DefaultUIConfig,
        getUIConfig,
        applyUIConfig,
        STRESS_CREATURE_QUIZ_ID,
        STRESS_CREATURE_QUIZ_NAME,
        isStressCreatureQuizData,
        pruneUserAnswersForQuiz
    };
}
