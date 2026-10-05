# Prescription - Multi-Specialty Clinic App

Offline-capable clinic workflows built with Vite, React, TypeScript, IndexedDB,
and Supabase. Features include patient records, prescriptions, appointments,
serial queue, shared inventory and pharmacy dispensing, BDT billing, lab
orders/results, and optional clinician-reviewed AI note drafting.

Dashboards and management controls are role-based: platform owners manage
clinics, plans, modules, branches, and clinic users; clinic administrators
manage their own users and locations; clinical staff use the workflow
dashboard. The operations modules require their tenant entitlement and the
matching Supabase migrations; AI additionally requires server-side provider
secrets. See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for setup and deployment.

## Development

```sh
npm install
npm test
npm run build
npm run dev
```

Without Supabase variables the application runs in demo mode. Demo users and
browser-local records are labeled as demo data and must not be used for real
patient records or payment records.

See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for backend configuration, ordered
database migrations, staff provisioning, and pre-production checks.
