"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PeerScore = void 0;
const peer_score_params_1 = require("./peer-score-params");
const compute_score_1 = require("./compute-score");
const message_deliveries_1 = require("./message-deliveries");
const peer_id_1 = __importDefault(require("peer-id"));
const debug_1 = __importDefault(require("debug"));
const types_1 = require("../types");
const log = (0, debug_1.default)('libp2p:gossipsub:score');
class PeerScore {
    constructor(params, connectionManager, metrics, opts) {
        this.params = params;
        this.connectionManager = connectionManager;
        this.metrics = metrics;
        /**
         * Per-peer stats for score calculation
         */
        this.peerStats = new Map();
        /**
         * IP colocation tracking; maps IP => set of peers.
         */
        this.peerIPs = new Map();
        /**
         * Cache score up to decayInterval if topic stats are unchanged.
         */
        this.scoreCache = new Map();
        /**
         * Recent message delivery timing/participants
         */
        this.deliveryRecords = new message_deliveries_1.MessageDeliveries();
        (0, peer_score_params_1.validatePeerScoreParams)(params);
        this.scoreCacheValidityMs = opts.scoreCacheValidityMs;
    }
    get size() {
        return this.peerStats.size;
    }
    /**
     * Start PeerScore instance
     */
    start() {
        if (this._backgroundInterval) {
            log('Peer score already running');
            return;
        }
        this._backgroundInterval = setInterval(() => this.background(), this.params.decayInterval);
        log('started');
    }
    /**
     * Stop PeerScore instance
     */
    stop() {
        if (!this._backgroundInterval) {
            log('Peer score already stopped');
            return;
        }
        clearInterval(this._backgroundInterval);
        delete this._backgroundInterval;
        this.peerIPs.clear();
        this.peerStats.clear();
        this.deliveryRecords.clear();
        log('stopped');
    }
    /**
     * Periodic maintenance
     */
    background() {
        this.refreshScores();
        this.updateIPs();
        this.deliveryRecords.gc();
    }
    dumpPeerScoreStats() {
        return Object.fromEntries(Array.from(this.peerStats.entries()).map(([peer, stats]) => [peer, stats]));
    }
    /**
     * Decays scores, and purges score records for disconnected peers once their expiry has elapsed.
     */
    refreshScores() {
        const now = Date.now();
        const decayToZero = this.params.decayToZero;
        this.peerStats.forEach((pstats, id) => {
            if (!pstats.connected) {
                // has the retention perious expired?
                if (now > pstats.expire) {
                    // yes, throw it away (but clean up the IP tracking first)
                    this.removeIPs(id, pstats.ips);
                    this.peerStats.delete(id);
                    this.scoreCache.delete(id);
                }
                // we don't decay retained scores, as the peer is not active.
                // this way the peer cannot reset a negative score by simply disconnecting and reconnecting,
                // unless the retention period has ellapsed.
                // similarly, a well behaved peer does not lose its score by getting disconnected.
                return;
            }
            Object.entries(pstats.topics).forEach(([topic, tstats]) => {
                const tparams = this.params.topics[topic];
                if (!tparams) {
                    // we are not scoring this topic
                    // should be unreachable, we only add scored topics to pstats
                    return;
                }
                // decay counters
                tstats.firstMessageDeliveries *= tparams.firstMessageDeliveriesDecay;
                if (tstats.firstMessageDeliveries < decayToZero) {
                    tstats.firstMessageDeliveries = 0;
                }
                tstats.meshMessageDeliveries *= tparams.meshMessageDeliveriesDecay;
                if (tstats.meshMessageDeliveries < decayToZero) {
                    tstats.meshMessageDeliveries = 0;
                }
                tstats.meshFailurePenalty *= tparams.meshFailurePenaltyDecay;
                if (tstats.meshFailurePenalty < decayToZero) {
                    tstats.meshFailurePenalty = 0;
                }
                tstats.invalidMessageDeliveries *= tparams.invalidMessageDeliveriesDecay;
                if (tstats.invalidMessageDeliveries < decayToZero) {
                    tstats.invalidMessageDeliveries = 0;
                }
                // update mesh time and activate mesh message delivery parameter if need be
                if (tstats.inMesh) {
                    tstats.meshTime = now - tstats.graftTime;
                    if (tstats.meshTime > tparams.meshMessageDeliveriesActivation) {
                        tstats.meshMessageDeliveriesActive = true;
                    }
                }
            });
            // decay P7 counter
            pstats.behaviourPenalty *= this.params.behaviourPenaltyDecay;
            if (pstats.behaviourPenalty < decayToZero) {
                pstats.behaviourPenalty = 0;
            }
        });
    }
    /**
     * Return the score for a peer
     */
    score(id) {
        this.metrics?.scoreFnCalls.inc();
        const pstats = this.peerStats.get(id);
        if (!pstats) {
            return 0;
        }
        const now = Date.now();
        const cacheEntry = this.scoreCache.get(id);
        // Found cached score within validity period
        if (cacheEntry && cacheEntry.cacheUntil > now) {
            return cacheEntry.score;
        }
        this.metrics?.scoreFnRuns.inc();
        const score = (0, compute_score_1.computeScore)(id, pstats, this.params, this.peerIPs);
        const cacheUntil = now + this.scoreCacheValidityMs;
        if (cacheEntry) {
            this.metrics?.scoreCachedDelta.observe(Math.abs(score - cacheEntry.score));
            cacheEntry.score = score;
            cacheEntry.cacheUntil = cacheUntil;
        }
        else {
            this.scoreCache.set(id, { score, cacheUntil });
        }
        return score;
    }
    /**
     * Apply a behavioural penalty to a peer
     */
    addPenalty(id, penalty, penaltyLabel) {
        const pstats = this.peerStats.get(id);
        if (!pstats) {
            return;
        }
        pstats.behaviourPenalty += penalty;
        this.metrics?.onScorePenalty(penaltyLabel);
    }
    addPeer(id) {
        // create peer stats (not including topic stats for each topic to be scored)
        // topic stats will be added as needed
        const pstats = {
            connected: true,
            expire: 0,
            topics: {},
            ips: [],
            behaviourPenalty: 0
        };
        this.peerStats.set(id, pstats);
        // get + update peer IPs
        const ips = this.getIPs(id);
        this.setIPs(id, ips, pstats.ips);
        pstats.ips = ips;
    }
    removePeer(id) {
        const pstats = this.peerStats.get(id);
        if (!pstats) {
            return;
        }
        // decide whether to retain the score; this currently only retains non-positive scores
        // to dissuade attacks on the score function.
        if (this.score(id) > 0) {
            this.removeIPs(id, pstats.ips);
            this.peerStats.delete(id);
            return;
        }
        // furthermore, when we decide to retain the score, the firstMessageDelivery counters are
        // reset to 0 and mesh delivery penalties applied.
        Object.entries(pstats.topics).forEach(([topic, tstats]) => {
            tstats.firstMessageDeliveries = 0;
            const threshold = this.params.topics[topic].meshMessageDeliveriesThreshold;
            if (tstats.inMesh && tstats.meshMessageDeliveriesActive && tstats.meshMessageDeliveries < threshold) {
                const deficit = threshold - tstats.meshMessageDeliveries;
                tstats.meshFailurePenalty += deficit * deficit;
            }
            tstats.inMesh = false;
        });
        pstats.connected = false;
        pstats.expire = Date.now() + this.params.retainScore;
    }
    /** Handles scoring functionality as a peer GRAFTs to a topic. */
    graft(id, topic) {
        const pstats = this.peerStats.get(id);
        if (pstats) {
            const tstats = this.getPtopicStats(pstats, topic);
            if (tstats) {
                // if we are scoring the topic, update the mesh status.
                tstats.inMesh = true;
                tstats.graftTime = Date.now();
                tstats.meshTime = 0;
                tstats.meshMessageDeliveriesActive = false;
            }
        }
    }
    /** Handles scoring functionality as a peer PRUNEs from a topic. */
    prune(id, topic) {
        const pstats = this.peerStats.get(id);
        if (pstats) {
            const tstats = this.getPtopicStats(pstats, topic);
            if (tstats) {
                // sticky mesh delivery rate failure penalty
                const threshold = this.params.topics[topic].meshMessageDeliveriesThreshold;
                if (tstats.meshMessageDeliveriesActive && tstats.meshMessageDeliveries < threshold) {
                    const deficit = threshold - tstats.meshMessageDeliveries;
                    tstats.meshFailurePenalty += deficit * deficit;
                }
                tstats.meshMessageDeliveriesActive = false;
                tstats.inMesh = false;
                // TODO: Consider clearing score cache on important penalties
                // this.scoreCache.delete(id)
            }
        }
    }
    validateMessage(msgIdStr) {
        this.deliveryRecords.ensureRecord(msgIdStr);
    }
    deliverMessage(from, msgIdStr, topic) {
        this.markFirstMessageDelivery(from, topic);
        const drec = this.deliveryRecords.ensureRecord(msgIdStr);
        const now = Date.now();
        // defensive check that this is the first delivery trace -- delivery status should be unknown
        if (drec.status !== message_deliveries_1.DeliveryRecordStatus.unknown) {
            log('unexpected delivery: message from %s was first seen %s ago and has delivery status %d', from, now - drec.firstSeen, message_deliveries_1.DeliveryRecordStatus[drec.status]);
            return;
        }
        // mark the message as valid and reward mesh peers that have already forwarded it to us
        drec.status = message_deliveries_1.DeliveryRecordStatus.valid;
        drec.validated = now;
        drec.peers.forEach((p) => {
            // this check is to make sure a peer can't send us a message twice and get a double count
            // if it is a first delivery.
            if (p !== from) {
                this.markDuplicateMessageDelivery(p, topic);
            }
        });
    }
    /**
     * Similar to `rejectMessage` except does not require the message id or reason for an invalid message.
     */
    rejectInvalidMessage(from, topic) {
        this.markInvalidMessageDelivery(from, topic);
    }
    rejectMessage(from, msgIdStr, topic, reason) {
        switch (reason) {
            // these messages are not tracked, but the peer is penalized as they are invalid
            case types_1.RejectReason.Error:
                this.markInvalidMessageDelivery(from, topic);
                return;
            // we ignore those messages, so do nothing.
            case types_1.RejectReason.Blacklisted:
                return;
            // the rest are handled after record creation
        }
        const drec = this.deliveryRecords.ensureRecord(msgIdStr);
        // defensive check that this is the first rejection -- delivery status should be unknown
        if (drec.status !== message_deliveries_1.DeliveryRecordStatus.unknown) {
            log('unexpected rejection: message from %s was first seen %s ago and has delivery status %d', from, Date.now() - drec.firstSeen, message_deliveries_1.DeliveryRecordStatus[drec.status]);
            return;
        }
        if (reason === types_1.RejectReason.Ignore) {
            // we were explicitly instructed by the validator to ignore the message but not penalize the peer
            drec.status = message_deliveries_1.DeliveryRecordStatus.ignored;
            drec.peers.clear();
            return;
        }
        // mark the message as invalid and penalize peers that have already forwarded it.
        drec.status = message_deliveries_1.DeliveryRecordStatus.invalid;
        this.markInvalidMessageDelivery(from, topic);
        drec.peers.forEach((p) => {
            this.markInvalidMessageDelivery(p, topic);
        });
        // release the delivery time tracking map to free some memory early
        drec.peers.clear();
    }
    duplicateMessage(from, msgIdStr, topic) {
        const drec = this.deliveryRecords.ensureRecord(msgIdStr);
        if (drec.peers.has(from)) {
            // we have already seen this duplicate
            return;
        }
        switch (drec.status) {
            case message_deliveries_1.DeliveryRecordStatus.unknown:
                // the message is being validated; track the peer delivery and wait for
                // the Deliver/Reject/Ignore notification.
                drec.peers.add(from);
                break;
            case message_deliveries_1.DeliveryRecordStatus.valid:
                // mark the peer delivery time to only count a duplicate delivery once.
                drec.peers.add(from);
                this.markDuplicateMessageDelivery(from, topic, drec.validated);
                break;
            case message_deliveries_1.DeliveryRecordStatus.invalid:
                // we no longer track delivery time
                this.markInvalidMessageDelivery(from, topic);
                break;
            case message_deliveries_1.DeliveryRecordStatus.ignored:
                // the message was ignored; do nothing (we don't know if it was valid)
                break;
        }
    }
    /**
     * Increments the "invalid message deliveries" counter for all scored topics the message is published in.
     */
    markInvalidMessageDelivery(from, topic) {
        const pstats = this.peerStats.get(from);
        if (pstats) {
            const tstats = this.getPtopicStats(pstats, topic);
            if (tstats) {
                tstats.invalidMessageDeliveries += 1;
            }
        }
    }
    /**
     * Increments the "first message deliveries" counter for all scored topics the message is published in,
     * as well as the "mesh message deliveries" counter, if the peer is in the mesh for the topic.
     * Messages already known (with the seenCache) are counted with markDuplicateMessageDelivery()
     */
    markFirstMessageDelivery(from, topic) {
        const pstats = this.peerStats.get(from);
        if (pstats) {
            const tstats = this.getPtopicStats(pstats, topic);
            if (tstats) {
                let cap = this.params.topics[topic].firstMessageDeliveriesCap;
                tstats.firstMessageDeliveries = Math.max(cap, tstats.firstMessageDeliveries + 1);
                if (tstats.inMesh) {
                    cap = this.params.topics[topic].meshMessageDeliveriesCap;
                    tstats.meshMessageDeliveries = Math.max(cap, tstats.meshMessageDeliveries + 1);
                }
            }
        }
    }
    /**
     * Increments the "mesh message deliveries" counter for messages we've seen before,
     * as long the message was received within the P3 window.
     */
    markDuplicateMessageDelivery(from, topic, validatedTime) {
        const pstats = this.peerStats.get(from);
        if (pstats) {
            const now = validatedTime !== undefined ? Date.now() : 0;
            const tstats = this.getPtopicStats(pstats, topic);
            if (tstats) {
                if (tstats.inMesh) {
                    const tparams = this.params.topics[topic];
                    // check against the mesh delivery window -- if the validated time is passed as 0, then
                    // the message was received before we finished validation and thus falls within the mesh
                    // delivery window.
                    if (validatedTime && now > validatedTime + tparams.meshMessageDeliveriesWindow) {
                        return;
                    }
                    const cap = tparams.meshMessageDeliveriesCap;
                    tstats.meshMessageDeliveries = Math.min(cap, tstats.meshMessageDeliveries + 1);
                }
            }
        }
    }
    /**
     * Gets the current IPs for a peer.
     */
    getIPs(id) {
        // TODO: Optimize conversions
        const peerId = peer_id_1.default.createFromB58String(id);
        // PeerId.createFromB58String(id)
        return this.connectionManager.getAll(peerId).map((c) => c.remoteAddr.toOptions().host);
    }
    /**
     * Adds tracking for the new IPs in the list, and removes tracking from the obsolete IPs.
     */
    setIPs(id, newIPs, oldIPs) {
        // add the new IPs to the tracking
        // eslint-disable-next-line no-labels
        addNewIPs: for (const ip of newIPs) {
            // check if it is in the old ips list
            for (const xip of oldIPs) {
                if (ip === xip) {
                    // eslint-disable-next-line no-labels
                    continue addNewIPs;
                }
            }
            // no, it's a new one -- add it to the tracker
            let peers = this.peerIPs.get(ip);
            if (!peers) {
                peers = new Set();
                this.peerIPs.set(ip, peers);
            }
            peers.add(id);
        }
        // remove the obsolete old IPs from the tracking
        // eslint-disable-next-line no-labels
        removeOldIPs: for (const ip of oldIPs) {
            // check if it is in the new ips list
            for (const xip of newIPs) {
                if (ip === xip) {
                    // eslint-disable-next-line no-labels
                    continue removeOldIPs;
                }
            }
            // no, its obselete -- remove it from the tracker
            const peers = this.peerIPs.get(ip);
            if (!peers) {
                continue;
            }
            peers.delete(id);
            if (!peers.size) {
                this.peerIPs.delete(ip);
            }
        }
    }
    /**
     * Removes an IP list from the tracking list for a peer.
     */
    removeIPs(id, ips) {
        ips.forEach((ip) => {
            const peers = this.peerIPs.get(ip);
            if (!peers) {
                return;
            }
            peers.delete(id);
            if (!peers.size) {
                this.peerIPs.delete(ip);
            }
        });
    }
    /**
     * Update all peer IPs to currently open connections
     */
    updateIPs() {
        this.peerStats.forEach((pstats, id) => {
            const newIPs = this.getIPs(id);
            this.setIPs(id, newIPs, pstats.ips);
            pstats.ips = newIPs;
        });
    }
    /**
     * Returns topic stats if they exist, otherwise if the supplied parameters score the
     * topic, inserts the default stats and returns a reference to those. If neither apply, returns None.
     */
    getPtopicStats(pstats, topic) {
        let topicStats = pstats.topics[topic];
        if (topicStats) {
            return topicStats;
        }
        if (this.params.topics[topic]) {
            topicStats = {
                inMesh: false,
                graftTime: 0,
                meshTime: 0,
                firstMessageDeliveries: 0,
                meshMessageDeliveries: 0,
                meshMessageDeliveriesActive: false,
                meshFailurePenalty: 0,
                invalidMessageDeliveries: 0
            };
            pstats.topics[topic] = topicStats;
            return topicStats;
        }
        return null;
    }
}
exports.PeerScore = PeerScore;
//# sourceMappingURL=peer-score.js.map