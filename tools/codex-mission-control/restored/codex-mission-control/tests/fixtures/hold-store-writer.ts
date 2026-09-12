import { EventStore } from "../../lib/store";

new EventStore(process.argv[2]);
process.stdout.write("READY\n");
setInterval(() => {}, 60_000);
