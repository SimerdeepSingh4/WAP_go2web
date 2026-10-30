import mongoose from "mongoose"

const templateSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: [true, "user is required"],
        index: true
    },
    title: {
        type: String,
        required: [true, "Title is required"],
        trim: true,
    },
    description: {
        type: String,
        required: [true, "description is required"],
        trim: true,
    },
    body: {
        type: String,
        required: [true, "body is required"],
        trim: true,
        maxLength: [1024, "body must be less than 1024 characters"],
        minLength: [10, "body must be greater than 10 characters"]
    },
    variables: {
        type: [String],
        default: [],
    },
    mediaType: {
        type: String,
        enum: ["none", "image", "document", "video"],
        default: "none",
    },
    mediaUrl: {
        type: String,
        default: null,
    },
    isPublic: {
        type: Boolean,
        default: false
    }

}, {
    timestamps: true
})

const templateModel = mongoose.model("Template", templateSchema)

export default templateModel
