"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IWantTracer = void 0;
const constants_1 = require("./constants");
const utils_1 = require("./utils");
const types_1 = require("./types");
/**
 * IWantTracer is an internal tracer that tracks IWANT requests in order to penalize
 * peers who don't follow up on IWANT requests after an IHAVE advertisement.
 * The tracking of promises is probabilistic to avoid using too much memory.
 *
 * Note: Do not confuse these 'promises' with JS Promise objects.
 * These 'promises' are merely expectations of a peer's behavior.
 */
class IWantTracer {
    // eslint-disable-next-line no-useless-constructor
    constructor(metrics) {
        this.metrics = metrics;
        /**
         * Promises to deliver a message
         * Map per message id, per peer, promise expiration time
         */
        this.promises = new Map();
        /**
         * First request time by msgId. Used for metrics to track expire times.
         * Necessary to know if peers are actually breaking promises or simply sending them a bit later
         */
        this.requestMsByMsg = new Map();
        this.requestMsByMsgExpire = 10 * constants_1.GossipsubIWantFollowupTime;
    }
    get size() {
        return this.promises.size;
    }
    get requestMsByMsgSize() {
        return this.requestMsByMsg.size;
    }
    /**
     * Track a promise to deliver a message from a list of msgIds we are requesting
     */
    addPromise(from, msgIds) {
        // pick msgId randomly from the list
        const ix = Math.floor(Math.random() * msgIds.length);
        const msgId = msgIds[ix];
        const msgIdStr = (0, utils_1.messageIdToString)(msgId);
        let expireByPeer = this.promises.get(msgIdStr);
        if (!expireByPeer) {
            expireByPeer = new Map();
            this.promises.set(msgIdStr, expireByPeer);
        }
        const now = Date.now();
        // If a promise for this message id and peer already exists we don't update the expiry
        if (!expireByPeer.has(from)) {
            expireByPeer.set(from, now + constants_1.GossipsubIWantFollowupTime);
            if (this.metrics) {
                this.metrics.iwantPromiseStarted.inc(1);
                if (!this.requestMsByMsg.has(msgIdStr)) {
                    this.requestMsByMsg.set(msgIdStr, now);
                }
            }
        }
    }
    /**
     * Returns the number of broken promises for each peer who didn't follow up on an IWANT request.
     *
     * This should be called not too often relative to the expire times, since it iterates over the whole data.
     */
    getBrokenPromises() {
        const now = Date.now();
        const result = new Map();
        let brokenPromises = 0;
        this.promises.forEach((expireByPeer, msgId) => {
            expireByPeer.forEach((expire, p) => {
                // the promise has been broken
                if (expire < now) {
                    // add 1 to result
                    result.set(p, (result.get(p) || 0) + 1);
                    // delete from tracked promises
                    expireByPeer.delete(p);
                    // for metrics
                    brokenPromises++;
                }
            });
            // clean up empty promises for a msgId
            if (!expireByPeer.size) {
                this.promises.delete(msgId);
            }
        });
        this.metrics?.iwantPromiseBroken.inc(brokenPromises);
        return result;
    }
    /**
     * Someone delivered a message, stop tracking promises for it
     */
    deliverMessage(msgIdStr) {
        this.trackMessage(msgIdStr);
        const expireByPeer = this.promises.get(msgIdStr);
        // Expired promise, check requestMsByMsg
        if (expireByPeer) {
            this.promises.delete(msgIdStr);
            if (this.metrics) {
                this.metrics.iwantPromiseResolved.inc(1);
                this.metrics.iwantPromiseResolvedPeers.inc(expireByPeer.size);
            }
        }
    }
    /**
     * A message got rejected, so we can stop tracking promises and let the score penalty apply from invalid message delivery,
     * unless its an obviously invalid message.
     */
    rejectMessage(msgIdStr, reason) {
        this.trackMessage(msgIdStr);
        // A message got rejected, so we can stop tracking promises and let the score penalty apply.
        // With the expection of obvious invalid messages
        switch (reason) {
            case types_1.RejectReason.Error:
                return;
        }
        this.promises.delete(msgIdStr);
    }
    clear() {
        this.promises.clear();
    }
    prune() {
        const maxMs = Date.now() - this.requestMsByMsgExpire;
        for (const [k, v] of this.requestMsByMsg.entries()) {
            if (v < maxMs) {
                this.requestMsByMsg.delete(k);
            }
            else {
                // sort by insertion order
                break;
            }
        }
    }
    trackMessage(msgIdStr) {
        if (this.metrics) {
            const requestMs = this.requestMsByMsg.get(msgIdStr);
            if (requestMs !== undefined) {
                this.metrics.iwantPromiseDeliveryTime.observe((Date.now() - requestMs) / 1000);
                this.requestMsByMsg.delete(msgIdStr);
            }
        }
    }
}
exports.IWantTracer = IWantTracer;
//# sourceMappingURL=tracer.js.map