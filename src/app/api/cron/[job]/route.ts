import { JOBS, isCron, runJob, type JobName } from "@/server/jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request, ctx: RouteContext<"/api/cron/[job]">) {
  if (!isCron(req)) return Response.json({ error: "forbidden" }, { status: 403 });
  const { job } = await ctx.params;
  if (!(job in JOBS)) return Response.json({ error: "unknown_job" }, { status: 404 });
  const r = await runJob(job as JobName);
  return Response.json(r, { status: r.ok ? 200 : 500 });
}
