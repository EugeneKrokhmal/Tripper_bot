require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const connectDB = require('./db');
const ExpenseHandler = require('./handlers/expense');
const { calculateDebts } = require('./handlers/calculate');
const { showHistory } = require('./handlers/history');
const { editExpense, handleEditCallback } = require('./handlers/edit');
const { clearExpenses, handleClearCallback } = require('./handlers/clear');
const { settleDebt, handleSettleCallback, handleSettleMessage } = require('./handlers/settle');
const { handleEditMessage } = require('./handlers/edit');
const GroupExpense = require('./models/GroupExpense');
const User = require('./models/User');
const cron = require('node-cron');
const { sendDailyReminders } = require('./handlers/remind');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const path = require('path');
const upgradeCommand = require('./commands/upgrade');
const { formatGroupName } = require('./utils/format');
const { showLanguageSelection } = require('./handlers/language');

// Initialize language support
const languageNames = {
    en: '🇬🇧 English',
    uk: '🇺🇦 Ukrainian',
    be: '🇧🇾 Belarusian',
    hi: '🇮🇳 Hindi',
    id: '🇮🇩 Indonesian',
    es: '🇪🇸 Spanish',
    pt: '🇵🇹 Portuguese',
    he: '🇮🇱 עברית'
};

i18next.use(Backend).init({
    lng: 'en',
    fallbackLng: 'en',
    preload: ['en', 'uk', 'be', 'hi', 'id', 'es', 'pt', 'he'],
    backend: {
        loadPath: path.join(__dirname, 'locales/{{lng}}/translation.json')
    },
    ns: ['translation'],
    defaultNS: 'translation'
});

// Initialize bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Initialize handlers
const expenseHandler = new ExpenseHandler(bot);

// Connect to MongoDB
connectDB();

// Group commands
bot.setMyCommands([
    { command: 'pay', description: 'Add an expense' },
    { command: 'debts', description: 'Show who owes whom' },
    { command: 'history', description: 'Show expense history' },
    { command: 'upgrade', description: 'Upgrade to premium' },
    { command: 'clear', description: 'Clear all expenses' },
    { command: 'currency', description: 'Change currency' },
    { command: 'syncmembers', description: 'Sync current admins to the group member list' }
], { scope: { type: 'all_group_chats' } });

// Private commands
bot.setMyCommands([
    { command: 'pay', description: 'Add an expense' },
    { command: 'edit', description: 'Edit your expenses' },
    { command: 'settle', description: 'Mark a debt as settled' },
    { command: 'language', description: 'Change language' }
], { scope: { type: 'all_private_chats' } });

// Command handlers
async function getT(msgOrQuery, userId) {
    const id = userId || msgOrQuery.from?.id;
    try {
        let user = await User.findOne({ userId: id });
        if (!user) {
            user = await User.findOneAndUpdate(
                { userId: id },
                {
                    userId: id,
                    username: msgOrQuery.from?.username,
                    firstName: msgOrQuery.from?.first_name,
                    language: msgOrQuery.from?.language_code || 'en'
                },
                { upsert: true, new: true }
            );
        }
        return i18next.getFixedT(user.language);
    } catch (error) {
        console.error('Error getting user language:', error);
        return i18next.getFixedT('en');
    }
}

bot.onText(/\/pay/, (msg) => expenseHandler.startExpenseFlow(msg));
bot.onText(/\/edit/, async (msg) => {
    const t = await getT(msg);
    editExpense(bot, msg, t);
});
bot.onText(/\/debts/, async (msg) => {
    const t = await getT(msg);
    if (msg.chat.type === 'private') {
        return bot.sendMessage(msg.chat.id, t('group_only'));
    }
    calculateDebts(bot, msg, t);
});
bot.onText(/\/history/, async (msg) => {
    const t = await getT(msg);
    if (msg.chat.type === 'private') {
        return bot.sendMessage(msg.chat.id, t('group_only'));
    }
    showHistory(bot, msg, t);
});
bot.onText(/\/upgrade/, async (msg) => {
    const t = await getT(msg);
    await upgradeCommand(bot)(msg, t);
});
bot.onText(/\/clear/, async (msg) => {
    const t = await getT(msg);
    if (msg.chat.type === 'private') {
        return bot.sendMessage(msg.chat.id, t('group_only'));
    }
    clearExpenses(bot, msg, t);
});
bot.onText(/\/settle/, async (msg) => {
    const t = await getT(msg);
    if (msg.chat.type !== 'private') {
        return bot.sendMessage(msg.chat.id, t('private_only'));
    }
    settleDebt(bot, msg, t);
});

bot.onText(/\/currency/, async (msg) => {
    const { t } = await expenseHandler.getT(msg);
    const userId = msg.from.id;
    if (msg.chat.type === 'private') {
        // Show group selection if user is in multiple groups
        const groups = await GroupExpense.find({ 'members.userId': userId });
        if (!groups.length) {
            return bot.sendMessage(msg.chat.id, t('no_groups_found'));
        }
        if (groups.length === 1) {
            const group = groups[0];
            if (!group.premium) {
                return bot.sendMessage(msg.chat.id, t('premium_only_currency'));
            }
            const keyboard = {
                inline_keyboard: currencyOptions.map(opt => [{
                    text: `${t(opt.key)}${opt.code === (group.currency || 'usd') ? ' ✓' : ''}`,
                    callback_data: `currency_${opt.code}_group_${group.chatId}`
                }])
            };
            return bot.sendMessage(msg.chat.id, t('select_currency'), { reply_markup: keyboard });
        }
        // Multiple groups: ask which group to set
        const keyboard = {
            inline_keyboard: groups.map(g => [{
                text: formatGroupName(g, t),
                callback_data: `currency_select_group_${g.chatId}`
            }])
        };
        return bot.sendMessage(msg.chat.id, t('select_group'), { reply_markup: keyboard });
    } else {
        // In group chat: set currency for this group
        const chatId = msg.chat.id;
        const groupExpense = await GroupExpense.findOne({ chatId });
        if (!groupExpense) {
            await bot.sendMessage(chatId, t('no_expenses_group'));
            return;
        }
        if (!groupExpense.premium) {
            await bot.sendMessage(chatId, t('premium_only_currency'));
            return;
        }
        const keyboard = {
            inline_keyboard: currencyOptions.map(opt => [{
                text: `${t(opt.key)}${opt.code === (groupExpense.currency || 'usd') ? ' ✓' : ''}`,
                callback_data: `currency_${opt.code}_group_${chatId}`
            }])
        };
        await bot.sendMessage(chatId, t('select_currency'), { reply_markup: keyboard });
    }
});

bot.onText(/\/syncmembers/, async (msg) => {
    const t = await getT(msg);
    if (msg.chat.type === 'private') {
        return bot.sendMessage(msg.chat.id, t('group_only'));
    }
    (async () => {
        const chatId = msg.chat.id;
        const groupName = msg.chat.title || '';
        try {
            const admins = await bot.getChatAdministrators(chatId);
            let groupExpense = await GroupExpense.findOne({ chatId });
            if (!groupExpense) {
                groupExpense = new GroupExpense({ chatId, groupName, expenses: [], members: [] });
            } else if (groupExpense.groupName !== groupName) {
                groupExpense.groupName = groupName;
            }
            let updated = false;
            for (const admin of admins) {
                if (!groupExpense.members.some(m => m.userId === admin.user.id)) {
                    groupExpense.members.push({
                        userId: admin.user.id,
                        username: admin.user.username || '',
                        firstName: admin.user.first_name || ''
                    });
                    updated = true;
                }
            }
            if (updated) {
                await groupExpense.save();
                await bot.sendMessage(chatId, t('synced_admins'));
            } else {
                await bot.sendMessage(chatId, t('no_new_admins'));
            }
        } catch (err) {
            console.error('Error syncing members:', err);
            await bot.sendMessage(chatId, t('error_syncing_members'));
        }
    })();
});

// Handle callback queries (inline keyboard buttons)
bot.on('callback_query', async (query) => {
    const t = await getT(query, query.from.id);
    if (query.data && query.data.startsWith('lang_')) {
        // Remove premium check for language change
        const lang = query.data.replace('lang_', '');
        try {
            await User.findOneAndUpdate(
                { userId: query.from.id },
                {
                    $set: {
                        language: lang,
                        username: query.from.username,
                        firstName: query.from.first_name
                    }
                },
                { upsert: true }
            );

            const t = i18next.getFixedT(lang);
            const langName = languageNames[lang] || lang;

            await bot.answerCallbackQuery(query.id, { text: t('language_updated') });
            await bot.sendMessage(query.message.chat.id, t('language_set', { lang: langName }));

            // Update the language selection message
            const keyboard = {
                inline_keyboard: Object.entries(languageNames).map(([code, name]) => [{
                    text: `${name} ${code === lang ? '✓' : ''}`,
                    callback_data: `lang_${code}`
                }])
            };

            await bot.editMessageReplyMarkup(keyboard, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            });
        } catch (error) {
            console.error('Error updating user language:', error);
            const t = i18next.getFixedT('en');
            await bot.answerCallbackQuery(query.id, { text: t('error_updating_language') });
        }
    } else if (query.data && query.data.startsWith('currency_select_group_')) {
        // User selected a group in private chat, now show currency options for that group
        const groupChatId = query.data.replace('currency_select_group_', '');
        const t = await expenseHandler.getT(query, query.from.id);
        const group = await GroupExpense.findOne({ chatId: groupChatId });
        if (!group.premium) {
            await bot.answerCallbackQuery(query.id, { text: t('premium_feature_locked') });
            return;
        }
        const keyboard = {
            inline_keyboard: currencyOptions.map(opt => [{
                text: `${t.t(opt.key)}${opt.code === (group.currency || 'usd') ? ' ✓' : ''}`,
                callback_data: `currency_${opt.code}_group_${groupChatId}`
            }])
        };
        await bot.editMessageReplyMarkup(keyboard, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id
        });
        return;
    } else if (query.data && query.data.startsWith('currency_')) {
        // Format: currency_usd_group_123456
        const match = query.data.match(/^currency_(\w+)_group_(.+)$/);
        if (!match) return;
        const currency = match[1];
        const groupChatId = match[2];
        const group = await GroupExpense.findOne({ chatId: groupChatId });
        if (!group.premium) {
            await bot.answerCallbackQuery(query.id, { text: t('premium_feature_locked') });
            return;
        }
        try {
            await GroupExpense.findOneAndUpdate(
                { chatId: groupChatId },
                { $set: { currency } },
                { upsert: true }
            );
            const t = i18next.getFixedT(query.from.language_code || 'en', 'translation');
            const currencyLabel = t(`currency_label_${currency}`);
            await bot.answerCallbackQuery(query.id, { text: t('currency_updated', { currency: currencyLabel }) });
            await bot.sendMessage(query.message.chat.id, t('currency_updated', { currency: currencyLabel }));
        } catch (error) {
            console.error('Error updating group currency:', error);
            const t = i18next.getFixedT('en', 'translation');
            await bot.answerCallbackQuery(query.id, { text: t('error_occurred') });
        }
        return;
    } else {
        expenseHandler.handleCallbackQuery(query);
        handleClearCallback(bot, query, t);
        handleEditCallback(bot, query, t);
        handleSettleCallback(bot, query, t);
    }
});

// Handle text messages (for expense flow)
bot.on('message', async (msg) => {
    const t = await getT(msg, msg.from?.id);
    if (msg.text && !msg.text.startsWith('/')) {
        expenseHandler.handleExpenseInput(msg);
        handleEditMessage(bot, msg, t);
        handleSettleMessage(bot, msg, t);
    }
});

const MAX_MEMBERS_FREE = parseInt(process.env.MAX_MEMBERS_FREE, 10) || 4;

// Track new members
bot.on('new_chat_members', async (msg) => {
    const chatId = msg.chat.id;
    try {
        let groupExpense = await GroupExpense.findOne({ chatId });
        if (!groupExpense) {
            groupExpense = new GroupExpense({ chatId, expenses: [], members: [] });
        }

        // Check if adding new members would exceed the limit for non-premium groups
        if (!groupExpense.premium) {
            const currentMembers = groupExpense.members.length;
            const newMembersCount = msg.new_chat_members.length;

            // Check if bot is being added
            const isBotAdded = msg.new_chat_members.some(member => member.id === bot.options.username);

            if (currentMembers + newMembersCount > MAX_MEMBERS_FREE) {
                const t = await getT(msg);
                await bot.sendMessage(chatId, t('member_limit_exceeded', {
                    current: currentMembers,
                    limit: MAX_MEMBERS_FREE,
                    new: newMembersCount
                }));

                // If bot is being added, leave the group
                if (isBotAdded) {
                    await bot.leaveChat(chatId);
                    return;
                }
                return;
            }
        }

        let updated = false;
        for (const user of msg.new_chat_members) {
            if (!groupExpense.members.some(m => m.userId === user.id)) {
                groupExpense.members.push({
                    userId: user.id,
                    username: user.username || '',
                    firstName: user.first_name || ''
                });
                updated = true;
            }
        }
        if (updated) await groupExpense.save();
    } catch (err) {
        console.error('Error tracking new member:', err);
    }
});

// Track when bot is added to a group
bot.on('my_chat_member', async (msg) => {
    if (msg.new_chat_member.status === 'member') {
        const chatId = msg.chat.id;
        try {
            let groupExpense = await GroupExpense.findOne({ chatId });
            if (!groupExpense) {
                groupExpense = new GroupExpense({ chatId, expenses: [], members: [] });
            }

            // Check member limit for non-premium groups
            if (!groupExpense.premium && groupExpense.members.length >= MAX_MEMBERS_FREE) {
                const t = await getT(msg);
                await bot.sendMessage(chatId, t('premium_feature_locked'));
                await bot.leaveChat(chatId);
                return;
            }

            // Add the bot to members list
            if (!groupExpense.members.some(m => m.userId === bot.options.username)) {
                groupExpense.members.push({
                    userId: bot.options.username,
                    username: bot.options.username,
                    firstName: 'Tripper Bot'
                });
                await groupExpense.save();
            }
        } catch (err) {
            console.error('Error handling bot join:', err);
        }
    }
});

// Track member leaving
bot.on('left_chat_member', async (msg) => {
    const chatId = msg.chat.id;
    try {
        let groupExpense = await GroupExpense.findOne({ chatId });
        if (!groupExpense) return;
        groupExpense.members = groupExpense.members.filter(m => m.userId !== msg.left_chat_member.id);
        await groupExpense.save();
    } catch (err) {
        console.error('Error removing member:', err);
    }
});

// Error handling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});


// Schedule daily reminders
cron.schedule('0 9 * * *', () => {
    sendDailyReminders(bot, i18next.getFixedT('en'));
});

const currencyOptions = [
    { code: 'usd', key: 'currency_label_usd' },
    { code: 'eur', key: 'currency_label_eur' },
    { code: 'uah', key: 'currency_label_uah' },
    { code: 'pln', key: 'currency_label_pln' },
    { code: 'gbp', key: 'currency_label_gbp' },
    { code: 'ils', key: 'currency_label_ils' },
    { code: 'inr', key: 'currency_label_inr' },
    { code: 'idr', key: 'currency_label_idr' },
    { code: 'byn', key: 'currency_label_byn' },
    { code: 'try', key: 'currency_label_try' },
    { code: 'czk', key: 'currency_label_czk' },
    { code: 'huf', key: 'currency_label_huf' },
    { code: 'ron', key: 'currency_label_ron' },
    { code: 'ars', key: 'currency_label_ars' },
    { code: 'brl', key: 'currency_label_brl' },
    { code: 'mxn', key: 'currency_label_mxn' },
    { code: 'egp', key: 'currency_label_egp' },
    { code: 'uzs', key: 'currency_label_uzs' },
    { code: 'azn', key: 'currency_label_azn' },
    { code: 'kzt', key: 'currency_label_kzt' }
];

const PAYMENT_PROVIDER_TOKEN = process.env.TELEGRAM_PAYMENT_TOKEN;
const PREMIUM_PRICE = process.env.PREMIUM_PRICE;
const PREMIUM_CURRENCY = process.env.PREMIUM_CURRENCY;

if (!PAYMENT_PROVIDER_TOKEN) {
    console.error('TELEGRAM_PAYMENT_TOKEN is not set in .env file. Please get a payment provider token from @BotFather and add it to your .env file.');
    process.exit(1);
}

bot.onText(/\/premium/, async (msg) => {
    const { t } = await expenseHandler.getT(msg);
    const userId = msg.from.id;
    if (msg.chat.type === 'private') {
        // List all groups and their premium status
        const groups = await GroupExpense.find({ 'members.userId': userId });
        if (!groups.length) {
            return bot.sendMessage(msg.chat.id, t('no_groups_found'));
        }
        let text = t('your_groups_status') + '\n\n';
        for (const group of groups) {
            text += `${formatGroupName(group, t)}: ` +
                (group.premium ? t('premium_active') : t('premium_inactive')) + '\n';
        }
        return bot.sendMessage(msg.chat.id, text);
    } else {
        // In group chat: show this group's premium status or send invoice
        const chatId = msg.chat.id;
        const groupExpense = await GroupExpense.findOne({ chatId });
        if (!groupExpense) {
            await bot.sendMessage(chatId, t('no_expenses_group'));
            return;
        }
        if (groupExpense.premium) {
            await bot.sendMessage(chatId, t('premium_active_group'));
        } else {
            // Send Telegram payment invoice
            await bot.sendInvoice(
                chatId,
                t('premium_invoice_title'),
                t('premium_invoice_description', {
                    limit: MAX_MEMBERS_FREE,
                    price: (PREMIUM_PRICE / 100).toFixed(2)
                }),
                `premium_group_${chatId}`,
                PAYMENT_PROVIDER_TOKEN,
                PREMIUM_CURRENCY,
                JSON.stringify([{
                    label: t('premium_invoice_label'),
                    amount: PREMIUM_PRICE
                }]),
                {
                    photo_url: 'https://telegram.org/img/t_logo.png',
                    need_name: true,
                    need_email: false
                }
            );
        }
    }
});

// Handle Telegram Payments
bot.on('pre_checkout_query', (query) => {
    bot.answerPreCheckoutQuery(query.id, true);
});

bot.on('successful_payment', async (msg) => {

    // Only handle premium payments
    if (!msg.successful_payment || !msg.successful_payment.invoice_payload.startsWith('premium_group_')) {
        return;
    }

    // Extract the actual group chat ID from the invoice payload
    const groupChatId = msg.successful_payment.invoice_payload.replace('premium_group_', '');

    try {
        const groupExpense = await GroupExpense.findOne({ chatId: groupChatId });

        if (!groupExpense) {
            console.error('Group not found for premium activation:', groupChatId);
            return;
        }

        if (groupExpense.premium) {
            const { t } = await expenseHandler.getT(msg);
            await bot.sendMessage(msg.chat.id, t('premium_already_active'));
            return;
        }

        const updatedGroup = await GroupExpense.findOneAndUpdate(
            { chatId: groupChatId },
            { $set: { premium: true } },
            { new: true }
        );

        const { t } = await expenseHandler.getT(msg);
        // Send confirmation to both the private chat and the group
        await bot.sendMessage(msg.chat.id, t('premium_activated'));
        await bot.sendMessage(groupChatId, t('premium_activated'));
    } catch (error) {
        console.error('Error activating premium:', error);
        const { t } = await expenseHandler.getT(msg);
        await bot.sendMessage(msg.chat.id, t('error_activating_premium'));
    }
});

bot.onText(/\/upgrade/, async (msg) => {
    const { t } = await expenseHandler.getT(msg);
    if (msg.chat.type === 'private') {
        return bot.sendMessage(msg.chat.id, t('upgrade_in_group'));
    }
    const chatId = msg.chat.id;
    const groupExpense = await GroupExpense.findOne({ chatId });
    if (!groupExpense) {
        await bot.sendMessage(chatId, t('no_expenses_group'));
        return;
    }
    if (groupExpense.premium) {
        await bot.sendMessage(chatId, t('premium_active_group'));
    } else {
        // Send Telegram payment invoice
        await bot.sendInvoice(
            chatId,
            t('premium_invoice_title'),
            t('premium_invoice_description', {
                limit: MAX_MEMBERS_FREE,
                price: (PREMIUM_PRICE / 100).toFixed(2)
            }),
            `premium_group_${chatId}`,
            PAYMENT_PROVIDER_TOKEN,
            PREMIUM_CURRENCY,
            JSON.stringify([{
                label: t('premium_invoice_label'),
                amount: PREMIUM_PRICE
            }]),
            {
                photo_url: 'https://telegram.org/img/t_logo.png',
                need_name: true,
                need_email: false
            }
        );
    }
});

bot.onText(/\/language/, async (msg) => {
    const t = await getT(msg);
    if (msg.chat.type === 'private') {
        showLanguageSelection(bot, msg, t, languageNames);
        return;
    }
    showLanguageSelection(bot, msg, t, languageNames);
});

bot.onText(/\/help/, async (msg) => {
    const t = await getT(msg);
    const helpText = `Welcome to Tripper Bot! 🎒

Here's how to use the bot:

• /pay — Add a new expense (in private chat)
• /edit — Edit your expenses (in private chat)
• /settle — Mark a debt as settled (in private chat)
• /debts — Show who owes whom (in group)
• /history — Show expense history (in group)
• /clear — Clear all expenses (in group)
• /syncmembers — Sync group admins as members (in group)
• /currency — Change group currency (Premium only)
• /language — Change your language (in private chat)
• /premium — See your group's premium status
• /upgrade — Upgrade your group to Premium for unlimited members, expenses, advanced reminders, and more!

How to use:
1. Add the bot to your group and make it admin.
2. In private chat, use /pay to add expenses and select your group.
3. Use /debts and /history in the group to see balances and history.
4. Upgrade to Premium with /upgrade for full features!

If you need more help, contact the developer or use /help anytime!`;
    await bot.sendMessage(msg.chat.id, helpText);
});
