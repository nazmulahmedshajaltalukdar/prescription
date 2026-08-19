## feat: offline-first Prescription editor + Dexie local storage

This PR adds an offline-first Prescription Editor with local storage using Dexie (IndexedDB). It also includes an autosave draft flow, basic validation, a quick medicines input component, and a listing page for locally saved prescriptions.

What changed
- Add src/components/MedicineInput.tsx — simple autocomplete + list UI for adding medicines
- Update src/pages/PrescriptionEditor.tsx — autosave (localStorage), validation, save to Dexie and queue for sync
- Add src/pages/PrescriptionsList.tsx — view locally saved prescriptions
- Update src/main.tsx — add routing for /prescriptions

How to test
1. Checkout branch: git fetch && git checkout feat/offline-prescription
2. Install: npm install
3. Start dev server: npm run dev
4. Visit /prescription to create a prescription, and /prescriptions to view saved items
5. Verify data in DevTools → Application → IndexedDB → ClinicDB → prescriptions

Notes
- This is an initial offline-first implementation. For production consider: encryption for PHI, robust sync conflict resolution, batch sync retries, and role-based access via Supabase Auth.
