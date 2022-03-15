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
    constructor() {
        /**
         * Promises to deliver a message
         * Map per message id, per peer, promise expiration time
         */
        this.promises = new Map();
    }
    get size() {
        return this.promises.size;
    }
    /**
     * Track a promise to deliver a message from a list of msgIds we are requesting
     */
    addPromise(from, msgIds) {
        // pick msgId randomly from the list
        const ix = Math.floor(Math.random() * msgIds.length);
        const msgId = msgIds[ix];
        const msgIdStr = (0, utils_1.messageIdToString)(msgId);
        let peers = this.promises.get(msgIdStr);
        if (!peers) {
            peers = new Map();
            this.promises.set(msgIdStr, peers);
        }
        // If a promise for this message id and peer already exists we don't update the expiry
        if (!peers.has(from)) {
            peers.set(from, Date.now() + constants_1.GossipsubIWantFollowupTime);
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
        this.promises.forEach((peers, msgId) => {
            peers.forEach((expire, p) => {
                // the promise has been broken
                if (expire < now) {
                    // add 1 to result
                    result.set(p, (result.get(p) || 0) + 1);
                    // delete from tracked promises
                    peers.delete(p);
                }
            });
            // clean up empty promises for a msgId
            if (!peers.size) {
                this.promises.delete(msgId);
            }
        });
        return result;
    }
    /**
     * Someone delivered a message, stop tracking promises for it
     */
    deliverMessage(msgIdStr) {
        const expireByPeer = this.promises.get(msgIdStr);
        if (!expireByPeer) {
            return null;
        }
        this.promises.delete(msgIdStr);
        const now = Date.now();
        const deliversMs = [];
        for (const expire of expireByPeer.values()) {
            // time_requested = expire - GossipsubIWantFollowupTime
            // time_elapsed = now - time_requested
            deliversMs.push(now - expire - constants_1.GossipsubIWantFollowupTime);
        }
        return { requestedCount: expireByPeer.size, deliversMs };
    }
    /**
     * A message got rejected, so we can stop tracking promises and let the score penalty apply from invalid message delivery,
     * unless its an obviously invalid message.
     */
    rejectMessage(msgIdStr, reason) {
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
}
exports.IWantTracer = IWantTracer;
//# sourceMappingURL=tracer.js.map