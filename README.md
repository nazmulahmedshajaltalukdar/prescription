# Prescription - AI-Driven Multi-Specialty Chamber

This repository is scaffolded for a production-ready, offline-first clinic management system tailored for Bangladesh.

What I added in this commit:
- Vite + React + TypeScript app scaffold
- Tailwind CSS setup
- Core components: Sidebar, Header, Layout
- Pages: Patient registration + Prescription editor (offline-first)
- Dexie.js local IndexedDB schema and a basic sync skeleton to Supabase
- Supabase client and a SQL migration (supabase/migrations/001_init.sql)

Next steps I'll implement after you review:
1. Full Auth integration (Supabase Auth + role-based UI)
2. Inventory and pharmacy flows with low-stock alerts
3. AI-prescription generation integrations (provider-agnostic)
4. Voice dictation hooks and offline audio capture
5. Sync conflict resolution and robust retry/backoff

