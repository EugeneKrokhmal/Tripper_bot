const GroupExpense = require('../models/GroupExpense');

const settleStates = new Map(); // key: userId, value: { groupChatId, debtorId, maxAmount }
const getStateKey = (userId) => `${userId}`;

module.exports = {
    settleDebt: async (bot, msg, t) => {
        if (msg.chat.type !== 'private') {
            await bot.sendMessage(msg.chat.id, t('private_only'));
            return;
        }
        const userId = msg.from.id;
        // Find all groups where the user is a member
        const groups = await GroupExpense.find({ 'members.userId': userId });
        if (!groups.length) {
            return bot.sendMessage(userId, t('no_groups_debts'));
        }
        let groupExpense;
        if (groups.length === 1) {
            groupExpense = groups[0];
        } else {
            // If user is in multiple groups, ask which group to settle in
            const keyboard = {
                inline_keyboard: groups.map(g => [{
                    text: g.groupName ? g.groupName : t('group_id', { id: g.chatId }),
                    callback_data: `settle_group_${g.chatId}`
                }])
            };
            return bot.sendMessage(userId, t('select_group_settle'), { reply_markup: keyboard });
        }
        await showSettleDebtors(bot, userId, groupExpense.chatId, t);
    },
    handleSettleCallback: async (bot, query, t) => {
        const userId = query.from.id;
        const stateKey = getStateKey(userId);
        let state = settleStates.get(stateKey) || {};
        if (query.data && query.data.startsWith('settle_group_')) {
            const groupChatId = query.data.replace('settle_group_', '');
            state.groupChatId = groupChatId;
            settleStates.set(stateKey, state);
            return showSettleDebtors(bot, userId, groupChatId, t);
        }
        if (query.data && query.data.startsWith('settle_')) {
            const [_, debtorId, maxAmount] = query.data.split('_');
            state.debtorId = parseInt(debtorId);
            state.maxAmount = parseFloat(maxAmount);
            settleStates.set(stateKey, state);
            return bot.sendMessage(userId, t('enter_amount_received', { max: parseFloat(maxAmount).toFixed(2) }));
        }
    },
    handleSettleMessage: async (bot, msg, t) => {
        const userId = msg.from.id;
        const stateKey = getStateKey(userId);
        const state = settleStates.get(stateKey);
        if (!state || !state.groupChatId || !state.debtorId || !state.maxAmount) return;
        const amount = parseFloat(msg.text);
        if (isNaN(amount) || amount <= 0 || amount > state.maxAmount) {
            return bot.sendMessage(userId, t('invalid_amount_max', { max: state.maxAmount.toFixed(2) }));
        }
        try {
            let groupExpense = await GroupExpense.findOne({ chatId: state.groupChatId });
            if (!groupExpense) return;
            groupExpense.settlements.push({ from: state.debtorId, to: userId, amount });
            await groupExpense.save();
            settleStates.delete(stateKey);
            await bot.sendMessage(userId, t('settlement_recorded'));
        } catch (err) {
            console.error('Error saving settlement:', err);
            await bot.sendMessage(userId, t('error_saving_settlement'));
        }
    }
};

async function showSettleDebtors(bot, userId, groupChatId, t) {
    const groupExpense = await GroupExpense.findOne({ chatId: groupChatId });
    if (!groupExpense || !groupExpense.expenses.length) {
        return bot.sendMessage(userId, t('no_expenses_group'));
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
    const creditors = Array.from(debts.entries())
        .filter(([id, amount]) => id === userId && amount > 0);
    if (!creditors.length) {
        return bot.sendMessage(userId, t('no_one_owes_you'));
    }
    const youAreOwed = Array.from(debts.entries())
        .filter(([debtorId, amount]) => amount < 0)
        .map(([debtorId, amount]) => ({
            debtorId,
            amount: Math.min(Math.abs(amount), debts.get(userId) || 0)
        }))
        .filter(d => d.amount > 0);
    if (!youAreOwed.length) {
        return bot.sendMessage(userId, t('no_one_owes_you'));
    }
    const members = groupExpense.members || [];
    const keyboard = {
        inline_keyboard: youAreOwed.map(d => [{
            text: (members.find(m => m.userId === d.debtorId)?.username || members.find(m => m.userId === d.debtorId)?.firstName || d.debtorId) + ` ($${d.amount.toFixed(2)})`,
            callback_data: `settle_${d.debtorId}_${d.amount}`
        }])
    };
    await bot.sendMessage(userId, t('who_paid_you_back'), { reply_markup: keyboard });
}
