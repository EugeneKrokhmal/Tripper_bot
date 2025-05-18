const GroupExpense = require('../models/GroupExpense');

const settleStates = new Map(); // key: chatId:userId, value: { debtorId, maxAmount }
const getStateKey = (chatId, userId) => `${chatId}:${userId}`;

module.exports = {
    settleDebt: async (bot, msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        try {
            const groupExpense = await GroupExpense.findOne({ chatId });
            if (!groupExpense || !groupExpense.expenses.length) {
                return bot.sendMessage(chatId, 'No expenses found for this group.');
            }
            // Calculate debts (same as in calculate.js, but only for this user as creditor)
            const debts = new Map();
            for (const expense of groupExpense.expenses) {
                const amountPerPerson = expense.amount / expense.participants.length;
                debts.set(expense.paidBy, (debts.get(expense.paidBy) || 0) + expense.amount);
                for (const participantId of expense.participants) {
                    debts.set(participantId, (debts.get(participantId) || 0) - amountPerPerson);
                }
            }
            if (groupExpense.settlements && groupExpense.settlements.length) {
                for (const s of groupExpense.settlements) {
                    debts.set(s.from, (debts.get(s.from) || 0) + s.amount);
                    debts.set(s.to, (debts.get(s.to) || 0) - s.amount);
                }
            }
            // Find who owes this user
            const debtors = Array.from(debts.entries())
                .filter(([_, amount]) => amount < 0)
                .map(([id, amount]) => ({ id, amount: Math.abs(amount) }));
            const creditors = Array.from(debts.entries())
                .filter(([id, amount]) => id === userId && amount > 0);
            if (!creditors.length) {
                return bot.sendMessage(chatId, 'No one owes you money!');
            }
            // Find who owes this user
            const youAreOwed = Array.from(debts.entries())
                .filter(([debtorId, amount]) => amount < 0)
                .map(([debtorId, amount]) => ({
                    debtorId,
                    amount: Math.min(Math.abs(amount), debts.get(userId) || 0)
                }))
                .filter(d => d.amount > 0);
            if (!youAreOwed.length) {
                return bot.sendMessage(chatId, 'No one owes you money!');
            }
            // Show list of debtors
            const members = groupExpense.members || [];
            const keyboard = {
                inline_keyboard: youAreOwed.map(d => [{
                    text: (members.find(m => m.userId === d.debtorId)?.username || members.find(m => m.userId === d.debtorId)?.firstName || d.debtorId) + ` ($${d.amount.toFixed(2)})`,
                    callback_data: `settle_${d.debtorId}_${d.amount}`
                }])
            };
            await bot.sendMessage(chatId, 'Who paid you back?', { reply_markup: keyboard });
        } catch (err) {
            console.error('Error in /settle:', err);
            await bot.sendMessage(chatId, 'Error fetching debts.');
        }
    },
    handleSettleCallback: async (bot, query) => {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const stateKey = getStateKey(chatId, userId);
        if (query.data && query.data.startsWith('settle_')) {
            const [_, debtorId, maxAmount] = query.data.split('_');
            settleStates.set(stateKey, { debtorId: parseInt(debtorId), maxAmount: parseFloat(maxAmount) });
            return bot.sendMessage(chatId, `Enter the amount received (max $${parseFloat(maxAmount).toFixed(2)}):`);
        }
    },
    handleSettleMessage: async (bot, msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const stateKey = getStateKey(chatId, userId);
        const state = settleStates.get(stateKey);
        if (!state) return;
        const amount = parseFloat(msg.text);
        if (isNaN(amount) || amount <= 0 || amount > state.maxAmount) {
            return bot.sendMessage(chatId, `Please enter a valid amount (max $${state.maxAmount.toFixed(2)}).`);
        }
        try {
            let groupExpense = await GroupExpense.findOne({ chatId });
            if (!groupExpense) return;
            groupExpense.settlements.push({ from: state.debtorId, to: userId, amount });
            await groupExpense.save();
            settleStates.delete(stateKey);
            await bot.sendMessage(chatId, 'Settlement recorded!');
        } catch (err) {
            console.error('Error saving settlement:', err);
            await bot.sendMessage(chatId, 'Error saving settlement.');
        }
    }
};
