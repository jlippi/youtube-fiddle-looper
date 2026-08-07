(function() {
    console.log('[YouTube Fiddle Looper Inject] Main world script initialized.');

    let audioCtx = null;
    let mediaSourceNode = null;
    let workletNode = null;
    let currentVideoElement = null;
    let isWorkletConnected = false;
    let currentPitch = 0;
    let currentCents = 0;

    function getTargetVideo() {
        return document.querySelector('video.html5-main-video') || document.querySelector('video');
    }

    function ensureAudioContextResumed() {
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().then(() => {
                console.log('[YouTube Fiddle Looper Inject] AudioContext resumed successfully.');
            }).catch(err => console.error('[YouTube Fiddle Looper Inject] AudioContext resume error:', err));
        }
    }

    async function fetchWasmBuffer(wasmUrl) {
        try {
            console.log('[YouTube Fiddle Looper Inject] Fetching WASM buffer directly from:', wasmUrl);
            const response = await fetch(wasmUrl, { referrerPolicy: 'no-referrer' });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const buffer = await response.arrayBuffer();
            return buffer;
        } catch (err) {
            console.error('[YouTube Fiddle Looper Inject] WASM fetch error:', err);
            return null;
        }
    }

    async function initAudio(workletUrl, wasmUrl) {
        const video = getTargetVideo();
        if (!video) return;
        if (currentVideoElement === video && audioCtx && workletNode) return;
        currentVideoElement = video;

        console.log('[YouTube Fiddle Looper Inject] Initializing AudioContext in main page world...');

        try {
            if (!audioCtx) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                audioCtx = new AudioContextClass();
            }

            ensureAudioContextResumed();

            window.addEventListener('click', ensureAudioContextResumed, { capture: true });
            window.addEventListener('keydown', ensureAudioContextResumed, { capture: true });
            video.addEventListener('play', ensureAudioContextResumed);

            if (!video._mediaSourceNode) {
                video._mediaSourceNode = audioCtx.createMediaElementSource(video);
            }
            mediaSourceNode = video._mediaSourceNode;

            await audioCtx.audioWorklet.addModule(workletUrl);
            workletNode = new AudioWorkletNode(audioCtx, 'rubberband-processor');

            // Fetch WASM ArrayBuffer in inject.js to bypass referrer policy restrictions
            const wasmBuffer = await fetchWasmBuffer(wasmUrl);
            if (wasmBuffer) {
                workletNode.port.postMessage({
                    type: 'INIT_WASM',
                    wasmBuffer: wasmBuffer
                }, [wasmBuffer]);
            } else {
                workletNode.port.postMessage({
                    type: 'INIT_WASM',
                    wasmUrl: wasmUrl
                });
            }

            sendPitchToWorklet(currentPitch, currentCents);

            workletNode.port.onmessage = (event) => {
                if (event.data && event.data.type === 'WASM_READY') {
                    console.log('[YouTube Fiddle Looper Inject] Worklet Wasm ready.');
                    sendPitchToWorklet(currentPitch, currentCents);
                }
            };

            routeAudio();

            // Observe video src & player container for ads
            const srcObserver = new MutationObserver(() => routeAudio());
            srcObserver.observe(video, { attributes: true, attributeFilter: ['src'] });

            const playerContainer = document.querySelector('#movie_player');
            if (playerContainer) {
                const adObserver = new MutationObserver(() => routeAudio());
                adObserver.observe(playerContainer, { attributes: true, attributeFilter: ['class'] });
            }

        } catch (err) {
            console.error('[YouTube Fiddle Looper Inject] Audio init error:', err);
            if (mediaSourceNode && audioCtx) {
                try {
                    mediaSourceNode.disconnect();
                    mediaSourceNode.connect(audioCtx.destination);
                } catch (e) {}
            }
        }
    }

    function routeAudio() {
        if (!mediaSourceNode || !audioCtx) return;

        const playerContainer = document.querySelector('#movie_player');
        const adShowing = playerContainer && playerContainer.classList.contains('ad-showing');

        const src = currentVideoElement ? currentVideoElement.src : '';
        const isAd = adShowing || (src.includes('googlevideo.com/videoplayback') === false && !src.startsWith('blob:') && src !== '');

        if (isAd) {
            if (isWorkletConnected) {
                mediaSourceNode.disconnect();
                if (workletNode) workletNode.disconnect();
                mediaSourceNode.connect(audioCtx.destination);
                isWorkletConnected = false;
                console.log('[YouTube Fiddle Looper Inject] Pre-roll ad detected: Bypassing Worklet.');
            }
        } else {
            if (!isWorkletConnected && workletNode) {
                mediaSourceNode.disconnect();
                mediaSourceNode.connect(workletNode);
                workletNode.connect(audioCtx.destination);
                isWorkletConnected = true;
                console.log('[YouTube Fiddle Looper Inject] Main video active: Routing audio through AudioWorklet.');
            } else if (!isWorkletConnected && !workletNode) {
                mediaSourceNode.disconnect();
                mediaSourceNode.connect(audioCtx.destination);
            }
        }
    }

    function sendPitchToWorklet(pitch, cents) {
        currentPitch = pitch;
        currentCents = cents;
        if (workletNode) {
            workletNode.port.postMessage({
                type: 'SET_PITCH',
                pitch: currentPitch,
                cents: currentCents
            });
            console.log('[YouTube Fiddle Looper Inject] Sent pitch to worklet:', currentPitch, 'st,', currentCents, 'ct');
        }
    }

    // Listen for window messages from content.js
    window.addEventListener('message', (event) => {
        if (event.data && event.data.source === 'FIDDLE_LOOPER_CS') {
            if (event.data.type === 'INIT_AUDIO') {
                initAudio(event.data.workletUrl, event.data.wasmUrl);
            } else if (event.data.type === 'SET_PITCH') {
                ensureAudioContextResumed();
                sendPitchToWorklet(event.data.pitch, event.data.cents);
            } else if (event.data.type === 'RESUME_AUDIO') {
                ensureAudioContextResumed();
            }
        }
    });

    // Check periodically if video node is ready to initialize
    setInterval(() => {
        const video = getTargetVideo();
        if (video && video !== currentVideoElement && audioCtx) {
            routeAudio();
        }
    }, 1000);

})();
