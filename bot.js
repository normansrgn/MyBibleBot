require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");

const { bot, bibleData, activeUsers } = require("./config");
const { setupMessageHandlers } = require("./handlers/messageHandler");
const { setupCallbackHandlers } = require("./handlers/callbackHandler");
const { setupInlineQueryHandlers } = require("./handlers/inlineQueryHandler");
const { sendDailyVerse } = require("./scheduled/dailyVerse");

const { setupVerseMentionHandler } = require("./verseMentionHandler");
const { handleBibleSearchCommand } = require('./bibleSearchHandler');
const { formatVerse, formatChapter, searchVerse } = require("./utils/bibleUtils");

setupVerseMentionHandler(bot, bibleData, searchVerse, formatVerse, formatChapter);
handleBibleSearchCommand(bot, bibleData, formatVerse);

setupMessageHandlers(bot, bibleData, activeUsers);
setupCallbackHandlers(bot, bibleData);
setupInlineQueryHandlers(bot, bibleData);

// Расписание отправки стихов
// cron.schedule("0 9 * * *", () => sendDailyVerse(bot, activeUsers, bibleData), { 
//   timezone: "Europe/Moscow",
//   scheduled: true
// });

// cron.schedule("00 15 * * *", () => sendDailyVerse(bot, activeUsers, bibleData), { 
//   timezone: "Europe/Moscow",
//   scheduled: true
// });

// cron.schedule("0 21 * * *", () => sendDailyVerse(bot, activeUsers, bibleData), { 
//   timezone: "Europe/Moscow",
//   scheduled: true
// });

bot.on("polling_error", (err) => {
  console.error("Polling error:", err.message);
  setTimeout(() => {
    bot.stopPolling().then(() => bot.startPolling());
  }, 5000);
});

console.log("✨ Бот запущен и готов к работе! ✨");