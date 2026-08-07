let isLooping = false;
let isWaiting = false;
let looperInterval = null;
let waitTimeout = null;

// Cross-browser runtime helper (Firefox 'browser' vs Chrome 'chrome')
const extensionRuntime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : chrome.runtime;

function getTargetVideo() {
    return document.querySelector('video.html5-main-video') || document.querySelector('video');
}

function injectMainWorldScript() {
    if (document.getElementById('yt-fiddle-looper-inject')) return;

    const script = document.createElement('script');
    script.id = 'yt-fiddle-looper-inject';
    script.src = extensionRuntime.getURL('inject.js');
    (document.head || document.documentElement).appendChild(script);

    script.onload = () => {
        console.log('[YouTube Fiddle Looper CS] Injected main world script successfully.');
        window.postMessage({
            source: 'FIDDLE_LOOPER_CS',
            type: 'INIT_AUDIO',
            workletUrl: extensionRuntime.getURL('worklet.js'),
            wasmUrl: extensionRuntime.getURL('rubberband.wasm')
        }, '*');
    };
}

function applySpeed() {
    const video = getTargetVideo();
    const speedInp = document.getElementById('inp-speed');
    if (video && speedInp) {
        video.playbackRate = parseFloat(speedInp.value);
    }
}

function updatePitch() {
    const pitchInp = document.getElementById('inp-pitch');
    const centsInp = document.getElementById('inp-cents');
    if (pitchInp && centsInp) {
        const pitchVal = parseFloat(pitchInp.value) || 0;
        const centsVal = parseFloat(centsInp.value) || 0;
        window.postMessage({
            source: 'FIDDLE_LOOPER_CS',
            type: 'SET_PITCH',
            pitch: pitchVal,
            cents: centsVal
        }, '*');
    }
}

function notifyResumeAudio() {
    window.postMessage({
        source: 'FIDDLE_LOOPER_CS',
        type: 'RESUME_AUDIO'
    }, '*');
}

function init() {
    injectMainWorldScript();

    if (document.getElementById('yt-looper-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'yt-looper-panel';
    panel.innerHTML = `
        <div class="looper-title">🎻 Fiddle Looper</div>
        
        <div class="looper-row">
            <button id="btn-set-start" title="Grab current video time">Set Start</button>
            <input type="number" id="inp-start" value="0.0" step="0.1">
        </div>
        
        <div class="looper-row">
            <button id="btn-set-end" title="Grab current video time">Set End</button>
            <input type="number" id="inp-end" value="5.0" step="0.1">
        </div>
        
        <button id="btn-shift-start" title="Set Start time to End time and play without looping">End ➔ Start & Play</button>
        
        <div class="looper-row">
            <span style="font-size:13px; font-weight: 500;">Delay (s):</span>
            <input type="number" id="inp-delay" value="2.0" step="0.5">
        </div>

        <div class="looper-row">
            <span style="font-size:13px; font-weight: 500;">Speed:</span>
            <input type="number" id="inp-speed" value="1.0" step="0.05" min="0.1" max="2.0">
        </div>

        <div class="looper-row">
            <span style="font-size:13px; font-weight: 500;">Pitch (st):</span>
            <input type="number" id="inp-pitch" value="0" step="1" min="-12" max="12">
        </div>

        <div class="looper-row">
            <span style="font-size:13px; font-weight: 500;">Fine (ct):</span>
            <input type="number" id="inp-cents" value="0" step="1" min="-100" max="100">
        </div>
        
        <button id="btn-pitch-reset" title="Reset Pitch and Cents to 0">Reset Pitch</button>

        <button id="btn-toggle-loop">Start Loop</button>
    `;
    
    document.body.appendChild(panel);

    document.getElementById('btn-set-start').addEventListener('click', () => {
        notifyResumeAudio();
        const video = getTargetVideo();
        if (video) document.getElementById('inp-start').value = video.currentTime.toFixed(2);
    });

    document.getElementById('btn-set-end').addEventListener('click', () => {
        notifyResumeAudio();
        const video = getTargetVideo();
        if (video) document.getElementById('inp-end').value = video.currentTime.toFixed(2);
    });

    document.getElementById('btn-shift-start').addEventListener('click', () => {
        notifyResumeAudio();
        const video = getTargetVideo();
        const endVal = document.getElementById('inp-end').value;
        document.getElementById('inp-start').value = endVal;
        
        if (isLooping) {
            isLooping = false;
            stopLoop();
            const toggleBtn = document.getElementById('btn-toggle-loop');
            if (toggleBtn) {
                toggleBtn.innerText = 'Start Loop';
                toggleBtn.classList.remove('looping');
            }
        }
        
        if (video) {
            video.currentTime = parseFloat(endVal);
            applySpeed();
            video.play();
        }
    });

    document.getElementById('inp-speed').addEventListener('input', () => {
        notifyResumeAudio();
        applySpeed();
    });

    const pitchInp = document.getElementById('inp-pitch');
    const centsInp = document.getElementById('inp-cents');

    pitchInp.addEventListener('input', () => {
        notifyResumeAudio();
        updatePitch();
    });

    centsInp.addEventListener('input', () => {
        notifyResumeAudio();
        updatePitch();
    });

    document.getElementById('btn-pitch-reset').addEventListener('click', () => {
        notifyResumeAudio();
        pitchInp.value = 0;
        centsInp.value = 0;
        updatePitch();
    });

    const toggleBtn = document.getElementById('btn-toggle-loop');
    toggleBtn.addEventListener('click', () => {
        notifyResumeAudio();
        isLooping = !isLooping;
        if (isLooping) {
            toggleBtn.innerText = 'Stop Loop';
            toggleBtn.classList.add('looping');
            startLoop();
        } else {
            toggleBtn.innerText = 'Start Loop';
            toggleBtn.classList.remove('looping');
            stopLoop();
        }
    });
}

function startLoop() {
    const video = getTargetVideo();
    if (!video) return;

    let startT = parseFloat(document.getElementById('inp-start').value);
    video.currentTime = startT;
    applySpeed();
    video.play();

    looperInterval = setInterval(checkTime, 50);
}

function stopLoop() {
    clearInterval(looperInterval);
    clearTimeout(waitTimeout);
    isWaiting = false;
}

function checkTime() {
    if (!isLooping || isWaiting) return;
    const video = getTargetVideo();
    if (!video) return;

    let endT = parseFloat(document.getElementById('inp-end').value);
    applySpeed();

    if (video.currentTime >= endT) {
        isWaiting = true;
        video.pause();
        
        let startT = parseFloat(document.getElementById('inp-start').value);
        let delayMs = parseFloat(document.getElementById('inp-delay').value) * 1000;

        waitTimeout = setTimeout(() => {
            video.currentTime = startT;
            applySpeed();
            video.play();
            isWaiting = false;
        }, delayMs);
    }
}

// Immediate execution check if page is already on /watch
if (window.location.pathname === '/watch') {
    init();
}

// Listen for YouTube SPA navigation events
document.addEventListener('yt-navigate-finish', () => {
    if (window.location.pathname === '/watch') {
        init();
    }
});

// Observe DOM mutations for video element & watch page
const observer = new MutationObserver(() => {
    if (window.location.pathname === '/watch') {
        init();
    } else if (!window.location.pathname.startsWith('/watch')) {
        const panel = document.getElementById('yt-looper-panel');
        if (panel) panel.remove();
        stopLoop();
        isLooping = false;
    }
});
observer.observe(document.body, { childList: true, subtree: true });
