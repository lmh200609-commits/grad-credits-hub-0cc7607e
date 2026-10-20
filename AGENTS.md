# Project architecture

- Keep deterministic credit comparisons in `src/lib/creditStandard.ts`, with document-based numeric regression tests; teacher and student views share this lookup to prevent differing references.
- Keep the evaluator's official credit reference in a local function module, not a frontend import, because edge function deployments cannot import `src/`.
- Serve added uploaded templates through asset pointers and checked Blob downloads so preview downloads retain the supplied workbook and requested filename.