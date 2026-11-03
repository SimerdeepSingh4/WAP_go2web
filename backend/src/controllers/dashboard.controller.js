import userModel from "../models/user.model.js";
import walletModel from "../models/wallet.model.js";
import campaignModel from "../models/campaign.model.js";
import transactionModel from "../models/transaction.model.js";
import contactModel from "../models/contact.model.js";
import groupModel from "../models/group.model.js";
import templateModel from "../models/template.model.js";

/**
 * GET /api/dashboard/stats
 * ------------------------
 * Returns role-tailored dashboard metrics and analytics:
 * - Super Admin: Platform-wide overview, revenue/credits, active resellers/users, total messages sent/delivered
 * - Reseller: My wallet balance, total clients, credits distributed, clients' message volume sent/delivered
 * - User: Personal wallet balance, messages sent / delivered / failed, total contacts, remaining balance
 */
export const getDashboardStats = async (req, res) => {
    try {
        const { role, _id: userId } = req.user;

        // ─────────────────────────────────────────────────────────────
        // 1. SUPER ADMIN METRICS
        // ─────────────────────────────────────────────────────────────
        if (role === "Super Admin") {
            const [
                totalUsers,
                totalResellers,
                activeResellers,
                totalPlatformAccounts,
                walletSumResult,
                superAdminAllocResult,
                totalCampaigns,
                campaignAggregation,
                campaignStatusesResult,
                totalContacts,
                totalGroups,
                totalTemplates,
                recentCampaigns,
            ] = await Promise.all([
                userModel.countDocuments({ role: "User" }),
                userModel.countDocuments({ role: "Reseller" }),
                userModel.countDocuments({ role: "Reseller", status: "active" }),
                userModel.countDocuments(),
                walletModel.aggregate([
                    { $group: { _id: null, totalBalance: { $sum: "$balance" } } },
                ]),
                transactionModel.aggregate([
                    { $match: { fromUser: null, type: "ALLOCATE" } },
                    { $group: { _id: null, total: { $sum: "$amount" } } },
                ]),
                campaignModel.countDocuments(),
                campaignModel.aggregate([
                    {
                        $group: {
                            _id: null,
                            totalRecipients: { $sum: "$totalRecipients" },
                            totalSent: { $sum: { $ifNull: ["$campaignSummary.sent", 0] } },
                            totalDelivered: { $sum: { $ifNull: ["$campaignSummary.delivered", 0] } },
                            totalFailed: { $sum: { $ifNull: ["$campaignSummary.failed", 0] } },
                            totalRead: { $sum: { $ifNull: ["$campaignSummary.read", 0] } },
                        },
                    },
                ]),
                campaignModel.aggregate([
                    { $group: { _id: "$status", count: { $sum: 1 } } },
                ]),
                contactModel.countDocuments(),
                groupModel.countDocuments({ isDeleted: false }),
                templateModel.countDocuments(),
                campaignModel
                    .find()
                    .select("campaignTitle totalRecipients status campaignSummary createdAt messageType")
                    .populate("userId", "username email role")
                    .sort({ createdAt: -1 })
                    .limit(5),
            ]);

            const totalCreditsInCirculation = walletSumResult[0]?.totalBalance || 0;
            const totalAllocated = superAdminAllocResult[0]?.total || 0;
            const agg = campaignAggregation[0] || {};
            const totalRecipientsRequested = agg.totalRecipients || 0;
            const totalMessagesSent = agg.totalSent || 0;
            const totalMessagesDelivered = agg.totalDelivered || 0;
            const totalMessagesFailed = agg.totalFailed || 0;
            const totalMessagesRead = agg.totalRead || 0;

            const campaignStatusMap = {};
            campaignStatusesResult.forEach((item) => {
                campaignStatusMap[item._id] = item.count;
            });

            return res.status(200).json({
                success: true,
                role: "Super Admin",
                stats: {
                    accounts: {
                        totalUsers,
                        totalResellers,
                        activeResellers,
                        totalPlatformAccounts,
                    },
                    credits: {
                        totalCreditsInCirculation,
                        totalAllocatedBySuperAdmin: totalAllocated,
                    },
                    campaigns: {
                        totalCampaigns,
                        totalRecipientsRequested,
                        totalMessagesSent,
                        totalMessagesDelivered,
                        totalMessagesFailed,
                        totalMessagesRead,
                        statusBreakdown: campaignStatusMap,
                    },
                    assets: {
                        totalContacts,
                        totalGroups,
                        totalTemplates,
                    },
                    recentCampaigns,
                },
            });
        }

        // ─────────────────────────────────────────────────────────────
        // 2. RESELLER METRICS
        // ─────────────────────────────────────────────────────────────
        if (role === "Reseller") {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

            const [clientUsers, myWallet, distributedResult, clientWalletsResult, receivedResult, thisMonthReceivedResult] =
                await Promise.all([
                    userModel.find({ resellerId: userId }).select("_id status"),
                    walletModel.findOne({ userId }),
                    transactionModel.aggregate([
                        { $match: { fromUser: userId, type: "ALLOCATE" } },
                        { $group: { _id: null, total: { $sum: "$amount" } } },
                    ]),
                    walletModel.aggregate([
                        { $match: { resellerId: userId } },
                        { $group: { _id: null, total: { $sum: "$balance" } } },
                    ]),
                    transactionModel.aggregate([
                        { $match: { toUser: userId, type: "ALLOCATE" } },
                        { $group: { _id: null, total: { $sum: "$amount" } } },
                    ]),
                    transactionModel.aggregate([
                        {
                            $match: {
                                toUser: userId,
                                type: "ALLOCATE",
                                createdAt: { $gte: startOfMonth },
                            },
                        },
                        { $group: { _id: null, total: { $sum: "$amount" } } },
                    ]),
                ]);

            const clientIds = clientUsers.map((u) => u._id);
            const allAssociatedIds = [userId, ...clientIds];
            const activeClients = clientUsers.filter((u) => u.status === "active").length;

            const [
                totalCampaigns,
                campaignAggregation,
                campaignStatusesResult,
                totalContacts,
                totalGroups,
                recentCampaigns,
            ] = await Promise.all([
                campaignModel.countDocuments({ userId: { $in: allAssociatedIds } }),
                campaignModel.aggregate([
                    { $match: { userId: { $in: allAssociatedIds } } },
                    {
                        $group: {
                            _id: null,
                            totalRecipients: { $sum: "$totalRecipients" },
                            totalSent: { $sum: { $ifNull: ["$campaignSummary.sent", 0] } },
                            totalDelivered: { $sum: { $ifNull: ["$campaignSummary.delivered", 0] } },
                            totalFailed: { $sum: { $ifNull: ["$campaignSummary.failed", 0] } },
                            totalRead: { $sum: { $ifNull: ["$campaignSummary.read", 0] } },
                        },
                    },
                ]),
                campaignModel.aggregate([
                    { $match: { userId: { $in: allAssociatedIds } } },
                    { $group: { _id: "$status", count: { $sum: 1 } } },
                ]),
                contactModel.countDocuments({ userId: { $in: allAssociatedIds } }),
                groupModel.countDocuments({ userId: { $in: allAssociatedIds }, isDeleted: false }),
                campaignModel
                    .find({ userId: { $in: allAssociatedIds } })
                    .select("campaignTitle totalRecipients status campaignSummary createdAt messageType")
                    .populate("userId", "username email role")
                    .sort({ createdAt: -1 })
                    .limit(5),
            ]);

            const myBalance = myWallet ? myWallet.balance : 0;
            const creditsDistributed = distributedResult[0]?.total || 0;
            const clientWalletsTotal = clientWalletsResult[0]?.total || 0;
            const totalAllocatedBySuperAdmin = receivedResult[0]?.total || 0;
            const creditsPurchasedThisMonth = thisMonthReceivedResult[0]?.total || 0;
            const agg = campaignAggregation[0] || {};
            const clientMessagesSent = agg.totalSent || 0;
            const clientMessagesDelivered = agg.totalDelivered || 0;
            const clientMessagesFailed = agg.totalFailed || 0;
            const clientRecipientsRequested = agg.totalRecipients || 0;

            const campaignStatusMap = {};
            campaignStatusesResult.forEach((item) => {
                campaignStatusMap[item._id] = item.count;
            });

            return res.status(200).json({
                success: true,
                role: "Reseller",
                stats: {
                    wallet: {
                        myBalance,
                        totalAllocatedBySuperAdmin,
                        creditsPurchasedThisMonth,
                        creditsDistributedToClients: creditsDistributed,
                        clientWalletsTotal,
                    },
                    credits: {
                        totalAllocatedBySuperAdmin,
                        creditsPurchasedThisMonth,
                        creditsDistributedToClients: creditsDistributed,
                        clientWalletsTotal,
                    },
                    clients: {
                        totalClients: clientUsers.length,
                        activeClients,
                    },
                    campaigns: {
                        totalCampaigns,
                        clientRecipientsRequested,
                        clientMessagesSent,
                        clientMessagesDelivered,
                        clientMessagesFailed,
                        statusBreakdown: campaignStatusMap,
                    },
                    assets: {
                        totalContacts,
                        totalGroups,
                    },
                    recentCampaigns,
                },
            });
        }

        // ─────────────────────────────────────────────────────────────
        // 3. REGULAR USER METRICS
        // ─────────────────────────────────────────────────────────────
        const [
            userWallet,
            totalCampaigns,
            campaignAggregation,
            campaignStatusesResult,
            totalContacts,
            totalGroups,
            totalTemplates,
            recentCampaigns,
        ] = await Promise.all([
            walletModel.findOne({ userId }),
            campaignModel.countDocuments({ userId }),
            campaignModel.aggregate([
                { $match: { userId } },
                {
                    $group: {
                        _id: null,
                        totalRecipients: { $sum: "$totalRecipients" },
                        totalSent: { $sum: { $ifNull: ["$campaignSummary.sent", 0] } },
                        totalDelivered: { $sum: { $ifNull: ["$campaignSummary.delivered", 0] } },
                        totalFailed: { $sum: { $ifNull: ["$campaignSummary.failed", 0] } },
                        totalRead: { $sum: { $ifNull: ["$campaignSummary.read", 0] } },
                    },
                },
            ]),
            campaignModel.aggregate([
                { $match: { userId } },
                { $group: { _id: "$status", count: { $sum: 1 } } },
            ]),
            contactModel.countDocuments({ userId }),
            groupModel.countDocuments({ userId, isDeleted: false }),
            templateModel.countDocuments({ userId }),
            campaignModel
                .find({ userId })
                .select("campaignTitle totalRecipients status campaignSummary createdAt messageType")
                .sort({ createdAt: -1 })
                .limit(5),
        ]);

        const myBalance = userWallet ? userWallet.balance : 0;
        const ratePerMsg = req.user.ratePerMsg && req.user.ratePerMsg > 0 ? req.user.ratePerMsg : 12;
        const messagesRemaining = Math.floor(myBalance / ratePerMsg);
        const agg = campaignAggregation[0] || {};
        const messagesSent = agg.totalSent || 0;
        const messagesDelivered = agg.totalDelivered || 0;
        const messagesFailed = agg.totalFailed || 0;
        const messagesRead = agg.totalRead || 0;
        const totalRecipients = agg.totalRecipients || 0;

        const campaignStatusMap = {};
        campaignStatusesResult.forEach((item) => {
            campaignStatusMap[item._id] = item.count;
        });

        return res.status(200).json({
            success: true,
            role: "User",
            stats: {
                wallet: {
                    myBalance,
                    ratePerMsg,
                    messagesRemaining,
                },
                campaigns: {
                    totalCampaigns,
                    totalRecipients,
                    messagesSent,
                    messagesDelivered,
                    messagesFailed,
                    messagesRead,
                    statusBreakdown: campaignStatusMap,
                },
                assets: {
                    totalContacts,
                    totalGroups,
                    totalTemplates,
                },
                recentCampaigns,
            },
        });
    } catch (error) {
        console.error("GetDashboardStats error:", error);
        return res.status(500).json({
            message: "Failed to fetch dashboard metrics",
            error: error.message,
            success: false,
        });
    }
};

export default {
    getDashboardStats,
};
