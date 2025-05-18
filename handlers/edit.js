const GroupExpense = require('../models/GroupExpense');

const editStates = new Map(); // key: chatId:userId, value: { idx, action }
const getStateKey = (chatId, userId) => `${chatId}:${userId}`;

module.exports = {
    editExpense: async (bot, msg) => {
        if (msg.chat.type !== 'private') {
            await bot.sendMessage(msg.chat.id, 'Check your private chat with me to edit your expenses.');
            return bot.sendMessage(msg.from.id, '/edit');
        }
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        try {
            const groupExpense = await GroupExpense.findOne({ 'members.userId': userId });
            if (!groupExpense || !groupExpense.expenses.length) {
                return bot.sendMessage(chatId, 'No expenses found for this group.');
            }
            const myExpenses = groupExpense.expenses
                .map((exp, idx) => ({ ...exp.toObject(), idx }))
                .filter(exp => exp.paidBy === userId);
            if (!myExpenses.length) {
                return bot.sendMessage(chatId, 'You have not added any expenses.');
            }
            const keyboard = {
                inline_keyboard: myExpenses.map(exp => [{
                    text: `$${exp.amount} — ${exp.description} (${new Date(exp.timestamp).toLocaleDateString()})`,
                    callback_data: `edit_expense_${exp.idx}`
                }])
            };
            await bot.sendMessage(chatId, 'Select an expense to edit:', { reply_markup: keyboard });
        } catch (err) {
            console.error('Error in /edit:', err);
            await bot.sendMessage(chatId, 'Error fetching your expenses.');
        }
    },
    handleEditCallback: async (bot, query) => {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const stateKey = getStateKey(chatId, userId);
        if (query.data && query.data.startsWith('edit_expense_')) {
            const idx = parseInt(query.data.split('_').pop(), 10);
            editStates.set(stateKey, { idx });
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: 'Edit Amount', callback_data: 'edit_amount' },
                        { text: 'Edit Description', callback_data: 'edit_description' }
                    ],
                    [
                        { text: 'Delete', callback_data: 'edit_delete' },
                        { text: 'Cancel', callback_data: 'edit_cancel' }
                    ]
                ]
            };
            return bot.sendMessage(chatId, 'What would you like to do?', { reply_markup: keyboard });
        }
        if (query.data === 'edit_delete') {
            const state = editStates.get(stateKey);
            if (!state) return;
            try {
                const groupExpense = await GroupExpense.findOne({ 'members.userId': userId });
                if (!groupExpense) return;
                groupExpense.expenses.splice(state.idx, 1);
                await groupExpense.save();
                editStates.delete(stateKey);
                return bot.sendMessage(chatId, 'Expense deleted.');
            } catch (err) {
                console.error('Error deleting expense:', err);
                return bot.sendMessage(chatId, 'Error deleting expense.');
            }
        }
        if (query.data === 'edit_cancel') {
            editStates.delete(stateKey);
            return bot.sendMessage(chatId, 'Edit cancelled.');
        }
        // Edit amount/description will be implemented next
        if (query.data === 'edit_amount') {
            const state = editStates.get(stateKey);
            if (!state) return;
            state.action = 'amount';
            editStates.set(stateKey, state);
            return bot.sendMessage(chatId, 'Send the new amount:');
        }
        if (query.data === 'edit_description') {
            const state = editStates.get(stateKey);
            if (!state) return;
            state.action = 'description';
            editStates.set(stateKey, state);
            return bot.sendMessage(chatId, 'Send the new description:');
        }
    },
    handleEditMessage: async (bot, msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const stateKey = getStateKey(chatId, userId);
        const state = editStates.get(stateKey);
        if (!state || !state.action) return;
        try {
            const groupExpense = await GroupExpense.findOne({ 'members.userId': userId });
            if (!groupExpense) return;
            const expense = groupExpense.expenses[state.idx];
            if (!expense) return;
            if (state.action === 'amount') {
                const newAmount = parseFloat(msg.text);
                if (isNaN(newAmount) || newAmount <= 0) {
                    return bot.sendMessage(chatId, 'Please enter a valid amount.');
                }
                expense.amount = newAmount;
            } else if (state.action === 'description') {
                expense.description = msg.text;
            }
            await groupExpense.save();
            editStates.delete(stateKey);
            return bot.sendMessage(chatId, 'Expense updated.');
        } catch (err) {
            console.error('Error editing expense:', err);
            return bot.sendMessage(chatId, 'Error updating expense.');
        }
    }
};
