export type Trivia = {
  q: string;
  options: string[];
  answerIndex: number;
  fact: string;
};

export const TRIVIA: Trivia[] = [
  {
    q: "Indiana has more miles of interstate highway per square mile than any other state. True or false?",
    options: ["True", "False"],
    answerIndex: 0,
    fact: "True — Indiana is known as the 'Crossroads of America' for exactly this reason. Its central location made it a hub for east-west and north-south freight.",
  },
  {
    q: "What is Indiana's official state pie?",
    options: ["Apple", "Sugar cream", "Pecan", "Key lime"],
    answerIndex: 1,
    fact: "Sugar cream — invented by Shaker and Quaker settlers, it became so beloved it was named the official state pie in 2009.",
  },
  {
    q: "The origin of Indiana's nickname 'The Hoosier State' is actually…",
    options: ["Named after a governor", "A Native American word", "Disputed and unknown", "A French trapper's name"],
    answerIndex: 2,
    fact: "Disputed and unknown — historians have debated the origin for over 150 years with no definitive answer.",
  },
  {
    q: "Which famous holiday treat was invented in Indiana?",
    options: ["Candy cane", "Fruitcake", "Popcorn ball", "Sugar plum"],
    answerIndex: 2,
    fact: "Popcorn ball — Indiana has been a leading popcorn producer since the 1800s and lays claim to this holiday treat.",
  },
  {
    q: "What world-famous race has been held in Indiana every year since 1911?",
    options: ["Daytona 500", "Indianapolis 500", "Brickyard 400", "Grand Prix of America"],
    answerIndex: 1,
    fact: "The Indianapolis 500 — held at Indianapolis Motor Speedway, it is the largest single-day sporting event in the world.",
  },
  {
    q: "Indiana is the birthplace of which beloved song?",
    options: ["You Are My Sunshine", "On Top of Old Smoky", "Back Home Again in Indiana", "She'll Be Coming Round the Mountain"],
    answerIndex: 2,
    fact: "Back Home Again in Indiana — written in 1917, it is now traditionally sung before the Indianapolis 500.",
  },
  {
    q: "Which US president made his political career in Indiana?",
    options: ["Abraham Lincoln", "Benjamin Harrison", "William Henry Harrison", "James Buchanan"],
    answerIndex: 2,
    fact: "William Henry Harrison — he served as the 9th president and had the shortest presidency in US history at just 31 days.",
  },
  {
    q: "What is the name of Indiana's state river?",
    options: ["Ohio River", "Wabash River", "White River", "Tippecanoe River"],
    answerIndex: 1,
    fact: "Wabash River — it is the longest free-flowing river east of the Mississippi and inspired the famous state song.",
  },
  {
    q: "Indiana produces what percentage of the world's popcorn?",
    options: ["5%", "15%", "25%", "40%"],
    answerIndex: 2,
    fact: "25% — Indiana is one of the top popcorn-producing states in the US, earning it the nickname the 'Popcorn State.'",
  },
  {
    q: "The first professional baseball game ever played for admission was held in which Indiana city?",
    options: ["Indianapolis", "Fort Wayne", "South Bend", "Evansville"],
    answerIndex: 1,
    fact: "Fort Wayne — on May 4, 1871, the Fort Wayne Kekiongas played the Cleveland Forest Citys in the first professional game.",
  },
  {
    q: "Indiana is home to the world's largest…",
    options: ["Ball of twine", "Clock", "Egg", "Steer"],
    answerIndex: 1,
    fact: "Clock — the world's largest cuckoo clock is located in Sugarcreek, just over the Ohio border but claimed by Indiana tourism.",
  },
  {
    q: "Which legendary music icon was born in Gary, Indiana?",
    options: ["Elvis Presley", "Michael Jackson", "Prince", "Stevie Wonder"],
    answerIndex: 1,
    fact: "Michael Jackson — the King of Pop was born in Gary on August 29, 1958.",
  },
  {
    q: "What is the state stone of Indiana?",
    options: ["Granite", "Limestone", "Marble", "Sandstone"],
    answerIndex: 1,
    fact: "Limestone — Indiana limestone has been used to build some of America's most iconic structures including the Empire State Building and the Pentagon.",
  },
  {
    q: "Indiana's state flower is the…",
    options: ["Sunflower", "Peony", "Rose", "Tulip"],
    answerIndex: 1,
    fact: "Peony — adopted as the state flower in 1957, peonies bloom across Indiana every spring.",
  },
  {
    q: "The University of Notre Dame is located in which Indiana city?",
    options: ["South Bend", "Indianapolis", "Fort Wayne", "Bloomington"],
    answerIndex: 0,
    fact: "South Bend — Notre Dame was founded in 1842 and is one of the most recognized universities in the world.",
  },
  {
    q: "Indiana was the first state to build a…",
    options: ["Toll road", "Public library", "State fair", "Railroad tunnel"],
    answerIndex: 1,
    fact: "Public library — Vincennes established the first public library in Indiana in 1806, one of the earliest in the nation.",
  },
  {
    q: "What famous car brand tested its first vehicles on Indiana roads?",
    options: ["Ford", "Studebaker", "Chevrolet", "Chrysler"],
    answerIndex: 1,
    fact: "Studebaker — founded in South Bend, Indiana in 1852, it began as a wagon maker before becoming one of America's great automakers.",
  },
  {
    q: "The Indiana Dunes National Park sits on the shore of which Great Lake?",
    options: ["Lake Erie", "Lake Huron", "Lake Michigan", "Lake Superior"],
    answerIndex: 2,
    fact: "Lake Michigan — the Indiana Dunes became a national park in 2019 and feature 15 miles of stunning shoreline.",
  },
  {
    q: "Indiana's state bird is the…",
    options: ["Cardinal", "Blue Jay", "Robin", "Goldfinch"],
    answerIndex: 0,
    fact: "Cardinal — the brilliant red cardinal was named Indiana's state bird in 1933.",
  },
  {
    q: "Which Indiana county is known as the 'Covered Bridge Capital of the World'?",
    options: ["Parke County", "Madison", "Columbus", "Terre Haute"],
    answerIndex: 0,
    fact: "Parke County — with 31 historic covered bridges still standing, Parke County hosts an annual Covered Bridge Festival drawing hundreds of thousands of visitors.",
  },
];

export function triviaOfTheDay() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const day = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return TRIVIA[day % TRIVIA.length];
}
