# Project architecture

- Keep detection retry authorization and idempotency in the function-local retry policy; manual retries must bypass cached results only for authorized reviewers, while UI feedback reads persisted results with bounded waits and never blocks on full-page refresh.

- Keep application descriptions and verification text presentation in shared display helpers; every user-facing surface must decode structured data and localize internal labels without modifying stored evidence or credit decisions.

- Keep deterministic credit comparisons in `src/lib/creditStandard.ts`, with document-based numeric regression tests; teacher and student views share this lookup to prevent differing references.
- Keep the evaluator's official credit reference in a local function module, not a frontend import, because edge function deployments cannot import `src/`.
- Serve workbook templates from `public/templates` with English paths and checked Blob downloads; school LAN deployments must work without external asset services.
- Parse the retired-service block separately from ordinary achievement rows and exclude template examples, because its columns have different meanings.
- Keep credit-finalization policy in the evaluator's local credit-reference module; filled workbook applications require teacher confirmation because browser-reported compliance is not authoritative.- Pass evidence images to the vision model as short-lived signed URLs, not base64, because base64 encoding inside edge functions exhausts compute; an hourly process-eval-queue backstop retries missed evaluations one at a time.
