import dotenv from "dotenv";
import axios from "axios";

import * as utils from "./utils.js";
import { knex } from "./models/index.js";

dotenv.config();

export default async function processTasks() {
  const tasks = await knex("tasks").where("amount", ">", 0);

  fetchItemPage(tasks);
}

const fetchItemPage = async (tasks = []) => {
  // Достаем первое задание из массива
  const task = tasks.shift();
  if (!task) return processTasks();

  await new Promise((r) => setTimeout(r, utils.getRandomInt(10000, 13500) * task.pages)).catch(() => console.log("timeoutError"));

  console.log("Fetching Steam market data. Task ID: " + task.id, "Pages: ", task.pages);

  try {
    // Формируем запросы для каждой страницы
    const requestPromiseArray = [...Array(task.pages).keys()].map((page) => axios.get(task.link + utils.requestPathFunc(page)));


    // Логируем каждый запрос к торговой площадке
    await knex("market_requests").insert([...Array(task.pages).keys()].map(() => ({ task_id: task.id })))

    // Мапа предметов с информацией о них
    const marketItemsMap = await Promise.all(requestPromiseArray).then((response) =>
      response.reduce((acc, page) => {
        if (!page || !page.data) return acc;
        if (page.data.listinginfo && !Array.isArray(page.data.listinginfo)) return { ...acc, ...page.data.listinginfo };
        return acc;
      }, {})
    );

    // Массив предметов с информацией о них
    const rawItems = Object.values(marketItemsMap);

    if (!rawItems.length) {
      console.log("No data received from the Steam");
      return fetchItemPage(tasks);
    }

    // Пейлоад для запроса к инспектору
    const links = rawItems.reduce((acc, listing) => {
      if (listing?.asset?.id) {
        return [...acc, { link: listing.asset.market_actions[0].link.replace("%listingid%", listing.listingid).replace("%assetid%", listing.asset.id) }]
      }

      return acc;
    }, []);

    const inspectorResponse = await axios.post(`http://${process.env.SERVER_HOST}:8123/bulk`, { links });

    validateAvailableItems(task, marketItemsMap, Object.values(inspectorResponse.data));
  } catch (error) {
    if (error.message === "Request failed with status code 429") {
      await utils.sendTelegramMessage("Request failed with status code 429");

      await new Promise((r) => setTimeout(r, 20000)).catch(() => console.log("timeoutError"));
    } else {
      console.log("🍀 ~ Looks like something went wrong:", error.code, error.message);
    }
  }

  if (!tasks.length) return processTasks();

  fetchItemPage(tasks);
};

const validateAvailableItems = async (task, marketItemsMap, availableItems = []) => {
  const itemsToPurchase = [];
  const assetErrors = [];

  availableItems.forEach((asset) => {
    if (asset.error) {
      assetErrors.push(`${asset.status}: ${asset.error}`);
      console.log(`${asset.status}: `, asset.error)

      return 
    }

    // Проверяем флоат
    if (asset.floatvalue > task.float) return;

    // Проверяем цену
    const assetPrice = marketItemsMap[asset.m].converted_price + marketItemsMap[asset.m].converted_fee;
    if (assetPrice > task.price) return;

    // Бывают записи без цены и комиссии
    if (!marketItemsMap[asset.m].converted_price || !marketItemsMap[asset.m].converted_fee) {
      return;
    }

    itemsToPurchase.push({
      asset_float: asset.floatvalue,
      fee: marketItemsMap[asset.m].converted_fee,
      listing_id: asset.m,
      subtotal: marketItemsMap[asset.m].converted_price,
      task_id: task.id,
      item_id: asset.a,
    });
  });

  if (itemsToPurchase.length) {
    await knex("cart").insert(itemsToPurchase);
    console.log("Items are added");
  } else {
    console.log("Nothing is found");
  }

  if (assetErrors.length) {
    await utils.sendTelegramMessage([...new Set(assetErrors)].join("\n"));
  }
}
