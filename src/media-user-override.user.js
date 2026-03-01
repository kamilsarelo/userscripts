// ==UserScript==
// @name         Media User Override
// @description  Adds media controls (play/pause, speed, progress) below audio/video elements with persistence, responsive overflow, and hide functionality
// @namespace    https://github.com/kamilsarelo
// @version      1
// @author       kamilsarelo
// @match        *://*/*
// @exclude       *://console.cloud.google.com/*
// @exclude       *://admin.google.com/*
// @exclude       *://meet.google.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @noframes     false
// ==/UserScript==

/**
 * MEDIA USER OVERRIDE - Userscript Documentation
 * ==============================================
 * 
 * OVERVIEW
 * --------
 * A userscript that adds a universal media control bar to any webpage with video or audio elements.
 * Provides play/pause, speed control, progress tracking, and hide functionality with a clean,
 * isolated UI that doesn't interfere with page styles.
 * 
 * FEATURES
 * --------
 * - Works with both <video> and <audio> elements
 * - Controls media in same-origin iframes from top-level document
 * - No keyboard hotkeys (avoids conflicts with browser/site shortcuts)
 * - Play/Pause toggle button with dynamic icon
 * - Speed control combo: [Slower ◀◀] [Speed Text] [Faster ▶▶]
 *   - Speed text opens dropdown menu with all speed presets
 *   - Speed presets from 0.1x to 64x
 *   - Speed persists globally across all pages
 * - High-contrast progress bar
 *   - Solid red fill for maximum visibility
 *   - Expands from 4px to 14px on hover/touch for easier interaction
 *   - Fixed-position hit area (14px transparent zone) prevents flickering
 *   - Backdrop blur (10px) for frosted glass effect
 *   - Desktop: hover to expand, click to seek
 *   - Mobile: touch and drag to seek, release to confirm
 *   - Timestamp tooltip follows touch/drag position
 *   - Buffered indicator shows loading progress
 *   - Live stream support (shows "LIVE" badge)
 *   - Shadow transitions with control bar visibility
 * - Hide controls with duration options: 5s, 15s, 30s, 1min, until media ends
 * - Responsive overflow: Hide button moves to kebab menu (⋮) when space is limited
 * - Shadow DOM isolation: No CSS conflicts with page styles
 * 
 * CONTROL BAR LAYOUT
 * ------------------
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │  ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │ Progress
 * ├──────────────────────────────────────────────────────────────────────────────┤
 * │  [▶️]  0:00 / 5:30  [◀◀] [1.5x] [▶▶]  [🙈] [🔼]  [⋮] (if overflow)           │
 * └──────────────────────────────────────────────────────────────────────────────┘
 * 
 * HIDE BUTTON (Split Button Design)
 * ---------------------------------
 * [🙈] - Main button: Hide controls for default duration (5s)
 * [🔼] - Dropdown button: Opens menu with all duration options:
 *        • 5s, 15s, 30s, 1min, Until end
 * 
 * BUTTON PRIORITY (for responsive overflow)
 * -----------------------------------------
 * 1. Play/Pause     - Always visible (never overflows)
 * 2. Speed Combo    - Always visible (never overflows)
 * 3. Time Display   - Hides first when space is limited (lower priority than speed)
 * 4. Hide Combo     - Hides after time display
 * 5. Kebab Menu (⋮) - Only visible when overflow exists
 * 
 * OVERFLOW BEHAVIOR
 * -----------------
 * When space is limited, elements hide in this order:
 * 1. Time display hides first
 * 2. Hide combo overflows to kebab menu
 * When hide combo overflows to kebab menu, ALL duration options are shown:
 * [⋮] → [🙈 5s] [🙈 15s] [🙈 30s] [🙈 1min] [🙈 Until end]
 * 
 * EDGE CASES HANDLED
 * ------------------
 * - Iframe support: Control bar in top-level only, detects media in same-origin iframes
 * - Cross-origin iframes: Gracefully skipped (cannot access content)
 * - Nested iframes: Recursively detected and controlled
 * - Show on play only: Bar hidden until media starts playing
 * - Multiple media: Most recent playing media becomes active
 * - Short media: Ignores media < 5 seconds (notification sounds, etc.)
 * - Live streams: Shows "LIVE" badge instead of progress bar
 * - Media removal: Automatically unregisters and cleans up
 * - Speed persistence: Uses GM_setValue with localStorage fallback
 * 
 * TECHNICAL DECISIONS
 * -------------------
 * - Styling: Vanilla CSS with Shadow DOM (no Tailwind/Shadcn/dependencies)
 *   - Zero external requests, instant load
 *   - Perfect style isolation
 *   - No build process required
 * - Architecture: Single-file userscript with modular functions
 * - Storage: GM_setValue primary, localStorage fallback
 * 
 * PROGRESS BAR IMPLEMENTATION
 * ---------------------------
 * - High-contrast red fill for visibility against dark backgrounds
 * - Fixed-position hit area (position: fixed) prevents layout shifts during expansion
 * - CSS transitions for smooth height/opacity changes (0.15s ease)
 * - Desktop detection: @media (hover: hover) and (pointer: fine)
 * - Mobile touch handling:
 *   - touchstart: expand progress bar, show tooltip immediately
 *   - touchmove: update tooltip position during drag
 *   - touchend: seek to position, collapse after 300ms delay
 *   - contextmenu prevented to avoid long-press menu
 * - Backdrop blur (10px) for frosted glass effect on control bar
 * - Box-shadow transitions with visibility state (no shadow when hidden)
 * - Touch optimizations:
 *   - -webkit-tap-highlight-color: transparent (removes blue tap highlight)
 *   - touch-action: none (prevents browser gesture interference)
 * 
 * HIDE DURATION OPTIONS
 * ---------------------
 * - 5 seconds (default)
 * - 15 seconds
 * - 30 seconds
 * - 1 minute
 * - Until media ends
 * 
 * COMPATIBILITY
 * -------------
 * - Works on all websites (*://*\/*)
 * - Requires Violentmonkey, Tampermonkey, Greasemonkey, or similar
 * - Modern browsers with Shadow DOM support
 * - Trusted Types compatible: Uses DOM methods instead of innerHTML
 *   (required for sites like YouTube that enforce CSP Trusted Types)
 */

(function () {
    'use strict';

    // Skip control bar creation if in iframe - only top-level document gets the bar
    const isTopLevel = window.self === window.top;
    
    if (!isTopLevel) {
        console.log('[Media User Override] Running in iframe mode - no control bar');
        // Don't return - we still need to set up communication with parent
    }

    // Constants
    const STORAGE_KEY = 'media_user_override_speed';
    // Filter speeds to only those supported by the browser (Chrome/Edge limit playbackRate to ~16x, Firefox allows 32x+)
    const SPEEDS = (() => {
        const m = document.createElement('video');
        const all = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 4, 8, 16, 32, 64, 128];
        const supported = all.filter(s => { try { m.playbackRate = s; return true; } catch { return false; }});
        m.remove();
        return supported;
    })();
    const HIDE_DURATIONS = [
        { value: 5, label: '5 s' },
        { value: 15, label: '15 s' },
        { value: 30, label: '30 s' },
        { value: 60, label: '1 min' },
        { value: -1, label: 'Until video end' }
    ];
    const MIN_DURATION = 5; // Minimum media duration in seconds to show controls
    const BUTTON_PRIORITY = {
        playPause: 1,
        speedCombo: 2,
        timeDisplay: 3, // Lower priority than speed - hides first when space is limited
        hide: 4,
        kebab: 999 // Always last
    };

    // State
    let controlBar = null;
    let shadowRoot = null;
    let activeMedia = null;
    let allMedia = new Set();
    let mediaToIframe = new WeakMap(); // media -> iframe (null = top-level)
    let hideTimeout = null;
    let currentSpeed = 1;
    let overflowItems = [];
    let isDragging = false; // Track if user is dragging to seek

    // DOM Elements
    let playPauseBtn = null;
    let slowerBtn = null;
    let speedText = null;
    let speedSelect = null;
    let fasterBtn = null;
    let hideBtn = null;
    let hideSelect = null;
    let kebabBtn = null;
    let kebabMenu = null;
    let progressBar = null;
    let progressFill = null;
    let progressBuffered = null;
    let progressTooltip = null;
    let timeDisplay = null;

    // ==================== Storage ====================

    function saveSpeed(speed) {
        currentSpeed = speed;
        try {
            GM_setValue(STORAGE_KEY, speed.toString());
        } catch (e) {
            try {
                localStorage.setItem(STORAGE_KEY, speed.toString());
            } catch (fallbackError) {
                console.warn('[Media User Override] Failed to save speed:', fallbackError);
            }
        }
    }

    function getSavedSpeed() {
        try {
            const saved = GM_getValue(STORAGE_KEY);
            if (saved !== undefined && saved !== null) {
                return parseFloat(saved);
            }
        } catch (e) {}
        try {
            const local = localStorage.getItem(STORAGE_KEY);
            if (local) return parseFloat(local);
        } catch (e) {}
        return 1.0;
    }

    // ==================== Styles ====================

    const STYLES = `
        :host {
            all: initial;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        @keyframes blur-shift {
            0% {
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
backdrop-filter: blur(20px);
-webkit-backdrop-filter: blur(20px);
                background: rgba(0, 0, 0, 0.8);
            }
            50% {
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                background: rgba(0, 0, 0, 0.65);
backdrop-filter: blur(10px);
-webkit-backdrop-filter: blur(10px);
background: rgba(0, 0, 0, 0.75);
            }
            100% {
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
backdrop-filter: blur(20px);
-webkit-backdrop-filter: blur(20px);
                background: rgba(0, 0, 0, 0.8);
            }
        }
        
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        .control-bar {
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            z-index: 2147483647;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            color: white;
            font-size: 14px;
            transform: translateY(100%);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
            user-select: none;
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0), 0 -2px 8px rgba(0, 0, 0, 0);
        }
        
        .control-bar.visible {
            transform: translateY(0);
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5), 0 -2px 8px rgba(0, 0, 0, 0.3);
            animation: blur-shift 8s infinite ease-in-out;
        }
        
        .progress-hit-area {
            position: fixed;
            bottom: 54px; /* controls-wrapper height (~44px) + progress zone (14px) - controls-wrapper padding */
            left: 0;
            width: 100%;
            height: 14px;
            cursor: pointer;
            z-index: 10;
            -webkit-tap-highlight-color: transparent;
            touch-action: none;
        }
        
        .progress-container {
            height: 4px;
            width: 100%;
            cursor: pointer;
            position: relative;
            transition: height 0.15s ease;
        }
        
        .progress-container.expanded {
            height: 14px;
        }
        
        .progress-buffered {
            position: absolute;
            top: 0;
            left: 0;
            width: 0;
            height: 4px;
            background: rgba(255, 255, 255, 0.3);
            pointer-events: none;
            transition: height 0.15s ease;
        }
        
        .progress-container.expanded .progress-buffered {
            height: 14px;
        }
        
        .progress-fill {
            position: absolute;
            top: 0;
            left: 0;
            height: 4px;
            background: #ff002d;
            transition: height 0.15s ease, width 0.1s linear;
        }
        
        .progress-container.expanded .progress-fill {
            height: 14px;
        }
        
        .progress-tooltip {
            position: absolute;
            bottom: 100%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s;
            margin-bottom: 4px;
        }
        
        .progress-container.expanded .progress-tooltip {
            opacity: 1;
        }
        
        .controls-wrapper {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 10px 15px;
        }
        
        .btn {
            padding: 8px 12px;
            border: 1px solid rgba(255, 255, 255, 0.3);
border: 1px solid rgba(255, 255, 255, 0.2);
border: none;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.1);
            color: white;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s ease;
            white-space: nowrap;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
            user-select: none;
        }
        
        .btn:hover {
            background: rgba(255, 255, 255, 0.2);
background: rgba(0, 0, 0, 0.25);
background: rgba(255, 255, 255, 0.25);
/*
            border-color: rgba(255, 255, 255, 0.5);
*/
        }
        
        .btn:active {
            transform: scale(0.95);
        }
        
        .btn-icon {
            min-width: 40px;
max-width: 40px;
            width: 40px;
            height: 40px;
            padding: 0;
            border-radius: 50%;
            background: rgba(0, 0, 0, 0.8);
background: rgba(255, 255, 255, 0.15);
            display: flex;
            align-items: center;
            justify-content: center;
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
            user-select: none;
        }
        
        .btn-icon svg {
            width: 20px;
            height: 20px;
        }
        
        .slower svg,
        .faster svg,
        .hide-btn svg {
            width: 24px;
            height: 24px;
        }
        
        .speed-combo {
            display: flex;
            align-items: center;
            gap: 2px;
        }
        
        .speed-btn {
            padding: 8px 10px;
            min-width: 36px;
        }
        
        .speed-text {
            padding: 8px 12px;
            min-width: 60px;
            text-align: center;
            font-weight: 600;
            background: rgba(0, 123, 255, 0.3);
            border-color: rgba(0, 123, 255, 0.5);
        }
        
        .speed-text-container {
            position: relative;
        }
        
        .speed-text:hover {
            background: rgba(0, 123, 255, 0.5);
        }
        
        /* Shared dropdown styles */
        .dropdown {
            position: absolute;
            bottom: 100%;
            background: rgba(0, 0, 0, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 6px;
            padding: 4px;
            margin-bottom: 4px;
            display: none;
        }
        
        .dropdown.visible {
            display: block;
        }
        
        .dropdown-option {
            padding: 8px 12px;
            cursor: pointer;
            white-space: nowrap;
            border-radius: 4px;
        }
        
        .dropdown-option:hover {
            background: rgba(255, 255, 255, 0.1);
        }
        
        /* Speed dropdown specific */
        .speed-select {
            left: 50%;
            transform: translateX(-50%);
            min-width: 180px;
        }
        
        .speed-select.visible {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 2px;
        }
        
        .speed-option {
            text-align: center;
        }
        
        .speed-option.active {
            background: rgba(0, 123, 255, 0.5);
        }
        
        /* Hide combo specific */
        .hide-combo {
            display: flex;
            align-items: center;
            gap: 2px;
        }
        
        .hide-dropdown-btn {
            padding: 8px 8px;
            min-width: 32px;
            font-size: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .hide-dropdown-btn svg,
        .kebab-btn svg {
            width: 20px;
            height: 20px;
        }
        
        .hide-text-container {
            position: relative;
        }
        
        .hide-select {
            left: 50%;
            transform: translateX(-50%);
            min-width: 100px;
        }
        
        /* Kebab menu specific */
        .kebab-btn {
            padding: 8px 10px;
            min-width: 36px;
            display: none;
            align-items: center;
            justify-content: center;
        }
        
        .kebab-btn.visible {
            display: flex;
        }
        
        .kebab-menu {
            right: 0;
            min-width: 150px;
        }
        
        .kebab-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .time-display {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.7);
            padding: 0 8px;
            width: 100px;
            min-width: 100px;
            max-width: 100px;
            text-align: center;
            flex-shrink: 0;
        }
        
        .live-badge {
            background: #dc3545;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .hidden {
            display: none !important;
        }
    `;

    // ==================== Control Bar Creation ====================

    // Helper: create element with classes and attributes (Trusted Types safe)
    function createElement(tag, classes = '', attrs = {}, textContent = '') {
        const el = document.createElement(tag);
        if (classes) el.className = classes;
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        if (textContent) el.textContent = textContent;
        return el;
    }

    function createControlBar() {
        // Only create control bar in top-level document
        if (!isTopLevel) return null;
        if (controlBar) return controlBar;

        controlBar = document.createElement('div');
        controlBar.id = 'media-user-override-bar';
        shadowRoot = controlBar.attachShadow({ mode: 'closed' });

        // Build DOM using createElement (Trusted Types compatible - no innerHTML)
        const style = createElement('style');
        style.textContent = STYLES;
        shadowRoot.appendChild(style);

        // Control bar container
        const controlBarDiv = createElement('div', 'control-bar');
        
        // Progress container
        const progressContainer = createElement('div', 'progress-container');
        progressBuffered = createElement('div', 'progress-buffered');
        progressFill = createElement('div', 'progress-fill');
        progressTooltip = createElement('div', 'progress-tooltip');
        progressContainer.appendChild(progressBuffered);
        progressContainer.appendChild(progressFill);
        progressContainer.appendChild(progressTooltip);
        controlBarDiv.appendChild(progressContainer);
        progressBar = progressContainer;

        // Controls wrapper
        const controlsWrapper = createElement('div', 'controls-wrapper');
        
        // Progress hit area (fixed position, inside controls-wrapper for DOM organization)
        const progressHitArea = createElement('div', 'progress-hit-area');
        controlsWrapper.appendChild(progressHitArea);
        
        // Play/Pause button
        playPauseBtn = createElement('button', 'btn btn-icon play-pause', { title: 'Play/Pause' });
        playPauseBtn.appendChild(createPlaySvg());
        controlsWrapper.appendChild(playPauseBtn);
        
        // Time display (after play/pause, before speed combo - lower priority than speed)
        timeDisplay = createElement('div', 'time-display', {}, '0:00 / 0:00');
        controlsWrapper.appendChild(timeDisplay);
        
        // Speed combo
        const speedCombo = createElement('div', 'speed-combo');
        slowerBtn = createElement('button', 'btn btn-icon slower', { title: 'Slower' });
        slowerBtn.appendChild(createDecreaseSpeedSvg());
        
        // Speed text button with dropdown
        const speedTextContainer = createElement('div', 'speed-text-container');
        speedText = createElement('button', 'btn speed-text', { title: 'Select speed' }, '1.0x');
        speedSelect = createElement('div', 'dropdown speed-select');
        SPEEDS.forEach(s => {
            const opt = createElement('div', 'dropdown-option speed-option', { 'data-value': s }, s + 'x');
            speedSelect.appendChild(opt);
        });
        speedTextContainer.appendChild(speedText);
        speedTextContainer.appendChild(speedSelect);
        
        fasterBtn = createElement('button', 'btn btn-icon faster', { title: 'Faster' });
        fasterBtn.appendChild(createIncreaseSpeedSvg());
        speedCombo.appendChild(slowerBtn);
        speedCombo.appendChild(speedTextContainer);
        speedCombo.appendChild(fasterBtn);
        controlsWrapper.appendChild(speedCombo);
        
        // Hide combo (split button: [🙈] [🔼])
        const hideCombo = createElement('div', 'hide-combo');
        hideBtn = createElement('button', 'btn btn-icon hide-btn', { title: 'Hide controls' });
        hideBtn.appendChild(createHideSvg());
        
        // Dropdown trigger button
        const hideTextContainer = createElement('div', 'hide-text-container');
        const hideDropdownBtn = createElement('button', 'btn hide-dropdown-btn', { title: 'Hide duration options' });
        hideDropdownBtn.appendChild(createHamburgerSvg());
        hideSelect = createElement('div', 'dropdown hide-select');
        HIDE_DURATIONS.forEach(d => {
            const opt = createElement('div', 'dropdown-option hide-option', { 'data-value': d.value }, '🙈 ' + d.label);
            hideSelect.appendChild(opt);
        });
        hideTextContainer.appendChild(hideDropdownBtn);
        hideTextContainer.appendChild(hideSelect);
        
        hideCombo.appendChild(hideBtn);
        hideCombo.appendChild(hideTextContainer);
        controlsWrapper.appendChild(hideCombo);
        
        // Kebab menu
        kebabBtn = createElement('button', 'btn kebab-btn', { title: 'More options' });
        kebabBtn.appendChild(createHamburgerSvg());
        kebabMenu = createElement('div', 'dropdown kebab-menu');
        controlsWrapper.appendChild(kebabBtn);
        controlsWrapper.appendChild(kebabMenu);
        
        controlBarDiv.appendChild(controlsWrapper);
        shadowRoot.appendChild(controlBarDiv);

        // Apply saved speed
        currentSpeed = getSavedSpeed();
        speedText.textContent = currentSpeed + 'x';

        // Setup event listeners
        setupEventListeners();

        document.body.appendChild(controlBar);
        return controlBar;
    }

    // ==================== Event Listeners ====================

    function setupEventListeners() {
        // Play/Pause
        playPauseBtn.addEventListener('click', togglePlayPause);

        // Speed controls
        slowerBtn.addEventListener('click', () => changeSpeed(-1));
        fasterBtn.addEventListener('click', () => changeSpeed(1));
        speedText.addEventListener('click', (e) => {
            e.stopPropagation();
            speedSelect.classList.toggle('visible');
            updateSpeedOptions();
        });
        
        // Speed dropdown options
        speedSelect.querySelectorAll('.dropdown-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                const value = parseFloat(e.target.dataset.value);
                setSpeed(value);
                speedSelect.classList.remove('visible');
            });
        });

        // Progress hit area - hover and click for desktop, drag-to-seek for mobile
        const progressHitArea = shadowRoot.querySelector('.progress-hit-area');
        
        // Desktop mouse events - simple hover and click
        progressHitArea.addEventListener('mouseenter', () => {
            progressBar.classList.add('expanded');
        });
        
        progressHitArea.addEventListener('mouseleave', () => {
            progressBar.classList.remove('expanded');
            progressTooltip.style.opacity = '0';
        });
        
        progressHitArea.addEventListener('mousemove', (e) => {
            handleProgressHover(e);
        });
        
        progressHitArea.addEventListener('click', handleSeek);
        
        // Touch events for mobile - drag to seek
        progressHitArea.addEventListener('touchstart', (e) => {
            isDragging = true;
            progressBar.classList.add('expanded');
            progressTooltip.style.opacity = '1'; // Show immediately
            handleTouchMove(e);
        }, { passive: true });
        
        progressHitArea.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            handleTouchMove(e);
        }, { passive: true });
        
        progressHitArea.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            isDragging = false;
            // Seek to the touched position
            if (e.changedTouches && e.changedTouches.length > 0) {
                const touch = e.changedTouches[0];
                const rect = progressBar.getBoundingClientRect();
                const percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
                if (activeMedia && isFinite(activeMedia.duration)) {
                    activeMedia.currentTime = percent * activeMedia.duration;
                }
            }
            // Delay collapse slightly for visual feedback
            setTimeout(() => {
                progressBar.classList.remove('expanded');
                progressTooltip.style.opacity = '0';
            }, 300);
        });
        
        // Prevent context menu on long press (mobile)
        progressHitArea.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // Hide controls - main button (default 5s)
        hideBtn.addEventListener('click', () => hideControlBar(5));
        
        // Hide dropdown toggle (🔼 button)
        const hideDropdownBtn = shadowRoot.querySelector('.hide-dropdown-btn');
        hideDropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hideSelect.classList.toggle('visible');
        });
        
        // Hide dropdown options
        hideSelect.querySelectorAll('.dropdown-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                const value = parseInt(e.target.dataset.value);
                hideControlBar(value);
                hideSelect.classList.remove('visible');
            });
        });

        // Kebab menu
        kebabBtn.addEventListener('click', () => {
            kebabMenu.classList.toggle('visible');
        });

        // Close dropdowns on outside click (document level - for clicks outside control bar)
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#media-user-override-bar')) {
                hideSelect?.classList.remove('visible');
                kebabMenu?.classList.remove('visible');
                speedSelect?.classList.remove('visible');
            }
        });
        
        // Close dropdowns on click inside control bar (but outside dropdowns)
        // This is needed because Shadow DOM retargets events, so the document listener
        // sees clicks inside the control bar as being on the shadow host
        shadowRoot.addEventListener('click', (e) => {
            const target = e.target;
            const isDropdown = target.closest('.dropdown');
            const isDropdownTrigger = target.closest('.speed-text, .hide-dropdown-btn, .kebab-btn');
            if (!isDropdown && !isDropdownTrigger) {
                hideSelect?.classList.remove('visible');
                kebabMenu?.classList.remove('visible');
                speedSelect?.classList.remove('visible');
            }
        });

        // Resize observer for overflow handling
        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(shadowRoot.querySelector('.controls-wrapper'));
    }

    // ==================== Media Controls ====================

    function togglePlayPause() {
        if (!activeMedia) return;
        
        if (activeMedia.paused) {
            activeMedia.play();
        } else {
            activeMedia.pause();
        }
    }

    function changeSpeed(direction) {
        if (!activeMedia) return;

        let currentIndex = SPEEDS.indexOf(activeMedia.playbackRate);
        if (currentIndex === -1) {
            currentIndex = SPEEDS.findIndex(s => 
                direction < 0 ? s < activeMedia.playbackRate : s > activeMedia.playbackRate
            );
        }

        const newIndex = direction < 0
            ? Math.max(0, currentIndex - 1)
            : Math.min(SPEEDS.length - 1, currentIndex + 1);

        if (newIndex >= 0 && newIndex < SPEEDS.length) {
            setSpeed(SPEEDS[newIndex]);
        }
    }

    function setSpeed(speed) {
        if (!activeMedia) return;
        
        activeMedia.playbackRate = speed;
        saveSpeed(speed);
        speedText.textContent = speed + 'x';
        updateSpeedOptions();
    }
    
    function updateSpeedOptions() {
        if (!speedSelect || !activeMedia) return;
        
        const currentRate = activeMedia.playbackRate;
        speedSelect.querySelectorAll('.dropdown-option').forEach(opt => {
            const value = parseFloat(opt.dataset.value);
            if (value === currentRate) {
                opt.classList.add('active');
            } else {
                opt.classList.remove('active');
            }
        });
    }

    function handleSeek(e) {
        if (!activeMedia || !isFinite(activeMedia.duration)) return;

        const rect = progressBar.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        activeMedia.currentTime = percent * activeMedia.duration;
    }

    function handleProgressHover(e) {
        if (!activeMedia || !isFinite(activeMedia.duration)) return;

        const rect = progressBar.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const time = percent * activeMedia.duration;

        progressTooltip.textContent = formatTime(time);
        progressTooltip.style.left = (percent * 100) + '%';
        progressTooltip.style.opacity = '1';
    }
    
    function handleTouchMove(e) {
        if (!activeMedia || !isFinite(activeMedia.duration)) return;
        
        const touch = e.touches[0];
        const rect = progressBar.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
        const time = percent * activeMedia.duration;

        progressTooltip.textContent = formatTime(time);
        progressTooltip.style.left = (percent * 100) + '%';
    }

    // ==================== Progress Updates ====================

    function updateProgress() {
        if (!activeMedia || !progressFill) return;

        const duration = activeMedia.duration;
        
        // Handle live streams
        if (!isFinite(duration)) {
            progressFill.style.width = '100%';
            // Use DOM methods for Trusted Types compatibility
            timeDisplay.textContent = '';
            const liveBadge = createElement('span', 'live-badge', {}, 'LIVE');
            timeDisplay.appendChild(liveBadge);
            return;
        }

        const percent = (activeMedia.currentTime / duration) * 100;
        progressFill.style.width = percent + '%';
        
        timeDisplay.textContent = `${formatTime(activeMedia.currentTime)} / ${formatTime(duration)}`;
    }

    function updateBuffered() {
        if (!activeMedia || !progressBuffered) return;

        const duration = activeMedia.duration;
        if (!isFinite(duration)) {
            progressBuffered.style.width = '0%';
            return;
        }

        if (activeMedia.buffered.length > 0) {
            const bufferedEnd = activeMedia.buffered.end(activeMedia.buffered.length - 1);
            const percent = (bufferedEnd / duration) * 100;
            progressBuffered.style.width = percent + '%';
        }
    }

    // ==================== SVG Helpers ====================

    function createPlaySvg() {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('width', '20');
        svg.setAttribute('height', '20');
        svg.setAttribute('viewBox', '0 0 210 200');
        svg.setAttribute('fill', 'none');

        const g = document.createElementNS(ns, 'g');

        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('width', '210');
        rect.setAttribute('height', '200');
        g.appendChild(rect);

        const innerG = document.createElementNS(ns, 'g');
        innerG.setAttribute('transform', 'translate(19 0)');

        const path1 = document.createElementNS(ns, 'path');
        path1.setAttribute('d', 'M0 26L0 166.001L45.0001 192L174 123L174 69L45 0L0 26Z');
        path1.setAttribute('fill', '#FFFFFF');
        path1.setAttribute('fill-rule', 'evenodd');
        path1.setAttribute('transform', 'translate(0 4)');
        innerG.appendChild(path1);

        const path2 = document.createElementNS(ns, 'path');
        path2.setAttribute('d', 'M0 30C0 13.4315 13.4315 0 30 0C46.5685 0 60 13.4315 60 30C60 46.5685 46.5685 60 30 60C13.4315 60 0 46.5685 0 30Z');
        path2.setAttribute('fill', '#FFFFFF');
        path2.setAttribute('fill-rule', 'evenodd');
        innerG.appendChild(path2);

        const path3 = document.createElementNS(ns, 'path');
        path3.setAttribute('d', 'M0 30C0 13.4315 13.4315 0 30 0C46.5685 0 60 13.4315 60 30C60 46.5685 46.5685 60 30 60C13.4315 60 0 46.5685 0 30Z');
        path3.setAttribute('fill', '#FFFFFF');
        path3.setAttribute('fill-rule', 'evenodd');
        path3.setAttribute('transform', 'translate(0 140)');
        innerG.appendChild(path3);

        const path4 = document.createElementNS(ns, 'path');
        path4.setAttribute('d', 'M0 30C0 13.4315 13.4315 0 30 0C46.5685 0 60 13.4315 60 30C60 46.5685 46.5685 60 30 60C13.4315 60 0 46.5685 0 30Z');
        path4.setAttribute('fill', '#FFFFFF');
        path4.setAttribute('fill-rule', 'evenodd');
        path4.setAttribute('transform', 'translate(131 70)');
        innerG.appendChild(path4);

        g.appendChild(innerG);
        svg.appendChild(g);
        return svg;
    }

    function createPauseSvg() {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('width', '20');
        svg.setAttribute('height', '20');
        svg.setAttribute('viewBox', '0 0 210 200');
        svg.setAttribute('fill', 'none');

        const g = document.createElementNS(ns, 'g');

        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('width', '210');
        rect.setAttribute('height', '200');
        g.appendChild(rect);

        const path1 = document.createElementNS(ns, 'path');
        path1.setAttribute('d', 'M30 0C46.5708 0 60 13.4292 60 30L60 170C60 186.571 46.5708 200 30 200L30 200C13.4292 200 0 186.571 0 170L0 30C0 13.4292 13.4292 0 30 0Z');
        path1.setAttribute('fill', '#FFFFFF');
        path1.setAttribute('transform', 'translate(19 0)');
        g.appendChild(path1);

        const path2 = document.createElementNS(ns, 'path');
        path2.setAttribute('d', 'M30 0C46.5708 0 60 13.4292 60 30L60 170C60 186.571 46.5708 200 30 200L30 200C13.4292 200 0 186.571 0 170L0 30C0 13.4292 13.4292 0 30 0Z');
        path2.setAttribute('fill', '#FFFFFF');
        path2.setAttribute('transform', 'translate(131 0)');
        g.appendChild(path2);

        svg.appendChild(g);
        return svg;
    }

    function createDecreaseSpeedSvg() {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
        svg.setAttribute('viewBox', '0 0 300 300');
        svg.setAttribute('fill', 'none');

        const g = document.createElementNS(ns, 'g');

        // Main background circle (star shape)
        const path1 = document.createElementNS(ns, 'path');
        path1.setAttribute('d', 'M259.099 229.341C259.154 229.381 259.208 229.421 259.263 229.461C265.917 234.301 275.307 232.861 279.462 225.759C290.854 206.293 297.742 184.449 299.532 161.837C301.715 134.26 296.23 106.617 283.682 81.9626C271.134 57.3086 252.014 36.6047 228.433 22.1398C204.853 7.67499 177.732 0.0126648 150.069 3.05176e-05C122.405 -0.0126343 95.2771 7.62488 71.6836 22.0681C48.0903 36.5114 28.9504 57.1978 16.3801 81.8403C3.81006 106.483 -1.70093 134.121 0.457031 161.7C2.22632 184.313 9.09448 206.164 20.4683 225.641C24.6174 232.746 34.0054 234.194 40.6643 229.361C40.719 229.321 40.7739 229.281 40.8286 229.241C47.4875 224.408 48.8755 215.127 44.9041 207.921C36.6829 193.004 31.7031 176.454 30.3657 159.36C28.6394 137.297 33.0481 115.186 43.1042 95.4722C53.1604 75.7582 68.4722 59.2091 87.3469 47.6545C106.222 36.0999 127.924 29.9899 150.055 30C172.186 30.0101 193.882 36.14 212.747 47.7119C231.611 59.2837 246.908 75.8469 256.946 95.57C266.984 115.293 271.372 137.408 269.626 159.47C268.272 176.563 263.278 193.108 255.043 208.017C251.065 215.22 252.444 224.502 259.099 229.341Z');
        path1.setAttribute('fill', '#FFFFFF');
        path1.setAttribute('fill-rule', 'evenodd');
        g.appendChild(path1);

        // Triangle
        const path2 = document.createElementNS(ns, 'path');
        path2.setAttribute('d', 'M0 18.0815L51.946 96.0001L95.946 52.0001L17.9458 0L0 18.0815Z');
        path2.setAttribute('fill', '#FFFFFF');
        path2.setAttribute('fill-rule', 'evenodd');
        path2.setAttribute('transform', 'translate(75 75)');
        g.appendChild(path2);

        // Dot 1
        const path3 = document.createElementNS(ns, 'path');
        path3.setAttribute('d', 'M0 13C0 5.8203 5.82031 0 13 0C20.1797 0 26 5.8203 26 13C26 20.1797 20.1797 26 13 26C5.82031 26 0 20.1797 0 13Z');
        path3.setAttribute('fill', '#FFFFFF');
        path3.setAttribute('fill-rule', 'evenodd');
        path3.setAttribute('transform', 'matrix(1 0 -0 1 201 73)');
        g.appendChild(path3);

        // Dot 2
        const path4 = document.createElementNS(ns, 'path');
        path4.setAttribute('d', 'M0 13C0 5.8203 5.82031 0 13 0C20.1797 0 26 5.8203 26 13C26 20.1797 20.1797 26 13 26C5.82031 26 0 20.1797 0 13Z');
        path4.setAttribute('fill', '#FFFFFF');
        path4.setAttribute('fill-rule', 'evenodd');
        path4.setAttribute('transform', 'matrix(1 0 -0 1 73 73)');
        g.appendChild(path4);

        // Large circle
        const path5 = document.createElementNS(ns, 'path');
        path5.setAttribute('d', 'M0 31C0 13.8792 13.8792 0 31 0C48.1208 0 62 13.8792 62 31C62 48.1208 48.1208 62 31 62C13.8792 62 0 48.1208 0 31Z');
        path5.setAttribute('fill', '#FFFFFF');
        path5.setAttribute('fill-rule', 'evenodd');
        path5.setAttribute('transform', 'translate(119 119)');
        g.appendChild(path5);

        // Dot 3
        const path6 = document.createElementNS(ns, 'path');
        path6.setAttribute('d', 'M0 13C0 5.8203 5.82031 0 13 0C20.1797 0 26 5.8203 26 13C26 20.1797 20.1797 26 13 26C5.82031 26 0 20.1797 0 13Z');
        path6.setAttribute('fill', '#FFFFFF');
        path6.setAttribute('fill-rule', 'evenodd');
        path6.setAttribute('transform', 'translate(227 137)');
        g.appendChild(path6);

        // Dot 4
        const path7 = document.createElementNS(ns, 'path');
        path7.setAttribute('d', 'M0 13C0 5.8203 5.82031 0 13 0C20.1797 0 26 5.8203 26 13C26 20.1797 20.1797 26 13 26C5.82031 26 0 20.1797 0 13Z');
        path7.setAttribute('fill', '#FFFFFF');
        path7.setAttribute('fill-rule', 'evenodd');
        path7.setAttribute('transform', 'translate(137 47)');
        g.appendChild(path7);

        // Dot 5
        const path8 = document.createElementNS(ns, 'path');
        path8.setAttribute('d', 'M0 13C0 5.8203 5.82031 0 13 0C20.1797 0 26 5.8203 26 13C26 20.1797 20.1797 26 13 26C5.82031 26 0 20.1797 0 13Z');
        path8.setAttribute('fill', '#FFFFFF');
        path8.setAttribute('fill-rule', 'evenodd');
        path8.setAttribute('transform', 'translate(47 137)');
        g.appendChild(path8);

        // <<< symbol
        const xGroup = document.createElementNS(ns, 'g');
        xGroup.setAttribute('transform', 'translate(69 228)');

        const line1 = document.createElementNS(ns, 'line');
        line1.setAttribute('x1', '0');
        line1.setAttribute('y1', '0');
        line1.setAttribute('x2', '28.284');
        line1.setAttribute('y2', '35.355');
        line1.setAttribute('fill', 'none');
        line1.setAttribute('stroke', '#FFFFFF');
        line1.setAttribute('stroke-width', '30');
        line1.setAttribute('stroke-linecap', 'round');
        line1.setAttribute('transform', 'translate(0 27.929)');
        xGroup.appendChild(line1);

        const line2 = document.createElementNS(ns, 'line');
        line2.setAttribute('x1', '0');
        line2.setAttribute('y1', '35.355');
        line2.setAttribute('x2', '28.284');
        line2.setAttribute('y2', '0');
        line2.setAttribute('fill', 'none');
        line2.setAttribute('stroke', '#FFFFFF');
        line2.setAttribute('stroke-width', '30');
        line2.setAttribute('stroke-linecap', 'round');
        xGroup.appendChild(line2);

        const line3 = document.createElementNS(ns, 'line');
        line3.setAttribute('x1', '0');
        line3.setAttribute('y1', '0');
        line3.setAttribute('x2', '28.284');
        line3.setAttribute('y2', '35.355');
        line3.setAttribute('fill', 'none');
        line3.setAttribute('stroke', '#FFFFFF');
        line3.setAttribute('stroke-width', '30');
        line3.setAttribute('stroke-linecap', 'round');
        line3.setAttribute('transform', 'translate(60 27.929)');
        xGroup.appendChild(line3);

        const line4 = document.createElementNS(ns, 'line');
        line4.setAttribute('x1', '0');
        line4.setAttribute('y1', '35.355');
        line4.setAttribute('x2', '28.284');
        line4.setAttribute('y2', '0');
        line4.setAttribute('fill', 'none');
        line4.setAttribute('stroke', '#FFFFFF');
        line4.setAttribute('stroke-width', '30');
        line4.setAttribute('stroke-linecap', 'round');
        line4.setAttribute('transform', 'translate(60 0)');
        xGroup.appendChild(line4);

        const line5 = document.createElementNS(ns, 'line');
        line5.setAttribute('x1', '0');
        line5.setAttribute('y1', '0');
        line5.setAttribute('x2', '28.284');
        line5.setAttribute('y2', '35.355');
        line5.setAttribute('fill', 'none');
        line5.setAttribute('stroke', '#FFFFFF');
        line5.setAttribute('stroke-width', '30');
        line5.setAttribute('stroke-linecap', 'round');
        line5.setAttribute('transform', 'translate(120 28)');
        xGroup.appendChild(line5);

        const line6 = document.createElementNS(ns, 'line');
        line6.setAttribute('x1', '0');
        line6.setAttribute('y1', '35.355');
        line6.setAttribute('x2', '28.284');
        line6.setAttribute('y2', '0');
        line6.setAttribute('fill', 'none');
        line6.setAttribute('stroke', '#FFFFFF');
        line6.setAttribute('stroke-width', '30');
        line6.setAttribute('stroke-linecap', 'round');
        line6.setAttribute('transform', 'translate(120 0)');
        xGroup.appendChild(line6);

        g.appendChild(xGroup);

        svg.appendChild(g);
        return svg;
    }

    function createIncreaseSpeedSvg() {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
        svg.setAttribute('viewBox', '0 0 300 300');
        svg.setAttribute('fill', 'none');

        const g = document.createElementNS(ns, 'g');

        // Main background circle
        const path1 = document.createElementNS(ns, 'path');
        path1.setAttribute('d', 'M259.099 229.341C259.154 229.381 259.208 229.421 259.263 229.461C265.917 234.301 275.307 232.861 279.462 225.759C290.854 206.293 297.742 184.449 299.532 161.837C301.715 134.26 296.23 106.617 283.682 81.9625C271.134 57.3086 252.014 36.6047 228.433 22.1398C204.853 7.67498 177.732 0.012661 150.068 1.90735e-05C122.405 -0.0126419 95.2773 7.62488 71.6836 22.0681C48.0903 36.5114 28.9502 57.1978 16.3804 81.8403C3.81006 106.483 -1.70068 134.121 0.457031 161.7C2.22607 184.313 9.09473 206.164 20.4683 225.641C24.6172 232.746 34.0054 234.194 40.6641 229.361C40.7192 229.321 40.7739 229.281 40.8286 229.241C47.4873 224.408 48.8755 215.127 44.9043 207.921C36.6826 193.004 31.7031 176.454 30.3657 159.36C28.6392 137.297 33.0479 115.186 43.104 95.4722C53.1602 75.7582 68.4722 59.2091 87.3472 47.6545C106.222 36.0999 127.924 29.9899 150.055 30C172.186 30.0101 193.882 36.14 212.747 47.7118C231.611 59.2837 246.908 75.8469 256.946 95.57C266.984 115.293 271.372 137.408 269.626 159.47C268.272 176.563 263.278 193.108 255.043 208.017C251.065 215.22 252.444 224.502 259.099 229.341Z');
        path1.setAttribute('fill', '#FFFFFF');
        path1.setAttribute('fill-rule', 'evenodd');
        g.appendChild(path1);

        // Triangle
        const path2 = document.createElementNS(ns, 'path');
        path2.setAttribute('d', 'M0 18.0815L51.9463 96.0002L95.9463 52.0002L17.9453 0L0 18.0815Z');
        path2.setAttribute('fill', '#FFFFFF');
        path2.setAttribute('fill-rule', 'evenodd');
        path2.setAttribute('transform', 'matrix(-0.707 0.707 -0.707 -0.707 255 150)');
        g.appendChild(path2);

        // Dot 1
        const path3 = document.createElementNS(ns, 'path');
        path3.setAttribute('d', 'M0 13C0 5.8203 5.82031 0 13 0C20.1797 9.53674e-07 26 5.8203 26 13C26 20.1797 20.1797 26 13 26C5.82031 26 0 20.1797 0 13Z');
        path3.setAttribute('fill', '#FFFFFF');
        path3.setAttribute('fill-rule', 'evenodd');
        path3.setAttribute('transform', 'matrix(1 0 -0 1 201 73)');
        g.appendChild(path3);

        // Dot 2
        const path4 = document.createElementNS(ns, 'path');
        path4.setAttribute('d', 'M0 13C0 5.8203 5.82031 0 13 0C20.1797 9.53674e-07 26 5.8203 26 13C26 20.1797 20.1797 26 13 26C5.82031 26 0 20.1797 0 13Z');
        path4.setAttribute('fill', '#FFFFFF');
        path4.setAttribute('fill-rule', 'evenodd');
        path4.setAttribute('transform', 'matrix(1 0 -0 1 73 73)');
        g.appendChild(path4);

        // Large circle
        const path5 = document.createElementNS(ns, 'path');
        path5.setAttribute('d', 'M0 31C0 13.8792 13.8794 0 31 0C48.1206 0 62 13.8792 62 31C62 48.1208 48.1206 62 31 62C13.8794 62 0 48.1208 0 31Z');
        path5.setAttribute('fill', '#FFFFFF');
        path5.setAttribute('fill-rule', 'evenodd');
        path5.setAttribute('transform', 'translate(119 119)');
        g.appendChild(path5);

        // Dot 3
        const path6 = document.createElementNS(ns, 'path');
        path6.setAttribute('d', 'M0 13C0 5.8203 5.82031 0 13 0C20.1797 0 26 5.8203 26 13C26 20.1797 20.1797 26 13 26C5.82031 26 0 20.1797 0 13Z');
        path6.setAttribute('fill', '#FFFFFF');
        path6.setAttribute('fill-rule', 'evenodd');
        path6.setAttribute('transform', 'translate(227 137)');
        g.appendChild(path6);

        // Dot 4
        const path7 = document.createElementNS(ns, 'path');
        path7.setAttribute('d', 'M0 13C0 5.8203 5.82031 0 13 0C20.1797 0 26 5.8203 26 13C26 20.1797 20.1797 26 13 26C5.82031 26 0 20.1797 0 13Z');
        path7.setAttribute('fill', '#FFFFFF');
        path7.setAttribute('fill-rule', 'evenodd');
        path7.setAttribute('transform', 'translate(137 47)');
        g.appendChild(path7);

        // Dot 5
        const path8 = document.createElementNS(ns, 'path');
        path8.setAttribute('d', 'M0 13C0 5.8203 5.82031 0 13 0C20.1797 0 26 5.8203 26 13C26 20.1797 20.1797 26 13 26C5.82031 26 0 20.1797 0 13Z');
        path8.setAttribute('fill', '#FFFFFF');
        path8.setAttribute('fill-rule', 'evenodd');
        path8.setAttribute('transform', 'translate(47 137)');
        g.appendChild(path8);

        // >>> symbol group
        const xGroup = document.createElementNS(ns, 'g');
        xGroup.setAttribute('transform', 'matrix(-1 0 0 1 231 228)');

        const line1 = document.createElementNS(ns, 'line');
        line1.setAttribute('x1', '0');
        line1.setAttribute('y1', '0');
        line1.setAttribute('x2', '28.284');
        line1.setAttribute('y2', '28.284');
        line1.setAttribute('fill', 'none');
        line1.setAttribute('stroke', '#FFFFFF');
        line1.setAttribute('stroke-width', '30');
        line1.setAttribute('stroke-linecap', 'round');
        line1.setAttribute('transform', 'translate(0 27.929)');
        xGroup.appendChild(line1);

        const line2 = document.createElementNS(ns, 'line');
        line2.setAttribute('x1', '0');
        line2.setAttribute('y1', '28.284');
        line2.setAttribute('x2', '28.284');
        line2.setAttribute('y2', '0');
        line2.setAttribute('fill', 'none');
        line2.setAttribute('stroke', '#FFFFFF');
        line2.setAttribute('stroke-width', '30');
        line2.setAttribute('stroke-linecap', 'round');
        xGroup.appendChild(line2);

        const line3 = document.createElementNS(ns, 'line');
        line3.setAttribute('x1', '0');
        line3.setAttribute('y1', '0');
        line3.setAttribute('x2', '28.284');
        line3.setAttribute('y2', '28.284');
        line3.setAttribute('fill', 'none');
        line3.setAttribute('stroke', '#FFFFFF');
        line3.setAttribute('stroke-width', '30');
        line3.setAttribute('stroke-linecap', 'round');
        line3.setAttribute('transform', 'translate(60 27.929)');
        xGroup.appendChild(line3);

        const line4 = document.createElementNS(ns, 'line');
        line4.setAttribute('x1', '0');
        line4.setAttribute('y1', '28.284');
        line4.setAttribute('x2', '28.284');
        line4.setAttribute('y2', '0');
        line4.setAttribute('fill', 'none');
        line4.setAttribute('stroke', '#FFFFFF');
        line4.setAttribute('stroke-width', '30');
        line4.setAttribute('stroke-linecap', 'round');
        line4.setAttribute('transform', 'translate(60 0)');
        xGroup.appendChild(line4);

        const line5 = document.createElementNS(ns, 'line');
        line5.setAttribute('x1', '0');
        line5.setAttribute('y1', '0');
        line5.setAttribute('x2', '28.284');
        line5.setAttribute('y2', '28.284');
        line5.setAttribute('fill', 'none');
        line5.setAttribute('stroke', '#FFFFFF');
        line5.setAttribute('stroke-width', '30');
        line5.setAttribute('stroke-linecap', 'round');
        line5.setAttribute('transform', 'translate(120 28)');
        xGroup.appendChild(line5);

        const line6 = document.createElementNS(ns, 'line');
        line6.setAttribute('x1', '0');
        line6.setAttribute('y1', '28.284');
        line6.setAttribute('x2', '28.284');
        line6.setAttribute('y2', '0');
        line6.setAttribute('fill', 'none');
        line6.setAttribute('stroke', '#FFFFFF');
        line6.setAttribute('stroke-width', '30');
        line6.setAttribute('stroke-linecap', 'round');
        line6.setAttribute('transform', 'translate(120 0)');
        xGroup.appendChild(line6);

        g.appendChild(xGroup);

        svg.appendChild(g);
        return svg;
    }

    function createHideSvg() {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
        svg.setAttribute('viewBox', '0 0 300 260');
        svg.setAttribute('fill', 'none');

        const g = document.createElementNS(ns, 'g');

        // Eye shape path
        const path1 = document.createElementNS(ns, 'path');
        path1.setAttribute('d', 'M223.291 20.4965Q184.575 0 150 0Q103.132 0 48.6572 37.6616Q22.1152 56.0118 4.20215 74.588Q3.97634 74.8222 3.7609 75.0659Q3.54546 75.3097 3.34079 75.5625Q3.13612 75.8154 2.94261 76.0769Q2.74909 76.3384 2.56709 76.608Q2.3851 76.8777 2.21496 77.1549Q2.04483 77.4322 1.88687 77.7166Q1.72892 78.001 1.58344 78.292Q1.43796 78.583 1.30524 78.88Q1.17251 79.177 1.05279 79.4795Q0.933065 79.782 0.826567 80.0893Q0.72007 80.3967 0.626999 80.7085Q0.533928 81.0202 0.454459 81.3356Q0.37499 81.6511 0.309272 81.9697Q0.243554 82.2883 0.191711 82.6095Q0.139868 82.9307 0.101997 83.2538Q0.0641258 83.5769 0.0402983 83.9013Q0.0164708 84.2258 0.00673152 84.5509Q-0.00300773 84.8761 0.00135959 85.2014Q0.00572691 85.5267 0.0241926 85.8515Q0.0426583 86.1763 0.0751876 86.5Q0.107717 86.8237 0.154249 87.1457Q0.20078 87.4676 0.261227 87.7873Q0.321674 88.1069 0.395922 88.4237Q0.47017 88.7404 0.55808 89.0536Q0.645989 89.3668 0.747395 89.6759Q0.848801 89.985 0.963513 90.2895Q1.07822 90.5939 1.20603 90.8931Q1.33383 91.1922 1.47448 91.4855Q1.61513 91.7789 1.76837 92.0659Q1.9216 92.3528 2.08713 92.6329Q2.25267 92.9129 2.43019 93.1855Q2.6077 93.4582 2.79688 93.7228Q3.43945 94.6218 4.20703 95.4169L4.21094 95.421Q22.1216 113.993 48.6572 132.338Q69.105 146.475 88.4814 155.306L111.406 132.381Q89.7891 124.303 65.7178 107.662Q49.252 96.278 36.6411 85Q49.252 73.722 65.7178 62.3384Q89.9663 45.5738 111.724 37.5002C97.8652 48.6821 89 65.8058 89 85C89 104.083 97.7622 121.118 111.483 132.304L197.304 46.4829C194.615 43.1845 191.588 40.1727 188.275 37.5002Q194.509 39.8133 200.947 42.8397L223.291 20.4965ZM228.061 58.153L249.688 36.5252Q250.514 37.0888 251.343 37.6616Q277.885 56.0118 295.798 74.588Q296.048 74.8469 296.285 75.1175Q296.521 75.3881 296.745 75.6697Q296.969 75.9514 297.179 76.2434Q297.389 76.5355 297.585 76.8373Q297.78 77.1391 297.962 77.4499Q298.143 77.7607 298.309 78.0798Q298.474 78.399 298.625 78.7257Q298.775 79.0524 298.91 79.386Q299.045 79.7195 299.163 80.0592Q299.282 80.3988 299.384 80.7437Q299.486 81.0886 299.571 81.438Q299.657 81.7875 299.725 82.1406Q299.794 82.4937 299.845 82.8497Q299.897 83.2057 299.931 83.5637Q299.966 83.9218 299.983 84.281Q300 84.6403 300 85Q300 85.3597 299.983 85.719Q299.966 86.0783 299.931 86.4364Q299.897 86.7944 299.845 87.1504Q299.794 87.5064 299.725 87.8595Q299.657 88.2126 299.571 88.562Q299.486 88.9115 299.384 89.2564Q299.282 89.6013 299.163 89.9409Q299.045 90.2806 298.91 90.6141Q298.775 90.9477 298.625 91.2744Q298.474 91.6011 298.309 91.9203Q298.143 92.2394 297.961 92.5502Q297.78 92.861 297.585 93.1628Q297.389 93.4646 297.179 93.7566Q296.969 94.0487 296.745 94.3303Q296.521 94.612 296.285 94.8826Q296.048 95.1532 295.798 95.4121L295.763 95.448L295.754 95.4574Q277.853 114.011 251.343 132.338Q196.868 170 150 170Q135.326 170 119.905 166.308L210.324 75.8891C210.77 78.8614 211 81.9037 211 85C211 104.194 202.135 121.318 188.276 132.5Q210.034 124.426 234.282 107.662Q250.748 96.278 263.359 85Q250.748 73.722 234.282 62.3384Q231.15 60.1731 228.061 58.153Z');
        path1.setAttribute('fill', '#FFFFFF');
        path1.setAttribute('fill-rule', 'evenodd');
        path1.setAttribute('transform', 'translate(0 45)');
        g.appendChild(path1);

        // Diagonal strike-through line
        const line1 = document.createElementNS(ns, 'line');
        line1.setAttribute('x1', '0');
        line1.setAttribute('y1', '230');
        line1.setAttribute('x2', '230');
        line1.setAttribute('y2', '0');
        line1.setAttribute('fill', 'none');
        line1.setAttribute('stroke', '#FFFFFF');
        line1.setAttribute('stroke-width', '30');
        line1.setAttribute('stroke-linecap', 'round');
        line1.setAttribute('transform', 'translate(35 15)');
        g.appendChild(line1);

        svg.appendChild(g);
        return svg;
    }

    function createHamburgerSvg() {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('width', '20');
        svg.setAttribute('height', '20');
        svg.setAttribute('viewBox', '0 0 60 240');
        svg.setAttribute('fill', 'none');

        const g = document.createElementNS(ns, 'g');

        // Three circles stacked vertically (hamburger menu style)
        const circle1 = document.createElementNS(ns, 'path');
        circle1.setAttribute('d', 'M0 30C0 13.4315 13.4316 0 30 0C46.5684 0 60 13.4315 60 30C60 46.5685 46.5684 60 30 60C13.4316 60 0 46.5685 0 30Z');
        circle1.setAttribute('fill', '#FFFFFF');
        circle1.setAttribute('fill-rule', 'evenodd');
        g.appendChild(circle1);

        const circle2 = document.createElementNS(ns, 'path');
        circle2.setAttribute('d', 'M0 30C0 13.4315 13.4316 0 30 0C46.5684 0 60 13.4315 60 30C60 46.5685 46.5684 60 30 60C13.4316 60 0 46.5685 0 30Z');
        circle2.setAttribute('fill', '#FFFFFF');
        circle2.setAttribute('fill-rule', 'evenodd');
        circle2.setAttribute('transform', 'translate(0 90)');
        g.appendChild(circle2);

        const circle3 = document.createElementNS(ns, 'path');
        circle3.setAttribute('d', 'M0 30C0 13.4315 13.4316 0 30 0C46.5684 0 60 13.4315 60 30C60 46.5685 46.5684 60 30 60C13.4316 60 0 46.5685 0 30Z');
        circle3.setAttribute('fill', '#FFFFFF');
        circle3.setAttribute('fill-rule', 'evenodd');
        circle3.setAttribute('transform', 'translate(0 180)');
        g.appendChild(circle3);

        svg.appendChild(g);
        return svg;
    }

    function updatePlayPauseButton() {
        if (!playPauseBtn || !activeMedia) return;
        // Clear existing SVG using textContent (Trusted Types safe)
        playPauseBtn.textContent = '';
        if (activeMedia.paused) {
            playPauseBtn.appendChild(createPlaySvg());
        } else {
            playPauseBtn.appendChild(createPauseSvg());
        }
    }

    // ==================== Control Bar Visibility ====================

    function showControlBar() {
        if (!controlBar) createControlBar();
        const bar = shadowRoot.querySelector('.control-bar');
        bar.classList.add('visible');
    }

    function hideControlBar(duration = 5) {
        const bar = shadowRoot?.querySelector('.control-bar');
        if (bar) {
            bar.classList.remove('visible');
        }

        // Clear existing timeout
        if (hideTimeout) {
            clearTimeout(hideTimeout);
        }

        if (duration === -1 && activeMedia) {
            // Hide until media ends
            const showOnEnd = () => showControlBar();
            activeMedia.addEventListener('ended', showOnEnd, { once: true });
        } else if (duration > 0) {
            hideTimeout = setTimeout(() => {
                showControlBar();
            }, duration * 1000);
        }
    }

    // ==================== Overflow Management ====================

    function handleResize(entries) {
        const wrapper = entries[0].target;
        const availableWidth = wrapper.clientWidth;
        
        // Calculate required width for all buttons (excluding progress-hit-area which is fixed position)
        const buttons = wrapper.querySelectorAll('.btn, .speed-combo, .time-display');
        let totalWidth = 0;
        
        buttons.forEach(btn => {
            totalWidth += btn.offsetWidth + 8; // 8px gap
        });

        // Check overflow levels and hide elements by priority (higher number = hide first)
        // Priority order: timeDisplay (3) hides before hide combo (4)
        const timeDisplayEl = shadowRoot.querySelector('.time-display');
        const hideCombo = shadowRoot.querySelector('.hide-combo');
        
        // First, check if we need to hide timeDisplay (priority 3 - hides first)
        // Calculate width without timeDisplay
        const widthWithoutTimeDisplay = totalWidth - (timeDisplayEl ? timeDisplayEl.offsetWidth + 8 : 0);
        
        // Then check if we need to hide hide combo (priority 4 - hides after timeDisplay)
        const widthWithoutHide = widthWithoutTimeDisplay - (hideCombo && !hideCombo.classList.contains('hidden') ? hideCombo.offsetWidth + 8 : 0);
        
        if (totalWidth > availableWidth) {
            // Need to hide something - check priority order
            if (widthWithoutTimeDisplay <= availableWidth) {
                // Hiding just timeDisplay is enough
                hideTimeDisplay();
                showHideCombo();
            } else if (widthWithoutHide <= availableWidth) {
                // Need to hide both timeDisplay and hide combo
                hideTimeDisplay();
                moveHideToOverflow();
            } else {
                // Even hiding both isn't enough - keep them hidden
                hideTimeDisplay();
                moveHideToOverflow();
            }
        } else {
            // Everything fits - show all
            showTimeDisplay();
            showHideCombo();
        }
    }

    function hideTimeDisplay() {
        if (timeDisplay && !timeDisplay.classList.contains('hidden')) {
            timeDisplay.classList.add('hidden');
        }
    }

    function showTimeDisplay() {
        if (timeDisplay) {
            timeDisplay.classList.remove('hidden');
        }
    }

    function showHideCombo() {
        const hideCombo = shadowRoot.querySelector('.hide-combo');
        if (hideCombo) {
            hideCombo.classList.remove('hidden');
        }
        // Clear kebab menu and hide kebab button
        kebabMenu.innerHTML = '';
        kebabBtn.classList.remove('visible');
    }

    function moveHideToOverflow() {
        const hideCombo = shadowRoot.querySelector('.hide-combo');
        if (hideCombo && !hideCombo.classList.contains('hidden')) {
            hideCombo.classList.add('hidden');
            kebabBtn.classList.add('visible');
            
            // Add all hide duration options to kebab menu
            // Only add if not already present
            if (kebabMenu.querySelectorAll('.dropdown-option').length === 0) {
                HIDE_DURATIONS.forEach(d => {
                    const hideItem = createElement('div', 'dropdown-option kebab-item', { 'data-value': d.value }, '🙈 ' + d.label);
                    hideItem.addEventListener('click', () => {
                        hideControlBar(d.value);
                        kebabMenu.classList.remove('visible');
                    });
                    kebabMenu.appendChild(hideItem);
                });
            }
        }
    }

    function restoreFromOverflow() {
        showTimeDisplay();
        showHideCombo();
    }

    // ==================== Media Management ====================

    // Consolidated event handler for all media events
    function handleMediaEvent(e) {
        const media = e.target;
        
        switch (e.type) {
            case 'play':
                setActiveMedia(media, mediaToIframe.get(media));
                break;
            case 'pause':
            case 'playing':
                if (media === activeMedia) updatePlayPauseButton();
                break;
            case 'timeupdate':
                if (media === activeMedia) updateProgress();
                break;
            case 'progress':
                if (media === activeMedia) updateBuffered();
                break;
            case 'ratechange':
                if (media === activeMedia) speedText.textContent = media.playbackRate + 'x';
                break;
        }
    }

    function registerMedia(media, iframe = null) {
        if (allMedia.has(media)) return;
        
        allMedia.add(media);
        mediaToIframe.set(media, iframe);
        
        const location = iframe ? 'iframe' : 'top-level';
        console.log(`[Media User Override] Registered media in ${location}:`, media);

        // Single consolidated event listener
        media.addEventListener('play', handleMediaEvent);
        media.addEventListener('pause', handleMediaEvent);
        media.addEventListener('playing', handleMediaEvent);
        media.addEventListener('timeupdate', handleMediaEvent);
        media.addEventListener('progress', handleMediaEvent);
        media.addEventListener('ratechange', handleMediaEvent);
    }

    function unregisterMedia(media) {
        allMedia.delete(media);
        console.log('[Media User Override] Unregistered media:', media);

        if (activeMedia === media) {
            activeMedia = null;
            // Check if any other media is playing
            const playingMedia = Array.from(allMedia).find(m => !m.paused);
            if (playingMedia) {
                setActiveMedia(playingMedia, mediaToIframe.get(playingMedia));
            } else {
                hideControlBar(0); // Hide immediately
            }
        }
    }

    function setActiveMedia(media, iframe = null) {
        // Filter out short media
        if (media.duration > 0 && media.duration < MIN_DURATION) {
            return;
        }

        activeMedia = media;
        // Store iframe mapping
        if (iframe) mediaToIframe.set(media, iframe);
        
        const location = iframe ? 'iframe' : 'top-level';
        console.log(`[Media User Override] Active media (${location}):`, media);

        // Ensure control bar exists before updating UI (only in top-level)
        if (isTopLevel) {
            showControlBar();

            // Apply saved speed
            if (media.playbackRate !== currentSpeed) {
                media.playbackRate = currentSpeed;
            }

            // Update UI
            speedText.textContent = media.playbackRate + 'x';
            updatePlayPauseButton();
            updateProgress();
            updateBuffered();
        }
    }

    // ==================== Media Detection ====================

    function detectMedia() {
        // Detect media in main document and same-origin iframes
        detectIframeMedia();
    }

    // Flattened iframe media detection
    function detectIframeMedia() {
        const processed = new WeakSet();
        
        function scan(doc, rootIframe = null) {
            // Scan media in this document
            doc.querySelectorAll('video, audio').forEach(media => {
                if (!processed.has(media)) {
                    processed.add(media);
                    // registerMedia handles duplicate detection internally
                    registerMedia(media, rootIframe);
                    // If already playing, set as active
                    if (!media.paused && media.duration >= MIN_DURATION) {
                        setActiveMedia(media, rootIframe);
                    }
                }
            });
            
            // Scan nested iframes
            doc.querySelectorAll('iframe').forEach(iframe => {
                try {
                    const iframeDoc = iframe.contentDocument;
                    if (iframeDoc) {
                        console.log(`[Media User Override] Found iframe with ${iframeDoc.querySelectorAll('video, audio').length} media elements`);
                        scan(iframeDoc, rootIframe || iframe);
                    }
                } catch (e) {
                    // Cross-origin iframe - cannot access
                }
            });
        }
        
        scan(document);
    }

    // ==================== Utilities ====================

    function formatTime(seconds) {
        if (!isFinite(seconds)) return '0:00';
        
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);

        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // ==================== Initialization ====================

    function cleanupRemovedMedia() {
        for (const media of allMedia) {
            const iframe = mediaToIframe.get(media);
            const doc = iframe?.contentDocument ?? document;
            if (!doc?.contains(media)) {
                unregisterMedia(media);
            }
        }
    }

    function init() {
        console.log('[Media User Override] Initializing...', isTopLevel ? '(top-level)' : '(iframe)');
        
        // Initial detection
        detectMedia();

        // Observe for new media elements and iframes
        const observer = new MutationObserver((mutations) => {
            const shouldDetect = mutations.some(mutation =>
                mutation.type === 'childList' &&
                Array.from(mutation.addedNodes).some(node =>
                    node.nodeName === 'VIDEO' || 
                    node.nodeName === 'AUDIO' ||
                    node.nodeName === 'IFRAME' ||
                    (node.querySelectorAll && node.querySelectorAll('video, audio, iframe').length > 0)
                )
            );

            if (shouldDetect) {
                detectMedia();
            }
            
            // Cleanup removed elements
            cleanupRemovedMedia();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Periodic cleanup timer (every 5 seconds)
        setInterval(cleanupRemovedMedia, 5000);

        // Also listen for iframe load events (for dynamically created iframes)
        document.addEventListener('load', (e) => {
            if (e.target.tagName === 'IFRAME') {
                console.log('[Media User Override] Iframe loaded:', e.target);
                // Give the iframe a moment to initialize
                setTimeout(() => detectIframeMedia(), 100);
            }
        }, true); // Use capture phase to catch iframe load events

        console.log('[Media User Override] Ready');
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
