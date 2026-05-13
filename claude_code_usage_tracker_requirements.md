# Requirement: Claude Code Usage Tracker

## 1. Product Goal

Build a local usage tracking tool for Claude Code that captures token usage through standard OpenTelemetry, stores the output locally as JSONL, and provides a VSCode dashboard for users to view Claude Code usage in a clear and useful way.

The tool should help users understand:

- How many tokens they used
- How much estimated cost was generated
- Which sessions consumed the most usage
- Which models were used
- How much cache read and cache creation contributed to usage
- Whether local telemetry collection is working correctly

The tool should work for Claude Code CLI and Claude Code inside VSCode.

---

## 2. Product Name

Working name:

**Claude Code Usage Tracker**

The name can be changed later, but all user-facing labels should be clear and easy to understand.

---

## 3. High-Level Design

The product has three main parts:

1. **Local OpenTelemetry collector**
   - Runs locally on the user machine.
   - Starts automatically when the machine starts or when the user logs in.
   - Receives OpenTelemetry usage data from Claude Code.
   - Writes output to local JSONL files.

2. **Local usage storage**
   - Stores usage data inside a custom folder under `.claude`.
   - Uses JSONL as the main storage format.
   - Keeps data append-only and easy to inspect.
   - Supports daily file separation.

3. **VSCode extension dashboard**
   - Reads the local JSONL usage files.
   - Displays usage information in a dashboard.
   - Provides filtering and summary views.
   - Shows collector health and last received telemetry time.

---

## 4. Data Folder Design

The tool should create and use a dedicated folder under the user’s `.claude` directory.

Recommended folder name:

```text
~/.claude/usage-tracker/
```

Expected folder purpose:

```text
~/.claude/usage-tracker/
  raw/
    Store raw OpenTelemetry JSONL output.

  usage/
    Store normalized usage JSONL files.

  logs/
    Store app, collector, and startup logs.

  config/
    Store user-editable configuration.

  exports/
    Store exported reports if the user exports data.
```

The tool must not write usage files into Claude Code’s own project transcript folders.

---

## 5. OpenTelemetry Collection Requirement

The tool must use standard OpenTelemetry collection.

The OpenTelemetry collector should:

- Run locally.
- Start automatically when the user starts the machine or logs into the system.
- Receive Claude Code telemetry data.
- Save output as JSONL.
- Preserve enough information for usage analysis.
- Avoid storing prompt content, tool content, or sensitive user content by default.
- Be easy to check from the VSCode dashboard.

The OpenTelemetry output must be stored in JSONL format.

Example output location:

```text
~/.claude/usage-tracker/raw/YYYY-MM-DD.otel.jsonl
```

The tool should support daily log files.

---

## 6. Normalized Usage Output Requirement

The tool should produce a normalized JSONL usage file that is easier for the dashboard to read.

Example output location:

```text
~/.claude/usage-tracker/usage/YYYY-MM-DD.usage.jsonl
```

Each usage record should represent one Claude Code API usage event when possible.

Each usage record should include, when available:

- Timestamp
- Session ID
- Request ID
- Model name
- Query source
- Input tokens
- Output tokens
- Cache read tokens
- Cache creation tokens
- Total tokens without cache
- Total tokens with cache
- Estimated cost
- Duration
- Source type
- Project or workspace reference, if safely available
- Tool version or schema version

The tool should avoid duplicate records.

The tool should be able to continue safely after restart.

---

## 7. Token Calculation Requirement

The dashboard should show at least two token totals:

### Total Tokens Without Cache

Represents:

```text
input tokens + output tokens
```

This is useful for users who want a traditional token usage view.

### Total Tokens With Cache

Represents:

```text
input tokens + output tokens + cache read tokens + cache creation tokens
```

This is useful for users who want to understand Claude Code usage more accurately, especially when cache usage is large.

The UI should clearly explain the difference between these two totals.

---

## 8. VSCode Extension Requirement

Build a VSCode extension that provides a dashboard for Claude Code usage.

The extension should:

- Read local usage JSONL files.
- Display usage summary.
- Refresh automatically.
- Allow manual refresh.
- Show usage by day.
- Show usage by session.
- Show usage by model.
- Show cache usage breakdown.
- Show estimated cost.
- Show collector health.
- Help users diagnose why usage data is missing.

The extension should not require a remote server.

The extension should work fully offline after installation.

---

## 9. Dashboard Views

### 9.1 Overview View

The overview should show:

- Today’s estimated cost
- Today’s input tokens
- Today’s output tokens
- Today’s cache read tokens
- Today’s cache creation tokens
- Today’s total tokens without cache
- Today’s total tokens with cache
- Number of API usage events
- Last usage event time
- Collector status

The overview should be easy to understand at a glance.

---

### 9.2 Daily Usage View

The daily usage view should show usage grouped by date.

For each day, show:

- Date
- Total cost
- Input tokens
- Output tokens
- Cache read tokens
- Cache creation tokens
- Total tokens with cache
- Total tokens without cache
- Number of sessions
- Number of requests

The user should be able to select a date and view details.

---

### 9.3 Session View

The session view should show usage grouped by Claude Code session.

For each session, show:

- Session ID
- Start time
- End time
- Duration
- Estimated cost
- Model usage
- Token breakdown
- Cache usage
- Request count
- Associated workspace or project, if available

The user should be able to drill down into a session.

---

### 9.4 Model View

The model view should show usage grouped by model.

For each model, show:

- Model name
- Total cost
- Input tokens
- Output tokens
- Cache read tokens
- Cache creation tokens
- Total tokens with cache
- Total tokens without cache
- Request count
- Average request duration, if available

This helps users understand which Claude model contributes most to cost and token usage.

---

### 9.5 Cache Usage View

The cache usage view should help users understand cache behavior.

It should show:

- Cache read tokens
- Cache creation tokens
- Cache usage ratio
- Cache usage by day
- Cache usage by session
- Cache usage by model

The UI should make it clear that cache read and cache creation are separate from normal input and output tokens.

---

### 9.6 Health View

The health view should show:

- Whether the collector is running
- Whether the collector output folder exists
- Whether new JSONL records are being written
- Last received telemetry timestamp
- Whether Claude Code telemetry appears to be configured
- Whether the dashboard can read usage files
- Any detected errors

If usage is zero, the health view should help the user understand whether:

- Claude Code has not been used yet
- The collector is not running
- Telemetry is not configured
- JSONL files are missing
- The dashboard cannot read the data folder
- Data exists but no usage event has been detected

---

## 10. User Setup Flow

The tool should provide a guided setup experience.

The setup should help the user:

1. Choose or confirm the local data folder.
2. Install or configure the local OpenTelemetry collector.
3. Enable automatic startup.
4. Configure Claude Code telemetry.
5. Validate that telemetry is working.
6. Open the dashboard.

The setup should avoid requiring the user to understand OpenTelemetry details.

The UI should show clear success or failure status for each step.

---

## 11. Startup Requirement

The tool should support automatic startup.

When enabled:

- The local collector should start when the user starts the machine or logs in.
- The startup behavior should be visible in the dashboard.
- The user should be able to enable or disable startup from the tool.
- The user should be able to restart the collector manually.
- The user should be able to stop the collector manually.

The dashboard should clearly show whether auto-start is enabled.

---

## 12. Privacy Requirement

The tool must be privacy-conscious by default.

By default, it should not collect:

- User prompts
- Full conversation content
- Tool result content
- File content
- Raw command content
- Sensitive workspace data

The tool should only collect usage metadata required for token and cost analysis.

If any optional setting could collect more detailed data, the UI must clearly warn the user before enabling it.

---

## 13. Local-Only Requirement

The tool should work locally by default.

It should not require:

- Cloud service
- Remote database
- Account login
- External dashboard
- Central server

All usage data should remain on the user’s machine unless the user explicitly exports or shares it.

---

## 14. Export Requirement

The dashboard should allow the user to export usage data.

Supported export options should include:

- Export selected day
- Export selected date range
- Export selected session
- Export all usage

Preferred export formats:

- JSONL
- CSV

The export should be saved to:

```text
~/.claude/usage-tracker/exports/
```

The user should be able to open the export folder from the dashboard.

---

## 15. Configuration Requirement

The tool should provide user-facing configuration for:

- Data folder path
- Auto-start enabled or disabled
- Dashboard refresh interval
- Data retention period
- Whether to keep raw OpenTelemetry files
- Whether to keep normalized usage files
- Export location
- Privacy options

The configuration should be editable from the VSCode extension UI.

---

## 16. Data Retention Requirement

The tool should support retention settings.

The user should be able to choose how long to keep:

- Raw OpenTelemetry JSONL files
- Normalized usage JSONL files
- Logs
- Exports

Default behavior should be conservative and avoid deleting usage data too aggressively.

The tool should never delete data without a clear retention setting or user action.

---

## 17. Error Handling Requirement

The tool should handle errors gracefully.

Examples:

- Collector cannot start
- Port is already in use
- JSONL output folder is missing
- JSONL file is malformed
- Dashboard cannot read file
- Telemetry is configured but no events are received
- Claude Code is running but usage remains zero
- Permission issue prevents writing files

The dashboard should show readable error messages and suggested actions.

---

## 18. Empty State Requirement

When there is no usage data, the dashboard should not simply show zero without explanation.

It should show an empty state explaining possible reasons:

- Claude Code has not sent telemetry yet.
- The collector is not running.
- Claude Code telemetry may not be configured.
- The selected date range has no usage.
- The data folder is empty.

The empty state should include a health check action.

---

## 19. Dashboard UX Requirement

The dashboard should be clean, modern, and easy to read.

Design expectations:

- Clear cards for key metrics
- Tables for detailed breakdowns
- Filters for date, model, and session
- Visual distinction between input, output, cache read, and cache creation
- Clear “last updated” timestamp
- Clear collector health status
- Light and dark mode support
- Good readability inside VSCode

The dashboard should feel like a polished developer tool, not a raw log viewer.

---

## 20. Filtering Requirement

The dashboard should support filtering by:

- Date range
- Session
- Model
- Query source
- Project or workspace, if available

Filters should update all visible metrics.

---

## 21. Search Requirement

The dashboard should support searching sessions or records by:

- Session ID
- Request ID
- Model name
- Project or workspace reference, if available

Search should be fast enough for local usage files.

---

## 22. Refresh Requirement

The dashboard should support:

- Manual refresh
- Auto refresh
- Last refreshed timestamp

The dashboard should not require VSCode restart to show new usage.

---

## 23. Data Integrity Requirement

The tool should avoid double-counting usage.

It should detect and ignore duplicate usage events where possible.

The dashboard should make it clear if some records are incomplete or missing fields.

The tool should tolerate partial files, interrupted writes, and restarts.

---

## 24. Cost Requirement

The dashboard should show cost as estimated cost.

The UI should label cost clearly as:

```text
Estimated cost
```

The tool should not present local cost as official billing.

Where possible, the dashboard should show:

- Cost by day
- Cost by session
- Cost by model
- Cost by request

---

## 25. Compatibility Requirement

The tool should support Claude Code usage from:

- Claude Code CLI
- Claude Code in VSCode

The tool should be designed so future support can be added for:

- Other editors
- Other local AI coding tools
- Other OpenTelemetry-compatible sources

---

## 26. Out of Scope for First Version

The first version does not need to support:

- Cloud dashboard
- Team management
- User authentication
- Centralized company reporting
- Billing reconciliation with official provider invoices
- Prompt content analysis
- Tool content analysis
- Remote telemetry upload
- Multi-user admin portal

These can be considered later.

---

## 27. MVP Scope

The first working version should include:

- Local OpenTelemetry collection
- Automatic startup
- JSONL output under `.claude/usage-tracker`
- Normalized usage JSONL files
- VSCode dashboard
- Today usage overview
- Daily usage view
- Session usage view
- Model usage view
- Collector health view
- Manual refresh
- Auto refresh
- Basic export
- Privacy-safe default configuration

---

## 28. Success Criteria

The implementation is successful when:

- The collector starts automatically after machine startup or user login.
- Claude Code usage events are written to JSONL.
- Usage data is stored under `.claude/usage-tracker`.
- The VSCode dashboard can display today’s usage.
- The dashboard can show usage by day, session, and model.
- Cache read and cache creation tokens are visible separately.
- Estimated cost is visible.
- The dashboard can detect when the collector is not working.
- The user can export usage data.
- The tool works without a remote server.
- The tool does not collect prompt or tool content by default.

---

## 29. Expected User Experience

A user should be able to:

1. Install the VSCode extension.
2. Open the Claude Usage dashboard.
3. Run the setup flow.
4. Enable local telemetry collection.
5. Use Claude Code normally.
6. Return to the dashboard and see usage data update.
7. Filter by day, model, or session.
8. Export usage data if needed.
9. Check health status if usage is missing.

The experience should feel simple even though OpenTelemetry is used internally.

---

## 30. Final Product Statement

Build a local-first Claude Code usage tracker that uses standard OpenTelemetry to capture token and cost usage, stores the output as JSONL under a dedicated `.claude` folder, and provides a polished VSCode dashboard for viewing usage by day, session, model, and cache behavior.

The product should be privacy-safe by default, require no server, start automatically with the machine, and help users clearly understand Claude Code token usage.
