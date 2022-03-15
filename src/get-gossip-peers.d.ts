import Gossipsub from './index';
/**
 * Given a topic, returns up to count peers subscribed to that topic
 * that pass an optional filter function
 *
 * @param filter a function to filter acceptable peers
 */
export declare function getRandomGossipPeers(router: Gossipsub, topic: string, count: number, filter?: (id: string) => boolean): Set<string>;
//# sourceMappingURL=get-gossip-peers.d.ts.map