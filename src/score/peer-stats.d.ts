import { TopicStr } from '../types';
import { PeerScoreParams } from './peer-score-params';
export declare type IPeerStats = {
    connected: boolean;
    expire: number;
    topics: Record<TopicStr, TopicStats>;
    ips: string[];
    behaviourPenalty: number;
};
export declare class PeerStats {
    private readonly params;
    /** true if the peer is currently connected */
    connected: boolean;
    /** expiration time of the score stats for disconnected peers */
    expire: number;
    /** per topic stats */
    topics: Map<string, TopicStats>;
    /** IP tracking; store as string for easy processing */
    ips: string[];
    /** behavioural pattern penalties (applied by the router) */
    behaviourPenalty: number;
    constructor(params: PeerScoreParams, connected: boolean);
    /**
     * Returns topic stats if they exist, otherwise if the supplied parameters score the
     * topic, inserts the default stats and returns a reference to those. If neither apply, returns None.
     */
    topicStats(topic: TopicStr): TopicStats | null;
}
export interface TopicStats {
    /** true if the peer is in the mesh */
    inMesh: boolean;
    /** time when the peer was (last) GRAFTed; valid only when in mesh */
    graftTime: number;
    /** time in mesh (updated during refresh/decay to avoid calling gettimeofday on every score invocation) */
    meshTime: number;
    /** first message deliveries */
    firstMessageDeliveries: number;
    /** mesh message deliveries */
    meshMessageDeliveries: number;
    /** true if the peer has been enough time in the mesh to activate mess message deliveries */
    meshMessageDeliveriesActive: boolean;
    /** sticky mesh rate failure penalty counter */
    meshFailurePenalty: number;
    /** invalid message counter */
    invalidMessageDeliveries: number;
}
//# sourceMappingURL=peer-stats.d.ts.map