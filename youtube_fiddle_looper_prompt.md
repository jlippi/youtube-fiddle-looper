**Role:** You are an expert Chrome Extension and Web Audio API developer. 

**Task:** Scaffold a Manifest V3 Chrome Extension called `youtube-fiddle-looper`. The goal of this extension is to provide high-fidelity, real-time pitch shifting and looping for YouTube videos without altering the tempo. This will be used for practicing complex acoustic music alongside reference recordings.

**Architecture Requirements:**
To achieve high-fidelity pitch shifting, we will be using a WebAssembly (Wasm) compile of the Rubber Band Library inside an `AudioWorklet`. Because YouTube has strict Content Security Policies (CSP) and CORS restrictions, the extension must bypass these natively.

Please generate the code for the following 4 files:

**1. `manifest.json` (Manifest V3)**
*   Needs permissions for: `activeTab`, `scripting`, `declarativeNetRequest`, and `declarativeNetRequestWithHostAccess`.
*   Host permissions for `*://*.youtube.com/*`.
*   Declare a content script (`content.js`) that runs at `document_end`.
*   Expose `worklet.js` and a placeholder `rubberband.wasm` file in `web_accessible_resources` so they can be loaded by the YouTube page.
*   Register a `declarative_net_request` ruleset pointing to `rules.json`.

**2. `rules.json` (The CSP Bypass)**
*   Write a rule that intercepts responses from `||youtube.com`.
*   The rule must strictly remove the `content-security-policy` and `content-security-policy-report-only` headers. This is critical so the YouTube page allows the Wasm file to compile and execute via the `wasm-eval` restriction.

**3. `content.js` (The Audio Hijacker)**
*   Wait for the YouTube `<video>` element to exist in the DOM.
*   Initialize an `AudioContext` and route the video's audio using `createMediaElementSource`.
*   Use `chrome.runtime.getURL()` to securely fetch the absolute path for `worklet.js` and add it to `audioCtx.audioWorklet.addModule()`.
*   Instantiate the `AudioWorkletNode`. Pass the local URL of `rubberband.wasm` to the Worklet via `port.postMessage()`.
*   **Crucial Edge Case:** Add a MutationObserver or event listener to the video element's `src`. If the video `src` changes (e.g., to serve a pre-roll ad), temporarily disconnect the Worklet node and route the audio directly to the destination to prevent CORS tainting/muting. Reconnect the Worklet when the main video resumes.

**4. `worklet.js` (The AudioWorkletProcessor Stub)**
*   Write a basic `AudioWorkletProcessor` class.
*   Include a `message` event listener to receive the Wasm URL from `content.js` and a placeholder `fetch()` and `WebAssembly.instantiate()` block. 
*   Provide a pass-through `process()` method (input to output) with comments indicating where the Rubber Band Wasm DSP buffer processing will eventually be inserted.