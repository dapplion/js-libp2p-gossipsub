"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PeerStats = void 0;
class PeerStats {
    // eslint-disable-next-line no-useless-constructor
    constructor(params, connected) {
        this.params = params;
        /** true if the peer is currently connected */
        this.connected = false;
        /** expiration time of the score stats for disconnected peers */
        this.expire = 0;
        /** per topic stats */
        this.topics = new Map();
        /** IP tracking; store as string for easy processing */
        this.ips = [];
        /** behavioural pattern penalties (applied by the router) */
        this.behaviourPenalty = 0;
        this.connected = connected;
    }
    /**
     * Returns topic stats if they exist, otherwise if the supplied parameters score the
     * topic, inserts the default stats and returns a reference to those. If neither apply, returns None.
     */
    topicStats(topic) {
        let topicStats = this.topics.get(topic);
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
            this.topics.set(topic, topicStats);
            return topicStats;
        }
        return null;
    }
}
exports.PeerStats = PeerStats;
//# sourceMappingURL=peer-stats.js.map