// Use the real parser/controllers with in-memory model doubles. No database,
// environment configuration, queue, or external storage is initialized.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import xlsx, { version } from "xlsx";

async function controller(file, overrides) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    const context = vm.createContext({ Buffer, console });
    const module = new vm.SourceTextModule(source, { context });
    // Unused imports are inert, so importing a controller cannot open real services.
    const imports = new Map([...source.matchAll(/import\s+([^;]+?)\s+from\s+["']([^"']+)["'];/g)].map(([, clause, name]) => [name, clause.trim()]));
    await module.link(async (name) => {
        const clause = imports.get(name);
        const values = clause.startsWith("{")
            ? Object.fromEntries(clause.slice(1, -1).split(",").map((value) => [value.trim().split(/\s+as\s+/)[0], () => {}]))
            : { default: {} };
        Object.assign(values, name === "xlsx" ? { default: xlsx } : overrides[name]);
        return new vm.SyntheticModule(Object.keys(values), function () {
            for (const [key, value] of Object.entries(values)) this.setExport(key, value);
        }, { context });
    });
    await module.evaluate();
    return module.namespace;
}

function response() {
    return {
        headers: {}, statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        send(body) { this.body = body; return this; },
        setHeader(name, value) { this.headers[name] = value; },
    };
}

function workbook(rows, bookType = "xlsx") {
    const book = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(book, xlsx.utils.json_to_sheet(rows), "Contacts");
    return xlsx.write(book, { type: "buffer", bookType });
}

test("installed and locked spreadsheet parsers are outside both known affected ranges", async () => {
    const lock = JSON.parse(await readFile(new URL("./package-lock.json", import.meta.url), "utf8"));
    const manifest = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
    const patched = (value) => {
        const [major, minor, patch] = value.split(".").map(Number);
        return major > 0 || minor > 20 || (minor === 20 && patch >= 2);
    };
    assert(patched(version), `Vulnerable parser loaded: ${version}`);
    assert.equal(lock.packages["node_modules/xlsx"].version, version);
    assert.equal(manifest.dependencies.xlsx, `https://cdn.sheetjs.com/xlsx-${version}/xlsx-${version}.tgz`);
    assert.equal(lock.packages["node_modules/xlsx"].resolved, manifest.dependencies.xlsx);
    assert.match(lock.packages["node_modules/xlsx"].integrity, /^sha512-/);
    for (const [name, entry] of Object.entries(lock.packages)) {
        if (name.endsWith("node_modules/xlsx")) assert(patched(entry.version), `${name}: ${entry.version}`);
    }
});

for (const format of ["csv", "xlsx", "biff8"]) {
    test(`${format} contact imports preserve mapping, filtering, custom fields and CSV exports`, async () => {
        const stored = [];
        const models = {
            find() {
                return {
                    select: async () => stored,
                    populate() { return this; },
                    sort: async () => stored,
                };
            },
            async insertMany(rows) { stored.push(...rows); return rows; },
        };
        const api = await controller("./src/controllers/contact.controller.js", { "../models/contact.model.js": { default: models } });
        const buffer = workbook([
            { Name: "Aarav", Phone: "919876543210", Email: "aarav@example.test", Company: "Northstar", Tags: "Lead;VIP", Tier: "Gold" },
            { Name: "Priya", Phone: "919876543211", Email: "priya@example.test", Company: "Southstar", Tags: "Customer", Tier: "Silver" },
            { Name: "Duplicate", Phone: "919876543210" },
            { Name: "Invalid", Phone: "123" },
        ], format);
        const imported = response();
        const user = { _id: "test-account", role: "User" };
        await api.importContactsFromFile({ user, body: {}, file: { originalname: `contacts.${format === "biff8" ? "xls" : format}`, buffer } }, imported);
        assert.equal(imported.statusCode, 200, JSON.stringify(imported.body));
        assert.equal(imported.body.summary.importedCount, 2);
        assert.equal(imported.body.summary.duplicateCount, 1);
        assert.equal(imported.body.summary.invalidCount, 1);
        assert.equal(stored[0].customFields.Tier, "Gold");
        assert.equal(stored[0].tags.join(","), "Lead,VIP");

        const exported = response();
        await api.exportContactsToCSV({ user, query: {} }, exported);
        assert.equal(exported.statusCode, 200);
        assert.equal(exported.headers["Content-Type"], "text/csv; charset=utf-8");
        const sheet = xlsx.read(exported.body, { type: "string" });
        const rows = xlsx.utils.sheet_to_json(sheet.Sheets[sheet.SheetNames[0]], { raw: false });
        assert.equal(rows.length, 2);
        assert.equal(rows[0].Name, "Aarav");
        assert.equal(rows[0]["Phone Number"], "919876543210");
        assert.equal(rows[0].Tier, "Gold");
    });
}

test("campaign report templates and uploaded delivery results use the patched parser", async () => {
    let saves = 0;
    const campaign = {
        _id: "test-campaign", userId: "test-account", campaignTitle: "Offer",
        recipients: [{ phoneNumber: "919876543210" }, { phoneNumber: "919876543211" }],
        async save() { saves++; },
    };
    const api = await controller("./src/controllers/campaign.controller.js", {
        "../models/campaign.model.js": { default: { findById: () => ({ select: async () => campaign }) } },
    });
    const template = response();
    await api.downloadRecipientReportTemplate({ params: { id: campaign._id } }, template);
    assert.equal(template.statusCode, 200);
    assert(Buffer.isBuffer(template.body));
    const book = xlsx.read(template.body, { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1 });
    assert.equal(rows.length, 3);
    assert.equal(rows[1][0], "919876543210");

    const uploaded = response();
    await api.uploadRecipientReport({ params: { id: campaign._id }, user: { _id: campaign.userId }, file: { buffer: workbook([
        { "Phone Number": "919876543210", Status: "WhatsApp Successful" },
        { "Phone Number": "919876543211", Status: "Non-WhatsApp Failed" },
    ]) } }, uploaded);
    assert.equal(uploaded.statusCode, 200, JSON.stringify(uploaded.body));
    assert.equal(saves, 1);
    assert.equal(campaign.recipientReport.records[0].category, "whatsapp_successful");
    assert.equal(campaign.recipientReport.records[1].category, "non_whatsapp_failed");
});
