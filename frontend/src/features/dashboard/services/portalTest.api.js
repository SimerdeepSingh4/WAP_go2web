import apiClient from "../../../api/client.js";

// --- Credits ---
export async function getCreditBalance(userId) {
    const url = userId ? `/credits/balance?userId=${userId}` : "/credits/balance";
    const res = await apiClient.get(url);
    return res.data;
}

export async function allocateCredits(payload) {
    // payload: { toUserId, amount, notes }
    const res = await apiClient.post("/credits/allocate", payload);
    return res.data;
}

export async function reclaimCredits(payload) {
    // payload: { fromUserId, amount, notes }
    const res = await apiClient.post("/credits/reclaim", payload);
    return res.data;
}

export async function deductCredits(payload) {
    // payload: { userId, messageCount, amount, notes }
    const res = await apiClient.post("/credits/deduct", payload);
    return res.data;
}

export async function getCreditTransactions() {
    const res = await apiClient.get("/credits/transactions");
    return res.data;
}

// --- Users (Register/List) ---
export async function createAccount(payload) {
    // payload: { username, email, password, role, resellerId }
    const res = await apiClient.post("/auth/register", payload);
    return res.data;
}

export async function getManagedUsers() {
    const res = await apiClient.get("/users");
    return res.data;
}

// --- Templates ---
export async function createTemplate(payload) {
    const res = await apiClient.post("/templates", payload);
    return res.data;
}

export async function getTemplates() {
    const res = await apiClient.get("/templates");
    return res.data;
}

// --- Campaigns ---
export async function createCampaign(payload) {
    const res = await apiClient.post("/campaigns", payload);
    return res.data;
}

export async function getCampaigns() {
    const res = await apiClient.get("/campaigns");
    return res.data;
}

export async function updateCampaignStatus({ campaignId, status }) {
    const res = await apiClient.patch(`/campaigns/${campaignId}/status`, { status });
    return res.data;
}

// --- Groups ---
export async function createGroup(payload) {
    const res = await apiClient.post("/groups", payload);
    return res.data;
}

export async function getGroups() {
    const res = await apiClient.get("/groups");
    return res.data;
}

export async function deleteGroup(id) {
    const res = await apiClient.delete(`/groups/${id}`);
    return res.data;
}

// --- Contacts ---
export async function createContact(payload) {
    const res = await apiClient.post("/contacts", payload);
    return res.data;
}

export async function getContacts(groupId) {
    const url = groupId ? `/contacts?groupId=${groupId}` : "/contacts";
    const res = await apiClient.get(url);
    return res.data;
}

export async function deleteContact(id) {
    const res = await apiClient.delete(`/contacts/${id}`);
    return res.data;
}

