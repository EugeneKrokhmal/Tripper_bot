const mongoose = require('mongoose');

/**
 * Schema for individual expenses
 * @typedef {Object} ExpenseSchema
 * @property {number} amount - The amount of the expense
 * @property {string} description - Description of the expense
 * @property {number} paidBy - Telegram user ID of the payer
 * @property {number[]} participants - Array of Telegram user IDs who share the expense
 * @property {Date} timestamp - When the expense was created
 */
const expenseSchema = new mongoose.Schema({
    amount: {
        type: Number,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    paidBy: {
        type: Number, // Telegram user ID
        required: true
    },
    participants: [{
        type: Number, // Array of Telegram user IDs
        required: true
    }],
    timestamp: {
        type: Date,
        default: Date.now
    }
});

/**
 * Schema for group expenses
 * @typedef {Object} GroupExpenseSchema
 * @property {string} chatId - Telegram chat ID
 * @property {string} groupName - Name of the group
 * @property {ExpenseSchema[]} expenses - Array of expenses
 * @property {Object[]} members - Array of group members
 * @property {Object[]} settlements - Array of debt settlements
 * @property {string} currency - Currency code (default: 'usd')
 * @property {boolean} premium - Whether the group has premium status
 */
const groupExpenseSchema = new mongoose.Schema({
    chatId: {
        type: String,
        required: true,
        unique: true
    },
    groupName: {
        type: String
    },
    expenses: [expenseSchema],
    members: [{
        userId: Number,
        username: String,
        firstName: String
    }],
    settlements: [{
        from: Number,
        to: Number,
        amount: Number,
        timestamp: { type: Date, default: Date.now }
    }],
    currency: {
        type: String,
        default: 'usd'
    },
    premium: {
        type: Boolean,
        default: false
    }
});

module.exports = mongoose.model('GroupExpense', groupExpenseSchema);
