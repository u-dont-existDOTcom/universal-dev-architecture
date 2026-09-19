const delayMs = Number(process.env.MISSION_CONTROL_TEST_GITHUB_FETCH_DELAY_MS ?? 3_000);

globalThis.fetch = async () => {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return new Response("[]", { status: 200 });
};

void import("../../daemon/server").catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
