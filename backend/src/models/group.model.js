import mongoose from "mongoose";

const groupSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "User ID is required"],
            index: true,
        },
        name: {
            type: String,
            required: [true, "Group name is required"],
            maxLength: [100, "Group name cannot be bigger than 100 characters"],
            trim: true,
        },
        description: {
            type: String,
            required: [true, "Group description is required"],
            maxLength: [200, "Group description cannot be bigger than 200 characters"],
            trim: true,
        },
        totalContacts: {
            type: Number,
            default: 0,
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

const groupModel = mongoose.model("Group", groupSchema);

export default groupModel;
