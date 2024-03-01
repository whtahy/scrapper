import * as playwright from "playwright-aws-lambda";
import { kv } from "@vercel/kv";

export const handler = async (event) => {
    // startup
    console.log("start: top 40");
    const browser = await playwright.launchChromium({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(
        "https://www.gamejob.co.kr/Recruit/joblist?menucode=duty&duty=1",
    );
    console.log("goto: top 40"); // DEBUG
    // sort table
    await page
        // 1. 추천순 = recommended
        // 2. 경력순 = sort by experience
        // 3. 등록일순 = sort by registration date
        // 4. 수정일순 = sort by modification date
        // 5. 마감일순 = sort by due date
        .getByRole("button", { name: "수정일순", exact: true })
        .first()
        .click();
    // top 40
    const table = await page
        .getByRole("table")
        .locator("div.tit")
        .locator("a")
        .all();
    const top_40_jobs = await Promise.all(
        table.map(async (row) => {
            const title = await row.textContent();
            const id = (await row.getAttribute("href")).split("=").pop();
            return { id: id, title: title };
        }),
    );
    // cleanup
    await context.close();
    await browser.close();
    console.log("done: top 40"); // DEBUG
    // filter new job ids
    const json_jobs = (await kv.get("json")) ?? [];
    const json_ids = json_jobs.map((job) => job.id);
    const new_jobs = top_40_jobs.filter((job) => !json_ids.includes(job.id));
    console.log("new jobs: ", new_jobs);
    // update kv
    if (new_jobs.length > 0) {
        // add new jobs
        console.log(`adding ${new_jobs.length} jobs`); // DEBUG
        const scrap_date = timestamp();
        for (const job of new_jobs) {
            json_jobs.push(await scrap(job.id, job.title, scrap_date));
        }
        // remove old jobs
        //console.log(`removing ${old_jobs.length} jobs`);
        //TODO: filter ... new Date(scrap_date) - ... > 12314123123
        await kv.set("json", json_jobs);
        console.log("done: update kv"); // DEBUG
    }
    console.log("done!"); // DEBUG
    return;
};

async function scrap(id, title, scrap_date) {
    // startup
    console.log(`start: ${id}`); // DEBUG
    const browser = await playwright.launchChromium({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(
        `https://www.gamejob.co.kr/List_GI/GIB_Read.asp?GI_No=${id}`,
    );
    console.log(`goto: ${id}`);
    // company
    const company = await page
        .locator("div.coInfoRight")
        .locator("h2")
        .textContent();
    // modify date, post date
    let html = page.locator("p.date");
    const modify_date = await html.nth(0).textContent();
    const post_date = await html.nth(1).textContent();
    // location, subway
    html = page
        .locator("dl", { has: page.getByText("근무지역") })
        .locator("dd");
    const location = await html.nth(0).textContent();
    const subway = await html.nth(1).textContent();
    // iframe height
    await page.waitForFunction(() => {
        return (
            document
                .querySelector("#GI_Work_Content")
                .getAttribute("height") !== null
        );
    });
    const iframe_height = await page
        .locator("#GI_Work_Content")
        .getAttribute("height");
    // cleanup
    await context.close();
    await browser.close();
    console.log(`done: ${id}`); // DEBUG
    return {
        id: id,
        company: company,
        title: title,
        location: location,
        subway: subway,
        scrap_date: scrap_date,
        modify_date: modify_date,
        post_date: post_date,
        iframe_height: iframe_height,
    };
}

function timestamp() {
    const datetime = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
    );
    const yr = datetime.getFullYear();
    const mo = pad(datetime.getMonth() + 1);
    const dy = pad(datetime.getDate());
    const hr = pad(datetime.getHours());
    return `${yr}-${mo}-${dy} ${hr}:00:00`;
}

function pad(x) {
    return x.toString().padStart(2, "0");
}
