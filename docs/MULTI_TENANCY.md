# Multi-tenancy in TravelX

## How it works today

- Every business row has an `agency_id`. It is set by a trigger from the caller's membership, never by the client.
- `agency_members.user_id` is **unique**, so one login belongs to exactly one agency.
- `private.current_agency_id()` returns the agency of the caller's single **active** membership. Every RLS policy compares
  `agency_id = private.current_agency_id()`, so a request can only ever see one agency's data.
- Suspending a member (status `suspended`) makes `current_agency_id()` return null on their next request. They lose access immediately,
  even while their session token is still valid. The server also bans their login (Supabase Auth admin API), so they cannot sign in
  again or refresh their session until they are reactivated.
- Cross-agency access is tested in `tests/integration/isolation.test.ts` and `tests/e2e/negative.spec.ts`.

## The limitation: one agency per login

A person who works for two agencies (a freelance agent, or an owner with two brands) can't use the same email for both.
Inviting an email that already belongs to another agency is refused with "A user with this email already exists".
That account is left untouched, and an e2e test checks this.

**Workaround available today:** use a separate login per agency. Many providers support plus-addressing, for example `name+brand2@company.com`.
Each login keeps its own role and audit trail.

## Recommended design for multi-agency access

The goal is to keep the guarantee that every request runs against exactly one agency, decided by the database rather than the client.

1. **Allow many memberships.** Replace `unique (user_id)` with `unique (agency_id, user_id)` on `agency_members`.
2. **Store the selected agency server-side.** Add `active_agency_id uuid` to `public.profiles` (FK to `agencies`). It can only be changed through
   `public.switch_agency(p_agency uuid)`, a `SECURITY DEFINER` function that checks the caller has an **active** membership in `p_agency`,
   writes it, and logs `agency.switched` to `activity_logs`. Add a profiles trigger so users can't write the column directly.
3. **Resolve the tenant from the selection plus membership.** Change the helpers so they still return a single value:
   ```sql
   select m.agency_id from public.agency_members m
   join public.profiles p on p.id = m.user_id
   where m.user_id = auth.uid() and m.status = 'active' and m.agency_id = p.active_agency_id
   ```
   `current_member_role()` uses the same join. No RLS policy needs to change. Revoking or suspending a membership still takes effect on the next request.
4. **Don't put the agency in JWT claims** (custom access-token hook) unless you also force a token refresh on every switch.
   A stale claim would keep the old agency until the token expires. The database lookup above is authoritative and immediate.
5. **App changes.**
   - Add an agency switcher to the account menu that calls `switch_agency` and then `router.refresh()`.
   - `getMembershipState` lists all active memberships. With exactly one, pick it automatically; with none selected, show a chooser.
   - Show the current agency name in the sidebar (already rendered).
6. **Invitations of existing users.** Create the membership row for the existing `user_id` (status `invited`) and require the person to accept
   in the app, which sets it to `active`. Never create a second auth user or change the existing one's password.
7. **Sign-up.** `handle_new_user` keeps creating one agency for self sign-ups and sets `active_agency_id` to it.
8. **Tests to add.**
   - Switching to an agency without a membership fails.
   - Data from agency A is invisible while B is active, and the reverse.
   - Suspending the active membership removes access.
   - The activity log records each switch.
   - Existing isolation tests run once per active agency.

Estimated scope: one migration, about five files in the app, and the tests above. The current single-agency guarantee is unchanged for users with one membership.
