const bibleData = require('../bible/ru_synodal.json');

function getBooksList() {
  return bibleData.map(book => book.book);
}

function getChaptersList(bookName) {
  const book = bibleData.find(b => b.book === bookName);
  if (!book) return null;
  return book.chapters.map((_, idx) => idx + 1);
}

function getChapterVerses(bookName, chapterNum) {
  const book = bibleData.find(b => b.book === bookName);
  if (!book) return null;
  const chapter = book.chapters[chapterNum - 1];
  if (!chapter) return null;
  return chapter.map((verseText, idx) => ({
    verse: idx + 1,
    text: verseText
  }));
}

function getRandomVerse() {
  const book = bibleData[Math.floor(Math.random() * bibleData.length)];
  const chapterIndex = Math.floor(Math.random() * book.chapters.length);
  const chapter = book.chapters[chapterIndex];
  const verseIndex = Math.floor(Math.random() * chapter.length);
  return {
    book: book.book,
    chapter: chapterIndex + 1,
    verse: verseIndex + 1,
    text: chapter[verseIndex]
  };
}

module.exports = {
  getBooksList,
  getChaptersList,
  getChapterVerses,
  getRandomVerse
};