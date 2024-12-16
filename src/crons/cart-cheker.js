import { CronJob } from 'cron';
import axios from "axios";

import { knex } from "../models/index.js";
import * as utils from "../utils.js";

export default function (session) {
  new CronJob(
    "*/15 * * * * *", // cronTime
    () => prepareCookies(session),
    null, // onComplete
    true, // start
    "America/Los_Angeles" // timeZone
  );
}

async function prepareCookies(session) {
  let cookies = await session.getWebCookies();

  // Necessary cookies: sessionid and steamLoginSecure
  const prepearedCookies = cookies.join("; ");

  // Extract sessionid from cookies
  const sessionId = cookies.reduce((acc, cookie) => (cookie.includes("sessionid") ? cookie.split("=")[1] : acc), "");

  checkCart(sessionId, prepearedCookies);
}

async function checkCart(sessionId, prepearedCookies) {
  // Check cart for new items
  const items = await knex("cart")
    .select("cart.listing_id", "cart.subtotal", "cart.fee", "cart.asset_float", "cart.task_id", "tasks.amount")
    .where({ is_handled: 0 })
    .leftJoin("tasks", "tasks.id", "cart.task_id")
    .groupBy("cart.listing_id", "cart.subtotal", "cart.fee", "cart.asset_float", "cart.task_id", "tasks.amount")
    .orderBy("asset_float", "asc");

  if (!items.length) return;

  console.log("Processing items: ", items.length);

  const failedRequests = [];

  // Process each item
  for (const [index, item] of items.entries()) {
    // If task is completed, break the loop
    if (item.amount < 1) break;

    console.log("Отправляю запрос на покупку...");

    // Buy item
    const success = await buyItem(item, { sessionId, prepearedCookies });

    if (!success) failedRequests.push(item.listing_id);

    // Wait for 500ms before processing the next item
    await new Promise((r) => setTimeout(r, 500 * (index + 1)));
  }

  const affectedIds = items.reduce((acc, item) => (failedRequests.includes(item.listing_id) ? acc : [...acc, item.listing_id]), []);

  if (!affectedIds.length) return;

  console.log(affectedIds);

  // Mark items as handled
  await knex("cart").update({ is_handled: 1 }).whereIn("listing_id", affectedIds);
}

async function buyItem({ listing_id, subtotal, fee, asset_float, task_id }, { sessionId, prepearedCookies }) {
  const purchaseTask = await knex("tasks").where({ id: task_id }).first();

  let config = {
    headers: {
      Referer: purchaseTask.link,
      Cookie: prepearedCookies,
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
  };

  try {
    const purchasePayload = {
      currency: 5,
      fee,
      quantity: 1,
      save_my_address: 0,
      sessionid: sessionId,
      subtotal,
      total: subtotal + fee,
    }

    const { wallet_info } = await axios
      .post(`https://steamcommunity.com/market/buylisting/${listing_id}`, purchasePayload, config)
      .then((res) => res.data);

    if (wallet_info) {
      await knex("purchases").insert({
        link: purchaseTask.link,
        float_value: asset_float,
        price: (subtotal + fee) / 100,
        task_id,
      });

      console.log(`Float: ${purchaseTask.float} => ${asset_float}`);
      console.log(`Price: ${purchaseTask.price / 100}`);
      console.log("Wallet balance: ", wallet_info.wallet_balance / 100);

      await utils.sendTelegramMessage('New purchase')

      await knex("tasks")
        .decrement("amount", 1)
        .where({ id: task_id })
        .catch(() => { });
    }

    return true;
  } catch (error) {
    console.log("Ошибка при покупке", error.code);

    const errors = [
      "You cannot purchase this item because somebody else has already purchased it.",
      "You've already purchased this item.",
    ];

    if (!errors.includes(error?.response?.data?.message)) console.log("🍀 ~ error.response.data.message:", error.response.data.message);

    if (errors.includes(error?.response?.data?.message)) return true;

    return false;
  }
}
