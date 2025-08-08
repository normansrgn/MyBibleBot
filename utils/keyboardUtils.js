const { oldTestamentBooks, newTestamentBooks } = require("../config");

const mainReplyKeyboard = {
  reply_markup: {
    keyboard: [
      ["🙏 Случайный стих", "📖 Читать Библию"],
      ["🔍 Поиск", "🏠 Главное меню"],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  },
};

const backToBooksKeyboard = {
  reply_markup: {
    keyboard: [["⬅️ Назад к книгам"], ["🏠 Главное меню"]],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};

const testamentInlineKeyboard = {
  inline_keyboard: [
    [
      { text: "📜 Ветхий Завет", callback_data: "testament_old" },
      { text: "✝️ Новый Завет", callback_data: "testament_new" },
    ],
  ],
};

function getBooksInlineKeyboard(books) {
  const keyboard = [];
  for (let i = 0; i < books.length; i += 3) {
    const row = books.slice(i, i + 3).map((book) => ({
      text: book.name,
      callback_data: `book_${book.name}`,
    }));
    keyboard.push(row);
  }
  keyboard.push([
    { text: "⬅️ Назад к выбору Завета", callback_data: "back_to_testament" },
  ]);
  return { inline_keyboard: keyboard };
}

function getChaptersInlineKeyboard(bookName, bibleData) {
  const book = bibleData.find((b) => b.name === bookName);
  if (!book) return null;
  const chaptersCount = book.chapters.length;
  const keyboard = [];
  for (let i = 1; i <= chaptersCount; i += 5) {
    const row = [];
    for (let j = i; j < i + 5 && j <= chaptersCount; j++) {
      row.push({
        text: j.toString(),
        callback_data: `chapter_${bookName}_${j}`,
      });
    }
    keyboard.push(row);
  }
  keyboard.push([
    { text: "⬅️ Назад к книгам", callback_data: "back_to_books" },
  ]);
  return { inline_keyboard: keyboard };
}

function getChapterPartKeyboard(
  bookName,
  chapterNumber,
  partIndex,
  partsCount,
  book,
  bibleData
) {
  const buttons = [];
  if (partsCount > 1) {
    const navRow = [];
    if (partIndex > 0)
      navRow.push({
        text: "⬅️ Назад",
        callback_data: `chapter_part_${bookName}_${chapterNumber}_${
          partIndex - 1
        }`,
      });
    navRow.push({
      text: `${partIndex + 1}/${partsCount}`,
      callback_data: "noop",
    });
    if (partIndex < partsCount - 1)
      navRow.push({
        text: "Вперёд ➡️",
        callback_data: `chapter_part_${bookName}_${chapterNumber}_${
          partIndex + 1
        }`,
      });
    buttons.push(navRow);
  }
  const chapterNavRow = [];
  if (chapterNumber > 1)
    chapterNavRow.push({
      text: "⬅️ Пред. глава",
      callback_data: `chapter_${bookName}_${chapterNumber - 1}`,
    });
  if (chapterNumber < book.chapters.length)
    chapterNavRow.push({
      text: "След. глава ➡️",
      callback_data: `chapter_${bookName}_${chapterNumber + 1}`,
    });
  if (chapterNavRow.length) buttons.push(chapterNavRow);
  buttons.push([
    { text: "⬅️ Назад к главам", callback_data: `book_${bookName}` },
  ]);
  buttons.push([{ text: "⬅️ Назад к книгам", callback_data: "back_to_books" }]);
  if (chapterNumber === book.chapters.length) {
    const bookIdx = bibleData.findIndex((b) => b.name === bookName);
    if (bookIdx + 1 < bibleData.length) {
      const nextBook = bibleData[bookIdx + 1];
      buttons.push([
        {
          text: `➡️ Перейти к следующей книге: ${nextBook.name}`,
          callback_data: `book_${nextBook.name}`,
        },
      ]);
    }
  }
  return { inline_keyboard: buttons };
}

module.exports = {
  mainReplyKeyboard,
  backToBooksKeyboard,
  testamentInlineKeyboard,
  getBooksInlineKeyboard,
  getChaptersInlineKeyboard,
  getChapterPartKeyboard
};