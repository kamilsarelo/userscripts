// ==UserScript==
// @name         Media User Override
// @description  Adds media controls (play/pause, speed, progress) below audio/video elements with persistence, responsive overflow, and hide functionality
// @namespace    https://github.com/kamilsarelo
// @version      1
// @author       kamilsarelo
// @match        *://*/*
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
 *   - Speed text is clickable and cycles through presets
 *   - 16 speed presets: 0.1x to 32x
 *   - Speed persists globally across all pages
 * - Slim full-width progress bar
 *   - Click to seek
 *   - Hover shows timestamp tooltip
 *   - Buffered indicator
 *   - Live stream support (shows "LIVE" badge)
 * - Hide controls with duration options: 5s, 15s, 30s, 1min, until media ends
 * - Responsive overflow: Hide button moves to kebab menu (⋮) when space is limited
 * - Shadow DOM isolation: No CSS conflicts with page styles
 * 
 * CONTROL BAR LAYOUT
 * ------------------
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │  ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ Progress
 * ├──────────────────────────────────────────────────────────────────────────────┤
 * │  [▶️]  [◀◀] [1.5x] [▶▶]  0:00 / 5:30  [👁️ Hide 5s ▼]  [⋮] (if overflow)   │
 * └──────────────────────────────────────────────────────────────────────────────┘
 * 
 * BUTTON PRIORITY (for responsive overflow)
 * -----------------------------------------
 * 1. Play/Pause     - Always visible (never overflows)
 * 2. Speed Combo    - Always visible (never overflows)
 * 3. Hide Button    - First to overflow when space is limited
 * 4. Future buttons - Will overflow if needed
 * 5. Kebab Menu (⋮) - Only visible when overflow exists
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
        const all = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 4, 8, 16, 32, 64];
        const supported = all.filter(s => { try { m.playbackRate = s; return true; } catch { return false; }});
        m.remove();
        return supported;
    })();
    const HIDE_DURATIONS = [
        { value: 5, label: '5s' },
        { value: 15, label: '15s' },
        { value: 30, label: '30s' },
        { value: 60, label: '1min' },
        { value: -1, label: 'Until end' }
    ];
    const MIN_DURATION = 5; // Minimum media duration in seconds to show controls
    const BUTTON_PRIORITY = {
        playPause: 1,
        speedCombo: 2,
        hide: 3,
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

    // DOM Elements
    let playPauseBtn = null;
    let slowerBtn = null;
    let speedText = null;
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
            background: rgba(0, 0, 0, 0.85);
            color: white;
            font-size: 14px;
            transform: translateY(100%);
            transition: transform 0.3s ease;
            user-select: none;
        }
        
        .control-bar.visible {
            transform: translateY(0);
        }
        
        .progress-container {
            height: 4px;
            width: 100%;
            background: rgba(255, 255, 255, 0.1);
            cursor: pointer;
            position: relative;
        }
        
        .progress-container:hover {
            height: 6px;
        }
        
        .progress-buffered {
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            background: rgba(255, 255, 255, 0.2);
            pointer-events: none;
        }
        
        .progress-fill {
            height: 100%;
            background: #007bff;
            transition: width 0.1s linear;
            position: relative;
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
        
        .progress-container:hover .progress-tooltip {
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
        }
        
        .btn:hover {
            background: rgba(255, 255, 255, 0.2);
            border-color: rgba(255, 255, 255, 0.5);
        }
        
        .btn:active {
            transform: scale(0.95);
        }
        
        .btn-icon {
            min-width: 40px;
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
        
        .speed-text:hover {
            background: rgba(0, 123, 255, 0.5);
        }
        
        .hide-btn {
            position: relative;
        }
        
        .hide-select {
            position: absolute;
            bottom: 100%;
            right: 0;
            background: rgba(0, 0, 0, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 6px;
            padding: 4px 0;
            margin-bottom: 4px;
            display: none;
            min-width: 100px;
        }
        
        .hide-select.visible {
            display: block;
        }
        
        .hide-option {
            padding: 8px 12px;
            cursor: pointer;
            white-space: nowrap;
        }
        
        .hide-option:hover {
            background: rgba(255, 255, 255, 0.1);
        }
        
        .kebab-btn {
            padding: 8px 10px;
            min-width: 36px;
            display: none;
        }
        
        .kebab-btn.visible {
            display: flex;
        }
        
        .kebab-menu {
            position: absolute;
            bottom: 100%;
            right: 0;
            background: rgba(0, 0, 0, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 6px;
            padding: 4px 0;
            margin-bottom: 4px;
            display: none;
            min-width: 150px;
        }
        
        .kebab-menu.visible {
            display: block;
        }
        
        .kebab-item {
            padding: 10px 15px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .kebab-item:hover {
            background: rgba(255, 255, 255, 0.1);
        }
        
        .time-display {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.7);
            padding: 0 8px;
            min-width: 90px;
            text-align: center;
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
        
        // Play/Pause button
        playPauseBtn = createElement('button', 'btn btn-icon play-pause', { title: 'Play/Pause' }, '▶️');
        controlsWrapper.appendChild(playPauseBtn);
        
        // Speed combo
        const speedCombo = createElement('div', 'speed-combo');
        slowerBtn = createElement('button', 'btn speed-btn slower', { title: 'Slower' }, '⏪');
        speedText = createElement('button', 'btn speed-text', { title: 'Click to cycle speed' }, '1.0x');
        fasterBtn = createElement('button', 'btn speed-btn faster', { title: 'Faster' }, '⏩');
        speedCombo.appendChild(slowerBtn);
        speedCombo.appendChild(speedText);
        speedCombo.appendChild(fasterBtn);
        controlsWrapper.appendChild(speedCombo);
        
        // Time display
        timeDisplay = createElement('div', 'time-display', {}, '0:00 / 0:00');
        controlsWrapper.appendChild(timeDisplay);
        
        // Hide button with dropdown
        const hideBtnContainer = createElement('div', 'hide-btn');
        hideBtn = createElement('button', 'btn hide-trigger', { title: 'Hide controls' }, '👁️ Hide 5s');
        hideSelect = createElement('div', 'hide-select');
        HIDE_DURATIONS.forEach(d => {
            const opt = createElement('div', 'hide-option', { 'data-value': d.value }, d.label);
            hideSelect.appendChild(opt);
        });
        hideBtnContainer.appendChild(hideBtn);
        hideBtnContainer.appendChild(hideSelect);
        controlsWrapper.appendChild(hideBtnContainer);
        
        // Kebab menu
        kebabBtn = createElement('button', 'btn kebab-btn', { title: 'More options' }, '⋮');
        kebabMenu = createElement('div', 'kebab-menu');
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
        speedText.addEventListener('click', cycleSpeed);

        // Progress bar
        progressBar.addEventListener('click', handleSeek);
        progressBar.addEventListener('mousemove', handleProgressHover);
        progressBar.addEventListener('mouseleave', () => {
            progressTooltip.style.opacity = '0';
        });

        // Hide controls
        hideBtn.addEventListener('click', () => hideControlBar(5));
        hideSelect.querySelectorAll('.hide-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                const value = parseInt(e.target.dataset.value);
                hideControlBar(value);
                hideSelect.classList.remove('visible');
            });
        });

        // Hide dropdown toggle
        hideBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            hideSelect.classList.toggle('visible');
        });

        // Kebab menu
        kebabBtn.addEventListener('click', () => {
            kebabMenu.classList.toggle('visible');
        });

        // Close dropdowns on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#media-user-override-bar')) {
                hideSelect?.classList.remove('visible');
                kebabMenu?.classList.remove('visible');
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
            activeMedia.playbackRate = SPEEDS[newIndex];
            saveSpeed(activeMedia.playbackRate);
            speedText.textContent = activeMedia.playbackRate + 'x';
        }
    }

    function cycleSpeed() {
        if (!activeMedia) return;

        let currentIndex = SPEEDS.indexOf(activeMedia.playbackRate);
        if (currentIndex === -1) currentIndex = SPEEDS.indexOf(1);
        
        const newIndex = (currentIndex + 1) % SPEEDS.length;
        activeMedia.playbackRate = SPEEDS[newIndex];
        saveSpeed(activeMedia.playbackRate);
        speedText.textContent = activeMedia.playbackRate + 'x';
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

    function updatePlayPauseButton() {
        if (!playPauseBtn || !activeMedia) return;
        playPauseBtn.textContent = activeMedia.paused ? '▶️' : '⏸️';
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
        
        // Calculate required width for all buttons
        const buttons = wrapper.querySelectorAll('.btn, .speed-combo, .time-display');
        let totalWidth = 0;
        
        buttons.forEach(btn => {
            totalWidth += btn.offsetWidth + 8; // 8px gap
        });

        // Check if we need overflow
        if (totalWidth > availableWidth) {
            moveHideToOverflow();
        } else {
            restoreFromOverflow();
        }
    }

    function moveHideToOverflow() {
        const hideBtnContainer = shadowRoot.querySelector('.hide-btn');
        if (hideBtnContainer && !hideBtnContainer.classList.contains('hidden')) {
            hideBtnContainer.classList.add('hidden');
            kebabBtn.classList.add('visible');
            
            // Add hide options to kebab menu (use textContent for Trusted Types)
            const hideItem = createElement('div', 'kebab-item', {}, '👁️ Hide controls');
            hideItem.addEventListener('click', () => {
                hideControlBar(5);
                kebabMenu.classList.remove('visible');
            });
            
            // Clear and add to kebab
            if (!kebabMenu.querySelector('.kebab-item')) {
                kebabMenu.appendChild(hideItem);
            }
        }
    }

    function restoreFromOverflow() {
        const hideBtnContainer = shadowRoot.querySelector('.hide-btn');
        if (hideBtnContainer) {
            hideBtnContainer.classList.remove('hidden');
        }
        
        // Only hide kebab if no overflow items
        if (kebabMenu.querySelectorAll('.kebab-item').length === 0) {
            kebabBtn.classList.remove('visible');
        }
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
