import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);

const app = await createApp();
await app.listen(port);
console.log(`core-app listening on :${port}`);
