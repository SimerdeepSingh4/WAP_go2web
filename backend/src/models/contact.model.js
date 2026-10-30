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
        },
        groupId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Group",
            default: null,
            index: true,
        },
    },
    {
        timestamps: true,
    }
);

const contactModel = mongoose.model("Contact", contactSchema);

export default contactModel;
