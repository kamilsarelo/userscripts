// ==UserScript==
// @name         Option Omega Light Theme
// @description  Convert Option Omega's default dark theme to light mode for better readability
// @namespace    https://github.com/kamilsarelo
// @version      6
// @author       kamilsarelo
// @icon         https://optionomega.com/favicon.png
// @match        *://optionomega.com/*
// @match        *://*.optionomega.com/*
// @exclude      https://docs.optionomega.com/*
// @exclude      http://docs.optionomega.com/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // Configuration object for better maintainability
    const CONFIG = {
        // Color mappings for conversion
        colorMaps: {
            text: {
                'rgb(255, 255, 255)': '#000000',
                '#ffffff': '#000000',
                '#fff': '#000000',
                'rgb(229, 231, 235)': '#4b5563'
            },
            background: {
                'rgb(0, 0, 0)': '#ffffff',
                '#000000': '#ffffff',
                '#000': '#ffffff',
                'rgb(40, 40, 39)': '#eee'
            },
            border: {
                'rgb(229, 231, 235)': '#4b5563'
            }
        },

        // Selectors for elements to process
        selectors: {
            all: '*',
            form: 'input:not([disabled]), select:not([disabled]):not(.selectInput--nested), textarea:not([disabled]), button.selectInput:not([disabled]):not(.selectInput--nested)',
            exclude: '.vc-popover-content-wrapper'
        },

        // Performance settings
        debounceDelay: 100,
        processInterval: 2000,

        // Form element styling
        // formBackgroundColor: '#fefce8' // Very light blue
        formBackgroundColor: '#e0f2fe' // Very light yellow
    };

    // Unified color conversion function
    function convertColor(color, type) {
        if (!color || color === 'rgba(0, 0, 0, 0)' || color === 'transparent') {
            return color;
        }

        const colorMap = CONFIG.colorMaps[type];
        return colorMap[color] || color;
    }

    // Process a single element for color conversion
    function processElement(element) {
        // Skip excluded elements
        if (element.closest(CONFIG.selectors.exclude)) {
            return;
        }

        try {
            const styles = window.getComputedStyle(element);

            // Process background color with special handling for toggle buttons
            const bgColor = styles.backgroundColor;
            if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                if (element.classList.contains('toggle')) {
                    const isToggleOff = element.classList.contains('bg-ooGray');
                    if (isToggleOff) {
                        const newBgColor = convertColor(bgColor, 'background');
                        if (newBgColor !== bgColor) {
                            element.style.backgroundColor = newBgColor;
                        }
                    } else {
                        element.style.backgroundColor = '';
                    }
                } else {
                    const newBgColor = convertColor(bgColor, 'background');
                    if (newBgColor !== bgColor) {
                        element.style.backgroundColor = newBgColor;
                    }
                }
            }

            // Process text color
            const textColor = styles.color;
            if (textColor && textColor !== 'rgba(0, 0, 0, 0)' && textColor !== 'transparent') {
                const newTextColor = convertColor(textColor, 'text');
                if (newTextColor !== textColor) {
                    element.style.color = newTextColor;
                }
            }

            // Process border color
            const borderColor = styles.borderColor;
            if (borderColor && borderColor !== 'rgba(0, 0, 0, 0)' && borderColor !== 'transparent') {
                const newBorderColor = convertColor(borderColor, 'border');
                if (newBorderColor !== borderColor) {
                    element.style.borderColor = newBorderColor;
                }
            }
        } catch (e) {
            console.debug('Error processing element:', e);
        }
    }

    // Process all elements with performance optimization
    function processElements() {
        // Process all elements
        document.querySelectorAll(CONFIG.selectors.all).forEach(processElement);

        // Apply special styling to form elements
        document.querySelectorAll(CONFIG.selectors.form).forEach(element => {
            element.style.backgroundColor = CONFIG.formBackgroundColor;
        });
    }

    // Debounced function to handle rapid DOM changes
    const debouncedProcess = (function () {
        let timeoutId;
        return function () {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(processElements, CONFIG.debounceDelay);
        };
    })();

    // Set up mutation observer for dynamic content
    function setupMutationObserver() {
        const observer = new MutationObserver(function (mutations) {
            let shouldProcess = false;

            mutations.forEach(function (mutation) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    shouldProcess = true;
                }
            });

            if (shouldProcess) {
                debouncedProcess();
            }
        });

        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        return observer;
    }

    // Inject light theme CSS styles
    function injectLightThemeStyles() {
        const lightThemeCSS = `
            /* Convert Option Omega logo to black */
            img[src="/assets/icon_for_dark_background-DTj9qRve.png"] {
                filter: brightness(0) grayscale(1) !important;
            }
            
            /* Override dark hover state in "Test List" and "Test Trade Log" with light equivalent */
            .hover\\:bg-gray-800:hover { background-color: #e5e7eb !important; }

            /*
             * Tailwind dark-theme utility classes → light equivalents
             *
             * The site styles most text with Tailwind opacity variants such as
             * text-white/45, /50, /55, /60, /70, /85 which getComputedStyle
             * resolves to rgba(255, 255, 255, 0.x) - colors the JS color map
             * never matches. Attribute substring selectors [class*="..."]
             * cover every opacity variant (and unknown future ones) without
             * escaping the "/" in class names.
             */

            /* Text: white and all white opacity variants → near-black */
            .text-white { color: #111827 !important; }
            [class*="text-white/"]:not([class*="hover:text-white"]) { color: #111827 !important; }

            /* Text: light grays → darker grays readable on white */
            .text-gray-100, .text-gray-200 { color: #1f2937 !important; }
            .text-gray-300, .text-gray-400 { color: #4b5563 !important; }

            /* Exception: decorative stroke icons (stepper chevrons) keep native
               gray-300 so they stay as subtle as the border-gray-300 borders */
            svg.text-gray-300, svg.text-gray-400 { color: #d1d5db !important; }

            /* Backgrounds: black and gray surfaces → white/light gray */
            .bg-black { background-color: #ffffff !important; }
            [class*="bg-black/"] { background-color: #f3f4f6 !important; }
            .bg-gray-900, .bg-gray-800, .bg-gray-700 { background-color: #e5e7eb !important; }

            /* Borders: white and dark-gray borders → light gray */
            [class*="border-white/"] { border-color: #d1d5db !important; }
            [class*="border-gray-7"], [class*="border-gray-8"] { border-color: #d1d5db !important; }

            /* Dividers: divide-* utilities place the border on children */
            [class*="divide-white/"] > *, [class*="divide-gray-7"] > * { border-color: #e5e7eb !important; }

            /* Focus rings: white rings/offsets → visible on white background */
            .ring-white, [class*="ring-white/"] { --tw-ring-color: #9ca3af !important; }
            .ring-offset-gray-800 { --tw-ring-offset-color: #ffffff !important; }

            
            /*
             * Canvas Chart Enhancement for Light Theme
             *
             * Rationale for CSS filter approach:
             * 1. Canvas renders as pixels - inaccessible to DOM manipulation
             * 2. Filters provide optimal performance with no redraw overhead
             * 3. Maintains full chart interactivity and functionality
             * 4. Universal application to all canvas elements
             *
             * Rejected alternatives:
             * - Canvas wrapper: Disrupts layout and positioning
             * - Pixel manipulation: Computationally expensive and breaks interactions
             * - Chart redraw: Requires complex reverse-engineering of chart libraries
             *
             * Filter configuration:
             * - contrast(1.2): Enhances readability of light elements
             * - brightness(0.8): Optimizes canvas visibility in light theme
             * - Combined effect: Improves text contrast while preserving data visualization
             */
            canvas {
                filter: contrast(1.2) brightness(0.8) !important;
            }

            /* VCalendar light theme - replace vc-dark with vc-light */
            /* see: https://github.com/nathanreyes/v-calendar/blob/v3/src/styles/theme.css */
            .vc-popover-content-wrapper * {
                --vc-color: var(--vc-gray-900);
                --vc-bg: var(--vc-white);
                --vc-border: var(--vc-gray-300);
                --vc-hover-bg: hsla(211, 25%, 84%, 0.3);
                --vc-focus-ring: 0 0 0 2px rgb(59, 131, 246, 0.4);
                --vc-header-arrow-color: var(--vc-gray-500);
                --vc-header-arrow-hover-bg: var(--vc-gray-200);
                --vc-header-title-color: var(--vc-gray-900);
                --vc-weekday-color: var(--vc-gray-500);
                --vc-weeknumber-color: var(--vc-gray-400);
                --vc-nav-hover-bg: var(--vc-gray-200);
                --vc-nav-title-color: var(--vc-gray-900);
                --vc-nav-item-hover-box-shadow: none;
                --vc-nav-item-active-color: var(--vc-white);
                --vc-nav-item-active-bg: var(--vc-accent-500);
                --vc-nav-item-active-box-shadow: var(--vc-shadow);
                --vc-nav-item-current-color: var(--vc-accent-600);
                --vc-day-popover-container-color: var(--vc-white);
                --vc-day-popover-container-bg: var(--vc-gray-800);
                --vc-day-popover-container-border: var(--vc-gray-700);
                --vc-day-popover-header-color: var(--vc-gray-700);
                --vc-popover-content-color: var(--vc-gray-900);
                --vc-popover-content-bg: var(--vc-gray-50);
                --vc-popover-content-border: var(--vc-gray-300);
                --vc-time-picker-border: var(--vc-gray-300);
                --vc-time-weekday-color: var(--vc-gray-700);
                --vc-time-month-color: var(--vc-accent-600);
                --vc-time-day-color: var(--vc-accent-600);
                --vc-time-year-color: var(--vc-gray-500);
                --vc-time-select-group-bg: var(--vc-gray-50);
                --vc-time-select-group-border: var(--vc-gray-300);
                --vc-time-select-group-icon-color: var(--vc-accent-500);
                --vc-select-color: var(--vc-gray-900);
                --vc-select-bg: var(--vc-gray-100);
                --vc-select-hover-bg: var(--vc-gray-200);
                --vc-day-content-hover-bg: var(--vc-hover-bg);
                --vc-day-content-disabled-color: var(--vc-gray-400);
            }
            .vc-popover-content-wrapper.vc-attr *,
            .vc-popover-content-wrapper .vc-attr * {
                --vc-content-color: var(--vc-accent-600);
                --vc-highlight-outline-bg: var(--vc-white);
                --vc-highlight-outline-border: var(--vc-accent-600);
                --vc-highlight-outline-content-color: var(--vc-accent-700);
                --vc-highlight-light-bg: var(--vc-accent-200);
                --vc-highlight-light-content-color: var(--vc-accent-900);
                --vc-highlight-solid-bg: var(--vc-accent-600);
                --vc-highlight-solid-content-color: var(--vc-white);
                --vc-dot-bg: var(--vc-accent-600);
                --vc-bar-bg: var(--vc-accent-600);
            }
        `;

        const style = document.createElement('style');
        style.textContent = lightThemeCSS;
        style.id = 'light-theme-styles';

        const targetElement = document.head || document.documentElement;
        targetElement.appendChild(style);
    }

    // Initialize userscript (single entry point)
    function init() {
        injectLightThemeStyles();
        processElements();

        const observer = setupMutationObserver();

        // Clean up observer when page unloads
        window.addEventListener('beforeunload', function () {
            if (observer) {
                observer.disconnect();
            }
        });

        // Process elements periodically for edge cases
        setInterval(processElements, CONFIG.processInterval);

        // Process when window gains focus
        window.addEventListener('focus', processElements);
    }

    // Initialize when DOM is ready or immediately if already loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
