import test from "node:test";
import assert from "node:assert/strict";
import { BASE_COLUMNS, normalizeColumns, createSheetEvaluator, buildPublishedSheet } from "./campaignSpreadsheet.js";

const columns = (formula) => normalizeColumns([...BASE_COLUMNS, { id: "result", label: "Result", letter: "F", formula }]);
const rows = [
  { rowNumber: 125, phoneNumber: "001234567890", status: "delivered", category: "Delivered", billingAction: "keep", cells: {} },
  { rowNumber: 830, phoneNumber: "001234567890", status: "failed", category: "Wrong", billingAction: "refund", cells: {} },
];
const result = (formula, data = rows) => {
  const cols = columns(formula);
  const engine = createSheetEvaluator(data, cols);
  return data.map((row) => engine.get(row, cols[5]));
};

test("formulas use permanent All indexes across filtering, row moves, and column reordering", () => {
  const cols = columns('=IF(D{row}="refund",0,LEN(A{row}))');
  const moved = [...rows].reverse();
  const reordered = [cols[5], ...cols.slice(0, 5).reverse()];
  const engine = createSheetEvaluator(moved, reordered);
  assert.equal(engine.get(moved[0], cols[5]), 0);
  assert.equal(engine.get(moved[1], cols[5]), 12);
  assert.equal(engine.get(moved[1], cols[0]), "001234567890");
  assert.deepEqual(rows.map((row) => row.rowNumber), [125, 830]);
});

test("campaign formula actions and summary functions calculate correctly", () => {
  assert.deepEqual(result("=COUNTIF(A:A,A{row})>1"), [true, true]);
  assert.deepEqual(result('=COUNTIF(B:B,"delivered")/COUNTA(A:A)*100'), [50, 50]);
  assert.deepEqual(result('=IF(AND(LEN(A{row})>=10,LEN(A{row})<=15),"OK","Check")'), ["OK", "OK"]);
  assert.deepEqual(result('=SUMIF(D:D,"refund",A:A)'), [1234567890, 1234567890]);
  assert.deepEqual(result('=ROUND(10/3,2)+SUM(1,2,3)'), [9.33, 9.33]);
  assert.deepEqual(result('=TRIM(SUBSTITUTE(" +91  123 ","+",""))'), ["91 123", "91 123"]);
  assert.deepEqual(result('=IF(OR(TRUE,FALSE),"Yes",1/0)'), ["Yes", "Yes"]);
});

test("formula errors, cycles and JavaScript are rejected without execution", () => {
  assert.deepEqual(result("=F{row}"), ["#CYCLE!", "#CYCLE!"]);
  assert.deepEqual(result("=1/0"), ["#DIV/0!", "#DIV/0!"]);
  assert.deepEqual(result("=A1"), ["#REF!", "#REF!"]);
  assert.deepEqual(result("=globalThis.process.exit()"), ["#ERROR!", "#ERROR!"]);
  assert.throws(() => buildPublishedSheet(rows, columns("=F{row}")), /Fix formula errors/);
});

test("published report contains calculated values and all columns, without raw formulas", () => {
  const published = buildPublishedSheet(rows, columns('=IF(D{row}="refund",0,12)'));
  assert.equal(published.rows[0].values.result, 12);
  assert.equal(published.rows[1].values.result, 0);
  assert.equal(published.columns.length, 6);
  assert.ok(!("formula" in published.columns[5]));
  assert.ok(!("cells" in published.rows[0]));
  assert.equal(rows[0].billingAction, "keep");
});

test("50,000-row duplicate formulas use cached column counts", () => {
  const data = Array.from({ length: 50_000 }, (_, i) => ({ rowNumber: i + 1, phoneNumber: String(910000000000 + i % 25_000), cells: {} }));
  const cols = columns("=COUNTIF(A:A,A{row})>1");
  const engine = createSheetEvaluator(data, cols);
  for (const row of data) assert.equal(engine.get(row, cols[5]), true);
});

test("column validation retains fixed addresses and prevents duplicate identifiers", () => {
  assert.throws(() => normalizeColumns([...BASE_COLUMNS, { id: "result", letter: "A" }]), /unique/);
  assert.throws(() => normalizeColumns(BASE_COLUMNS.slice(1)), /five built-in/);
});
