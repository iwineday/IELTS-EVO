import { create } from "zustand"

interface User {
  id: string
  displayName: string
  level: number
  exp: number
  gold: number
  gems: number
  targetBand: number
}

interface NodeMeta {
  id: string
  skill: string
  cluster: string
  kind: string
  title: string
  subtitle: string | null
  difficulty: number
  mapX: number
  mapY: number
  rewardExp: number
  rewardGold: number
  rewardGems: number
}

interface BestAttempt {
  stars: number
  band: number | null
}

interface GameState {
  user: User | null
  nodes: Record<string, NodeMeta>
  unlocks: Set<string>
  bestAttempts: Record<string, BestAttempt>
  edges: Array<{ from: string; to: string; kind: string }>
  loading: boolean

  loadFromApi: (skill: string) => Promise<void>
  addAttempt: (nodeId: string, stars: number, band: number | null, expGain: number, goldGain: number, unlockedNodeIds?: string[]) => void
  spendGold: (amount: number) => boolean
  setTargetBand: (band: number) => void
}

export const useGameStore = create<GameState>((set, get) => ({
  user: null,
  nodes: {},
  unlocks: new Set(),
  bestAttempts: {},
  edges: [],
  loading: false,

  loadFromApi: async (skill) => {
    set({ loading: true })
    try {
      const res = await fetch(`/api/map/${skill}`)
      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = await res.json()
      set({
        user: data.user,
        nodes: Object.fromEntries(data.nodes.map((n: NodeMeta) => [n.id, n])),
        unlocks: new Set(data.unlocks as string[]),
        bestAttempts: Object.fromEntries(
          data.attempts.map((a: { nodeId: string; stars: number; band: number | null }) => [
            a.nodeId,
            { stars: a.stars, band: a.band },
          ]),
        ),
        edges: data.edges,
      })
    } finally {
      set({ loading: false })
    }
  },

  addAttempt: (nodeId, stars, band, expGain, goldGain, unlockedNodeIds = []) => {
    const { user, bestAttempts, unlocks } = get()
    if (!user) return

    // Update best attempt
    const prev = bestAttempts[nodeId]
    const isBetter = !prev || stars > prev.stars
    if (isBetter) {
      set({
        bestAttempts: { ...bestAttempts, [nodeId]: { stars, band } },
      })
    }

    // Add exp/gold
    set({
      user: {
        ...user,
        exp: user.exp + expGain,
        gold: user.gold + goldGain,
      },
    })

    // Reflect server-side unlocks (next nodes along "unlock" edges)
    if (unlockedNodeIds.length > 0) {
      set({ unlocks: new Set([...unlocks, ...unlockedNodeIds]) })
    }
  },

  spendGold: (amount) => {
    const { user, unlocks } = get()
    if (!user || user.gold < amount) return false
    set({ user: { ...user, gold: user.gold - amount } })
    return true
  },

  setTargetBand: (band) => {
    const { user } = get()
    if (!user) return
    set({ user: { ...user, targetBand: band } })
    void fetch("/api/user", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetBand: band }),
    }).catch(() => {})
  },
}))
