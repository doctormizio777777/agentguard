import assert from "node:assert/strict";
import test from "node:test";

import { buildHourlySeries, sparklinePoints } from "../app/dashboard-utils.ts";


const NOW = Date.UTC(2026, 6, 17, 12, 30);
const actions = [
  { created_at: "2026-07-17 01:15:00", status: "allowed", action_type: "payment", amount: "10.00" },
  { created_at: "2026-07-17 11:05:00", status: "pending_approval", action_type: "payment", amount: "700.00" },
  { created_at: "2026-07-17 12:02:00", status: "blocked", action_type: "payment", amount: "5000.00" },
  { created_at: "2026-07-17 12:12:00", status: "allowed", action_type: "email_send", amount: null },
  { created_at: "2026-07-17 00:59:59", status: "blocked", action_type: "payment", amount: "25.00" },
];


test("buildHourlySeries returns twelve UTC buckets and excludes older actions", () => {
  assert.deepEqual(buildHourlySeries(actions, "actions", NOW), [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2]);
});


test("buildHourlySeries aggregates the matching KPI metric", () => {
  assert.deepEqual(buildHourlySeries(actions, "spend", NOW), [1000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(buildHourlySeries(actions, "pending", NOW), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0]);
  assert.deepEqual(buildHourlySeries(actions, "blocked", NOW), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
});


test("sparklinePoints creates deterministic padded SVG coordinates", () => {
  assert.equal(sparklinePoints([0, 5, 10], 100, 20, 2), "2.00,18.00 50.00,10.00 98.00,2.00");
  assert.equal(sparklinePoints([4, 4], 100, 20, 2), "2.00,10.00 98.00,10.00");
});

