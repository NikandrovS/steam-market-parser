import { CronJob } from 'cron';
import axios from "axios";

import * as utils from "../utils.js";

export default function () {
  new CronJob(
    "0 0 */4 * * *", // cronTime
    () => requestListings(),
    null, // onComplete
    true, // start
    "America/Los_Angeles" // timeZone
  );
}

const listing = 'https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Black%20Lotus%20%28Factory%20New%29'

async function requestListings() {
  const usdPrices = await axios.get(listing + utils.requestPathFunc(0, { count: 10, currency: 1 }));

  await new Promise((r) => setTimeout(r, utils.getRandomInt(1000, 1500) * 1)).catch(() => console.log("timeoutError"));

  const rubPrices = await axios.get(listing + utils.requestPathFunc(0, { count: 10, currency: 5 }));

  if (!usdPrices.data || !rubPrices.data) return;

  for (const item of Object.values(usdPrices.data?.listinginfo)) {
    const usdPrice = item.converted_price + item.converted_fee;
    console.log("🍀 ~ usdPrice:", usdPrice)

    // Find the corresponding item in second currency
    const rubItem = rubPrices.data?.listinginfo[item.listingid]

    if (!rubItem) continue;

    const rubPrice = rubItem.converted_price + rubItem.converted_fee;
    console.log("🍀 ~ rubPrice:", rubPrice)

    // Calculate the exchange rate
    const rate = (rubPrice / 100) / (usdPrice / 100);

    await utils.sendTelegramMessage("💶 Current exchange rate: " + rate.toFixed(2));

    break;
  }
}
