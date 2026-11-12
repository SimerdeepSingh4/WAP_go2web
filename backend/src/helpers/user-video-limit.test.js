import test from "node:test";
import assert from "node:assert/strict";
import userModel from "../models/user.model.js";

test("user model defaults maxVideoSizeMB to 9", () => {
    const user = new userModel({
        username: "testuser",
        email: "testuser@example.com",
        password: "password123",
    });
    assert.equal(user.maxVideoSizeMB, 9);
});

test("user model rejects negative or zero maxVideoSizeMB", () => {
    const user = new userModel({
        username: "testuser2",
        email: "testuser2@example.com",
        password: "password123",
        maxVideoSizeMB: 0,
    });
    const error = user.validateSync();
    assert.ok(error?.errors?.maxVideoSizeMB);
});

test("user model accepts custom maxVideoSizeMB set by superadmin", () => {
    const user = new userModel({
        username: "testuser3",
        email: "testuser3@example.com",
        password: "password123",
        maxVideoSizeMB: 25,
    });
    assert.equal(user.maxVideoSizeMB, 25);
    const error = user.validateSync();
    assert.equal(error, undefined);
});

