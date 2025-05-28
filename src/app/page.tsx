"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Copy,
  Clock,
  Code,
  Sparkles,
  Loader2,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  History,
  Trash2,
  Calendar,
  Zap,
  Shield,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface HistoryItem {
  id: string
  input: string
  output: string
  type: "nl-to-cron" | "cron-to-nl"
  timestamp: number
}

interface RateLimitInfo {
  limit: number
  remaining: number
  reset: number
}

export default function CronGenerator() {
  const [activeTab, setActiveTab] = useState("nl-to-cron")
  const [nlInput, setNlInput] = useState("")
  const [cronInput, setCronInput] = useState("")
  const [nlToCronResult, setNlToCronResult] = useState("")
  const [cronToNlResult, setCronToNlResult] = useState("")
  const [nlError, setNlError] = useState("")
  const [cronError, setCronError] = useState("")
  const [nlLoading, setNlLoading] = useState(false)
  const [cronLoading, setCronLoading] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [cronValidation, setCronValidation] = useState<{ isValid: boolean; message: string } | null>(null)
  const [nextExecutions, setNextExecutions] = useState<string[]>([])
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo>({ limit: 10, remaining: 10, reset: -1 })
  const { toast } = useToast()

  // Load history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem("cron-generator-history")
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory))
    }
  }, [])

  // Save history to localStorage
  const saveToHistory = useCallback(
    (item: Omit<HistoryItem, "id" | "timestamp">) => {
      const newItem: HistoryItem = {
        ...item,
        id: Date.now().toString(),
        timestamp: Date.now(),
      }
      const updatedHistory = [newItem, ...history.slice(0, 9)] // Keep last 10 items
      setHistory(updatedHistory)
      localStorage.setItem("cron-generator-history", JSON.stringify(updatedHistory))
    },
    [history],
  )

  // Calculate next execution times for CRON expression
  const calculateNextExecutions = useCallback((cronExpression: string) => {
    try {
      const parts = cronExpression.trim().split(/\s+/)
      if (parts.length !== 5) return []

      const [minutePart, hourPart, dayPart, monthPart, weekdayPart] = parts
      const now = new Date()
      const executions: string[] = []

      // Helper function to parse CRON part
      const parseCronPart = (part: string, min: number, max: number): number[] => {
        if (part === "*") {
          return Array.from({ length: max - min + 1 }, (_, i) => min + i)
        }
        if (part.includes("/")) {
          const [range, step] = part.split("/")
          const stepNum = Number.parseInt(step)
          if (range === "*") {
            const values = []
            for (let i = min; i <= max; i += stepNum) {
              values.push(i)
            }
            return values
          }
        }
        if (part.includes(",")) {
          return part
            .split(",")
            .map(Number)
            .filter((n) => !isNaN(n) && n >= min && n <= max)
        }
        if (part.includes("-")) {
          const [start, end] = part.split("-").map(Number)
          if (!isNaN(start) && !isNaN(end)) {
            return Array.from({ length: end - start + 1 }, (_, i) => start + i)
          }
        }
        const num = Number.parseInt(part)
        return !isNaN(num) && num >= min && num <= max ? [num] : []
      }

      const minutes = parseCronPart(minutePart, 0, 59)
      const hours = parseCronPart(hourPart, 0, 23)
      const days = dayPart === "*" ? null : parseCronPart(dayPart, 1, 31)
      const months = parseCronPart(monthPart, 1, 12)
      const weekdays = weekdayPart === "*" ? null : parseCronPart(weekdayPart, 0, 6)

      // Find next 5 execution times
      const searchDate = new Date(now)
      searchDate.setSeconds(0, 0) // Reset seconds and milliseconds

      for (let attempts = 0; attempts < 10000 && executions.length < 5; attempts++) {
        const minute = searchDate.getMinutes()
        const hour = searchDate.getHours()
        const day = searchDate.getDate()
        const month = searchDate.getMonth() + 1
        const weekday = searchDate.getDay()

        const minuteMatch = minutes.includes(minute)
        const hourMatch = hours.includes(hour)
        const monthMatch = months.includes(month)

        // Day matching: either day of month OR day of week (if both specified, it's OR not AND)
        let dayMatch = true
        if (days !== null && weekdays !== null) {
          dayMatch = days.includes(day) || weekdays.includes(weekday)
        } else if (days !== null) {
          dayMatch = days.includes(day)
        } else if (weekdays !== null) {
          dayMatch = weekdays.includes(weekday)
        }

        if (minuteMatch && hourMatch && dayMatch && monthMatch && searchDate > now) {
          executions.push(
            searchDate.toLocaleString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            }),
          )
        }

        // Increment by 1 minute
        searchDate.setMinutes(searchDate.getMinutes() + 1)
      }

      return executions
    } catch (error) {
      console.error("Error calculating next executions:", error)
      return []
    }
  }, [])

  // Validate CRON expression in real-time
  const validateCronExpression = useCallback(
    (expression: string) => {
      if (!expression.trim()) {
        setCronValidation(null)
        setNextExecutions([])
        return
      }

      const parts = expression.trim().split(/\s+/)
      if (parts.length !== 5) {
        setCronValidation({ isValid: false, message: "CRON expression must have exactly 5 parts" })
        setNextExecutions([])
        return
      }

      // Basic validation for each part
      const [minute, hour, day, month, weekday] = parts
      const validations = [
        { value: minute, range: [0, 59], name: "minute" },
        { value: hour, range: [0, 23], name: "hour" },
        { value: day, range: [1, 31], name: "day" },
        { value: month, range: [1, 12], name: "month" },
        { value: weekday, range: [0, 6], name: "weekday" },
      ]

      for (const validation of validations) {
        if (
          validation.value !== "*" &&
          !validation.value.includes("/") &&
          !validation.value.includes(",") &&
          !validation.value.includes("-")
        ) {
          const num = Number.parseInt(validation.value)
          if (isNaN(num) || num < validation.range[0] || num > validation.range[1]) {
            setCronValidation({ isValid: false, message: `Invalid ${validation.name}: ${validation.value}` })
            setNextExecutions([])
            return
          }
        }
      }

      setCronValidation({ isValid: true, message: "Valid CRON expression" })

      // Calculate actual next execution times
      const executions = calculateNextExecutions(expression)
      setNextExecutions(executions)
    },
    [calculateNextExecutions],
  )

  // Debounced CRON validation
  useEffect(() => {
    const timer = setTimeout(() => {
      validateCronExpression(cronInput)
    }, 300)
    return () => clearTimeout(timer)
  }, [cronInput, validateCronExpression])

  // Helper function to extract rate limit info from response headers
  const extractRateLimitInfo = (response: Response): RateLimitInfo | null => {
    const limit = response.headers.get("X-RateLimit-Limit")
    const remaining = response.headers.get("X-RateLimit-Remaining")
    const reset = response.headers.get("X-RateLimit-Reset")

    if (limit && remaining && reset) {
      return {
        limit: Number.parseInt(limit),
        remaining: Number.parseInt(remaining),
        reset: Number.parseInt(reset),
      }
    }
    return null
  }

  const handleNlToCron = async () => {
    if (!nlInput.trim()) return

    setNlLoading(true)
    setNlError("")
    setNlToCronResult("")

    try {
      const response = await fetch("/api/nl-to-cron", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ naturalLanguage: nlInput }),
      })

      // Extract rate limit info
      const rateLimitInfo = extractRateLimitInfo(response)
      if (rateLimitInfo) {
        setRateLimitInfo(rateLimitInfo)
      }

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 429) {
          const resetTime = new Date(data.reset * 1000).toLocaleTimeString()
          // noinspection ExceptionCaughtLocallyJS
          throw new Error(
            `Rate limit exceeded. Try again after ${resetTime}. (${data.remaining}/${data.limit} requests remaining)`,
          )
        }
        // noinspection ExceptionCaughtLocallyJS
        throw new Error(data.error || "Failed to generate CRON expression")
      }

      setNlToCronResult(data.cronExpression)
      saveToHistory({
        input: nlInput,
        output: data.cronExpression,
        type: "nl-to-cron",
      })
    } catch (error) {
      setNlError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setNlLoading(false)
    }
  }

  const handleCronToNl = async () => {
    if (!cronInput.trim()) return

    setCronLoading(true)
    setCronError("")
    setCronToNlResult("")

    try {
      const response = await fetch("/api/cron-to-nl", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cronExpression: cronInput }),
      })

      // Extract rate limit info
      const rateLimitInfo = extractRateLimitInfo(response)
      if (rateLimitInfo) {
        setRateLimitInfo(rateLimitInfo)
      }

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 429) {
          const resetTime = new Date(data.reset * 1000).toLocaleTimeString()
          // noinspection ExceptionCaughtLocallyJS
          throw new Error(
            `Rate limit exceeded. Try again after ${resetTime}. (${data.remaining}/${data.limit} requests remaining)`,
          )
        }
        // noinspection ExceptionCaughtLocallyJS
        throw new Error(data.error || "Failed to interpret CRON expression")
      }

      setCronToNlResult(data.description)
      saveToHistory({
        input: cronInput,
        output: data.description,
        type: "cron-to-nl",
      })
    } catch (error) {
      setCronError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setCronLoading(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
    toast({
      title: "Copied to clipboard",
      description: "The text has been copied to your clipboard.",
    })
  }

  const fillExample = (example: string, isNl: boolean) => {
    if (isNl) {
      setNlInput(example)
    } else {
      setCronInput(example)
    }
  }

  const loadFromHistory = (item: HistoryItem) => {
    // Switch to the correct tab first
    setActiveTab(item.type)

    // Clear previous results
    setNlToCronResult("")
    setCronToNlResult("")
    setNlError("")
    setCronError("")

    // Load the data
    if (item.type === "nl-to-cron") {
      setNlInput(item.input)
      setNlToCronResult(item.output)
    } else {
      setCronInput(item.input)
      setCronToNlResult(item.output)
    }
  }

  const clearHistory = () => {
    setHistory([])
    localStorage.removeItem("cron-generator-history")
    toast({
      title: "History cleared",
      description: "All history has been removed.",
    })
  }

  const quickTemplates = [
    { name: "Daily backup", cron: "0 2 * * *", desc: "Every day at 2 AM" },
    { name: "Weekly report", cron: "0 9 * * 1", desc: "Every Monday at 9 AM" },
    { name: "Hourly sync", cron: "0 * * * *", desc: "Every hour" },
    { name: "Monthly cleanup", cron: "0 0 1 * *", desc: "First day of every month" },
  ]

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-black flex items-center justify-center">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-2xl font-semibold text-black">CRONO</h1>
              </div>
              <p className="text-gray-600 text-sm">
                AI-powered conversion between natural language and CRON expressions
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-3 h-3 text-gray-500" />
                <p className="text-xs text-gray-500">
                  {rateLimitInfo.remaining}/{rateLimitInfo.limit} requests remaining
                </p>
              </div>
              <p className="text-xs text-gray-400">Powered by Gemini 1.5 Flash</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-gray-100 p-1 h-auto">
            <TabsTrigger
              value="nl-to-cron"
              className="flex items-center gap-2 py-3 px-4 data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <Sparkles className="w-4 h-4" />
              <span className="font-medium">Natural Language → CRON</span>
            </TabsTrigger>
            <TabsTrigger
              value="cron-to-nl"
              className="flex items-center gap-2 py-3 px-4 data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <Code className="w-4 h-4" />
              <span className="font-medium">CRON → Natural Language</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="nl-to-cron" className="mt-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Input Section */}
              <Card className="border border-gray-200 shadow-sm lg:col-span-2">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-semibold">Input</CardTitle>
                  <CardDescription className="text-sm text-gray-600">
                    Describe when you want your task to run
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="nl-input" className="text-sm font-medium">
                      Schedule description
                    </Label>
                    <Textarea
                      id="nl-input"
                      placeholder="e.g., every day at 9am, every 30 minutes, weekdays at 2:30pm"
                      value={nlInput}
                      onChange={(e) => setNlInput(e.target.value)}
                      className="min-h-[120px] border-gray-200 focus:border-black focus:ring-black"
                    />
                  </div>

                  <Button
                    onClick={handleNlToCron}
                    className="w-full bg-black hover:bg-gray-800 text-white h-11"
                    disabled={!nlInput.trim() || nlLoading}
                  >
                    {nlLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        Generate CRON
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>

                  {nlError && (
                    <div className="p-4 bg-red-50 border border-red-200 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-red-700">{nlError}</p>
                    </div>
                  )}

                  {nlToCronResult && (
                    <div className="space-y-3 p-4 bg-green-50 border border-green-200">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <Label className="text-sm font-medium text-green-800">Generated CRON Expression</Label>
                      </div>
                      <div className="flex gap-2">
                        <Input value={nlToCronResult} readOnly className="font-mono bg-white border-green-200" />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => copyToClipboard(nlToCronResult)}
                          className="border-green-200 hover:bg-green-100"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-green-600">Format: minute hour day month weekday</p>
                    </div>
                  )}

                  {/* Quick Templates */}
                  <div className="pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="w-4 h-4 text-gray-600" />
                      <p className="text-xs font-medium text-gray-900">Quick Templates:</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {quickTemplates.map((template) => (
                        <button
                          key={template.name}
                          onClick={() => setNlInput(template.desc)}
                          className="text-left p-3 border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          <p className="text-xs font-medium text-gray-900">{template.name}</p>
                          <p className="text-xs text-gray-600">{template.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Examples */}
                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-900 mb-3">Try these examples:</p>
                    <div className="space-y-2">
                      {["every day at 9am", "every 30 minutes", "weekdays at 2:30pm", "every Monday at midnight"].map(
                        (example) => (
                          <button
                            key={example}
                            onClick={() => fillExample(example, true)}
                            className="block w-full text-left text-xs text-gray-600 hover:text-black hover:bg-gray-50 p-2 border border-gray-100 hover:border-gray-200 transition-colors"
                          >
                            "{example}"
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* History Sidebar */}
              <Card className="border border-gray-200 shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      <History className="w-4 h-4" />
                      History
                    </CardTitle>
                    {history.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearHistory}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <CardDescription className="text-sm text-gray-600">Recent conversions</CardDescription>
                </CardHeader>
                <CardContent>
                  {history.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-8">No history yet</p>
                  ) : (
                    <div className="space-y-3">
                      {history.slice(0, 5).map((item) => (
                        <button
                          key={item.id}
                          onClick={() => loadFromHistory(item)}
                          className="w-full text-left p-3 border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="text-xs">
                              {item.type === "nl-to-cron" ? "NL→CRON" : "CRON→NL"}
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {new Date(item.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-xs text-gray-700 truncate">{item.input}</p>
                          <p className="text-xs text-gray-500 truncate font-mono">{item.output}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="cron-to-nl" className="mt-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Input Section */}
              <Card className="border border-gray-200 shadow-sm lg:col-span-2">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-semibold">Input</CardTitle>
                  <CardDescription className="text-sm text-gray-600">
                    Enter a CRON expression to explain
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="cron-input" className="text-sm font-medium">
                      CRON Expression
                    </Label>
                    <Input
                      id="cron-input"
                      placeholder="e.g., 0 9 * * 1-5"
                      value={cronInput}
                      onChange={(e) => setCronInput(e.target.value)}
                      className="font-mono border-gray-200 focus:border-black focus:ring-black"
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500">Format: minute hour day month weekday</p>
                      {cronValidation && (
                        <div className="flex items-center gap-1">
                          {cronValidation.isValid ? (
                            <CheckCircle className="w-3 h-3 text-green-600" />
                          ) : (
                            <AlertCircle className="w-3 h-3 text-red-600" />
                          )}
                          <span className={`text-xs ${cronValidation.isValid ? "text-green-600" : "text-red-600"}`}>
                            {cronValidation.message}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {nextExecutions.length > 0 && (
                    <div className="p-3 bg-blue-50 border border-blue-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4 text-blue-600" />
                        <p className="text-xs font-medium text-blue-800">Next executions:</p>
                      </div>
                      <div className="space-y-1">
                        {nextExecutions.map((time, index) => (
                          <p key={index} className="text-xs text-blue-700">
                            {time}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={handleCronToNl}
                    className="w-full bg-black hover:bg-gray-800 text-white h-11"
                    disabled={!cronInput.trim() || cronLoading || (!!cronValidation && !cronValidation.isValid)}
                  >
                    {cronLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        Explain CRON
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>

                  {cronError && (
                    <div className="p-4 bg-red-50 border border-red-200 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-red-700">{cronError}</p>
                    </div>
                  )}

                  {cronToNlResult && (
                    <div className="space-y-3 p-4 bg-green-50 border border-green-200">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <Label className="text-sm font-medium text-green-800">AI-Generated Description</Label>
                      </div>
                      <div className="flex gap-2">
                        <Textarea
                          value={cronToNlResult}
                          readOnly
                          className="min-h-[100px] bg-white border-green-200 resize-none"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => copyToClipboard(cronToNlResult)}
                          className="border-green-200 hover:bg-green-100 self-start"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Quick Templates */}
                  <div className="pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="w-4 h-4 text-gray-600" />
                      <p className="text-xs font-medium text-gray-900">Quick Templates:</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {quickTemplates.map((template) => (
                        <button
                          key={template.name}
                          onClick={() => setCronInput(template.cron)}
                          className="text-left p-3 border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          <p className="text-xs font-medium text-gray-900">{template.name}</p>
                          <p className="text-xs text-gray-600 font-mono">{template.cron}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Examples */}
                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-900 mb-3">Try these examples:</p>
                    <div className="space-y-2">
                      {["0 9 * * 1-5", "*/15 * * * *", "0 0 1 * *", "0 12 * * 0"].map((example) => (
                        <button
                          key={example}
                          onClick={() => fillExample(example, false)}
                          className="block w-full text-left text-xs text-gray-600 hover:text-black hover:bg-gray-50 p-2 border border-gray-100 hover:border-gray-200 transition-colors font-mono"
                        >
                          {example}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* History Sidebar */}
              <Card className="border border-gray-200 shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      <History className="w-4 h-4" />
                      History
                    </CardTitle>
                    {history.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearHistory}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <CardDescription className="text-sm text-gray-600">Recent conversions</CardDescription>
                </CardHeader>
                <CardContent>
                  {history.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-8">No history yet</p>
                  ) : (
                    <div className="space-y-3">
                      {history.slice(0, 5).map((item) => (
                        <button
                          key={item.id}
                          onClick={() => loadFromHistory(item)}
                          className="w-full text-left p-3 border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="text-xs">
                              {item.type === "nl-to-cron" ? "NL→CRON" : "CRON→NL"}
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {new Date(item.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-xs text-gray-700 truncate">{item.input}</p>
                          <p className="text-xs text-gray-500 truncate font-mono">{item.output}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-500">
            Learn more about CRON expressions on{" "}
            <a
              href="https://vercel.com/docs/cron-jobs"
              className="text-black hover:underline font-medium"
              target="_blank"
              rel="noopener noreferrer"
            >
              Vercel's documentation
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
