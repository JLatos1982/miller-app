import { validateAnalyticsEvent, validateResourceSubmission } from "./publicWriteValidation.js"

export function createPublicWriteHandlers({ supabase, log = console }) {
  return {
    async createEvent(req, res) {
      let event
      try {
        event = validateAnalyticsEvent(req.body)
      } catch {
        return res.status(400).json({ error: "Invalid analytics event." })
      }

      try {
        const { error } = await supabase.from("site_events").insert([event])
        if (error) throw error
        return res.status(202).json({ accepted: true })
      } catch (error) {
        log.error("Analytics insert failed:", error?.code || "database_error")
        return res.status(500).json({ error: "Could not record event." })
      }
    },

    async createResourceSubmission(req, res) {
      let submission
      try {
        submission = validateResourceSubmission(req.body)
      } catch {
        return res.status(400).json({ error: "Invalid resource submission." })
      }

      try {
        const { error } = await supabase.from("resource_submissions").insert([submission])
        if (error) throw error
        return res.status(201).json({ submitted: true })
      } catch (error) {
        log.error("Resource submission insert failed:", error?.code || "database_error")
        return res.status(500).json({ error: "Could not submit resource." })
      }
    },
  }
}
