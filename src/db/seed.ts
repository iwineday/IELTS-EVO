import { rawDb } from "."
import { randomUUID } from "node:crypto"

/**
 * Seed the database with:
 *  - a default user
 *  - 32 placeholder Speaking nodes (the new-user district map)
 *  - edges defining the unlock graph
 *  - initial unlocks (the first node of each building is open)
 *
 * Node `payload` is filled in by scripts/generate-speaking-content.ts.
 */

interface PlaceholderNode {
  id: string
  cluster: string
  title: string
  subtitle: string
  difficulty: number
  x: number
  y: number
}

const NODES: PlaceholderNode[] = [
  // Apartment cluster (top-left)
  { id: "spk_apt_1", cluster: "apartment", title: "Self-introduction",  subtitle: "Part 1 · Tell us about you",         difficulty: 1, x: 0.18, y: 0.22 },
  { id: "spk_apt_2", cluster: "apartment", title: "Hometown",            subtitle: "Part 1 · Where you're from",         difficulty: 1, x: 0.10, y: 0.34 },
  { id: "spk_apt_3", cluster: "apartment", title: "Daily Routine",       subtitle: "Part 1 · A day in your life",        difficulty: 2, x: 0.22, y: 0.40 },
  { id: "spk_apt_4", cluster: "apartment", title: "Family",              subtitle: "Part 1 · People you live with",      difficulty: 2, x: 0.14, y: 0.50 },

  // Cafe cluster (top-right)
  { id: "spk_cafe_1", cluster: "cafe", title: "Order a Coffee",          subtitle: "Scenario · Barista interaction",     difficulty: 1, x: 0.72, y: 0.18 },
  { id: "spk_cafe_2", cluster: "cafe", title: "Small Talk",              subtitle: "Scenario · Weather, weekend, music", difficulty: 2, x: 0.84, y: 0.30 },
  { id: "spk_cafe_3", cluster: "cafe", title: "Pay & Tip",               subtitle: "Scenario · Settle the bill",         difficulty: 2, x: 0.78, y: 0.42 },
  { id: "spk_cafe_4", cluster: "cafe", title: "Cold Drink Complaint",    subtitle: "Scenario · Be polite but firm",      difficulty: 3, x: 0.88, y: 0.50 },

  // Supermarket cluster (bottom-left)
  { id: "spk_mkt_1", cluster: "market", title: "Find an Item",           subtitle: "Scenario · Aisle, where, how much",  difficulty: 1, x: 0.18, y: 0.66 },
  { id: "spk_mkt_2", cluster: "market", title: "Ask About a Discount",   subtitle: "Scenario · Sale and promotions",     difficulty: 2, x: 0.10, y: 0.78 },
  { id: "spk_mkt_3", cluster: "market", title: "Checkout",               subtitle: "Scenario · Bagging and payment",     difficulty: 2, x: 0.22, y: 0.88 },
  { id: "spk_mkt_4", cluster: "market", title: "Use a Coupon",           subtitle: "Scenario · Clarify terms",           difficulty: 3, x: 0.32, y: 0.78 },

  // Bus stop cluster (bottom-right)
  { id: "spk_bus_1", cluster: "busstop", title: "Ask for Directions",    subtitle: "Scenario · Where is X, how to get",  difficulty: 1, x: 0.72, y: 0.66 },
  { id: "spk_bus_2", cluster: "busstop", title: "Buy a Ticket",          subtitle: "Scenario · Destination & fare",      difficulty: 2, x: 0.84, y: 0.74 },
  { id: "spk_bus_3", cluster: "busstop", title: "Weather Small Talk",    subtitle: "Scenario · Chat at the stop",        difficulty: 2, x: 0.78, y: 0.86 },
  { id: "spk_bus_4", cluster: "busstop", title: "Missed the Bus",        subtitle: "Scenario · Plan B, ask a stranger",  difficulty: 3, x: 0.88, y: 0.78 },

  // Park cluster — IELTS P1 hobbies/sport + P2 place + P3 discussion
  { id: "spk_park_1", cluster: "park", title: "Hobbies & Free Time",      subtitle: "Part 1 · What you do to relax",      difficulty: 2, x: 0.30, y: 0.20 },
  { id: "spk_park_2", cluster: "park", title: "Sport & Exercise",         subtitle: "Part 1 · Staying active",            difficulty: 2, x: 0.40, y: 0.30 },
  { id: "spk_park_3", cluster: "park", title: "A Place You Relax",        subtitle: "Part 2 · Describe a peaceful place", difficulty: 3, x: 0.34, y: 0.42 },
  { id: "spk_park_4", cluster: "park", title: "Outdoor Life Debate",      subtitle: "Part 3 · City parks & lifestyle",    difficulty: 4, x: 0.44, y: 0.52 },

  // Campus cluster — IELTS P1 work/study + P2 person + P3 education
  { id: "spk_cam_1", cluster: "campus", title: "Work or Study?",          subtitle: "Part 1 · The classic opener",        difficulty: 2, x: 0.55, y: 0.20 },
  { id: "spk_cam_2", cluster: "campus", title: "Learning English",        subtitle: "Part 1 · Your language journey",     difficulty: 3, x: 0.65, y: 0.28 },
  { id: "spk_cam_3", cluster: "campus", title: "A Teacher You Remember",  subtitle: "Part 2 · Describe a person",         difficulty: 3, x: 0.58, y: 0.40 },
  { id: "spk_cam_4", cluster: "campus", title: "Education Debate",        subtitle: "Part 3 · Exams, online learning",    difficulty: 4, x: 0.68, y: 0.50 },

  // Airport cluster — IELTS P1 travel + scenario + P2 trip + P3 tourism
  { id: "spk_air_1", cluster: "airport", title: "Holidays & Travel",      subtitle: "Part 1 · How you like to travel",    difficulty: 2, x: 0.30, y: 0.62 },
  { id: "spk_air_2", cluster: "airport", title: "At the Check-in Desk",   subtitle: "Scenario · Bags, seats, delays",     difficulty: 3, x: 0.40, y: 0.72 },
  { id: "spk_air_3", cluster: "airport", title: "A Memorable Trip",       subtitle: "Part 2 · Describe a journey",        difficulty: 4, x: 0.34, y: 0.84 },
  { id: "spk_air_4", cluster: "airport", title: "Tourism Debate",         subtitle: "Part 3 · Mass tourism pros & cons",  difficulty: 4, x: 0.44, y: 0.92 },

  // Cinema cluster — IELTS P1 films/music + P2 film + P3 media & tech
  { id: "spk_cin_1", cluster: "cinema", title: "Films & TV",              subtitle: "Part 1 · What you like to watch",    difficulty: 2, x: 0.58, y: 0.62 },
  { id: "spk_cin_2", cluster: "cinema", title: "Music",                   subtitle: "Part 1 · Songs and concerts",        difficulty: 3, x: 0.68, y: 0.70 },
  { id: "spk_cin_3", cluster: "cinema", title: "A Film You Loved",        subtitle: "Part 2 · Describe a film",           difficulty: 4, x: 0.62, y: 0.82 },
  { id: "spk_cin_4", cluster: "cinema", title: "Screens & Society",       subtitle: "Part 3 · Streaming, phones, AI",     difficulty: 5, x: 0.72, y: 0.90 },
]

const EDGES: [string, string][] = [
  // Linear within each cluster
  ["spk_apt_1", "spk_apt_2"], ["spk_apt_2", "spk_apt_3"], ["spk_apt_3", "spk_apt_4"],
  ["spk_cafe_1", "spk_cafe_2"], ["spk_cafe_2", "spk_cafe_3"], ["spk_cafe_3", "spk_cafe_4"],
  ["spk_mkt_1", "spk_mkt_2"], ["spk_mkt_2", "spk_mkt_3"], ["spk_mkt_3", "spk_mkt_4"],
  ["spk_bus_1", "spk_bus_2"], ["spk_bus_2", "spk_bus_3"], ["spk_bus_3", "spk_bus_4"],
  ["spk_park_1", "spk_park_2"], ["spk_park_2", "spk_park_3"], ["spk_park_3", "spk_park_4"],
  ["spk_cam_1", "spk_cam_2"], ["spk_cam_2", "spk_cam_3"], ["spk_cam_3", "spk_cam_4"],
  ["spk_air_1", "spk_air_2"], ["spk_air_2", "spk_air_3"], ["spk_air_3", "spk_air_4"],
  ["spk_cin_1", "spk_cin_2"], ["spk_cin_2", "spk_cin_3"], ["spk_cin_3", "spk_cin_4"],
  // Cross-cluster: finishing the first lesson of one building opens the next
  ["spk_apt_2", "spk_cafe_1"],
  ["spk_cafe_2", "spk_mkt_1"],
  ["spk_mkt_2", "spk_bus_1"],
  ["spk_bus_2", "spk_park_1"],
  ["spk_park_2", "spk_cam_1"],
  ["spk_cam_2", "spk_air_1"],
  ["spk_air_2", "spk_cin_1"],
]

const STARTERS = ["spk_apt_1"]

function main() {
  const db = rawDb()
  const insertUser = db.prepare(
    `INSERT OR IGNORE INTO users (id, display_name) VALUES (?, ?)`,
  )
  const userId = "user_default"
  insertUser.run(userId, "Learner")

  const insertNode = db.prepare(`
    INSERT OR IGNORE INTO nodes (id, skill, cluster, kind, title, subtitle, difficulty, map_x, map_y, reward_exp, reward_gold)
    VALUES (?, 'speaking', ?, 'lesson', ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertEdge = db.prepare(
    `INSERT OR IGNORE INTO edges (id, from_node, to_node, kind) VALUES (?, ?, ?, 'unlock')`,
  )
  const insertUnlock = db.prepare(
    `INSERT OR IGNORE INTO unlocks (id, user_id, node_id, source) VALUES (?, ?, ?, 'seed')`,
  )

  db.transaction(() => {
    for (const n of NODES) {
      insertNode.run(
        n.id, n.cluster, n.title, n.subtitle, n.difficulty,
        n.x, n.y,
        40 + n.difficulty * 10, 8 + n.difficulty * 2,
      )
    }
    for (const [from, to] of EDGES) {
      insertEdge.run(`${from}->${to}`, from, to)
    }
    for (const s of STARTERS) {
      insertUnlock.run(randomUUID(), userId, s)
    }
  })()

  console.log(`[seed] user=${userId}, nodes=${NODES.length}, edges=${EDGES.length}, starters=${STARTERS.length}`)
}

main()
