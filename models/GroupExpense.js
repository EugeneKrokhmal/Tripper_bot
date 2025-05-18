const mongoose = require('mongoose');

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
