import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/db"
import { eq } from "drizzle-orm"

/**
 * User profile endpoint.
 * PATCH { targetBand } → update the learner's personal IELTS band goal.
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const targetBand = Number((body as { targetBand?: unknown }).targetBand)

  // Valid IELTS band range, 0.5 steps.
  if (!Number.isFinite(targetBand) || targetBand < 4 || targetBand > 9 || (targetBand * 2) % 1 !== 0) {
    return NextResponse.json({ error: "targetBand must be between 4.0 and 9.0 in 0.5 steps" }, { status: 400 })
  }

  const db = getDb()
  db.update(schema.users)
    .set({ targetBand })
    .where(eq(schema.users.id, "user_default"))
    .run()

  return NextResponse.json({ ok: true, targetBand })
}
