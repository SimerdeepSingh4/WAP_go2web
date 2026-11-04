export const BASE_COLUMNS = [
  { id: "phoneNumber", label: "Phone number", letter: "A", field: "phoneNumber", width: 190 },
  { id: "status", label: "Delivery status", letter: "B", field: "status", width: 150 },
  { id: "category", label: "Category", letter: "C", field: "category", width: 170 },
  { id: "billingAction", label: "Credit treatment", letter: "D", field: "billingAction", width: 150 },
  { id: "notes", label: "Notes", letter: "E", field: "notes", width: 220 },
];

export function columnLetter(index) {
  let result = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result;
  return result;
}

export function normalizeColumns(input = []) {
  if (!Array.isArray(input) || input.length > 40) throw new Error("A report supports up to 40 columns.");
  const columns = input.length ? input : BASE_COLUMNS;
  const ids = new Set(), letters = new Set();
  const normalized = columns.map((column) => {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(column.id) || ["constructor", "prototype", "__proto__"].includes(column.id)) throw new Error("Invalid column ID.");
    if (ids.has(column.id) || letters.has(column.letter) || !/^[A-Z]{1,2}$/.test(column.letter)) throw new Error("Columns need unique IDs and addresses.");
    ids.add(column.id); letters.add(column.letter);
    const base = BASE_COLUMNS.find((item) => item.id === column.id);
    if (base && column.letter !== base.letter) throw new Error("Built-in column addresses cannot change.");
    if (!base && column.formula && !String(column.formula).startsWith("=")) throw new Error("Start a column formula with =.");
    return {
      id: column.id, label: String(column.label || "Untitled").trim().slice(0, 80), letter: column.letter,
      field: base?.field || "custom", width: Math.max(110, Math.min(480, Number(column.width) || 180)),
      formula: base ? "" : String(column.formula || "").slice(0, 1000),
    };
  });
  if (BASE_COLUMNS.some((column) => !ids.has(column.id))) throw new Error("Keep all five built-in report columns.");
  return normalized;
}

// A small expression parser: no eval, property access, network, or JavaScript.
export function parseFormula(source) {
  if (source.length > 1000) throw new Error("Formula too long");
  const tokens = [];
  const pattern = /\s*(?:(\d+(?:\.\d+)?)|("(?:[^"]|"")*")|(\$?[A-Za-z_]+\$?\d*)|(<=|>=|<>|[+\-*/%=<>(),:]))/gy;
  let offset = 0;
  while (offset < source.length) {
    if (!source.slice(offset).trim()) break;
    pattern.lastIndex = offset;
    const match = pattern.exec(source);
    if (!match) throw new Error("Unsupported formula syntax");
    tokens.push(match[1] ? { number: Number(match[1]) } : match[2] ? { text: match[2].slice(1, -1).replace(/""/g, '"') } : match[3] ? match[3].replace(/\$/g, "").toUpperCase() : match[4]);
    offset = pattern.lastIndex;
  }
  let cursor = 0;
  const peek = () => tokens[cursor];
  const take = () => tokens[cursor++];
  const expect = (token) => { if (take() !== token) throw new Error("Unbalanced formula"); };
  const precedence = { "=": 1, "<>": 1, "<": 1, ">": 1, "<=": 1, ">=": 1, "+": 2, "-": 2, "*": 3, "/": 3 };
  function primary() {
    const token = take();
    let result;
    if (token === "+" || token === "-") result = { unary: token, value: primary() };
    else if (token === "(") { result = expression(0); expect(")"); }
    else if (token && typeof token === "object") result = { literal: token.number ?? token.text };
    else if (typeof token === "string" && /^[A-Z_]+\d*$/.test(token)) {
      if (peek() === "(") {
        take(); const args = [];
        if (peek() !== ")") { do { if (args.length) expect(","); args.push(expression(0)); } while (peek() === ","); }
        expect(")"); result = { fn: token, args };
      } else if (["TRUE", "FALSE"].includes(token)) result = { literal: token === "TRUE" };
      else {
        const match = /^([A-Z]{1,2})(\d+)?$/.exec(token);
        if (!match) throw new Error("Unknown reference");
        result = { col: match[1], row: match[2] ? Number(match[2]) : null };
        if (peek() === ":") { take(); const end = primary(); if (!end.col) throw new Error("Invalid range"); result = { range: [result, end] }; }
      }
    } else throw new Error("Invalid formula");
    if (peek() === "%") { take(); result = { unary: "%", value: result }; }
    return result;
  }
  function expression(min) {
    let left = primary();
    while (typeof peek() === "string" && (precedence[peek()] || 0) > min) {
      const op = take(); left = { op, left, right: expression(precedence[op]) };
    }
    return left;
  }
  const ast = expression(0);
  if (cursor !== tokens.length) throw new Error("Unexpected formula content");
  return ast;
}

const keyOf = (value) => String(value ?? "").toLowerCase();
const numeric = (value) => {
  if (typeof value === "boolean") return Number(value);
  const number = Number(value || 0);
  if (!Number.isFinite(number)) throw new Error("#VALUE!");
  return number;
};

export function createSheetEvaluator(rows, columns) {
  const byRow = new Map(rows.map((row) => [row.rowNumber, row]));
  const byLetter = new Map(columns.map((col) => [col.letter, col]));
  const cache = new Map(), visiting = new Set(), parsed = new Map(), ranges = new Map(), histograms = new Map();
  function raw(row, col) {
    if (col.field !== "custom") return row[col.field] ?? "";
    return row.cells?.[col.id] ?? (col.formula ? col.formula.replace(/\{row\}/g, String(row.rowNumber)) : "");
  }
  function cell(rowId, letter, depth = 0) {
    const key = `${letter}${rowId}`;
    if (cache.has(key)) return cache.get(key);
    if (visiting.has(key) || depth > 50) throw new Error("#CYCLE!");
    const row = byRow.get(rowId), col = byLetter.get(letter);
    if (!row || !col) throw new Error("#REF!");
    const value = raw(row, col);
    if (col.field !== "custom" || typeof value !== "string" || !value.startsWith("=")) return value;
    visiting.add(key);
    try {
      if (!parsed.has(value)) parsed.set(value, parseFormula(value.slice(1)));
      const result = evaluate(parsed.get(value), depth + 1);
      if (Array.isArray(result) || (typeof result === "number" && !Number.isFinite(result))) throw new Error("#VALUE!");
      cache.set(key, result); return result;
    } finally { visiting.delete(key); }
  }
  function range(node, depth) {
    const id = JSON.stringify(node.range);
    if (ranges.has(id)) return ranges.get(id);
    const [start, end] = node.range;
    const letters = columns.map((col) => col.letter).sort((a, b) => a.length - b.length || a.localeCompare(b));
    const first = letters.indexOf(start.col), last = letters.indexOf(end.col);
    if (first < 0 || last < first) throw new Error("#REF!");
    const values = [];
    for (const row of rows) if ((!start.row || row.rowNumber >= start.row) && (!end.row || row.rowNumber <= end.row)) {
      for (const letter of letters.slice(first, last + 1)) values.push(cell(row.rowNumber, letter, depth));
    }
    ranges.set(id, values); return values;
  }
  function evaluate(node, depth) {
    if (Object.hasOwn(node, "literal")) return node.literal;
    if (node.col) { if (!node.row) throw new Error("#REF!"); return cell(node.row, node.col, depth); }
    if (node.range) return range(node, depth);
    if (node.unary) { const n = numeric(evaluate(node.value, depth)); return node.unary === "-" ? -n : node.unary === "%" ? n / 100 : n; }
    if (node.op) {
      const a = evaluate(node.left, depth), b = evaluate(node.right, depth);
      switch (node.op) {
        case "=": return keyOf(a) === keyOf(b); case "<>": return keyOf(a) !== keyOf(b);
        case "<": return a < b; case ">": return a > b; case "<=": return a <= b; case ">=": return a >= b;
        case "+": return numeric(a) + numeric(b); case "-": return numeric(a) - numeric(b);
        case "*": return numeric(a) * numeric(b); case "/": if (!numeric(b)) throw new Error("#DIV/0!"); return numeric(a) / numeric(b);
      }
    }
    if (node.fn === "IF") return evaluate(node.args[evaluate(node.args[0], depth) ? 1 : 2] || { literal: "" }, depth);
    if (["COUNTIF", "SUMIF"].includes(node.fn)) {
      const values = evaluate(node.args[0], depth);
      if (!Array.isArray(values)) throw new Error("#VALUE!");
      const criterion = evaluate(node.args[1], depth);
      const rangeId = JSON.stringify(node.args[0]);
      if (node.fn === "COUNTIF" && !/^[<>=]|[?*]/.test(String(criterion))) {
        if (!histograms.has(rangeId)) {
          const histogram = new Map();
          for (const value of values) histogram.set(keyOf(value), (histogram.get(keyOf(value)) || 0) + 1);
          histograms.set(rangeId, histogram);
        }
        return histograms.get(rangeId).get(keyOf(criterion)) || 0;
      }
      const sums = node.fn === "SUMIF" && node.args[2] ? evaluate(node.args[2], depth) : values;
      if (!Array.isArray(sums) || sums.length !== values.length) throw new Error("#VALUE!");
      const compare = /^(<=|>=|<>|<|>|=)(.*)$/.exec(String(criterion));
      const matches = (value) => {
        if (!compare) return keyOf(value) === keyOf(criterion);
        const rhs = compare[2] === "" || Number.isNaN(Number(compare[2])) ? compare[2] : Number(compare[2]);
        switch (compare[1]) { case ">": return value > rhs; case "<": return value < rhs; case ">=": return value >= rhs; case "<=": return value <= rhs; case "<>": return keyOf(value) !== keyOf(rhs); default: return keyOf(value) === keyOf(rhs); }
      };
      return values.reduce((sum, value, index) => sum + (matches(value) ? node.fn === "COUNTIF" ? 1 : numeric(sums[index]) : 0), 0);
    }
    const args = node.args.map((arg) => evaluate(arg, depth));
    const values = args.flat();
    switch (node.fn) {
      case "SUM": return values.reduce((sum, value) => sum + (Number.isFinite(Number(value)) ? Number(value) : 0), 0);
      case "COUNT": return values.filter((value) => value !== "" && typeof value !== "boolean" && Number.isFinite(Number(value))).length;
      case "COUNTA": return values.filter((value) => value !== "" && value != null).length;
      case "AND": return values.every(Boolean); case "OR": return values.some(Boolean);
      case "LEN": return String(args[0] ?? "").length;
      case "TRIM": return String(args[0] ?? "").trim().replace(/\s+/g, " ");
      case "SUBSTITUTE": if (!String(args[1] ?? "")) return String(args[0] ?? ""); return String(args[0] ?? "").split(String(args[1])).join(String(args[2] ?? ""));
      case "ROUND": { const factor = 10 ** Math.max(-10, Math.min(10, numeric(args[1]))); return Math.round(numeric(args[0]) * factor) / factor; }
      default: throw new Error("#NAME?");
    }
  }
  return {
    raw,
    get(row, col) {
      try { return cell(row.rowNumber, col.letter); }
      catch (error) { return /^#[A-Z/0-9]+[!?]$/.test(error.message) ? error.message : "#ERROR!"; }
    },
  };
}

export function normalizeDuplicateRows(entries) {
  const phone = (row) => String(row.phoneNumber || "").replace(/\D/g, "");
  const totals = new Map();
  for (const row of entries) totals.set(phone(row), (totals.get(phone(row)) || 0) + 1);
  const firstRows = new Map();
  const updates = new Map();
  for (const row of [...entries].sort((a, b) => a.rowNumber - b.rowNumber)) {
    const key = phone(row);
    if (!key || totals.get(key) < 2) continue;
    const previous = firstRows.get(key);
    if (previous === undefined) {
      firstRows.set(key, row.rowNumber);
      if (row.tabKey === "duplicate" || row.classification === "duplicate") {
        updates.set(row, { ...row, tabKey: "delivered", classification: "delivered", category: "Delivered", status: "delivered", billingAction: "keep", isDuplicate: false, notes: String(row.notes || "").replace(/Already listed in row \d+\./g, "").trim() });
      }
      continue;
    }
    const note = `Already listed in row ${previous}.`;
    const existingNotes = String(row.notes || "").replace(/Already listed in row \d+\./g, "").trim();
    updates.set(row, { ...row, tabKey: "duplicate", classification: "duplicate", category: "Duplicate number", status: "failed", billingAction: "refund", isDuplicate: true, notes: existingNotes ? `${existingNotes}\n${note}` : note });
  }
  return entries.map((row) => updates.get(row) || row);
}

export function buildPublishedSheet(entries, inputColumns) {
  const columns = normalizeColumns(inputColumns);
  const evaluator = createSheetEvaluator(entries, columns);
  const rows = entries.map((entry) => {
    const values = Object.fromEntries(columns.map((column) => [column.id, evaluator.get(entry, column)]));
    for (const value of Object.values(values)) if (typeof value === "string" && /^#(?:ERROR|REF|CYCLE|NAME|VALUE|DIV\/0)[!?]$/.test(value)) throw new Error(`Fix formula errors before publishing (All index ${entry.rowNumber}).`);
    return {
      rowNumber: entry.rowNumber, phoneNumber: entry.phoneNumber, status: entry.status,
      category: entry.category, billingAction: entry.billingAction, tabKey: entry.tabKey,
      notes: entry.notes || "", values,
    };
  });
  return { columns: columns.map(({ formula, ...column }) => column), rows };
}
