// Appwrite client config. Used for auth and persisting auction results.
"use client";
import { Client, Account, Databases, ID } from "appwrite";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? "https://cloud.appwrite.io/v1";
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID ?? "";

export const client = new Client().setEndpoint(endpoint).setProject(projectId);
export const account = new Account(client);
export const databases = new Databases(client);
export { ID };

export const APPWRITE_DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DB_ID ?? "auction";
export const APPWRITE_RESULTS_COLLECTION =
  process.env.NEXT_PUBLIC_APPWRITE_RESULTS_COLLECTION ?? "auction_results";

export async function safeGetUser() {
  try {
    return await account.get();
  } catch {
    return null;
  }
}
