import mongoose from "mongoose";

const contactSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "User is required"],
            index: true,
        },
        name: {
            type: String,
            trim: true,
            default: "",
        },
        phoneNumber: {
            type: String,
            required: [true, "Phone Number is required"],
            trim: true,
            index: true,
        },
        email: {
            type: String,
            trim: true,
            default: "",
        },
        company: {
            type: String,
            trim: true,
            default: "",
        },
        tags: [
            {
                type: String,
                trim: true,
            },
        ],
        customFields: {
            type: Map,
            of: String,
            default: {},
        },
        groupId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Group",
            default: null,
            index: true,
        },
        adminSaved: { type: Boolean, default: false },
    },
    {
        timestamps: true,
    }
);

// Compound index for fast lookup of a user's contacts
contactSchema.index({ userId: 1, groupId: 1 });
contactSchema.index({ userId: 1, phoneNumber: 1 });
// Only new admin saves participate, so legacy duplicate contacts do not prevent
// creating the index. It also protects retries from multiple open admin tabs.
contactSchema.index({ groupId: 1, phoneNumber: 1 }, { unique: true, partialFilterExpression: { adminSaved: true } });

const contactModel = mongoose.model("Contact", contactSchema);

export default contactModel;
