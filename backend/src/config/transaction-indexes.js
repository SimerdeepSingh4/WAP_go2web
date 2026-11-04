// Create the replacement before dropping the legacy index so automated refunds
// stay protected throughout the migration. Existing records use a null operation.
export async function ensureTransactionRefundIndex(collection) {
    await collection.createIndex(
        { campaignId: 1, type: 1, refundOperationId: 1 },
        {
            name: "campaign_refund_operation_unique",
            unique: true,
            partialFilterExpression: { type: "REFUND" },
        }
    );

    const indexes = await collection.listIndexes().toArray();
    for (const index of indexes) {
        if (
            index.unique &&
            index.key.campaignId === 1 &&
            index.key.type === 1 &&
            Object.keys(index.key).length === 2
        ) {
            try {
                await collection.dropIndex(index.name);
            } catch (error) {
                // Another server may have completed this migration concurrently.
                if (error.code !== 27) throw error;
            }
        }
    }
}
