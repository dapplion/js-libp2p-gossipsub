/// <reference types="node" />
import { PeerScoreParams } from './peer-score-params';
import { PeerStats } from './peer-stats';
import { MessageDeliveries } from './message-deliveries';
import ConnectionManager from 'libp2p/src/connection-manager';
import { MsgIdStr, PeerIdStr, RejectReason, TopicStr } from '../types';
import { Metrics, ScorePenalty } from '../metrics';
declare type IPStr = string;
interface ScoreCacheEntry {
    /** The cached score, null if not cached */
    score: number | null;
    /** Unix timestamp in miliseconds, the time after which the cached score for a peer is no longer valid */
    cacheUntil: number;
}
export declare class PeerScore {
    readonly params: PeerScoreParams;
    private readonly connectionManager;
    private readonly metrics;
    /**
     * Per-peer stats for score calculation
     */
    readonly peerStats: Map<PeerIdStr, PeerStats>;
    /**
     * IP colocation tracking; maps IP => set of peers.
     */
    readonly peerIPs: Map<PeerIdStr, Set<IPStr>>;
    /**
     * Cache score up to decayInterval if topic stats are unchanged.
     */
    readonly scoreCache: Map<PeerIdStr, ScoreCacheEntry>;
    /**
     * Recent message delivery timing/participants
     */
    readonly deliveryRecords: MessageDeliveries;
    _backgroundInterval?: NodeJS.Timeout;
    constructor(params: PeerScoreParams, connectionManager: ConnectionManager, metrics: Metrics | null);
    get size(): number;
    /**
     * Start PeerScore instance
     */
    start(): void;
    /**
     * Stop PeerScore instance
     */
    stop(): void;
    /**
     * Periodic maintenance
     */
    background(): void;
    /**
     * Decays scores, and purges score records for disconnected peers once their expiry has elapsed.
     */
    _refreshScores(): void;
    /**
     * Return the score for a peer
     */
    score(id: PeerIdStr): number;
    /**
     * Apply a behavioural penalty to a peer
     */
    addPenalty(id: PeerIdStr, penalty: number, penaltyLabel: ScorePenalty): void;
    addPeer(id: PeerIdStr): void;
    removePeer(id: PeerIdStr): void;
    graft(id: PeerIdStr, topic: TopicStr): void;
    prune(id: PeerIdStr, topic: TopicStr): void;
    validateMessage(msgIdStr: MsgIdStr): void;
    deliverMessage(from: PeerIdStr, msgIdStr: MsgIdStr, topic: TopicStr): void;
    /**
     * Similar to `rejectMessage` except does not require the message id or reason for an invalid message.
     */
    rejectInvalidMessage(from: PeerIdStr, topic: TopicStr): void;
    rejectMessage(from: PeerIdStr, msgIdStr: MsgIdStr, topic: TopicStr, reason: RejectReason): void;
    duplicateMessage(from: PeerIdStr, msgIdStr: MsgIdStr, topic: TopicStr): void;
    /**
     * Increments the "invalid message deliveries" counter for all scored topics the message is published in.
     */
    _markInvalidMessageDelivery(from: PeerIdStr, topic: TopicStr): void;
    /**
     * Increments the "first message deliveries" counter for all scored topics the message is published in,
     * as well as the "mesh message deliveries" counter, if the peer is in the mesh for the topic.
     */
    _markFirstMessageDelivery(from: PeerIdStr, topic: TopicStr): void;
    /**
     * Increments the "mesh message deliveries" counter for messages we've seen before,
     * as long the message was received within the P3 window.
     */
    _markDuplicateMessageDelivery(from: PeerIdStr, topic: TopicStr, validatedTime?: number): void;
    /**
     * Gets the current IPs for a peer.
     */
    _getIPs(id: PeerIdStr): IPStr[];
    /**
     * Adds tracking for the new IPs in the list, and removes tracking from the obsolete IPs.
     */
    _setIPs(id: PeerIdStr, newIPs: IPStr[], oldIPs: IPStr[]): void;
    /**
     * Removes an IP list from the tracking list for a peer.
     */
    _removeIPs(id: PeerIdStr, ips: IPStr[]): void;
    /**
     * Update all peer IPs to currently open connections
     */
    _updateIPs(): void;
}
export {};
//# sourceMappingURL=peer-score.d.ts.map