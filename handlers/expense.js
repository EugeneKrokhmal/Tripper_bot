const GroupExpense = require('../models/GroupExpense');
const BaseHandler = require('./BaseHandler');

const states = {
    AMOUNT: 'amount',
    DESCRIPTION: 'description',
    PARTICIPANTS: 'participants'
};

class ExpenseHandler extends BaseHandler {
    constructor(bot) {
        super(bot);
        this.userStates = new Map();
    }

    getStateKey(chatId, userId) {
        return `${chatId}:${userId}`;
    }

    async startExpenseFlow(msg) {
        const t = await this.getT(msg);
        
        if (msg.chat.type === 'private') {
            this.userStates.set(this.getStateKey(msg.chat.id, msg.from.id), {
                state: states.AMOUNT,
                data: {}
            });

            const groups = await GroupExpense.find({ 'members.userId': msg.from.id });
            if (!groups.length) {
                return this.sendMessage(msg.chat.id, t('no_groups_found'));
            }

            if (groups.length === 1) {
                this.userStates.get(this.getStateKey(msg.chat.id, msg.from.id)).data.groupChatId = groups[0].chatId;
                return this.sendMessage(msg.chat.id, t('enter_amount'));
            }

            const keyboard = {
                inline_keyboard: groups.map(g => [{
                    text: g.groupName || t('group_id', { id: g.chatId }),
                    callback_data: `expense_group_${g.chatId}`
                }])
            };
            return this.sendMessage(msg.chat.id, t('select_group'), { reply_markup: keyboard });
        }

        await this.sendMessage(msg.chat.id, t('check_private_chat'));
        this.userStates.set(this.getStateKey(msg.from.id, msg.from.id), {
            state: states.AMOUNT,
            data: { groupChatId: msg.chat.id }
        });
        return this.sendMessage(msg.from.id, t('enter_amount'));
    }

    async handleExpenseInput(msg) {
        const t = await this.getT(msg);
        const userId = msg.from.id;
        const stateKey = this.getStateKey(userId, userId);
        const userState = this.userStates.get(stateKey);
        if (!userState) return;

        if (!userState.data.groupChatId) {
            const groups = await GroupExpense.find({ 'members.userId': userId });
            if (!groups.length) {
                return this.sendMessage(userId, t('no_groups_found'));
            }
            if (groups.length === 1) {
                userState.data.groupChatId = groups[0].chatId;
            } else {
                const keyboard = {
                    inline_keyboard: groups.map(g => [{
                        text: g.groupName || t('group_id', { id: g.chatId }),
                        callback_data: `expense_group_${g.chatId}`
                    }])
                };
                return this.sendMessage(userId, t('select_group'), { reply_markup: keyboard });
            }
        }

        const chatId = userState.data.groupChatId;

        switch (userState.state) {
            case states.AMOUNT:
                const amount = parseFloat(msg.text);
                if (isNaN(amount) || amount <= 0) {
                    return this.sendMessage(userId, t('invalid_amount'));
                }
                userState.data.amount = amount;
                userState.state = states.DESCRIPTION;
                return this.sendMessage(userId, t('enter_description'));

            case states.DESCRIPTION:
                userState.data.description = msg.text;
                userState.data.paidBy = userId;
                userState.state = states.PARTICIPANTS;
                const groupExpense = await this.getGroupExpense(chatId);
                let members = groupExpense.members;
                const botInfo = await this.bot.getMe();
                members = members.filter(m => m.userId !== botInfo.id);
                if (!members.length) {
                    return this.sendMessage(userId, t('no_members_found'));
                }
                userState.data.participants = userState.data.participants || [];
                await this.sendParticipantSelection(userId, members, userState.data.participants);
                break;

            case states.PARTICIPANTS:
                try {
                    const groupExpense = await this.getGroupExpense(userState.data.groupChatId);
                    groupExpense.expenses.push(userState.data);
                    await groupExpense.save();
                    this.userStates.delete(stateKey);
                    await this.sendMessage(userId, t('expense_saved'));
                    return this.sendMessage(userState.data.groupChatId, 
                        t('new_expense', { 
                            amount: this.formatAmount(userState.data.amount),
                            description: userState.data.description 
                        })
                    );
                } catch (error) {
                    await this.handleError(userId, error, t);
                }
        }
    }

    async sendParticipantSelection(userId, members, selected) {
        const t = await this.getT({ from: { id: userId } });
        const keyboard = {
            inline_keyboard: [
                ...members.map(member => [{
                    text: `${selected.includes(member.userId) ? '✅ ' : ''}${member.username ? `@${member.username}` : member.firstName || member.userId}`,
                    callback_data: `participant_${member.userId}`
                }]),
                [{ text: t('done'), callback_data: 'participants_done' }]
            ]
        };

        const summary = selected.length
            ? t('selected_participants', {
                participants: members
                    .filter(m => selected.includes(m.userId))
                    .map(m => m.username ? `@${m.username}` : m.firstName || m.userId)
                    .join(', ')
            })
            : t('no_participants_selected');

        await this.sendMessage(userId, `${t('select_participants')}\n${summary}`, { reply_markup: keyboard });
    }

    async handleCallbackQuery(query) {
        const t = await this.getT(query, query.from.id);
        const userId = query.from.id;
        const stateKey = this.getStateKey(userId, userId);
        const userState = this.userStates.get(stateKey);
        if (!userState) return;

        if (query.data.startsWith('expense_group_')) {
            const groupChatId = query.data.replace('expense_group_', '');
            userState.data.groupChatId = groupChatId;
            userState.state = states.AMOUNT;
            this.userStates.set(stateKey, userState);
            return this.sendMessage(userId, t('enter_amount'));
        }

        if (query.data.startsWith('participant_')) {
            const participantId = parseInt(query.data.split('_')[1]);
            userState.data.participants = userState.data.participants || [];
            const idx = userState.data.participants.indexOf(participantId);
            if (idx === -1) {
                userState.data.participants.push(participantId);
            } else {
                userState.data.participants.splice(idx, 1);
            }

            const groupExpense = await this.getGroupExpense(userState.data.groupChatId);
            let members = groupExpense.members;
            const botInfo = await this.bot.getMe();
            members = members.filter(m => m.userId !== botInfo.id);
            await this.sendParticipantSelection(userId, members, userState.data.participants);
            return this.answerCallbackQuery(query.id, { 
                text: idx === -1 ? t('participant_added') : t('participant_removed') 
            });
        }

        if (query.data === 'participants_done') {
            if (!userState.data.participants || userState.data.participants.length === 0) {
                return this.answerCallbackQuery(query.id, { text: t('select_one_participant') });
            }

            try {
                const groupExpense = await this.getGroupExpense(userState.data.groupChatId);
                groupExpense.expenses.push(userState.data);
                await groupExpense.save();
                this.userStates.delete(stateKey);
                await this.sendMessage(userId, t('expense_saved'));
                await this.sendMessage(userState.data.groupChatId, 
                    t('new_expense', { 
                        amount: this.formatAmount(userState.data.amount),
                        description: userState.data.description 
                    })
                );
                return this.answerCallbackQuery(query.id, { text: t('expense_saved') });
            } catch (error) {
                await this.handleError(userId, error, t);
                return this.answerCallbackQuery(query.id, { text: t('error_saving_expense') });
            }
        }
    }
}

module.exports = ExpenseHandler;
