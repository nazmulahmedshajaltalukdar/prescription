# Supabase setup

The app can run in demo mode without a Supabase project, but demo accounts and
local IndexedDB data are not shared clinic accounts or a production backup.
Configure Supabase before entering real patient data.

## Configure the project

1. Create a Supabase project in the intended region and keep its database and
   Auth services private to the clinic team.
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` from the project's API settings. The browser app
   must only receive the publishable/anon key; never put a service-role key in
   a `VITE_` variable or commit it.
3. Enable email sign-ups and email confirmations in Supabase Auth. Require
  confirmation before users can sign in; use Supabase's CAPTCHA/rate limits
  for the public registration endpoint. Set the Auth Site URL to the app
  origin and add these callback URLs
  `http://localhost:5173/set-password` and
  `http://localhost:5173/login`,
  `https://<your-app-domain>/set-password`, and
  `https://<your-app-domain>/login` to the redirect URL allow-list.
  Invited staff use the `/set-password` URL; public clinic owners verify
  their email and return to `/login?verified=1`.
4. Apply every SQL file in `supabase/migrations` in numeric order using the
   Supabase SQL Editor (001 through 010). Confirm each finishes successfully
   before moving to the next. Do not run only the newest migration on an empty
   project. Migration 003 explicitly grants the required authenticated API
   privileges because automatic table exposure is disabled; row-level access
   remains controlled by RLS. Migration 006 allows signed-in users to update
   only their own profile display name; role and clinic scope remain
   administrator-controlled. Migration 007 adds platform-owner scope, clinic
   registry/settings, locations, active accounts, plan limits, and RLS checks.
   Migration 008 provisions a clinic, location, and inactive clinic-owner
   profile on public registration, then activates that owner after email
   verification. Migration 005 hardens serial issuance: only an authorized
   clinic profile can issue a ticket, and retry/concurrent requests for the
   same appointment return one ticket rather than issuing duplicates.
   Migration 009 adds a protected JSON field for the complete prescription
   print snapshot, including follow-up instructions and the drawn-signature
   image. Migration 010 adds tenant-scoped inventory, atomic stock adjustments
   and dispensing, BDT invoices and payment recording, lab orders/results, and
   server-side enforcement of clinic module entitlements.
5. After the migrations complete, provision one trusted platform-owner Auth
   user by inserting its `public.profiles` row from the SQL Editor. Assign
   `platform_owner` only to this trusted account; the browser admin screen
   cannot grant that role. Sign in as the platform owner, create clinics from
   the Platform Owner Dashboard, then invite clinic admins/staff from the UI.
   Public clinic signup creates verified clinic-owner accounts. Tenant IDs
   and locations are created with each clinic.
   Existing clinic deployments can create their clinic profiles in SQL after
   ensuring the corresponding tenant/location exists. For example:

   ```sql
   insert into public.profiles (id, full_name, role, tenant_id, sub_tenant_id, plan_tier)
   values (
     '<auth-user-uuid>',
     'Platform Owner',
     'platform_owner',
     'platform',
     'platform-main',
     'starter_5'
   );
   ```

   Use a unique tenant ID for each customer/clinic and a location ID for each
   sub-clinic. The Edge Function provisions Auth invitations securely; the
   service-role key must never be placed in browser environment variables.
6. Install and link the Supabase CLI to this project, then configure and deploy
   the protected management and AI Edge Functions:

   ```sh
   supabase secrets set APP_ORIGIN=https://<your-app-domain>
   supabase functions deploy admin-management
   supabase functions deploy ai-note-assistant
   ```

   Supabase supplies the function's server-side `SUPABASE_URL`,
   `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`; do not expose the
   service-role key to the Vite app. For local development, set
   `APP_ORIGIN=http://localhost:5173`.
   AI note drafting is disabled until an AI provider is explicitly configured
   with server-side secrets:

   ```sh
   supabase secrets set AI_API_KEY=<provider-secret>
   supabase secrets set AI_API_URL=https://api.openai.com/v1/chat/completions
   supabase secrets set AI_MODEL=<provider-model>
   ```

   Never use a `VITE_` variable for an AI provider key. The AI tool only
   summarizes/organizes supplied text into a draft; a clinician must review it.

7. Start the app with `npm run dev`, sign in with the platform-owner Auth
   account, create clinics, and invite their owners/admins and staff from the
   UI. Clinic admins can then manage their own locations and staff. Verify
   clinic boundaries and sync behavior before entering production data.

Users can request a password recovery email from the sign-in page. Recovery
links return to `/set-password`; only a valid invitation or recovery session
can update the password. Public clinic registration creates a new tenant with
the default `starter_5` plan; signups cannot choose their role, tenant ID,
plan, or module entitlements.

Changing `.env.local` requires restarting Vite. The migration scripts enable
row-level security; do not disable it to work around an access error. An account
without a clinic profile is intentionally denied app access until an
administrator provisions it.

## Pre-production verification

- Run `npm test` and `npm run build`.
- In a non-production Supabase project, create two tenants and verify a user
  from each cannot read or mutate the other tenant's patients, visits,
  prescriptions, appointments, or serial tickets.
- Create a patient, appointment, prescription, and serial while online; confirm
  the records appear in the correct Supabase tables.
- Create records while offline, reconnect, and verify they sync once without
  losing the local data.
- Test serial retries and concurrent requests for the same appointment; the
  same appointment must not receive multiple serial tickets.
- Verify inventory cannot be read or changed with its module disabled, stock
  cannot become negative, and concurrent dispensing for one prescription only
  deducts stock once.
- Verify invoice and payment totals, repeated payment-request IDs, clinic
  boundaries, and the billing entitlement.
- Verify lab order/result access respects tenant/location and labs entitlement.
- Verify AI calls fail clearly when the provider secret is absent and no
  provider key is present in browser assets or requests.
- Back up the database and rehearse restore before importing real clinic data.

This repository has no project credentials, so remote migrations, Auth
provisioning, and clinic-data acceptance checks must be completed against the
clinic's own Supabase project before release.

Plan/seat/location limits and module entitlements are managed in the UI and
also checked by database policies/RPCs. With Supabase configured, inventory,
pharmacy dispensing, BDT billing, and laboratory orders/results use shared,
tenant-scoped records. Without Supabase, these workflows are explicitly
browser-local demo data. AI note drafting is an optional, clinician-reviewed
provider integration; it returns a configuration error until server-side
provider credentials are installed.
