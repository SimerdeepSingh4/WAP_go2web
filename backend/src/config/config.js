import dotenv from "dotenv"

dotenv.config()

if(!process.env.MONGO_URI){
    throw new Error("MONGO_URI is not defined in environment variables")
}

if(!process.env.JWT_SECRET){
    throw new Error("JWT_SECRET is not defined in environment variables")
}

if(!process.env.REDIS_HOST){
    throw new Error("REDIS_HOST is not defined in environment variables")
}

if(!process.env.REDIS_PORT){
    throw new Error("REDIS_PORT is not defined in environment variables")
}

if(!process.env.REDIS_PASSWORD){
    throw new Error("REDIS_PASSWORD is not defined in environment variables")
}



const config = {
    MONGO_URI: process.env.MONGO_URI,
    JWT_SECRET: process.env.JWT_SECRET,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD
}

export default config;