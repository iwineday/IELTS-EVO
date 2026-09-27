import { NextResponse } from "next/server"
import { getDb, schema } from "@/db"
import { eq, and, desc } from "drizzle-orm"

export async function GET() {
  const db = getDb()

  // Default user
  const [user] = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, "user_default"))
    .limit(1)
    .all()

  // All speaking nodes
  const nodes = db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.skill, "speaking"))
    .all()

  // Unlocks for this user
  const unlocks = db
    .select({ nodeId: schema.unlocks.nodeId })
    .from(schema.unlocks)
    .where(eq(schema.unlocks.userId, "user_default"))
    .all()
    .map((r) => r.nodeId)

  // Best attempts per node
  const rawAttempts = db
    .select({
      nodeId: schema.attempts.nodeId,
      stars: schema.attempts.stars,
      band: schema.attempts.band,
    })
    .from(schema.attempts)
    .where(eq(schema.attempts.userId, "user_default"))
    .orderBy(desc(schema.attempts.createdAt))
    .all()

  // Dedupe: keep best per nodeId
  const bestMap = new Map<string, { nodeId: string; stars: number; band: number | null }>()
  for (const a of rawAttempts) {
    const prev = bestMap.get(a.nodeId)
    if (!prev || a.stars > prev.stars) {
      bestMap.set(a.nodeId, { nodeId: a.nodeId, stars: a.stars, band: a.band ?? null })
    }
  }
  const attempts = Array.from(bestMap.values())

  // Edges within speaking skill
  const speakingIds = new Set(nodes.map((n) => n.id))
  const edges = db
    .select()
    .from(schema.edges)
    .all()
    .filter((e) => speakingIds.has(e.fromNode) && speakingIds.has(e.toNode))

  return NextResponse.json({
    user,
    nodes,
    unlocks,
    attempts,
    edges: edges.map((e) => ({ from: e.fromNode, to: e.toNode, kind: e.kind })),
  })
}
