import templateModel from "../models/template.model.js";

const createTemplate = async (req, res) => {
    try {
        const {userId,title,description,body,mediaType,mediaUrl,isPublic} = req.body
        const template = await templateModel.create({
            userId,
            title,
            description,
            body,
            mediaType,
            mediaUrl,
            isPublic
        })
        return res.status(200).json({success:true,message:"Template created successfully"})
    } catch (error) {
        
    }
}