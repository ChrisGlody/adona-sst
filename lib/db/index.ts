import { drizzle } from "drizzle-orm/neon-http"
import { neon } from "@neondatabase/serverless"

// Use the DATABASE_URL from your environment variables
const sql = neon(process.env.DATABASE_URL!)

export const db = drizzle(sql)
