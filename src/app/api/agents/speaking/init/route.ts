import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/db"
import { eq } from "drizzle-orm"

/**
 * Speaking Agent — init endpoint.
 * GET ?nodeId=spk_cafe_1 → returns node payload (scenario intro, NPC profile, etc.)
 */
export async function GET(req: NextRequest) {
  const nodeId = req.nextUrl.searchParams.get("nodeId")
  if (!nodeId) {
    return NextResponse.json({ error: "nodeId required" }, { status: 400 })
  }

  const db = getDb()
  const [node] = db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.id, nodeId))
    .limit(1)
    .all()

  if (!node) {
    return NextResponse.json({ error: "node not found" }, { status: 404 })
  }

  return NextResponse.json({
    id: node.id,
    title: node.title,
    subtitle: node.subtitle,
    cluster: node.cluster,
    difficulty: node.difficulty,
    payload: node.payload ?? {},
  })
}
