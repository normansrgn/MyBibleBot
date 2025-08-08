const { 
  getBooksInlineKeyboard,
  getChaptersInlineKeyboard,
  getChapterPartKeyboard
} = require("../utils/keyboardUtils");
const { formatChapter, splitChapterIntoParts } = require("../utils/bibleUtils");
const { userState, oldTestamentBooks, newTestamentBooks, bibleData } = require("../config");

function setupCallbackHandlers(bot, bibleData) {
  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    try {
      if (data.startsWith("book_")) {
        const bookName = data.slice(5);
        const keyboard = getChaptersInlineKeyboard(bookName, bibleData);
        if (!keyboard) {
          await bot.answerCallbackQuery(query.id, { text: "Книга не найдена." });
          return;
        }
        await bot.editMessageText(
          `Выбрана книга: *${bookName}*\nВыберите главу:`,
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            reply_markup: keyboard,
          }
        );
      } else if (data.startsWith("chapter_part_")) {
        const partsData = data.split("_");
        const bookName = partsData[2];
        const chapterNumber = parseInt(partsData[3], 10);
        const partIndex = parseInt(partsData[4], 10);
        const book = bibleData.find((b) => b.name === bookName);
        if (!book) {
          await bot.answerCallbackQuery(query.id, { text: "Книга не найдена." });
          return;
        }
        const parts = splitChapterIntoParts(book, chapterNumber);
        if (!parts[partIndex]) {
          await bot.answerCallbackQuery(query.id, { text: "Часть не найдена." });
          return;
        }
        const keyboard = getChapterPartKeyboard(
          bookName,
          chapterNumber,
          partIndex,
          parts.length,
          book,
          bibleData
        );
        await bot.editMessageText(parts[partIndex], {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
      } else if (data.startsWith("chapter_")) {
        const partsData = data.split("_");
        const bookName = partsData[1];
        let chapterNumber = parseInt(partsData[2], 10);
        const bookIndex = bibleData.findIndex((b) => b.name === bookName);
        if (bookIndex === -1) {
          await bot.answerCallbackQuery(query.id, { text: "Книга не найдена." });
          return;
        }
        const book = bibleData[bookIndex];

        if (chapterNumber > book.chapters.length) {
          if (bookIndex + 1 < bibleData.length) {
            const nextBook = bibleData[bookIndex + 1];
            const keyboard = getChaptersInlineKeyboard(nextBook.name, bibleData);
            await bot.editMessageText(
              `Вы завершили книгу *${book.name}*.\nПереходим к следующей книге: *${nextBook.name}*.\nВыберите главу:`,
              {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: "Markdown",
                reply_markup: keyboard,
              }
            );
          } else {
            await bot.editMessageText(
              `Вы завершили чтение последней книги *${book.name}*.\nВы можете вернуться к выбору книги или завершить чтение.`,
              {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: "Markdown",
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: "⬅️ Назад к книгам",
                        callback_data: "back_to_books",
                      },
                    ],
                  ],
                },
              }
            );
          }
          await bot.answerCallbackQuery(query.id);
          return;
        }

        const parts = splitChapterIntoParts(book, chapterNumber);
        const keyboard = getChapterPartKeyboard(
          bookName,
          chapterNumber,
          0,
          parts.length,
          book,
          bibleData
        );
        await bot.editMessageText(parts[0], {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
      } else if (data === "back_to_books") {
        const testament = userState.get(chatId) || "old";
        const books = testament === "old" ? oldTestamentBooks : newTestamentBooks;
        await bot.editMessageText(
          testament === "old"
            ? "📜 *Ветхий Завет — выберите книгу:*"
            : "✝️ *Новый Завет — выберите книгу:*",
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            reply_markup: getBooksInlineKeyboard(books, bibleData),
          }
        );
      } else if (data === "back_to_testament") {
        await bot.editMessageText("📖 *Выберите Завет:*", {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "📜 Ветхий Завет", callback_data: "testament_old" },
                { text: "✝️ Новый Завет", callback_data: "testament_new" },
              ],
            ],
          },
        });
      } else if (data === "testament_old") {
        userState.set(chatId, "old");
        await bot.editMessageText("📜 *Ветхий Завет — выберите книгу:*", {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          reply_markup: getBooksInlineKeyboard(oldTestamentBooks, bibleData),
        });
      } else if (data === "testament_new") {
        userState.set(chatId, "new");
        await bot.editMessageText("✝️ *Новый Завет — выберите книгу:*", {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          reply_markup: getBooksInlineKeyboard(newTestamentBooks, bibleData),
        });
      }

      await bot.answerCallbackQuery(query.id);
    } catch (err) {
      console.error(
        `Ошибка при обработке callback (chat ${chatId}, data: ${data}):`,
        err.message
      );
      await bot.answerCallbackQuery(query.id, {
        text: "Произошла ошибка. Попробуйте снова.",
      });
    }
  });
}

module.exports = { setupCallbackHandlers };