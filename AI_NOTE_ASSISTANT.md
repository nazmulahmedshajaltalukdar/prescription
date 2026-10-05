# AI administrative note assistant

The page is `src/pages/AiNoteAssistantPage.tsx`; the client wrapper and
request validation are in `src/services/aiNoteAssistant.ts`. It is routed as
`/ai-notes` and shown in the sidebar when the clinic's AI module is enabled.
The page is also protected by the tenant entitlement check in the Edge
Function.

The function independently verifies the
Supabase JWT, active profile, and active tenant/AI entitlement. It accepts
clinician-entered text only for summary or administrative note drafting; no
output is saved automatically. A clinician must explicitly request generation
and review any returned draft.

Deploy the new `ai-note-assistant` function after linking the Supabase project.
Set secrets on the server; never use `VITE_` names for provider secrets:

```sh
supabase secrets set APP_ORIGIN=https://<your-app-domain>
supabase secrets set AI_API_KEY=<provider-secret>
supabase secrets set AI_API_URL=https://api.openai.com/v1/chat/completions
supabase secrets set AI_MODEL=<provider-model>
supabase functions deploy ai-note-assistant
```

`AI_API_KEY` is required for provider calls. If it is absent, the function
returns HTTP 503 and does not use a mock response. `AI_API_URL` is optional and
defaults to the OpenAI-compatible Chat Completions endpoint shown above; custom
URLs must use HTTPS. `AI_MODEL` is optional and defaults to `gpt-4o-mini`.
Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` to the function runtime. Configure provider data
handling and retention appropriately before submitting sensitive clinical text.
