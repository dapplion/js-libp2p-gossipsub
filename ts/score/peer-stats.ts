import { TopicStr } from '../types'

export type PeerStats = {
  /** true if the peer is currently connected */
  connected: boolean
  /** expiration time of the score stats for disconnected peers */
  expire: number
  /** per topic stats */
  topics: Record<TopicStr, TopicStats>
  /** IP tracking; store as string for easy processing */
  ips: string[]
  /** behavioural pattern penalties (applied by the router) */
  behaviourPenalty: number
}

export type TopicStats = {
  /** true if the peer is in the mesh */
  inMesh: boolean
  /** time when the peer was (last) GRAFTed; valid only when in mesh */
  graftTime: number
  /** time in mesh (updated during refresh/decay to avoid calling gettimeofday on every score invocation) */
  meshTime: number
  /** first message deliveries */
  firstMessageDeliveries: number
  /** mesh message deliveries */
  meshMessageDeliveries: number
  /** true if the peer has been enough time in the mesh to activate mess message deliveries */
  meshMessageDeliveriesActive: boolean
  /** sticky mesh rate failure penalty counter */
  meshFailurePenalty: number
  /** invalid message counter */
  invalidMessageDeliveries: number
}
