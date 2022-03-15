"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleTimeCache = void 0;
/**
 * This is similar to https://github.com/daviddias/time-cache/blob/master/src/index.js
 * for our own need, we don't use lodash throttle to improve performance.
 * This gives 4x - 5x performance gain compared to npm TimeCache
 */
class SimpleTimeCache {
    constructor(options) {
        this.entries = new Map();
        this.lastPruneTime = 0;
        this.validityMs = options.validityMs;
        // allow negative validityMs so that this does not cache anything, spec test compliance.spec.js
        // sends duplicate messages and expect peer to receive all. Application likely uses positive validityMs
    }
    get size() {
        return this.entries.size;
    }
    put(key, value) {
        this.entries.set(key, { value, validUntilMs: Date.now() + this.validityMs });
        this.prune();
    }
    prune() {
        const now = Date.now();
        if (now - this.lastPruneTime < 200) {
            return;
        }
        this.lastPruneTime = now;
        for (const [k, v] of this.entries.entries()) {
            if (v.validUntilMs < now) {
                this.entries.delete(k);
            }
            else {
                // sort by insertion order
                break;
            }
        }
    }
    has(key) {
        return this.entries.has(key);
    }
    get(key) {
        const value = this.entries.get(key);
        return value && value.validUntilMs >= Date.now() ? value.value : undefined;
    }
    clear() {
        this.entries = new Map();
        this.lastPruneTime = 0;
    }
}
exports.SimpleTimeCache = SimpleTimeCache;
//# sourceMappingURL=time-cache.js.map