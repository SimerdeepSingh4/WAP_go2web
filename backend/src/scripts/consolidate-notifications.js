import mongoose from "mongoose";
import config from "../config/config.js";

function getGroupForDoc(doc) {
  const eventId = String(doc.eventId || "");
  const title = String(doc.title || "").toLowerCase();

  if (eventId.startsWith("campaign:")) {
    const parts = eventId.split(":");
    const campaignId = parts[1] || String(doc._id);
    if (title.includes("submitted") || title.includes("approval")) {
      return {
        groupKey: `campaign:${campaignId}:creation:submission`,
        itemType: "campaign",
        itemId: campaignId,
        changeType: "creation",
        fieldKey: "submission",
      };
    }
    if (title.includes("report")) {
      return {
        groupKey: `campaign:${campaignId}:report:spreadsheet`,
        itemType: "campaign",
        itemId: campaignId,
        changeType: "report",
        fieldKey: "spreadsheet",
      };
    }
    if (title.includes("delivery")) {
      return {
        groupKey: `campaign:${campaignId}:report:delivery`,
        itemType: "campaign",
        itemId: campaignId,
        changeType: "report",
        fieldKey: "delivery",
      };
    }
    return {
      groupKey: `campaign:${campaignId}:status:status`,
      itemType: "campaign",
      itemId: campaignId,
      changeType: "status",
      fieldKey: "status",
    };
  }

  if (eventId.startsWith("user:")) {
    const parts = eventId.split(":");
    const userId = parts[1] || String(doc.subjectUserId || doc._id);
    if (title.includes("created")) {
      return {
        groupKey: `user:${userId}:creation:account`,
        itemType: "user",
        itemId: userId,
        changeType: "creation",
        fieldKey: "account",
      };
    }
    if (title.includes("rate")) {
      return {
        groupKey: `user:${userId}:setting:ratePerMsg`,
        itemType: "user",
        itemId: userId,
        changeType: "setting",
        fieldKey: "ratePerMsg",
      };
    }
    if (title.includes("expiry")) {
      return {
        groupKey: `user:${userId}:setting:expiresAt`,
        itemType: "user",
        itemId: userId,
        changeType: "setting",
        fieldKey: "expiresAt",
      };
    }
    if (title.includes("role")) {
      return {
        groupKey: `user:${userId}:setting:role`,
        itemType: "user",
        itemId: userId,
        changeType: "setting",
        fieldKey: "role",
      };
    }
    if (title.includes("device")) {
      return {
        groupKey: `user:${userId}:setting:deviceLimit`,
        itemType: "user",
        itemId: userId,
        changeType: "setting",
        fieldKey: "deviceLimit",
      };
    }
    return {
      groupKey: `user:${userId}:setting:status`,
      itemType: "user",
      itemId: userId,
      changeType: "setting",
      fieldKey: "status",
    };
  }

  if (eventId.startsWith("transaction:")) {
    const parts = eventId.split(":");
    const txId = parts[1] || String(doc._id);
    const type = title.includes("allocated") ? "ALLOCATE"
      : title.includes("refund") ? "REFUND"
      : title.includes("charge") ? "DEDUCT"
      : title.includes("reclaim") ? "RECLAIM"
      : title.includes("request") ? "REQUEST"
      : "TRANSACTION";
    return {
      groupKey: `transaction:${txId}:transaction:${type}`,
      itemType: "transaction",
      itemId: txId,
      changeType: "transaction",
      fieldKey: type,
    };
  }

  if (eventId.startsWith("wallet:")) {
    const parts = eventId.split(":");
    const walletId = parts[1] || String(doc._id);
    const field = title.includes("lock") ? "isLocked" : title.includes("expiry") ? "expiresAt" : "lowBalance";
    return {
      groupKey: `wallet:${walletId}:setting:${field}`,
      itemType: "wallet",
      itemId: walletId,
      changeType: "setting",
      fieldKey: field,
    };
  }

  if (eventId.startsWith("expiry:")) {
    const parts = eventId.split(":");
    const id = parts[2] || parts[1] || String(doc._id);
    const kind = parts[1] || "account";
    return {
      groupKey: `expiry:${id}:${kind}:${title.includes("expired") ? "expired" : "soon"}`,
      itemType: "expiry",
      itemId: id,
      changeType: "expiry",
      fieldKey: kind,
    };
  }

  return {
    groupKey: `generic:${doc.eventId || String(doc._id)}`,
    itemType: "generic",
    itemId: String(doc._id),
    changeType: "default",
    fieldKey: "default",
  };
}

export async function consolidateNotifications() {
  await mongoose.connect(config.MONGO_URI);
  const col = mongoose.connection.collection("notifications");

  const docs = await col.find().sort({ createdAt: -1, _id: -1 }).toArray();
  console.log(`Found ${docs.length} total notifications to examine.`);

  // Group by (recipientId, groupKey)
  const groups = new Map();

  for (const doc of docs) {
    const groupInfo = doc.groupKey ? {
      groupKey: doc.groupKey,
      itemType: doc.itemType,
      itemId: doc.itemId,
      changeType: doc.changeType,
      fieldKey: doc.fieldKey,
    } : getGroupForDoc(doc);

    const compositeKey = `${String(doc.recipientId)}|${groupInfo.groupKey}`;

    if (!groups.has(compositeKey)) {
      groups.set(compositeKey, {
        latest: doc,
        groupInfo,
        duplicates: [],
      });
    } else {
      groups.get(compositeKey).duplicates.push(doc);
    }
  }

  let removedCount = 0;
  let updatedCount = 0;

  for (const [key, group] of groups.entries()) {
    const latest = group.latest;
    const updateFields = {
      groupKey: group.groupInfo.groupKey,
      itemType: group.groupInfo.itemType,
      itemId: group.groupInfo.itemId,
      changeType: group.groupInfo.changeType,
      fieldKey: group.groupInfo.fieldKey,
      lastEventId: latest.lastEventId || latest.eventId,
      version: latest.version || new Date(latest.updatedAt || latest.createdAt || Date.now()).getTime(),
    };

    await col.updateOne({ _id: latest._id }, { $set: updateFields });
    updatedCount++;

    if (group.duplicates.length > 0) {
      const dupIds = group.duplicates.map((d) => d._id);
      await col.deleteMany({ _id: { $in: dupIds } });
      removedCount += dupIds.length;
      console.log(`Consolidated group "${group.groupInfo.groupKey}" for recipient ${latest.recipientId}: kept latest ${latest._id}, deleted ${dupIds.length} older entries.`);
    }
  }

  console.log(`Consolidation summary: ${updatedCount} latest entries preserved/updated, ${removedCount} duplicate older entries removed.`);

  // Check and update indexes
  const indexes = await col.indexes();
  console.log("Current indexes:", indexes.map((i) => i.name));

  // Drop old unique index on eventId_1_recipientId_1 if it exists
  const oldIndex = indexes.find((i) => i.name === "eventId_1_recipientId_1" && i.unique);
  if (oldIndex) {
    console.log("Dropping old unique index on { eventId: 1, recipientId: 1 }...");
    await col.dropIndex("eventId_1_recipientId_1");
  }

  // Create new unique index on { recipientId: 1, groupKey: 1 }
  console.log("Enforcing unique compound index on { recipientId: 1, groupKey: 1 }...");
  await col.createIndex({ recipientId: 1, groupKey: 1 }, { unique: true });

  // Create non-unique index on { eventId: 1, recipientId: 1 }
  await col.createIndex({ eventId: 1, recipientId: 1 });

  const finalIndexes = await col.indexes();
  console.log("Updated indexes:", finalIndexes.map((i) => i.name));

  const finalCount = await col.countDocuments();
  console.log(`Final notification collection count: ${finalCount}`);
  process.exit(0);
}

if (process.argv[1]?.endsWith("consolidate-notifications.js")) {
  consolidateNotifications().catch((err) => {
    console.error("Migration error:", err);
    process.exit(1);
  });
}

