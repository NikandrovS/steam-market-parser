import initSteamSession from "./src/steam-session.js";
import processTasks from "./src/market-checker.js";
import rubRate from "./src/crons/rub-rate.js";

initSteamSession(); // Create steam session and buy items
processTasks(); // Get tasks and parse market
rubRate(); // Script for checking the exchange rate