let isLooping = false;
let isWaiting = false;
let looperInterval = null;
let waitTimeout = null;

function applySpeed() {
    const video = document.querySelector('video');
    const speedInp = document.getElementById('inp-speed');
    if (video && speedInp) {
        video.playbackRate = parseFloat(speedInp.value);
    }
}

function init() {
    if (document.getElementById('yt-looper-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'yt-looper-panel';
    panel.innerHTML = `
        <div style="font-weight:bold; text-align:center; font-size:16px; border-bottom:1px solid #555; padding-bottom:8px;">🎻 Fiddle Looper</div>
        
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
            <span style="font-size:14px;">Delay (sec):</span>
            <input type="number" id="inp-delay" value="2.0" step="0.5">
        </div>

        <div class="looper-row">
            <span style="font-size:14px;">Speed:</span>
            <input type="number" id="inp-speed" value="1.0" step="0.05" min="0.1" max="2.0">
        </div>
        
        <button id="btn-toggle-loop">Start Loop</button>
    `;
    
    document.body.appendChild(panel);

    document.getElementById('btn-set-start').addEventListener('click', () => {
        const video = document.querySelector('video');
        if(video) document.getElementById('inp-start').value = video.currentTime.toFixed(2);
    });

    document.getElementById('btn-set-end').addEventListener('click', () => {
        const video = document.querySelector('video');
        if(video) document.getElementById('inp-end').value = video.currentTime.toFixed(2);
    });

    document.getElementById('btn-shift-start').addEventListener('click', () => {
        const video = document.querySelector('video');
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
        applySpeed();
    });

    const toggleBtn = document.getElementById('btn-toggle-loop');
    toggleBtn.addEventListener('click', () => {
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
    const video = document.querySelector('video');
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
    const video = document.querySelector('video');
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

const observer = new MutationObserver(() => {
    if (document.querySelector('video') && window.location.pathname === '/watch') {
        init();
    } else if (!window.location.pathname.startsWith('/watch')) {
        const panel = document.getElementById('yt-looper-panel');
        if (panel) panel.remove();
        stopLoop();
        isLooping = false;
    }
});
observer.observe(document.body, { childList: true, subtree: true });
