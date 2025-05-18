# Tripper Bot

Tripper is a Telegram bot for group expense splitting, built with Node.js, MongoDB, and the node-telegram-bot-api library.

## Features
- Add expenses in group chats and split them between members
- Calculate debts and show who owes whom
- View expense history
- Edit or delete your own expenses
- Mark debts as settled (partial or full)
- Clear all expenses for a group
- Admins can sync group members
- All sensitive actions (add/edit/settle) are done privately in DM

## Commands

### In Group Chats
- `/pay` — Add an expense
- `/debts` — Show who owes whom
- `/history` — Show expense history
- `/clear` — Clear all expenses
- `/syncmembers` — Sync current admins to the group member list

### In Private Chat
- `/pay` — Add an expense
- `/edit` — Edit your expenses
- `/settle` — Mark a debt as settled

## Setup Instructions

1. **Clone the repo:**
   ```bash
   git clone <your-repo-url>
   cd tripper-bot
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Create a `.env` file:**
   ```env
   BOT_TOKEN=your_telegram_bot_token
   MONGODB_URI=your_mongodb_connection_string
   ```
4. **Start MongoDB** (if using local):
   ```bash
   mongod
   ```
5. **Run the bot:**
   ```bash
   npm start
   ```

## Usage
- Add the bot to your Telegram group.
- Use `/pay` in the group to start logging expenses (the rest of the flow happens in DM).
- Use `/debts` and `/history` in the group to see balances and logs.
- Use `/edit` and `/settle` in DM to manage your own expenses and settlements.

## Notes
- The bot tracks group members via join/leave events and `/syncmembers` (for admins).
- Only group admins can be synced automatically; regular members must join after the bot is present.
- The bot's avatar can be set via [@BotFather](https://t.me/botfather).

---
