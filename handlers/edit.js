const GroupExpense = require('../models/GroupExpense');

const editStates = new Map(); // key: userId, value: { groupChatId, idx, action }
const getStateKey = (userId) => `${userId}`;

module.exports = {
    editExpense: async (bot, msg) => {
        if (msg.chat.type !== 'private') {
            await bot.sendMessage(msg.chat.id, 'Check your private chat with me to edit your expenses.');
            return bot.sendMessage(msg.from.id, '/edit');
        }
        const userId = msg.from.id;
        // Find all groups where the user is a member
        const groups = await GroupExpense.find({ 'members.userId': userId });
        if (!groups.length) {
            return bot.sendMessage(userId, 'No groups found where you have expenses.');
        }
        let groupExpense;
        if (groups.length === 1) {
            groupExpense = groups[0];
        } else {
            // If user is in multiple groups, ask which group to edit
            const keyboard = {
                inline_keyboard: groups.map(g => [{
                    text: g.groupName ? g.groupName : `Group ${g.chatId}`,
                    callback_data: `edit_group_${g.chatId}`
                }])
            };
            return bot.sendMessage(userId, 'Select the group to edit expenses in:', { reply_markup: keyboard });
        }
        await showUserExpenses(bot, userId, groupExpense.chatId);
    },
    handleEditCallback: async (bot, query) => {
        const userId = query.from.id;
        const stateKey = getStateKey(userId);
        let state = editStates.get(stateKey) || {};
        if (query.data && query.data.startsWith('edit_group_')) {
            const groupChatId = query.data.replace('edit_group_', '');
            state.groupChatId = groupChatId;
            editStates.set(stateKey, state);
            return showUserExpenses(bot, userId, groupChatId);
        }
        if (query.data && query.data.startsWith('edit_expense_')) {
            const idx = parseInt(query.data.split('_').pop(), 10);
            state.idx = idx;
            editStates.set(stateKey, state);
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
            return bot.sendMessage(userId, 'What would you like to do?', { reply_markup: keyboard });
        }
        if (query.data === 'edit_delete') {
            if (!state.groupChatId || typeof state.idx !== 'number') return;
            try {
                const groupExpense = await GroupExpense.findOne({ chatId: state.groupChatId });
                if (!groupExpense) return;
                groupExpense.expenses.splice(state.idx, 1);
                await groupExpense.save();
                editStates.delete(stateKey);
                return bot.sendMessage(userId, 'Expense deleted.');
            } catch (err) {
                console.error('Error deleting expense:', err);
                return bot.sendMessage(userId, 'Error deleting expense.');
            }
        }
        if (query.data === 'edit_cancel') {
            editStates.delete(stateKey);
            return bot.sendMessage(userId, 'Edit cancelled.');
        }
        if (query.data === 'edit_amount') {
            state.action = 'amount';
            editStates.set(stateKey, state);
            return bot.sendMessage(userId, 'Send the new amount:');
        }
        if (query.data === 'edit_description') {
            state.action = 'description';
            editStates.set(stateKey, state);
            return bot.sendMessage(userId, 'Send the new description:');
        }
    },
    handleEditMessage: async (bot, msg) => {
        const userId = msg.from.id;
        const stateKey = getStateKey(userId);
        const state = editStates.get(stateKey);
        if (!state || !state.groupChatId || typeof state.idx !== 'number' || !state.action) return;
        try {
            const groupExpense = await GroupExpense.findOne({ chatId: state.groupChatId });
            if (!groupExpense) return;
            const expense = groupExpense.expenses[state.idx];
            if (!expense) return;
            if (state.action === 'amount') {
                const newAmount = parseFloat(msg.text);
                if (isNaN(newAmount) || newAmount <= 0) {
                    return bot.sendMessage(userId, 'Please enter a valid amount.');
                }
                expense.amount = newAmount;
            } else if (state.action === 'description') {
                expense.description = msg.text;
            }
            await groupExpense.save();
            editStates.delete(stateKey);
            return bot.sendMessage(userId, 'Expense updated.');
        } catch (err) {
            console.error('Error editing expense:', err);
            return bot.sendMessage(userId, 'Error updating expense.');
        }
    }
};

async function showUserExpenses(bot, userId, groupChatId) {
    const groupExpense = await GroupExpense.findOne({ chatId: groupChatId });
    if (!groupExpense || !groupExpense.expenses.length) {
        return bot.sendMessage(userId, 'No expenses found for this group.');
    }
    const myExpenses = groupExpense.expenses
        .map((exp, idx) => ({ ...exp.toObject(), idx }))
        .filter(exp => exp.paidBy === userId);
    if (!myExpenses.length) {
        return bot.sendMessage(userId, 'You have not added any expenses.');
    }
    const keyboard = {
        inline_keyboard: myExpenses.map(exp => [{
            text: `$${exp.amount} — ${exp.description} (${new Date(exp.timestamp).toLocaleDateString()})`,
            callback_data: `edit_expense_${exp.idx}`
        }])
    };
    await bot.sendMessage(userId, 'Select an expense to edit:', { reply_markup: keyboard });
}
