import { generateText } from "ai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { type NextRequest, NextResponse } from "next/server"
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

// Create a new ratelimiter, that allows 10 requests per 10 seconds per IP
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "10 s"),
  analytics: true,
  prefix: "@upstash/ratelimit/cron-to-nl",
})

export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const ip = request.ip ?? request.headers.get("x-forwarded-for") ?? "127.0.0.1"

    // Check rate limit
    const { success, limit, reset, remaining } = await ratelimit.limit(ip)

    if (!success) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Please try again later.",
          limit,
          reset,
          remaining: 0,
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": reset.toString(),
          },
        },
      )
    }

    const { cronExpression } = await request.json()

    if (!cronExpression) {
      return NextResponse.json({ error: "CRON expression is required" }, { status: 400 })
    }

    // Basic validation
    const cronParts = cronExpression.trim().split(/\s+/)
    if (cronParts.length !== 5) {
      return NextResponse.json({ error: "Invalid CRON expression. Must have 5 parts." }, { status: 400 })
    }

    // Create Google provider with custom API key
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
    })

    const { text } = await generateText({
      model: google("gemini-1.5-flash"),
      system: `You are a CRON expression interpreter. Convert CRON expressions into clear, natural language descriptions.

CRON format: minute hour day month weekday
- minute: 0-59
- hour: 0-23 (24-hour format, convert to 12-hour with AM/PM in output)
- day: 1-31
- month: 1-12
- weekday: 0-6 (0=Sunday, 6=Saturday)

Rules:
- * means "every" or "any"
- */n means "every n units"
- Comma-separated values mean "at these specific times"
- Ranges like 1-5 mean "from 1 to 5"

Examples:
- "0 9 * * *" → "Every day at 9:00 AM"
- "*/30 * * * *" → "Every 30 minutes"
- "0 0 * * 1" → "Every Monday at midnight"
- "30 14 * * 1-5" → "Every weekday at 2:30 PM"

Provide a clear, concise description in natural language.`,
      prompt: `Explain this CRON expression in natural language: "${cronExpression}"`,
    })

    return NextResponse.json(
      { description: text.trim() },
      {
        headers: {
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": reset.toString(),
        },
      },
    )
  } catch (error) {
    console.error("Error interpreting CRON expression:", error)
    return NextResponse.json(
      { error: "Failed to interpret CRON expression. Please check the format." },
      { status: 500 },
    )
  }
}
