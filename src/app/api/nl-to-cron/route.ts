import { generateText } from "ai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { type NextRequest, NextResponse } from "next/server"
// import { Ratelimit } from "@upstash/ratelimit"
// import { Redis } from "@upstash/redis"
// import { ipAddress } from '@vercel/functions';

// Create a new ratelimiter, that allows 10 requests per 10 seconds per IP
// const ratelimit = new Ratelimit({
//   redis: Redis.fromEnv(),
//   limiter: Ratelimit.slidingWindow(10, "10 s"),
//   analytics: true,
//   prefix: "@upstash/ratelimit/nl-to-cron",
// })

export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    // const ip = ipAddress(request) ?? "127.0.0.1"
    //
    // // Check rate limit
    // const { success, limit, reset, remaining } = await ratelimit.limit(ip)

    // if (!success) {
    //   return NextResponse.json(
    //     {
    //       error: "Rate limit exceeded. Please try again later.",
    //       limit,
    //       reset,
    //       remaining: 0,
    //     },
    //     {
    //       status: 429,
    //       headers: {
    //         "X-RateLimit-Limit": limit.toString(),
    //         "X-RateLimit-Remaining": remaining.toString(),
    //         "X-RateLimit-Reset": reset.toString(),
    //       },
    //     },
    //   )
    // }

    const { naturalLanguage } = await request.json()

    if (!naturalLanguage) {
      return NextResponse.json({ error: "Natural language input is required" }, { status: 400 })
    }

    // Create Google provider with custom API key
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
    })

    const { text } = await generateText({
      model: google("gemini-1.5-flash"),
      system: `You are a CRON expression generator. Convert natural language descriptions into valid CRON expressions.

CRON format: minute hour day month weekday (5 fields)
- minute: 0-59
- hour: 0-23 (24-hour format)
- day: 1-31
- month: 1-12
- weekday: 0-6 (0=Sunday, 6=Saturday)

Use * for "any" value.
Use */n for "every n" intervals.
Use comma-separated values for multiple specific values.

Examples:
- "every day at 9am" → "0 9 * * *"
- "every 30 minutes" → "*/30 * * * *"
- "every Monday at midnight" → "0 0 * * 1"
- "weekdays at 2:30pm" → "30 14 * * 1-5"

Respond ONLY with the CRON expression, no explanation.`,
      prompt: `Convert this to a CRON expression: "${naturalLanguage}"`,
    })

    // Validate the generated CRON expression
    const cronParts = text.trim().split(/\s+/)
    if (cronParts.length !== 5) {
      throw new Error("Invalid CRON expression generated")
    }

    return NextResponse.json(
      { cronExpression: text.trim() },
      {
        // headers: {
        //   "X-RateLimit-Limit": limit.toString(),
        //   "X-RateLimit-Remaining": remaining.toString(),
        //   "X-RateLimit-Reset": reset.toString(),
        // },
      },
    )
  } catch (error) {
    console.error("Error generating CRON expression:", error)
    return NextResponse.json(
      { error: "Failed to generate CRON expression. Please try rephrasing your request." },
      { status: 500 },
    )
  }
}
