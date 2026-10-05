import { assertSameOrigin, handle } from "@/server/http";
import { endSession } from "@/server/session";

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  await endSession();
  return new Response(null, { status: 204 });
});
