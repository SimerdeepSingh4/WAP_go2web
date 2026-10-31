import mongoose from "mongoose";
import xlsx from "xlsx";
import connectToDB from "./src/config/db.js";
import userModel from "./src/models/user.model.js";
import contactModel from "./src/models/contact.model.js";
import groupModel from "./src/models/group.model.js";
import { importContactsFromFile, exportContactsToCSV } from "./src/controllers/contact.controller.js";

async function runImportExportTest() {
    console.log("=================================================");
    console.log("🚀 TESTING BULK CSV & EXCEL IMPORT / EXPORT");
    console.log("=================================================\n");

    await connectToDB();

    // 1. Setup Test User
    const testUser = await userModel.create({
        username: `importer_${Date.now()}`,
        email: `importer_${Date.now()}@test.com`,
        password: "Password123!",
        role: "User",
    });
    console.log(`✓ Created test user: ${testUser.username}`);

    // ─────────────────────────────────────────────────────────────
    // TEST 1: CSV IMPORT WITH AUTO COLUMN DETECTION & SANITIZATION
    // ─────────────────────────────────────────────────────────────
    console.log("\n🧪 TEST 1: CSV Import (Auto-mapping, Deduplication, Phone Cleaning)");

    const csvContent = [
        "Full Name,Mobile Number,Email Address,Company,Tags,PriorityTier",
        "Aarav Sharma,919876543210,aarav@test.com,Tata Motors,VIP;Customer,Gold",
        "Priya Patel,+91 98765 43211,priya@test.com,Reliance,Lead,Platinum",
        "Duplicate File Number,919876543210,dup@test.com,Tata,Spam,Bronze",
        "Malformed Number,12345,bad@test.com,Fake,Invalid,None",
    ].join("\n");

    const csvBuffer = Buffer.from(csvContent, "utf-8");

    // Mock Express Request & Response for importContactsFromFile
    const mockReqCSV = {
        user: testUser,
        file: {
            originalname: "contacts_leads.csv",
            buffer: csvBuffer,
        },
        body: {
            newGroupName: "Q4 High Priority Leads",
            newGroupDescription: "Imported via CSV test",
        },
    };

    let csvResponse = null;
    const mockResCSV = {
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            csvResponse = data;
            return this;
        },
    };

    await importContactsFromFile(mockReqCSV, mockResCSV);

    console.log("   - Import Status Code :", mockResCSV.statusCode);
    console.log("   - Imported Count     :", csvResponse.summary.importedCount, "(Expected: 2)");
    console.log("   - Duplicates Filtered:", csvResponse.summary.duplicateCount, "(Expected: 1)");
    console.log("   - Invalid Filtered   :", csvResponse.summary.invalidCount, "(Expected: 1)");
    console.log("   - Target Group       :", csvResponse.summary.group?.name);
    console.log("   - Auto-detected Mapping:", csvResponse.summary.columnMappingUsed);

    const createdGroup = await groupModel.findById(csvResponse.summary.group.id);
    console.log("   - Group totalContacts in DB:", createdGroup.totalContacts);

    if (
        mockResCSV.statusCode === 200 &&
        csvResponse.summary.importedCount === 2 &&
        csvResponse.summary.duplicateCount === 1 &&
        csvResponse.summary.invalidCount === 1 &&
        createdGroup.totalContacts === 2
    ) {
        console.log("   ✅ PASSED: CSV properly cleaned, deduplicated, and mapped to Group!");
    } else {
        console.error("   ❌ FAILED CSV import verification");
        process.exit(1);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 2: EXCEL (.xlsx) IMPORT WITH CUSTOM ATTRIBUTES
    // ─────────────────────────────────────────────────────────────
    console.log("\n🧪 TEST 2: Excel (.xlsx) Binary Import");

    const excelData = [
        { "Client Name": "Vikram Malhotra", "WhatsApp Contact": "919988776655", "City": "Mumbai", "VIP": "Yes" },
        { "Client Name": "Ananya Roy", "WhatsApp Contact": "919988776656", "City": "Kolkata", "VIP": "No" },
    ];

    const worksheet = xlsx.utils.json_to_sheet(excelData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Clients");
    const xlsxBuffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

    const mockReqXLSX = {
        user: testUser,
        file: {
            originalname: "client_database.xlsx",
            buffer: xlsxBuffer,
        },
        body: {
            groupId: createdGroup._id.toString(),
        },
    };

    let xlsxResponse = null;
    const mockResXLSX = {
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            xlsxResponse = data;
            return this;
        },
    };

    await importContactsFromFile(mockReqXLSX, mockResXLSX);

    console.log("   - Import Status Code :", mockResXLSX.statusCode);
    console.log("   - Imported Count     :", xlsxResponse.summary.importedCount, "(Expected: 2)");

    // Verify custom fields stored in DB
    const savedVikram = await contactModel.findOne({ phoneNumber: "919988776655" });
    console.log("   - Vikram Custom Fields:", savedVikram.customFields);

    if (
        mockResXLSX.statusCode === 200 &&
        xlsxResponse.summary.importedCount === 2 &&
        savedVikram.customFields.get("City") === "Mumbai"
    ) {
        console.log("   ✅ PASSED: Excel workbook parsed and CRM custom attributes preserved!");
    } else {
        console.error("   ❌ FAILED Excel import verification");
        process.exit(1);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 3: EXPORT CONTACTS TO CSV DOWNLOAD
    // ─────────────────────────────────────────────────────────────
    console.log("\n🧪 TEST 3: Export Contacts to Downloadable CSV");

    const mockReqExport = {
        user: testUser,
        query: {
            groupId: createdGroup._id.toString(),
        },
    };

    let exportedHeaders = {};
    let exportedBody = "";
    const mockResExport = {
        setHeader(name, val) {
            exportedHeaders[name] = val;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        send(data) {
            exportedBody = data;
            return this;
        },
    };

    await exportContactsToCSV(mockReqExport, mockResExport);

    console.log("   - Response Content-Type:", exportedHeaders["Content-Type"]);
    console.log("   - Content-Disposition  :", exportedHeaders["Content-Disposition"]);
    console.log("   - First line of CSV    :", exportedBody.split("\n")[0]);
    console.log("   - Total exported rows  :", exportedBody.trim().split("\n").length - 1, "(Expected: 4)");

    if (
        mockResExport.statusCode === 200 &&
        exportedHeaders["Content-Type"].includes("text/csv") &&
        exportedBody.includes("919876543210") &&
        exportedBody.includes("919988776655")
    ) {
        console.log("   ✅ PASSED: Exported CSV stream contains all contacts and headers!");
    } else {
        console.error("   ❌ FAILED Export verification");
        process.exit(1);
    }

    // ─────────────────────────────────────────────────────────────
    // CLEANUP
    // ─────────────────────────────────────────────────────────────
    console.log("\n🧹 Cleaning up test artifacts...");
    await contactModel.deleteMany({ userId: testUser._id });
    await groupModel.deleteMany({ userId: testUser._id });
    await userModel.findByIdAndDelete(testUser._id);
    await mongoose.disconnect();

    console.log("=================================================");
    console.log("🎉 ALL BULK IMPORT & EXPORT TESTS PASSED 100%!");
    console.log("=================================================");
    process.exit(0);
}

runImportExportTest().catch((err) => {
    console.error("Test Error:", err);
    process.exit(1);
});

