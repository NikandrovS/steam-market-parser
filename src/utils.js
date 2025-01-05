import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

export const getRandomInt = (min, max) => {
  const minCeiled = Math.ceil(min);
  const maxFloored = Math.floor(max);
  return Math.floor(Math.random() * (maxFloored - minCeiled + 1) + minCeiled); // The maximum is inclusive and the minimum is inclusive
}

export const sendTelegramMessage = async (message) => {
  const TG_TOKEN = process.env.TELEGRAM_TOKEN;
  const TG_USER = process.env.TELEGRAM_USER_ID;

  await axios.get(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    params: {
      chat_id: TG_USER,
      text: message,
    }
  }).catch(() => { });
}

const pageSize = 100;

const requestParams = {
  start: 0,
  count: pageSize,
  country: "RU",
  language: "english",
  currency: 5,
};

// Transform request params to query string
export const requestPathFunc = (page, options = {}) => `/render/?${new URLSearchParams({ ...requestParams, start: page * (options.count || pageSize), ...options }).toString()}`;
