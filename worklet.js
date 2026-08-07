class RubberbandProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.pitchSemitones = 0;
        this.pitchCents = 0;
        this.pitchRatio = 1.0;
        this.wasmInstance = null;
        this.isWasmLoaded = false;

        // WSOLA (Waveform Similarity Overlap-Add) Pitch Shifter Parameters
        this.bufferLen = 65536;
        this.grainSize = 1024;  // ~23ms grain window at 44.1kHz for natural acoustic response
        this.halfGrain = 512;
        this.searchRange = 48;  // ±48 sample correlation search range

        // Per-channel state
        this.ringBuffers = [];
        this.wPos = [];
        this.phase = [];
        this.offset1 = [];
        this.offset2 = [];

        this.port.onmessage = async (event) => {
            if (!event.data) return;

            if (event.data.type === 'INIT_WASM') {
                if (event.data.wasmBuffer) {
                    await this.initWasmFromBuffer(event.data.wasmBuffer);
                } else if (event.data.wasmUrl) {
                    await this.initWasmFromUrl(event.data.wasmUrl);
                }
            } else if (event.data.type === 'SET_PITCH') {
                this.pitchSemitones = parseFloat(event.data.pitch) || 0;
                this.pitchCents = parseFloat(event.data.cents) || 0;

                const totalSemitones = this.pitchSemitones + (this.pitchCents / 100);
                this.pitchRatio = Math.pow(2, totalSemitones / 12);

                console.log(`[RubberbandProcessor] WSOLA Pitch updated: ${this.pitchSemitones} st, ${this.pitchCents} ct (Ratio: ${this.pitchRatio.toFixed(4)})`);
            }
        };
    }

    async initWasmFromBuffer(bytes) {
        try {
            console.log('[RubberbandProcessor] Initializing Wasm module from ArrayBuffer...');
            const wasmModule = await WebAssembly.instantiate(bytes, {
                env: {
                    memory: new WebAssembly.Memory({ initial: 256 }),
                    abort: () => console.error('[RubberbandProcessor] Wasm aborted')
                }
            });

            this.wasmInstance = wasmModule.instance;
            this.isWasmLoaded = true;
            console.log('[RubberbandProcessor] Rubber Band Wasm initialized successfully from ArrayBuffer.');
            this.port.postMessage({ type: 'WASM_READY' });
        } catch (err) {
            this.isWasmLoaded = false;
        }
    }

    async initWasmFromUrl(wasmUrl) {
        try {
            console.log('[RubberbandProcessor] Fetching Wasm module from URL:', wasmUrl);
            const response = await fetch(wasmUrl, { referrerPolicy: 'no-referrer' });
            const bytes = await response.arrayBuffer();

            const wasmModule = await WebAssembly.instantiate(bytes, {
                env: {
                    memory: new WebAssembly.Memory({ initial: 256 }),
                    abort: () => console.error('[RubberbandProcessor] Wasm aborted')
                }
            });

            this.wasmInstance = wasmModule.instance;
            this.isWasmLoaded = true;
            console.log('[RubberbandProcessor] Rubber Band Wasm initialized successfully from URL.');
            this.port.postMessage({ type: 'WASM_READY' });
        } catch (err) {
            this.isWasmLoaded = false;
        }
    }

    initChannels(numChannels) {
        while (this.ringBuffers.length < numChannels) {
            this.ringBuffers.push(new Float32Array(this.bufferLen));
            this.wPos.push(0);
            this.phase.push(0);
            this.offset1.push(0);
            this.offset2.push(0);
        }
    }

    getInterpolatedSample(ring, pos) {
        let p = pos % this.bufferLen;
        if (p < 0) p += this.bufferLen;
        let idx = Math.floor(p);
        let nextIdx = (idx + 1) % this.bufferLen;
        let frac = p - idx;
        return ring[idx] * (1 - frac) + ring[nextIdx] * frac;
    }

    // Find optimal phase-aligned offset using Cross-Correlation
    findBestOffset(ring, referencePos, targetBasePos) {
        let bestOffset = targetBasePos;
        let maxCorr = -Infinity;

        for (let k = -this.searchRange; k <= this.searchRange; k += 2) {
            let candidatePos = targetBasePos + k;
            let corr = 0;

            for (let j = 0; j < 32; j += 2) {
                let refSample = this.getInterpolatedSample(ring, referencePos + j);
                let candSample = this.getInterpolatedSample(ring, candidatePos + j);
                corr += refSample * candSample;
            }

            if (corr > maxCorr) {
                maxCorr = corr;
                bestOffset = candidatePos;
            }
        }

        return bestOffset;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];

        if (!input || input.length === 0) return true;
        const numChannels = input.length;
        this.initChannels(numChannels);

        // 100% untouched 1:1 pass-through when pitch is 0 (0 st, 0 ct)
        if (Math.abs(this.pitchRatio - 1.0) < 0.0001) {
            for (let channel = 0; channel < numChannels; ++channel) {
                const inCh = input[channel];
                const outCh = output[channel];
                if (outCh && inCh) {
                    outCh.set(inCh);
                }
            }
            return true;
        }

        const frameLen = input[0].length;
        const N = this.grainSize;
        const H = this.halfGrain;
        const P = this.pitchRatio;

        for (let channel = 0; channel < numChannels; ++channel) {
            const inCh = input[channel];
            const outCh = output[channel];
            if (!inCh || !outCh) continue;

            const ring = this.ringBuffers[channel];
            let wp = this.wPos[channel];
            let ph = this.phase[channel];
            let off1 = this.offset1[channel];
            let off2 = this.offset2[channel];

            for (let i = 0; i < frameLen; i++) {
                ring[wp] = inCh[i];

                // Phase-aligned WSOLA grain reset at zero-crossings
                if (ph === 0) {
                    let refPos = off2 + H * P;
                    off1 = this.findBestOffset(ring, refPos, wp - H);
                }
                if (ph === H) {
                    let refPos = off1 + H * P;
                    off2 = this.findBestOffset(ring, refPos, wp - H);
                }

                // Compute grain read positions
                let pos1 = off1 + ph * P;
                let pos2 = off2 + ((ph + H) % N) * P;

                // Smooth Hann windowing (w1 + w2 = 1.0)
                let w1 = 0.5 * (1.0 - Math.cos((2.0 * Math.PI * ph) / N));
                let w2 = 1.0 - w1;

                let sample1 = this.getInterpolatedSample(ring, pos1);
                let sample2 = this.getInterpolatedSample(ring, pos2);

                outCh[i] = w1 * sample1 + w2 * sample2;

                wp = (wp + 1) % this.bufferLen;
                ph = (ph + 1) % N;
            }

            this.wPos[channel] = wp;
            this.phase[channel] = ph;
            this.offset1[channel] = off1;
            this.offset2[channel] = off2;
        }

        return true;
    }
}

registerProcessor('rubberband-processor', RubberbandProcessor);
