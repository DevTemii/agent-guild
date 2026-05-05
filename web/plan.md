# Agent Guild Stabilization Plan

## 1. CURRENT STATE SUMMARY

- What is working:
  - MiniPay wallet connection works, but still needs faster reconnect and clearer failure states.
  - Onchain Create Deal transaction works and emits a usable tx hash / project id.
  - Groq AI contract generation works and returns contract draft data.
  - Production is configured to use Postgres for workflow persistence.

- What is broken:
  - Create Deal sometimes hangs when Groq, wallet confirmation, receipt parsing, DB sync, and notification insert are coupled into one long flow.
  - Postgres writes have hit `DATABASE_WRITE_TIMEOUT` and `db_retry_failed`.
  - Freelancer notifications have failed to appear after successful onchain Create Deal.
  - Inbox has been inconsistent because reads previously depended on broad workflow snapshots and stale client cache fallback.
  - Frontend state can reset or drift after actions, especially after Create Deal, Retry Sync, Send Deal, and reload.

- Known errors:
  - `DATABASE_WRITE_TIMEOUT`
  - `DB retry failed`
  - `Workflow request timed out`
  - `Notification not delivered`
  - Inbox GET timeout from full-store reads
  - Create Deal succeeded onchain but backend sync stayed pending

## 2. CORE PRODUCT LOOP (TARGET STATE)

- Connect Wallet with MiniPay.
- Create Deal with a confirmed onchain transaction.
- Sync Deal to backend Postgres using tx hash, project id, client wallet, and freelancer wallet.
- Create `deal_sent` notification for freelancer.
- Freelancer opens app with the connected wallet.
- Freelancer inbox returns the pending contract immediately.
- Freelancer accepts the deal.
- Client funds escrow.
- Freelancer submits work.
- Client releases payment.
- State survives reloads and works across devices.

## 3. ROOT CAUSE BREAKDOWN

- Why memory store failed on Vercel:
  - Serverless instances do not share process memory.
  - Memory can disappear between requests, deployments, cold starts, or regions.
  - Contracts, notifications, and inbox reads can land on different instances, causing missing state.
  - Production must use Postgres only; memory fallback is acceptable only for local development.

- Why DB writes are timing out:
  - Some workflow writes read and rewrote the entire workflow database instead of only the affected rows.
  - Notification persistence previously replayed too many rows during mutations.
  - Long chained requests combined AI generation, onchain receipt wait, DB writes, and notification insert.
  - Serverless request limits and database connection latency amplify slow writes.

- Why notifications are not created:
  - Onchain Create Deal persisted the contract as `draft`, while freelancer inbox only returns `sent` or later contracts.
  - Notification rows did not consistently include `contract_id` and `type = "deal_sent"`.
  - Notification insert errors were too easy to swallow or hide behind generic workflow failures.
  - Wallet casing mismatches caused wallet-scoped reads to miss rows.

- Why frontend state becomes unstable:
  - Client state mixes backend state, local cache, pinned pending contracts, and event refreshes.
  - Failed backend sync can leave a local-only pending contract that the freelancer cannot see.
  - Cache fallback can show stale inbox data after an API failure.
  - Selected contract state is not always restored from the canonical backend record.

- Why long requests fail:
  - Groq generation, MiniPay wallet confirmation, receipt wait, DB sync, and notification delivery have different latency profiles.
  - Combining them into one blocking action creates timeout risk.
  - A successful onchain tx can be followed by a failed DB write, causing the app to look broken even though the chain action succeeded.

## 4. SYSTEM ARCHITECTURE (FINAL)

- Onchain layer:
  - Escrow contract is the source for project creation, funding, submission, release, and tx hashes.
  - Onchain Create Deal returns tx hash and project id.
  - Onchain state must never depend on local browser cache.

- Backend layer:
  - Postgres is the only production workflow store.
  - No memory fallback in production.
  - Tables must be row-oriented and idempotent:
    - `workflow_contracts`
    - `workflow_notifications`
    - `workflow_projects`
    - `workflow_submissions`

- API route responsibilities:
  - `/api/workflow/contracts/create`: generate draft contract only; do not wait on onchain tx.
  - `/api/workflow/projects/[id]/sync`: persist confirmed onchain project and link/sent contract state.
  - `/api/workflow/contracts/[id]/send`: mark draft as sent and create freelancer notification.
  - `/api/workflow/inbox/[wallet]`: lowercase wallet, query Postgres directly, return wallet-scoped contracts and notifications.
  - `/api/workflow/health`: verify DB readiness.
  - Temporary `/api/workflow/test-notification`: insert and verify notification delivery during stabilization.

- Frontend state flow:
  - Wallet address is normalized once and used everywhere.
  - Backend is the canonical state after every mutation.
  - Local cache is only a display aid, never the source of truth after API failure.
  - Pending onchain sync state is persisted locally only as a retry aid.

- Notification system:
  - Insert notification after successful backend sync.
  - Required row fields:
    - `wallet = freelancerWallet.toLowerCase()`
    - `contract_id`
    - `type = "deal_sent"`
    - `message`
    - `created_at`
  - Log:
    - `notification_insert_started`
    - `notification_insert_success`
    - `notification_insert_error`
    - `inbox_query_wallet`
    - `inbox_results_count`
  - Queue retry if insert fails.

## 5. STEP-BY-STEP FIX PLAN

### Phase 1: Stability

- Fix Create Deal timeout:
  - Keep Groq generation separate from onchain transaction.
  - Keep onchain transaction separate from backend sync.
  - Use short API timeouts and explicit UI states.

- Separate onchain tx from DB sync:
  - After onchain success, store `txHash`, `projectId`, `clientWallet`, and `freelancerWallet`.
  - Call backend sync after receipt confirmation.
  - If sync fails, show `Retry Sync` instead of leaving infinite loading.

- Implement `POST /api/workflow/projects/[id]/sync`:
  - Input: `projectId`, `txHash`, `contractDraft`, `clientWallet`, `freelancerWallet`.
  - Upsert project row.
  - Upsert contract row as `sent`.
  - Insert freelancer `deal_sent` notification.
  - Return canonical contract and notification count.

- Ensure DB writes are fast and idempotent:
  - Avoid full database read/write for single mutations.
  - Use targeted `insert ... on conflict do update`.
  - Add indexes for wallet and project lookups.
  - Keep request under 10 seconds.

- Ensure notification insert works:
  - Insert after confirmed backend contract persistence.
  - Include `contract_id` and `type = "deal_sent"`.
  - Log success and failure.
  - Queue retry on failure.

### Phase 2: Inbox Reliability

- Normalize wallet addresses:
  - Lowercase wallet in all API inputs.
  - Store lowercase wallet in all DB rows.
  - Lowercase connected wallet in frontend before fetching.

- Fix inbox route:
  - Query Postgres only in production.
  - Query only rows for the requested wallet.
  - Return contracts with statuses `sent`, `approved`, `funded`, `submitted`, `completed`.

- Remove stale cache usage:
  - Do not show cached inbox after failed inbox API call.
  - Show a visible error and retry action.
  - Keep local cache only for optimistic display while a request is active.

- Add debug logs:
  - Log `inbox_query_wallet`.
  - Log `inbox_results_count`.
  - Include store type in response.

### Phase 3: Frontend Consistency

- Prevent UI reset after Create Deal:
  - Persist pending sync data by wallet.
  - Restore pending sync state on reload.
  - Clear pending sync only after backend confirms persistence.

- Persist selected contract state:
  - Use contract id from backend as canonical selection.
  - Restore selected approved/sent contract after refresh.
  - Avoid replacing backend contracts with local-only records.

- Add loading and error states:
  - `Generating contract`
  - `Confirm in wallet`
  - `Waiting for receipt`
  - `Syncing to backend`
  - `Notification delivered`
  - `Sync failed`

- Add `Retry Sync` button:
  - Retry only backend sync.
  - Do not ask user to redo the onchain transaction.
  - Show tx hash and project id while retrying.

### Phase 4: Metrics Optimization

- Add 1-click `Send 0.1 CELO test deal`:
  - Pre-fill contract amount.
  - Use selected freelancer wallet.
  - Reduce friction for repeated Proof of Ship activity.

- Ensure each action produces a transaction where appropriate:
  - Create Deal
  - Fund escrow
  - Submit work
  - Release payment

- Track metrics:
  - Transaction count.
  - Daily active wallets.
  - Gas usage.
  - Deals created.
  - Deals accepted.
  - Deals completed.

- Add stats endpoint/dashboard:
  - `/api/workflow/stats`
  - Show total deals, active deals, completed deals, tx count, unique wallets.
  - Keep it simple and fast.

### Phase 5: Polish for Judging

- Ensure MiniPay wallet connects instantly:
  - Reduce reconnect prompts.
  - Show clear wrong-network messaging.
  - Persist last wallet and role safely.

- Ensure no broken links:
  - Verify client, freelancer, agent, explorer, and dashboard links.
  - Verify mobile viewport.

- Ensure no mock flows:
  - Remove or clearly isolate simulator-only paths.
  - Production loop must use real wallet, real tx, real Postgres state.

- Ensure full loop works without reload hacks:
  - Client creates deal.
  - Freelancer sees inbox without manual local storage edits.
  - Both users can reload and keep state.

## 6. DEBUGGING CHECKLIST

- Create Deal:
  - Wallet connected on Celo mainnet.
  - Groq returns draft.
  - MiniPay confirms transaction.
  - Receipt returns tx hash.
  - Receipt returns project id.

- Sync route:
  - Persists contract to Postgres.
  - Contract status is `sent`.
  - Contract has `linkedProjectId`.
  - Contract has `createTxHash`.
  - Project row exists.

- Notification:
  - `workflow_notifications.wallet` equals freelancer wallet lowercase.
  - `workflow_notifications.contract_id` equals contract id.
  - `workflow_notifications.type` equals `deal_sent`.
  - Insert logs show `notification_insert_success`.

- Inbox:
  - `/api/workflow/inbox/[wallet]` lowercases wallet.
  - Returns correct sent contract.
  - Returns correct notification.
  - Logs `inbox_query_wallet`.
  - Logs `inbox_results_count`.

- Different wallet:
  - Client wallet does not see freelancer-only inbox contract.
  - Freelancer wallet sees pending deal.
  - Unrelated wallet sees no deal.

- Reload:
  - Client still sees created/sent deal.
  - Freelancer still sees inbox item.
  - Pending sync state recovers if DB sync failed.

## 7. SUCCESS CRITERIA

- No infinite loading states.
- All API calls resolve within 10 seconds.
- Deals persist across reloads.
- Deals persist across devices.
- Freelancer always receives `deal_sent` notification after Create Deal / Send Deal.
- Inbox returns the correct contract for the connected freelancer wallet.
- At least one full loop is completed end-to-end:
  - Connect wallet.
  - Create Deal.
  - Sync backend.
  - Notify freelancer.
  - Freelancer accepts.
  - Client funds escrow.
  - Work submitted.
  - Payment released.

## 8. NEXT ITERATION (POST-STABILITY)

- Move from basic Postgres usage to more scalable infra if needed:
  - Add indexes.
  - Add connection pooling.
  - Add background jobs for retries.
  - Add event ingestion from chain logs.

- Improve UX:
  - Faster wallet reconnect.
  - Better progress timeline.
  - Better mobile layout.
  - Clear recovery states.

- Add retention mechanics:
  - Deal history.
  - Freelancer reputation.
  - Client repeat-deal shortcuts.
  - Notifications for pending actions.

- Expand AI features:
  - Contract risk summary.
  - Suggested milestones.
  - Delivery review assistant.
  - Dispute explanation assistant.
