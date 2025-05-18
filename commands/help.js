module.exports = (bot) => async (msg, t) => {
    try {
        const helpText = `Welcome to Tripper Bot! 🎒\n\nHere's how to use the bot:\n\n• /pay — Add a new expense (in private chat)\n• /edit — Edit your expenses (in private chat)\n• /settle — Mark a debt as settled (in private chat)\n• /debts — Show who owes whom (in group)\n• /history — Show expense history (in group)\n• /clear — Clear all expenses (in group)\n• /syncmembers — Sync group admins as members (in group)\n• /currency — Change group currency (Premium only)\n• /language — Change your language (in private chat)\n• /premium — See your group's premium status\n• /upgrade — Upgrade your group to Premium for unlimited members, expenses, advanced reminders, and more!\n\nHow to use:\n1. Add the bot to your group and make it admin.\n2. In private chat, use /pay to add expenses and select your group.\n3. Use /debts and /history in the group to see balances and history.\n4. Upgrade to Premium with /upgrade for full features!\n\nIf you need more help, contact the developer or use /help anytime!`;
        await bot.sendMessage(msg.chat.id, helpText);
    } catch (error) {
        console.error('Error in help command:', error);
        await bot.sendMessage(msg.chat.id, t('error_occurred'));
    }
};
