"use strict";

import { kv } from "@vercel/kv";

export async function GET(request) {
    const json = await kv.get("json");
    return new Response(JSON.stringify(json));
}
