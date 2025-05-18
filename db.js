const mongoose = require('mongoose');
require('dotenv').config();

/**
 * Connects to MongoDB with retry mechanism
 * @returns {Promise<void>}
 */
const connectDB = async () => {
    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
        try {
            await mongoose.connect(process.env.MONGODB_URI, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 5000
            });
            console.log('MongoDB connected successfully');
            return;
        } catch (error) {
            retries++;
            console.error(`MongoDB connection attempt ${retries} failed:`, error);
            
            if (retries === maxRetries) {
                console.error('Max retries reached. Exiting...');
                process.exit(1);
            }
            
            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
        }
    }
};

module.exports = connectDB;
