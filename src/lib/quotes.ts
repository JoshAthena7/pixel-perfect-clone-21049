export const QUOTES = [
  { q: "Excellence is not a destination but a continuous journey.", a: "Brian Tracy" },
  { q: "The secret of getting ahead is getting started.", a: "Mark Twain" },
  { q: "Quality is not an act, it is a habit.", a: "Aristotle" },
  { q: "Words are, of course, the most powerful drug used by mankind.", a: "Rudyard Kipling" },
  { q: "Either write something worth reading or do something worth writing.", a: "Benjamin Franklin" },
  { q: "You don't write because you want to say something, you write because you have something to say.", a: "F. Scott Fitzgerald" },
  { q: "The first draft is just you telling yourself the story.", a: "Terry Pratchett" },
  { q: "Deadlines are the mother of invention.", a: "Unknown" },
  { q: "Hard work beats talent when talent doesn't work hard.", a: "Tim Notke" },
  { q: "The difference between ordinary and extraordinary is that little extra.", a: "Jimmy Johnson" },
  { q: "Do the best you can until you know better. Then when you know better, do better.", a: "Maya Angelou" },
  { q: "It always seems impossible until it's done.", a: "Nelson Mandela" },
  { q: "Success is the sum of small efforts repeated day in and day out.", a: "Robert Collier" },
  { q: "Write with the door closed, rewrite with the door open.", a: "Stephen King" },
  { q: "Clarity is the counterbalance of profound thoughts.", a: "Luc de Clapiers" },
  { q: "The art of writing is the art of discovering what you believe.", a: "Gustave Flaubert" },
  { q: "A word after a word after a word is power.", a: "Margaret Atwood" },
  { q: "You can always edit a bad page. You can't edit a blank page.", a: "Jodi Picoult" },
  { q: "Start where you are. Use what you have. Do what you can.", a: "Arthur Ashe" },
  { q: "The greatest glory in living lies not in never falling, but in rising every time we fall.", a: "Nelson Mandela" },
];

export function quoteOfTheDay() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const day = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return QUOTES[day % QUOTES.length];
}
