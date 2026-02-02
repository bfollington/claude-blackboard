#!/usr/bin/env -S deno run --allow-net --allow-ffi --allow-read --allow-write --allow-env
/**
 * Script to cache SQLite native library at Docker build time.
 * Simply importing and using Database triggers the native lib download.
 */
import { Database } from "jsr:@db/sqlite@0.12";

const db = new Database(":memory:");
db.close();
console.log("SQLite native library cached successfully");
