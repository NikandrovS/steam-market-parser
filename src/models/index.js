import dotenv from "dotenv";
import Knex from "knex";

dotenv.config();

export const knex = Knex({
  client: "pg",
  connection: {
    host: process.env.SERVER_HOST || "localhost",
    port: process.env.POSTGRES_PORT || 5432,
    user: process.env.POSTGRES_USER || "postgres",
    password: process.env.POSTGRES_PASSWORD || "postgres",
    database: process.env.POSTGRES_DB || "csitems",
  },
  pool: {
    min: 2,
    max: 10
  },
});
