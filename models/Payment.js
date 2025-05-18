const mongoose = require('mongoose');

/**
 * Schema for payment information
 * @typedef {Object} PaymentSchema
 * @property {string} chatId - Telegram chat ID
 * @property {string} userId - Telegram user ID
 * @property {string} address - TON wallet address
 * @property {number} amount - Amount in nanoTON
 * @property {string} status - Payment status (pending, completed, failed)
 * @property {Date} createdAt - When the payment was created
 * @property {Date} completedAt - When the payment was completed
 * @property {string} comment - Payment comment
 * @property {string} provider - Payment provider (e.g. 'ton', 'monobank')
 * @property {string} currency - Payment currency (e.g. 'UAH', 'TON')
 */
const paymentSchema = new mongoose.Schema({
    chatId: {
        type: String,
        required: true
    },
    userId: {
        type: Number,
        required: true
    },
    address: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    completedAt: {
        type: Date
    },
    comment: {
        type: String,
        required: false
    },
    provider: {
        type: String,
        required: true,
        enum: ['ton', 'monobank'],
        default: 'ton'
    },
    currency: {
        type: String,
        required: false
    }
});

module.exports = mongoose.model('Payment', paymentSchema);
